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
  const { options, random = false, mirror = false, scale = 1, textColor, backgroundColor } = opts;
  const vertical = options[TEXTURE_OPTION_VERTICAL];
  const invert = options[TEXTURE_OPTION_INVERT];
  const colorGrad = options[TEXTURE_OPTION_COLOR_GRADIENT];
  const diagonal = options[TEXTURE_OPTION_DIAGONAL];

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
  const stripLen = scaledChars.length || 1;

  const grid: Pixel[][] = [];
  for (let row = 0; row < height; row++) {
    const rowPixels: Pixel[] = [];
    for (let col = 0; col < width; col++) {
      let idx: number;
      if (random) {
        idx = Math.floor(Math.random() * stripLen);
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
      rowPixels.push({ code, color });
    }
    grid.push(rowPixels);
  }

  // Max transparency: replace space / solid-block cells with transparent.
  if (options[TEXTURE_OPTION_MAX_TRANSPARENCY]) {
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const code = grid[r][c].code;
        if (code === 0x20 || code === 0xA0) {
          grid[r][c] = { ...grid[r][c], code: TRANSPARENT_SCREENCODE };
        }
      }
    }
  }
  return grid;
}
