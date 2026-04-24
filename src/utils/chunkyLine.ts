/**
 * Chunky pixel (2×2 block character) line drawing utility.
 *
 * Character pixel data verified from c64-charset-upper.bin ROM:
 *
 *   $7E = TL only     (####.... top, ........ bottom)
 *   $7C = TR only     (....#### top, ........ bottom)
 *   $7B = BL only     (........ top, ####.... bottom)
 *   $6C = BR only     (........ top, ....#### bottom)
 *   $E2 = TL+TR       (######## top, ........ bottom) = top half
 *   $62 = BL+BR       (........ top, ######## bottom) = bottom half
 *   $61 = TL+BL       (####.... all 8 rows)            = left column
 *   $E1 = TR+BR       (....#### all 8 rows)            = right column
 *   $7F = TL+BR       (####.... top, ....#### bottom)  = \\ diagonal
 *   $FF = TR+BL       (....#### top, ####.... bottom)  = / diagonal
 *   $EC = TL+TR+BL    $FB = TL+TR+BR    $FC = TL+BL+BR    $FE = TR+BL+BR
 *   $A0 = full block   $20 = empty
 */

export interface LinePixel {
  col: number;
  row: number;
  code: number;
  /** Optional per-pixel colour index.  When absent, previews fall back
   *  to their container's default textColor.  Used by the Link-Line
   *  shift-drawing preview to mirror what each tool will actually paint
   *  (e.g. RvsPen shows XOR'd chars at the cell's existing colour). */
  color?: number;
}

// Quadrant bit positions:  TL=8  TR=4  BL=2  BR=1
// Verified against ROM pixel data above.
const QUAD_BIT: number[][] = [
  [8, 4],  // sub-row 0 (top):    left=TL, right=TR
  [2, 1],  // sub-row 1 (bottom): left=BL, right=BR
];

/**
 * 16-entry lookup: quadrant-bitmask → C64 screen code.
 * Index = TL(8) | TR(4) | BL(2) | BR(1)
 * Every entry verified against ROM pixel data.
 */
export const CHUNKY_QUAD_MAP: number[] = [
  0x20,  //  0 = 0000 - empty
  0x6C,  //  1 = 0001 - BR
  0x7B,  //  2 = 0010 - BL
  0x62,  //  3 = 0011 - BL+BR = bottom half
  0x7C,  //  4 = 0100 - TR
  0xE1,  //  5 = 0101 - TR+BR = right column
  0xFF,  //  6 = 0110 - TR+BL = / diagonal
  0xFE,  //  7 = 0111 - TR+BL+BR
  0x7E,  //  8 = 1000 - TL
  0x7F,  //  9 = 1001 - TL+BR = \\ diagonal
  0x61,  // 10 = 1010 - TL+BL = left column
  0xFC,  // 11 = 1011 - TL+BL+BR
  0xE2,  // 12 = 1100 - TL+TR = top half
  0xFB,  // 13 = 1101 - TL+TR+BR
  0xEC,  // 14 = 1110 - TL+TR+BL
  0xA0,  // 15 = 1111 - full block
];

/**
 * Draw a line in chunky-pixel (2×2 block) space.
 *
 * Runs Bresenham at 2× SUB-PIXEL resolution.  Each editor cell is
 * 2×2 sub-pixels; the trace naturally visits both sub-pixels per cell
 * for horizontal/vertical stretches, producing half-block characters.
 * At 45° diagonals each cell gets two opposite-corner sub-pixels,
 * producing diagonal characters ($7F or $FF).  Start/end quadrant
 * clicks determine the exact sub-pixel endpoints, so edge cells may
 * receive a single quarter-block.
 *
 * Character lookup uses CHUNKY_QUAD_MAP (verified against ROM data).
 * No thickening or special-casing is needed.
 */
export function drawChunkyLine(
  x0: number, y0: number,
  x1: number, y1: number,
  startQuadCol: number, startQuadRow: number,
  endQuadCol: number, endQuadRow: number,
): LinePixel[] {
  // Convert cell coords + quadrant to sub-pixel coords
  const sx0 = x0 * 2 + startQuadCol;
  const sy0 = y0 * 2 + startQuadRow;
  const sx1 = x1 * 2 + endQuadCol;
  const sy1 = y1 * 2 + endQuadRow;

  // Collect quadrant bits per cell
  const cellBits = new Map<string, number>();

  // Bresenham in sub-pixel space
  let cx = sx0, cy = sy0;
  const dx = Math.abs(sx1 - sx0);
  const dy = Math.abs(sy1 - sy0);
  const stepX = sx0 < sx1 ? 1 : sx0 > sx1 ? -1 : 0;
  const stepY = sy0 < sy1 ? 1 : sy0 > sy1 ? -1 : 0;
  let err = dx - dy;

  while (true) {
    const cellCol = cx >> 1;               // floor(cx / 2)
    const cellRow = cy >> 1;               // floor(cy / 2)
    const sc = cx - cellCol * 2;           // sub-col 0 or 1
    const sr = cy - cellRow * 2;           // sub-row 0 or 1
    const bit = QUAD_BIT[sr][sc];
    const key = `${cellCol},${cellRow}`;
    cellBits.set(key, (cellBits.get(key) ?? 0) | bit);

    if (cx === sx1 && cy === sy1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += stepX; }
    if (e2 < dx)  { err += dx; cy += stepY; }
  }

  // Convert to LinePixel array via CHUNKY_QUAD_MAP
  const result: LinePixel[] = [];
  cellBits.forEach((bits, key) => {
    const [c, r] = key.split(',').map(Number);
    result.push({ col: c, row: r, code: CHUNKY_QUAD_MAP[bits] });
  });
  return result;
}

/**
 * Draw a character-resolution line (mode 1).
 * Uses Bresenham at cell resolution, placing the given screencode at each cell.
 */
export function drawCharLine(
  x0: number, y0: number,
  x1: number, y1: number,
  screencode: number,
): LinePixel[] {
  const result: LinePixel[] = [];
  let cx = x0, cy = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const stepX = x0 < x1 ? 1 : -1;
  const stepY = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    result.push({ col: cx, row: cy, code: screencode });
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += stepX; }
    if (e2 < dx) { err += dx; cy += stepY; }
  }
  return result;
}

/**
 * Draw an ellipse outline in chunky-pixel (2×2 block character) space fitted
 * to the bounding box defined by two cell corners.  Uses 2× sub-pixel
 * resolution; each sub-pixel sets one of four quadrant bits in the cell it
 * falls into.  Final cells are looked up via CHUNKY_QUAD_MAP.
 */
export function drawChunkyCircle(
  x0: number, y0: number,
  x1: number, y1: number,
): LinePixel[] {
  const minCol = Math.min(x0, x1);
  const maxCol = Math.max(x0, x1);
  const minRow = Math.min(y0, y1);
  const maxRow = Math.max(y0, y1);

  // Sub-pixel bounding box (2 sub-pixels per cell axis)
  const sMinX = minCol * 2;
  const sMinY = minRow * 2;
  const sMaxX = maxCol * 2 + 1;
  const sMaxY = maxRow * 2 + 1;

  const cx = (sMinX + sMaxX) / 2;
  const cy = (sMinY + sMaxY) / 2;
  const rx = (sMaxX - sMinX) / 2;
  const ry = (sMaxY - sMinY) / 2;

  if (rx < 0.5 || ry < 0.5) return [];

  // Collect quadrant bits per cell
  const cellBits = new Map<string, number>();
  const addPoint = (sx: number, sy: number) => {
    const cellCol = sx >> 1;
    const cellRow = sy >> 1;
    const sc = sx - cellCol * 2;
    const sr = sy - cellRow * 2;
    if (sc < 0 || sc > 1 || sr < 0 || sr > 1) return;
    const bit = QUAD_BIT[sr][sc];
    const key = `${cellCol},${cellRow}`;
    cellBits.set(key, (cellBits.get(key) ?? 0) | bit);
  };

  // Walk the perimeter with fine angular steps.  Use roughly one step per
  // sub-pixel of circumference so no gaps appear.
  const steps = Math.max(24, Math.ceil((rx + ry) * 4 * Math.PI));
  for (let i = 0; i < steps; i++) {
    const ang = (i / steps) * 2 * Math.PI;
    const sx = Math.round(cx + rx * Math.cos(ang));
    const sy = Math.round(cy + ry * Math.sin(ang));
    addPoint(sx, sy);
  }

  const result: LinePixel[] = [];
  cellBits.forEach((bits, key) => {
    const [c, r] = key.split(',').map(Number);
    result.push({ col: c, row: r, code: CHUNKY_QUAD_MAP[bits] });
  });
  return result;
}

/**
 * Draw a character-resolution ellipse outline fitted to the bounding box
 * defined by two cell corners.  Each touched cell receives the given
 * screencode.  Degenerate 1-wide or 1-tall boxes fall back to filling every
 * cell in the range (effectively a line).
 */
export function drawCharCircle(
  x0: number, y0: number,
  x1: number, y1: number,
  screencode: number,
): LinePixel[] {
  const minCol = Math.min(x0, x1);
  const maxCol = Math.max(x0, x1);
  const minRow = Math.min(y0, y1);
  const maxRow = Math.max(y0, y1);
  const w = maxCol - minCol + 1;
  const h = maxRow - minRow + 1;

  const visited = new Set<string>();
  const result: LinePixel[] = [];
  const push = (col: number, row: number) => {
    const key = `${col},${row}`;
    if (visited.has(key)) return;
    visited.add(key);
    result.push({ col, row, code: screencode });
  };

  // Degenerate cases: fill the entire range as a straight segment.
  if (w < 2 || h < 2) {
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        push(c, r);
      }
    }
    return result;
  }

  const cx = (minCol + maxCol) / 2;
  const cy = (minRow + maxRow) / 2;
  const rx = (maxCol - minCol) / 2;
  const ry = (maxRow - minRow) / 2;

  const steps = Math.max(16, Math.ceil((rx + ry) * 4 * Math.PI));
  for (let i = 0; i < steps; i++) {
    const ang = (i / steps) * 2 * Math.PI;
    const col = Math.round(cx + rx * Math.cos(ang));
    const row = Math.round(cy + ry * Math.sin(ang));
    push(col, row);
  }
  return result;
}
