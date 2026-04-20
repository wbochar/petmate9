#!/usr/bin/env node
/**
 * Focused C128 runtime inspector using VICE binary monitor.
 *
 * Example:
 *   node _tests/inspect_c128_binary_monitor.js --port 6502 --frames 8 --settle-ms 2200
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
  if (value == null || typeof value !== 'string') return fallback;
  if (/^0x[0-9a-f]+$/i.test(value)) return parseInt(value, 16);
  if (/^\$[0-9a-f]+$/i.test(value)) return parseInt(value.slice(1), 16);
  if (/^[0-9]+$/.test(value)) return parseInt(value, 10);
  return fallback;
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function hex2(v) {
  return (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}
function hex4(v) {
  return (v & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
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

async function waitForStop(mon, timeoutMs = 8000) {
  const stopMsg = await mon.waitFor(m => m.type === 0x62, timeoutMs);
  const stopPc = stopMsg.body.length >= 2 ? (stopMsg.body[0] | (stopMsg.body[1] << 8)) : -1;
  return { stopMsg, stopPc };
}

async function waitForTemporaryExecHit(mon, addr, timeoutMs = 8000) {
  await setExecCheckpoint(mon, addr, 1);
  await resume(mon);
  return await waitForStop(mon, timeoutMs);
}

async function main() {
  const host = parseArg('--host', '127.0.0.1');
  const port = parseInt(parseArg('--port', '6502'), 10);
  const frames = parseInt(parseArg('--frames', '8'), 10);
  const settleMs = parseInt(parseArg('--settle-ms', '2200'), 10);
  const checkpointOverride = parseMaybeHexInt(parseArg('--checkpoint-addr', null), null);
  const varStart = parseMaybeHexInt(parseArg('--var-start', '0x1FF7'), 0x1FF7);
  const verifyMusic = parseArg('--verify-music', '1') !== '0';
  const musicAddr = parseMaybeHexInt(parseArg('--music-addr', '0x1003'), 0x1003);
  const musicTimeoutMs = parseInt(parseArg('--music-timeout-ms', '2500'), 10);
  const pollOnly = parseArg('--poll-only', '0') === '1';
  const pollIntervalMs = parseInt(parseArg('--poll-interval-ms', '120'), 10);
  const dumpStart = parseMaybeHexInt(parseArg('--dump-start', null), null);
  const dumpEnd = parseMaybeHexInt(parseArg('--dump-end', null), null);

  const mon = new ViceBinaryMonitor(host, port);
  try {
    await mon.connect(40, 150);
    console.log(`Connected to VICE binary monitor at ${host}:${port}`);

    await sleep(settleMs);

    const irqVec = await memGet(mon, 0xFFFE, 0xFFFF);
    const irqAddr = irqVec[0] | (irqVec[1] << 8);
    const checkpointAddr = checkpointOverride == null ? irqAddr : checkpointOverride;
    console.log(`IRQ vector at $FFFE = $${hex4(irqAddr)}`);
    if (pollOnly) {
      console.log(`Polling live state every ${pollIntervalMs}ms (no checkpoints)`);
    } else {
      console.log(`Using temporary exec checkpoint at $${hex4(checkpointAddr)} (re-armed each frame)`);
    }

    for (let f = 0; f < frames; f++) {
      if (pollOnly) {
        await sleep(pollIntervalMs);
      }
      const stopPc = pollOnly
        ? -1
        : (await waitForTemporaryExecHit(mon, checkpointAddr, 8000)).stopPc;

      const reg = {
        ff00: (await memGet(mon, 0xFF00, 0xFF00))[0],
        p01: (await memGet(mon, 0x0001, 0x0001))[0],
        d011: (await memGet(mon, 0xD011, 0xD011))[0],
        d012: (await memGet(mon, 0xD012, 0xD012))[0],
        d016: (await memGet(mon, 0xD016, 0xD016))[0],
        d018: (await memGet(mon, 0xD018, 0xD018))[0],
        d01a: (await memGet(mon, 0xD01A, 0xD01A))[0],
        d019: (await memGet(mon, 0xD019, 0xD019))[0],
        d020: (await memGet(mon, 0xD020, 0xD020))[0],
        d021: (await memGet(mon, 0xD021, 0xD021))[0],
        d02c: (await memGet(mon, 0x0A2C, 0x0A2C))[0],
      };
      const screen16 = await memGet(mon, 0x0400, 0x040F);
      const color16 = await memGet(mon, 0xD800, 0xD80F);
      const vars = await memGet(mon, varStart, varStart + 10);
      const v = vars.length >= 11
        ? {
            vsyncFlag: vars[0],
            nextD011: vars[1],
            nextD018: vars[2],
            scrollFine: vars[3],
            scrollRow: vars[4],
            delayCounter: vars[5],
            scrollSpeed: vars[6],
            paused: vars[7],
            muteFlag: vars[8],
            port01Saved: vars[9],
            keySpacePrev: vars[10],
          }
        : null;

      console.log(
        `f${String(f).padStart(2, '0')} stopPC=$${hex4(stopPc)} ` +
        `ff00=$${hex2(reg.ff00)} $01=$${hex2(reg.p01)} ` +
        `d011=$${hex2(reg.d011)} d012=$${hex2(reg.d012)} d016=$${hex2(reg.d016)} d018=$${hex2(reg.d018)} ` +
        `d01a=$${hex2(reg.d01a)} d019=$${hex2(reg.d019)} d020=$${hex2(reg.d020)} d021=$${hex2(reg.d021)} ` +
        `$0a2c=$${hex2(reg.d02c)}`
      );
      if (v) {
        console.log(
          `      vars: vs=${v.vsyncFlag} n11=$${hex2(v.nextD011)} n18=$${hex2(v.nextD018)} ` +
          `fine=${v.scrollFine} row=${v.scrollRow} delay=${v.delayCounter} speed=${v.scrollSpeed} ` +
          `paused=${v.paused} mute=${v.muteFlag} p01=${v.port01Saved}`
        );
      }
      console.log(`      screen16=[${[...screen16].map(hex2).join(' ')}]`);
      console.log(`      color16 =[${[...color16].map(hex2).join(' ')}]`);
      if (dumpStart != null && dumpEnd != null && dumpEnd >= dumpStart) {
        const dump = await memGet(mon, dumpStart, dumpEnd);
        console.log(`      dump[$${hex4(dumpStart)}-$${hex4(dumpEnd)}]=[${[...dump].map(hex2).join(' ')}]`);
      }
    }
    if (verifyMusic && !pollOnly) {
      try {
        const { stopPc } = await waitForTemporaryExecHit(mon, musicAddr, musicTimeoutMs);
        const sidRegs = await memGet(mon, 0xD400, 0xD418);
        console.log(`music checkpoint hit at $${hex4(stopPc)} (target $${hex4(musicAddr)})`);
        console.log(`sid_regs=[${[...sidRegs].map(hex2).join(' ')}]`);
      } catch (e) {
        console.log(`music checkpoint NOT hit at $${hex4(musicAddr)} within ${musicTimeoutMs}ms`);
      }
    }
  } catch (e) {
    console.error(`ERROR: ${e.message}`);
    process.exitCode = 1;
  } finally {
    mon.close();
  }
}

main();
