#!/usr/bin/env node
/**
 * Inspect VIC-20 animation playback via VICE binary monitor.
 *
 * Example:
 *   node _tests/inspect_vic20_binary_monitor.js \
 *     --summary _tests/exports/vic20_anim_delta_test.summary.json \
 *     --port 6510 --samples 20
 */
const fs = require('fs');
const path = require('path');
const net = require('net');

const STX = 0x02;
const API_VERSION = 0x02;
const SCREEN_BASE = 0x1E00;
const COLOR_BASE = 0x9600;
const BORDER_REG = 0x900F;

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

function hex2(v) {
  return (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hex4(v) {
  return (v & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
        this.socket.on('data', (chunk) => this.#onData(chunk));
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
        this.waiters = this.waiters.filter((w) => w !== waiter);
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
    const msg = await this.waitFor((m) => m.requestId === req, timeoutMs);
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
  body[6] = 4; // exec
  body[7] = temporary ? 1 : 0;
  await mon.request(0x12, body, 3000);
}

async function resume(mon) {
  await mon.request(0xAA, Buffer.alloc(0), 3000);
  await mon.waitFor((m) => m.type === 0x63, 3000).catch(() => null); // resumed event
}

async function main() {
  const host = parseArg('--host', '127.0.0.1');
  const port = parseInt(parseArg('--port', '6510'), 10);
  const settleMs = parseInt(parseArg('--settle-ms', '1200'), 10);
  const summaryPath = path.resolve(parseArg('--summary', '_tests/exports/vic20_anim_delta_test.summary.json'));

  if (!fs.existsSync(summaryPath)) {
    throw new Error(`Summary file not found: ${summaryPath}`);
  }
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const frameCount = parseInt(String(summary.frameCount || 0), 10);
  if (!Number.isFinite(frameCount) || frameCount <= 1) {
    throw new Error(`Invalid frameCount in summary: ${summary.frameCount}`);
  }

  const checkpointAddr = parseMaybeHexInt(
    parseArg('--checkpoint-addr', summary.labels && summary.labels.main_loop ? summary.labels.main_loop : null),
    null
  );
  const currentFrameAddr = parseMaybeHexInt(
    parseArg('--current-frame-addr', summary.labels && summary.labels.currentFrame ? summary.labels.currentFrame : null),
    null
  );
  const samples = parseInt(parseArg('--samples', String(frameCount * 2 + 2)), 10);
  const expectedCodes = Array.isArray(summary.topLeftCodes) ? summary.topLeftCodes : [];
  const expectedColors = Array.isArray(summary.topLeftColors) ? summary.topLeftColors : [];
  const expectedBorders = Array.isArray(summary.borderValues) ? summary.borderValues : [];

  if (checkpointAddr == null || currentFrameAddr == null) {
    throw new Error('Missing checkpoint/currentFrame addresses in summary (or via CLI args).');
  }
  if (expectedCodes.length !== frameCount || expectedColors.length !== frameCount) {
    throw new Error('Summary top-left expectation arrays do not match frame count.');
  }

  const mon = new ViceBinaryMonitor(host, port);
  const issues = [];
  const observedFrames = [];
  try {
    await mon.connect(50, 150);
    console.log(`Connected to VICE binary monitor at ${host}:${port}`);
    await sleep(settleMs);
    await setExecCheckpoint(mon, checkpointAddr, 0);
    console.log(`Set persistent exec checkpoint at $${hex4(checkpointAddr)}`);

    await resume(mon);

    let prevFrameIndex = null;
    for (let s = 0; s < samples; s++) {
      const marker = mon.seq;
      await mon.waitFor((m) => m.seq > marker && m.type === 0x62, 8000); // stopped

      const frameByte = await memGet(mon, currentFrameAddr, currentFrameAddr);
      const screenByte = await memGet(mon, SCREEN_BASE, SCREEN_BASE);
      const colorByte = await memGet(mon, COLOR_BASE, COLOR_BASE);
      const borderByte = await memGet(mon, BORDER_REG, BORDER_REG);
      if (frameByte.length < 1 || screenByte.length < 1 || colorByte.length < 1 || borderByte.length < 1) {
        throw new Error(`Short monitor read at sample ${s}`);
      }

      const frameIndex = frameByte[0] % frameCount;
      const topLeftCode = screenByte[0] & 0xFF;
      const topLeftColor = colorByte[0] & 0x0F;
      const borderVal = borderByte[0] & 0xFF;
      observedFrames.push(frameIndex);

      const expectedCode = expectedCodes[frameIndex] & 0xFF;
      const expectedColor = expectedColors[frameIndex] & 0x0F;
      const expectedBorder = (expectedBorders[frameIndex] == null) ? null : (expectedBorders[frameIndex] & 0xFF);
      const codeOk = topLeftCode === expectedCode;
      const colorOk = topLeftColor === expectedColor;
      const borderOk = expectedBorder == null ? true : borderVal === expectedBorder;

      if (!codeOk) {
        issues.push(
          `sample ${s}: frame=${frameIndex} top-left code $${hex2(topLeftCode)} expected $${hex2(expectedCode)}`
        );
      }
      if (!colorOk) {
        issues.push(
          `sample ${s}: frame=${frameIndex} top-left color $${hex2(topLeftColor)} expected $${hex2(expectedColor)}`
        );
      }
      if (!borderOk) {
        issues.push(
          `sample ${s}: frame=${frameIndex} border $${hex2(borderVal)} expected $${hex2(expectedBorder)}`
        );
      }

      if (prevFrameIndex != null) {
        const expectedNext = (prevFrameIndex + 1) % frameCount;
        if (frameIndex !== expectedNext) {
          issues.push(
            `sample ${s}: frame progression ${prevFrameIndex} -> ${frameIndex} (expected ${expectedNext})`
          );
        }
      }
      prevFrameIndex = frameIndex;

      console.log(
        `s${String(s).padStart(2, '0')} frame=${frameIndex} ` +
        `top=$${hex2(topLeftCode)}:$${hex2(topLeftColor)} ` +
        `border=$${hex2(borderVal)} ` +
        `expect=$${hex2(expectedCode)}:$${hex2(expectedColor)} ` +
        `${codeOk && colorOk && borderOk ? 'OK' : 'CHECK'}`
      );

      await resume(mon);
    }

    const sawWrap = observedFrames.some((v, i) => i > 0 && observedFrames[i - 1] === frameCount - 1 && v === 0);
    if (!sawWrap) {
      issues.push('Did not observe frame wrap (last -> 0) in sampled checkpoints.');
    }
    console.log('');
    console.log(`Observed frame indices: ${observedFrames.join(' ')}`);
    if (issues.length === 0) {
      console.log('VIC-20 animation delta verification: OK');
    } else {
      console.log('VIC-20 animation delta verification: ISSUES DETECTED');
      for (const issue of issues) console.log(`  - ${issue}`);
      process.exitCode = 1;
    }
  } finally {
    mon.close();
  }
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
