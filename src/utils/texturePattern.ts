// ─────────────────────────────────────────────────────────────────────────
// Canonical texture-pattern generator.
//
// This logic originally lived only inside `TexturePanel.tsx`'s `buildGrid`
// (used for the panel's live preview, and for its Brush/Fill output modes).
// `Editor.tsx`'s Textures tool independently reimplements its own, simpler
// tiler for Box/Bucket/Replace-all draw modes that doesn't apply the
// preset's mirror/scale/max-transparency options, so the exact same preset
// renders differently depending on which texture draw mode is active. See
// review-0926.md, cross-cutting theme #1.
//
// This module is the shared, pure implementation both call sites should be
// migrated onto (see review-0926.md master task list, group K). It is
// intentionally framework/component-agnostic — no React — so it can be
// called from a React component, a class-based tool handler, or export
// code alike.
// ─────────────────────────────────────────────────────────────────────────

import { Pixel, TRANSPARENT_SCREENCODE } from '../redux/types';

/** Indices into a texture preset's `options` boolean array. */
export const TEXTURE_OPTION_VERTICAL = 0;
export const TEXTURE_OPTION_INVERT = 1;
export const TEXTURE_OPTION_COLOR_GRADIENT = 2;
// Index 3 is currently unused.
export const TEXTURE_OPTION_DIAGONAL = 4;
export const TEXTURE_OPTION_MAX_TRANSPARENCY = 5;

export interface TexturePatternOptions {
  /** [Vertical/Horizontal, Invert, ColorGradient, (unused), Diagonal, MaxTransparency]. */
  options: boolean[];
  /** Randomly pick a character from the (post mirror/scale) strip for each
   *  cell instead of tiling it in strip order. Note: when true, calling
   *  this function twice with identical arguments will NOT produce
   *  identical output — that's intentional/matches prior behavior. */
  random?: boolean;
  /** Palindrome the character/colour strip (1234 -> 1234321) before
   *  scaling, so the tiled pattern doesn't show a visible seam where it
   *  repeats. */
  mirror?: boolean;
  /** Repeat each character in the strip this many times (expected range
   *  1-8) before tiling. Defaults to 1 (no extra repetition). */
  scale?: number;
  /** Foreground colour substituted on even-indexed strip cells when the
   *  ColorGradient option is enabled. */
  textColor: number;
  /** Background colour substituted on odd-indexed strip cells when the
   *  ColorGradient option is enabled. */
  backgroundColor: number;
}

interface ProcessedStrip {
  scaledChars: number[];
  scaledColors: number[];
  stripLen: number;
}

/** Apply invert + mirror + scale to the raw chars/colors strip, producing
 *  the final tiling unit both `sampleTexturePattern` and `buildTexturePattern`
 *  index into. Factored out so both share identical preprocessing instead
 *  of two independent reimplementations silently drifting apart. */
function buildProcessedStrip(chars: number[], colors: number[], opts: TexturePatternOptions): ProcessedStrip {
  const { options, mirror = false, scale = 1 } = opts;
  const invert = options[TEXTURE_OPTION_INVERT];

  let baseChars = [...chars];
  let baseColors = [...colors];
  if (invert) { baseChars.reverse(); baseColors.reverse(); }

  // Mirror: palindrome the pattern (1234 → 1234321) before scaling.
  if (mirror && baseChars.length > 1) {
    const revChars = baseChars.slice(0, -1).reverse();
    const revColors = baseColors.slice(0, -1).reverse();
    baseChars = [...baseChars, ...revChars];
    baseColors = [...baseColors, ...revColors];
  }

  // Scale: repeat each character `scale` times.
  const scaledChars: number[] = [];
  const scaledColors: number[] = [];
  for (let i = 0; i < baseChars.length; i++) {
    for (let s = 0; s < scale; s++) {
      scaledChars.push(baseChars[i]);
      scaledColors.push(baseColors[i]);
    }
  }
  return { scaledChars, scaledColors, stripLen: scaledChars.length || 1 };
}

/**
 * Sample a single cell of the tiled texture pattern at canvas-absolute
 * `(row, col)`, in O(1), without building a full grid. Produces exactly
 * the same result `buildTexturePattern` would produce at that cell (it's
 * implemented in terms of this function) -- intended for call sites that
 * sample a handful of cells (flood-fill/bucket-fill BFS, a live box-fill
 * drag preview) and can't afford to allocate a full width x height grid
 * per sampled cell, or per dragged-over cell.
 *
 * `randomValue01`, used instead of `Math.random()` when `opts.random` is
 * set, lets a caller pass a seeded/deterministic source (e.g. keyed by
 * `(row, col)` plus a per-gesture seed) so repeated samples of the same
 * cell during one drag/fill session agree with each other instead of
 * reshuffling on every call. Omitting it matches `buildTexturePattern`'s
 * own non-deterministic default.
 */
export function sampleTexturePattern(
  chars: number[],
  colors: number[],
  row: number,
  col: number,
  opts: TexturePatternOptions,
  randomValue01?: () => number,
): Pixel {
  const { options, random = false, textColor, backgroundColor } = opts;
  const vertical = options[TEXTURE_OPTION_VERTICAL];
  const diagonal = options[TEXTURE_OPTION_DIAGONAL];
  const colorGrad = options[TEXTURE_OPTION_COLOR_GRADIENT];
  const { scaledChars, scaledColors, stripLen } = buildProcessedStrip(chars, colors, opts);

  let idx: number;
  if (random) {
    idx = Math.floor((randomValue01 ? randomValue01() : Math.random()) * stripLen);
  } else if (vertical) {
    idx = diagonal ? (row + col) % stripLen : row % stripLen;
  } else {
    idx = diagonal ? (col + row) % stripLen : col % stripLen;
  }
  const code = scaledChars[idx] ?? 0x20;
  let color = scaledColors[idx] ?? 14;
  if (colorGrad) {
    color = idx % 2 === 0 ? textColor : backgroundColor;
  }
  // Max transparency: replace space / solid-block cells with transparent.
  if (options[TEXTURE_OPTION_MAX_TRANSPARENCY] && (code === 0x20 || code === 0xA0)) {
    return { code: TRANSPARENT_SCREENCODE, color };
  }
  return { code, color };
}

/**
 * Build a `width` x `height` grid of pixels by tiling the given
 * character/colour strip according to `opts`.
 *
 * Pure function: given the same inputs it always returns the same output,
 * with the sole exception of `opts.random`, which intentionally re-rolls a
 * new random tiling on every call (matching the panel's prior behavior).
 */
export function buildTexturePattern(
  chars: number[],
  colors: number[],
  width: number,
  height: number,
  opts: TexturePatternOptions,
): Pixel[][] {
  const grid: Pixel[][] = [];
  for (let row = 0; row < height; row++) {
    const rowPixels: Pixel[] = [];
    for (let col = 0; col < width; col++) {
      rowPixels.push(sampleTexturePattern(chars, colors, row, col, opts));
    }
    grid.push(rowPixels);
  }
  return grid;
}
