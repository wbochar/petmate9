#!/usr/bin/env node
/**
 * Inspect horizontal scroll timing around coarse-step boundaries using VICE binary monitor.
 *
 * Usage:
 *   node _tests/inspect_hscroll_binary_monitor.js --port 6509 --frames 48
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
function hex2(v) {
  return (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function screenCodeToText(ch) {
  if (ch >= 48 && ch <= 57) return String.fromCharCode(ch);     // 0-9
  if (ch >= 1 && ch <= 26) return String.fromCharCode(ch + 64); // A-Z
  if (ch === 32) return ' ';
  if (ch === 45) return '-';
  if (ch === 95) return '_';
  if (ch === 58) return ':';
  if (ch === 160) return '█';
  return '?';
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
  body[4] = 1; // stop when hit
  body[5] = 1; // enabled
  body[6] = 4; // exec operation
  body[7] = temporary ? 1 : 0;
  await mon.request(0x12, body, 3000);
}
async function resume(mon) {
  await mon.request(0xAA, Buffer.alloc(0), 3000);
  await mon.waitFor(m => m.type === 0x63, 3000).catch(() => null); // resumed event
}

function summarizeVisibleSignature(screen, color, cols = 8) {
  const parts = [];
  for (let x = 1; x < Math.min(cols + 1, 40); x++) {
    const topCode = screen[x];
    const nextCode = screen[40 + x];
    const col = color[x] & 0x0F;
    parts.push(`${screenCodeToText(topCode)}${screenCodeToText(nextCode)}:${col}`);
  }
  return parts.join(' ');
}

async function main() {
  const host = parseArg('--host', '127.0.0.1');
  const port = parseInt(parseArg('--port', '6509'), 10);
  const frames = parseInt(parseArg('--frames', '48'), 10);
  const settleMs = parseInt(parseArg('--settle-ms', '1600'), 10);
  const analysisStartFrame = parseInt(parseArg('--analysis-start-frame', '2'), 10);
  const maxScroll = parseInt(parseArg('--max-scroll', '80'), 10);
  const varStart = parseMaybeHexInt(parseArg('--var-start', '0x0AC6'), 0x0AC6);
  // Default to irq_top::skip_top_commit (post-swap/post-top-commit point).
  const checkpointAddr = parseMaybeHexInt(parseArg('--checkpoint-addr', '0x0A46'), 0x0A46);
  const d018A = parseMaybeHexInt(parseArg('--d018-a', '0x15'), 0x15);
  const d018B = parseMaybeHexInt(parseArg('--d018-b', '0x35'), 0x35);

  const mon = new ViceBinaryMonitor(host, port);
  const captured = [];
  try {
    await mon.connect(40, 150);
    console.log(`Connected to VICE binary monitor at ${host}:${port}`);

    await sleep(settleMs);
    await setExecCheckpoint(mon, checkpointAddr, 0);
    console.log(`Set persistent exec checkpoint at $${checkpointAddr.toString(16).toUpperCase().padStart(4, '0')}`);

    await resume(mon);

    for (let f = 0; f < frames; f++) {
      const marker = mon.seq;
      await mon.waitFor(m => m.seq > marker && m.type === 0x62, 8000); // stopped event

      const vars = await memGet(mon, varStart, varStart + 9);
      const vic = await memGet(mon, 0xD016, 0xD018);
      const screen = await memGet(mon, 0x0400, 0x044F); // first 2 rows
      const color = await memGet(mon, 0xD800, 0xD827);  // first row colors

      if (vars.length < 10 || vic.length < 3 || screen.length < 80 || color.length < 40) {
        throw new Error(`short monitor read at frame ${f}`);
      }

      const state = {
        frame: f,
        vsyncFlag: vars[0],
        nextD016: vars[1],
        nextD018: vars[2],
        scrollFine: vars[3],
        scrollCol: vars[4],
        delayCounter: vars[5],
        displayBuf: vars[6],
        workBufOffset: vars[7],
        coarsePhase: vars[8],
        scrollDir: vars[9],
        d016: vic[0],
        d018: vic[2],
        sig: summarizeVisibleSignature(screen, color, 8),
      };
      captured.push(state);

      console.log(
        `f${String(f).padStart(2, '0')} ` +
        `fine=${state.scrollFine} col=${String(state.scrollCol).padStart(3, ' ')} phase=${state.coarsePhase} ` +
        `disp=${state.displayBuf} work=$${hex2(state.workBufOffset)} ` +
        `d016=$${hex2(state.d016)} d018=$${hex2(state.d018)} ` +
        `n16=$${hex2(state.nextD016)} n18=$${hex2(state.nextD018)} ` +
        `sig=[${state.sig}]`
      );

      await resume(mon);
    }

    const issues = [];
    const boundaries = [];

    for (let i = 1; i < captured.length; i++) {
      const prev = captured[i - 1];
      const curr = captured[i];
      if (curr.frame < analysisStartFrame) continue;
      const expectedFine = prev.scrollFine === 0 ? 7 : prev.scrollFine - 1;
      if (curr.scrollFine !== expectedFine) {
        issues.push(`frame ${curr.frame}: fine jump ${prev.scrollFine} -> ${curr.scrollFine} (expected ${expectedFine})`);
      }
      if ((curr.d016 & 0x07) !== curr.scrollFine) {
        issues.push(`frame ${curr.frame}: d016 low bits ${curr.d016 & 0x07} != fine ${curr.scrollFine}`);
      }
      if (curr.coarsePhase !== 0) {
        issues.push(`frame ${curr.frame}: coarsePhase expected 0 at post-top checkpoint, got ${curr.coarsePhase}`);
      }

      const colChanged = curr.scrollCol !== prev.scrollCol;
      if (colChanged) {
        const expectedCol = (prev.scrollCol + 1) % (maxScroll + 1);
        const colOk = curr.scrollCol === expectedCol;
        if (!colOk) {
          issues.push(`frame ${curr.frame}: col jump ${prev.scrollCol} -> ${curr.scrollCol} (expected ${expectedCol})`);
        }

        const targetD018 = curr.displayBuf === 0 ? d018A : d018B;
        const next = captured[i + 1] || null;
        const fineAtBoundaryOk = curr.scrollFine === 7;
        const nextFineOk = next ? next.scrollFine === 6 : true;
        const nextD018Ok = curr.nextD018 === targetD018;
        const d018AppliedOk = curr.d018 === targetD018;
        if (!fineAtBoundaryOk) issues.push(`frame ${curr.frame}: coarse boundary expected fine=7, got ${curr.scrollFine}`);
        if (!nextFineOk) issues.push(`frame ${curr.frame}: post-boundary fine expected 6, got ${next ? next.scrollFine : '?'}`);
        if (!nextD018Ok) issues.push(`frame ${curr.frame}: nextD018=$${hex2(curr.nextD018)} does not match displayBuf target $${hex2(targetD018)}`);
        if (!d018AppliedOk) issues.push(`frame ${curr.frame}: d018 not matching displayBuf target (d018=$${hex2(curr.d018)} target=$${hex2(targetD018)})`);

        boundaries.push({ frame: curr.frame, prev, curr, next, fineAtBoundaryOk, colOk, nextFineOk, nextD018Ok, d018AppliedOk });
      }
    }

    console.log('');
    console.log(`Boundaries observed: ${boundaries.length}`);
    for (const b of boundaries) {
      const ok = b.fineAtBoundaryOk && b.colOk && b.nextFineOk && b.nextD018Ok && b.d018AppliedOk;
      console.log(
        `  boundary@f${String(b.frame).padStart(2, '0')} ` +
        `col ${b.prev.scrollCol}->${b.curr.scrollCol} fine ${b.prev.scrollFine}->${b.curr.scrollFine} ` +
        `phase=${b.curr.coarsePhase} ` +
        `d018=$${hex2(b.curr.d018)} target=$${hex2(b.curr.displayBuf === 0 ? d018A : d018B)} ` +
        `${ok ? 'OK' : 'CHECK'}`
      );
    }

    if (issues.length === 0) {
      console.log('Timing stability: OK (no fine/coarse boundary anomalies detected).');
    } else {
      console.log('Timing stability: ISSUES DETECTED');
      for (const issue of issues) console.log(`  - ${issue}`);
      process.exitCode = 1;
    }
  } catch (e) {
    console.error(`ERROR: ${e.message}`);
    process.exitCode = 1;
  } finally {
    mon.close();
  }
}

main();
