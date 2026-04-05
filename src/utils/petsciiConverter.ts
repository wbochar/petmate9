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
 * Precompute feature vectors for all 256 characters from the font bitmap.
 * fontBits is the flat array where each char is 8 consecutive bytes,
 * each byte being a row of 8 pixels (MSB = leftmost pixel).
 */
function buildCharFeatures(fontBits: number[]): (CharFeatures | null)[] {
  const features: (CharFeatures | null)[] = [];
  for (let ch = 0; ch < 256; ch++) {
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
  colorPalette: Rgb[];      // current color palette (16 entries)
  backgroundColor: number;  // current background color index
  grayscale: boolean;       // non-destructive grayscale
  brightness: number;       // 0–200, 100 = normal
  contrast: number;         // 0–200, 100 = normal
  onProgress?: (fraction: number) => void; // 0–1 progress callback
  forceBackgroundColor: boolean; // skip auto-detection, use document bg
}

export interface ConvertResult {
  framebuf: Pixel[][];
  backgroundColor: number;
}

/**
 * Render the guide image at its position/scale onto an offscreen canvas
 * matching the framebuf pixel dimensions, then convert to PETSCII.
 */
export function convertGuideLayerToPetscii(
  params: ConvertParams,
  settings?: PetsciiatorSettings
): Promise<ConvertResult> {
  const {
    imageData, x, y, scale,
    framebufWidth, framebufHeight,
    font, colorPalette, backgroundColor
  } = params;

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

      // Fill with current background color
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
      if (filters.length > 0) ctx.filter = filters.join(' ');
      const drawW = img.naturalWidth * scale;
      const drawH = img.naturalHeight * scale;
      ctx.drawImage(img, x, y, drawW, drawH);
      ctx.filter = 'none';

      const imgPixels = ctx.getImageData(0, 0, pxW, pxH);

      // 2. Dither to palette (or nearest-color if dithering is disabled)
      const useDither = settings?.dithering ?? true;
      const indexed = useDither
        ? ditherToPalette(imgPixels.data, pxW, pxH, colorPalette)
        : nearestColorToPalette(imgPixels.data, pxW, pxH, colorPalette);

      // 3. Find most frequent color → background
      //    When forceBackgroundColor is set, keep the document's bg color.
      let bgIdx = backgroundColor;
      if (!params.forceBackgroundColor) {
        const imgX0 = Math.max(0, Math.floor(x));
        const imgY0 = Math.max(0, Math.floor(y));
        const imgX1 = Math.min(pxW, Math.ceil(x + drawW));
        const imgY1 = Math.min(pxH, Math.ceil(y + drawH));
        const colorCounts = new Uint32Array(16);
        for (let py = imgY0; py < imgY1; py++) {
          for (let px = imgX0; px < imgX1; px++) {
            colorCounts[indexed[py * pxW + px]]++;
          }
        }
        let bgMax = 0;
        for (let i = 0; i < 16; i++) {
          if (colorCounts[i] > bgMax) {
            bgMax = colorCounts[i];
            bgIdx = i;
          }
        }
      }

      // 4. Build character feature vectors from font
      const charFeatures = buildCharFeatures(font.bits);

      // Identify achromatic palette entries for grayscale tile handling
      const grayIndices = new Set<number>();
      for (let i = 0; i < colorPalette.length; i++) {
        if (isAchromaticColor(colorPalette[i])) grayIndices.add(i);
      }

      // 5. For each 8×8 cell, determine foreground color + best character
      //    Process row-by-row with yielding so progress can update.
      const framebuf: Pixel[][] = [];
      let cy = 0;
      const processRow = () => {
        if (cy >= framebufHeight) {
          resolve({ framebuf, backgroundColor: bgIdx });
          return;
        }
        const row: Pixel[] = [];
        for (let cx = 0; cx < framebufWidth; cx++) {
          const tileIsGray = isTileGrayscale(imgPixels.data, pxW, cx, cy);

          const cellCounts = new Uint32Array(16);
          const cellQ = new Float32Array(10);

          for (let py = 0; py < 8; py++) {
            for (let px = 0; px < 8; px++) {
              const idx = indexed[(cy * 8 + py) * pxW + (cx * 8 + px)];
              if (idx !== bgIdx) {
                cellCounts[idx]++;
                countFeatures(px, py, cellQ);
              }
            }
          }

          let fgIdx = bgIdx === 0 ? 1 : 0;
          let fgMax = 0;
          for (let i = 0; i < 16; i++) {
            if (i === bgIdx) continue;
            if (tileIsGray && !grayIndices.has(i)) continue;
            if (cellCounts[i] > fgMax) {
              fgMax = cellCounts[i];
              fgIdx = i;
            }
          }

          const screencode = getMatchingChar(charFeatures, cellQ);
          row.push({ code: screencode, color: fgIdx });
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
