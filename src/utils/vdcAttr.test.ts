import {
  VDC_ATTR_BLINK,
  VDC_ATTR_UNDERLINE,
  VDC_ATTR_REVERSE,
  VDC_ATTR_ALTCHAR,
  VDC_ATTR_COLOR_MASK,
  packAttr,
  unpackAttr,
  effectiveAttr,
  effectiveGlyph,
  withColor,
  toggleFlag,
  isVdcCharset,
  CHARSET_C128_VDC,
  encodeVdcGeneratedPixel,
} from './vdcAttr';
import { TRANSPARENT_SCREENCODE, VDC_TRANSPARENT_SCREENCODE } from '../redux/types';

describe('packAttr / unpackAttr', () => {
  it('round-trips colour-only with no flags set', () => {
    const attr = packAttr(0xa);
    expect(attr).toBe(0xa);
    expect(unpackAttr(attr)).toEqual({
      color: 0xa,
      blink: false,
      underline: false,
      reverse: false,
      altCharset: false,
    });
  });

  it('packs every flag bit at the documented position', () => {
    expect(packAttr(0, { blink: true })).toBe(VDC_ATTR_BLINK);
    expect(packAttr(0, { underline: true })).toBe(VDC_ATTR_UNDERLINE);
    expect(packAttr(0, { reverse: true })).toBe(VDC_ATTR_REVERSE);
    expect(packAttr(0, { altCharset: true })).toBe(VDC_ATTR_ALTCHAR);
  });

  it('combines flags with colour without overflow', () => {
    const attr = packAttr(0xf, {
      blink: true,
      underline: true,
      reverse: true,
      altCharset: true,
    });
    expect(attr).toBe(0xff);
    expect(unpackAttr(attr).color).toBe(0xf);
  });

  it('masks the colour to four bits', () => {
    expect(packAttr(0x1f) & VDC_ATTR_COLOR_MASK).toBe(0x0f);
  });
});

describe('withColor / toggleFlag', () => {
  it('replaces only the colour nibble', () => {
    const attr = packAttr(0x3, { reverse: true, altCharset: true });
    const updated = withColor(attr, 0x9);
    expect(unpackAttr(updated).color).toBe(0x9);
    expect(unpackAttr(updated).reverse).toBe(true);
    expect(unpackAttr(updated).altCharset).toBe(true);
  });

  it('toggles a single flag bit without disturbing others', () => {
    let attr = packAttr(0x4, { blink: true });
    attr = toggleFlag(attr, VDC_ATTR_REVERSE);
    expect(unpackAttr(attr).reverse).toBe(true);
    expect(unpackAttr(attr).blink).toBe(true);
    attr = toggleFlag(attr, VDC_ATTR_REVERSE);
    expect(unpackAttr(attr).reverse).toBe(false);
    expect(unpackAttr(attr).blink).toBe(true);
  });
});

describe('effectiveAttr / effectiveGlyph', () => {
  it('falls back to (color & 0x0f) when attr is missing', () => {
    expect(effectiveAttr({ code: 0, color: 0x1f })).toBe(0x0f);
  });

  it('uses attr verbatim when present', () => {
    expect(effectiveAttr({ code: 0, color: 0, attr: 0xc7 })).toBe(0xc7);
  });

  it('returns the lower bank glyph when ALT is unset', () => {
    expect(effectiveGlyph({ code: 65, color: 0 })).toBe(65);
  });

  it('returns the upper bank glyph when ALT is set', () => {
    expect(
      effectiveGlyph({ code: 65, color: 0, attr: VDC_ATTR_ALTCHAR })
    ).toBe(65 + 256);
  });
});

describe('isVdcCharset', () => {
  it('only matches the dedicated VDC charset', () => {
    expect(isVdcCharset(CHARSET_C128_VDC)).toBe(true);
    expect(isVdcCharset('c128Upper')).toBe(false);
    expect(isVdcCharset('upper')).toBe(false);
  });
});

// Regression tests for K3 (Group K master task list): box/texture pattern
// generators (boxGen.ts, texturePattern.ts) are platform-agnostic and store
// the VDC ALTCHAR bank directly in `code` as 256-511, unlike the main
// framebuf's Pixel.code/Pixel.attr split. Brush-based commits (box-fill
// stamp, Boxes tool) and their live previews previously consumed that raw
// output as-is, producing an out-of-range `code` with no ALTCHAR bit --
// rendering differently than the exact same preset committed via
// bucket-fill/replace-all (which already decode the convention correctly
// via applyVdcSet). encodeVdcGeneratedPixel is the canonical conversion
// both paths should use.
describe('encodeVdcGeneratedPixel', () => {
  it('leaves a lower-bank cell as-is (no ALTCHAR bit), still syncing the colour nibble', () => {
    const result = encodeVdcGeneratedPixel({ code: 10, color: 5 });
    expect(result.code).toBe(10);
    expect(result.attr).toBe(5);
    expect(result.attr! & VDC_ATTR_ALTCHAR).toBe(0);
  });

  it('masks an ALT-bank code (256-511) to 0-255 and sets the ALTCHAR bit', () => {
    const result = encodeVdcGeneratedPixel({ code: 266, color: 7 });
    expect(result.code).toBe(10); // 266 & 0xff
    expect(result.attr! & VDC_ATTR_ALTCHAR).toBe(VDC_ATTR_ALTCHAR);
    expect(result.attr! & 0x0f).toBe(7);
  });

  it('is idempotent: re-encoding an already-encoded cell does not change it', () => {
    const once = encodeVdcGeneratedPixel({ code: 266, color: 7 });
    const twice = encodeVdcGeneratedPixel(once);
    expect(twice).toEqual(once);
  });

  it('preserves the legacy transparent sentinel (256) as a proper VDC transparent cell', () => {
    // 256 collides with the start of the ALT-bank code range, so this must
    // not be treated as "ALT bank code 0".
    const result = encodeVdcGeneratedPixel({ code: TRANSPARENT_SCREENCODE, color: 3 });
    expect(result.transparent).toBe(true);
    expect(result.code).toBe(VDC_TRANSPARENT_SCREENCODE);
  });

  it('preserves the VDC-specific transparent sentinel (512)', () => {
    const result = encodeVdcGeneratedPixel({ code: VDC_TRANSPARENT_SCREENCODE, color: 3 });
    expect(result.transparent).toBe(true);
    expect(result.code).toBe(VDC_TRANSPARENT_SCREENCODE);
  });

  it('preserves an explicit transparent flag regardless of code', () => {
    const result = encodeVdcGeneratedPixel({ code: 5, color: 3, transparent: true });
    expect(result.transparent).toBe(true);
    expect(result.code).toBe(VDC_TRANSPARENT_SCREENCODE);
  });
});
