/**
 * Pattern / texture generation for the Textures tool.
 *
 * All generators are pure functions:
 *   (font, config) => Pixel[][]   (16×16 grid)
 *
 * They rely on charWeight utilities for character density sorting.
 */

import { Font, Pixel } from '../redux/types';
import { countCharPixels } from './charWeight';
import {
  CharCategory,
  CaseMode,
  buildCategorySet,
} from './charWeightConfig';

// ---------------------------------------------------------------------------
// Pattern types & config
// ---------------------------------------------------------------------------

export type PatternType =
  | 'gradient'
  | 'dither'
  | 'noise'
  | 'stripes'
  | 'checker';

export type PatternDirection = 'horizontal' | 'vertical' | 'diagonal';

export interface PatternConfig {
  type: PatternType;
  color: number;         // foreground color index
  bgColor: number;       // background / secondary color index
  category: CharCategory;
  caseMode: CaseMode;
  seed: number;          // 1–99
  direction: PatternDirection;
  scale: number;         // 1–8  (cell‐size multiplier)
  invert: boolean;
  colorGradient: boolean; // vary fg color across pattern
}

const GRID = 16; // output is always 16×16

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Build a density‐sorted list of screencodes (lightest → heaviest). */
function buildDensityTable(font: Font, category: CharCategory, caseMode: CaseMode): number[] {
  const allowed = buildCategorySet(category, caseMode);
  const entries: { code: number; weight: number }[] = [];
  for (const sc of allowed) {
    if (sc >= 256) continue; // ROM only
    entries.push({ code: sc, weight: countCharPixels(font.bits, sc) });
  }
  entries.sort((a, b) => a.weight - b.weight);
  return entries.map(e => e.code);
}

/** Pick a screencode from the density table at a normalised position `t` ∈ [0,1]. */
function charAtDensity(table: number[], t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const idx = Math.round(clamped * (table.length - 1));
  return table[idx];
}

/** Simple seeded PRNG (mulberry32). Returns a function that yields [0,1). */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Create an empty 16×16 grid filled with a default pixel. */
function emptyGrid(code: number, color: number): Pixel[][] {
  return Array.from({ length: GRID }, () =>
    Array.from({ length: GRID }, () => ({ code, color }))
  );
}

/** Optionally invert a [0,1] value. */
function maybeInvert(t: number, invert: boolean): number {
  return invert ? 1 - t : t;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

function generateGradient(font: Font, cfg: PatternConfig): Pixel[][] {
  const table = buildDensityTable(font, cfg.category, cfg.caseMode);
  if (table.length === 0) return emptyGrid(0x20, cfg.color);
  const grid = emptyGrid(0x20, cfg.color);
  // Seed controls a phase offset so different seeds shift the gradient
  const phase = (cfg.seed - 1) / 98; // normalise to [0,1]

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      let t: number;
      if (cfg.direction === 'vertical') {
        t = row / (GRID - 1);
      } else if (cfg.direction === 'diagonal') {
        t = (row + col) / (2 * (GRID - 1));
      } else {
        t = col / (GRID - 1);
      }
      // Scale compresses the gradient range, seed offsets it
      t = (t * cfg.scale + phase) % 1;
      t = maybeInvert(t, cfg.invert);

      const code = charAtDensity(table, t);
      let color = cfg.color;
      if (cfg.colorGradient) {
        color = t < 0.5 ? cfg.bgColor : cfg.color;
      }
      grid[row][col] = { code, color };
    }
  }
  return grid;
}

function generateDither(font: Font, cfg: PatternConfig): Pixel[][] {
  const table = buildDensityTable(font, cfg.category, cfg.caseMode);
  if (table.length === 0) return emptyGrid(0x20, cfg.color);

  // 4×4 Bayer matrix (normalised to [0,1])
  const bayer4 = [
    [ 0/16,  8/16,  2/16, 10/16],
    [12/16,  4/16, 14/16,  6/16],
    [ 3/16, 11/16,  1/16,  9/16],
    [15/16,  7/16, 13/16,  5/16],
  ];

  const grid = emptyGrid(0x20, cfg.color);
  const sc = Math.max(1, cfg.scale);
  const rng = mulberry32(cfg.seed * 5381);
  // Seed adds a per-cell random perturbation to the threshold
  const jitter = (cfg.seed - 1) / 98 * 0.3; // 0–0.3 range

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const br = Math.floor(row / sc) % 4;
      const bc = Math.floor(col / sc) % 4;
      let t = bayer4[br][bc] + (rng() - 0.5) * jitter;
      t = Math.max(0, Math.min(1, t));

      if (cfg.direction === 'vertical') {
        t = (t + row / GRID) / 2;
      } else if (cfg.direction === 'diagonal') {
        t = (t + (row + col) / (2 * GRID)) / 2;
      }

      t = maybeInvert(t, cfg.invert);
      const code = charAtDensity(table, t);
      const color = cfg.colorGradient
        ? (t < 0.5 ? cfg.bgColor : cfg.color)
        : cfg.color;
      grid[row][col] = { code, color };
    }
  }
  return grid;
}

function generateNoise(font: Font, cfg: PatternConfig): Pixel[][] {
  const table = buildDensityTable(font, cfg.category, cfg.caseMode);
  if (table.length === 0) return emptyGrid(0x20, cfg.color);

  const rng = mulberry32(cfg.seed * 7919);
  const grid = emptyGrid(0x20, cfg.color);

  // Generate a base noise field, then optionally smooth at larger scales
  const raw: number[][] = Array.from({ length: GRID }, () =>
    Array.from({ length: GRID }, () => rng())
  );

  // Simple box‐blur pass when scale > 1
  const sc = Math.max(1, Math.min(cfg.scale, 8));
  const field: number[][] = Array.from({ length: GRID }, () => Array(GRID).fill(0));
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      let sum = 0;
      let cnt = 0;
      for (let dr = -sc; dr <= sc; dr++) {
        for (let dc = -sc; dc <= sc; dc++) {
          const nr = ((r + dr) % GRID + GRID) % GRID;
          const nc = ((c + dc) % GRID + GRID) % GRID;
          sum += raw[nr][nc];
          cnt++;
        }
      }
      field[r][c] = sum / cnt;
    }
  }

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      let t = field[row][col];
      t = maybeInvert(t, cfg.invert);
      const code = charAtDensity(table, t);
      const color = cfg.colorGradient
        ? (t < 0.5 ? cfg.bgColor : cfg.color)
        : cfg.color;
      grid[row][col] = { code, color };
    }
  }
  return grid;
}

function generateStripes(font: Font, cfg: PatternConfig): Pixel[][] {
  const table = buildDensityTable(font, cfg.category, cfg.caseMode);
  if (table.length === 0) return emptyGrid(0x20, cfg.color);

  // Seed shifts which density positions are sampled
  const seedOffset = (cfg.seed - 1) / 98 * 0.5; // 0–0.5 shift
  const numChars = Math.min(4, Math.max(2, cfg.scale));
  const stripeChars: number[] = [];
  for (let i = 0; i < numChars; i++) {
    const t = Math.min(1, i / (numChars - 1) + seedOffset) % 1;
    stripeChars.push(charAtDensity(table, cfg.invert ? 1 - t : t));
  }

  const stripeWidth = Math.max(1, cfg.scale);
  const grid = emptyGrid(0x20, cfg.color);

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      let coord: number;
      if (cfg.direction === 'vertical') coord = row;
      else if (cfg.direction === 'diagonal') coord = row + col;
      else coord = col;

      const idx = Math.floor(coord / stripeWidth) % numChars;
      const code = stripeChars[idx];
      const color = cfg.colorGradient && idx >= numChars / 2
        ? cfg.color
        : cfg.colorGradient ? cfg.bgColor : cfg.color;
      grid[row][col] = { code, color };
    }
  }
  return grid;
}

function generateChecker(font: Font, cfg: PatternConfig): Pixel[][] {
  const table = buildDensityTable(font, cfg.category, cfg.caseMode);
  if (table.length === 0) return emptyGrid(0x20, cfg.color);

  // Seed shifts which density positions are sampled for light/dark chars
  const seedShift = (cfg.seed - 1) / 98 * 0.4; // 0–0.4
  const lightChar = charAtDensity(table, cfg.invert ? 0.8 + seedShift * 0.5 : 0.0 + seedShift);
  const darkChar = charAtDensity(table, cfg.invert ? 0.0 + seedShift : 0.8 + seedShift * 0.5);
  const blockSize = Math.max(1, Math.min(cfg.scale, 8));
  const grid = emptyGrid(0x20, cfg.color);

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const even = (Math.floor(row / blockSize) + Math.floor(col / blockSize)) % 2 === 0;
      grid[row][col] = {
        code: even ? lightChar : darkChar,
        color: cfg.colorGradient
          ? (even ? cfg.bgColor : cfg.color)
          : cfg.color,
      };
    }
  }
  return grid;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a 16×16 pattern grid.
 */
export function generatePattern(font: Font, config: PatternConfig): Pixel[][] {
  switch (config.type) {
    case 'gradient':  return generateGradient(font, config);
    case 'dither':    return generateDither(font, config);
    case 'noise':     return generateNoise(font, config);
    case 'stripes':   return generateStripes(font, config);
    case 'checker':   return generateChecker(font, config);
    default:          return emptyGrid(0x20, config.color);
  }
}
