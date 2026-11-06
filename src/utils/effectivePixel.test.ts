import { resolveEffectivePixel, effectivePixelsEqual, isTransparentScreencode } from './effectivePixel';
import { TRANSPARENT_SCREENCODE, VDC_TRANSPARENT_SCREENCODE } from '../redux/types';
import { VDC_ATTR_ALTCHAR, VDC_ATTR_REVERSE, VDC_ATTR_UNDERLINE, VDC_ATTR_BLINK } from './vdcAttr';

describe('resolveEffectivePixel (legacy / non-VDC, non-TED)', () => {
  it('passes code/color through unchanged', () => {
    expect(resolveEffectivePixel({ code: 65, color: 5 })).toEqual({
      glyph: 65,
      color: 5,
      transparent: false,
      reverse: false,
      underline: false,
      blink: false,
    });
  });

  it('treats the legacy sentinel and explicit flag as transparent', () => {
    expect(resolveEffectivePixel({ code: TRANSPARENT_SCREENCODE, color: 0 }).transparent).toBe(true);
    expect(resolveEffectivePixel({ code: 0x20, color: 0, transparent: true }).transparent).toBe(true);
  });

  it('tolerates a VDC-style transparent sentinel on a non-VDC charset', () => {
    expect(resolveEffectivePixel({ code: VDC_TRANSPARENT_SCREENCODE, color: 0 }).transparent).toBe(true);
  });
});

describe('resolveEffectivePixel (VDC)', () => {
  it('biases the glyph by 256 when ALTCHAR is set', () => {
    const r = resolveEffectivePixel({ code: 65, color: 0, attr: VDC_ATTR_ALTCHAR }, { isVdc: true });
    expect(r.glyph).toBe(65 + 256);
  });

  it('does not bias the glyph when ALTCHAR is unset', () => {
    const r = resolveEffectivePixel({ code: 65, color: 0, attr: 0 }, { isVdc: true });
    expect(r.glyph).toBe(65);
  });

  it('decodes reverse/underline/blink flags', () => {
    // attr's low nibble carries the colour when attr is present (effectiveAttr
    // ignores Pixel.color once attr is set) -- pack colour 3 alongside the flags.
    const attr = 3 | VDC_ATTR_REVERSE | VDC_ATTR_UNDERLINE | VDC_ATTR_BLINK;
    const r = resolveEffectivePixel({ code: 1, color: 0, attr }, { isVdc: true });
    expect(r.reverse).toBe(true);
    expect(r.underline).toBe(true);
    expect(r.blink).toBe(true);
    expect(r.color).toBe(3);
  });

  it('falls back to color & 0x0f when attr is missing', () => {
    const r = resolveEffectivePixel({ code: 1, color: 0x1f }, { isVdc: true });
    expect(r.color).toBe(0x0f);
  });

  it('reports transparent cells with no attribute flags set', () => {
    const r = resolveEffectivePixel({ code: 0, color: 0, transparent: true }, { isVdc: true });
    expect(r.transparent).toBe(true);
    expect(r.reverse).toBe(false);
    expect(r.blink).toBe(false);
  });
});

describe('resolveEffectivePixel (TED)', () => {
  it('masks the blink bit out of the colour', () => {
    const r = resolveEffectivePixel({ code: 10, color: 0x85 }, { isTed: true });
    expect(r.color).toBe(0x05);
    expect(r.blink).toBe(true);
  });

  it('reports blink false when bit 7 is unset', () => {
    const r = resolveEffectivePixel({ code: 10, color: 0x05 }, { isTed: true });
    expect(r.blink).toBe(false);
  });

  it('never reports blink for a transparent cell', () => {
    const r = resolveEffectivePixel({ code: TRANSPARENT_SCREENCODE, color: 0x85 }, { isTed: true });
    expect(r.transparent).toBe(true);
    expect(r.blink).toBe(false);
  });
});

describe('isTransparentScreencode', () => {
  it('recognizes both the legacy and VDC-specific transparent sentinels', () => {
    expect(isTransparentScreencode(TRANSPARENT_SCREENCODE)).toBe(true);
    expect(isTransparentScreencode(VDC_TRANSPARENT_SCREENCODE)).toBe(true);
  });

  it('does not treat an ordinary screencode as transparent', () => {
    expect(isTransparentScreencode(65)).toBe(false);
    expect(isTransparentScreencode(0)).toBe(false);
  });
});

describe('effectivePixelsEqual', () => {
  it('treats identical legacy cells as equal', () => {
    expect(effectivePixelsEqual({ code: 1, color: 2 }, { code: 1, color: 2 })).toBe(true);
  });

  it('treats differing colour as unequal', () => {
    expect(effectivePixelsEqual({ code: 1, color: 2 }, { code: 1, color: 3 })).toBe(false);
  });

  it('treats same code/color but different ALTCHAR bank as unequal on VDC', () => {
    const a = { code: 1, color: 0, attr: 0 };
    const b = { code: 1, color: 0, attr: VDC_ATTR_ALTCHAR };
    expect(effectivePixelsEqual(a, a, { isVdc: true })).toBe(true);
    expect(effectivePixelsEqual(a, b, { isVdc: true })).toBe(false);
  });

  it('treats two transparent cells as equal regardless of other fields', () => {
    const a = { code: 1, color: 2, transparent: true };
    const b = { code: 9, color: 9, transparent: true };
    expect(effectivePixelsEqual(a, b)).toBe(true);
  });

  it('treats a transparent and non-transparent cell as unequal', () => {
    const a = { code: 1, color: 2, transparent: true };
    const b = { code: 1, color: 2 };
    expect(effectivePixelsEqual(a, b)).toBe(false);
  });

  it('ignores TED blink-bit-only differences when not relevant to equality beyond blink flag', () => {
    const a = { code: 1, color: 0x05 };
    const b = { code: 1, color: 0x85 };
    // Same glyph/colour (post-mask), but differing blink flag -> not equal.
    expect(effectivePixelsEqual(a, b, { isTed: true })).toBe(false);
  });
});
