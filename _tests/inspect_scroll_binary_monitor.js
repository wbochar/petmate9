#!/usr/bin/env node
/**
 * Inspect vertical scroll output frame-by-frame using VICE binary monitor.
 *
 * Usage:
 *   node _tests/inspect_scroll_binary_monitor.js --port 6509 --frames 20
 */
const net = require('net');

const STX = 0x02;
const API_VERSION = 0x02;

function parseArg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return fallback;
}
function parseMaybeHexInt(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return fallback;
  if (/^0x[0-9a-f]+$/i.test(value)) return parseInt(value, 16);
  if (/^\$[0-9a-f]+$/i.test(value)) return parseInt(value.slice(1), 16);
  if (/^[0-9]+$/.test(value)) return parseInt(value, 10);
  return fallback;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class ViceBinaryMonitor {
  constructor(host, port) {
    this.host = host;
    this.port = port;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.messages = [];
    this.waiters = [];
    this.nextRequestId = 1;
    this.seq = 0;
  }

  async connect(maxAttempts = 30, delayMs = 200) {
    let lastErr = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.#connectOnce();
        return;
      } catch (e) {
        lastErr = e;
        await sleep(delayMs);
      }
    }
    throw lastErr || new Error(`failed to connect to ${this.host}:${this.port}`);
  }

  async #connectOnce() {
    await new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const onError = (err) => {
        socket.removeAllListeners();
        socket.destroy();
        reject(err);
      };
      socket.once('error', onError);
      socket.connect(this.port, this.host, () => {
        socket.removeListener('error', onError);
        this.socket = socket;
        this.socket.on('data', chunk => this.#onData(chunk));
        this.socket.on('error', () => {});
        resolve();
      });
    });
  }

  close() {
    if (this.socket) this.socket.destroy();
    this.socket = null;
  }

  #onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 12) {
      if (this.buffer[0] !== STX) {
        const stxPos = this.buffer.indexOf(STX, 1);
        if (stxPos === -1) {
          this.buffer = Buffer.alloc(0);
          return;
        }
        this.buffer = this.buffer.slice(stxPos);
        if (this.buffer.length < 12) return;
      }
      const version = this.buffer[1];
      const bodyLen = this.buffer.readUInt32LE(2);
      const totalLen = 12 + bodyLen;
      if (this.buffer.length < totalLen) return;
      const type = this.buffer[6];
      const error = this.buffer[7];
      const requestId = this.buffer.readUInt32LE(8);
      const body = this.buffer.slice(12, totalLen);
      this.buffer = this.buffer.slice(totalLen);

      this.seq++;
      const msg = { seq: this.seq, version, type, error, requestId, body };
      this.messages.push(msg);
      this.#resolveWaiters();
    }
  }

  #resolveWaiters() {
    if (!this.waiters.length) return;
    const remaining = [];
    for (const waiter of this.waiters) {
      const idx = this.messages.findIndex(waiter.predicate);
      if (idx >= 0) {
        const [msg] = this.messages.splice(idx, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(msg);
      } else {
        remaining.push(waiter);
      }
    }
    this.waiters = remaining;
  }

  waitFor(predicate, timeoutMs = 3000) {
    const idx = this.messages.findIndex(predicate);
    if (idx >= 0) {
      const [msg] = this.messages.splice(idx, 1);
      return Promise.resolve(msg);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter(w => w !== waiter);
        reject(new Error(`timeout waiting for monitor response/event (${timeoutMs}ms)`));
      }, timeoutMs);
      const waiter = { predicate, resolve, reject, timer };
      this.waiters.push(waiter);
    });
  }

  send(commandType, body = Buffer.alloc(0), requestId = null) {
    if (!this.socket) throw new Error('monitor not connected');
    const req = requestId == null ? this.nextRequestId++ : requestId >>> 0;
    const packet = Buffer.alloc(11 + body.length);
    packet[0] = STX;
    packet[1] = API_VERSION;
    packet.writeUInt32LE(body.length, 2);
    packet.writeUInt32LE(req, 6);
    packet[10] = commandType & 0xFF;
    if (body.length) body.copy(packet, 11);
    this.socket.write(packet);
    return req;
  }

  async request(commandType, body = Buffer.alloc(0), timeoutMs = 3000) {
    const req = this.send(commandType, body);
    const msg = await this.waitFor(m => m.requestId === req, timeoutMs);
    if (msg.error !== 0x00) {
      throw new Error(
        `monitor command 0x${commandType.toString(16)} failed with error 0x${msg.error.toString(16)}`
      );
    }
    return msg;
  }
}

function makeMemGetBody(start, end, sideEffects = 0, memspace = 0, bank = 0) {
  const body = Buffer.alloc(8);
  body[0] = sideEffects & 0xFF;
  body.writeUInt16LE(start & 0xFFFF, 1);
  body.writeUInt16LE(end & 0xFFFF, 3);
  body[5] = memspace & 0xFF;
  body.writeUInt16LE(bank & 0xFFFF, 6);
  return body;
}

async function memGet(mon, start, end) {
  const res = await mon.request(0x01, makeMemGetBody(start, end), 3000);
  const len = res.body.readUInt16LE(0);
  return res.body.slice(2, 2 + len);
}

async function setExecCheckpoint(mon, addr, temporary = 0) {
  const body = Buffer.alloc(8);
  body.writeUInt16LE(addr & 0xFFFF, 0);
  body.writeUInt16LE(addr & 0xFFFF, 2);
  body[4] = 1;  // stop when hit
  body[5] = 1;  // enabled
  body[6] = 4;  // exec operation
  body[7] = temporary ? 1 : 0;
  await mon.request(0x12, body, 3000);
}

async function resume(mon) {
  await mon.request(0xAA, Buffer.alloc(0), 3000);
  await mon.waitFor(m => m.type === 0x63, 3000).catch(() => null); // resumed event
}

function codeToId(code) {
  if (code >= 48 && code <= 57) return String.fromCharCode(code);     // 0-9
  if (code >= 1 && code <= 26)  return String.fromCharCode(code + 64); // A-Z screen code
  if (code === 32) return ' ';
  if (code === 160) return '█';
  return `\\x${code.toString(16).toUpperCase().padStart(2, '0')}`;
}

function summarizeFirstColumn(screen, color) {
  const rows = [];
  for (let r = 0; r < 25; r++) {
    const idx = r * 40;
    rows.push({
      row: r,
      code: screen[idx],
      id: codeToId(screen[idx]),
      color: color[idx] & 0x0F,
    });
  }
  return rows;
}

function validateDebugPattern(rows) {
  if (!rows.length) return false;
  const firstCode = rows[0].code;
  const firstColor = rows[0].color;
  if (firstCode < 48 || firstCode > 57) return false;
  for (let r = 0; r < rows.length; r++) {
    const expectedCode = 48 + ((firstCode - 48 + r) % 10);
    const expectedColor = (firstColor + r) % 16;
    if (rows[r].code !== expectedCode) return false;
    if (rows[r].color !== expectedColor) return false;
  }
  return true;
}

function getPatternMismatch(rows) {
  if (!rows.length) return 'empty rows';
  const firstCode = rows[0].code;
  const firstColor = rows[0].color;
  if (firstCode < 48 || firstCode > 57) return `top row id not digit (code=${firstCode})`;
  for (let r = 0; r < rows.length; r++) {
    const expectedCode = 48 + ((firstCode - 48 + r) % 10);
    const expectedColor = (firstColor + r) % 16;
    if (rows[r].code !== expectedCode || rows[r].color !== expectedColor) {
      return `row ${r}: got ${rows[r].id}:${rows[r].color} expected ${codeToId(expectedCode)}:${expectedColor}`;
    }
  }
  return null;
}
async function main() {
  const host = parseArg('--host', '127.0.0.1');
  const port = parseInt(parseArg('--port', '6509'), 10);
  const frames = parseInt(parseArg('--frames', '20'), 10);
  const settleMs = parseInt(parseArg('--settle-ms', '1800'), 10);
  const checkpointOverride = parseMaybeHexInt(parseArg('--checkpoint-addr', null), null);

  const mon = new ViceBinaryMonitor(host, port);
  try {
    await mon.connect(40, 150);
    console.log(`Connected to VICE binary monitor at ${host}:${port}`);

    await sleep(settleMs); // allow autostart/run to reach scrolling loop

    const irqVec = await memGet(mon, 0xFFFE, 0xFFFF);
    const irqAddr = irqVec[0] | (irqVec[1] << 8);
    console.log(`IRQ vector at $FFFE = $${irqAddr.toString(16).toUpperCase().padStart(4, '0')}`);
    const checkpointAddr = checkpointOverride == null ? irqAddr : checkpointOverride;
    await setExecCheckpoint(mon, checkpointAddr, 0);
    console.log(`Set persistent exec checkpoint at $${checkpointAddr.toString(16).toUpperCase().padStart(4, '0')}`);

    await resume(mon);

    for (let f = 0; f < frames; f++) {
      const marker = mon.seq;
      await mon.waitFor(m => m.seq > marker && m.type === 0x62, 8000); // stopped event

      const screen = await memGet(mon, 0x0400, 0x07E7);
      const color = await memGet(mon, 0xD800, 0xDBE7);
      const vars = await memGet(mon, 0x0A97, 0x0A9F);
      const firstCol = summarizeFirstColumn(screen, color);
      const top = firstCol[0];
      const ok = validateDebugPattern(firstCol);
      const first8 = firstCol.slice(0, 8).map(r => `${r.id}:${r.color}`).join(' ');
      const mismatch = ok ? null : getPatternMismatch(firstCol);
      const state = vars.length >= 9
        ? `vs=${vars[0]} d011=${vars[1].toString(16).padStart(2,'0')} d018=${vars[2].toString(16).padStart(2,'0')} fine=${vars[3]} row=${vars[4]} delay=${vars[5]} disp=${vars[6]} work=${vars[7].toString(16).padStart(2,'0')} phase=${vars[8]}`
        : 'state=?';

      console.log(
        `frame ${String(f).padStart(2, '0')}  top=${top.id}:${top.color}  ` +
        `first8=[${first8}]  pattern=${ok ? 'OK' : 'MISMATCH'}  ${state}`
      );
      if (!ok) {
        const full = firstCol.map(r => `${r.id}:${r.color}`).join(' ');
        console.log(`  mismatch: ${mismatch}`);
        console.log(`  first25=[${full}]`);
      }

      await resume(mon);
    }
  } catch (e) {
    console.error(`ERROR: ${e.message}`);
    process.exitCode = 1;
  } finally {
    mon.close();
  }
}

main();
