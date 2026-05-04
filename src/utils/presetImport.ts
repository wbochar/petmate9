// Shared preset import decoders used by the Tools > Presets > Import All
// Presets menu command (and available for panel reuse if the duplicated
// per-panel decoders are ever consolidated).  The encoding matches
// buildBoxesExportPixels / buildTexturesExportPixels in presetExport.ts so
// imported frames round-trip any exports produced by the Boxes, Textures,
// and Separators panels.

import {
  BoxPreset,
  BoxSide,
  DEFAULT_TEXTURE_OPTIONS,
  Framebuf,
  LinePreset,
  Pixel,
  TexturePreset,
  TRANSPARENT_SCREENCODE,
} from '../redux/types';
import {
  BOX_HEADER_MARKER,
  PRESET_EXPORT_WIDTH,
  TEXTURE_CHARS_TERMINATOR,
  TEXTURE_NAME_MARKER,
  TEXTURE_OPTS_MARKER,
} from './presetExport';

// ---- Shared helpers ----

const BLANK = 0x20;
const STRIP_W = 16;
const KNOWN_GROUPS = new Set(['c64', 'vic20', 'pet', 'c128vdc', 'c16']);

/** PETSCII screencode → printable char (used for name rows). */
function decodeNameCodes(codes: number[]): string {
  let name = '';
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    if (c >= 1 && c <= 26) name += String.fromCharCode(c + 64);
    else if (c >= 0x30 && c <= 0x39) name += String.fromCharCode(c - 0x30 + 48);
    else if (c === 0x20) name += ' ';
    else name += '?';
  }
  return name.trimEnd();
}

/** Decode a single Box side (top/bottom/left/right) from one row of the
 *  exported frame, mirroring encodeSide() in presetExport.ts. */
function decodeBoxSide(codeRow: number[], colorRow: number[]): BoxSide {
  const count = Math.min(4, Math.max(1, codeRow[0]));
  const chars: number[] = [];
  const colors: number[] = [];
  for (let i = 0; i < count; i++) {
    chars.push(codeRow[1 + i] ?? 0x20);
    colors.push(colorRow[1 + i] ?? 14);
  }
  const seMap: Record<number, 'start' | 'end' | 'all' | 'none'> = {
    1: 'start', 2: 'end', 3: 'all',
  };
  return {
    chars,
    colors,
    mirror: codeRow[5] === 1,
    stretch: codeRow[6] === 1,
    repeat: codeRow[7] === 1,
    startEnd: seMap[codeRow[8]] ?? 'none',
  };
}

/** Decode a PETSCII screencode back to an ASCII lowercase character.
 *  Screencodes 1-26 → a-z, 0x30-0x39 → 0-9, 0x20 → space, else '?'. */
function decodeGroupChar(c: number): string {
  if (c >= 1 && c <= 26) return String.fromCharCode(c + 96);  // 1-26 → a-z
  if (c >= 0x30 && c <= 0x39) return String.fromCharCode(c - 0x30 + 48);  // 0-9
  if (c === 0x20) return ' ';
  // Legacy ASCII fallback: old exports wrote raw ASCII codes
  if (c >= 0x61 && c <= 0x7A) return String.fromCharCode(c);  // a-z
  if (c >= 0x41 && c <= 0x5A) return String.fromCharCode(c + 32);  // A-Z → a-z
  return '?';
}

/** Extract the 6-char platform group key embedded in a Box header row
 *  at columns 9..14, or null when no known group string is present. */
function decodeBoxGroupKey(hdrCodes: number[], width: number): string | null {
  if (width < 15) return null;
  let gk = '';
  for (let i = 0; i < 6; i++) {
    gk += decodeGroupChar(hdrCodes[9 + i]);
  }
  gk = gk.trim();
  return KNOWN_GROUPS.has(gk) ? gk : null;
}

/** Extract the 6-char platform group key embedded in a Texture options row
 *  at columns 10..15, or null when no known group string is present. */
function decodeTextureGroupKey(codes: number[]): string | null {
  if (codes.length < 16) return null;
  let gk = '';
  for (let i = 10; i < 16; i++) {
    gk += decodeGroupChar(codes[i]);
  }
  gk = gk.trim();
  return KNOWN_GROUPS.has(gk) ? gk : null;
}

// ---- Public decoders ----

export interface BoxImportResult {
  presets: BoxPreset[];
  /** Platform group key embedded in the exported header, or null when the
   *  frame is a legacy export that didn't carry one. */
  group: string | null;
}

/** Decode the Box presets in a framebuf produced by buildBoxesExportPixels.
 *  Returns null when the frame has no decodable header rows. */
export function importBoxPresetsFromFramebuf(fb: Framebuf): BoxImportResult | null {
  if (fb.width < 16) return null;
  const W = Math.min(PRESET_EXPORT_WIDTH, fb.width);
  const imported: BoxPreset[] = [];
  let group: string | null = null;
  let r = 0;
  while (r + 5 < fb.framebuf.length) {
    const hdrCodes = fb.framebuf[r].slice(0, W).map((p: Pixel) => p.code);
    const hdrColors = fb.framebuf[r].slice(0, W).map((p: Pixel) => p.color);
    if (hdrCodes[5] !== BOX_HEADER_MARKER) { r++; continue; }
    if (group === null) group = decodeBoxGroupKey(hdrCodes, W);
    const corners = [hdrCodes[0], hdrCodes[1], hdrCodes[2], hdrCodes[3]];
    const cornerColors = [hdrColors[0], hdrColors[1], hdrColors[2], hdrColors[3]];
    const fill = hdrCodes[4] === 0xFF ? TRANSPARENT_SCREENCODE : hdrCodes[4];
    const fillColor = hdrColors[4] ?? 14;
    const name = decodeNameCodes(fb.framebuf[r + 1].slice(0, W).map((p: Pixel) => p.code));
    const rc = (row: number) => fb.framebuf[r + row].slice(0, W);
    const top = decodeBoxSide(rc(2).map((p: Pixel) => p.code), rc(2).map((p: Pixel) => p.color));
    const bottom = decodeBoxSide(rc(3).map((p: Pixel) => p.code), rc(3).map((p: Pixel) => p.color));
    const left = decodeBoxSide(rc(4).map((p: Pixel) => p.code), rc(4).map((p: Pixel) => p.color));
    const right = decodeBoxSide(rc(5).map((p: Pixel) => p.code), rc(5).map((p: Pixel) => p.color));
    imported.push({
      name: name || `Box ${imported.length + 1}`,
      corners, cornerColors, top, bottom, left, right, fill, fillColor,
    });
    r += 7;
  }
  return imported.length > 0 ? { presets: imported, group } : null;
}

export interface TextureImportResult {
  presets: TexturePreset[];
  /** Platform group key embedded in the exported options row, or null when
   *  the frame is a legacy export that didn't carry one. */
  group: string | null;
}

/** Decode the Texture presets in a framebuf produced by
 *  buildTexturesExportPixels.  Returns null when the frame has no
 *  decodable texture rows. */
export function importTexturePresetsFromFramebuf(fb: Framebuf): TextureImportResult | null {
  const fbW = fb.width;
  const EXPORT_W = PRESET_EXPORT_WIDTH;
  const imported: TexturePreset[] = [];
  let group: string | null = null;
  let r = 0;
  while (r < fb.height) {
    const row = fb.framebuf[r];
    const codes = row.slice(0, fbW).map((p: Pixel) => p.code);
    if (codes.every((c: number) => c === BLANK)) { r++; continue; }

    let name = `Texture ${imported.length + 1}`;
    if (fbW >= EXPORT_W && codes[EXPORT_W - 1] === TEXTURE_NAME_MARKER) {
      // New-format export: dedicated name row with NAME_MARKER at last cell.
      const nameCodes = codes.slice(0, EXPORT_W - 1);
      name = decodeNameCodes(nameCodes);
      r++;
      if (r >= fb.height) break;
      const charRowRaw = fb.framebuf[r];
      const rawCodes = charRowRaw.slice(0, STRIP_W).map((p: Pixel) => p.code);
      const rawColors = charRowRaw.slice(0, STRIP_W).map((p: Pixel) => p.color);
      let charLen = rawCodes.indexOf(TEXTURE_CHARS_TERMINATOR);
      if (charLen < 0) charLen = rawCodes.length;
      const chars = rawCodes.slice(0, charLen);
      const colors = rawColors.slice(0, charLen);
      let options = [...DEFAULT_TEXTURE_OPTIONS];
      let random = false;
      let brushWidth = 8;
      let brushHeight = 8;
      let scale = 1;
      if (r + 1 < fb.height) {
        const nextRow = fb.framebuf[r + 1];
        const nextCodes = nextRow.slice(0, fbW).map((p: Pixel) => p.code);
        if (nextCodes[6] === TEXTURE_OPTS_MARKER) {
          options = [
            nextCodes[0] === 1, nextCodes[1] === 1, nextCodes[2] === 1,
            nextCodes[3] === 1, nextCodes[4] === 1, nextCodes[5] === 1,
          ];
          random = nextCodes[7] === 1;
          brushWidth = Math.max(1, Math.min(255, nextCodes[8] || 8));
          brushHeight = Math.max(1, Math.min(255, nextCodes[9] || 8));
          const rawScale = nextCodes[16];
          scale = (rawScale >= 1 && rawScale <= 8) ? rawScale : 1;
          if (group === null) group = decodeTextureGroupKey(nextCodes);
          r++;
        }
      }
      imported.push({
        name: name || `Texture ${imported.length + 1}`,
        chars, colors, options, random, brushWidth, brushHeight,
        ...(scale !== 1 ? { scale } : {}),
      });
      r++;
    } else {
      // Legacy-format export: no dedicated name row, just chars (+ optional options).
      const rawCodes2 = row.slice(0, STRIP_W).map((p: Pixel) => p.code);
      const rawColors2 = row.slice(0, STRIP_W).map((p: Pixel) => p.color);
      let charLen2 = rawCodes2.indexOf(TEXTURE_CHARS_TERMINATOR);
      if (charLen2 < 0) charLen2 = rawCodes2.length;
      const chars = rawCodes2.slice(0, charLen2);
      const colors = rawColors2.slice(0, charLen2);
      let options = [...DEFAULT_TEXTURE_OPTIONS];
      let random = false;
      let brushWidth = 8;
      let brushHeight = 8;
      let scale2 = 1;
      if (r + 1 < fb.height) {
        const nextRow = fb.framebuf[r + 1];
        const nextCodes = nextRow.slice(0, fbW).map((p: Pixel) => p.code);
        if (nextCodes[6] === TEXTURE_OPTS_MARKER) {
          options = [
            nextCodes[0] === 1, nextCodes[1] === 1, nextCodes[2] === 1,
            nextCodes[3] === 1, nextCodes[4] === 1, nextCodes[5] === 1,
          ];
          random = nextCodes[7] === 1;
          brushWidth = Math.max(1, Math.min(255, nextCodes[8] || 8));
          brushHeight = Math.max(1, Math.min(255, nextCodes[9] || 8));
          const rawScale2 = nextCodes[16];
          scale2 = (rawScale2 >= 1 && rawScale2 <= 8) ? rawScale2 : 1;
          if (group === null) group = decodeTextureGroupKey(nextCodes);
          r++;
        }
      }
      imported.push({ name, chars, colors, options, random, brushWidth, brushHeight, ...(scale2 !== 1 ? { scale: scale2 } : {}) });
      r++;
    }
  }
  return imported.length > 0 ? { presets: imported, group } : null;
}

export interface LineImportResult {
  presets: LinePreset[];
}

/** Decode the separator presets in a Lines_ framebuf.  Stops at the first
 *  fully blank row, matching the LinesPanel importer. */
export function importLinePresetsFromFramebuf(fb: Framebuf): LineImportResult | null {
  if (fb.width < 16) return null;
  const imported: LinePreset[] = [];
  for (let r = 0; r < fb.height; r++) {
    const row = fb.framebuf[r];
    const chars = row.slice(0, 16).map((p: Pixel) => p.code);
    if (chars.every((c: number) => c === BLANK)) break;
    imported.push({ name: `Line ${imported.length + 1}`, chars });
  }
  return imported.length > 0 ? { presets: imported } : null;
}
