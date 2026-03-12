// Port of the petsciiator conversion algorithm by EgonOlsen71
// https://github.com/EgonOlsen71/petsciiator
//
// Converts an arbitrary image into PETSCII screen codes + color indices
// using feature-vector based character matching.

import { Rgb, Font, Pixel } from '../redux/types';

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
}

export interface ConvertResult {
  framebuf: Pixel[][];
  backgroundColor: number;
}

/**
 * Render the guide image at its position/scale onto an offscreen canvas
 * matching the framebuf pixel dimensions, then convert to PETSCII.
 */
export function convertGuideLayerToPetscii(params: ConvertParams): Promise<ConvertResult> {
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

      // Draw guide image at position/scale
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const drawW = img.naturalWidth * scale;
      const drawH = img.naturalHeight * scale;
      ctx.drawImage(img, x, y, drawW, drawH);

      const imgPixels = ctx.getImageData(0, 0, pxW, pxH);

      // 2. Dither to palette
      const indexed = ditherToPalette(imgPixels.data, pxW, pxH, colorPalette);

      // 3. Find most frequent color → background
      const colorCounts = new Uint32Array(16);
      for (let i = 0; i < indexed.length; i++) {
        colorCounts[indexed[i]]++;
      }
      let bgIdx = backgroundColor;
      let bgMax = 0;
      for (let i = 0; i < 16; i++) {
        if (colorCounts[i] > bgMax) {
          bgMax = colorCounts[i];
          bgIdx = i;
        }
      }

      // 4. Build character feature vectors from font
      const charFeatures = buildCharFeatures(font.bits);

      // 5. For each 8×8 cell, determine foreground color + best character
      const framebuf: Pixel[][] = [];
      for (let cy = 0; cy < framebufHeight; cy++) {
        const row: Pixel[] = [];
        for (let cx = 0; cx < framebufWidth; cx++) {
          // Count non-bg colors in this cell
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

          // Find dominant foreground color
          let fgIdx = bgIdx === 0 ? 1 : 0;
          let fgMax = 0;
          for (let i = 0; i < 16; i++) {
            if (i !== bgIdx && cellCounts[i] > fgMax) {
              fgMax = cellCounts[i];
              fgIdx = i;
            }
          }

          // Find best matching character
          const screencode = getMatchingChar(charFeatures, cellQ);
          row.push({ code: screencode, color: fgIdx });
        }
        framebuf.push(row);
      }

      resolve({ framebuf, backgroundColor: bgIdx });
    };
    img.onerror = () => reject(new Error('Failed to load guide image'));
    img.src = imageData;
  });
}
