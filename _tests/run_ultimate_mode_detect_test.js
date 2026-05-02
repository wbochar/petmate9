#!/usr/bin/env node
/**
 * Ultimate mode detection watcher for C64 / C128.
 *
 * Detects:
 *   - c64
 *   - c128 (40-column VIC-IIe)
 *   - c128vdc (80-column VDC)
 *   - cpm
 *
 * Usage:
 *   node _tests/run_ultimate_mode_detect_test.js
 *   node _tests/run_ultimate_mode_detect_test.js --ip http://192.168.1.64
 *   node _tests/run_ultimate_mode_detect_test.js --interval 1200
 *   node _tests/run_ultimate_mode_detect_test.js --once
 *   node _tests/run_ultimate_mode_detect_test.js --verbose
 */

const http = require('http');

const DEFAULT_BASE_URL = 'http://192.168.1.64';
const DEFAULT_INTERVAL_MS = 1200;
const DEFAULT_HTTP_TIMEOUT_MS = 1800;
const DEFAULT_HTTP_RETRIES = 1;
const MACHINE_AMBIGUOUS_GRACE = 3;

const MODE_LAYOUTS = {
  c64: {
    video: [
      'VIC-II screen RAM: $0400-$07E7 (40x25)',
      'VIC-II registers: $D000-$D02E',
    ],
    color: [
      'Color RAM: $D800-$DBE7 (low nibble per cell)',
    ],
    program: [
      'BASIC 2.0 program start: $0801',
    ],
  },
  c128: {
    video: [
      'VIC-IIe screen RAM: $0400-$07E7 (40x25)',
      'VIC-IIe registers: $D000-$D03F',
    ],
    color: [
      'Color RAM: $D800-$DBE7 (low nibble per cell)',
    ],
    program: [
      'BASIC 7.0 program start: $1C01',
    ],
  },
  c128vdc: {
    video: [
      'VDC screen RAM (VDC VRAM): $0000-$07CF (80x25)',
      'VDC access ports: $D600/$D601',
    ],
    color: [
      'VDC attribute RAM (VDC VRAM): $0800-$0FCF',
    ],
    program: [
      'BASIC 7.0 program start: $1C01 (CPU RAM)',
    ],
  },
  cpm: {
    video: [
      'Usually VDC text screen: VRAM $0000-$07CF (80-col)',
      'CP/M can also be configured for 40-col VIC output',
    ],
    color: [
      '80-col: VDC attributes at VRAM $0800-$0FCF',
      '40-col (if selected): VIC color RAM $D800-$DBE7',
    ],
    program: [
      'CP/M TPA (transient program area) starts at $0100',
      'CP/M BDOS entry vector at $0005',
    ],
  },
};

function parseArgs(argv) {
  const opts = {
    baseUrl: DEFAULT_BASE_URL,
    intervalMs: DEFAULT_INTERVAL_MS,
    timeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
    retries: DEFAULT_HTTP_RETRIES,
    once: false,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--ip' || a === '-ip' || a === '-i') && i + 1 < argv.length) {
      opts.baseUrl = argv[++i];
    } else if (a === '--interval' && i + 1 < argv.length) {
      const v = parseInt(argv[++i], 10);
      if (Number.isFinite(v) && v >= 100) {
        opts.intervalMs = v;
      }
    } else if ((a === '--timeout' || a === '-t') && i + 1 < argv.length) {
      const v = parseInt(argv[++i], 10);
      if (Number.isFinite(v) && v >= 250) {
        opts.timeoutMs = v;
      }
    } else if ((a === '--retries' || a === '-r') && i + 1 < argv.length) {
      const v = parseInt(argv[++i], 10);
      if (Number.isFinite(v) && v >= 0 && v <= 5) {
        opts.retries = v;
      }
    } else if (a === '--once') {
      opts.once = true;
    } else if (a === '--verbose') {
      opts.verbose = true;
    } else if (a === '--help' || a === '-h') {
      printHelpAndExit(0);
    }
  }
  return opts;
}

function printHelpAndExit(code) {
  console.log('Ultimate mode detection watcher');
  console.log('');
  console.log('Options:');
  console.log('  --ip <url>       Ultimate base URL (default: http://192.168.1.64)');
  console.log('  --interval <ms>  Poll interval in ms (default: 1200)');
  console.log('  --timeout <ms>   HTTP timeout per read (default: 1800)');
  console.log('  --retries <n>    Retry count per failed read, 0..5 (default: 1)');
  console.log('  --once           Sample once and exit');
  console.log('  --verbose        Print every sample (default prints only on mode change)');
  console.log('  --help, -h       Show this help');
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
function fmtHexByte(v) {
  if (v === null || v === undefined) return '??';
  return hex2(v);
}

function fmtHexWord(v) {
  if (v === null || v === undefined) return '????';
  return hex4(v);
}

function u16(lo, hi) {
  return ((hi & 0xFF) << 8) | (lo & 0xFF);
}
function ultimateHttpGet(baseUrl, path, timeoutMs) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + path);
    const req = http.request({
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: 'GET',
      timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode} for ${path}`));
          return;
        }
        resolve(Buffer.concat(chunks));
      });
    });
    req.on('timeout', () => req.destroy(new Error(`timeout after ${timeoutMs}ms`)));
    req.on('error', (err) => reject(err));
    req.end();
  });
}
function readMem(baseUrl, address, length, timeoutMs) {
  const addrHex = address.toString(16).toUpperCase().padStart(4, '0');
  return ultimateHttpGet(baseUrl, `/v1/machine:readmem?address=${addrHex}&length=${length}`, timeoutMs);
}

async function readMemWithRetry(baseUrl, address, length, timeoutMs, retries) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await readMem(baseUrl, address, length, timeoutMs);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await sleep(75);
      }
    }
  }
  throw new Error(`readmem ${hex4(address)} len=${length} failed: ${lastErr.message}`);
}

async function readMemOptional(baseUrl, address, length, timeoutMs, retries) {
  try {
    return await readMemWithRetry(baseUrl, address, length, timeoutMs, retries);
  } catch {
    return null;
  }
}

function classifyUltimateMachineType(
  d02f,
  d030,
  prevMachineType,
  consecutiveAmbiguous,
  graceLimit = MACHINE_AMBIGUOUS_GRACE,
) {
  const d02fReg = d02f & 0xFF;
  const d030Reg = d030 & 0xFF;

  if (d02fReg === 0xFF && d030Reg === 0xFF) {
    const next = consecutiveAmbiguous + 1;
    if (next <= graceLimit && prevMachineType === 'c128') {
      return { machineType: 'c128', consecutiveAmbiguous: next };
    }
    return { machineType: 'c64', consecutiveAmbiguous: next };
  }

  const d02fLooksVicIIe = (d02fReg & 0xF8) === 0xF8;
  const d030LooksVicIIe = (d030Reg & 0xFC) === 0xFC;
  if (d02fLooksVicIIe && d030LooksVicIIe) {
    return { machineType: 'c128', consecutiveAmbiguous: 0 };
  }
  return { machineType: 'c64', consecutiveAmbiguous: 0 };
}

function looksLikeCpm(zp0000_0007) {
  if (!zp0000_0007 || zp0000_0007.length < 8) return false;
  const jumpAt0000 = zp0000_0007[0] === 0xC3; // JP nn
  const jumpAt0005 = zp0000_0007[5] === 0xC3; // BDOS vector: JP nn
  const bdosVectorHi = zp0000_0007[7] & 0xFF;
  return jumpAt0000 && jumpAt0005 && bdosVectorHi >= 0xC0;
}

async function sample(baseUrl, state, opts) {
  // Critical probes only (kept intentionally small to avoid overloading
  // Ultimate's HTTP handler).
  const regs = await readMemWithRetry(baseUrl, 0xD02F, 2, opts.timeoutMs, opts.retries);
  const d7Buf = await readMemWithRetry(baseUrl, 0x00D7, 1, opts.timeoutMs, opts.retries);
  const zp = await readMemWithRetry(baseUrl, 0x0000, 8, opts.timeoutMs, opts.retries);
  const basicPtrBuf = await readMemWithRetry(baseUrl, 0x002B, 4, opts.timeoutMs, opts.retries);

  const d02f = regs[0] & 0xFF;
  const d030 = regs[1] & 0xFF;
  const d7 = d7Buf[0] & 0xFF;
  const c64BasicPtr = u16(basicPtrBuf[0], basicPtrBuf[1]);
  const c128BasicPtr = u16(basicPtrBuf[2], basicPtrBuf[3]);

  const machine = classifyUltimateMachineType(
    d02f,
    d030,
    state.prevMachineType,
    state.consecutiveAmbiguous,
  );
  state.prevMachineType = machine.machineType;
  state.consecutiveAmbiguous = machine.consecutiveAmbiguous;

  const cpm = looksLikeCpm(zp);
  const is80Col = (d7 & 0x80) !== 0;
  // In GO64 mode on C128, BASIC pointers are typically:
  //   $002B/$002C = $0801  (program start)
  //   $002D/$002E = $0803  (next location / vars)
  // This is a strong C64-mode signature and avoids false C128 positives
  // when VIC-IIe extension register reads look ambiguous.
  const c64ModeByBasicPtrs = c64BasicPtr === 0x0801 && c128BasicPtr === 0x0803;

  let mode = 'c64';
  if (c64ModeByBasicPtrs) {
    mode = 'c64';
  } else if (machine.machineType === 'c64') {
    mode = 'c64';
  } else {
    if (cpm) {
      mode = 'cpm';
    } else {
      mode = is80Col ? 'c128vdc' : 'c128';
    }
  }

  return {
    mode,
    machineType: machine.machineType,
    cpmSignature: cpm,
    is80Col,
    probes: {
      d02f,
      d030,
      d7,
      ff00: null,
      d018: null,
      dd00: null,
      zp,
      c64BasicPtr,
      c128BasicPtr,
    },
  };
}
async function enrichOptionalProbes(baseUrl, result, opts) {
  const ff00Buf = await readMemOptional(baseUrl, 0xFF00, 1, opts.timeoutMs, opts.retries);
  const d018Buf = await readMemOptional(baseUrl, 0xD018, 1, opts.timeoutMs, opts.retries);
  const dd00Buf = await readMemOptional(baseUrl, 0xDD00, 1, opts.timeoutMs, opts.retries);

  result.probes.ff00 = ff00Buf ? (ff00Buf[0] & 0xFF) : null;
  result.probes.d018 = d018Buf ? (d018Buf[0] & 0xFF) : null;
  result.probes.dd00 = dd00Buf ? (dd00Buf[0] & 0xFF) : null;
}

function printModeReport(result) {
  const ts = new Date().toISOString();
  const p = result.probes;
  const zpHex = p.zp ? [...p.zp].map(hex2).join(' ') : '(unreadable)';

  console.log('');
  console.log(`[${ts}] DETECTED MODE: ${result.mode.toUpperCase()}`);
  console.log(`  machineType probe: ${result.machineType}  cpmSignature=${result.cpmSignature ? 'yes' : 'no'}  80colFlag(D7.7)=${result.is80Col ? '1' : '0'}`);
  console.log(`  probes: D02F=$${fmtHexByte(p.d02f)} D030=$${fmtHexByte(p.d030)} D7=$${fmtHexByte(p.d7)} FF00=$${fmtHexByte(p.ff00)} D018=$${fmtHexByte(p.d018)} DD00=$${fmtHexByte(p.dd00)}`);
  console.log(`  zp[0000..0007]: ${zpHex}`);
  console.log(`  BASIC ptrs: C64($002B/2C)=$${fmtHexWord(p.c64BasicPtr)}  C128($002D/2E)=$${fmtHexWord(p.c128BasicPtr)}`);

  const layout = MODE_LAYOUTS[result.mode];
  console.log('  memory regions:');
  console.log('    video:');
  layout.video.forEach((line) => console.log(`      - ${line}`));
  console.log('    color:');
  layout.color.forEach((line) => console.log(`      - ${line}`));
  console.log('    program:');
  layout.program.forEach((line) => console.log(`      - ${line}`));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const state = {
    prevMachineType: null,
    consecutiveAmbiguous: 0,
  };

  console.log('═══ Ultimate C128 Mode Detection Watcher ═══');
  console.log(`  Target:   ${opts.baseUrl}`);
  console.log(`  Interval: ${opts.intervalMs} ms`);
  console.log(`  Timeout:  ${opts.timeoutMs} ms`);
  console.log(`  Retries:  ${opts.retries}`);
  console.log(`  Time:     ${new Date().toISOString()}`);
  if (!opts.once) {
    console.log('  Watching mode changes... (Ctrl+C to stop)');
  }

  let prevMode = null;
  while (true) {
    try {
      const result = await sample(opts.baseUrl, state, opts);
      const changed = prevMode !== result.mode;
      if (changed || opts.verbose) {
        await enrichOptionalProbes(opts.baseUrl, result, opts);
        printModeReport(result);
      }
      prevMode = result.mode;
    } catch (err) {
      const ts = new Date().toISOString();
      console.log(`[${ts}] ERROR: ${err.message}`);
    }

    if (opts.once) {
      break;
    }
    await sleep(opts.intervalMs);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
