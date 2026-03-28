/**
 * Character weight configuration for all supported charsets.
 *
 * Provides:
 * - Character category definitions (case-aware)
 * - Platform / charset metadata (border colors, background colors)
 * - Weight distribution computation
 *
 * Used by the Fade/Lighten tool, weight-sorted char palette,
 * and the LightDark reference document generator.
 */

// ---------------------------------------------------------------------------
// Excluded screencodes
// ---------------------------------------------------------------------------

/**
 * Screencodes that are visual duplicates of the min/max weight characters.
 *   $60 (96)  = shifted space, duplicate of $20 (32) at weight 0
 *   $E0 (224) = reversed shifted space, duplicate of $A0 (160) at weight 64
 */
export const EXCLUDED_SCREENCODES = new Set([96, 224]);

// ---------------------------------------------------------------------------
// Character categories
// ---------------------------------------------------------------------------

export type CharCategory =
  | 'AllCharacters'
  | 'AlphaNumeric'
  | 'AlphaNumExtended'
  | 'PETSCII'
  | 'Blocks';

export const CHAR_CATEGORIES: CharCategory[] = [
  'AllCharacters',
  'AlphaNumeric',
  'AlphaNumExtended',
  'PETSCII',
  'Blocks',
];

/**
 * Whether a charset uses the uppercase or lowercase ROM layout.
 * In uppercase mode screencodes 65-90 are PETSCII graphics.
 * In lowercase mode screencodes 65-90 are uppercase letters A-Z.
 */
export type CaseMode = 'upper' | 'lower';

/**
 * Base screencodes (in the 64-127 graphics range) that form
 * rectangular fills, L-shapes, or checkerboard patterns.
 *
 * Note: 76, 79, 80 are only block shapes in uppercase mode;
 * in lowercase they become the letters L, O, P.
 */
export const BLOCK_BASE_SCREENCODES = [
  // L-shapes (upper-case only graphics)
  76, 79, 80,
  // Rectangular fills, bars, quarters, checkerboards
  97, 98, 99, 100, 101, 102, 103, 104, 106, 108, 111,
  116, 117, 118, 119, 120, 121, 122, 123, 124, 126, 127,
];

/**
 * Build the set of screencodes belonging to a category, respecting
 * the case mode of the charset.  The returned set already has the
 * globally excluded screencodes removed.
 */
export function buildCategorySet(
  category: CharCategory,
  caseMode: CaseMode,
): Set<number> {
  const set = new Set<number>();

  switch (category) {
    // ---------------------------------------------------------------
    case 'AllCharacters':
      for (let sc = 0; sc < 256; sc++) set.add(sc);
      break;

    // ---------------------------------------------------------------
    case 'AlphaNumeric':
      // Letters at 1-26 (a-z in lower, A-Z in upper)
      for (let sc = 1; sc <= 26; sc++) { set.add(sc); set.add(sc + 128); }
      // Digits 0-9 at 48-57
      for (let sc = 48; sc <= 57; sc++) { set.add(sc); set.add(sc + 128); }
      // In lowercase mode uppercase A-Z also live at 65-90
      if (caseMode === 'lower') {
        for (let sc = 65; sc <= 90; sc++) { set.add(sc); set.add(sc + 128); }
      }
      break;

    // ---------------------------------------------------------------
    case 'AlphaNumExtended':
      // All text characters 0-63 and their reversed versions
      for (let sc = 0; sc <= 63; sc++) { set.add(sc); set.add(sc + 128); }
      set.delete(160); // $A0 solid block belongs in PETSCII / Blocks
      // In lowercase mode A-Z at 65-90 are text characters
      if (caseMode === 'lower') {
        for (let sc = 65; sc <= 90; sc++) { set.add(sc); set.add(sc + 128); }
      }
      break;

    // ---------------------------------------------------------------
    case 'PETSCII':
      for (let sc = 64; sc <= 127; sc++) {
        if (sc === 96) continue; // excluded duplicate
        if (caseMode === 'lower' && sc >= 65 && sc <= 90) continue; // letters
        set.add(sc);
        set.add(sc + 128);
      }
      set.add(160); // solid block
      set.delete(224); // excluded duplicate
      break;

    // ---------------------------------------------------------------
    case 'Blocks':
      for (const sc of BLOCK_BASE_SCREENCODES) {
        if (caseMode === 'lower' && sc >= 65 && sc <= 90) continue;
        set.add(sc);
        set.add(sc + 128);
      }
      set.add(160); // solid block
      break;
  }

  // Remove globally excluded
  for (const ex of EXCLUDED_SCREENCODES) set.delete(ex);

  return set;
}

// ---------------------------------------------------------------------------
// Platform / charset metadata
// ---------------------------------------------------------------------------

export interface CharsetConfig {
  /** The charset ID used by the app (e.g. 'upper', 'c128Lower'). */
  charsetId: string;
  /** ROM font file name relative to assets/. */
  fontFile: string;
  /** Upper or lower case layout. */
  caseMode: CaseMode;
  /** C64 colour-palette index for the background. */
  backgroundColor: number;
}

export interface PlatformConfig {
  /** Short display label (e.g. 'C64'). */
  label: string;
  /** C64 colour-palette index for the border. */
  borderColor: number;
  /** Upper and lower charset variants. */
  charsets: CharsetConfig[];
}

/**
 * All platforms supported by Petmate with their charset configurations.
 *
 * Border colours are chosen to be visually distinct per platform:
 *   C64 = 14 (Light Blue), CBase = 8 (Orange), C128 = 3 (Cyan),
 *   C16 = 4 (Purple), VIC-20 = 7 (Yellow), PET = 1 (White).
 *
 * Background colours: uppercase = 0 (Black), lowercase = 11 (Dark Grey).
 */
export const PLATFORMS: PlatformConfig[] = [
  {
    label: 'C64',
    borderColor: 14,
    charsets: [
      { charsetId: 'upper',      fontFile: 'c64-charset-upper.bin',   caseMode: 'upper', backgroundColor: 0 },
      { charsetId: 'lower',      fontFile: 'c64-charset-lower.bin',   caseMode: 'lower', backgroundColor: 11 },
    ],
  },
  {
    label: 'CBase',
    borderColor: 8,
    charsets: [
      { charsetId: 'cbaseUpper', fontFile: 'cbase-charset-upper.bin', caseMode: 'upper', backgroundColor: 0 },
      { charsetId: 'cbaseLower', fontFile: 'cbase-charset-lower.bin', caseMode: 'lower', backgroundColor: 11 },
    ],
  },
  {
    label: 'C128',
    borderColor: 3,
    charsets: [
      { charsetId: 'c128Upper',  fontFile: 'c128-charset-upper.bin',  caseMode: 'upper', backgroundColor: 0 },
      { charsetId: 'c128Lower',  fontFile: 'c128-charset-lower.bin',  caseMode: 'lower', backgroundColor: 11 },
    ],
  },
  {
    label: 'C16',
    borderColor: 4,
    charsets: [
      { charsetId: 'c16Upper',   fontFile: 'c16-charset-upper.bin',   caseMode: 'upper', backgroundColor: 0 },
      { charsetId: 'c16Lower',   fontFile: 'c16-charset-lower.bin',   caseMode: 'lower', backgroundColor: 11 },
    ],
  },
  {
    label: 'VIC20',
    borderColor: 7,
    charsets: [
      { charsetId: 'vic20Upper', fontFile: 'vic20-charset-upper.bin', caseMode: 'upper', backgroundColor: 0 },
      { charsetId: 'vic20Lower', fontFile: 'vic20-charset-lower.bin', caseMode: 'lower', backgroundColor: 11 },
    ],
  },
  {
    label: 'PET',
    borderColor: 1,
    charsets: [
      { charsetId: 'petGfx',     fontFile: 'pet-charset-upper.bin',   caseMode: 'upper', backgroundColor: 0 },
      { charsetId: 'petBiz',     fontFile: 'pet-charset-lower.bin',   caseMode: 'lower', backgroundColor: 11 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Charset → CaseMode helper
// ---------------------------------------------------------------------------

const LOWERCASE_CHARSETS = new Set([
  'lower', 'cbaseLower', 'c128Lower', 'c16Lower', 'vic20Lower', 'petBiz',
]);

/** Derive the case mode from a charset ID string. */
export function caseModeFromCharset(charset: string): CaseMode {
  return LOWERCASE_CHARSETS.has(charset) ? 'lower' : 'upper';
}

// ---------------------------------------------------------------------------
// Weight distribution computation
// ---------------------------------------------------------------------------

/** A single step in the weight distribution: a pixel count and the matching screencodes. */
export interface WeightStep {
  pixelCount: number;
  screencodes: number[];
}

/**
 * Count the number of set pixels in an 8×8 character bitmap.
 * `fontBits` is the flat array of bytes for the entire font ROM;
 * `screencode` selects the character (offset = screencode * 8).
 */
export function countCharPixels(fontBits: number[], screencode: number): number {
  const boffs = screencode * 8;
  let count = 0;
  for (let y = 0; y < 8; y++) {
    let byte = fontBits[boffs + y];
    while (byte) {
      byte &= byte - 1;
      count++;
    }
  }
  return count;
}

/**
 * Compute the weight distribution for a font + category combination.
 * Returns weight steps sorted heavy-first (descending pixel count).
 * Weight steps with no matching characters are omitted.
 */
export function computeWeightDistribution(
  fontBits: number[],
  category: CharCategory,
  caseMode: CaseMode,
): WeightStep[] {
  const categorySet = buildCategorySet(category, caseMode);
  const groups: Record<number, number[]> = {};

  for (const sc of categorySet) {
    const px = countCharPixels(fontBits, sc);
    if (!groups[px]) groups[px] = [];
    groups[px].push(sc);
  }

  return Object.entries(groups)
    .map(([px, scs]) => ({ pixelCount: Number(px), screencodes: scs }))
    .sort((a, b) => b.pixelCount - a.pixelCount);
}
