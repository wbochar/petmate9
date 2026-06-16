// Pure computation module for all three PETSCII converters.
// NO DOM, Canvas, or Image dependencies — safe for Web Workers.
//
// Optimizations applied vs. the original single-threaded code:
//  • Precomputed character tile tables (img2petscii, Pet9scii)
//  • Eliminated Math.sqrt in tile distance (img2petscii)
//  • Flat Float32Array for Lab tiles instead of object arrays (Pet9scii)
//  • Partial selection (top-N) instead of full sort (Pet9scii)
//  • Pre-image Lab map to avoid redundant rgbToLab per cell (Pet9scii)

// ---------------------------------------------------------------------------
// Lightweight type copies (mirror redux/types interfaces — no runtime import)
// ---------------------------------------------------------------------------

export interface Rgb { r: number; g: number; b: number; }
export interface Pixel { code: number; color: number; attr?: number; transparent?: boolean; }
export interface FontData { bits: number[]; charOrderLength: number; }

export interface PetsciiatorSettings { dithering: boolean; }
export interface Img2PetsciiSettings { matcherMode: 'slow' | 'fast'; monoMode: boolean; monoThreshold: number; }
export interface Petmate9Settings { ditherMode: 'floyd-steinberg' | 'bayer4x4' | 'bayer2x2' | 'none'; ssimWeight: number; useLuminance?: boolean; }

export type ConverterName = 'petsciiator' | 'img2petscii' | 'petmate9';

// ---------------------------------------------------------------------------
// Common helpers
// ---------------------------------------------------------------------------

export function getCharLimit(font: FontData): number {
  return font.charOrderLength >= 512 ? 512 : 256;
}

export function buildResultPixel(sc: number, color: number, isVdc: boolean): Pixel {
  if (!isVdc) return { code: sc, color };
  const altBit = sc >= 256 ? 0x80 : 0x00;
  return { code: sc & 0xff, color, attr: ((color & 0x0f) | altBit) & 0xff };
}

export function getClosestColorIndex(r: number, g: number, b: number, palette: Rgb[]): number {
  let minDist = Infinity, minIdx = 0;
  for (let i = 0; i < palette.length; i++) {
    const dr = r - palette[i].r, dg = g - palette[i].g, db = b - palette[i].b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < minDist) { minDist = dist; minIdx = i; }
  }
  return minIdx;
}

// ---------------------------------------------------------------------------
// Masked palette (shared by all converters)
// ---------------------------------------------------------------------------

export interface MaskedPaletteResult {
  allowedColors: Set<number> | undefined;
  maskedPalette: Rgb[];
  maskedBgIdx: number;
  indexMap: number[];
}

export function buildMaskedPalette(
  palette: Rgb[], colorMask: boolean[] | undefined, bgIdx: number
): MaskedPaletteResult {
  const clampIdx = Math.max(0, Math.min(palette.length - 1, bgIdx));
  if (!colorMask) {
    return {
      allowedColors: undefined, maskedPalette: palette, maskedBgIdx: clampIdx,
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
    let bestDist = Infinity, bestIdx = [...allowed][0];
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
  if (allowed.size >= palette.length) {
    return {
      allowedColors: undefined, maskedPalette: palette, maskedBgIdx,
      indexMap: Array.from({ length: palette.length }, (_, i) => i),
    };
  }
  const masked = palette.map((c, i) => allowed.has(i) ? c : palette[indexMap[i]]);
  return { allowedColors: allowed, maskedPalette: masked, maskedBgIdx, indexMap };
}

// ---------------------------------------------------------------------------
// Grayscale detection
// ---------------------------------------------------------------------------

const GRAY_THRESHOLD = 16;

function isAchromaticColor(c: Rgb): boolean {
  return (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)) <= GRAY_THRESHOLD;
}

function isTileGrayscaleRgba(rgba: Uint8ClampedArray, imgWidth: number, cx: number, cy: number): boolean {
  for (let py = 0; py < 8; py++) {
    for (let px = 0; px < 8; px++) {
      const i = ((cy * 8 + py) * imgWidth + (cx * 8 + px)) * 4;
      if (Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) - Math.min(rgba[i], rgba[i + 1], rgba[i + 2]) > GRAY_THRESHOLD) return false;
    }
  }
  return true;
}

export function buildGrayIndices(palette: Rgb[], numFg: number): Set<number> {
  const s = new Set<number>();
  for (let i = 0; i < numFg; i++) { if (isAchromaticColor(palette[i])) s.add(i); }
  return s;
}

// ---------------------------------------------------------------------------
// Dithering — RGB (Petsciiator, img2petscii)
// ---------------------------------------------------------------------------

export function nearestColorToPalette(rgba: Uint8ClampedArray, width: number, height: number, palette: Rgb[]): Uint8Array {
  const n = width * height;
  const indexed = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    indexed[i] = getClosestColorIndex(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], palette);
  }
  return indexed;
}

export function ditherToPalette(rgba: Uint8ClampedArray, width: number, height: number, palette: Rgb[]): Uint8Array {
  const n = width * height;
  const r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) { r[i] = rgba[i * 4]; g[i] = rgba[i * 4 + 1]; b[i] = rgba[i * 4 + 2]; }
  const indexed = new Uint8Array(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = y * width + x;
      const cr = Math.max(0, Math.min(255, Math.round(r[pos])));
      const cg = Math.max(0, Math.min(255, Math.round(g[pos])));
      const cb = Math.max(0, Math.min(255, Math.round(b[pos])));
      const idx = getClosestColorIndex(cr, cg, cb, palette);
      indexed[pos] = idx;
      const er = cr - palette[idx].r, eg = cg - palette[idx].g, eb = cb - palette[idx].b;
      if (x < width - 1)                   { const p = pos + 1;         r[p] += er * 7/16; g[p] += eg * 7/16; b[p] += eb * 7/16; }
      if (x > 0 && y < height - 1)         { const p = pos - 1 + width; r[p] += er * 3/16; g[p] += eg * 3/16; b[p] += eb * 3/16; }
      if (y < height - 1)                  { const p = pos + width;     r[p] += er * 5/16; g[p] += eg * 5/16; b[p] += eb * 5/16; }
      if (x < width - 1 && y < height - 1) { const p = pos + width + 1; r[p] += er * 1/16; g[p] += eg * 1/16; b[p] += eb * 1/16; }
    }
  }
  return indexed;
}

// ---------------------------------------------------------------------------
// Background detection (shared)
// ---------------------------------------------------------------------------

export function detectBackground(
  indexed: Uint8Array, indexMap: number[], pxW: number, pxH: number,
  imgX0: number, imgY0: number, imgX1: number, imgY1: number, numFg: number
): number {
  const counts = new Uint32Array(numFg);
  for (let py = imgY0; py < imgY1; py++) {
    for (let px = imgX0; px < imgX1; px++) {
      counts[indexMap[indexed[py * pxW + px]]]++;
    }
  }
  let bgMax = 0, bgIdx = 0;
  for (let i = 0; i < numFg; i++) { if (counts[i] > bgMax) { bgMax = counts[i]; bgIdx = i; } }
  return bgIdx;
}

// ============================================================================
// PETSCIIATOR
// ============================================================================

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

function buildCharFeatures(fontBits: number[], numChars: number): Float32Array[] {
  const features: Float32Array[] = [];
  for (let ch = 0; ch < numChars; ch++) {
    const q = new Float32Array(10);
    for (let py = 0; py < 8; py++) {
      const row = fontBits[ch * 8 + py];
      for (let px = 0; px < 8; px++) {
        if (row & (1 << (7 - px))) countFeatures(px, py, q);
      }
    }
    features.push(q);
  }
  return features;
}

function getMatchingChar(features: Float32Array[], cellFeatures: Float32Array): number {
  let bestDist = Infinity, bestIdx = 32;
  for (let i = 0; i < features.length; i++) {
    const cf = features[i];
    let dist = 0;
    for (let d = 0; d < 10; d++) { const diff = cf[d] - cellFeatures[d]; dist += diff * diff; }
    if (dist < bestDist) { bestDist = dist; bestIdx = i; }
  }
  return bestIdx;
}

export interface PetsciiatorCellParams {
  rgba: Uint8ClampedArray;
  indexed: Uint8Array;
  indexMap: number[];
  pxW: number;
  framebufWidth: number;
  framebufHeight: number;
  numFg: number;
  bgIdx: number;
  font: FontData;
  palette: Rgb[];
  grayIndices: Set<number>;
  allowedColors: Set<number> | undefined;
  rowStart: number;
  rowEnd: number;
  onRowDone?: () => void;
}

export function petsciiatorMatchRows(p: PetsciiatorCellParams): Pixel[][] {
  const numChars = getCharLimit(p.font);
  const isVdc = numChars >= 512;
  const charFeatures = buildCharFeatures(p.font.bits, numChars);
  const rows: Pixel[][] = [];
  for (let cy = p.rowStart; cy < p.rowEnd; cy++) {
    const row: Pixel[] = [];
    for (let cx = 0; cx < p.framebufWidth; cx++) {
      const tileGray = isTileGrayscaleRgba(p.rgba, p.pxW, cx, cy);
      const cellCounts = new Uint32Array(p.numFg);
      const cellQ = new Float32Array(10);
      for (let py = 0; py < 8; py++) {
        for (let px = 0; px < 8; px++) {
          const idx = p.indexMap[p.indexed[(cy * 8 + py) * p.pxW + (cx * 8 + px)]];
          if (idx !== p.bgIdx) { cellCounts[idx]++; countFeatures(px, py, cellQ); }
        }
      }
      let fgIdx = p.bgIdx === 0 ? (p.numFg > 1 ? 1 : 0) : 0;
      let fgMax = 0;
      for (let i = 0; i < p.numFg; i++) {
        if (i === p.bgIdx) continue;
        if (tileGray && !p.grayIndices.has(i)) continue;
        if (p.allowedColors && !p.allowedColors.has(i)) continue;
        if (cellCounts[i] > fgMax) { fgMax = cellCounts[i]; fgIdx = i; }
      }
      row.push(buildResultPixel(getMatchingChar(charFeatures, cellQ), fgIdx, isVdc));
    }
    rows.push(row);
    p.onRowDone?.();
  }
  return rows;
}

// ============================================================================
// IMG2PETSCII  (Phase 3: sqrt removed, flat typed-array tiles)
// ============================================================================

// Precompute flat RGB tile (192 floats = 64 pixels × 3 channels) for a glyph
function buildFlatCharTile(fontBits: number[], ch: number, fg: Rgb, bg: Rgb, out: Float32Array, offset: number) {
  for (let py = 0; py < 8; py++) {
    const byte = fontBits[ch * 8 + py];
    for (let px = 0; px < 8; px++) {
      const o = offset + (py * 8 + px) * 3;
      if (byte & (1 << (7 - px))) { out[o] = fg.r; out[o + 1] = fg.g; out[o + 2] = fg.b; }
      else { out[o] = bg.r; out[o + 1] = bg.g; out[o + 2] = bg.b; }
    }
  }
}

// Squared tile distance — no Math.sqrt (Phase 3 optimisation)
function flatTileDistSq(a: Float32Array, aOff: number, b: Float32Array, bOff: number): number {
  let sum = 0;
  for (let i = 0; i < 192; i++) { const d = a[aOff + i] - b[bOff + i]; sum += d * d; }
  return sum;
}

function extractFlatTile(rgba: Uint8ClampedArray, imgWidth: number, cx: number, cy: number, out: Float32Array, offset: number) {
  for (let py = 0; py < 8; py++) {
    for (let px = 0; px < 8; px++) {
      const i = ((cy * 8 + py) * imgWidth + (cx * 8 + px)) * 4;
      const o = offset + (py * 8 + px) * 3;
      out[o] = rgba[i]; out[o + 1] = rgba[i + 1]; out[o + 2] = rgba[i + 2];
    }
  }
}

// Precompute tile table: for each (color, char) pair, a flat 192-float tile
interface PrecomputedTileTable {
  data: Float32Array;        // flat array: [color0_char0(192), color0_char1(192), ...]
  numChars: number;
  stride: number;            // = numChars * 192
}

function buildTileTable(fontBits: number[], numChars: number, palette: Rgb[], bgIdx: number, allowedColors: Set<number> | undefined): PrecomputedTileTable {
  const bgRgb = palette[bgIdx];
  const stride = numChars * 192;
  const data = new Float32Array(palette.length * stride);
  for (let color = 0; color < palette.length; color++) {
    if (color === bgIdx) continue;
    if (allowedColors && !allowedColors.has(color)) continue;
    for (let ch = 0; ch < numChars; ch++) {
      buildFlatCharTile(fontBits, ch, palette[color], bgRgb, data, color * stride + ch * 192);
    }
  }
  return { data, numChars, stride };
}

function bestMatchSlowFlat(
  srcTile: Float32Array, srcOff: number,
  table: PrecomputedTileTable,
  palette: Rgb[], bgIdx: number,
  allowedColors: Set<number> | undefined
): { code: number; color: number } {
  let bestCode = 32, bestColor = 0, bestDist = Infinity;
  for (let color = 0; color < palette.length; color++) {
    if (color === bgIdx) continue;
    if (allowedColors && !allowedColors.has(color)) continue;
    const colorOff = color * table.stride;
    for (let ch = 0; ch < table.numChars; ch++) {
      const dist = flatTileDistSq(srcTile, srcOff, table.data, colorOff + ch * 192);
      if (dist < bestDist) { bestDist = dist; bestCode = ch; bestColor = color; }
    }
  }
  return { code: bestCode, color: bestColor };
}

function quantizeTileFlat(rgba: Uint8ClampedArray, imgWidth: number, cx: number, cy: number, palette: Rgb[]): Uint8Array {
  const indices = new Uint8Array(64);
  for (let py = 0; py < 8; py++) {
    for (let px = 0; px < 8; px++) {
      const i = ((cy * 8 + py) * imgWidth + (cx * 8 + px)) * 4;
      indices[py * 8 + px] = getClosestColorIndex(rgba[i], rgba[i + 1], rgba[i + 2], palette);
    }
  }
  return indices;
}

function bestMatchFastFlat(
  rgba: Uint8ClampedArray, imgWidth: number, cx: number, cy: number,
  srcTile: Float32Array, srcOff: number,
  table: PrecomputedTileTable,
  palette: Rgb[], bgIdx: number,
  allowedColors: Set<number> | undefined
): { code: number; color: number } {
  const tileIndices = quantizeTileFlat(rgba, imgWidth, cx, cy, palette);
  let fgIdx: number;
  if (allowedColors) {
    const counts = new Uint32Array(palette.length);
    for (let i = 0; i < 64; i++) { const idx = tileIndices[i]; if (idx !== bgIdx && allowedColors.has(idx)) counts[idx]++; }
    fgIdx = 0; let best = 0;
    for (let i = 0; i < palette.length; i++) { if (counts[i] > best) { best = counts[i]; fgIdx = i; } }
    if (best === 0) fgIdx = allowedColors.values().next().value ?? (bgIdx === 0 ? 1 : 0);
  } else {
    const counts = new Uint32Array(palette.length);
    for (let i = 0; i < 64; i++) { const idx = tileIndices[i]; if (idx !== bgIdx) counts[idx]++; }
    fgIdx = 0; let best = 0;
    for (let i = 0; i < palette.length; i++) { if (counts[i] > best) { best = counts[i]; fgIdx = i; } }
  }
  const colorOff = fgIdx * table.stride;
  let bestCode = 32, bestDist = Infinity;
  for (let ch = 0; ch < table.numChars; ch++) {
    const dist = flatTileDistSq(srcTile, srcOff, table.data, colorOff + ch * 192);
    if (dist < bestDist) { bestDist = dist; bestCode = ch; }
  }
  return { code: bestCode, color: fgIdx };
}

export interface Img2PetsciiCellParams {
  rgba: Uint8ClampedArray;
  pxW: number;
  framebufWidth: number;
  framebufHeight: number;
  numFg: number;
  bgIdx: number;
  font: FontData;
  palette: Rgb[];
  grayIndices: Set<number>;
  allowedColors: Set<number> | undefined;
  settings: Img2PetsciiSettings;
  rowStart: number;
  rowEnd: number;
  onRowDone?: () => void;
}

export function img2petsciiMatchRows(p: Img2PetsciiCellParams): Pixel[][] {
  const numChars = getCharLimit(p.font);
  const isVdc = numChars >= 512;
  const useSlow = !p.settings.monoMode && p.settings.matcherMode === 'slow';

  // Phase 2: precompute tile table once for all cells
  const table = buildTileTable(p.font.bits, numChars, p.palette, p.bgIdx, p.allowedColors);
  const srcBuf = new Float32Array(192);

  const rows: Pixel[][] = [];
  for (let cy = p.rowStart; cy < p.rowEnd; cy++) {
    const row: Pixel[] = [];
    for (let cx = 0; cx < p.framebufWidth; cx++) {
      extractFlatTile(p.rgba, p.pxW, cx, cy, srcBuf, 0);
      const tileGray = isTileGrayscaleRgba(p.rgba, p.pxW, cx, cy);
      let allowed: Set<number> | undefined;
      if (tileGray && p.allowedColors) {
        allowed = new Set([...p.grayIndices].filter(c => p.allowedColors!.has(c)));
      } else if (tileGray) {
        allowed = p.grayIndices;
      } else {
        allowed = p.allowedColors;
      }
      // For gray tiles that restrict colors, rebuild a restricted tile table
      // only when it differs from the precomputed one.
      let useTable = table;
      if (allowed !== p.allowedColors) {
        useTable = buildTileTable(p.font.bits, numChars, p.palette, p.bgIdx, allowed);
      }
      const cell = useSlow
        ? bestMatchSlowFlat(srcBuf, 0, useTable, p.palette, p.bgIdx, allowed)
        : bestMatchFastFlat(p.rgba, p.pxW, cx, cy, srcBuf, 0, useTable, p.palette, p.bgIdx, allowed);
      row.push(buildResultPixel(cell.code, cell.color, isVdc));
    }
    rows.push(row);
    p.onRowDone?.();
  }
  return rows;
}

// ============================================================================
// PET9SCII  (Lab color, SSIM, Phase 2+3 optimisations)
// ============================================================================

// --- CIE L*a*b* ---
interface Lab { L: number; a: number; b: number; }

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
const Xn = 0.95047, Yn = 1.00000, Zn = 1.08883;
function fLab(t: number): number { return t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116; }

function rgbToLab(r: number, g: number, b: number): Lab {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / Xn;
  const y = (0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb) / Yn;
  const z = (0.0193339 * lr + 0.0284597 * lg + 0.1146098 * lb) / Zn;
  const fx = fLab(x), fy = fLab(y), fz = fLab(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function labDistSq(a: Lab, b: Lab): number {
  const dL = a.L - b.L, da = a.a - b.a, db = a.b - b.b;
  return dL * dL + da * da + db * db;
}

function getClosestColorIndexLab(lab: Lab, paletteLab: Lab[]): number {
  let minDist = Infinity, minIdx = 0;
  for (let i = 0; i < paletteLab.length; i++) {
    const d = labDistSq(lab, paletteLab[i]);
    if (d < minDist) { minDist = d; minIdx = i; }
  }
  return minIdx;
}

function buildLabPalette(palette: Rgb[]): Lab[] {
  return palette.map(c => rgbToLab(c.r, c.g, c.b));
}

// --- Dithering (Lab-based) ---

const BAYER_2x2 = [[0, 2], [3, 1]];
const BAYER_4x4 = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];

function bayerDitherLab(
  rgba: Uint8ClampedArray, width: number, height: number,
  paletteLab: Lab[], _palette: Rgb[], matrix: number[][], size: number
): Uint8Array {
  const n = width * height;
  const indexed = new Uint8Array(n);
  const scale = 64 / (size * size);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = y * width + x;
      const threshold = (matrix[y % size][x % size] / (size * size) - 0.5) * scale;
      const r = Math.max(0, Math.min(255, rgba[pos * 4] + threshold));
      const g = Math.max(0, Math.min(255, rgba[pos * 4 + 1] + threshold));
      const b = Math.max(0, Math.min(255, rgba[pos * 4 + 2] + threshold));
      indexed[pos] = getClosestColorIndexLab(rgbToLab(r, g, b), paletteLab);
    }
  }
  return indexed;
}

function floydSteinbergDitherLab(
  rgba: Uint8ClampedArray, width: number, height: number,
  paletteLab: Lab[], palette: Rgb[]
): Uint8Array {
  const n = width * height;
  const r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) { r[i] = rgba[i * 4]; g[i] = rgba[i * 4 + 1]; b[i] = rgba[i * 4 + 2]; }
  const indexed = new Uint8Array(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = y * width + x;
      const cr = Math.max(0, Math.min(255, Math.round(r[pos])));
      const cg = Math.max(0, Math.min(255, Math.round(g[pos])));
      const cb = Math.max(0, Math.min(255, Math.round(b[pos])));
      const idx = getClosestColorIndexLab(rgbToLab(cr, cg, cb), paletteLab);
      indexed[pos] = idx;
      const er = cr - palette[idx].r, eg = cg - palette[idx].g, eb = cb - palette[idx].b;
      if (x < width - 1)                   { const p = pos + 1;         r[p] += er * 7/16; g[p] += eg * 7/16; b[p] += eb * 7/16; }
      if (x > 0 && y < height - 1)         { const p = pos - 1 + width; r[p] += er * 3/16; g[p] += eg * 3/16; b[p] += eb * 3/16; }
      if (y < height - 1)                  { const p = pos + width;     r[p] += er * 5/16; g[p] += eg * 5/16; b[p] += eb * 5/16; }
      if (x < width - 1 && y < height - 1) { const p = pos + width + 1; r[p] += er * 1/16; g[p] += eg * 1/16; b[p] += eb * 1/16; }
    }
  }
  return indexed;
}

function nearestColorLab(rgba: Uint8ClampedArray, width: number, height: number, paletteLab: Lab[]): Uint8Array {
  const n = width * height;
  const indexed = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    indexed[i] = getClosestColorIndexLab(rgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]), paletteLab);
  }
  return indexed;
}

export function applyDitherLab(
  rgba: Uint8ClampedArray, width: number, height: number,
  paletteLab: Lab[], palette: Rgb[], mode: string
): Uint8Array {
  switch (mode) {
    case 'floyd-steinberg': return floydSteinbergDitherLab(rgba, width, height, paletteLab, palette);
    case 'bayer4x4': return bayerDitherLab(rgba, width, height, paletteLab, palette, BAYER_4x4, 4);
    case 'bayer2x2': return bayerDitherLab(rgba, width, height, paletteLab, palette, BAYER_2x2, 2);
    default: return nearestColorLab(rgba, width, height, paletteLab);
  }
}

// --- SSIM ---

const C1 = 6.5025, C2 = 58.5225;

function ssim8x8(a: Float32Array, aOff: number, b: Float32Array, bOff: number): number {
  let sumA = 0, sumB = 0;
  for (let i = 0; i < 64; i++) { sumA += a[aOff + i]; sumB += b[bOff + i]; }
  const muA = sumA / 64, muB = sumB / 64;
  let sigAA = 0, sigBB = 0, sigAB = 0;
  for (let i = 0; i < 64; i++) {
    const da = a[aOff + i] - muA, db = b[bOff + i] - muB;
    sigAA += da * da; sigBB += db * db; sigAB += da * db;
  }
  sigAA /= 63; sigBB /= 63; sigAB /= 63;
  return ((2 * muA * muB + C1) * (2 * sigAB + C2)) / ((muA * muA + muB * muB + C1) * (sigAA + sigBB + C2));
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Phase 2: precompute full-image Lab map
export function buildImageLabMap(rgba: Uint8ClampedArray, n: number): Float32Array {
  // 3 floats per pixel: L, a, b
  const map = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const lab = rgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    map[i * 3] = lab.L; map[i * 3 + 1] = lab.a; map[i * 3 + 2] = lab.b;
  }
  return map;
}

// Phase 2: precompute char luminance tiles for all (color, char) combos
interface LumaTileTable { data: Float32Array; numChars: number; stride: number; }

function buildLumaTileTable(fontBits: number[], numChars: number, palette: Rgb[], bgIdx: number): LumaTileTable {
  const bgLuma = luminance(palette[bgIdx].r, palette[bgIdx].g, palette[bgIdx].b);
  const stride = numChars * 64;
  const data = new Float32Array(palette.length * stride);
  for (let color = 0; color < palette.length; color++) {
    if (color === bgIdx) continue;
    const fgLuma = luminance(palette[color].r, palette[color].g, palette[color].b);
    for (let ch = 0; ch < numChars; ch++) {
      const off = color * stride + ch * 64;
      for (let py = 0; py < 8; py++) {
        const byte = fontBits[ch * 8 + py];
        for (let px = 0; px < 8; px++) {
          data[off + py * 8 + px] = (byte & (1 << (7 - px))) ? fgLuma : bgLuma;
        }
      }
    }
  }
  return { data, numChars, stride };
}

// Phase 2: precompute char Lab tiles for all (color, char) combos
interface LabTileTable { data: Float32Array; numChars: number; stride: number; }

function buildLabTileTable(fontBits: number[], numChars: number, palette: Rgb[], paletteLab: Lab[], bgIdx: number): LabTileTable {
  const bgLab = paletteLab[bgIdx];
  const stride = numChars * 192; // 64 pixels × 3 (L,a,b)
  const data = new Float32Array(palette.length * stride);
  for (let color = 0; color < palette.length; color++) {
    if (color === bgIdx) continue;
    const fgLab = paletteLab[color];
    for (let ch = 0; ch < numChars; ch++) {
      const off = color * stride + ch * 192;
      for (let py = 0; py < 8; py++) {
        const byte = fontBits[ch * 8 + py];
        for (let px = 0; px < 8; px++) {
          const lab = (byte & (1 << (7 - px))) ? fgLab : bgLab;
          const o = off + (py * 8 + px) * 3;
          data[o] = lab.L; data[o + 1] = lab.a; data[o + 2] = lab.b;
        }
      }
    }
  }
  return { data, numChars, stride };
}

function extractLumaTile(rgba: Uint8ClampedArray, imgWidth: number, cx: number, cy: number, out: Float32Array, offset: number) {
  for (let py = 0; py < 8; py++) {
    for (let px = 0; px < 8; px++) {
      const i = ((cy * 8 + py) * imgWidth + (cx * 8 + px)) * 4;
      out[offset + py * 8 + px] = luminance(rgba[i], rgba[i + 1], rgba[i + 2]);
    }
  }
}

// Phase 2: extract Lab tile from pre-built image Lab map (no rgbToLab per cell)
function extractLabTileFromMap(labMap: Float32Array, imgWidth: number, cx: number, cy: number, out: Float32Array, offset: number) {
  for (let py = 0; py < 8; py++) {
    for (let px = 0; px < 8; px++) {
      const srcIdx = ((cy * 8 + py) * imgWidth + (cx * 8 + px)) * 3;
      const o = offset + (py * 8 + px) * 3;
      out[o] = labMap[srcIdx]; out[o + 1] = labMap[srcIdx + 1]; out[o + 2] = labMap[srcIdx + 2];
    }
  }
}

// Phase 3: flat-array Lab tile distance
function flatLabTileDistSq(a: Float32Array, aOff: number, b: Float32Array, bOff: number): number {
  let sum = 0;
  for (let i = 0; i < 192; i++) { const d = a[aOff + i] - b[bOff + i]; sum += d * d; }
  return sum;
}

const TOP_N = 32;

function bestMatchPetmate9(
  srcLuma: Float32Array, srcLumaOff: number,
  srcLabFlat: Float32Array, srcLabOff: number,
  lumaTable: LumaTileTable,
  labTable: LabTileTable,
  palette: Rgb[],
  bgIdx: number,
  ssimWeight: number,
  allowedColors: Set<number> | undefined,
  useLuminance: boolean,
  numChars: number
): { code: number; color: number } {
  // Phase 3: partial selection with a fixed-size min-heap instead of full sort
  const topScores = new Float32Array(TOP_N).fill(-Infinity);
  const topCh = new Int32Array(TOP_N);
  const topColor = new Int32Array(TOP_N);
  let heapSize = 0;
  let minScore = -Infinity;

  for (let color = 0; color < palette.length; color++) {
    if (color === bgIdx) continue;
    if (allowedColors && !allowedColors.has(color)) continue;
    const lumaOff = color * lumaTable.stride;
    for (let ch = 0; ch < numChars; ch++) {
      const score = ssim8x8(srcLuma, srcLumaOff, lumaTable.data, lumaOff + ch * 64);
      if (heapSize < TOP_N) {
        topScores[heapSize] = score; topCh[heapSize] = ch; topColor[heapSize] = color;
        heapSize++;
        if (heapSize === TOP_N) {
          // Find the minimum to establish threshold
          minScore = topScores[0];
          for (let i = 1; i < TOP_N; i++) { if (topScores[i] < minScore) minScore = topScores[i]; }
        }
      } else if (score > minScore) {
        // Replace the worst entry
        let minIdx = 0;
        for (let i = 1; i < TOP_N; i++) { if (topScores[i] < topScores[minIdx]) minIdx = i; }
        topScores[minIdx] = score; topCh[minIdx] = ch; topColor[minIdx] = color;
        minScore = topScores[0];
        for (let i = 1; i < TOP_N; i++) { if (topScores[i] < minScore) minScore = topScores[i]; }
      }
    }
  }

  // Pass 2: detailed scoring on top candidates
  let bestCode = 32, bestColor = 0, bestScore = -Infinity;
  const count = Math.min(heapSize, TOP_N);

  for (let ci = 0; ci < count; ci++) {
    const ch = topCh[ci], color = topColor[ci];
    const candLumaOff = color * lumaTable.stride + ch * 64;
    const ssimScore = ssim8x8(srcLuma, srcLumaOff, lumaTable.data, candLumaOff);

    let colorScore: number;
    if (useLuminance) {
      let lumDistSum = 0;
      for (let i = 0; i < 64; i++) {
        const d = srcLuma[srcLumaOff + i] - lumaTable.data[candLumaOff + i];
        lumDistSum += d * d;
      }
      colorScore = 1 - Math.min(lumDistSum / (255 * 255 * 64), 1);
    } else {
      const candLabOff = color * labTable.stride + ch * 192;
      const labDist = flatLabTileDistSq(srcLabFlat, srcLabOff, labTable.data, candLabOff);
      colorScore = 1 - Math.min(labDist / (30000 * 64), 1);
    }
    const score = ssimWeight * ssimScore + (1 - ssimWeight) * colorScore;
    if (score > bestScore) { bestScore = score; bestCode = ch; bestColor = color; }
  }
  return { code: bestCode, color: bestColor };
}

export interface Petmate9CellParams {
  rgba: Uint8ClampedArray;
  labMap: Float32Array;          // Phase 2: pre-built image Lab map
  pxW: number;
  framebufWidth: number;
  framebufHeight: number;
  numFg: number;
  bgIdx: number;
  font: FontData;
  palette: Rgb[];
  grayIndices: Set<number>;
  allowedColors: Set<number> | undefined;
  settings: Petmate9Settings;
  rowStart: number;
  rowEnd: number;
  onRowDone?: () => void;
}

export function petmate9MatchRows(p: Petmate9CellParams): Pixel[][] {
  const numChars = getCharLimit(p.font);
  const isVdc = numChars >= 512;
  const ssimW = p.settings.ssimWeight / 100;
  const useLuma = p.settings.useLuminance ?? false;
  const paletteLab = buildLabPalette(p.palette);

  // Phase 2: precompute tile tables once
  const lumaTable = buildLumaTileTable(p.font.bits, numChars, p.palette, p.bgIdx);
  const labTable = buildLabTileTable(p.font.bits, numChars, p.palette, paletteLab, p.bgIdx);

  const srcLumaBuf = new Float32Array(64);
  const srcLabBuf = new Float32Array(192);
  const rows: Pixel[][] = [];

  for (let cy = p.rowStart; cy < p.rowEnd; cy++) {
    const row: Pixel[] = [];
    for (let cx = 0; cx < p.framebufWidth; cx++) {
      extractLumaTile(p.rgba, p.pxW, cx, cy, srcLumaBuf, 0);
      extractLabTileFromMap(p.labMap, p.pxW, cx, cy, srcLabBuf, 0);

      let allowed: Set<number> | undefined;
      const tileGray = isTileGrayscaleRgba(p.rgba, p.pxW, cx, cy);
      if (tileGray && p.allowedColors) {
        allowed = new Set([...p.grayIndices].filter(c => p.allowedColors!.has(c)));
      } else if (tileGray) {
        allowed = p.grayIndices;
      } else {
        allowed = p.allowedColors;
      }

      const cell = bestMatchPetmate9(
        srcLumaBuf, 0, srcLabBuf, 0,
        lumaTable, labTable, p.palette, p.bgIdx,
        ssimW, allowed, useLuma, numChars
      );
      row.push(buildResultPixel(cell.code, cell.color, isVdc));
    }
    rows.push(row);
    p.onRowDone?.();
  }
  return rows;
}

// ============================================================================
// Mono pre-processing (img2petscii)
// ============================================================================

export function applyMonoMode(rgba: Uint8ClampedArray, threshold: number): void {
  for (let i = 0; i < rgba.length; i += 4) {
    const gray = Math.round(rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114);
    const bw = gray >= threshold ? 255 : 0;
    rgba[i] = bw; rgba[i + 1] = bw; rgba[i + 2] = bw;
  }
}

// ============================================================================
// Shared Lab palette builder (exposed for dispatcher/worker)
// ============================================================================

export function buildLabPaletteFromRgb(palette: Rgb[]): Lab[] {
  return buildLabPalette(palette);
}

export function getClosestColorIndexLabFromRgb(r: number, g: number, b: number, palette: Rgb[]): number {
  const lab = rgbToLab(r, g, b);
  return getClosestColorIndexLab(lab, buildLabPalette(palette));
}
