// Shared types + helpers for the PETSCII conversion pipeline, plus the
// petsciiator-flavored entry point used by the Guide Layer panel.
//
// All actual conversion work (dithering, tile/feature matching, etc.) runs
// in the worker-pool dispatcher (see petsciiConvertDispatcher.ts ->
// src/utils/converters/convertCore.ts, executed in src/workers/
// petsciiConvertWorker.ts). This file previously also carried a full
// synchronous port of the petsciiator algorithm (feature-vector character
// matching, Floyd-Steinberg dithering, etc.), but nothing called it --
// convertGuideLayerToPetscii below has always just delegated to the worker
// dispatcher. That dead code has been removed; only the genuinely-used
// exports remain.

import { Rgb, Font, Pixel, PetsciiatorSettings } from '../redux/types';

/** Number of glyphs the converter should consider for the given font.
 *  C128 VDC carries 512 glyphs (256 lower + 256 alt-charset); every
 *  other charset carries 256.  Detected via the font's `charOrder`
 *  length so unrelated custom fonts keep the legacy 256-only path. */
export function getCharLimit(font: Font): number {
  return font.charOrder.length >= 512 ? 512 : 256;
}

/** Build a result Pixel for the converter output.
 *
 *  - Non-VDC: returns the legacy `{ code, color }` shape byte-for-byte.
 *  - VDC: encodes the upper bank (codes 256–511) as `code = sc & 0xff`
 *    plus the ALTCHAR bit (0x80) in `attr`, with the low nibble of
 *    `attr` mirroring `color` so the VDC framebuf invariant
 *    (attr low-nibble == color) holds for every cell the converter
 *    writes.  This matches `applyVdcSet`'s screencode handling. */
export function buildResultPixel(sc: number, color: number, isVdc: boolean): Pixel {
  if (!isVdc) {
    return { code: sc, color };
  }
  const altBit = sc >= 256 ? 0x80 : 0x00;
  return {
    code: sc & 0xff,
    color,
    attr: ((color & 0x0f) | altBit) & 0xff,
  };
}

// ---------------------------------------------------------------------------
// Main conversion entry point
// ---------------------------------------------------------------------------

export interface ConvertParams {
  imageData: string;        // data URL of the guide image
  x: number;                // guide offset X in pixels
  y: number;                // guide offset Y in pixels
  scale: number;            // guide scale multiplier
  framebufWidth: number;    // in chars
  framebufHeight: number;   // in chars
  font: Font;               // current charset font
  colorPalette: Rgb[];      // current color palette
  backgroundColor: number;  // current background color index
  grayscale: boolean;       // non-destructive grayscale
  brightness: number;       // 0–200, 100 = normal
  contrast: number;         // 0–200, 100 = normal
  hue: number;              // −180–180, 0 = no shift
  saturation: number;       // 0–200, 100 = normal
  onProgress?: (fraction: number) => void; // 0–1 progress callback
  forceBackgroundColor: boolean; // skip auto-detection, use document bg
  numFgColors?: number;     // usable foreground color count (default: palette length)
                            // C64/VDC: 16, VIC-20: 8, PET: 2, C16: 128
  pixelStretchX?: number;   // display pixel aspect ratio (default: 1)
                            // VDC 80-col: 0.5, VIC-20: 2, others: 1
  colorMask?: boolean[];    // per-color toggle; undefined = all enabled
}

export interface ConvertResult {
  framebuf: Pixel[][];
  backgroundColor: number;
}

/**
 * Build allowed color set and a masked palette from a colorMask.
 * Disabled colors in the masked palette are replaced with the nearest
 * enabled color so dithering naturally avoids them.
 */
export function buildMaskedPalette(
  palette: Rgb[],
  colorMask: boolean[] | undefined,
  bgIdx: number
): { allowedColors: Set<number> | undefined; maskedPalette: Rgb[]; maskedBgIdx: number; indexMap: number[] } {
  const clampIdx = Math.max(0, Math.min(palette.length - 1, bgIdx));
  if (!colorMask) {
    return {
      allowedColors: undefined,
      maskedPalette: palette,
      maskedBgIdx: clampIdx,
      indexMap: Array.from({ length: palette.length }, (_, i) => i),
    };
  }
  const allowed = new Set<number>();
  for (let i = 0; i < palette.length; i++) {
    if (colorMask[i] !== false) allowed.add(i);
  }
  if (allowed.size === 0) allowed.add(clampIdx);
  const nearestAllowed = (source: number): number => {
    if (allowed.has(source)) return source;
    let bestDist = Infinity;
    let bestIdx = [...allowed][0];
    for (const ai of allowed) {
      const dr = palette[source].r - palette[ai].r;
      const dg = palette[source].g - palette[ai].g;
      const db = palette[source].b - palette[ai].b;
      const d = dr * dr + dg * dg + db * db;
      if (d < bestDist) { bestDist = d; bestIdx = ai; }
    }
    return bestIdx;
  };
  const maskedBgIdx = nearestAllowed(clampIdx);
  const indexMap = Array.from({ length: palette.length }, (_, i) => nearestAllowed(i));
  // If all colors are allowed, short-circuit
  if (allowed.size >= palette.length) {
    return {
      allowedColors: undefined,
      maskedPalette: palette,
      maskedBgIdx,
      indexMap: Array.from({ length: palette.length }, (_, i) => i),
    };
  }
  // Build a masked copy where disabled entries → nearest enabled color
  const masked = palette.map((c, i) => {
    if (allowed.has(i)) return c;
    return palette[indexMap[i]];
  });
  return { allowedColors: allowed, maskedPalette: masked, maskedBgIdx, indexMap };
}

/**
 * Render the guide image at its position/scale onto an offscreen canvas
 * matching the framebuf pixel dimensions, then convert to PETSCII.
 *
 * Delegates all heavy computation to a pool of Web Workers via the
 * dispatcher.  The main thread only handles image rendering (Canvas/CSS
 * filters) and progress callbacks.
 */
export function convertGuideLayerToPetscii(
  params: ConvertParams,
  settings?: PetsciiatorSettings
): Promise<ConvertResult> {
  const { dispatchConversion } = require('./petsciiConvertDispatcher');
  return dispatchConversion({
    ...params,
    converter: 'petsciiator' as const,
    petsciiatorSettings: settings ?? { dithering: true },
  });
}
