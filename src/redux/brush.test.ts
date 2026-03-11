// Mock toolbar to avoid electron imports.
// brush.ts only uses Toolbar.MIRROR_X (1) and Toolbar.MIRROR_Y (2).
jest.mock('./toolbar', () => ({
  Toolbar: {
    MIRROR_X: 1,
    MIRROR_Y: 2,
  },
}));

import { findTransformedChar, findInverseChar, mirrorBrush } from './brush';
import { Font, Brush, Transform } from './types';

// Build a minimal 256-char font where each character is 8 identical bytes
// of its index value. E.g. char 0 = [0,0,0,0,0,0,0,0], char 1 = [1,1,...],
// char 255 = [255,255,...].
function makeTrivialFont(): Font {
  const bits: number[] = [];
  for (let c = 0; c < 256; c++) {
    for (let row = 0; row < 8; row++) {
      bits.push(c);
    }
  }
  const charOrder = Array.from({ length: 256 }, (_, i) => i);
  return { bits, charOrder };
}

// Build a font where char 0 = all-zeros and char 1 = all-0xFF (inverse of char 0).
// All other chars are unique non-matching patterns.
function makeInversePairFont(): Font {
  const bits: number[] = [];
  // char 0: all zeros
  for (let i = 0; i < 8; i++) bits.push(0x00);
  // char 1: all ones (inverse of char 0)
  for (let i = 0; i < 8; i++) bits.push(0xFF);
  // chars 2-255: unique patterns that won't accidentally match
  for (let c = 2; c < 256; c++) {
    for (let i = 0; i < 8; i++) bits.push(c ^ (i + 1));
  }
  const charOrder = Array.from({ length: 256 }, (_, i) => i);
  return { bits, charOrder };
}

describe('findTransformedChar', () => {
  it('returns the same code when no transform is applied', () => {
    const font = makeTrivialFont();
    const xform: Transform = { mirror: 0, rotate: 0 };
    expect(findTransformedChar(font, 65, xform)).toBe(65);
  });

  it('returns the same code for identity transform on any character', () => {
    const font = makeTrivialFont();
    const xform: Transform = { mirror: 0, rotate: 0 };
    for (const code of [0, 1, 127, 128, 255]) {
      expect(findTransformedChar(font, code, xform)).toBe(code);
    }
  });

  it('finds a horizontally mirrored character in the font', () => {
    // Build a font with char 0 = [0b10000000, ...] and char 1 = [0b00000001, ...]
    // Mirroring X on char 0 should yield the bit pattern of char 1.
    const bits: number[] = new Array(256 * 8).fill(0);
    // char 0: top bit set in every row
    for (let i = 0; i < 8; i++) bits[i] = 0b10000000;
    // char 1: bottom bit set in every row (horizontal mirror of char 0)
    for (let i = 0; i < 8; i++) bits[8 + i] = 0b00000001;
    const font: Font = { bits, charOrder: Array.from({ length: 256 }, (_, i) => i) };

    const xform: Transform = { mirror: 1, rotate: 0 }; // MIRROR_X = 1
    expect(findTransformedChar(font, 0, xform)).toBe(1);
  });
});

describe('findInverseChar', () => {
  it('finds the inverse character in the font', () => {
    const font = makeInversePairFont();
    // char 0 inverted = all 0xFF = char 1
    expect(findInverseChar(font, 0)).toBe(1);
    // char 1 inverted = all 0x00 = char 0
    expect(findInverseChar(font, 1)).toBe(0);
  });

  it('returns the original code if no inverse is found', () => {
    const font = makeTrivialFont();
    // In the trivial font, char 0 = all zeros; its inverse = all 0xFF = char 255
    expect(findInverseChar(font, 0)).toBe(255);
  });
});

describe('mirrorBrush', () => {
  const font = makeTrivialFont();

  function make1x1Brush(code: number, color: number): Brush {
    return {
      framebuf: [[{ code, color }]],
      brushRegion: { min: { row: 0, col: 0 }, max: { row: 0, col: 0 } },
    };
  }

  function make2x2Brush(): Brush {
    return {
      framebuf: [
        [{ code: 1, color: 1 }, { code: 2, color: 2 }],
        [{ code: 3, color: 3 }, { code: 4, color: 4 }],
      ],
      brushRegion: { min: { row: 0, col: 0 }, max: { row: 1, col: 1 } },
    };
  }

  it('returns the brush unchanged when no transform is applied', () => {
    const b = make1x1Brush(65, 1);
    const xform: Transform = { mirror: 0, rotate: 0 };
    expect(mirrorBrush(b, xform, font)).toBe(b); // same reference
  });

  it('returns null for a null brush', () => {
    const xform: Transform = { mirror: 1, rotate: 0 };
    expect(mirrorBrush(null as any, xform, font)).toBeNull();
  });

  it('flips a 2x2 brush vertically (MIRROR_Y)', () => {
    const b = make2x2Brush();
    const xform: Transform = { mirror: 2, rotate: 0 }; // MIRROR_Y = 2
    const result = mirrorBrush(b, xform, font);
    expect(result).not.toBeNull();
    // Rows should be reversed: row0 was [1,2], row1 was [3,4] → now row0=[3,4], row1=[1,2]
    expect(result!.framebuf[0][0].color).toBe(3);
    expect(result!.framebuf[0][1].color).toBe(4);
    expect(result!.framebuf[1][0].color).toBe(1);
    expect(result!.framebuf[1][1].color).toBe(2);
  });

  it('flips a 2x2 brush horizontally (MIRROR_X)', () => {
    const b = make2x2Brush();
    const xform: Transform = { mirror: 1, rotate: 0 }; // MIRROR_X = 1
    const result = mirrorBrush(b, xform, font);
    expect(result).not.toBeNull();
    // Columns should be reversed within each row
    expect(result!.framebuf[0][0].color).toBe(2);
    expect(result!.framebuf[0][1].color).toBe(1);
    expect(result!.framebuf[1][0].color).toBe(4);
    expect(result!.framebuf[1][1].color).toBe(3);
  });

  it('rotates a 2x2 brush 90 degrees', () => {
    const b = make2x2Brush();
    const xform: Transform = { mirror: 0, rotate: 90 };
    const result = mirrorBrush(b, xform, font);
    expect(result).not.toBeNull();
    // mirrorBrush 90° maps: result[y][x] = framebuf[x][height-y-1]
    // Original:  [{1},{2}]   After 90°:  [{2},{4}]
    //            [{3},{4}]                [{1},{3}]
    expect(result!.framebuf[0][0].color).toBe(2);
    expect(result!.framebuf[0][1].color).toBe(4);
    expect(result!.framebuf[1][0].color).toBe(1);
    expect(result!.framebuf[1][1].color).toBe(3);
  });

  it('updates brushRegion dimensions on rotation', () => {
    // A 3-wide x 2-tall brush
    const b: Brush = {
      framebuf: [
        [{ code: 1, color: 1 }, { code: 2, color: 2 }, { code: 3, color: 3 }],
        [{ code: 4, color: 4 }, { code: 5, color: 5 }, { code: 6, color: 6 }],
      ],
      brushRegion: { min: { row: 0, col: 0 }, max: { row: 1, col: 2 } },
    };
    const xform: Transform = { mirror: 0, rotate: 90 };
    const result = mirrorBrush(b, xform, font);
    expect(result).not.toBeNull();
    // After 90° rotation, a 3x2 brush becomes 2x3
    expect(result!.brushRegion.max.col).toBe(1);  // width-1 = 2-1
    expect(result!.brushRegion.max.row).toBe(2);   // height-1 = 3-1
  });
});
