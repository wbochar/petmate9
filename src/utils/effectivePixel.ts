// ─────────────────────────────────────────────────────────────────────────
// Canonical "what does this cell actually look like" resolver.
//
// Several independent renderers and bulk-edit code paths — CharGrid's main
// canvas renderer, Editor.tsx's fill/bucket-fill/replace-all/find-replace
// tools, TexturePanel/BoxesPanel/LinesPanel/FindReplacePanel's own preview
// renderers, and toolbar.ts's Find & Replace mutation — each reimplement
// their own version of "resolve this Pixel's glyph/colour/transparency,
// accounting for VDC attributes and TED blink". They don't all agree: some
// compare raw `.code`/`.color` only and miss VDC ALTCHAR-only differences
// (two cells with the same code/colour but a different ALTCHAR bank look
// completely different), or treat TED's blink colour bit as part of the
// palette index. See review-0926.md, cross-cutting theme #1.
//
// This module is the single source of truth those call sites should be
// migrated onto (see review-0926.md master task list, groups H/J/K). It is
// intentionally framework/component-agnostic — no React, no Redux — so it
// can be reused everywhere from the canvas renderer to pure bulk-edit
// reducers and CLI-style export code.
// ─────────────────────────────────────────────────────────────────────────

import { Pixel, TRANSPARENT_SCREENCODE, VDC_TRANSPARENT_SCREENCODE } from '../redux/types';
import {
  effectiveAttr,
  VDC_ATTR_ALTCHAR,
  VDC_ATTR_REVERSE,
  VDC_ATTR_UNDERLINE,
  VDC_ATTR_BLINK,
} from './vdcAttr';

export interface EffectivePixelOptions {
  /** C128 VDC 80-column frame: honor `Pixel.attr` (ALTCHAR/REVERSE/UNDERLINE/BLINK). */
  isVdc?: boolean;
  /** C16/Plus4 TED frame: honor the colour byte's bit 7 as a blink flag. */
  isTed?: boolean;
}

export interface EffectivePixel {
  /** Resolved glyph index into the active font's bitmap data. For VDC this
   *  is already biased +256 when ALTCHAR is set; for everything else it's
   *  simply `code & 0xff`. When `transparent` is true this is set to the
   *  platform-appropriate transparent sentinel rather than a real glyph. */
  glyph: number;
  /** Resolved colour index. For TED this is masked to the low 7 bits (bit
   *  7 is the blink flag, not part of the palette index); for everything
   *  else it's the pixel's `color` field unchanged. */
  color: number;
  /** True when the cell should be treated as transparent/empty — no glyph
   *  should be drawn and bulk-edit tools should treat the cell as "no
   *  content" rather than comparing its glyph/colour. */
  transparent: boolean;
  /** VDC REVERSE attribute bit. Always false outside VDC, or when transparent. */
  reverse: boolean;
  /** VDC UNDERLINE attribute bit. Always false outside VDC, or when transparent. */
  underline: boolean;
  /** VDC BLINK attribute bit, or TED colour bit 7. Always false otherwise,
   *  or when transparent. */
  blink: boolean;
}

/** Legacy/cross-platform transparency sentinels: an explicit `transparent`
 *  flag, the legacy 256 sentinel (meaningful on non-VDC charsets), or the
 *  VDC-only 512 sentinel (tolerated here too so a VDC brush/preset can be
 *  safely previewed on a non-VDC frame). */
function isSentinelTransparent(cell: Pixel): boolean {
  return cell.transparent === true
    || cell.code === TRANSPARENT_SCREENCODE
    || cell.code === VDC_TRANSPARENT_SCREENCODE;
}

/**
 * Resolve a `Pixel` into its fully-decoded, platform-aware appearance.
 *
 * This mirrors the per-cell logic already used by `CharGrid.tsx`'s `draw()`
 * method; call sites that currently duplicate that logic (or a simplified,
 * attribute-blind subset of it) should migrate to call this instead.
 */
export function resolveEffectivePixel(cell: Pixel, options: EffectivePixelOptions = {}): EffectivePixel {
  if (options.isVdc) {
    const transparent = isSentinelTransparent(cell);
    if (transparent) {
      return {
        glyph: VDC_TRANSPARENT_SCREENCODE,
        color: cell.color & 0x0f,
        transparent: true,
        reverse: false,
        underline: false,
        blink: false,
      };
    }
    const attr = effectiveAttr(cell);
    return {
      glyph: (cell.code & 0xff) + ((attr & VDC_ATTR_ALTCHAR) ? 256 : 0),
      color: attr & 0x0f,
      transparent: false,
      reverse: (attr & VDC_ATTR_REVERSE) !== 0,
      underline: (attr & VDC_ATTR_UNDERLINE) !== 0,
      blink: (attr & VDC_ATTR_BLINK) !== 0,
    };
  }

  if (options.isTed) {
    const transparent = isSentinelTransparent(cell);
    return {
      glyph: transparent ? TRANSPARENT_SCREENCODE : (cell.code & 0xff),
      color: cell.color & 0x7f,
      transparent,
      reverse: false,
      underline: false,
      blink: !transparent && (cell.color & 0x80) !== 0,
    };
  }

  // Legacy / all other charsets (C64, VIC-20, PET, C128 40-col, DirArt,
  // custom fonts, etc). Tolerate VDC-style transparency sentinels so a
  // brush/preset captured on a VDC frame can still be previewed safely.
  const transparent = isSentinelTransparent(cell);
  return {
    glyph: transparent ? TRANSPARENT_SCREENCODE : (cell.code & 0xff),
    color: cell.color,
    transparent,
    reverse: false,
    underline: false,
    blink: false,
  };
}

/**
 * True when two pixels would look identical under the given platform
 * rules. Prefer this over comparing `.code`/`.color` directly in any tool
 * (flood fill, replace-all, find/replace, bucket fill, etc.) whenever the
 * active charset might be VDC/TED: raw-field comparisons miss ALTCHAR-only
 * differences and can mismatch on TED's blink bit even when blink state
 * isn't meant to be part of the comparison for that tool.
 */
export function effectivePixelsEqual(a: Pixel, b: Pixel, options: EffectivePixelOptions = {}): boolean {
  const ea = resolveEffectivePixel(a, options);
  const eb = resolveEffectivePixel(b, options);
  if (ea.transparent || eb.transparent) {
    return ea.transparent === eb.transparent;
  }
  return ea.glyph === eb.glyph
    && ea.color === eb.color
    && ea.reverse === eb.reverse
    && ea.underline === eb.underline
    && ea.blink === eb.blink;
}
