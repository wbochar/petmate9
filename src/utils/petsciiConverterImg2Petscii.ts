// Port of the img2petscii conversion algorithm by Michel de Bree
// Used with Permission
// https://github.com/micheldebree/c64-tools/tree/main/img2petscii
//
// Tile-based pixel-by-pixel matching approach.
// Converts an arbitrary image into PETSCII screen codes + color indices.

import { Rgb, Font, Pixel, Img2PetsciiSettings } from '../redux/types';
import { ConvertParams, ConvertResult, buildMaskedPalette } from './petsciiConverter';

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

// Slow matcher: try all 256 chars × all foreground colors (excluding bg)
function bestMatchSlow(
  tile: Tile,
  fontBits: number[],
  palette: Rgb[],
  bgIdx: number,
  allowedColors?: Set<number>
): ScreenCell {
  let bestCode = 32;
  let bestColor = 0;
  let bestDist = Infinity;

  for (let color = 0; color < palette.length; color++) {
    if (color === bgIdx) continue;
    if (allowedColors && !allowedColors.has(color)) continue;
    const fgRgb = palette[color];
    const bgRgb = palette[bgIdx];
    for (let ch = 0; ch < 256; ch++) {
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

// Fast matcher: determine dominant fg color first, then try all 256 chars
function bestMatchFast(
  tile: Tile,
  fontBits: number[],
  palette: Rgb[],
  bgIdx: number,
  allowedColors?: Set<number>
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

  for (let ch = 0; ch < 256; ch++) {
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

export function convertGuideLayerImg2Petscii(
  params: ConvertParams,
  settings: Img2PetsciiSettings
): Promise<ConvertResult> {
  const {
    imageData, x, y, scale,
    framebufWidth, framebufHeight,
    font, colorPalette, backgroundColor
  } = params;

  const numFg = params.numFgColors ?? colorPalette.length;
  const workPalette = colorPalette.slice(0, numFg);

  const pxW = framebufWidth * 8;
  const pxH = framebufHeight * 8;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // 1. Render guide image onto offscreen canvas at framebuf resolution
      const canvas = document.createElement('canvas');
      canvas.width = pxW;
      canvas.height = pxH;
      const ctx = canvas.getContext('2d')!;

      // Fill with current background color (use original palette for visual accuracy)
      const bg = colorPalette[backgroundColor];
      ctx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`;
      ctx.fillRect(0, 0, pxW, pxH);

      // Draw guide image at position/scale with non-destructive filters
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const filters: string[] = [];
      if (params.grayscale) filters.push('grayscale(1)');
      if (params.brightness !== 100) filters.push(`brightness(${params.brightness / 100})`);
      if (params.contrast !== 100) filters.push(`contrast(${params.contrast / 100})`);
      if (params.hue !== 0) filters.push(`hue-rotate(${params.hue}deg)`);
      if (params.saturation !== 100) filters.push(`saturate(${params.saturation / 100})`);
      if (filters.length > 0) ctx.filter = filters.join(' ');
      const psx = params.pixelStretchX ?? 1;
      const drawW = img.naturalWidth * scale / psx;
      const drawH = img.naturalHeight * scale;
      ctx.drawImage(img, x, y, drawW, drawH);
      ctx.filter = 'none';

      // Apply mono mode if enabled
      if (settings.monoMode) {
        const imgData = ctx.getImageData(0, 0, pxW, pxH);
        const px = imgData.data;
        const threshold = settings.monoThreshold;
        for (let i = 0; i < px.length; i += 4) {
          const gray = Math.round(px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114);
          const bw = gray >= threshold ? 255 : 0;
          px[i] = bw;
          px[i + 1] = bw;
          px[i + 2] = bw;
        }
        ctx.putImageData(imgData, 0, 0);
      }

      const imgPixels = ctx.getImageData(0, 0, pxW, pxH);

      // 2. Build masked palette from colorMask
      let preBgIdx = backgroundColor;
      if (preBgIdx >= numFg) preBgIdx = getClosestColorIndex(colorPalette[preBgIdx].r, colorPalette[preBgIdx].g, colorPalette[preBgIdx].b, workPalette);
      const { allowedColors: maskAllowed, maskedPalette } = buildMaskedPalette(workPalette, params.colorMask, preBgIdx);

      // 3. Find most frequent color → background
      const indexed = quantizeToPalette(imgPixels.data, pxW, pxH, maskedPalette);
      let bgIdx = backgroundColor;
      // Clamp forced bg to usable range
      if (bgIdx >= numFg) {
        const c = colorPalette[bgIdx];
        bgIdx = getClosestColorIndex(c.r, c.g, c.b, workPalette);
      }
      if (!params.forceBackgroundColor) {
        const imgX0 = Math.max(0, Math.floor(x));
        const imgY0 = Math.max(0, Math.floor(y));
        const imgX1 = Math.min(pxW, Math.ceil(x + drawW));
        const imgY1 = Math.min(pxH, Math.ceil(y + drawH));
        const colorCounts = new Uint32Array(numFg);
        for (let py = imgY0; py < imgY1; py++) {
          for (let px = imgX0; px < imgX1; px++) {
            colorCounts[indexed[py * pxW + px]]++;
          }
        }
        let bgMax = 0;
        for (let i = 0; i < numFg; i++) {
          if (colorCounts[i] > bgMax) {
            bgMax = colorCounts[i];
            bgIdx = i;
          }
        }
      }

      // 4. For each 8×8 cell, find best character + color match
      const matchFn = settings.matcherMode === 'fast' ? bestMatchFast : bestMatchSlow;
      // In mono mode, always use fast matcher
      const matcher = settings.monoMode ? bestMatchFast : matchFn;

      // Identify achromatic palette entries for grayscale tile handling
      const grayColors = new Set<number>();
      for (let i = 0; i < numFg; i++) {
        if (isAchromaticColor(workPalette[i])) grayColors.add(i);
      }

      const framebuf: Pixel[][] = [];
      let cy = 0;
      const processRow = () => {
        if (cy >= framebufHeight) {
          resolve({ framebuf, backgroundColor: bgIdx });
          return;
        }
        const row: Pixel[] = [];
        for (let cx = 0; cx < framebufWidth; cx++) {
          const tile = extractTile(imgPixels.data, pxW, cx, cy);
          // Combine grayscale restriction with palette mask
          let allowed: Set<number> | undefined;
          const tileGray = isTileGrayscale(tile);
          if (tileGray && maskAllowed) {
            allowed = new Set([...grayColors].filter(c => maskAllowed.has(c)));
          } else if (tileGray) {
            allowed = grayColors;
          } else {
            allowed = maskAllowed;
          }
          const cell = matcher(tile, font.bits, workPalette, bgIdx, allowed);
          row.push({ code: cell.code, color: cell.color });
        }
        framebuf.push(row);
        cy++;
        params.onProgress?.(cy / framebufHeight);
        setTimeout(processRow, 0);
      };
      processRow();
    };
    img.onerror = () => reject(new Error('Failed to load guide image'));
    img.src = imageData;
  });
}
