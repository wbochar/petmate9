#!/usr/bin/env node
// convert-and-verify.js — Convert test PNGs through pet9scii and verify results
//
// 1. ROM dump verification:
//    - Reads each ROM dump PNG
//    - Runs pet9scii conversion (no dithering, ssimWeight=0.5)
//    - Compares each cell's screencode against the expected ROM position
//    - Reports pass/fail per image and per character
//
// 2. Colour bars analysis:
//    - Converts the blended colour bars PNG
//    - Prints what character + colour the converter chose for each bar column
//    - Saves results as a .petmate workspace for visual inspection
//
// Usage:  node convert-and-verify.js [--quick] [--ssim <0-100>]
//   --quick   only test a subset (fg on black, bg on white)
//   --ssim N  override SSIM weight (default 50)

'use strict';

const { PNG }  = require('pngjs');
const fs       = require('fs');
const path     = require('path');
const {
  PALETTE, COLOR_NAMES,
  convertRgba,
  createPetmateWorkspace,
  getLuminanceOrder,
  buildLabPalette,
} = require('./pet9scii-core');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const ROM_PATH       = path.join(__dirname, '..', '..', 'assets', 'c64-charset-upper.bin');
const ROM_DUMP_DIR   = path.join(__dirname, 'output', 'rom-dump');
const COLOR_BARS_DIR = path.join(__dirname, 'output', 'color-bars');
const RESULTS_DIR    = path.join(__dirname, 'output', 'results');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args      = process.argv.slice(2);
const quickMode = args.includes('--quick');
const ssimIdx   = args.indexOf('--ssim');
const ssimPct   = ssimIdx >= 0 ? parseInt(args[ssimIdx + 1], 10) : 50;
const ssimWeight = ssimPct / 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

function loadCharsetRom(p) { return Array.from(new Uint8Array(fs.readFileSync(p))); }

function readPng(filePath) {
  const buf = fs.readFileSync(filePath);
  return PNG.sync.read(buf);
}

/** Build a flat Uint8Array of RGBA pixels from a pngjs PNG object */
function pngToRgba(png) {
  // pngjs stores data as a Buffer of RGBA — just return it.
  return new Uint8Array(png.data);
}

// ---------------------------------------------------------------------------
// ROM dump verification
// ---------------------------------------------------------------------------

function verifyRomDump(fontBits, fgIdx, bgIdx) {
  const filename = `rom-fg${fgIdx}-bg${bgIdx}.png`;
  const filePath = path.join(ROM_DUMP_DIR, filename);
  if (!fs.existsSync(filePath)) return null;

  const png  = readPng(filePath);
  const rgba = pngToRgba(png);
  const cols = png.width / 8;   // 16
  const rows = png.height / 8;  // 16

  // Run conversion with 'none' dithering (input is pixel-perfect)
  const result = convertRgba(rgba, png.width, png.height, fontBits, PALETTE, bgIdx, 'none', ssimWeight);

  let matches   = 0;
  let mismatches = [];

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const expectedCode = cy * 16 + cx;
      const cell = result.framebuf[cy][cx];

      // For pixel-perfect input, code should match the ROM position
      // and colour should be fgIdx (unless the char is all-background,
      // i.e. blank — code 0x20/0xa0 etc. where shape is all-zero or all-one)
      if (cell.code === expectedCode) {
        matches++;
      } else {
        mismatches.push({
          row: cy, col: cx,
          expected: expectedCode,
          got: cell.code,
          gotColor: cell.color,
        });
      }
    }
  }

  return {
    filename, fgIdx, bgIdx,
    total: 256, matches,
    mismatches,
    framebuf: result.framebuf,
    backgroundColor: result.backgroundColor,
  };
}

// ---------------------------------------------------------------------------
// Colour bars analysis
// ---------------------------------------------------------------------------

function analyzeColorBars(fontBits) {
  const barsPath = path.join(COLOR_BARS_DIR, 'color-bars-blended.png');
  const infoPath = path.join(COLOR_BARS_DIR, 'color-bars-info.json');
  if (!fs.existsSync(barsPath) || !fs.existsSync(infoPath)) {
    console.error('Colour bars PNG or info JSON not found. Run generate-test-images.js first.');
    return null;
  }

  const png     = readPng(barsPath);
  const rgba    = pngToRgba(png);
  const barInfo = JSON.parse(fs.readFileSync(infoPath, 'utf-8')).barInfo;

  const cols = png.width / 8;   // 31
  const rows = png.height / 8;  // 25

  // Use black background, no dithering — to see how the converter handles raw colours
  const bgIdx = 0;
  const result = convertRgba(rgba, png.width, png.height, fontBits, PALETTE, bgIdx, 'none', ssimWeight);

  // Since each bar is 8px wide = 1 character column, all 25 rows in a column
  // should convert to the same thing (solid colour → solid tile).
  // Report the first row's result per column and note any row variance.
  const columnResults = [];
  for (let cx = 0; cx < cols; cx++) {
    const codes  = new Set();
    const colors = new Set();
    for (let cy = 0; cy < rows; cy++) {
      codes.add(result.framebuf[cy][cx].code);
      colors.add(result.framebuf[cy][cx].color);
    }
    const cell = result.framebuf[0][cx];
    columnResults.push({
      bar: cx,
      code: cell.code,
      codeHex: '0x' + cell.code.toString(16).padStart(2, '0'),
      color: cell.color,
      colorName: COLOR_NAMES[cell.color],
      consistent: codes.size === 1 && colors.size === 1,
      uniqueCodes: codes.size,
      uniqueColors: colors.size,
      barMeta: barInfo[cx] || null,
    });
  }

  return {
    framebuf: result.framebuf,
    backgroundColor: bgIdx,
    width: cols,
    height: rows,
    columnResults,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

ensureDir(RESULTS_DIR);

const fontBits = loadCharsetRom(ROM_PATH);
console.log(`pet9scii conversion test  (ssimWeight=${ssimPct}%)\n`);

// ===== ROM dump verification =====
console.log('=== ROM Dump Verification ===\n');

const romResults   = [];
let totalTests     = 0;
let totalMatches   = 0;
let totalMismatches = 0;

const combos = [];
if (quickMode) {
  for (let fg = 1; fg < 16; fg++) combos.push([fg, 0]);
  for (let bg = 0; bg < 16; bg++) { if (bg !== 1) combos.push([1, bg]); }
} else {
  for (let fg = 0; fg < 16; fg++) {
    for (let bg = 0; bg < 16; bg++) {
      if (fg !== bg) combos.push([fg, bg]);
    }
  }
}

for (const [fg, bg] of combos) {
  process.stdout.write(`  fg=${fg.toString().padStart(2)} bg=${bg.toString().padStart(2)} (${COLOR_NAMES[fg]}/${COLOR_NAMES[bg]}) ... `);
  const r = verifyRomDump(fontBits, fg, bg);
  if (!r) { console.log('SKIP (png not found)'); continue; }

  romResults.push(r);
  totalTests     += r.total;
  totalMatches   += r.matches;
  totalMismatches += r.mismatches.length;

  if (r.mismatches.length === 0) {
    console.log(`PASS  (${r.matches}/256)`);
  } else {
    console.log(`FAIL  (${r.matches}/256, ${r.mismatches.length} mismatches)`);
    // Show first few mismatches
    r.mismatches.slice(0, 5).forEach(m => {
      console.log(`    char ${m.expected} (0x${m.expected.toString(16).padStart(2,'0')}) → got ${m.got} (0x${m.got.toString(16).padStart(2,'0')}) color=${m.gotColor}`);
    });
    if (r.mismatches.length > 5) console.log(`    ... and ${r.mismatches.length - 5} more`);
  }
}

console.log(`\nROM dump summary: ${totalMatches}/${totalTests} cells matched (${(totalMatches/totalTests*100).toFixed(1)}%)`);
console.log(`  ${romResults.filter(r => r.mismatches.length === 0).length}/${romResults.length} images fully correct\n`);

// Save first ROM result as a .petmate for inspection
if (romResults.length > 0) {
  const first = romResults[0];
  const ws = createPetmateWorkspace([{
    width: 16, height: 16,
    backgroundColor: first.backgroundColor,
    name: `rom_fg${first.fgIdx}_bg${first.bgIdx}`,
    framebuf: first.framebuf,
  }]);
  const wsPath = path.join(RESULTS_DIR, `rom-fg${first.fgIdx}-bg${first.bgIdx}.petmate`);
  fs.writeFileSync(wsPath, JSON.stringify(ws));
  console.log(`  Sample petmate saved: ${wsPath}`);
}

// ===== Colour bars analysis =====
console.log('\n=== Colour Bars Analysis ===\n');

const barsResult = analyzeColorBars(fontBits);
if (barsResult) {
  console.log('Column | Type   | Input Colour             | → Code   | Color           | Consistent');
  console.log('-------|--------|--------------------------|----------|-----------------|----------');

  for (const col of barsResult.columnResults) {
    const meta = col.barMeta;
    let inputDesc;
    if (!meta) {
      inputDesc = '(unknown)';
    } else if (meta.type === 'pure') {
      inputDesc = `${meta.colorName} (idx=${meta.colorIdx})`;
    } else {
      inputDesc = `50% ${meta.leftName} + ${meta.rightName}`;
    }

    console.log(
      `  ${col.bar.toString().padStart(2)}   | ${(meta?.type || '?').padEnd(6)} | ` +
      `${inputDesc.padEnd(24)} | ${col.codeHex.padEnd(8)} | ` +
      `${col.colorName.padEnd(15)} | ${col.consistent ? 'yes' : `no (${col.uniqueCodes}c/${col.uniqueColors}clr)`}`
    );
  }

  // Save as petmate
  const ws = createPetmateWorkspace([{
    width: barsResult.width,
    height: barsResult.height,
    backgroundColor: barsResult.backgroundColor,
    name: 'color_bars_blended',
    framebuf: barsResult.framebuf,
  }]);
  const wsPath = path.join(RESULTS_DIR, 'color-bars-blended.petmate');
  fs.writeFileSync(wsPath, JSON.stringify(ws));
  console.log(`\n  Petmate file saved: ${wsPath}`);
}

// ===== Detailed mismatch report =====
const mismatchReport = romResults
  .filter(r => r.mismatches.length > 0)
  .map(r => ({
    file: r.filename,
    fg: r.fgIdx, bg: r.bgIdx,
    matchRate: `${r.matches}/256`,
    mismatches: r.mismatches,
  }));

if (mismatchReport.length > 0) {
  const reportPath = path.join(RESULTS_DIR, 'rom-mismatch-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(mismatchReport, null, 2));
  console.log(`\n  Mismatch report saved: ${reportPath}`);
}

console.log('\nDone.');
