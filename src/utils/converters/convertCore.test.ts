// Regression tests for C3 (Group C master task list): img2petsciiMatchRows
// previously rebuilt its (multi-MB, palette.length x numChars x 192-float)
// tile table from scratch inside the per-cell loop every time a grayscale
// tile was encountered -- because the gray-restricted "allowed colors" set
// was recomputed as a brand-new Set object per cell, and the code compared
// it by reference against the precomputed table's color set, which is
// always a different object even when the underlying values never change.
// For an image with many/most tiles detected as grayscale, this meant
// rebuilding a several-megabyte table once per cell instead of once per job.

import { img2petsciiMatchRows, Img2PetsciiCellParams, FontData, Rgb } from './convertCore';

function makeAllGrayRgba(pxW: number, pxH: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(pxW * pxH * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 100; rgba[i + 1] = 100; rgba[i + 2] = 100; rgba[i + 3] = 255;
  }
  return rgba;
}

describe('img2petsciiMatchRows gray-tile handling (C3)', () => {
  it('produces one pixel per cell with valid codes/colors for an all-gray image', () => {
    const numChars = 4;
    const font: FontData = { bits: new Array(numChars * 8).fill(0xff), charOrderLength: numChars };
    const palette: Rgb[] = [
      { r: 0, g: 0, b: 0 },
      { r: 128, g: 128, b: 128 },
      { r: 64, g: 64, b: 64 },
    ];
    const framebufWidth = 5, framebufHeight = 3;
    const pxW = framebufWidth * 8, pxH = framebufHeight * 8;
    const rgba = makeAllGrayRgba(pxW, pxH);

    const params: Img2PetsciiCellParams = {
      rgba, pxW, framebufWidth, framebufHeight,
      numFg: palette.length, bgIdx: 0, font, palette,
      grayIndices: new Set([0, 1, 2]),
      allowedColors: undefined,
      settings: { matcherMode: 'fast', monoMode: false, monoThreshold: 128 },
      rowStart: 0, rowEnd: framebufHeight,
    };

    const rows = img2petsciiMatchRows(params);
    expect(rows).toHaveLength(framebufHeight);
    for (const row of rows) {
      expect(row).toHaveLength(framebufWidth);
      for (const pix of row) {
        expect(pix.code).toBeGreaterThanOrEqual(0);
        expect(pix.code).toBeLessThan(numChars);
        expect(pix.color).toBeGreaterThanOrEqual(0);
        expect(pix.color).toBeLessThan(palette.length);
      }
    }
  });

  it('respects a color mask when gray tiles restrict the allowed set', () => {
    const numChars = 2;
    const font: FontData = { bits: new Array(numChars * 8).fill(0xff), charOrderLength: numChars };
    const palette: Rgb[] = [
      { r: 0, g: 0, b: 0 },     // bg
      { r: 128, g: 128, b: 128 }, // gray, allowed
      { r: 200, g: 200, b: 200 }, // gray, disallowed
      { r: 255, g: 0, b: 0 },   // not gray
    ];
    const framebufWidth = 2, framebufHeight = 2;
    const pxW = framebufWidth * 8, pxH = framebufHeight * 8;
    const rgba = makeAllGrayRgba(pxW, pxH);

    const params: Img2PetsciiCellParams = {
      rgba, pxW, framebufWidth, framebufHeight,
      numFg: palette.length, bgIdx: 0, font, palette,
      grayIndices: new Set([0, 1, 2]),
      // Only color 1 is allowed among the gray indices (0 is bg, 2 disallowed).
      allowedColors: new Set([1, 3]),
      settings: { matcherMode: 'fast', monoMode: false, monoThreshold: 128 },
      rowStart: 0, rowEnd: framebufHeight,
    };

    const rows = img2petsciiMatchRows(params);
    for (const row of rows) {
      for (const pix of row) {
        expect(pix.color).toBe(1);
      }
    }
  });

  // Performance characterization: a large grid where every tile is detected
  // as grayscale previously rebuilt the multi-MB tile table once per cell.
  // With the fix, the table is built at most twice for the whole job
  // (normal + gray-restricted), so this should complete quickly even for a
  // realistically large framebuf/font/palette. A generous time budget keeps
  // this test robust against normal machine/CI variance while still failing
  // clearly against the pre-fix O(cells) rebuild behavior.
  it('converts a large all-gray grid with a full-size font/palette quickly', () => {
    const numChars = 256;
    const font: FontData = { bits: new Array(numChars * 8).fill(0xaa), charOrderLength: numChars };
    const palette: Rgb[] = Array.from({ length: 16 }, (_, i) => ({ r: i * 16, g: i * 16, b: i * 16 }));
    // A large grid (4000 cells) so the pre-fix O(cells) tile-table-rebuild
    // cost (one ~3MB table rebuild per gray cell) is clearly separated from
    // the fixed O(1) cost of building the table at most twice. On this
    // fix, the dominant per-cell cost is the actual tile matching, which
    // scales the same either way -- so the budget below comfortably covers
    // normal CI/machine variance for the fixed version while reliably
    // failing against the pre-fix per-cell rebuild (which scales with cell
    // count and was measured at ~1.8s for this grid size before the fix).
    const framebufWidth = 80, framebufHeight = 50; // 4000 cells
    const pxW = framebufWidth * 8, pxH = framebufHeight * 8;
    const rgba = makeAllGrayRgba(pxW, pxH);

    const params: Img2PetsciiCellParams = {
      rgba, pxW, framebufWidth, framebufHeight,
      numFg: palette.length, bgIdx: 0, font, palette,
      grayIndices: new Set(palette.map((_, i) => i)),
      allowedColors: undefined,
      settings: { matcherMode: 'fast', monoMode: false, monoThreshold: 128 },
      rowStart: 0, rowEnd: framebufHeight,
    };

    const start = Date.now();
    const rows = img2petsciiMatchRows(params);
    const elapsedMs = Date.now() - start;

    expect(rows).toHaveLength(framebufHeight);
    expect(elapsedMs).toBeLessThan(800);
  });
});
