import { computeOutputImageDims, scalePixels, screencodeToExportByte } from './util';
import { FramebufWithFont, Font, TRANSPARENT_SCREENCODE, VDC_TRANSPARENT_SCREENCODE } from '../../redux/types';

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
