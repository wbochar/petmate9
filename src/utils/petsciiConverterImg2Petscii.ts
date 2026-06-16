// Port of the img2petscii conversion algorithm by Michel de Bree
// Used with Permission
// https://github.com/micheldebree/c64-tools/tree/main/img2petscii
//
// Tile-based pixel-by-pixel matching approach.
// Converts an arbitrary image into PETSCII screen codes + color indices.

import { Rgb, Font, Pixel, Img2PetsciiSettings } from '../redux/types';
import { ConvertParams, ConvertResult, buildMaskedPalette, buildResultPixel, getCharLimit } from './petsciiConverter';

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

// Quantize RGBA image data to palette indices (nearest color, no dithering)
function quantizeToPalette(
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

// ---------------------------------------------------------------------------
// Tile types and helpers
// ---------------------------------------------------------------------------

// A Tile is an 8x8 grid of [r, g, b] pixel colors
type PixelColor = [number, number, number];
type Tile = PixelColor[][];

function pixelDistance(p1: PixelColor, p2: PixelColor): number {
  return Math.sqrt(
    (p1[0] - p2[0]) ** 2 +
    (p1[1] - p2[1]) ** 2 +
    (p1[2] - p2[2]) ** 2
  );
}

function tileDistance(t1: Tile, t2: Tile): number {
  let sum = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      sum += pixelDistance(t1[y][x], t2[y][x]);
    }
  }
  return sum;
}

// Build a rendered tile from a character glyph + foreground/background colors
function charToTile(
  fontBits: number[],
  charIndex: number,
  fgColor: Rgb,
  bgColor: Rgb
): Tile {
  const tile: Tile = [];
  for (let py = 0; py < 8; py++) {
    const row: PixelColor[] = [];
    const byte = fontBits[charIndex * 8 + py];
    for (let px = 0; px < 8; px++) {
      if (byte & (1 << (7 - px))) {
        row.push([fgColor.r, fgColor.g, fgColor.b]);
      } else {
        row.push([bgColor.r, bgColor.g, bgColor.b]);
      }
    }
    tile.push(row);
  }
  return tile;
}

// Extract an 8x8 tile from the RGBA image at cell position (cx, cy)
function extractTile(
  rgba: Uint8ClampedArray,
  imgWidth: number,
  cx: number,
  cy: number
): Tile {
  const tile: Tile = [];
  for (let py = 0; py < 8; py++) {
    const row: PixelColor[] = [];
    for (let px = 0; px < 8; px++) {
      const i = ((cy * 8 + py) * imgWidth + (cx * 8 + px)) * 4;
      row.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
    }
    tile.push(row);
  }
  return tile;
}

// Find the most occurring palette index in an array, optionally excluding one
function mostOccurringColor(indices: number[], numColors: number, exclude?: number): number {
  const counts = new Uint32Array(numColors);
  for (const idx of indices) {
    if (idx !== exclude) counts[idx]++;
  }
  let best = 0;
  let bestCount = 0;
  for (let i = 0; i < numColors; i++) {
    if (counts[i] > bestCount) {
      bestCount = counts[i];
      best = i;
    }
  }
  return best;
}

// Quantize a tile to palette indices
function quantizeTile(
  tile: Tile,
  palette: Rgb[]
): number[] {
  const indices: number[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const [r, g, b] = tile[y][x];
      indices.push(getClosestColorIndex(r, g, b, palette));
    }
  }
  return indices;
}

// ---------------------------------------------------------------------------
// Grayscale detection helpers
// ---------------------------------------------------------------------------

const GRAY_THRESHOLD = 16;

function isAchromaticColor(c: Rgb): boolean {
  const mx = Math.max(c.r, c.g, c.b);
  const mn = Math.min(c.r, c.g, c.b);
  return (mx - mn) <= GRAY_THRESHOLD;
}

function isTileGrayscale(tile: Tile): boolean {
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const [r, g, b] = tile[y][x];
      if (Math.max(r, g, b) - Math.min(r, g, b) > GRAY_THRESHOLD) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Matchers
// ---------------------------------------------------------------------------

interface ScreenCell {
  code: number;
  color: number;
}

// Slow matcher: try all `numChars` chars × all foreground colors (excluding bg).
// `numChars` is 256 for legacy fonts and 512 for the C128 VDC dual-bank charset.
function bestMatchSlow(
  tile: Tile,
  fontBits: number[],
  palette: Rgb[],
  bgIdx: number,
  allowedColors: Set<number> | undefined,
  numChars: number
): ScreenCell {
  let bestCode = 32;
  let bestColor = 0;
  let bestDist = Infinity;

  for (let color = 0; color < palette.length; color++) {
    if (color === bgIdx) continue;
    if (allowedColors && !allowedColors.has(color)) continue;
    const fgRgb = palette[color];
    const bgRgb = palette[bgIdx];
    for (let ch = 0; ch < numChars; ch++) {
      const charTile = charToTile(fontBits, ch, fgRgb, bgRgb);
      const dist = tileDistance(tile, charTile);
      if (dist < bestDist) {
        bestDist = dist;
        bestCode = ch;
        bestColor = color;
      }
    }
  }

  return { code: bestCode, color: bestColor };
}

// Fast matcher: determine dominant fg color first, then try all `numChars` chars.
function bestMatchFast(
  tile: Tile,
  fontBits: number[],
  palette: Rgb[],
  bgIdx: number,
  allowedColors: Set<number> | undefined,
  numChars: number
): ScreenCell {
  const tileIndices = quantizeTile(tile, palette);
  let fgIdx: number;
  if (allowedColors) {
    // Restrict to allowed colors
    const counts = new Uint32Array(palette.length);
    for (const idx of tileIndices) { if (idx !== bgIdx && allowedColors.has(idx)) counts[idx]++; }
    fgIdx = 0; let best = 0;
    for (let i = 0; i < palette.length; i++) { if (counts[i] > best) { best = counts[i]; fgIdx = i; } }
    if (best === 0) fgIdx = allowedColors.values().next().value ?? (bgIdx === 0 ? 1 : 0);
  } else {
    fgIdx = mostOccurringColor(tileIndices, palette.length, bgIdx);
  }

  const fgRgb = palette[fgIdx];
  const bgRgb = palette[bgIdx];

  let bestCode = 32;
  let bestDist = Infinity;

  for (let ch = 0; ch < numChars; ch++) {
    const charTile = charToTile(fontBits, ch, fgRgb, bgRgb);
    const dist = tileDistance(tile, charTile);
    if (dist < bestDist) {
      bestDist = dist;
      bestCode = ch;
    }
  }

  return { code: bestCode, color: fgIdx };
}

// ---------------------------------------------------------------------------
// Main conversion entry point
// ---------------------------------------------------------------------------

/**
 * Delegates all heavy computation to the worker-pool dispatcher.
 * The main thread only handles image rendering (Canvas/CSS filters)
 * and progress callbacks.
 */
export function convertGuideLayerImg2Petscii(
  params: ConvertParams,
  settings: Img2PetsciiSettings
): Promise<ConvertResult> {
  const { dispatchConversion } = require('./petsciiConvertDispatcher');
  return dispatchConversion({
    ...params,
    converter: 'img2petscii' as const,
    img2petsciiSettings: settings,
  });
}
