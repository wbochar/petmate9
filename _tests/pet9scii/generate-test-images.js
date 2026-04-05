#!/usr/bin/env node
// generate-test-images.js — Create pixel-perfect test PNGs for pet9scii converter
//
// 1. ROM dump PNGs: all 256 C64 uppercase chars in a 16×16 grid,
//    one image per foreground/background colour combination (skipping fg==bg).
//
// 2. Colour bars PNG: 16 C64 palette colours in luminance order,
//    with 50%-blend bars between adjacent colours.
//
// Usage:  node generate-test-images.js [--quick]
//   --quick  only generates a small subset of ROM dumps (fg on black, bg on white)

'use strict';

const { PNG } = require('pngjs');
const fs   = require('fs');
const path = require('path');
const { PALETTE, COLOR_NAMES, getLuminanceOrder } = require('./pet9scii-core');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const ROM_PATH       = path.join(__dirname, '..', '..', 'assets', 'c64-charset-upper.bin');
const OUT_DIR        = path.join(__dirname, 'output');
const ROM_DUMP_DIR   = path.join(OUT_DIR, 'rom-dump');
const COLOR_BARS_DIR = path.join(OUT_DIR, 'color-bars');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

function loadCharsetRom(romPath) {
  const buf = fs.readFileSync(romPath);
  return Array.from(new Uint8Array(buf));
}

function setPixel(png, x, y, r, g, b) {
  const idx = (y * png.width + x) << 2;
  png.data[idx]     = r;
  png.data[idx + 1] = g;
  png.data[idx + 2] = b;
  png.data[idx + 3] = 255;
}

function writePng(png, filePath) {
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

// ---------------------------------------------------------------------------
// ROM dump PNG generator
// ---------------------------------------------------------------------------

/**
 * Render all 256 chars in a 16×16 grid (128×128 px) using the given fg/bg.
 * Character at grid position (row, col) = screencode row*16 + col.
 */
function generateRomDumpPng(fontBits, fgIdx, bgIdx) {
  const fg = PALETTE[fgIdx];
  const bg = PALETTE[bgIdx];
  const W  = 128;  // 16 chars × 8px
  const H  = 128;
  const png = new PNG({ width: W, height: H });

  for (let charIdx = 0; charIdx < 256; charIdx++) {
    const gridCol = charIdx & 15;       // charIdx % 16
    const gridRow = charIdx >> 4;       // charIdx / 16
    for (let py = 0; py < 8; py++) {
      const byte = fontBits[charIdx * 8 + py];
      for (let px = 0; px < 8; px++) {
        const bit = (byte >> (7 - px)) & 1;
        const c = bit ? fg : bg;
        setPixel(png, gridCol * 8 + px, gridRow * 8 + py, c.r, c.g, c.b);
      }
    }
  }
  return png;
}

// ---------------------------------------------------------------------------
// Colour bars PNG generator
// ---------------------------------------------------------------------------

function fillBar(png, x0, barWidth, colour) {
  for (let y = 0; y < png.height; y++) {
    for (let x = x0; x < x0 + barWidth; x++) {
      setPixel(png, x, y, colour.r, colour.g, colour.b);
    }
  }
}

/**
 * 31 bars total: 16 pure + 15 blended.  Each bar = 8px wide, height = 200px.
 * Returns { png, lumaOrder, barInfo } where barInfo describes each bar.
 */
function generateColorBarsPng() {
  const lumaOrder = getLuminanceOrder(PALETTE);
  const numBars   = 31;
  const barWidth  = 8;
  const W         = numBars * barWidth;  // 248 px
  const H         = 200;                 // 25 chars
  const png       = new PNG({ width: W, height: H });
  const barInfo   = [];  // { type: 'pure'|'blend', colorIdx, blendLeft, blendRight, rgb }

  let barIdx = 0;
  for (let i = 0; i < 16; i++) {
    const c = PALETTE[lumaOrder[i]];
    fillBar(png, barIdx * barWidth, barWidth, c);
    barInfo.push({
      bar: barIdx, type: 'pure',
      colorIdx: lumaOrder[i], colorName: COLOR_NAMES[lumaOrder[i]],
      rgb: c
    });
    barIdx++;

    if (i < 15) {
      const cNext = PALETTE[lumaOrder[i + 1]];
      const blend = {
        r: Math.round((c.r + cNext.r) / 2),
        g: Math.round((c.g + cNext.g) / 2),
        b: Math.round((c.b + cNext.b) / 2),
      };
      fillBar(png, barIdx * barWidth, barWidth, blend);
      barInfo.push({
        bar: barIdx, type: 'blend',
        blendLeft: lumaOrder[i], blendRight: lumaOrder[i + 1],
        leftName: COLOR_NAMES[lumaOrder[i]], rightName: COLOR_NAMES[lumaOrder[i + 1]],
        rgb: blend
      });
      barIdx++;
    }
  }

  return { png, lumaOrder, barInfo };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const quickMode = process.argv.includes('--quick');

ensureDir(OUT_DIR);
ensureDir(ROM_DUMP_DIR);
ensureDir(COLOR_BARS_DIR);

const fontBits = loadCharsetRom(ROM_PATH);
console.log(`Loaded charset ROM: ${fontBits.length} bytes (${fontBits.length / 8} chars)`);

// --- ROM dump PNGs ---
console.log(`\nGenerating ROM dump PNGs${quickMode ? ' (quick mode)' : ''}...`);
let romCount = 0;

if (quickMode) {
  // Quick: every fg on black bg + every bg on white fg
  for (let fg = 0; fg < 16; fg++) {
    if (fg === 0) continue; // fg==bg
    const png = generateRomDumpPng(fontBits, fg, 0);
    writePng(png, path.join(ROM_DUMP_DIR, `rom-fg${fg}-bg0.png`));
    romCount++;
  }
  for (let bg = 0; bg < 16; bg++) {
    if (bg === 1) continue;
    const png = generateRomDumpPng(fontBits, 1, bg);
    writePng(png, path.join(ROM_DUMP_DIR, `rom-fg1-bg${bg}.png`));
    romCount++;
  }
} else {
  // Full: every fg × bg combination (skip fg==bg)
  for (let fg = 0; fg < 16; fg++) {
    for (let bg = 0; bg < 16; bg++) {
      if (fg === bg) continue;
      const png = generateRomDumpPng(fontBits, fg, bg);
      writePng(png, path.join(ROM_DUMP_DIR, `rom-fg${fg}-bg${bg}.png`));
      romCount++;
    }
  }
}
console.log(`  ${romCount} ROM dump PNGs saved to ${ROM_DUMP_DIR}`);

// --- Colour bars PNG ---
console.log('\nGenerating colour bars PNG...');
const { png: barsPng, lumaOrder, barInfo } = generateColorBarsPng();
writePng(barsPng, path.join(COLOR_BARS_DIR, 'color-bars-blended.png'));

// Save bar metadata for the verify script
fs.writeFileSync(
  path.join(COLOR_BARS_DIR, 'color-bars-info.json'),
  JSON.stringify({ lumaOrder, barInfo }, null, 2)
);

console.log('  Luminance order (dark→light):');
lumaOrder.forEach((idx, pos) => {
  const c = PALETTE[idx];
  console.log(`    ${pos.toString().padStart(2)}: ${COLOR_NAMES[idx].padEnd(12)} (idx=${idx}, rgb=${c.r},${c.g},${c.b})`);
});
console.log(`  Colour bars PNG saved to ${COLOR_BARS_DIR}`);
console.log(`\nDone.  ${romCount + 1} PNG files generated.`);
