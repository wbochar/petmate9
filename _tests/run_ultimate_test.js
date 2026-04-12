#!/usr/bin/env node
/**
 * Petmate Ultimate 64 Integration Test
 *
 * Tests all Ultimate REST API endpoints used by Petmate against a real
 * Ultimate 64 / Ultimate II+ device on the network.
 *
 * Default IP: http://192.168.1.64
 * Override:   node run_ultimate_test.js --ip http://10.0.0.5
 *
 * Endpoints tested:
 *   PUT  /v1/machine:reset        – Reset the machine
 *   PUT  /v1/machine:pause        – Pause the machine
 *   PUT  /v1/machine:resume       – Resume the machine
 *   GET  /v1/machine:readmem      – Read memory
 *   POST /v1/machine:writemem     – Write memory (binary body)
 *   PUT  /v1/machine:writemem     – Write memory (hex query param)
 *   POST /v1/runners:run_prg      – Run a PRG file
 *   POST /v1/runners:sidplay      – Play a SID file
 *   POST /v1/drives/A:mount       – Mount a D64 image
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

// ─── Configuration ─────────────────────────────────────────────────
const ipArgIdx = process.argv.indexOf('--ip');
const BASE_URL = ipArgIdx >= 0 && ipArgIdx + 1 < process.argv.length
  ? process.argv[ipArgIdx + 1]
  : 'http://192.168.1.64';

const ROOT     = path.resolve(__dirname, '..');
const ASSETS   = path.join(ROOT, 'assets');
const TESTS    = __dirname;
const TEMPLATE = path.join(ASSETS, 'template.prg');
const COLORBARS_FILE = path.join(TESTS, 'colorbars.petmate');

let totalPass = 0;
let totalFail = 0;
let totalSkip = 0;

// ─── Load color bars test pattern ──────────────────────────────────

let colorbars = null;
try {
  colorbars = JSON.parse(fs.readFileSync(COLORBARS_FILE, 'utf-8'));
  if (!colorbars.framebufs || !colorbars.framebufs[0]) throw new Error('bad format');
} catch (e) {
  console.error(`WARNING: Could not load ${COLORBARS_FILE}: ${e.message}`);
  console.error('  Run: node _tests/gen_colorbars.js  to regenerate it.\n');
}

/** Extract screen RAM and color RAM buffers from the colorbars framebuf. */
function getColorbarsBuffers() {
  const fb = colorbars.framebufs[0];
  const { width, height, framebuf, backgroundColor, borderColor, charset } = fb;
  const screenBuf = Buffer.alloc(width * height);
  const colorBuf  = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      screenBuf[idx] = framebuf[y][x].code;
      colorBuf[idx]  = framebuf[y][x].color;
    }
  }
  return { screenBuf, colorBuf, borderColor, backgroundColor, charset, width, height };
}

// ─── HTTP Helper ───────────────────────────────────────────────────

function ultimateRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + urlPath);
    const opts = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
      timeout: 5000,
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
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.on('error', (err) => reject(err));
    if (body) req.write(body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pass(name, detail) {
  totalPass++;
  console.log(`  ✓ ${name}${detail ? '  ' + detail : ''}`);
}

function fail(name, err) {
  totalFail++;
  console.log(`  ✗ ${name}  —  ${err}`);
}

function skip(name, reason) {
  totalSkip++;
  console.log(`  - ${name}  (${reason})`);
}

// ─── Build a minimal test PRG ──────────────────────────────────────
// Patches the template.prg with a known border/bg and a single char
// at screen position 0 so we can verify the write via readmem.

function buildTestPrg(borderColor, bgColor) {
  const tmpl = fs.readFileSync(TEMPLATE);
  const buf = Buffer.from(tmpl);

  const d020 = buf.indexOf(Buffer.from([0x8d, 0x20, 0xd0]));
  if (d020 > 0) buf[d020 - 1] = borderColor;

  const d021 = buf.indexOf(Buffer.from([0x8d, 0x21, 0xd0]));
  if (d021 > 0) buf[d021 - 1] = bgColor;

  // Fill screen with ascending screencodes and color 1
  let screencodeOffs = 0x62;
  let colorOffs = screencodeOffs + 1000;
  for (let i = 0; i < 1000; i++) {
    buf[screencodeOffs++] = i & 0xff;
    buf[colorOffs++] = 1;
  }
  return buf;
}

// ═══════════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════════

async function testConnectivity() {
  console.log('\n── Connectivity ──');
  try {
    const res = await ultimateRequest('GET', '/v1/machine:readmem?address=D020&length=1');
    if (res.statusCode >= 200 && res.statusCode < 300) {
      pass('Reachable', `${BASE_URL} responded (HTTP ${res.statusCode})`);
      return true;
    } else {
      fail('Reachable', `HTTP ${res.statusCode}`);
      return false;
    }
  } catch (err) {
    fail('Reachable', err.message);
    return false;
  }
}

async function testReset() {
  console.log('\n── Reset ──');
  try {
    const res = await ultimateRequest('PUT', '/v1/machine:reset');
    if (res.statusCode >= 200 && res.statusCode < 300) {
      pass('machine:reset', `HTTP ${res.statusCode}`);
    } else {
      fail('machine:reset', `HTTP ${res.statusCode}`);
    }
    // Give the machine time to boot
    await sleep(3000);
  } catch (err) {
    fail('machine:reset', err.message);
  }
}

async function testPauseResume() {
  console.log('\n── Pause / Resume ──');
  try {
    const pauseRes = await ultimateRequest('PUT', '/v1/machine:pause');
    if (pauseRes.statusCode >= 200 && pauseRes.statusCode < 300) {
      pass('machine:pause', `HTTP ${pauseRes.statusCode}`);
    } else {
      fail('machine:pause', `HTTP ${pauseRes.statusCode}`);
    }

    const resumeRes = await ultimateRequest('PUT', '/v1/machine:resume');
    if (resumeRes.statusCode >= 200 && resumeRes.statusCode < 300) {
      pass('machine:resume', `HTTP ${resumeRes.statusCode}`);
    } else {
      fail('machine:resume', `HTTP ${resumeRes.statusCode}`);
    }
  } catch (err) {
    fail('pause/resume', err.message);
  }
}

async function testReadMem() {
  console.log('\n── Read Memory ──');
  try {
    // Read border color register ($D020, 1 byte)
    const res = await ultimateRequest('GET', '/v1/machine:readmem?address=D020&length=2');
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const border = res.body[0] & 0x0f;
      const bg     = res.body.length > 1 ? res.body[1] & 0x0f : -1;
      pass('readmem $D020-$D021', `border=${border} bg=${bg} (${res.body.length} bytes)`);
    } else {
      fail('readmem $D020-$D021', `HTTP ${res.statusCode}`);
    }

    // Read screen RAM ($0400, 40 bytes = first row)
    const scrRes = await ultimateRequest('GET', '/v1/machine:readmem?address=0400&length=40');
    if (scrRes.statusCode >= 200 && scrRes.statusCode < 300) {
      pass('readmem $0400 (screen row 0)', `${scrRes.body.length} bytes`);
    } else {
      fail('readmem $0400', `HTTP ${scrRes.statusCode}`);
    }

    // Read color RAM ($D800, 40 bytes = first row)
    const colRes = await ultimateRequest('GET', '/v1/machine:readmem?address=D800&length=40');
    if (colRes.statusCode >= 200 && colRes.statusCode < 300) {
      pass('readmem $D800 (color row 0)', `${colRes.body.length} bytes`);
    } else {
      fail('readmem $D800', `HTTP ${colRes.statusCode}`);
    }

    // Read $D018 (VIC character memory pointer)
    const d018Res = await ultimateRequest('GET', '/v1/machine:readmem?address=D018&length=1');
    if (d018Res.statusCode >= 200 && d018Res.statusCode < 300) {
      const d018 = d018Res.body[0];
      const charSel = (d018 >> 1) & 0x07;
      pass('readmem $D018', `$${d018.toString(16).padStart(2,'0')} (charset selector=${charSel})`);
    } else {
      fail('readmem $D018', `HTTP ${d018Res.statusCode}`);
    }
  } catch (err) {
    fail('readmem', err.message);
  }
}

async function testWriteMemSmall() {
  console.log('\n── Write Memory (hex query param) ──');
  try {
    // Pause first so writes are safe
    await ultimateRequest('PUT', '/v1/machine:pause');

    // Read original border color
    const origRes = await ultimateRequest('GET', '/v1/machine:readmem?address=D020&length=1');
    const origBorder = origRes.body[0] & 0x0f;

    // Write a test border color (light blue = 14)
    const testColor = (origBorder === 14) ? 6 : 14;
    const hex = testColor.toString(16).padStart(2, '0');
    const writeRes = await ultimateRequest('PUT', `/v1/machine:writemem?address=D020&data=${hex}`);
    if (writeRes.statusCode >= 200 && writeRes.statusCode < 300) {
      pass('writemem (hex) $D020', `wrote ${testColor}`);
    } else {
      fail('writemem (hex) $D020', `HTTP ${writeRes.statusCode}`);
    }

    // Verify the write
    const verifyRes = await ultimateRequest('GET', '/v1/machine:readmem?address=D020&length=1');
    const readBack = verifyRes.body[0] & 0x0f;
    if (readBack === testColor) {
      pass('writemem verify', `read back ${readBack} === ${testColor}`);
    } else {
      fail('writemem verify', `expected ${testColor}, got ${readBack}`);
    }

    // Restore original
    const restoreHex = origBorder.toString(16).padStart(2, '0');
    await ultimateRequest('PUT', `/v1/machine:writemem?address=D020&data=${restoreHex}`);
    pass('writemem restore', `restored border to ${origBorder}`);

    await ultimateRequest('PUT', '/v1/machine:resume');
  } catch (err) {
    fail('writemem (hex)', err.message);
    try { await ultimateRequest('PUT', '/v1/machine:resume'); } catch {}
  }
}

async function testWriteMemBinary() {
  console.log('\n── Write Memory (binary POST) ──');
  try {
    await ultimateRequest('PUT', '/v1/machine:pause');

    // Write 40 bytes of screencode $01 (A) to first screen row
    const testData = Buffer.alloc(40, 0x01);
    const writeRes = await ultimateRequest('POST', '/v1/machine:writemem?address=0400', testData);
    if (writeRes.statusCode >= 200 && writeRes.statusCode < 300) {
      pass('writemem (binary) $0400', `wrote 40 bytes`);
    } else {
      fail('writemem (binary) $0400', `HTTP ${writeRes.statusCode}`);
    }

    // Verify
    const verifyRes = await ultimateRequest('GET', '/v1/machine:readmem?address=0400&length=40');
    let allMatch = true;
    for (let i = 0; i < 40; i++) {
      if (verifyRes.body[i] !== 0x01) { allMatch = false; break; }
    }
    if (allMatch) {
      pass('writemem (binary) verify', 'all 40 bytes read back as $01');
    } else {
      fail('writemem (binary) verify', 'mismatch in read-back data');
    }

    await ultimateRequest('PUT', '/v1/machine:resume');
  } catch (err) {
    fail('writemem (binary)', err.message);
    try { await ultimateRequest('PUT', '/v1/machine:resume'); } catch {}
  }
}

async function testPushColorBars() {
  console.log('\n── Push Color Bars Test Pattern ──');
  if (!colorbars) { skip('push colorbars', 'colorbars.petmate not loaded'); return; }
  try {
    const { screenBuf, colorBuf, borderColor, backgroundColor, charset, width, height } = getColorbarsBuffers();
    const d018Val = charset === 'lower' ? 0x17 : 0x15;

    await ultimateRequest('PUT', '/v1/machine:pause');
    await Promise.all([
      ultimateRequest('POST', `/v1/machine:writemem?address=0400`, screenBuf),
      ultimateRequest('POST', `/v1/machine:writemem?address=D800`, colorBuf),
      ultimateRequest('PUT',  `/v1/machine:writemem?address=D020&data=${borderColor.toString(16).padStart(2,'0')}${backgroundColor.toString(16).padStart(2,'0')}`),
      ultimateRequest('PUT',  `/v1/machine:writemem?address=D018&data=${d018Val.toString(16).padStart(2,'0')}`),
    ]);

    // Verify screen RAM matches colorbars
    const verifyScrRes = await ultimateRequest('GET', `/v1/machine:readmem?address=0400&length=${width * height}`);
    let scrMismatch = 0;
    for (let i = 0; i < width * height; i++) {
      if (verifyScrRes.body[i] !== screenBuf[i]) scrMismatch++;
    }

    // Verify color RAM
    const verifyColRes = await ultimateRequest('GET', `/v1/machine:readmem?address=D800&length=${width * height}`);
    let colMismatch = 0;
    for (let i = 0; i < width * height; i++) {
      if ((verifyColRes.body[i] & 0x0f) !== colorBuf[i]) colMismatch++;
    }

    // Stay paused — the import-verify test will read back while paused,
    // then resume + display for 5 seconds.

    if (scrMismatch === 0) {
      pass('colorbars screen RAM', `${width * height} bytes verified`);
    } else {
      fail('colorbars screen RAM', `${scrMismatch} mismatched bytes`);
    }
    if (colMismatch === 0) {
      pass('colorbars color RAM', `${width * height} bytes verified`);
    } else {
      fail('colorbars color RAM', `${colMismatch} mismatched bytes`);
    }

  } catch (err) {
    fail('push colorbars', err.message);
    try { await ultimateRequest('PUT', '/v1/machine:resume'); } catch {}
  }
}

async function testImportAndVerifyColorBars() {
  console.log('\n── Import & Verify Color Bars ──');
  if (!colorbars) { skip('import colorbars', 'colorbars.petmate not loaded'); return; }
  try {
    const expected = getColorbarsBuffers();

    // Machine is still paused from testPushColorBars — read back directly
    const [scrRes, colRes, regRes, d018Res] = await Promise.all([
      ultimateRequest('GET', `/v1/machine:readmem?address=0400&length=${expected.width * expected.height}`),
      ultimateRequest('GET', `/v1/machine:readmem?address=D800&length=${expected.width * expected.height}`),
      ultimateRequest('GET', '/v1/machine:readmem?address=D020&length=2'),
      ultimateRequest('GET', '/v1/machine:readmem?address=D018&length=1'),
    ]);
    // Now resume so the pattern is visible
    await ultimateRequest('PUT', '/v1/machine:resume');

    // Verify border/bg
    const border = regRes.body[0] & 0x0f;
    const bg     = regRes.body[1] & 0x0f;
    if (border === expected.borderColor && bg === expected.backgroundColor) {
      pass('colorbars registers', `border=${border} bg=${bg}`);
    } else {
      fail('colorbars registers', `expected border=${expected.borderColor} bg=${expected.backgroundColor}, got border=${border} bg=${bg}`);
    }

    // Verify screen matches
    let scrOk = true;
    for (let i = 0; i < expected.width * expected.height; i++) {
      if (scrRes.body[i] !== expected.screenBuf[i]) { scrOk = false; break; }
    }
    if (scrOk) {
      pass('colorbars import screen', 'matches expected pattern');
    } else {
      fail('colorbars import screen', 'screen RAM differs from expected');
    }

    // Verify color matches
    let colOk = true;
    for (let i = 0; i < expected.width * expected.height; i++) {
      if ((colRes.body[i] & 0x0f) !== expected.colorBuf[i]) { colOk = false; break; }
    }
    if (colOk) {
      pass('colorbars import color', 'matches expected pattern');
    } else {
      fail('colorbars import color', 'color RAM differs from expected');
    }

    // Now display the pattern for 5 seconds so it's visible on screen
    console.log('    (displaying for 5 seconds...)');
    await sleep(5000);
  } catch (err) {
    fail('import colorbars', err.message);
    try { await ultimateRequest('PUT', '/v1/machine:resume'); } catch {}
  }
}

async function testImportScreen() {
  console.log('\n── Import Screen (readmem round-trip) ──');
  try {
    await ultimateRequest('PUT', '/v1/machine:pause');

    const [screenBuf, colorBuf, borderBgBuf, d018Buf] = await Promise.all([
      ultimateRequest('GET', '/v1/machine:readmem?address=0400&length=1000'),
      ultimateRequest('GET', '/v1/machine:readmem?address=D800&length=1000'),
      ultimateRequest('GET', '/v1/machine:readmem?address=D020&length=2'),
      ultimateRequest('GET', '/v1/machine:readmem?address=D018&length=1'),
    ]);

    await ultimateRequest('PUT', '/v1/machine:resume');

    const allOk = [screenBuf, colorBuf, borderBgBuf, d018Buf].every(
      r => r.statusCode >= 200 && r.statusCode < 300
    );

    if (allOk) {
      const borderColor = borderBgBuf.body[0] & 0x0f;
      const bgColor = borderBgBuf.body[1] & 0x0f;
      const charSel = (d018Buf.body[0] >> 1) & 0x07;
      const charset = charSel === 3 ? 'lower' : 'upper';
      pass('import screen', `40x25 border=${borderColor} bg=${bgColor} charset=${charset}`);
      pass('screen RAM', `${screenBuf.body.length} bytes`);
      pass('color RAM', `${colorBuf.body.length} bytes`);
    } else {
      fail('import screen', 'one or more reads failed');
    }
  } catch (err) {
    fail('import screen', err.message);
    try { await ultimateRequest('PUT', '/v1/machine:resume'); } catch {}
  }
}

async function testPushScreen() {
  console.log('\n── Push Screen (writemem round-trip) ──');
  try {
    await ultimateRequest('PUT', '/v1/machine:pause');

    // Build a test screen: fill with screencode $13 (S), color 5 (green)
    const screenBuf = Buffer.alloc(1000, 0x13);
    const colorBuf  = Buffer.alloc(1000, 0x05);
    const borderColor = 6;  // blue
    const bgColor = 0;      // black

    await Promise.all([
      ultimateRequest('POST', '/v1/machine:writemem?address=0400', screenBuf),
      ultimateRequest('POST', '/v1/machine:writemem?address=D800', colorBuf),
      ultimateRequest('PUT',  `/v1/machine:writemem?address=D020&data=${borderColor.toString(16).padStart(2,'0')}${bgColor.toString(16).padStart(2,'0')}`),
      ultimateRequest('PUT',  '/v1/machine:writemem?address=D018&data=15'),  // upper charset
    ]);

    // Verify screen write
    const verifyScr = await ultimateRequest('GET', '/v1/machine:readmem?address=0400&length=1000');
    let scrOk = verifyScr.body.length === 1000;
    for (let i = 0; i < 1000 && scrOk; i++) {
      if (verifyScr.body[i] !== 0x13) scrOk = false;
    }

    // Verify color write
    const verifyCol = await ultimateRequest('GET', '/v1/machine:readmem?address=D800&length=1000');
    let colOk = verifyCol.body.length === 1000;
    for (let i = 0; i < 1000 && colOk; i++) {
      if ((verifyCol.body[i] & 0x0f) !== 0x05) colOk = false;
    }

    await ultimateRequest('PUT', '/v1/machine:resume');

    if (scrOk) {
      pass('push screen RAM', '1000 bytes verified');
    } else {
      fail('push screen RAM', 'mismatch in read-back');
    }
    if (colOk) {
      pass('push color RAM', '1000 bytes verified');
    } else {
      fail('push color RAM', 'mismatch in read-back');
    }
  } catch (err) {
    fail('push screen', err.message);
    try { await ultimateRequest('PUT', '/v1/machine:resume'); } catch {}
  }
}

async function testRunPrg() {
  console.log('\n── Run PRG ──');
  try {
    const prg = buildTestPrg(14, 6);  // light blue border, blue bg
    const res = await ultimateRequest('POST', '/v1/runners:run_prg', prg);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      pass('runners:run_prg', `sent ${prg.length} bytes (HTTP ${res.statusCode})`);
    } else {
      fail('runners:run_prg', `HTTP ${res.statusCode}`);
    }
    // Let the PRG execute before next test
    await sleep(2000);
  } catch (err) {
    fail('runners:run_prg', err.message);
  }
}

async function testSidPlay() {
  console.log('\n── SID Play ──');
  // Look for any .sid file in _tests/sids/
  const sidDir = path.join(TESTS, 'sids');
  const sidFiles = fs.existsSync(sidDir)
    ? fs.readdirSync(sidDir).filter(f => f.endsWith('.sid'))
    : [];

  if (sidFiles.length === 0) {
    skip('runners:sidplay', 'no .sid files in _tests/sids/');
    return;
  }

  const sidPath = path.join(sidDir, sidFiles[0]);
  try {
    const sidData = fs.readFileSync(sidPath);
    const res = await ultimateRequest('POST', '/v1/runners:sidplay', Buffer.from(sidData));
    if (res.statusCode >= 200 && res.statusCode < 300) {
      pass('runners:sidplay', `sent ${sidFiles[0]} (${sidData.length} bytes, HTTP ${res.statusCode})`);
    } else {
      fail('runners:sidplay', `HTTP ${res.statusCode}`);
    }
    // Let it play briefly
    await sleep(3000);
  } catch (err) {
    fail('runners:sidplay', err.message);
  }
}

async function testD64Mount() {
  console.log('\n── D64 Mount ──');
  // Look for a .d64 in _tests/
  const d64Files = fs.readdirSync(TESTS).filter(f => f.endsWith('.d64'));
  if (d64Files.length === 0) {
    skip('drives/A:mount', 'no .d64 files in _tests/');
    return;
  }

  const d64Path = path.join(TESTS, d64Files[0]);
  try {
    const d64Data = fs.readFileSync(d64Path);
    const res = await ultimateRequest('POST', '/v1/drives/A:mount?type=d64', Buffer.from(d64Data));
    if (res.statusCode >= 200 && res.statusCode < 300) {
      pass('drives/A:mount', `mounted ${d64Files[0]} (${d64Data.length} bytes, HTTP ${res.statusCode})`);
    } else {
      fail('drives/A:mount', `HTTP ${res.statusCode}`);
    }
  } catch (err) {
    fail('drives/A:mount', err.message);
  }
}

async function testKeyboardBuffer() {
  console.log('\n── Keyboard Buffer Inject ──');
  try {
    await ultimateRequest('PUT', '/v1/machine:reset');
    await sleep(3000);

    // Pause so BASIC doesn't consume the buffer before we can verify
    await ultimateRequest('PUT', '/v1/machine:pause');

    // Inject LOAD"$",8<CR> into keyboard buffer ($0277)
    // PETSCII: L=4C O=4F A=41 D=44 "=22 $=24 "=22 ,=2C 8=38 CR=0D
    const keybuf = [0x4C, 0x4F, 0x41, 0x44, 0x22, 0x24, 0x22, 0x2C, 0x38, 0x0D];
    const hexData = keybuf.map(b => b.toString(16).padStart(2, '0')).join('');
    const writeRes = await ultimateRequest('PUT', `/v1/machine:writemem?address=0277&data=${hexData}`);
    if (writeRes.statusCode >= 200 && writeRes.statusCode < 300) {
      pass('keyboard buffer write', `wrote ${keybuf.length} bytes to $0277`);
    } else {
      fail('keyboard buffer write', `HTTP ${writeRes.statusCode}`);
    }

    // Set buffer length ($00C6 = 10)
    const lenRes = await ultimateRequest('PUT', '/v1/machine:writemem?address=00C6&data=0a');
    if (lenRes.statusCode >= 200 && lenRes.statusCode < 300) {
      pass('keyboard buffer length', 'set $C6 = 10');
    } else {
      fail('keyboard buffer length', `HTTP ${lenRes.statusCode}`);
    }

    // Verify buffer contents while still paused
    const verifyRes = await ultimateRequest('GET', '/v1/machine:readmem?address=0277&length=10');
    let match = true;
    for (let i = 0; i < keybuf.length && i < verifyRes.body.length; i++) {
      if (verifyRes.body[i] !== keybuf[i]) { match = false; break; }
    }
    if (match) {
      pass('keyboard buffer verify', 'LOAD"$",8<CR> confirmed');
    } else {
      fail('keyboard buffer verify', 'mismatch');
    }

    // Resume — BASIC will now process the buffer and run LOAD"$",8
    await ultimateRequest('PUT', '/v1/machine:resume');

    // Wait for LOAD to finish, then inject LIST<CR>
    await sleep(3000);
    await ultimateRequest('PUT', '/v1/machine:pause');

    // PETSCII: L=4C I=49 S=53 T=54 CR=0D
    const listBuf = [0x4C, 0x49, 0x53, 0x54, 0x0D];
    const listHex = listBuf.map(b => b.toString(16).padStart(2, '0')).join('');
    const listRes = await ultimateRequest('PUT', `/v1/machine:writemem?address=0277&data=${listHex}`);
    await ultimateRequest('PUT', '/v1/machine:writemem?address=00C6&data=05');

    if (listRes.statusCode >= 200 && listRes.statusCode < 300) {
      pass('keyboard LIST inject', 'LIST<CR> queued');
    } else {
      fail('keyboard LIST inject', `HTTP ${listRes.statusCode}`);
    }

    await ultimateRequest('PUT', '/v1/machine:resume');
  } catch (err) {
    fail('keyboard buffer', err.message);
    try { await ultimateRequest('PUT', '/v1/machine:resume'); } catch {}
  }
}

async function testImportCharset() {
  console.log('\n── Import Charset ──');
  try {
    await ultimateRequest('PUT', '/v1/machine:pause');

    // Read $D018 and $DD00 to determine charset address
    const [d018Res, dd00Res] = await Promise.all([
      ultimateRequest('GET', '/v1/machine:readmem?address=D018&length=1'),
      ultimateRequest('GET', '/v1/machine:readmem?address=DD00&length=1'),
    ]);

    if (d018Res.statusCode < 200 || d018Res.statusCode >= 300 ||
        dd00Res.statusCode < 200 || dd00Res.statusCode >= 300) {
      fail('charset register read', 'could not read $D018/$DD00');
      await ultimateRequest('PUT', '/v1/machine:resume');
      return;
    }

    const vicBank = (3 - (dd00Res.body[0] & 0x03)) * 0x4000;
    const charOffset = ((d018Res.body[0] >> 1) & 0x07) * 0x0800;
    const charAddr = vicBank + charOffset;

    pass('charset address', `VIC bank=${vicBank.toString(16)} offset=${charOffset.toString(16)} → $${charAddr.toString(16).toUpperCase()}`);

    // Read 2048 bytes of character data
    const charRes = await ultimateRequest('GET', `/v1/machine:readmem?address=${charAddr.toString(16).toUpperCase()}&length=2048`);
    await ultimateRequest('PUT', '/v1/machine:resume');

    if (charRes.statusCode >= 200 && charRes.statusCode < 300 && charRes.body.length === 2048) {
      // Verify it looks like charset data (first char $00 = @, all 8 bytes
      // of char 32/space should be $00 in standard ROM)
      const spaceChar = charRes.body.slice(32 * 8, 33 * 8);
      const isBlank = spaceChar.every(b => b === 0);
      pass('charset read', `2048 bytes from $${charAddr.toString(16).toUpperCase()} (space char blank=${isBlank})`);
    } else {
      fail('charset read', `${charRes.body.length} bytes (expected 2048)`);
    }
  } catch (err) {
    fail('import charset', err.message);
    try { await ultimateRequest('PUT', '/v1/machine:resume'); } catch {}
  }
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n═══ Petmate Ultimate Integration Test ═══`);
  console.log(`  Target: ${BASE_URL}`);
  console.log(`  Time:   ${new Date().toISOString()}`);

  // 1. Check connectivity first — bail if unreachable
  const reachable = await testConnectivity();
  if (!reachable) {
    console.log('\n  ✗ Ultimate device unreachable — aborting remaining tests.');
    console.log(`    Make sure the device is powered on and accessible at ${BASE_URL}\n`);
    process.exit(1);
  }

  // 2. Reset to a known state
  await testReset();

  // 3. Pause / Resume
  await testPauseResume();

  // 4. Read memory
  await testReadMem();

  // 5. Write memory (hex query param — small writes)
  await testWriteMemSmall();

  // 6. Write memory (binary POST — bulk writes)
  await testWriteMemBinary();

  // 7. Full screen import (read all screen/color/registers)
  await testImportScreen();

  // 8. Full screen push (write all screen/color/registers + verify)
  await testPushScreen();

  // 9. Push color bars test pattern + verify
  await testPushColorBars();

  // 10. Import back and verify against expected data
  await testImportAndVerifyColorBars();

  // 11. Run PRG
  await testRunPrg();

  // 12. SID playback
  await testSidPlay();

  // 13. D64 mount
  await testD64Mount();

  // 14. Keyboard buffer injection
  await testKeyboardBuffer();

  // 15. Charset import
  await testImportCharset();

  // ── Summary ──
  console.log(`\n═══ SUMMARY ═══`);
  console.log(`  Passed:  ${totalPass}`);
  console.log(`  Failed:  ${totalFail}`);
  console.log(`  Skipped: ${totalSkip}`);
  console.log(`  Total:   ${totalPass + totalFail + totalSkip}\n`);

  process.exit(totalFail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
