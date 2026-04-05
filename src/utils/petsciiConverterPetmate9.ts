// Pet9scii Converter — enhanced PETSCII converter
//  wbochar 4/5/2026
//  • CIE L*a*b* perceptual color distance instead of Euclidean RGB
//  • SSIM-inspired structural similarity for tile matching
//  • Blendable weight between color accuracy and structural match
//  • Multiple dithering modes: Floyd-Steinberg, Bayer 4×4, Bayer 2×2, none
//  • Two-pass candidate filtering: luminance pre-filter → detailed match on top-N

import { Rgb, Font, Pixel, Petmate9Settings } from '../redux/types';
import { ConvertParams, ConvertResult } from './petsciiConverter';

// ---------------------------------------------------------------------------
// CIE L*a*b* color space conversion
// ---------------------------------------------------------------------------

interface Lab { L: number; a: number; b: number; }

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

// D65 reference white
const Xn = 0.95047, Yn = 1.00000, Zn = 1.08883;

function fLab(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116;
}

function rgbToLab(r: number, g: number, b: number): Lab {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  // sRGB → XYZ (D65)
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / Xn;
  const y = (0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb) / Yn;
  const z = (0.0193339 * lr + 0.0284597 * lg + 0.1146098 * lb) / Zn;
  const fx = fLab(x), fy = fLab(y), fz = fLab(z);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

// Squared CIE76 distance in Lab space (perceptual)
function labDistSq(a: Lab, b: Lab): number {
  const dL = a.L - b.L, da = a.a - b.a, db = a.b - b.b;
  return dL * dL + da * da + db * db;
}

// ---------------------------------------------------------------------------
// Precomputed palette in Lab
// ---------------------------------------------------------------------------

function buildLabPalette(palette: Rgb[]): Lab[] {
  return palette.map(c => rgbToLab(c.r, c.g, c.b));
}

function getClosestColorIndexLab(lab: Lab, paletteLab: Lab[]): number {
  let minDist = Infinity, minIdx = 0;
  for (let i = 0; i < paletteLab.length; i++) {
    const d = labDistSq(lab, paletteLab[i]);
    if (d < minDist) { minDist = d; minIdx = i; }
  }
  return minIdx;
}

// ---------------------------------------------------------------------------
// Dithering modes
// ---------------------------------------------------------------------------

// Bayer matrices
const BAYER_2x2 = [
  [0, 2],
  [3, 1],
];
const BAYER_4x4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5],
];

function bayerDither(
  rgba: Uint8ClampedArray, width: number, height: number,
  paletteLab: Lab[], palette: Rgb[], matrix: number[][], size: number
): Uint8Array {
  const indexed = new Uint8Array(width * height);
  const scale = 64 / (size * size); // spread amount
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = y * width + x;
      const threshold = (matrix[y % size][x % size] / (size * size) - 0.5) * scale;
      const r = Math.max(0, Math.min(255, rgba[pos * 4]     + threshold));
      const g = Math.max(0, Math.min(255, rgba[pos * 4 + 1] + threshold));
      const b = Math.max(0, Math.min(255, rgba[pos * 4 + 2] + threshold));
      const lab = rgbToLab(r, g, b);
      indexed[pos] = getClosestColorIndexLab(lab, paletteLab);
    }
  }
  return indexed;
}

function floydSteinbergDitherLab(
  rgba: Uint8ClampedArray, width: number, height: number,
  paletteLab: Lab[], palette: Rgb[]
): Uint8Array {
  const r = new Float32Array(width * height);
  const g = new Float32Array(width * height);
  const b = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    r[i] = rgba[i * 4]; g[i] = rgba[i * 4 + 1]; b[i] = rgba[i * 4 + 2];
  }
  const indexed = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = y * width + x;
      const cr = Math.max(0, Math.min(255, Math.round(r[pos])));
      const cg = Math.max(0, Math.min(255, Math.round(g[pos])));
      const cb = Math.max(0, Math.min(255, Math.round(b[pos])));
      const lab = rgbToLab(cr, cg, cb);
      const idx = getClosestColorIndexLab(lab, paletteLab);
      indexed[pos] = idx;
      const er = cr - palette[idx].r;
      const eg = cg - palette[idx].g;
      const eb = cb - palette[idx].b;
      if (x < width - 1)                    { const p = pos + 1;         r[p] += er * 7/16; g[p] += eg * 7/16; b[p] += eb * 7/16; }
      if (x > 0 && y < height - 1)          { const p = pos - 1 + width; r[p] += er * 3/16; g[p] += eg * 3/16; b[p] += eb * 3/16; }
      if (y < height - 1)                   { const p = pos + width;     r[p] += er * 5/16; g[p] += eg * 5/16; b[p] += eb * 5/16; }
      if (x < width - 1 && y < height - 1)  { const p = pos + width + 1; r[p] += er * 1/16; g[p] += eg * 1/16; b[p] += eb * 1/16; }
    }
  }
  return indexed;
}

function nearestColorLab(
  rgba: Uint8ClampedArray, width: number, height: number,
  paletteLab: Lab[]
): Uint8Array {
  const indexed = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const lab = rgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    indexed[i] = getClosestColorIndexLab(lab, paletteLab);
  }
  return indexed;
}

type DitherMode = 'floyd-steinberg' | 'bayer4x4' | 'bayer2x2' | 'none';

function applyDither(
  rgba: Uint8ClampedArray, width: number, height: number,
  paletteLab: Lab[], palette: Rgb[], mode: DitherMode
): Uint8Array {
  switch (mode) {
    case 'floyd-steinberg': return floydSteinbergDitherLab(rgba, width, height, paletteLab, palette);
    case 'bayer4x4':        return bayerDither(rgba, width, height, paletteLab, palette, BAYER_4x4, 4);
    case 'bayer2x2':        return bayerDither(rgba, width, height, paletteLab, palette, BAYER_2x2, 2);
    case 'none':            return nearestColorLab(rgba, width, height, paletteLab);
  }
}

// ---------------------------------------------------------------------------
// SSIM-inspired structural similarity for 8×8 tiles
// ---------------------------------------------------------------------------

// Operates on flat luminance arrays (64 values each).
// Simplified SSIM: compares mean, variance, and covariance.
const C1 = 6.5025;  // (0.01*255)^2
const C2 = 58.5225; // (0.03*255)^2

function ssim8x8(a: Float32Array, b: Float32Array): number {
  let sumA = 0, sumB = 0;
  for (let i = 0; i < 64; i++) { sumA += a[i]; sumB += b[i]; }
  const muA = sumA / 64, muB = sumB / 64;
  let sigAA = 0, sigBB = 0, sigAB = 0;
  for (let i = 0; i < 64; i++) {
    const da = a[i] - muA, db = b[i] - muB;
    sigAA += da * da; sigBB += db * db; sigAB += da * db;
  }
  sigAA /= 63; sigBB /= 63; sigAB /= 63;
  const num = (2 * muA * muB + C1) * (2 * sigAB + C2);
  const den = (muA * muA + muB * muB + C1) * (sigAA + sigBB + C2);
  return num / den; // 1.0 = identical, lower = more different
}

// Convert RGB triplet to luminance (0-255)
function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// ---------------------------------------------------------------------------
// Tile helpers
// ---------------------------------------------------------------------------

// Build luminance tile for a rendered character glyph
function charLumaTile(
  fontBits: number[], ch: number, fgLuma: number, bgLuma: number
): Float32Array {
  const tile = new Float32Array(64);
  for (let py = 0; py < 8; py++) {
    const byte = fontBits[ch * 8 + py];
    for (let px = 0; px < 8; px++) {
      tile[py * 8 + px] = (byte & (1 << (7 - px))) ? fgLuma : bgLuma;
    }
  }
  return tile;
}

// Build Lab tile for a rendered character glyph
function charLabTile(
  fontBits: number[], ch: number, fgLab: Lab, bgLab: Lab
): Lab[] {
  const tile: Lab[] = new Array(64);
  for (let py = 0; py < 8; py++) {
    const byte = fontBits[ch * 8 + py];
    for (let px = 0; px < 8; px++) {
      tile[py * 8 + px] = (byte & (1 << (7 - px))) ? fgLab : bgLab;
    }
  }
  return tile;
}

// Lab color distance for an entire 8×8 tile (sum of squared CIE76 distances)
function tileLabDist(src: Lab[], candidate: Lab[]): number {
  let sum = 0;
  for (let i = 0; i < 64; i++) sum += labDistSq(src[i], candidate[i]);
  return sum;
}

// Extract luminance tile from RGBA at cell position
function extractLumaTile(
  rgba: Uint8ClampedArray, imgWidth: number, cx: number, cy: number
): Float32Array {
  const tile = new Float32Array(64);
  for (let py = 0; py < 8; py++) {
    for (let px = 0; px < 8; px++) {
      const i = ((cy * 8 + py) * imgWidth + (cx * 8 + px)) * 4;
      tile[py * 8 + px] = luminance(rgba[i], rgba[i + 1], rgba[i + 2]);
    }
  }
  return tile;
}

// Extract Lab tile from RGBA at cell position
function extractLabTile(
  rgba: Uint8ClampedArray, imgWidth: number, cx: number, cy: number
): Lab[] {
  const tile: Lab[] = new Array(64);
  for (let py = 0; py < 8; py++) {
    for (let px = 0; px < 8; px++) {
      const i = ((cy * 8 + py) * imgWidth + (cx * 8 + px)) * 4;
      tile[py * 8 + px] = rgbToLab(rgba[i], rgba[i + 1], rgba[i + 2]);
    }
  }
  return tile;
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

function isTileGrayscaleRgba(
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
// Two-pass matching: luminance pre-filter → blended SSIM + Lab score
// ---------------------------------------------------------------------------

const TOP_N = 32; // number of candidates to keep after luminance pre-filter

interface ScreenCell { code: number; color: number; }

function bestMatchPetmate9(
  srcLuma: Float32Array,
  srcLab: Lab[],
  fontBits: number[],
  palette: Rgb[],
  paletteLab: Lab[],
  bgIdx: number,
  ssimWeight: number, // 0–1
  allowedColors?: Set<number>
): ScreenCell {
  const bgLuma = luminance(palette[bgIdx].r, palette[bgIdx].g, palette[bgIdx].b);
  const bgLab = paletteLab[bgIdx];

  // Pass 1: quick luminance SSIM to find top-N candidates across all fg colors
  const candidates: { ch: number; color: number; lumaScore: number }[] = [];

  for (let color = 0; color < palette.length; color++) {
    if (color === bgIdx) continue;
    if (allowedColors && !allowedColors.has(color)) continue;
    const fgLuma = luminance(palette[color].r, palette[color].g, palette[color].b);
    for (let ch = 0; ch < 256; ch++) {
      const charLuma = charLumaTile(fontBits, ch, fgLuma, bgLuma);
      const score = ssim8x8(srcLuma, charLuma);
      candidates.push({ ch, color, lumaScore: score });
    }
  }

  // Keep top-N by luminance SSIM
  candidates.sort((a, b) => b.lumaScore - a.lumaScore);
  const topCandidates = candidates.slice(0, TOP_N);

  // Pass 2: detailed blended score on top candidates
  let bestCode = 32, bestColor = 0, bestScore = -Infinity;

  for (const cand of topCandidates) {
    const candLab = charLabTile(fontBits, cand.ch, paletteLab[cand.color], bgLab);
    const candLuma = charLumaTile(fontBits, cand.ch,
      luminance(palette[cand.color].r, palette[cand.color].g, palette[cand.color].b), bgLuma);

    // SSIM component (0..1, higher is better)
    const ssimScore = ssim8x8(srcLuma, candLuma);

    // Lab color distance component (lower is better → negate and normalize)
    const labDist = tileLabDist(srcLab, candLab);
    // Normalize: max possible per-pixel squared Lab dist ≈ 30000, ×64 pixels
    const labScore = 1 - Math.min(labDist / (30000 * 64), 1);

    // Blend
    const score = ssimWeight * ssimScore + (1 - ssimWeight) * labScore;
    if (score > bestScore) {
      bestScore = score;
      bestCode = cand.ch;
      bestColor = cand.color;
    }
  }

  return { code: bestCode, color: bestColor };
}

// ---------------------------------------------------------------------------
// Main conversion entry point
// ---------------------------------------------------------------------------

export function convertGuideLayerPetmate9(
  params: ConvertParams,
  settings: Petmate9Settings
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
      // 1. Render guide image onto offscreen canvas
      const canvas = document.createElement('canvas');
      canvas.width = pxW;
      canvas.height = pxH;
      const ctx = canvas.getContext('2d')!;

      const bg = colorPalette[backgroundColor];
      ctx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`;
      ctx.fillRect(0, 0, pxW, pxH);

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

      // 2. Build Lab palette
      const paletteLab = buildLabPalette(colorPalette);

      // 3. Dither to palette using Lab distance
      const indexed = applyDither(
        imgPixels.data, pxW, pxH, paletteLab, colorPalette, settings.ditherMode
      );

      // 4. Determine background color (most frequent)
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
          if (colorCounts[i] > bgMax) { bgMax = colorCounts[i]; bgIdx = i; }
        }
      }

      // 5. Identify achromatic palette entries for grayscale tile handling
      const grayColors = new Set<number>();
      for (let i = 0; i < colorPalette.length; i++) {
        if (isAchromaticColor(colorPalette[i])) grayColors.add(i);
      }

      // 6. For each 8×8 cell, two-pass match
      const ssimW = settings.ssimWeight / 100; // normalize to 0–1
      const framebuf: Pixel[][] = [];
      let cy = 0;
      const processRow = () => {
        if (cy >= framebufHeight) {
          resolve({ framebuf, backgroundColor: bgIdx });
          return;
        }
        const row: Pixel[] = [];
        for (let cx = 0; cx < framebufWidth; cx++) {
          const srcLuma = extractLumaTile(imgPixels.data, pxW, cx, cy);
          const srcLab = extractLabTile(imgPixels.data, pxW, cx, cy);
          const allowed = isTileGrayscaleRgba(imgPixels.data, pxW, cx, cy) ? grayColors : undefined;
          const cell = bestMatchPetmate9(
            srcLuma, srcLab, font.bits, colorPalette, paletteLab, bgIdx, ssimW, allowed
          );
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
