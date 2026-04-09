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
