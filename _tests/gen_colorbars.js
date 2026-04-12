#!/usr/bin/env node
/**
 * Generates a C64-style color bar test pattern as a .petmate file.
 */
const fs   = require('fs');
const path = require('path');

const WIDTH  = 40;
const HEIGHT = 25;

// ─── Helpers ───────────────────────────────────────────────────────

// ASCII string → C64 upper-case screencodes
function textToScreencodes(str) {
  return [...str].map(ch => {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90)  return c - 64;   // A-Z → 1-26
    if (c >= 97 && c <= 122) return c - 96;    // a-z → 1-26
    if (c >= 48 && c <= 57)  return c;         // 0-9 → 48-57
    if (ch === ' ') return 32;
    if (ch === '-') return 45;
    if (ch === ':') return 58;
    if (ch === '#') return 35;
    if (ch === '(') return 40;
    if (ch === ')') return 41;
    if (ch === '/') return 47;
    return 32; // fallback to space
  });
}

// Create a blank 40x25 framebuf filled with spaces, color 1 (white)
function blankScreen() {
  const fb = [];
  for (let y = 0; y < HEIGHT; y++) {
    const row = [];
    for (let x = 0; x < WIDTH; x++) {
      row.push({ code: 32, color: 1 });
    }
    fb.push(row);
  }
  return fb;
}

// Write a text string at (row, col) with a given color
function writeText(fb, row, col, text, color) {
  const codes = textToScreencodes(text);
  for (let i = 0; i < codes.length && col + i < WIDTH; i++) {
    fb[row][col + i] = { code: codes[i], color };
  }
}

// Fill a rectangular region with a character and color
function fillRect(fb, y1, x1, y2, x2, code, color) {
  for (let y = y1; y <= y2 && y < HEIGHT; y++) {
    for (let x = x1; x <= x2 && x < WIDTH; x++) {
      fb[y][x] = { code, color };
    }
  }
}

// ─── C64 color names ───────────────────────────────────────────────
const COLOR_NAMES = [
  'BLACK', 'WHITE', 'RED',    'CYAN',
  'PURPLE','GREEN', 'BLUE',   'YELLOW',
  'ORANGE','BROWN', 'LT RED', 'DK GREY',
  'GREY',  'LT GRN','LT BLUE','LT GREY',
];

// ─── Build the test pattern ────────────────────────────────────────

const fb = blankScreen();
const BG_COLOR = 0;      // black background
const BORDER_COLOR = 0;  // black border
const BLOCK = 160;       // $A0 = reverse space (solid block)
const HALF_LEFT = 97;    // $61 = left half block
const HALF_RIGHT = 225;  // $E1 = right half (reverse of left)
const CHECKER = 102;     // $66 = checkerboard
const HLINE = 99;        // horizontal line character ($63)
const VLINE = 93;        // vertical line ($5D = pipe)

// Fill entire screen with black
fillRect(fb, 0, 0, 24, 39, 32, 1);

// ── Title bar (row 0-1) ──
fillRect(fb, 0, 0, 0, 39, BLOCK, 6);   // blue bar
writeText(fb, 0, 5, 'PETMATE 9  COLOR BAR TEST', 14);    // light blue text
writeText(fb, 0, 31, 'V0.9.8', 14);

// ── Horizontal separator (row 1) ──
for (let x = 0; x < WIDTH; x++) {
  fb[1][x] = { code: 64, color: 11 };  // $40 = horizontal line, dark grey
}

// ── Main color bars (rows 2-18) — 17 rows tall ──
// 16 colors × 2 columns = 32, offset by 4 to center
const BAR_LEFT = 4;
const BAR_WIDTH = 2;
const BAR_TOP = 2;
const BAR_BOTTOM = 18;

for (let c = 0; c < 16; c++) {
  const x1 = BAR_LEFT + c * BAR_WIDTH;
  const x2 = x1 + BAR_WIDTH - 1;
  fillRect(fb, BAR_TOP, x1, BAR_BOTTOM, x2, BLOCK, c);
}

// ── Left margin: color index labels (rows 2-18) ──
// Show "00" through "15" vertically on the left side, one per bar row
// Actually, let's put row numbers on the left
for (let r = BAR_TOP; r <= BAR_BOTTOM; r++) {
  const rowNum = r - BAR_TOP;
  const label = String(rowNum).padStart(2, ' ');
  writeText(fb, r, 1, label, 11);  // dark grey
}

// Right margin: gradient ramp using half blocks
for (let r = BAR_TOP; r <= BAR_BOTTOM; r++) {
  const c1 = (r - BAR_TOP) % 16;
  const c2 = (c1 + 1) % 16;
  fb[r][37] = { code: HALF_LEFT, color: c1 };
  fb[r][38] = { code: CHECKER, color: c2 };
}

// ── Separator (row 19) ──
for (let x = 0; x < WIDTH; x++) {
  fb[19][x] = { code: 64, color: 11 };
}

// ── Color numbers below bars (row 20) ──
for (let c = 0; c < 16; c++) {
  const x = BAR_LEFT + c * BAR_WIDTH;
  const label = String(c).padStart(2, ' ');
  // Use contrasting text color: white on dark colors, black on light
  const textColor = (c === 0 || c === 6 || c === 9 || c === 11 || c === 2) ? 1 : 0;
  fb[20][x]     = { code: BLOCK, color: c };
  fb[20][x + 1] = { code: BLOCK, color: c };
  writeText(fb, 20, x, label, textColor);
}

// ── Color name labels (rows 21-22), two rows of 8 ──
for (let c = 0; c < 8; c++) {
  const name = String(c) + ':' + COLOR_NAMES[c].substring(0, 3);
  const textColor = 1; // white
  writeText(fb, 21, c * 5, name, textColor);
}
for (let c = 8; c < 16; c++) {
  const name = String(c).padStart(2,' ') + ':' + COLOR_NAMES[c].substring(0, 2);
  const textColor = 1;
  writeText(fb, 22, (c - 8) * 5, name, textColor);
}

// ── Grey ramp bar (row 23) ──
// Show the grey ramp: black(0), dk grey(11), grey(12), lt grey(15), white(1)
const greyRamp = [0, 11, 9, 2, 8, 10, 4, 5, 12, 3, 14, 6, 13, 15, 7, 1];
for (let i = 0; i < 16; i++) {
  const x = BAR_LEFT + i * BAR_WIDTH;
  fillRect(fb, 23, x, 23, x + BAR_WIDTH - 1, BLOCK, greyRamp[i]);
}
writeText(fb, 23, 0, 'LUM', 11);

// ── Bottom bar (row 24) ──
fillRect(fb, 24, 0, 24, 39, BLOCK, 6);   // blue bar
writeText(fb, 24, 1, '40X25  UPPER  BG:0  BORDER:0', 14);

// ─── Build .petmate JSON ───────────────────────────────────────────
const petmate = {
  version: 3,
  screens: [0],
  framebufs: [{
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: BG_COLOR,
    borderColor: BORDER_COLOR,
    borderOn: true,
    charset: 'upper',
    name: 'Color Bars',
    framebuf: fb,
    zoom: { zoomLevel: 3, alignment: 'left' },
  }],
  customFonts: {},
};

const outPath = path.join(__dirname, 'colorbars.petmate');
fs.writeFileSync(outPath, JSON.stringify(petmate), 'utf-8');
console.log(`✓ Wrote ${outPath}`);
console.log(`  ${WIDTH}x${HEIGHT}, ${16} color bars, bg=${BG_COLOR}, border=${BORDER_COLOR}`);
