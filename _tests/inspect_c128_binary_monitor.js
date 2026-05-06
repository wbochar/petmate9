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
function decodeEscapes(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\');
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

function makeMemSetBody(start, bytes, sideEffects = 0, memspace = 0, bank = 0) {
  const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (payload.length < 1) {
    throw new Error('memSet requires at least one byte');
  }
  const end = (start + payload.length - 1) & 0xffff;
  const body = Buffer.alloc(8 + payload.length);
  body[0] = sideEffects & 0xff;
  body.writeUInt16LE(start & 0xffff, 1);
  body.writeUInt16LE(end & 0xffff, 3);
  body[5] = memspace & 0xff;
  body.writeUInt16LE(bank & 0xffff, 6);
  payload.copy(body, 8);
  return body;
}

async function memSet(mon, start, bytes, sideEffects = 0, memspace = 0, bank = 0) {
  const body = makeMemSetBody(start, bytes, sideEffects, memspace, bank);
  await mon.request(0x02, body, 3000);
}

function makeKeyboardFeedBody(text) {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length > 255) {
    throw new Error(`keyboard feed text too long (${bytes.length} bytes, max 255)`);
  }
  const body = Buffer.alloc(1 + bytes.length);
  body[0] = bytes.length & 0xff;
  if (bytes.length > 0) bytes.copy(body, 1);
  return body;
}

async function keyboardFeed(mon, text) {
  await mon.request(0x72, makeKeyboardFeedBody(text), 3000);
}

function parseRegistersAvailableBody(body) {
  if (!body || body.length < 2) return [];
  let pos = 0;
  const count = body.readUInt16LE(pos);
  pos += 2;
  const regs = [];
  for (let i = 0; i < count && pos < body.length; i++) {
    const itemLen = body[pos++];
    if (itemLen < 3 || pos + itemLen > body.length) break;
    const id = body[pos++];
    const bits = body[pos++];
    const nameLen = body[pos++];
    if (nameLen > itemLen - 3 || pos + nameLen > body.length) break;
    const name = body.slice(pos, pos + nameLen).toString('utf8');
    pos += nameLen;
    regs.push({ id, bits, name });
  }
  return regs;
}

async function getRegistersAvailable(mon, memspace = 0) {
  const body = Buffer.from([memspace & 0xff]);
  const res = await mon.request(0x83, body, 3000);
  return parseRegistersAvailableBody(res.body);
}

function parseRegisterValuesBody(body) {
  if (!body || body.length < 2) return [];
  let pos = 0;
  const count = body.readUInt16LE(pos);
  pos += 2;
  const regs = [];
  for (let i = 0; i < count && pos < body.length; i++) {
    const itemLen = body[pos++];
    if (itemLen < 1 || pos + itemLen > body.length) break;
    const id = body[pos++];
    let value = 0;
    for (let b = 0; b < itemLen - 1; b++) {
      value |= (body[pos + b] << (8 * b));
    }
    pos += (itemLen - 1);
    regs.push({ id, value });
  }
  return regs;
}

async function getRegisters(mon, memspace = 0) {
  const body = Buffer.from([memspace & 0xff]);
  const res = await mon.request(0x31, body, 3000);
  return parseRegisterValuesBody(res.body);
}

function makeRegisterSetBody(memspace, regId, value) {
  const body = Buffer.alloc(1 + 2 + 4);
  body[0] = memspace & 0xff;
  body.writeUInt16LE(1, 1); // one register assignment
  body[3] = 3; // item size excluding this byte
  body[4] = regId & 0xff;
  body[5] = value & 0xff;
  body[6] = (value >> 8) & 0xff;
  return body;
}

async function setRegisterByName(mon, name, value, memspace = 0) {
  const regs = await getRegistersAvailable(mon, memspace);
  console.log(`Registers available: ${regs.map(r => `${r.name}:${r.id}`).join(', ')}`);
  const match = regs.find(r => r.name.toLowerCase() === String(name).toLowerCase());
  if (!match) {
    const names = regs.map(r => r.name).join(', ');
    throw new Error(`register '${name}' not found (available: ${names})`);
  }
  console.log(`Using register ${match.name} (id=${match.id})`);
  await mon.request(0x32, makeRegisterSetBody(memspace, match.id, value & 0xffff), 3000);
}

function makeAdvanceBody(count, stepOverSubroutines = true) {
  const body = Buffer.alloc(3);
  body[0] = stepOverSubroutines ? 1 : 0;
  body[1] = count & 0xff;
  body[2] = (count >> 8) & 0xff;
  return body;
}

async function advanceInstructions(mon, count, stepOverSubroutines = true) {
  if (!Number.isFinite(count) || count <= 0) return;
  await mon.request(0x71, makeAdvanceBody(count, stepOverSubroutines), 3000);
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
  const feedTextRaw = parseArg('--feed-text', null);
  const feedDelayMs = parseInt(parseArg('--feed-delay-ms', '1100'), 10);
  const setPc = parseMaybeHexInt(parseArg('--set-pc', null), null);
  const stepAfterSetPc = parseInt(parseArg('--step-after-setpc', '0'), 10);
  const patchIrqHandlerAddr = parseMaybeHexInt(parseArg('--patch-irq-handler-addr', null), null);

  const mon = new ViceBinaryMonitor(host, port);
  try {
    await mon.connect(40, 150);
    console.log(`Connected to VICE binary monitor at ${host}:${port}`);

    await sleep(settleMs);

    if (feedTextRaw != null) {
      const feedText = feedTextRaw;
      await keyboardFeed(mon, feedText);
      console.log(`Fed keyboard text (${Buffer.from(feedText, 'utf8').length} bytes)`);
      await resume(mon);
      if (feedDelayMs > 0) await sleep(feedDelayMs);
    }
    if (setPc != null) {
      const regsBeforeSet = await getRegisters(mon, 0);
      const pcBeforeSet = regsBeforeSet.find(r => r.id === 3);
      if (pcBeforeSet) console.log(`PC before set-pc: $${hex4(pcBeforeSet.value)}`);
      await setRegisterByName(mon, 'PC', setPc, 0);
      console.log(`Set PC register to $${hex4(setPc)}`);
      const regsAfterSet = await getRegisters(mon, 0);
      const pcAfterSet = regsAfterSet.find(r => r.id === 3);
      if (pcAfterSet) console.log(`PC immediately after set-pc command: $${hex4(pcAfterSet.value)}`);
      if (stepAfterSetPc > 0) {
        await advanceInstructions(mon, stepAfterSetPc, false);
        const regsAfterStep = await getRegisters(mon, 0);
        const pcAfterStep = regsAfterStep.find(r => r.id === 3);
        const ff00AfterStep = (await memGet(mon, 0xFF00, 0xFF00))[0];
        console.log(`Stepped ${stepAfterSetPc} instructions after set-pc, pc now $${pcAfterStep ? hex4(pcAfterStep.value) : '????'}, ff00 now $${hex2(ff00AfterStep)}`);
      }
      if (patchIrqHandlerAddr != null) {
        await memSet(mon, 0x0314, Buffer.from([patchIrqHandlerAddr & 0xff, (patchIrqHandlerAddr >> 8) & 0xff]));
        console.log(`Patched KERNAL IRQ vector $0314/$0315 to $${hex4(patchIrqHandlerAddr)}`);
      }
      await resume(mon);
      if (feedDelayMs > 0) await sleep(feedDelayMs);
    }

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
