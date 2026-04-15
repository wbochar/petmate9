/**
 * Hardcoded color bar test pattern for Ultimate integration testing.
 *
 * Generates a 40x25 C64 screen with:
 *   - Blue title bar
 *   - 16 vertical color bars (all C64 colors)
 *   - Color index numbers and name labels
 *   - Luminance-sorted ramp
 *   - Blue info bar
 */

import { Pixel, Framebuf } from '../redux/types';

// ─── Helpers ───────────────────────────────────────────────────────

const WIDTH  = 40;
const HEIGHT = 25;
const BLOCK  = 160;  // $A0 = reverse space (solid block)

function textToScreencodes(str: string): number[] {
  return [...str].map(ch => {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90)  return c - 64;   // A-Z → 1-26
    if (c >= 97 && c <= 122) return c - 96;    // a-z → 1-26
    if (c >= 48 && c <= 57)  return c;         // 0-9 → 48-57
    if (ch === ' ') return 32;
    if (ch === ':') return 58;
    if (ch === '.') return 46;
    return 32;
  });
}

function blankScreen(): Pixel[][] {
  const fb: Pixel[][] = [];
  for (let y = 0; y < HEIGHT; y++) {
    const row: Pixel[] = [];
    for (let x = 0; x < WIDTH; x++) {
      row.push({ code: 32, color: 1 });
    }
    fb.push(row);
  }
  return fb;
}

function writeText(fb: Pixel[][], row: number, col: number, text: string, color: number) {
  const codes = textToScreencodes(text);
  for (let i = 0; i < codes.length && col + i < WIDTH; i++) {
    fb[row][col + i] = { code: codes[i], color };
  }
}

function fillRect(fb: Pixel[][], y1: number, x1: number, y2: number, x2: number, code: number, color: number) {
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

// ─── Public API ────────────────────────────────────────────────────

/** Generate the color bar test pattern as a Framebuf ready for pushing to Ultimate. */
export function generateColorBarsFramebuf(): Framebuf {
  const fb = blankScreen();
  const BG_COLOR = 0;
  const BORDER_COLOR = 0;
  const BAR_LEFT = 4;
  const BAR_WIDTH = 2;
  const BAR_TOP = 2;
  const BAR_BOTTOM = 18;

  // Title bar (row 0)
  fillRect(fb, 0, 0, 0, 39, BLOCK, 6);
  writeText(fb, 0, 5, 'PETMATE 9  COLOR BAR TEST', 14);
  writeText(fb, 0, 31, 'V0.9.8', 14);

  // Separator (row 1)
  for (let x = 0; x < WIDTH; x++) {
    fb[1][x] = { code: 64, color: 11 };
  }

  // Main color bars (rows 2-18)
  for (let c = 0; c < 16; c++) {
    const x1 = BAR_LEFT + c * BAR_WIDTH;
    const x2 = x1 + BAR_WIDTH - 1;
    fillRect(fb, BAR_TOP, x1, BAR_BOTTOM, x2, BLOCK, c);
  }

  // Left margin row numbers
  for (let r = BAR_TOP; r <= BAR_BOTTOM; r++) {
    const label = String(r - BAR_TOP).padStart(2, ' ');
    writeText(fb, r, 1, label, 11);
  }

  // Right margin gradient
  for (let r = BAR_TOP; r <= BAR_BOTTOM; r++) {
    const c1 = (r - BAR_TOP) % 16;
    const c2 = (c1 + 1) % 16;
    fb[r][37] = { code: 97, color: c1 };   // half block
    fb[r][38] = { code: 102, color: c2 };  // checkerboard
  }

  // Separator (row 19)
  for (let x = 0; x < WIDTH; x++) {
    fb[19][x] = { code: 64, color: 11 };
  }

  // Color numbers below bars (row 20)
  for (let c = 0; c < 16; c++) {
    const x = BAR_LEFT + c * BAR_WIDTH;
    const textColor = (c === 0 || c === 6 || c === 9 || c === 11 || c === 2) ? 1 : 0;
    fb[20][x]     = { code: BLOCK, color: c };
    fb[20][x + 1] = { code: BLOCK, color: c };
    writeText(fb, 20, x, String(c).padStart(2, ' '), textColor);
  }

  // Color name labels (rows 21-22)
  for (let c = 0; c < 8; c++) {
    writeText(fb, 21, c * 5, String(c) + ':' + COLOR_NAMES[c].substring(0, 3), 1);
  }
  for (let c = 8; c < 16; c++) {
    writeText(fb, 22, (c - 8) * 5, String(c).padStart(2, ' ') + ':' + COLOR_NAMES[c].substring(0, 2), 1);
  }

  // Luminance ramp (row 23)
  const greyRamp = [0, 11, 9, 2, 8, 10, 4, 5, 12, 3, 14, 6, 13, 15, 7, 1];
  for (let i = 0; i < 16; i++) {
    const x = BAR_LEFT + i * BAR_WIDTH;
    fillRect(fb, 23, x, 23, x + BAR_WIDTH - 1, BLOCK, greyRamp[i]);
  }
  writeText(fb, 23, 0, 'LUM', 11);

  // Bottom bar (row 24)
  fillRect(fb, 24, 0, 24, 39, BLOCK, 6);
  writeText(fb, 24, 1, '40X25  UPPER  BG:0  BORDER:0', 14);

  return {
    framebuf: fb,
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: BG_COLOR,
    borderColor: BORDER_COLOR,
    borderOn: true,
    charset: 'upper',
    name: 'Color Bars',
    zoom: { zoomLevel: 3, alignment: 'left' },
    zoomReady: false,
  };
}

// ─── TED (C16/Plus4) Color Bars ────────────────────────────────────

const TED_HUE_NAMES = [
  'BLK', 'WHT', 'RED', 'CYN',
  'PUR', 'GRN', 'BLU', 'YEL',
  'ORG', 'BRN', 'YGN', 'PNK',
  'BGN', 'LBL', 'DBL', 'LGN',
];

/** Generate a C16/Plus4 TED color bar test pattern (40x25). */
export function generateTEDColorBarsFramebuf(): Framebuf {
  const fb = blankScreen();
  // Set all cells to black on white background initially
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      fb[y][x] = { code: 32, color: 0x00 };
    }
  }

  const BG_COLOR = 0x71;     // white lum 7
  const BORDER_COLOR = 0x6B; // pink lum 6
  const TITLE_BG = 0x36;     // blue lum 3
  const TITLE_FG = 0x71;     // white lum 7
  const LABEL_FG = 0x00;     // black
  const SEP_COLOR = 0x31;    // white lum 3 (grey)

  // Title bar (row 0)
  fillRect(fb, 0, 0, 0, 39, BLOCK, TITLE_BG);
  writeText(fb, 0, 3, 'PETMATE 9  TED COLOR BARS  C16', TITLE_FG);

  // Separator (row 1)
  for (let x = 0; x < WIDTH; x++) {
    fb[1][x] = { code: 64, color: SEP_COLOR };
  }

  // Main grid: 16 hue columns × 8 luminance rows (rows 2–9)
  // Each hue gets 2 columns wide, starting at col 4
  const BAR_LEFT = 4;
  const BAR_WIDTH = 2;
  for (let lum = 0; lum < 8; lum++) {
    // Lum label on left
    writeText(fb, 2 + lum, 1, 'L' + lum, LABEL_FG);
    for (let hue = 0; hue < 16; hue++) {
      const tedByte = (lum << 4) | hue;
      const x1 = BAR_LEFT + hue * BAR_WIDTH;
      fillRect(fb, 2 + lum, x1, 2 + lum, x1 + BAR_WIDTH - 1, BLOCK, tedByte);
    }
    // Right margin: lum value
    writeText(fb, 2 + lum, 37, '$' + lum.toString(16).toUpperCase() + '0', LABEL_FG);
  }

  // Separator (row 10)
  for (let x = 0; x < WIDTH; x++) {
    fb[10][x] = { code: 64, color: SEP_COLOR };
  }

  // Hue numbers below bars (row 11)
  for (let hue = 0; hue < 16; hue++) {
    const x = BAR_LEFT + hue * BAR_WIDTH;
    const tedMid = (4 << 4) | hue; // lum 4 for label background
    fb[11][x]     = { code: BLOCK, color: tedMid };
    fb[11][x + 1] = { code: BLOCK, color: tedMid };
    const labelColor = (hue === 0) ? 0x71 : 0x00;
    writeText(fb, 11, x, String(hue).padStart(2, ' '), labelColor);
  }

  // Hue names (rows 12-13)
  for (let h = 0; h < 8; h++) {
    writeText(fb, 12, h * 5, String(h) + ':' + TED_HUE_NAMES[h], LABEL_FG);
  }
  for (let h = 8; h < 16; h++) {
    writeText(fb, 13, (h - 8) * 5, String(h).padStart(2, ' ') + ':' + TED_HUE_NAMES[h], LABEL_FG);
  }

  // Separator (row 14)
  for (let x = 0; x < WIDTH; x++) {
    fb[14][x] = { code: 64, color: SEP_COLOR };
  }

  // Full luminance ramps for each hue (rows 15-22, 8 hues per block)
  // Top block: hues 1-8 (skip black)
  for (let i = 0; i < 8; i++) {
    const hue = i + 1;
    writeText(fb, 15 + i, 0, TED_HUE_NAMES[hue].padEnd(4, ' '), LABEL_FG);
    for (let lum = 0; lum < 8; lum++) {
      const tedByte = (lum << 4) | hue;
      const x = 4 + lum * 4;
      fillRect(fb, 15 + i, x, 15 + i, x + 3, BLOCK, tedByte);
    }
    // TED byte for lum 4 as reference
    const refByte = (4 << 4) | hue;
    writeText(fb, 15 + i, 37, '$' + refByte.toString(16).toUpperCase().padStart(2, '0'), LABEL_FG);
  }

  // Row 23: hues 9-15 compact (one row each would overflow, so skip)
  writeText(fb, 23, 0, 'HUES 9..15: SEE GRID ABOVE', LABEL_FG);

  // Bottom bar (row 24)
  fillRect(fb, 24, 0, 24, 39, BLOCK, TITLE_BG);
  writeText(fb, 24, 1, '40X25  C16 UPPER  121 COLORS', TITLE_FG);

  return {
    framebuf: fb,
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: BG_COLOR,
    borderColor: BORDER_COLOR,
    borderOn: true,
    charset: 'c16Upper',
    name: 'TED Color Bars',
    zoom: { zoomLevel: 3, alignment: 'left' },
    zoomReady: false,
  };
}
