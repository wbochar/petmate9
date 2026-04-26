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
} from './vdcAttr';

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
