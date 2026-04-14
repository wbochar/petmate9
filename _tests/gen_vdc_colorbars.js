#!/usr/bin/env node
/**
 * Generates a C128 VDC 80-column color bar test pattern as a .petmate file.
 * Layout matches _tests/vdc80col_test/vdc_test_pattern.asm
 *
 * VDC RGBI color order:
 *   0=Black  1=DkGrey  2=DkBlue  3=LtBlue  4=DkGreen  5=LtGreen
 *   6=DkCyan 7=LtCyan  8=DkRed   9=LtRed  10=DkPurple 11=LtPurple
 *  12=Brown 13=Yellow  14=LtGrey 15=White
 */
const fs   = require('fs');
const path = require('path');

const WIDTH  = 80;
const HEIGHT = 25;

// ─── Screen codes ──────────────────────────────────────────────────
const SPACE      = 0x20;
const BLOCK      = 0xa0;  // reverse space = solid block
const HLINE      = 0x40;  // ─
const VLINE      = 0x5d;  // │
const CORNER_TL  = 0x70;  // ┌
const CORNER_TR  = 0x6e;  // ┐
const CORNER_BL  = 0x6d;  // └
const CORNER_BR  = 0x7d;  // ┘

// ─── VDC RGBI colors ──────────────────────────────────────────────
const BLACK      = 0;
const LT_CYAN    = 7;
const LT_GREEN   = 5;
const WHITE      = 15;

// ─── VDC color labels (4 chars + space = 5 each) ──────────────────
const COLOR_LABELS = [
  'BLK  ', 'GRY1 ', 'DBLU ', 'LBLU ', 'DGRN ', 'LGRN ', 'DCYN ', 'LCYN ',
  'DRED ', 'LRED ', 'DPUR ', 'LPUR ', 'BRN  ', 'YEL  ', 'GRY2 ', 'WHT  ',
];

// ─── Helpers ───────────────────────────────────────────────────────

function textToScreencodes(str) {
  return [...str].map(ch => {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90)  return c - 64;   // A-Z → 1-26
    if (c >= 97 && c <= 122) return c - 96;    // a-z → 1-26
    if (c >= 48 && c <= 57)  return c;         // 0-9 → 48-57
    if (ch === ' ') return 0x20;
    if (ch === '-') return 0x2d;
    if (ch === ':') return 0x3a;
    if (ch === '/') return 0x2f;
    if (ch === '(') return 0x28;
    if (ch === ')') return 0x29;
    if (ch === '$') return 0x24;
    if (ch === '+') return 0x2b;
    if (ch === '.') return 0x2e;
    return 0x20;
  });
}

function blankScreen() {
  const fb = [];
  for (let y = 0; y < HEIGHT; y++) {
    const row = [];
    for (let x = 0; x < WIDTH; x++) {
      row.push({ code: SPACE, color: WHITE });
    }
    fb.push(row);
  }
  return fb;
}

function writeText(fb, row, col, text, color) {
  const codes = textToScreencodes(text);
  for (let i = 0; i < codes.length && col + i < WIDTH; i++) {
    fb[row][col + i] = { code: codes[i], color };
  }
}

function fillRow(fb, row, x1, x2, code, color) {
  for (let x = x1; x <= x2 && x < WIDTH; x++) {
    fb[row][x] = { code, color };
  }
}

function setCell(fb, row, col, code, color) {
  if (row >= 0 && row < HEIGHT && col >= 0 && col < WIDTH) {
    fb[row][col] = { code, color };
  }
}

// ─── Build the test pattern ────────────────────────────────────────

const fb = blankScreen();

// ── Border ──
// Top row: ┌─────...─────┐
setCell(fb, 0, 0, CORNER_TL, WHITE);
fillRow(fb, 0, 1, 78, HLINE, WHITE);
setCell(fb, 0, 79, CORNER_TR, WHITE);

// Bottom row: └─────...─────┘
setCell(fb, 24, 0, CORNER_BL, WHITE);
fillRow(fb, 24, 1, 78, HLINE, WHITE);
setCell(fb, 24, 79, CORNER_BR, WHITE);

// Left & right columns (rows 1-23)
for (let r = 1; r <= 23; r++) {
  setCell(fb, r, 0,  VLINE, WHITE);
  setCell(fb, r, 79, VLINE, WHITE);
}

// ── Row 1: Title (light cyan) ──
writeText(fb, 1, 2, 'PETMATE 9 - C128 VDC 80-COLUMN TEST', LT_CYAN);

// ── Row 2: Subtitle (white) ──
writeText(fb, 2, 2, 'RGBI OUTPUT - 640X200 - 16 COLORS', WHITE);

// ── Row 4: Horizontal divider ──
fillRow(fb, 4, 1, 78, HLINE, WHITE);

// ── Row 5: Color name labels ──
// 16 labels × 5 chars = 80, starting at col 1 (matches asm $0191)
for (let c = 0; c < 16; c++) {
  const col = 1 + c * 5;
  writeText(fb, 5, col, COLOR_LABELS[c], WHITE);
}

// ── Rows 6-7: Solid color bars (full width, overwrites border) ──
// 16 colors × (4 colored + 1 black spacer) = 80 columns
for (let c = 0; c < 16; c++) {
  const x1 = c * 5;
  for (let r = 6; r <= 7; r++) {
    for (let i = 0; i < 4; i++) {
      setCell(fb, r, x1 + i, BLOCK, c);
    }
    setCell(fb, r, x1 + 4, BLOCK, BLACK);  // spacer
  }
}

// ── Row 8: Color index numbers ──
// " 0    1    2   ...10   11   12   13   14   15  " starting at col 1
for (let c = 0; c < 16; c++) {
  const col = 1 + c * 5;
  const numStr = c < 10
    ? ' ' + c + '   '   // " 0   "
    : c + '   ';         // "10   "
  writeText(fb, 8, col, numStr, WHITE);
}

// ── Row 9: Horizontal divider ──
fillRow(fb, 9, 1, 78, HLINE, WHITE);

// ── Row 10: Character set label ──
writeText(fb, 10, 2, 'CHARACTER SET (SCREEN CODES $00-$FF):', WHITE);

// ── Rows 11-18: Character set sample ($00-$FF) ──
// 8 rows × 32 chars, each char + space separator = 64 cols, starting at col 2
let screenCode = 0;
for (let r = 11; r <= 18; r++) {
  let col = 2;
  for (let i = 0; i < 32 && screenCode < 256; i++) {
    setCell(fb, r, col, screenCode, WHITE);
    col++;
    if (col < WIDTH) {
      setCell(fb, r, col, SPACE, WHITE);
      col++;
    }
    screenCode++;
  }
}

// ── Row 19: Horizontal divider ──
fillRow(fb, 19, 1, 78, HLINE, WHITE);

// ── Row 21: Column ruler ──
// "80 COLUMNS: 0----+----1----+----2----+----3----+----4----+----5----+----6----+----7"
// Starts at col 2, clips at col 79
const rulerHeader = '80 COLUMNS: ';
let ruler = rulerHeader;
for (let d = 0; d < 8; d++) {
  ruler += d + '----+----';
}
// Trim to fit: col 2 + string must fit in 78 chars (cols 2-79)
ruler = ruler.substring(0, 78);
writeText(fb, 21, 2, ruler, WHITE);

// ── Row 23: Info text (light green) ──
writeText(fb, 23, 2, 'VDC 8563/8568 - PETMATE 9 VDC TEST PATTERN', LT_GREEN);

// ─── Build .petmate JSON ───────────────────────────────────────────

const petmate = {
  version: 3,
  screens: [0],
  framebufs: [{
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: BLACK,
    borderColor: BLACK,
    borderOn: false,
    charset: 'c128Upper',
    name: 'VDC Color Bars',
    framebuf: fb,
    zoom: { zoomLevel: 2, alignment: 'left' },
  }],
  customFonts: {},
};

const outPath = path.join(__dirname, 'vdc_colorbars.petmate');
fs.writeFileSync(outPath, JSON.stringify(petmate), 'utf-8');
console.log(`\u2713 Wrote ${outPath}`);
console.log(`  ${WIDTH}x${HEIGHT}, C128 VDC 80-column, 16 RGBI color bars, charset=c128Upper`);
