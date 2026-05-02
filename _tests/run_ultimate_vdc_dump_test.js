#!/usr/bin/env node
/**
 * Ultimate VDC dump verification test.
 *
 * Builds and runs a tiny C128 helper PRG that copies VDC 80-column
 * screen/attribute RAM into CPU RAM, then verifies the copied data
 * via /v1/machine:readmem.
 *
 * Usage:
 *   node _tests/run_ultimate_vdc_dump_test.js
 *   node _tests/run_ultimate_vdc_dump_test.js --ip http://192.168.1.138
 *   node _tests/run_ultimate_vdc_dump_test.js --wait 12000
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_BASE_URL = 'http://192.168.1.64';
const DEFAULT_HTTP_TIMEOUT_MS = 2500;
const DEFAULT_WAIT_TIMEOUT_MS = 10000;
const DEFAULT_POLL_MS = 250;

const STATUS_ADDR = 0x2FF0;
const STATUS_LEN = 16;
const DEST_SCREEN_ADDR = 0x3000;
const DEST_ATTR_ADDR = 0x3800;
const DUMP_LEN = 2000;

const MAGIC = [0x56, 0x44, 0x43, 0x44]; // "VDCD"

function parseArgs(argv) {
  const opts = {
    baseUrl: DEFAULT_BASE_URL,
    timeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
    waitMs: DEFAULT_WAIT_TIMEOUT_MS,
    pollMs: DEFAULT_POLL_MS,
    skipBuild: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--ip' || a === '-ip' || a === '-i') && i + 1 < argv.length) {
      opts.baseUrl = argv[++i];
    } else if ((a === '--timeout' || a === '-t') && i + 1 < argv.length) {
      const v = parseInt(argv[++i], 10);
      if (Number.isFinite(v) && v >= 250) opts.timeoutMs = v;
    } else if ((a === '--wait' || a === '-w') && i + 1 < argv.length) {
      const v = parseInt(argv[++i], 10);
      if (Number.isFinite(v) && v >= 1000) opts.waitMs = v;
    } else if ((a === '--poll' || a === '-p') && i + 1 < argv.length) {
      const v = parseInt(argv[++i], 10);
      if (Number.isFinite(v) && v >= 50) opts.pollMs = v;
    } else if (a === '--skip-build') {
      opts.skipBuild = true;
    } else if (a === '--help' || a === '-h') {
      printHelpAndExit(0);
    }
  }
  return opts;
}

function printHelpAndExit(code) {
  console.log('Ultimate VDC dump verification test');
  console.log('');
  console.log('Options:');
  console.log('  --ip <url>       Ultimate base URL (default: http://192.168.1.64)');
  console.log('  --timeout <ms>   HTTP timeout per request (default: 2500)');
  console.log('  --wait <ms>      Max wait for helper completion (default: 10000)');
  console.log('  --poll <ms>      Poll interval for status block (default: 250)');
  console.log('  --skip-build     Reuse _tests/vdc80col_test/vdc_dump_to_ram.prg');
  console.log('  --help, -h       Show help');
  process.exit(code);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hex2(v) {
  return (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hex4(v) {
  return (v & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

function xorChecksum(buf) {
  let x = 0;
  for (const b of buf) x ^= (b & 0xFF);
  return x & 0xFF;
}

function countDiff(a, b, maxLen) {
  const n = Math.min(a.length, b.length, maxLen);
  let diff = 0;
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) diff++;
  }
  return diff;
}

function parseModeFromProbes(d02f, d030, d7) {
  const looksC128 = ((d02f & 0xF8) === 0xF8) && ((d030 & 0xFC) === 0xFC);
  if (!looksC128) return 'c64';
  return (d7 & 0x80) ? 'c128vdc' : 'c128';
}

function getKeyboardBufferAddrs(mode) {
  // C64 KERNAL keyboard queue: chars at $0277, count at $00C6.
  // C128 KERNAL keyboard queue: chars at $034A, count at $00D0.
  if (mode === 'c64') {
    return { bufAddr: 0x0277, lenAddr: 0x00C6 };
  }
  return { bufAddr: 0x034A, lenAddr: 0x00D0 };
}

function buildHelperPrg(asmPath, outPath) {
  const asmDir = path.dirname(asmPath);
  const command = `npx c64jasm --out "${outPath}" "${path.basename(asmPath)}"`;
  const res = spawnSync(command, [], { encoding: 'utf8', cwd: asmDir, shell: true });
  if (res.error) {
    throw new Error(`failed to launch c64jasm via npx: ${res.error.message}`);
  }
  if (res.status !== 0) {
    const out = [res.stdout || '', res.stderr || ''].join('\n').trim();
    throw new Error(`c64jasm build failed for ${path.basename(asmPath)}\n${out}`);
  }
}

function ultimateRequest(baseUrl, method, urlPath, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + urlPath);
    const opts = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
      timeout: timeoutMs,
    };
    if (body) {
      opts.headers = {
        'Content-Type': 'application/octet-stream',
        'Content-Length': body.length,
      };
    }
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => {
        const data = Buffer.concat(chunks);
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`${method} ${urlPath} -> HTTP ${res.statusCode}`));
          return;
        }
        resolve(data);
      });
    });
    req.on('timeout', () => req.destroy(new Error(`timeout after ${timeoutMs}ms`)));
    req.on('error', (err) => reject(err));
    if (body) req.write(body);
    req.end();
  });
}

function readMem(baseUrl, address, length, timeoutMs) {
  const addrHex = hex4(address);
  return ultimateRequest(
    baseUrl,
    'GET',
    `/v1/machine:readmem?address=${addrHex}&length=${length}`,
    null,
    timeoutMs,
  );
}

function writeMem(baseUrl, address, data, timeoutMs) {
  const addrHex = hex4(address);
  return ultimateRequest(
    baseUrl,
    'POST',
    `/v1/machine:writemem?address=${addrHex}`,
    data,
    timeoutMs,
  );
}
function queueKeyboardCommand(baseUrl, commandAscii, timeoutMs, bufAddr, lenAddr) {
  const cmdBytes = Buffer.from(commandAscii, 'ascii');
  if (cmdBytes.length > 10) {
    throw new Error(`keyboard command too long (${cmdBytes.length} > 10): ${commandAscii.trim()}`);
  }
  return Promise.all([
    writeMem(baseUrl, bufAddr, cmdBytes, timeoutMs),
    writeMem(baseUrl, lenAddr, Buffer.from([cmdBytes.length]), timeoutMs),
  ]);
}

async function waitForStatusDone(baseUrl, timeoutMs, pollMs, requestTimeoutMs) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    let status = null;
    try {
      status = await readMem(baseUrl, STATUS_ADDR, STATUS_LEN, requestTimeoutMs);
    } catch {
      // Keep polling through transient read errors.
    }

    if (status && status.length >= STATUS_LEN) {
      const hasMagic =
        status[0] === MAGIC[0] &&
        status[1] === MAGIC[1] &&
        status[2] === MAGIC[2] &&
        status[3] === MAGIC[3];
      if (hasMagic && status[5] === 0x01) {
        return status;
      }
    }
    await sleep(pollMs);
  }
  throw new Error(`helper did not report completion within ${timeoutMs}ms`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const helperAsm = path.join(__dirname, 'vdc80col_test', 'vdc_dump_to_ram.asm');
  const helperPrgDefault = path.join(__dirname, 'vdc80col_test', 'vdc_dump_to_ram.prg');
  const helperPrg = opts.skipBuild
    ? helperPrgDefault
    : path.join(
      os.tmpdir(),
      `vdc_dump_to_ram_${Date.now()}_${Math.random().toString(16).slice(2)}.prg`,
    );

  console.log('═══ Ultimate VDC Dump Verification ═══');
  console.log(`  Target:   ${opts.baseUrl}`);
  console.log(`  Timeout:  ${opts.timeoutMs} ms`);
  console.log(`  Wait max: ${opts.waitMs} ms`);
  console.log(`  Poll:     ${opts.pollMs} ms`);
  console.log(`  Time:     ${new Date().toISOString()}`);
  if (opts.skipBuild && !fs.existsSync(helperPrg)) {
    throw new Error(`--skip-build requested, but helper PRG is missing: ${helperPrg}`);
  }

  if (!opts.skipBuild) {
    buildHelperPrg(helperAsm, helperPrg);
    console.log(`  Built:    ${helperPrg}`);
  } else {
    console.log(`  Build:    skipped (--skip-build), using ${path.relative(process.cwd(), helperPrg)}`);
  }

  const prgData = fs.readFileSync(helperPrg);
  if (!prgData || prgData.length < 3) {
    throw new Error(`helper PRG looks invalid: ${helperPrg}`);
  }
  const loadAddr = ((prgData[1] & 0xFF) << 8) | (prgData[0] & 0xFF);
  const payload = prgData.slice(2);
  const entryAddr = loadAddr;
  const sysCommand = `SYS ${entryAddr}\r`;
  console.log(`  Helper:   load=$${hex4(loadAddr)} payload=${payload.length} bytes entry=$${hex4(entryAddr)}`);

  // Probe mode for visibility in output (test can still run in other modes).
  const [regs, d7buf] = await Promise.all([
    readMem(opts.baseUrl, 0xD02F, 2, opts.timeoutMs),
    readMem(opts.baseUrl, 0x00D7, 1, opts.timeoutMs),
  ]);
  const mode = parseModeFromProbes(regs[0], regs[1], d7buf[0]);
  const keybuf = getKeyboardBufferAddrs(mode);
  console.log(`  Probe:    mode=${mode} D02F=$${hex2(regs[0])} D030=$${hex2(regs[1])} D7=$${hex2(d7buf[0])}`);
  console.log(`  Keybuf:   data=$${hex4(keybuf.bufAddr)} len=$${hex4(keybuf.lenAddr)}`);
  if (mode !== 'c128vdc') {
    console.log('  Warning:  target does not currently look like C128 VDC mode; results may be less meaningful.');
  }

  // Upload helper code and execute it through a queued SYS command.
  await ultimateRequest(opts.baseUrl, 'PUT', '/v1/machine:pause', null, opts.timeoutMs);
  try {
    await writeMem(opts.baseUrl, loadAddr, payload, opts.timeoutMs);
    await writeMem(opts.baseUrl, STATUS_ADDR, Buffer.alloc(STATUS_LEN, 0), opts.timeoutMs);
    await queueKeyboardCommand(opts.baseUrl, sysCommand, opts.timeoutMs, keybuf.bufAddr, keybuf.lenAddr);
    try {
      const queuedLen = await readMem(opts.baseUrl, keybuf.lenAddr, 1, opts.timeoutMs);
      console.log(`  Keybuf:   queued-len=$${hex2(queuedLen[0])}`);
    } catch {
      // Ignore keybuffer diagnostic read failures.
    }
    await ultimateRequest(opts.baseUrl, 'PUT', '/v1/machine:resume', null, opts.timeoutMs);
    await sleep(350);
    try {
      const postResumeLen = await readMem(opts.baseUrl, keybuf.lenAddr, 1, opts.timeoutMs);
      console.log(`  Keybuf:   post-resume-len=$${hex2(postResumeLen[0])}`);
    } catch {
      // Ignore keybuffer diagnostic read failures.
    }
  } catch (err) {
    try {
      await ultimateRequest(opts.baseUrl, 'PUT', '/v1/machine:resume', null, opts.timeoutMs);
    } catch {
      // Ignore cleanup failures.
    }
    throw err;
  }

  // Wait for completion marker.
  const status = await waitForStatusDone(opts.baseUrl, opts.waitMs, opts.pollMs, opts.timeoutMs);

  const srcScreen = ((status[6] & 0xFF) << 8) | (status[7] & 0xFF);
  const srcAttr = ((status[8] & 0xFF) << 8) | (status[9] & 0xFF);
  const copyLen = ((status[11] & 0xFF) << 8) | (status[10] & 0xFF);
  console.log(`  Helper:   done version=${status[4]} srcScreen=$${hex4(srcScreen)} srcAttr=$${hex4(srcAttr)} len=${copyLen}`);

  let paused = false;
  try {
    await ultimateRequest(opts.baseUrl, 'PUT', '/v1/machine:pause', null, opts.timeoutMs);
    paused = true;

    const [screenDump, attrDump, vic40] = await Promise.all([
      readMem(opts.baseUrl, DEST_SCREEN_ADDR, DUMP_LEN, opts.timeoutMs),
      readMem(opts.baseUrl, DEST_ATTR_ADDR, DUMP_LEN, opts.timeoutMs),
      readMem(opts.baseUrl, 0x0400, 1000, opts.timeoutMs),
    ]);

    if (screenDump.length !== DUMP_LEN) throw new Error(`screen dump short read: ${screenDump.length}`);
    if (attrDump.length !== DUMP_LEN) throw new Error(`attr dump short read: ${attrDump.length}`);

    const calcScreenXor = xorChecksum(screenDump);
    const calcAttrXor = xorChecksum(attrDump);
    const metaScreenXor = status[12] & 0xFF;
    const metaAttrXor = status[13] & 0xFF;

    const checksumOk = (calcScreenXor === metaScreenXor) && (calcAttrXor === metaAttrXor);
    const diffVsVic = countDiff(screenDump, vic40, 1000);

    const first16Screen = [...screenDump.slice(0, 16)].map(hex2).join(' ');
    const first16Attr = [...attrDump.slice(0, 16)].map(hex2).join(' ');

    console.log(`  Verify:   screenXor helper=$${hex2(metaScreenXor)} calc=$${hex2(calcScreenXor)}`);
    console.log(`  Verify:   attrXor   helper=$${hex2(metaAttrXor)} calc=$${hex2(calcAttrXor)}`);
    console.log(`  Verify:   first16 screen: ${first16Screen}`);
    console.log(`  Verify:   first16 attr  : ${first16Attr}`);
    console.log(`  Compare:  VDC dump vs VIC $0400 first 1000 bytes differ at ${diffVsVic} positions`);

    if (!checksumOk) {
      throw new Error('checksum mismatch between helper metadata and read-back dumps');
    }
    if (diffVsVic === 0 && mode === 'c128vdc') {
      throw new Error('VDC dump unexpectedly identical to VIC 40-col screen for first 1000 bytes');
    }

    console.log('');
    console.log('PASS: helper copied VDC memory into CPU RAM and verification checks succeeded.');
  } finally {
    if (paused) {
      try {
        await ultimateRequest(opts.baseUrl, 'PUT', '/v1/machine:resume', null, opts.timeoutMs);
      } catch {
        // Ignore resume errors in cleanup path.
      }
    }
  }
}

main().catch((err) => {
  console.error('');
  console.error(`FAIL: ${err.message}`);
  process.exit(1);
});
