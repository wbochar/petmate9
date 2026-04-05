// pet9scii-core.js — Pet9scii converter core, ported from petsciiConverterPetmate9.ts
// Pure Node.js (no browser APIs). Used for offline testing.
'use strict';

// ---------------------------------------------------------------------------
// C64 palette (petmate default)
// ---------------------------------------------------------------------------
const PALETTE = [
  { r: 0x00, g: 0x00, b: 0x00 }, // 0 Black
  { r: 0xff, g: 0xff, b: 0xff }, // 1 White
  { r: 146,  g: 74,   b: 64  }, // 2 Red
  { r: 132,  g: 197,  b: 204 }, // 3 Cyan
  { r: 147,  g: 81,   b: 182 }, // 4 Purple
  { r: 114,  g: 177,  b: 75  }, // 5 Green
  { r: 72,   g: 58,   b: 164 }, // 6 Blue
  { r: 213,  g: 223,  b: 124 }, // 7 Yellow
  { r: 153,  g: 105,  b: 45  }, // 8 Orange
  { r: 103,  g: 82,   b: 1   }, // 9 Brown
  { r: 192,  g: 129,  b: 120 }, // 10 Light Red
  { r: 96,   g: 96,   b: 96  }, // 11 Dark Grey
  { r: 138,  g: 138,  b: 138 }, // 12 Grey
  { r: 178,  g: 236,  b: 145 }, // 13 Light Green
  { r: 134,  g: 122,  b: 222 }, // 14 Light Blue
  { r: 174,  g: 174,  b: 174 }, // 15 Light Grey
];

const COLOR_NAMES = [
  'Black', 'White', 'Red', 'Cyan',
  'Purple', 'Green', 'Blue', 'Yellow',
  'Orange', 'Brown', 'LightRed', 'DarkGrey',
  'Grey', 'LightGreen', 'LightBlue', 'LightGrey'
];

// ---------------------------------------------------------------------------
// CIE L*a*b* colour space conversion (from petsciiConverterPetmate9.ts)
// ---------------------------------------------------------------------------

function srgbToLinear(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

const Xn = 0.95047, Yn = 1.00000, Zn = 1.08883;

function fLab(t) {
  return t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116;
}

function rgbToLab(r, g, b) {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / Xn;
  const y = (0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb) / Yn;
  const z = (0.0193339 * lr + 0.0284597 * lg + 0.1146098 * lb) / Zn;
  const fx = fLab(x), fy = fLab(y), fz = fLab(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function labDistSq(a, b) {
  const dL = a.L - b.L, da = a.a - b.a, db = a.b - b.b;
  return dL * dL + da * da + db * db;
}

function buildLabPalette(palette) {
  return palette.map(c => rgbToLab(c.r, c.g, c.b));
}

function getClosestColorIndexLab(lab, paletteLab) {
  let minDist = Infinity, minIdx = 0;
  for (let i = 0; i < paletteLab.length; i++) {
    const d = labDistSq(lab, paletteLab[i]);
    if (d < minDist) { minDist = d; minIdx = i; }
  }
  return minIdx;
}

// ---------------------------------------------------------------------------
// Dithering
// ---------------------------------------------------------------------------

const BAYER_2x2 = [[0, 2], [3, 1]];
const BAYER_4x4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5],
];

function bayerDither(rgba, width, height, paletteLab, palette, matrix, size) {
  const indexed = new Uint8Array(width * height);
  const scale = 64 / (size * size);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = y * width + x;
      const threshold = (matrix[y % size][x % size] / (size * size) - 0.5) * scale;
      const r = Math.max(0, Math.min(255, rgba[pos * 4]     + threshold));
      const g = Math.max(0, Math.min(255, rgba[pos * 4 + 1] + threshold));
      const b = Math.max(0, Math.min(255, rgba[pos * 4 + 2] + threshold));
      indexed[pos] = getClosestColorIndexLab(rgbToLab(r, g, b), paletteLab);
    }
  }
  return indexed;
}

function floydSteinbergDitherLab(rgba, width, height, paletteLab, palette) {
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
      const idx = getClosestColorIndexLab(rgbToLab(cr, cg, cb), paletteLab);
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

function nearestColorLab(rgba, width, height, paletteLab) {
  const indexed = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    indexed[i] = getClosestColorIndexLab(
      rgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]),
      paletteLab
    );
  }
  return indexed;
}

function applyDither(rgba, width, height, paletteLab, palette, mode) {
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

const C1 = 6.5025;
const C2 = 58.5225;

function ssim8x8(a, b) {
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
  return num / den;
}

function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// ---------------------------------------------------------------------------
// Tile helpers
// ---------------------------------------------------------------------------

function charLumaTile(fontBits, ch, fgLuma, bgLuma) {
  const tile = new Float32Array(64);
  for (let py = 0; py < 8; py++) {
    const byte = fontBits[ch * 8 + py];
    for (let px = 0; px < 8; px++) {
      tile[py * 8 + px] = (byte & (1 << (7 - px))) ? fgLuma : bgLuma;
    }
  }
  return tile;
}

function charLabTile(fontBits, ch, fgLab, bgLab) {
  const tile = new Array(64);
  for (let py = 0; py < 8; py++) {
    const byte = fontBits[ch * 8 + py];
    for (let px = 0; px < 8; px++) {
      tile[py * 8 + px] = (byte & (1 << (7 - px))) ? fgLab : bgLab;
    }
  }
  return tile;
}

function tileLabDist(src, candidate) {
  let sum = 0;
  for (let i = 0; i < 64; i++) sum += labDistSq(src[i], candidate[i]);
  return sum;
}

function extractLumaTile(rgba, imgWidth, cx, cy) {
  const tile = new Float32Array(64);
  for (let py = 0; py < 8; py++) {
    for (let px = 0; px < 8; px++) {
      const i = ((cy * 8 + py) * imgWidth + (cx * 8 + px)) * 4;
      tile[py * 8 + px] = luminance(rgba[i], rgba[i + 1], rgba[i + 2]);
    }
  }
  return tile;
}

function extractLabTile(rgba, imgWidth, cx, cy) {
  const tile = new Array(64);
  for (let py = 0; py < 8; py++) {
    for (let px = 0; px < 8; px++) {
      const i = ((cy * 8 + py) * imgWidth + (cx * 8 + px)) * 4;
      tile[py * 8 + px] = rgbToLab(rgba[i], rgba[i + 1], rgba[i + 2]);
    }
  }
  return tile;
}

// ---------------------------------------------------------------------------
// Grayscale detection
// ---------------------------------------------------------------------------

const GRAY_THRESHOLD = 16;

function isAchromaticColor(c) {
  return (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)) <= GRAY_THRESHOLD;
}

function isTileGrayscaleRgba(rgba, imgWidth, cx, cy) {
  for (let py = 0; py < 8; py++) {
    for (let px = 0; px < 8; px++) {
      const i = ((cy * 8 + py) * imgWidth + (cx * 8 + px)) * 4;
      if (Math.max(rgba[i], rgba[i+1], rgba[i+2]) - Math.min(rgba[i], rgba[i+1], rgba[i+2]) > GRAY_THRESHOLD) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Two-pass matching: luminance pre-filter → blended SSIM + Lab score
// ---------------------------------------------------------------------------

const TOP_N = 32;

function bestMatchPetmate9(srcLuma, srcLab, fontBits, palette, paletteLab, bgIdx, ssimWeight, allowedColors) {
  const bgLuma = luminance(palette[bgIdx].r, palette[bgIdx].g, palette[bgIdx].b);
  const bgLab = paletteLab[bgIdx];

  // Pass 1: quick luminance SSIM for top-N candidates
  const candidates = [];
  for (let color = 0; color < palette.length; color++) {
    if (color === bgIdx) continue;
    if (allowedColors && !allowedColors.has(color)) continue;
    const fgLuma = luminance(palette[color].r, palette[color].g, palette[color].b);
    for (let ch = 0; ch < 256; ch++) {
      const charLuma = charLumaTile(fontBits, ch, fgLuma, bgLuma);
      candidates.push({ ch, color, lumaScore: ssim8x8(srcLuma, charLuma) });
    }
  }

  candidates.sort((a, b) => b.lumaScore - a.lumaScore);
  const topCandidates = candidates.slice(0, TOP_N);

  // Pass 2: detailed blended score
  let bestCode = 32, bestColor = 0, bestScore = -Infinity;
  for (const cand of topCandidates) {
    const candLab = charLabTile(fontBits, cand.ch, paletteLab[cand.color], bgLab);
    const candLuma = charLumaTile(fontBits, cand.ch,
      luminance(palette[cand.color].r, palette[cand.color].g, palette[cand.color].b), bgLuma);
    const ssimScore = ssim8x8(srcLuma, candLuma);
    const labDist = tileLabDist(srcLab, candLab);
    const labScore = 1 - Math.min(labDist / (30000 * 64), 1);
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
// Main conversion: RGBA buffer → framebuf grid
// ---------------------------------------------------------------------------

/**
 * Convert an RGBA pixel buffer to a petmate framebuf grid.
 * @param {Uint8Array|Uint8ClampedArray} rgba     - RGBA pixel data
 * @param {number} pxWidth      - image width in pixels (must be multiple of 8)
 * @param {number} pxHeight     - image height in pixels (must be multiple of 8)
 * @param {number[]} fontBits   - font ROM bytes (256 chars × 8 bytes)
 * @param {Object[]} palette    - array of 16 {r,g,b} objects
 * @param {number} bgIdx        - background color index
 * @param {string} ditherMode   - 'none'|'floyd-steinberg'|'bayer4x4'|'bayer2x2'
 * @param {number} ssimWeight   - 0..1 (SSIM vs Lab weight blend)
 * @returns {{ framebuf: Array<Array<{code,color}>>, backgroundColor: number }}
 */
function convertRgba(rgba, pxWidth, pxHeight, fontBits, palette, bgIdx, ditherMode, ssimWeight) {
  const cols = pxWidth / 8;
  const rows = pxHeight / 8;
  const paletteLab = buildLabPalette(palette);

  // Dither (for pixel-perfect input with 'none', this is a pass-through to nearest)
  // Note: dithering modifies the RGBA conceptually but we keep original for tile extraction
  // The original converter dithers first, then extracts tiles from the *original* image.
  // Actually reviewing the original code: it dithers but only uses the indexed array for
  // background detection; tile matching uses the raw image pixels. Let's match that behavior.

  // Grayscale palette entries
  const grayColors = new Set();
  for (let i = 0; i < palette.length; i++) {
    if (isAchromaticColor(palette[i])) grayColors.add(i);
  }

  const framebuf = [];
  for (let cy = 0; cy < rows; cy++) {
    const row = [];
    for (let cx = 0; cx < cols; cx++) {
      const srcLuma = extractLumaTile(rgba, pxWidth, cx, cy);
      const srcLab = extractLabTile(rgba, pxWidth, cx, cy);
      const allowed = isTileGrayscaleRgba(rgba, pxWidth, cx, cy) ? grayColors : undefined;
      const cell = bestMatchPetmate9(srcLuma, srcLab, fontBits, palette, paletteLab, bgIdx, ssimWeight, allowed);
      row.push({ code: cell.code, color: cell.color });
    }
    framebuf.push(row);
  }
  return { framebuf, backgroundColor: bgIdx };
}

// ---------------------------------------------------------------------------
// Petmate workspace file helpers
// ---------------------------------------------------------------------------

function createPetmateWorkspace(framebufs) {
  return {
    version: 3,
    screens: framebufs.map((_, i) => i),
    framebufs: framebufs.map(fb => ({
      width: fb.width,
      height: fb.height,
      backgroundColor: fb.backgroundColor,
      borderColor: fb.borderColor || 0,
      borderOn: fb.borderOn || false,
      charset: fb.charset || 'upper',
      name: fb.name || '',
      framebuf: fb.framebuf,
      zoom: fb.zoom || { zoomLevel: 2, alignment: 'center' },
    })),
    customFonts: {},
  };
}

// ---------------------------------------------------------------------------
// Luminance helper (matching palette.ts formula)
// ---------------------------------------------------------------------------

function paletteColorLuminance(c) {
  return (c.r + c.r + c.b + c.g + c.g + c.g) / 6 / 255;
}

function getLuminanceOrder(palette) {
  return palette
    .map((c, i) => ({ index: i, luma: paletteColorLuminance(c) }))
    .sort((a, b) => a.luma - b.luma)
    .map(x => x.index);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  PALETTE,
  COLOR_NAMES,
  rgbToLab,
  labDistSq,
  buildLabPalette,
  getClosestColorIndexLab,
  applyDither,
  ssim8x8,
  luminance,
  charLumaTile,
  charLabTile,
  extractLumaTile,
  extractLabTile,
  bestMatchPetmate9,
  convertRgba,
  createPetmateWorkspace,
  paletteColorLuminance,
  getLuminanceOrder,
  isAchromaticColor,
  isTileGrayscaleRgba,
};
