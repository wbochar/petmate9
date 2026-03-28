#!/usr/bin/env node
/**
 * Petmate Export / Import Round-Trip Test
 *
 * Loads the first 8 frames from computers_097a.petmate and:
 *   1. Exports each frame to every supported format (.c, .asm, .bas, .seq, .pet, .json, .prg)
 *   2. Re-imports from .c and .seq (the formats with importers)
 *   3. Writes a new .petmate workspace from the re-imported data
 *
 * Formats that require Electron, special charsets, or hardware are skipped:
 *   .png, .gif  – need electron.nativeImage
 *   .d64        – only works with dirart charset
 *   .cbase      – only works with prompt-* named frames
 *   .player     – needs c64jasm + asset bundle
 *   .ult        – sends to hardware
 */

const fs   = require('fs');
const path = require('path');

const ROOT      = path.resolve(__dirname, '..');
const SRC_FILE  = path.join(ROOT, '_defaults', 'computers_097a.petmate');
const EXPORTS   = path.join(__dirname, 'exports');
const IMPORTS   = path.join(__dirname, 'imports');
const TEMPLATE  = path.join(ROOT, 'assets', 'template.prg');

// ─── Load source petmate ───────────────────────────────────────────
const petmate = JSON.parse(fs.readFileSync(SRC_FILE, 'utf-8'));
const frames  = petmate.framebufs.slice(0, 8);   // first 8 only

const results = { exports: {}, imports: {} };

// ═══════════════════════════════════════════════════════════════════
//  EXPORT HELPERS
// ═══════════════════════════════════════════════════════════════════

// ─── .c  (MarqC) ──────────────────────────────────────────────────
function exportMarqC(fb, idx) {
  const { width, height, framebuf, backgroundColor, borderColor, charset } = fb;
  const num = String(idx).padStart(4, '0');
  const lines = [];
  lines.push(`unsigned char frame${num}[]={// border,bg,chars,colors`);
  const bytes = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) bytes.push(framebuf[y][x].code);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) bytes.push(framebuf[y][x].color);
  lines.push(`${borderColor},${backgroundColor},`);
  chunkArray(bytes, width).forEach((row, i, a) => {
    lines.push(i < a.length - 1 ? row.join(',') + ',' : row.join(','));
  });
  lines.push('};');
  lines.push(`// META: ${width} ${height} C64 ${charset}`);
  return lines.join('\n') + '\n';
}

// ─── .asm (KickAss syntax) ────────────────────────────────────────
function exportAsm(fb) {
  const { width, height, framebuf, backgroundColor, borderColor, name } = fb;
  const label = (name || 'untitled').replace(/[^a-zA-Z0-9_]/g, '_');
  const lines = [];
  lines.push(`${label}:`);
  const bytes = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) bytes.push(framebuf[y][x].code);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) bytes.push(framebuf[y][x].color);
  lines.push(`.byte ${borderColor},${backgroundColor}`);
  chunkArray(bytes, width).forEach(row => {
    lines.push(`.byte ${row.join(',')}`);
  });
  return lines.join('\n') + '\n';
}

// ─── .bas (BASIC) ─────────────────────────────────────────────────
function exportBasic(fb) {
  const { width, height, framebuf, backgroundColor, borderColor, charset } = fb;
  const charsetBits = charset === 'upper' ? 0x15 : 0x17;
  const initLines = [
    `10 rem created with petmate`,
    `20 poke 53280,${borderColor}`,
    `30 poke 53281,${backgroundColor}`,
    `40 poke 53272,${charsetBits}`,
    `100 for i = 1024 to 1024 + 999`,
    `110 read a: poke i,a: next i`,
    `120 for i = 55296 to 55296 + 999`,
    `130 read a: poke i,a: next i`,
    `140 goto 140`,
  ];
  const bytes = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) bytes.push(framebuf[y][x].code);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) bytes.push(framebuf[y][x].color);
  const dataLines = chunkArray(bytes, 16).map((row, i) =>
    `${i + 200} data ${row.join(',')}`
  );
  return initLines.join('\n') + '\n' + dataLines.join('\n') + '\n';
}

// ─── .seq (SEQ binary) ───────────────────────────────────────────
const SEQ_COLORS = [
  0x90, 0x05, 0x1c, 0x9f, 0x9c, 0x1e, 0x1f, 0x9e,
  0x81, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0x9b
];

function exportSeq(fb) {
  const { width, height, framebuf, charset } = fb;
  const bytes = [];
  let currcolor = -1;
  let currev = false;

  // Insert clear screen
  bytes.push(0x93);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const byte_color = framebuf[y][x].color;
      if (byte_color !== currcolor) {
        bytes.push(SEQ_COLORS[byte_color]);
        currcolor = byte_color;
      }
      let byte_char = framebuf[y][x].code;
      if (byte_char >= 0x100) byte_char = 0x20;

      if (byte_char >= 0x80) {
        if (!currev) { bytes.push(0x12); currev = true; }
        byte_char &= 0x7f;
      } else {
        if (currev) { bytes.push(0x92); currev = false; }
      }

      // Screen code → PETSCII conversion
      if (byte_char >= 0 && byte_char <= 0x1f)       byte_char += 0x40;
      else if (byte_char >= 0x40 && byte_char <= 0x5d) byte_char += 0x80;
      else if (byte_char === 0x5e)                     byte_char = 0xff;
      else if (byte_char === 0x5f)                     byte_char = 0xdf;
      else if (byte_char >= 0x60 && byte_char <= 0x7f) byte_char += 0x40;

      bytes.push(byte_char);
    }
    // Insert CR between rows (except last)
    if (y < height - 1) {
      bytes.push(currev ? 0x0d : 0x8d);
    }
  }
  return Buffer.from(bytes);
}

// ─── .pet (PET binary) ───────────────────────────────────────────
function exportPet(fb) {
  const { width, height, framebuf, backgroundColor, borderColor, charset } = fb;
  const bytes = [];
  bytes.push(width, height, borderColor, backgroundColor);
  bytes.push(charset === 'lower' ? 0 : 1);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) bytes.push(framebuf[y][x].code);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) bytes.push(framebuf[y][x].color);
  return Buffer.from(bytes);
}

// ─── .json (Petmate JSON export) ─────────────────────────────────
function exportJson(fb) {
  const { width, height, framebuf, backgroundColor, borderColor, borderOn, charset, name } = fb;
  const screencodes = [], colors = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      screencodes.push(framebuf[y][x].code);
      colors.push(framebuf[y][x].color);
    }
  return JSON.stringify({
    version: 1,
    framebufs: [{
      width, height, backgroundColor, borderColor, borderOn,
      charset: charset || 'upper',
      name: name || undefined,
      screencodes, colors
    }],
    charsets: {}
  });
}

// ─── .prg (C64 executable, 40x25 upper/lower only) ──────────────
function exportPrg(fb) {
  const { width, height, framebuf, backgroundColor, borderColor, charset } = fb;
  if (width !== 40 || height !== 25) return null;
  if (charset !== 'upper' && charset !== 'lower') return null;

  const tmpl = fs.readFileSync(TEMPLATE);
  const buf = Buffer.from(tmpl);

  // Patch STA $d020
  const d020 = buf.indexOf(Buffer.from([0x8d, 0x20, 0xd0]));
  if (d020 > 0) buf[d020 - 1] = borderColor;

  // Patch STA $d021
  const d021 = buf.indexOf(Buffer.from([0x8d, 0x21, 0xd0]));
  if (d021 > 0) buf[d021 - 1] = backgroundColor;

  // Patch charset
  if (charset === 'lower') {
    const d018 = buf.indexOf(Buffer.from([0x8d, 0x18, 0xd0]));
    if (d018 > 0) buf[d018 - 1] = 0x17;
  }

  let scOff = 0x62;
  let colOff = scOff + 1000;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      buf[scOff++]  = framebuf[y][x].code;
      buf[colOff++] = framebuf[y][x].color;
    }
  }
  return buf;
}

// ═══════════════════════════════════════════════════════════════════
//  IMPORT HELPERS
// ═══════════════════════════════════════════════════════════════════

// ─── Import .c (MarqC) ──────────────────────────────────────────
function importMarqC(filename) {
  const content = fs.readFileSync(filename, 'utf-8');
  const lines = content.split('\n');
  let width = 40, height = 25, charset = 'upper';
  let allFrames = [];
  let bytes = [];

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (/unsigned char (.*)=\{/.test(line)) {
      bytes = [];
      continue;
    }
    if (/};/.test(line)) {
      allFrames.push(bytes);
      bytes = [];
      continue;
    }
    const metaMatch = line.match(/^\/\/ META:\s*(\d+)\s+(\d+)\s+\S+\s+(.*)/);
    if (metaMatch) {
      width   = parseInt(metaMatch[1]);
      height  = parseInt(metaMatch[2]);
      charset = metaMatch[3].trim();
      continue;
    }
    let str = line.trim();
    if (!str) continue;
    if (str.endsWith(',')) str = str.slice(0, -1);
    if (str.startsWith('//')) continue;
    try {
      const arr = JSON.parse(`[${str}]`);
      arr.forEach(b => bytes.push(b));
    } catch (_) {}
  }

  return allFrames.map(frame => {
    const nb = width * height;
    const borderColor = frame[0];
    const backgroundColor = frame[1];
    const charcodes = frame.slice(2, nb + 2);
    const colors    = frame.slice(nb + 2, nb * 2 + 2);
    const framebuf  = [];
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        row.push({ code: charcodes[i] || 32, color: colors[i] || 14 });
      }
      framebuf.push(row);
    }
    const basename = path.basename(filename, '.c');
    return {
      width, height, backgroundColor, borderColor,
      borderOn: false, charset,
      name: `import_c_${basename}`,
      framebuf,
      zoom: { zoomLevel: 2, alignment: 'left' }
    };
  });
}

// ─── Import .seq ────────────────────────────────────────────────
const DEFAULT_BG = 6, DEFAULT_BORDER = 14;

function importSeq(filename) {
  const seqFile = fs.readFileSync(filename);
  const screenW = 40, maxH = 500;

  // Virtual C64 screen state
  let screen = [];
  for (let y = 0; y < maxH; y++) {
    const row = [];
    for (let x = 0; x < screenW; x++) row.push({ code: 0x20, color: DEFAULT_BG });
    screen.push(row);
  }
  let cx = 0, cy = 0, cursorColor = 0, revsOn = false;

  function cls() {
    for (let y = 0; y < maxH; y++)
      for (let x = 0; x < screenW; x++)
        screen[y][x] = { code: 0x20, color: DEFAULT_BG };
    cx = 0; cy = 0;
  }

  function scrollUp() {
    for (let y = 1; y < maxH; y++) screen[y - 1] = screen[y];
    screen[maxH - 1] = Array.from({ length: screenW }, () => ({ code: 0x20, color: DEFAULT_BG }));
  }

  function cursorRight() {
    if (cx < screenW - 1) { cx++; }
    else if (cy < maxH - 1) { cy++; cx = 0; }
    else { scrollUp(); cx = 0; cy = maxH - 1; }
  }
  function cursorDown() { if (cy < maxH - 1) cy++; else scrollUp(); }
  function cursorUp()   { if (cy > 0) cy--; }
  function cursorLeft() {
    if (cx > 0) cx--;
    else if (cy > 0) { cx = screenW - 1; cy--; }
  }
  function cr() { cursorDown(); revsOn = false; cx = 0; }
  function del() { cursorLeft(); scrnOut(0x20, false); cursorLeft(); }

  function scrnOut(b, lastByte) {
    let c = b;
    if (revsOn) c += 0x80;
    screen[cy][cx] = { code: c, color: cursorColor };
    if (!lastByte) cursorRight();
  }

  for (let i = 0; i < seqFile.length; i++) {
    const c = seqFile[i];
    const last = i === seqFile.length - 1;
    const sc = (v) => scrnOut(v, last);

    switch (c) {
      case 0x05: cursorColor = 1; break;
      case 0x0d: case 0x8d: cr(); break;
      case 0x11: cursorDown(); break;
      case 0x12: revsOn = true; break;
      case 0x13: cx = 0; cy = 0; break;
      case 0x14: del(); break;
      case 0x1c: cursorColor = 2; break;
      case 0x1d: cursorRight(); break;
      case 0x1e: cursorColor = 5; break;
      case 0x1f: cursorColor = 6; break;
      case 0x81: cursorColor = 8; break;
      case 0x90: cursorColor = 0; break;
      case 0x91: cursorUp(); break;
      case 0x92: revsOn = false; break;
      case 0x93: cls(); break;
      case 0x95: cursorColor = 9; break;
      case 0x96: cursorColor = 10; break;
      case 0x97: cursorColor = 11; break;
      case 0x98: cursorColor = 12; break;
      case 0x99: cursorColor = 13; break;
      case 0x9a: cursorColor = 14; break;
      case 0x9b: cursorColor = 15; break;
      case 0x9c: cursorColor = 4; break;
      case 0x9d: cursorLeft(); break;
      case 0x9e: cursorColor = 7; break;
      case 0x9f: cursorColor = 3; break;
      case 0xff: sc(94); break;
      default:
        if (c >= 0x20 && c < 0x40)  sc(c);
        if (c >= 0x40 && c <= 0x5f) sc(c - 0x40);
        if (c >= 0x60 && c <= 0x7f) sc(c - 0x20);
        if (c >= 0xa0 && c <= 0xbf) sc(c - 0x40);
        if (c >= 0xc0 && c <= 0xfe) sc(c - 0x80);
        break;
    }
  }

  const finalH = cy + 1;
  const basename = path.basename(filename, '.seq');
  return {
    width: screenW, height: finalH,
    backgroundColor: DEFAULT_BG, borderColor: DEFAULT_BORDER,
    borderOn: false, charset: 'upper',
    name: `import_seq_${basename}`,
    framebuf: screen.slice(0, finalH),
    zoom: { zoomLevel: 2, alignment: 'left' }
  };
}

// ═══════════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════════

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function safe(fn, label) {
  try { fn(); return true; }
  catch (e) { console.error(`  FAIL ${label}: ${e.message}`); return false; }
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════

console.log(`\nPetmate Export / Import Round-Trip Test`);
console.log(`Source: ${SRC_FILE}`);
console.log(`Frames: ${frames.length}\n`);

const importedFrames = [];
let totalExports = 0, totalFails = 0;

frames.forEach((fb, idx) => {
  const tag = fb.name || `frame${idx}`;
  console.log(`── Frame ${idx}: ${tag}  (${fb.width}x${fb.height}, charset=${fb.charset}) ──`);

  // ── .c ──
  if (safe(() => {
    const data = exportMarqC(fb, idx);
    const file = path.join(EXPORTS, `${tag}.c`);
    fs.writeFileSync(file, data, 'utf-8');
    console.log(`  ✓ .c   → ${path.basename(file)}  (${data.length} bytes)`);
    totalExports++;

    // Round-trip import
    const imported = importMarqC(file);
    if (imported.length > 0) {
      importedFrames.push({ source: 'c', tag, frame: imported[0] });
      console.log(`  ✓ .c   ← reimported (${imported[0].width}x${imported[0].height})`);
    }
  }, `.c export ${tag}`)) {} else totalFails++;

  // ── .asm ──
  if (safe(() => {
    const data = exportAsm(fb);
    const file = path.join(EXPORTS, `${tag}.asm`);
    fs.writeFileSync(file, data, 'utf-8');
    console.log(`  ✓ .asm → ${path.basename(file)}  (${data.length} bytes)`);
    totalExports++;
  }, `.asm export ${tag}`)) {} else totalFails++;

  // ── .bas ──
  if (safe(() => {
    const data = exportBasic(fb);
    const file = path.join(EXPORTS, `${tag}.bas`);
    fs.writeFileSync(file, data, 'utf-8');
    console.log(`  ✓ .bas → ${path.basename(file)}  (${data.length} bytes)`);
    totalExports++;
  }, `.bas export ${tag}`)) {} else totalFails++;

  // ── .seq ──
  if (safe(() => {
    const buf = exportSeq(fb);
    const file = path.join(EXPORTS, `${tag}.seq`);
    fs.writeFileSync(file, buf);
    console.log(`  ✓ .seq → ${path.basename(file)}  (${buf.length} bytes)`);
    totalExports++;

    // Round-trip import
    const imported = importSeq(file);
    importedFrames.push({ source: 'seq', tag, frame: imported });
    console.log(`  ✓ .seq ← reimported (${imported.width}x${imported.height})`);
  }, `.seq export ${tag}`)) {} else totalFails++;

  // ── .pet ──
  if (safe(() => {
    const buf = exportPet(fb);
    const file = path.join(EXPORTS, `${tag}.pet`);
    fs.writeFileSync(file, buf);
    console.log(`  ✓ .pet → ${path.basename(file)}  (${buf.length} bytes)`);
    totalExports++;
  }, `.pet export ${tag}`)) {} else totalFails++;

  // ── .json ──
  if (safe(() => {
    const data = exportJson(fb);
    const file = path.join(EXPORTS, `${tag}.json`);
    fs.writeFileSync(file, data, 'utf-8');
    console.log(`  ✓ .json→ ${path.basename(file)}  (${data.length} bytes)`);
    totalExports++;
  }, `.json export ${tag}`)) {} else totalFails++;

  // ── .prg (C64 40x25 upper/lower only) ──
  if (fb.width === 40 && fb.height === 25 &&
      (fb.charset === 'upper' || fb.charset === 'lower')) {
    if (safe(() => {
      const buf = exportPrg(fb);
      if (buf) {
        const file = path.join(EXPORTS, `${tag}.prg`);
        fs.writeFileSync(file, buf);
        console.log(`  ✓ .prg → ${path.basename(file)}  (${buf.length} bytes)`);
        totalExports++;
      }
    }, `.prg export ${tag}`)) {} else totalFails++;
  } else {
    console.log(`  - .prg   skipped (not 40x25 C64 upper/lower)`);
  }

  // ── Formats skipped for all frames ──
  console.log(`  - .png   skipped (requires Electron nativeImage)`);
  console.log(`  - .gif   skipped (requires Electron nativeImage)`);
  console.log(`  - .d64   skipped (requires dirart charset)`);
  console.log(`  - .cbase skipped (requires prompt-* frame names)`);
  console.log(`  - .player skipped (requires c64jasm + assets)`);
  console.log(`  - .ult   skipped (sends to hardware)`);
  console.log('');
});

// ═══════════════════════════════════════════════════════════════════
//  BUILD REIMPORTED .petmate
// ═══════════════════════════════════════════════════════════════════

console.log(`── Building reimported workspace ──`);
console.log(`  Total reimported frames: ${importedFrames.length}`);

const reimported = {
  version: 3,
  screens: importedFrames.map((_, i) => i),
  framebufs: importedFrames.map(f => f.frame),
  customFonts: {}
};

const reimportPath = path.join(IMPORTS, 'reimported_computers.petmate');
fs.writeFileSync(reimportPath, JSON.stringify(reimported), 'utf-8');
console.log(`  ✓ Wrote ${reimportPath}`);
console.log(`    ${reimported.framebufs.length} frames (${importedFrames.filter(f => f.source === 'c').length} from .c, ${importedFrames.filter(f => f.source === 'seq').length} from .seq)`);

// ═══════════════════════════════════════════════════════════════════
//  SUMMARY
// ═══════════════════════════════════════════════════════════════════

console.log(`\n═══ SUMMARY ═══`);
console.log(`  Total exports:  ${totalExports}`);
console.log(`  Total failures: ${totalFails}`);
console.log(`  Reimported:     ${importedFrames.length} frames → ${reimportPath}`);

// List all generated files
const exportFiles = fs.readdirSync(EXPORTS).sort();
console.log(`\n  Export files (${exportFiles.length}):`);
exportFiles.forEach(f => {
  const stat = fs.statSync(path.join(EXPORTS, f));
  console.log(`    ${f.padEnd(30)} ${stat.size.toLocaleString().padStart(8)} bytes`);
});

const importFiles = fs.readdirSync(IMPORTS).sort();
console.log(`\n  Import files (${importFiles.length}):`);
importFiles.forEach(f => {
  const stat = fs.statSync(path.join(IMPORTS, f));
  console.log(`    ${f.padEnd(40)} ${stat.size.toLocaleString().padStart(8)} bytes`);
});

process.exit(totalFails > 0 ? 1 : 0);
