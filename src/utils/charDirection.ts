/**
 * Character direction / shape classification for the Fade/Lighten tool.
 *
 * Each ROM screencode (0–255) is tagged with a primary visual direction.
 * This enables:
 *   - The "Direction" step-choice mode (prefer characters with matching orientation)
 *   - Direction-based source categories (HorizontalLines, VerticalLines, etc.)
 */

// ---------------------------------------------------------------------------
// Direction type
// ---------------------------------------------------------------------------

export type CharDirectionType =
  | 'horizontal'   // dominant horizontal lines
  | 'vertical'     // dominant vertical lines
  | 'diagonal'     // diagonal features
  | 'box'          // rectangular fills, blocks, L-shapes
  | 'alpha'        // letters and digits
  | 'symbol'       // punctuation, special characters
  | 'other';       // space, unclassified

// ---------------------------------------------------------------------------
// Curated lookup for standard C64 uppercase ROM (screencodes 0–127).
// Reversed versions (128–255) inherit the same tag as their base (sc - 128).
// ---------------------------------------------------------------------------

const CURATED_UPPER: Partial<Record<number, CharDirectionType>> = {
  // --- Space / blank ---
  0x00: 'other',    //  @
  0x20: 'other',    //  space

  // --- Alpha (screencodes 1–26 = A–Z in upper mode) ---
  ...Object.fromEntries(
    Array.from({ length: 26 }, (_, i) => [i + 1, 'alpha' as CharDirectionType])
  ),

  // --- Digits 0–9 (screencodes 0x30–0x39, except 0x31 and 0x37 which are vertical) ---
  0x30: 'alpha', 0x32: 'alpha', 0x33: 'alpha', 0x34: 'alpha',
  0x35: 'alpha', 0x36: 'alpha', 0x38: 'alpha', 0x39: 'alpha',

  // === Horizontal lines (from reference h-lines tab) ===
  0x1F: 'horizontal',  //  ←
  0x22: 'horizontal',  //  "
  0x2D: 'horizontal',  //  -
  0x3D: 'horizontal',  //  =
  0x40: 'horizontal',  //  ─
  0x43: 'horizontal',  //  ─
  0x44: 'horizontal',  //  _ underline
  0x45: 'horizontal',  //  ▔ upper bar
  0x46: 'horizontal',  //  ▁ lower thick bar
  0x52: 'horizontal',  //  reverse bar
  0x62: 'horizontal',  //  ▔ top bar
  0x63: 'horizontal',  //  ─
  0x64: 'horizontal',  //  ─ horizontal rule
  0x68: 'horizontal',  //  thick lower bar
  0x6F: 'horizontal',  //  ━ thick horizontal
  0x71: 'horizontal',  //  lower-left round + bar
  0x72: 'horizontal',  //  upper-left round + bar
  0x77: 'horizontal',  //  mid-left horizontal
  0x78: 'horizontal',  //  mid-right horizontal
  0x79: 'horizontal',  //  ─ thin horizontal

  // === Vertical lines (from reference v-lines tab) ===
  0x09: 'vertical',    //  I  (letter I — visually vertical)
  0x1B: 'vertical',    //  [
  0x1D: 'vertical',    //  ]
  0x1E: 'vertical',    //  ↑
  0x21: 'vertical',    //  !
  0x2E: 'vertical',    //  .  (period — single pixel column)
  0x31: 'vertical',    //  1  (digit 1 — visually vertical)
  0x37: 'vertical',    //  7
  0x3A: 'vertical',    //  :
  0x3B: 'vertical',    //  ;
  0x42: 'vertical',    //  │ vertical bar
  0x47: 'vertical',    //  ▕ right eighth block
  0x48: 'vertical',    //  ▎ left thin bar
  0x54: 'vertical',    //  ▌ left half + right thin
  0x59: 'vertical',    //  ▕ right thin bar variant
  0x5C: 'vertical',    //  ▎ thin left
  0x5D: 'vertical',    //  │ pipe
  0x61: 'vertical',    //  ▌ left half block
  0x65: 'vertical',    //  ▕ right quarter
  0x67: 'vertical',    //  ▎ left quarter
  0x6A: 'vertical',    //  right eighth
  0x6B: 'vertical',    //  cross / tee (vertical dominant)
  0x73: 'vertical',    //  cross / tee (vertical dominant)
  0x74: 'vertical',    //  left third
  0x75: 'vertical',    //  right third
  0x76: 'vertical',    //  left two-thirds

  // === Diagonal (from reference diag tab) ===
  0x18: 'diagonal',    //  shifted X diagonal
  0x25: 'diagonal',    //  %
  0x27: 'diagonal',    //  '
  0x2A: 'diagonal',    //  *
  0x2F: 'diagonal',    //  /
  0x4D: 'diagonal',    //  ╲
  0x4E: 'diagonal',    //  ╱
  0x56: 'diagonal',    //  triangle
  0x5F: 'diagonal',    //  ╱ alt
  0x69: 'diagonal',    //  ╲ lower-left triangle
  0x6C: 'diagonal',    //  ╱ quarter triangle
  0x7B: 'diagonal',    //  cross
  0x7C: 'diagonal',    //  ╲ quarter triangle
  0x7E: 'diagonal',    //  π / triangle
  0x7F: 'diagonal',    //  ▒ diagonal fill

  // === Symbols (remaining punctuation not classified above) ===
  0x1C: 'symbol',    //  £
  0x23: 'symbol',    //  #
  0x24: 'symbol',    //  $
  0x26: 'symbol',    //  &
  0x28: 'symbol',    //  (
  0x29: 'symbol',    //  )
  0x2B: 'symbol',    //  +
  0x2C: 'symbol',    //  ,
  0x3C: 'symbol',    //  <
  0x3E: 'symbol',    //  >
  0x3F: 'symbol',    //  ?

  // === Boxes / blocks / fills / corners / junctions (everything else in 0x40–0x7F) ===
  0x41: 'box',  0x49: 'box',  0x4A: 'box',  0x4B: 'box',
  0x4C: 'box',  0x4F: 'box',  0x50: 'box',  0x51: 'box',
  0x53: 'box',  0x55: 'box',  0x57: 'box',  0x58: 'box',
  0x5A: 'box',  0x5B: 'box',  0x5E: 'box',  0x66: 'box',
  0x6D: 'box',  0x6E: 'box',  0x70: 'box',  0x7A: 'box',
  0x7D: 'box',
};

/**
 * Build the full 0–255 map from the curated upper-case table.
 * Reversed chars (128–255) inherit their base char's tag.
 */
function buildFullMap(): Record<number, CharDirectionType> {
  const map: Record<number, CharDirectionType> = {};
  for (let sc = 0; sc < 256; sc++) {
    const base = sc < 128 ? sc : sc - 128;
    map[sc] = CURATED_UPPER[base] ?? 'other';
  }
  return map;
}

const FULL_DIRECTION_MAP = buildFullMap();

// ---------------------------------------------------------------------------
// Algorithmic fallback for custom / non-standard fonts
// ---------------------------------------------------------------------------

/**
 * Analyse an 8×8 character bitmap and return its dominant direction.
 * Used when the curated map doesn't apply (custom fonts).
 */
export function analyseCharDirection(fontBits: number[], screencode: number): CharDirectionType {
  const boffs = screencode * 8;
  let pixelCount = 0;
  let hRuns = 0;  // horizontal run segments
  let vRuns = 0;  // vertical run segments

  // Count horizontal runs
  for (let y = 0; y < 8; y++) {
    const byte = fontBits[boffs + y];
    let inRun = false;
    for (let x = 0; x < 8; x++) {
      const on = !!((128 >> x) & byte);
      if (on) {
        pixelCount++;
        if (!inRun) { hRuns++; inRun = true; }
      } else {
        inRun = false;
      }
    }
  }

  // Count vertical runs
  for (let x = 0; x < 8; x++) {
    const mask = 128 >> x;
    let inRun = false;
    for (let y = 0; y < 8; y++) {
      const on = !!(fontBits[boffs + y] & mask);
      if (on) {
        if (!inRun) { vRuns++; inRun = true; }
      } else {
        inRun = false;
      }
    }
  }

  if (pixelCount === 0) return 'other';
  // Solid or near-solid fills → box
  if (pixelCount >= 48) return 'box';

  // Ratio: fewer runs in one axis means longer continuous lines in that axis
  const ratio = hRuns === 0 ? 10 : vRuns / hRuns;
  if (ratio > 1.8) return 'horizontal';  // few h-runs → long horizontal spans
  if (ratio < 0.55) return 'vertical';    // few v-runs → long vertical spans

  // Check for diagonal content: count pixels on the two main diagonals
  let diagA = 0, diagB = 0;
  for (let i = 0; i < 8; i++) {
    if (fontBits[boffs + i] & (128 >> i)) diagA++;
    if (fontBits[boffs + i] & (128 >> (7 - i))) diagB++;
  }
  if (diagA >= 5 || diagB >= 5) return 'diagonal';

  // Default: if many pixels and blocky, it's a box; otherwise other
  if (pixelCount >= 16) return 'box';
  return 'other';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the direction classification for a screencode.
 * Uses the curated C64 map for standard ROM fonts, falls back to
 * algorithmic analysis for custom fonts.
 *
 * @param fontBits  The font bitmap array (used for algorithmic fallback).
 * @param screencode  The character screencode (0–255).
 * @param isCustomFont  If true, always use algorithmic analysis.
 */
export function getCharDirection(
  fontBits: number[],
  screencode: number,
  isCustomFont: boolean = false,
): CharDirectionType {
  if (!isCustomFont && screencode >= 0 && screencode < 256) {
    return FULL_DIRECTION_MAP[screencode];
  }
  return analyseCharDirection(fontBits, screencode);
}

/**
 * Return the set of screencodes (0–255) matching a given direction type.
 * Uses the curated map only (for standard ROM fonts).
 */
export function getScreencodesByDirection(direction: CharDirectionType): Set<number> {
  const set = new Set<number>();
  for (let sc = 0; sc < 256; sc++) {
    if (FULL_DIRECTION_MAP[sc] === direction) {
      set.add(sc);
    }
  }
  return set;
}
