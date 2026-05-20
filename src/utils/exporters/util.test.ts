import { computeOutputImageDims, framebufToPixelsIndexed, scalePixels, scalePixelsXY, screencodeToExportByte } from './util';
import { FramebufWithFont, Font, TRANSPARENT_SCREENCODE, VDC_TRANSPARENT_SCREENCODE } from '../../redux/types';
import { VDC_ATTR_ALTCHAR, VDC_ATTR_REVERSE, VDC_ATTR_UNDERLINE } from '../vdcAttr';

// Minimal font: all 256 chars, 8 bytes each, all zeros
function makeEmptyFont(): Font {
  return {
    bits: new Array(256 * 8).fill(0),
    charOrder: Array.from({ length: 256 }, (_, i) => i),
  };
}

function makeFramebuf(width: number, height: number): FramebufWithFont {
  const framebuf = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ code: 32, color: 14 }))
  );
  return {
    framebuf,
    width,
    height,
    backgroundColor: 6,
    borderColor: 14,
    borderOn: true,
    charset: 'upper',
    name: 'test',
    zoom: { zoomLevel: 1, alignment: 'left' },
    zoomReady: true,
    font: makeEmptyFont(),
  };
}

describe('computeOutputImageDims', () => {
  it('returns character dimensions * 8 without borders', () => {
    const fb = makeFramebuf(40, 25);
    const dims = computeOutputImageDims(fb, false);
    expect(dims.imgWidth).toBe(40 * 8);   // 320
    expect(dims.imgHeight).toBe(25 * 8);  // 200
    expect(dims.imgXOffset).toBe(0);
    expect(dims.imgYOffset).toBe(0);
  });

  it('adds VICE-style border sizes when borders are enabled', () => {
    const fb = makeFramebuf(40, 25);
    const dims = computeOutputImageDims(fb, true);
    // VICE border sizes: left=32, right=32, top=35, bottom=37
    expect(dims.imgWidth).toBe(320 + 32 + 32);   // 384
    expect(dims.imgHeight).toBe(200 + 35 + 37);  // 272
    expect(dims.imgXOffset).toBe(32);
    expect(dims.imgYOffset).toBe(35);
  });

  it('handles non-standard screen sizes', () => {
    const fb = makeFramebuf(22, 23); // VIC-20 size
    const dims = computeOutputImageDims(fb, false);
    expect(dims.imgWidth).toBe(22 * 8);
    expect(dims.imgHeight).toBe(23 * 8);
  });
});

describe('framebufToPixelsIndexed (TED blink color masking)', () => {
  it('masks bit 7 for TED foreground, background, and border palette indices', () => {
    const fb = makeFramebuf(1, 1);
    fb.charset = 'c16Upper';
    fb.backgroundColor = 0x83;
    fb.borderColor = 0x85;
    const font = makeEmptyFont();
    // Glyph 0: one lit pixel then background pixels.
    font.bits[0] = 0x80;
    fb.font = font;
    fb.framebuf = [[{ code: 0, color: 0x87 } as any]];

    const noBorder = framebufToPixelsIndexed(fb, false);
    expect(noBorder[0]).toBe(0x07);
    expect(noBorder[1]).toBe(0x03);

    const withBorder = framebufToPixelsIndexed(fb, true);
    expect(withBorder[0]).toBe(0x05);
  });
});

describe('scalePixelsXY', () => {
  it('supports non-uniform horizontal upscaling', () => {
    const src = Buffer.from([10, 20, 30, 255]);
    const scaled = scalePixelsXY(src, 1, 1, 2, 1);
    expect(scaled.width).toBe(2);
    expect(scaled.height).toBe(1);
    expect(scaled.pixBuf).toEqual(Buffer.from([
      10, 20, 30, 255,
      10, 20, 30, 255,
    ]));
  });

  it('supports non-uniform horizontal downscaling', () => {
    const src = Buffer.from([
      10, 20, 30, 255,
      40, 50, 60, 255,
    ]);
    const scaled = scalePixelsXY(src, 2, 1, 0.5, 1);
    expect(scaled.width).toBe(1);
    expect(scaled.height).toBe(1);
    expect(scaled.pixBuf).toEqual(Buffer.from([10, 20, 30, 255]));
  });
});

describe('framebufToPixelsIndexed (VDC attrs)', () => {
  it('applies VDC reverse attribute by inverting glyph bitmap', () => {
    const fontBits = makeVdcFontBits();
    // glyph 1: first pixel set on top row
    fontBits[1 * 8 + 0] = 0x80;
    const normal = makeVdcFramebuf({ code: 1, color: 2, attr: 0x02 }, fontBits);
    const reversed = makeVdcFramebuf(
      { code: 1, color: 2, attr: (0x02 | VDC_ATTR_REVERSE) & 0xff },
      fontBits
    );

    const normalPx = framebufToPixelsIndexed(normal, false);
    const reversePx = framebufToPixelsIndexed(reversed, false);

    expect(normalPx[0]).toBe(2);   // top-left on
    expect(normalPx[1]).toBe(0);   // next pixel off
    expect(reversePx[0]).toBe(0);  // inverted: top-left off
    expect(reversePx[1]).toBe(2);  // inverted: next pixel on
  });

  it('applies VDC underline by forcing bottom scanline on', () => {
    const fontBits = makeVdcFontBits();
    // glyph 1 all zeros, underline should still paint bottom row.
    const underlined = makeVdcFramebuf(
      { code: 1, color: 3, attr: (0x03 | VDC_ATTR_UNDERLINE) & 0xff },
      fontBits
    );
    const px = framebufToPixelsIndexed(underlined, false);

    for (let x = 0; x < 8; x++) {
      expect(px[7 * 8 + x]).toBe(3);
    }
  });

  it('uses VDC alternate charset bank when ALTCHAR attribute is set', () => {
    const fontBits = makeVdcFontBits();
    // Base glyph 1 = empty, alternate glyph 257 = top-left pixel on.
    fontBits[257 * 8 + 0] = 0x80;

    const noAlt = makeVdcFramebuf({ code: 1, color: 4, attr: 0x04 }, fontBits);
    const alt = makeVdcFramebuf(
      { code: 1, color: 4, attr: (0x04 | VDC_ATTR_ALTCHAR) & 0xff },
      fontBits
    );

    const noAltPx = framebufToPixelsIndexed(noAlt, false);
    const altPx = framebufToPixelsIndexed(alt, false);

    expect(noAltPx[0]).toBe(0);
    expect(altPx[0]).toBe(4);
  });
});

describe('screencodeToExportByte', () => {
  it('maps legacy transparency screencode to PETSCII space', () => {
    expect(screencodeToExportByte({ code: TRANSPARENT_SCREENCODE })).toBe(0x20);
  });

  it('maps VDC transparency screencode to PETSCII space', () => {
    expect(screencodeToExportByte({ code: VDC_TRANSPARENT_SCREENCODE })).toBe(0x20);
  });

  it('maps explicit transparent flag to PETSCII space', () => {
    expect(screencodeToExportByte({ code: 65, transparent: true })).toBe(0x20);
  });

  it('keeps normal screencodes as byte values', () => {
    expect(screencodeToExportByte({ code: 65 })).toBe(65);
    expect(screencodeToExportByte({ code: 0x1ab })).toBe(0xab);
  });
});


function makeVdcFontBits(): number[] {
  return new Array(512 * 8).fill(0);
}

function makeVdcFramebuf(
  pixel: { code: number; color: number; attr: number },
  fontBits: number[]
): FramebufWithFont {
  return {
    framebuf: [[pixel]],
    width: 1,
    height: 1,
    backgroundColor: 0,
    borderColor: 0,
    borderOn: false,
    charset: 'c128vdc',
    name: 'vdc-test',
    zoom: { zoomLevel: 1, alignment: 'left' },
    zoomReady: true,
    font: {
      bits: fontBits,
      charOrder: Array.from({ length: 512 }, (_, i) => i),
    },
  };
}
describe('scalePixels', () => {
  it('returns a buffer of the correct scaled size', () => {
    const width = 2;
    const height = 2;
    const pixelBytes = 4; // RGBA
    const src = Buffer.alloc(width * height * pixelBytes, 0);
    const scaleFactor = 3;
    const result = scalePixels(src, width, height, scaleFactor);
    expect(result.length).toBe(width * scaleFactor * height * scaleFactor * pixelBytes);
  });

  it('scale=1 preserves the original pixel data', () => {
    const width = 2;
    const height = 1;
    const src = Buffer.from([
      10, 20, 30, 255,  // pixel (0,0): B=10, G=20, R=30, A=255
      40, 50, 60, 255,  // pixel (1,0)
    ]);
    const result = scalePixels(src, width, height, 1);
    expect(result).toEqual(src);
  });

  it('scale=2 duplicates each pixel into a 2x2 block', () => {
    const width = 1;
    const height = 1;
    const src = Buffer.from([10, 20, 30, 255]);
    const result = scalePixels(src, width, height, 2);
    // Result should be 2x2 = 4 pixels, all the same
    expect(result.length).toBe(16);
    for (let i = 0; i < 4; i++) {
      expect(result[i * 4 + 0]).toBe(10);
      expect(result[i * 4 + 1]).toBe(20);
      expect(result[i * 4 + 2]).toBe(30);
      expect(result[i * 4 + 3]).toBe(255);
    }
  });
});
