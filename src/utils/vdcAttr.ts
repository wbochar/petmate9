// ─────────────────────────────────────────────────────────────────────────
// C128 VDC (8563/8568) attribute byte helpers.
//
// The VDC attribute byte (one byte per cell, stored in attribute RAM at
// $D600/$D601 → VDC $0800 in the default layout) packs the following:
//
//   bit 7  ALTCHAR   alternate character set: glyph 256–511 instead of 0–255
//   bit 6  REVERSE   invert the character bitmap in hardware
//   bit 5  UNDERLINE draw an underline at the bottom scanline of the cell
//   bit 4  BLINK     flash the character at the global VDC blink rate
//   bits 0-3         foreground colour (0–15 of the RGBI palette)
//
// Petmate's `Pixel.attr` field stores this byte verbatim for VDC frames.
// `Pixel.color` retains the 4-bit foreground colour for backward
// compatibility with all of the existing C64-family paint pipelines.  The
// helpers below keep the two views in sync and let other modules toggle
// individual attribute bits without spreading bit-twiddling everywhere.
// ─────────────────────────────────────────────────────────────────────────

import { Pixel } from '../redux/types';

export const VDC_ATTR_BLINK     = 0x10;
export const VDC_ATTR_UNDERLINE = 0x20;
export const VDC_ATTR_REVERSE   = 0x40;
export const VDC_ATTR_ALTCHAR   = 0x80;

export const VDC_ATTR_COLOR_MASK = 0x0f;
export const VDC_ATTR_FLAG_MASK  = 0xf0;

/** Compose an attribute byte from a colour and a partial flag set. */
export function packAttr(color: number, flags: {
  blink?: boolean;
  underline?: boolean;
  reverse?: boolean;
  altCharset?: boolean;
} = {}): number {
  let attr = color & VDC_ATTR_COLOR_MASK;
  if (flags.blink)      attr |= VDC_ATTR_BLINK;
  if (flags.underline)  attr |= VDC_ATTR_UNDERLINE;
  if (flags.reverse)    attr |= VDC_ATTR_REVERSE;
  if (flags.altCharset) attr |= VDC_ATTR_ALTCHAR;
  return attr & 0xff;
}

/** Unpack an attribute byte into its boolean flag fields. */
export function unpackAttr(attr: number): {
  color: number;
  blink: boolean;
  underline: boolean;
  reverse: boolean;
  altCharset: boolean;
} {
  return {
    color:      attr & VDC_ATTR_COLOR_MASK,
    blink:      (attr & VDC_ATTR_BLINK) !== 0,
    underline:  (attr & VDC_ATTR_UNDERLINE) !== 0,
    reverse:    (attr & VDC_ATTR_REVERSE) !== 0,
    altCharset: (attr & VDC_ATTR_ALTCHAR) !== 0,
  };
}

/**
 * Resolve the attribute byte for a pixel, falling back to the legacy
 * `color & 0x0f` if `attr` is undefined.  This keeps non-VDC pixels
 * looking the same to consumers that want a single byte to write to
 * VDC attribute RAM.
 */
export function effectiveAttr(pix: Pixel): number {
  if (pix.attr !== undefined) return pix.attr & 0xff;
  return (pix.color & VDC_ATTR_COLOR_MASK);
}

/**
 * Resolve the final glyph index (0–511) for a VDC pixel.  When the
 * pixel has no `attr` value (e.g. pasted from a non-VDC source) we
 * default to the lower half (0–255).
 */
export function effectiveGlyph(pix: Pixel): number {
  const code = pix.code & 0xff;
  const attr = effectiveAttr(pix);
  return code + ((attr & VDC_ATTR_ALTCHAR) ? 256 : 0);
}

/** Set the colour nibble of an attribute byte without disturbing flags. */
export function withColor(attr: number, color: number): number {
  return ((attr & VDC_ATTR_FLAG_MASK) | (color & VDC_ATTR_COLOR_MASK)) & 0xff;
}

/** Toggle one of the flag bits on the supplied attribute byte. */
export function toggleFlag(attr: number, flag: number): number {
  return (attr ^ flag) & 0xff;
}

/** Charset id used by 80-column C128 VDC documents. */
export const CHARSET_C128_VDC = 'c128vdc';

/** Detect VDC frames purely from charset id. */
export function isVdcCharset(charset: string): boolean {
  return charset === CHARSET_C128_VDC;
}
