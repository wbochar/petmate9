// Shared preset export helpers used by BoxesPanel, TexturePanel, and the
// Tools > Presets menu.  Centralising the pixel-encoding logic here lets
// single-group and cross-group export flows share identical framing so
// the importer can round-trip any exported screen.

import { BoxPreset, BoxSide, Pixel, TexturePreset, TRANSPARENT_SCREENCODE, DEFAULT_TEXTURE_OPTIONS } from '../redux/types';

// ---- Shared constants ----

/** Width (in characters) of every preset-export framebuffer. */
export const PRESET_EXPORT_WIDTH = 24;

// Markers the importers look for to identify row types.
export const BOX_HEADER_MARKER = 0xBB;      // col 5 in a box header row
export const TEXTURE_OPTS_MARKER = 0xBB;    // col 6 in a texture options row
export const TEXTURE_NAME_MARKER = 0xBC;    // col EXPORT_W-1 in a texture name row
export const TEXTURE_CHARS_TERMINATOR = 0xBD; // placed after the last real char

/** Screencode byte length (ASCII) embedded in export headers to identify the
 *  source platform group (c64/vic20/pet/c128vdc/c16). */
const GROUP_KEY_LEN = 6;

// ---- Helpers (shared PETSCII encoding) ----

const BLANK = 0x20;

function encodeName(name: string, width: number = PRESET_EXPORT_WIDTH, lastCell?: number): number[] {
  const row = Array(width).fill(BLANK);
  const limit = lastCell !== undefined ? width - 1 : width;
  for (let i = 0; i < Math.min(name.length, limit); i++) {
    const ch = name.charCodeAt(i);
    if (ch >= 65 && ch <= 90) row[i] = ch - 64;
    else if (ch >= 97 && ch <= 122) row[i] = ch - 96;
    else if (ch >= 48 && ch <= 57) row[i] = ch - 48 + 0x30;
    else row[i] = BLANK;
  }
  if (lastCell !== undefined) row[width - 1] = lastCell;
  return row;
}

function encodeSide(side: BoxSide, width: number = PRESET_EXPORT_WIDTH): { codes: number[]; colors: number[] } {
  const codes = Array(width).fill(BLANK);
  const colors = Array(width).fill(0);
  codes[0] = side.chars.length;
  for (let i = 0; i < side.chars.length; i++) {
    codes[1 + i] = side.chars[i];
    colors[1 + i] = side.colors[i] ?? 0;
  }
  codes[5] = side.mirror ? 1 : 0;
  codes[6] = side.stretch ? 1 : 0;
  codes[7] = side.repeat ? 1 : 0;
  codes[8] = side.startEnd === 'start' ? 1 : side.startEnd === 'end' ? 2 : side.startEnd === 'all' ? 3 : 0;
  return { codes, colors };
}

/** Write the 6-char platform group key into cells [start..start+6) of `row`.
 *  Used by both Box header rows (cols 9..14) and Texture options rows (cols 10..15). */
function writeGroupKey(row: number[], start: number, group: string): void {
  const gk = group.slice(0, GROUP_KEY_LEN).padEnd(GROUP_KEY_LEN, ' ');
  for (let i = 0; i < GROUP_KEY_LEN; i++) row[start + i] = gk.charCodeAt(i);
}

// ---- Public builders ----

/** Pad each row out to `targetWidth` with blank cells.  When `targetWidth`
 *  is less than or equal to the row length this is a no-op. */
function padPixelsToWidth(pixels: Pixel[][], targetWidth: number, textColor: number): Pixel[][] {
  return pixels.map(row => {
    if (row.length >= targetWidth) return row;
    const extra = Array(targetWidth - row.length).fill({ code: BLANK, color: textColor } as Pixel);
    return [...row, ...extra];
  });
}

/** Build the pixel matrix for a Box-presets export screen.  Rows are encoded
 *  at the canonical `PRESET_EXPORT_WIDTH` (24 cols) and then padded out to
 *  `targetWidth` so the matrix matches the host framebuffer dimensions.
 *
 *  When `forceForeground` is true, every cell's colour is set to `textColor`
 *  regardless of the preset's stored colours.  This is used for non-C64
 *  platform exports where preset colour indices (often 14 = Light Blue on
 *  C64) don't exist in the target palette and would render as black.
 *
 *  The padding is required for wider platform-matched frames (e.g. 80-col
 *  C128 VDC) where each row must fill the full width or CharGrid crashes
 *  on undefined cells. */
export function buildBoxesExportPixels(
  presets: BoxPreset[],
  group: string,
  textColor: number,
  targetWidth: number = PRESET_EXPORT_WIDTH,
  forceForeground: boolean = false,
): Pixel[][] {
  const W = PRESET_EXPORT_WIDTH;
  const PADDING_ROWS = 20;
  const fbPixels: Pixel[][] = [];
  /** Resolve a cell colour with optional force-to-foreground override. */
  const pick = (stored: number | undefined): number =>
    forceForeground ? textColor : (stored ?? textColor);
  for (const p of presets) {
    const hdr = Array(W).fill(BLANK);
    for (let i = 0; i < 4; i++) hdr[i] = p.corners[i];
    hdr[4] = p.fill === TRANSPARENT_SCREENCODE ? 0xFF : p.fill;
    hdr[5] = BOX_HEADER_MARKER;
    writeGroupKey(hdr, 9, group);
    const hdrColors = Array(W).fill(0);
    for (let i = 0; i < 4; i++) hdrColors[i] = pick(p.cornerColors[i]);
    hdrColors[4] = pick(p.fillColor);
    fbPixels.push(hdr.map((code, ci) => ({ code, color: hdrColors[ci] } as Pixel)));
    fbPixels.push(encodeName(p.name, W).map(code => ({ code, color: textColor } as Pixel)));
    for (const side of [p.top, p.bottom, p.left, p.right]) {
      const enc = encodeSide(side, W);
      fbPixels.push(enc.codes.map((code, ci) => ({ code, color: pick(enc.colors[ci]) } as Pixel)));
    }
    fbPixels.push(Array(W).fill({ code: BLANK, color: textColor } as Pixel));
  }
  for (let i = 0; i < PADDING_ROWS; i++) {
    fbPixels.push(Array(W).fill({ code: BLANK, color: textColor } as Pixel));
  }
  return padPixelsToWidth(fbPixels, targetWidth, textColor);
}

/** Build the pixel matrix for a Texture-presets export screen.  As with
 *  buildBoxesExportPixels, rows are encoded at the canonical 24-col export
 *  width and then padded out to `targetWidth` to match the host frame.
 *
 *  When `forceForeground` is true, every cell colour is set to `textColor`
 *  so non-C64 platform exports render with a visible foreground (PET is
 *  mono, so this is the only way to get a readable screen). */
export function buildTexturesExportPixels(
  presets: TexturePreset[],
  group: string,
  textColor: number,
  targetWidth: number = PRESET_EXPORT_WIDTH,
  forceForeground: boolean = false,
): Pixel[][] {
  const W = PRESET_EXPORT_WIDTH;
  const STRIP_W = 10;
  const PADDING_ROWS = 10;
  const fbPixels: Pixel[][] = [];
  const pick = (stored: number | undefined): number =>
    forceForeground ? textColor : (stored ?? textColor);
  for (const p of presets) {
    // Row 1: name row with NAME_MARKER at the last cell.
    const nameRow = encodeName(p.name, W, TEXTURE_NAME_MARKER).map(code => ({ code, color: textColor } as Pixel));
    fbPixels.push(nameRow);
    // Row 2: chars row with per-cell colors + terminator after the last real char.
    const chars = p.chars.slice(0, STRIP_W);
    const colors = p.colors.slice(0, STRIP_W);
    const charLen = chars.length;
    const charRow: Pixel[] = [];
    for (let c = 0; c < W; c++) {
      if (c < charLen) charRow.push({ code: chars[c] ?? BLANK, color: pick(colors[c]) });
      else if (c === charLen) charRow.push({ code: TEXTURE_CHARS_TERMINATOR, color: 0 });
      else charRow.push({ code: BLANK, color: textColor });
    }
    fbPixels.push(charRow);
    // Row 3: options row with group key embedded at cols 10..15.
    const opts = p.options ?? DEFAULT_TEXTURE_OPTIONS;
    const optsRow: number[] = Array(W).fill(BLANK);
    for (let c = 0; c < 6; c++) optsRow[c] = opts[c] ? 1 : 0;
    optsRow[6] = TEXTURE_OPTS_MARKER;
    optsRow[7] = p.random ? 1 : 0;
    writeGroupKey(optsRow, 10, group);
    const optsPixels: Pixel[] = optsRow.map((code, c) =>
      c < 6 || c === 6 || c === 7 || (c >= 10 && c < 16)
        ? { code, color: 0 }
        : { code, color: textColor }
    );
    fbPixels.push(optsPixels);
  }
  for (let i = 0; i < PADDING_ROWS; i++) {
    fbPixels.push(Array(W).fill({ code: BLANK, color: textColor } as Pixel));
  }
  return padPixelsToWidth(fbPixels, targetWidth, textColor);
}

/** Total character width of every preset export framebuffer. */
export const BOXES_EXPORT_WIDTH = PRESET_EXPORT_WIDTH;
export const TEXTURES_EXPORT_WIDTH = PRESET_EXPORT_WIDTH;

/** Describes the framebuffer shell (charset, width, background, foreground)
 *  that should host a preset-export for a given platform group so the
 *  exported screen renders with the matching ROM font and palette. */
export interface ExportFrameSpec {
  charset: string;
  width: number;
  backgroundColor: number;
  /** A valid foreground colour index for the group's palette.  Used both
   *  for name/padding rows and as the clamp target for preset cell colours
   *  when the export is platform-matched (see buildBoxesExportPixels etc.). */
  textColor: number;
}

/** Return a platform-matched framebuffer spec for the given preset group.
 *  - c64       → C64 upper ROM, 24 cols, fg=1 (White on dark-blue bg)
 *  - c16       → C16 upper ROM, 24 cols, fg=0x71 (TED white max luminance)
 *  - c128vdc   → C128 upper ROM, 80 cols, fg=15 (White in VDC palette)
 *  - vic20     → VIC-20 upper ROM, 24 cols, fg=1 (White)
 *  - pet       → PET GFX ROM, 24 cols, fg=1 (the single monochrome fg slot)
 *
 *  For anything other than c64, we force backgroundColor=0 because the
 *  other palettes don't share colour indices with C64 and the current
 *  framebuf's bg would render wrong on the target platform. */
export function getExportFrameSpec(group: string): ExportFrameSpec {
  switch (group) {
    // TED uses a 128-entry palette indexed as (lum << 4) | hue; 0x71 is
    // hue=1 (white) at lum=7 (max), giving a pure-white cell.
    case 'c16':     return { charset: 'c16Upper',   width: PRESET_EXPORT_WIDTH, backgroundColor: 0, textColor: 0x71 };
    case 'c128vdc': return { charset: 'c128Upper',  width: 80,                  backgroundColor: 0, textColor: 15   };
    case 'vic20':   return { charset: 'vic20Upper', width: PRESET_EXPORT_WIDTH, backgroundColor: 0, textColor: 1    };
    // PET is monochrome: slot 0 = background, slot 1 = foreground. Always
    // render text in slot 1 or the screen will be black on black.
    case 'pet':     return { charset: 'petGfx',     width: PRESET_EXPORT_WIDTH, backgroundColor: 0, textColor: 1    };
    default:        return { charset: 'upper',      width: PRESET_EXPORT_WIDTH, backgroundColor: 6, textColor: 1    };
  }
}
