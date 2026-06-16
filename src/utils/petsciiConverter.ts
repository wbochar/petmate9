// Port of the petsciiator conversion algorithm by EgonOlsen71
// https://github.com/EgonOlsen71/petsciiator
// Used with Permission
// Converts an arbitrary image into PETSCII screen codes + color indices
// using feature-vector based character matching.

import { Rgb, Font, Pixel, PetsciiatorSettings } from '../redux/types';

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function getClosestColorIndex(r: number, g: number, b: number, palette: Rgb[]): number {
  let minDist = Infinity;
  let minIdx = 0;
  for (let i = 0; i < palette.length; i++) {
    const dr = r - palette[i].r;
    const dg = g - palette[i].g;
    const db = b - palette[i].b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < minDist) {
      minDist = dist;
      minIdx = i;
    }
  }
  return minIdx;
}

// ---------------------------------------------------------------------------
// Floyd-Steinberg dithering — maps RGBA pixels to palette color indices
// ---------------------------------------------------------------------------

function nearestColorToPalette(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  palette: Rgb[]
): Uint8Array {
  const indexed = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    indexed[i] = getClosestColorIndex(
      rgba[i * 4],
      rgba[i * 4 + 1],
      rgba[i * 4 + 2],
      palette
    );
  }
  return indexed;
}

function ditherToPalette(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  palette: Rgb[]
): Uint8Array {
  // Working copy as floats so error diffusion can go negative
  const r = new Float32Array(width * height);
  const g = new Float32Array(width * height);
  const b = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    r[i] = rgba[i * 4];
    g[i] = rgba[i * 4 + 1];
    b[i] = rgba[i * 4 + 2];
  }

  const indexed = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = y * width + x;
      const cr = Math.max(0, Math.min(255, Math.round(r[pos])));
      const cg = Math.max(0, Math.min(255, Math.round(g[pos])));
      const cb = Math.max(0, Math.min(255, Math.round(b[pos])));

      const idx = getClosestColorIndex(cr, cg, cb, palette);
      indexed[pos] = idx;

      const er = cr - palette[idx].r;
      const eg = cg - palette[idx].g;
      const eb = cb - palette[idx].b;

      // Distribute error
      if (x < width - 1) {
        const p = pos + 1;
        r[p] += er * 7 / 16;
        g[p] += eg * 7 / 16;
        b[p] += eb * 7 / 16;
      }
      if (x > 0 && y < height - 1) {
        const p = pos - 1 + width;
        r[p] += er * 3 / 16;
        g[p] += eg * 3 / 16;
        b[p] += eb * 3 / 16;
      }
      if (y < height - 1) {
        const p = pos + width;
        r[p] += er * 5 / 16;
        g[p] += eg * 5 / 16;
        b[p] += eb * 5 / 16;
      }
      if (x < width - 1 && y < height - 1) {
        const p = pos + width + 1;
        r[p] += er * 1 / 16;
        g[p] += eg * 1 / 16;
        b[p] += eb * 1 / 16;
      }
    }
  }
  return indexed;
}

// ---------------------------------------------------------------------------
// 10-dimensional feature vector (matches petsciiator's Petscii.java)
// ---------------------------------------------------------------------------

interface CharFeatures {
  q: Float32Array; // length 10
}

function countFeatures(x: number, y: number, q: Float32Array) {
  if (x < 4 && y < 4) q[0]++;
  if (x > 3 && y < 4) q[1]++;
  if (x < 4 && y > 3) q[2]++;
  if (x > 3 && y > 3) q[3]++;
  if (x > 2 && x < 7 && y > 2 && y < 7) q[4]++;
  if (x === y || (7 - y) === x) q[5]++;
  if (x === 0) q[6]++;
  if (x === 7) q[7]++;
  if (y === 0) q[8]++;
  if (y === 7) q[9]++;
}

/**
 * Precompute feature vectors for the first `numChars` glyphs of the font
 * bitmap.  fontBits is the flat array where each char is 8 consecutive
 * bytes, each byte being a row of 8 pixels (MSB = leftmost pixel).
 *
 * `numChars` defaults to 256 for compatibility; the C128 VDC charset
 * passes 512 so the converter can also pick alt-charset glyphs.
 */
function buildCharFeatures(fontBits: number[], numChars: number = 256): (CharFeatures | null)[] {
  const features: (CharFeatures | null)[] = [];
  for (let ch = 0; ch < numChars; ch++) {
    const q = new Float32Array(10);
    for (let py = 0; py < 8; py++) {
      const row = fontBits[ch * 8 + py];
      for (let px = 0; px < 8; px++) {
        if (row & (1 << (7 - px))) {
          countFeatures(px, py, q);
        }
      }
    }
    features.push({ q });
  }
  return features;
}

// ---------------------------------------------------------------------------
// VDC support helpers
// ---------------------------------------------------------------------------

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

function getMatchingChar(
  features: (CharFeatures | null)[],
  cellFeatures: Float32Array
): number {
  let bestDist = Infinity;
  let bestIdx = 32; // space as fallback
  for (let i = 0; i < features.length; i++) {
    const cf = features[i];
    if (!cf) continue;
    let dist = 0;
    for (let d = 0; d < 10; d++) {
      const diff = cf.q[d] - cellFeatures[d];
      dist += diff * diff;
    }
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// ---------------------------------------------------------------------------
// Grayscale detection helpers
// ---------------------------------------------------------------------------

const GRAY_THRESHOLD = 16; // max channel spread to consider a color achromatic

function isAchromaticColor(c: Rgb): boolean {
  const mx = Math.max(c.r, c.g, c.b);
  const mn = Math.min(c.r, c.g, c.b);
  return (mx - mn) <= GRAY_THRESHOLD;
}

/** Check whether every pixel in an 8×8 cell is grayscale. */
function isTileGrayscale(
  rgba: Uint8ClampedArray, imgWidth: number, cx: number, cy: number
): boolean {
  for (let py = 0; py < 8; py++) {
    for (let px = 0; px < 8; px++) {
      const i = ((cy * 8 + py) * imgWidth + (cx * 8 + px)) * 4;
      const mx = Math.max(rgba[i], rgba[i + 1], rgba[i + 2]);
      const mn = Math.min(rgba[i], rgba[i + 1], rgba[i + 2]);
      if (mx - mn > GRAY_THRESHOLD) return false;
    }
  }
  return true;
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
