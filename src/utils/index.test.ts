// Mock electronImports before anything else loads.
// utils/index.ts calls loadAppFile/loadFontFilePlus at module scope, which
// use electron's fs and path. We provide stubs that return empty buffers.
jest.mock('./electronImports', () => ({
  electron: {
    remote: {
      app: { getAppPath: () => '/mock', getPath: () => '/tmp', getVersion: () => '0.0.0', addRecentDocument: jest.fn() },
      getCurrentWindow: jest.fn(),
      dialog: {},
    },
    ipcRenderer: { send: jest.fn() },
    clipboard: { writeBuffer: jest.fn(), readBuffer: jest.fn(), readText: jest.fn(), has: jest.fn(), availableFormats: jest.fn() },
  },
  fs: {
    readFileSync: () => Buffer.alloc(2048), // return an empty buffer for font/template loads
    writeFileSync: jest.fn(),
    existsSync: () => false,
  },
  path: {
    resolve: (...args: string[]) => args.join('/'),
    extname: (f: string) => f.slice(f.lastIndexOf('.')),
    join: (...args: string[]) => args.join('/'),
  },
  buffer: {},
  app: { getAppPath: () => '/mock', getPath: () => '/tmp' },
}));

// Mock the importer/exporter modules to cut off the deep transitive chain
// (importers → redux/workspace → redux/screens → redux/toolbar → brush.ts)
// which requires Electron. We're only testing pure utility functions here.
jest.mock('./importers', () => ({
  loadMarqCFramebuf: jest.fn(),
  loadD64Framebuf: jest.fn(),
  loadSeq: jest.fn(),
  loadCbase: jest.fn(),
}));
jest.mock('./exporters', () => ({
  savePNG: jest.fn(), saveMarqC: jest.fn(), saveExecutablePRG: jest.fn(),
  saveExecutablePlayer: jest.fn(), saveAsm: jest.fn(), saveBASIC: jest.fn(),
  saveGIF: jest.fn(), saveJSON: jest.fn(), saveSEQ: jest.fn(), savePET: jest.fn(),
  saveD64: jest.fn(), saveCbase: jest.fn(), getJSON: jest.fn(), getPNG: jest.fn(),
  savePlayer: jest.fn(), saveUltimatePRG: jest.fn(),
}));

// Also mock redux modules that utils/index.ts imports at top level
jest.mock('../redux/root', () => ({ actions: {} }));
jest.mock('../redux/selectors', () => ({
  anyUnsavedChanges: jest.fn(),
  anyUnsavedChangesInFramebuf: jest.fn(),
}));
jest.mock('../redux/customFonts', () => ({}));

import {
  sortRegion,
  chunkArray,
  rgbToCssRgb,
  colorIndexToCssRgb,
  luminance,
  charScreencodeFromRowCol,
  rowColFromScreencode,
} from './index';
import { Font } from '../redux/types';

describe('sortRegion', () => {
  it('returns min/max normalized when already ordered', () => {
    const result = sortRegion({
      min: { row: 1, col: 2 },
      max: { row: 5, col: 8 },
    });
    expect(result.min).toEqual({ row: 1, col: 2 });
    expect(result.max).toEqual({ row: 5, col: 8 });
  });

  it('swaps min/max when they are inverted', () => {
    const result = sortRegion({
      min: { row: 10, col: 20 },
      max: { row: 2, col: 5 },
    });
    expect(result.min).toEqual({ row: 2, col: 5 });
    expect(result.max).toEqual({ row: 10, col: 20 });
  });

  it('handles partially inverted regions', () => {
    const result = sortRegion({
      min: { row: 1, col: 20 },
      max: { row: 5, col: 3 },
    });
    expect(result.min).toEqual({ row: 1, col: 3 });
    expect(result.max).toEqual({ row: 5, col: 20 });
  });
});

describe('chunkArray', () => {
  it('splits an array into chunks of the given size', () => {
    expect(chunkArray([1, 2, 3, 4, 5, 6], 2)).toEqual([[1, 2], [3, 4], [5, 6]]);
  });

  it('handles a last chunk smaller than chunk_size', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 3)).toEqual([[1, 2, 3], [4, 5]]);
  });

  it('returns empty array for empty input', () => {
    expect(chunkArray([], 5)).toEqual([]);
  });

  it('returns single-element chunks when chunk_size is 1', () => {
    expect(chunkArray([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });
});

describe('rgbToCssRgb', () => {
  it('formats an Rgb object to a CSS rgb() string', () => {
    expect(rgbToCssRgb({ r: 255, g: 128, b: 0 })).toBe('rgb(255, 128, 0)');
  });

  it('handles black', () => {
    expect(rgbToCssRgb({ r: 0, g: 0, b: 0 })).toBe('rgb(0, 0, 0)');
  });
});

describe('colorIndexToCssRgb', () => {
  const palette = [
    { r: 0, g: 0, b: 0 },       // 0 = black
    { r: 255, g: 255, b: 255 },  // 1 = white
  ];

  it('looks up the palette index and returns a CSS string', () => {
    expect(colorIndexToCssRgb(palette, 0)).toBe('rgb(0, 0, 0)');
    expect(colorIndexToCssRgb(palette, 1)).toBe('rgb(255, 255, 255)');
  });
});

describe('luminance', () => {
  it('returns 0 for black', () => {
    expect(luminance({ r: 0, g: 0, b: 0 })).toBe(0);
  });

  it('returns 1 for white', () => {
    expect(luminance({ r: 255, g: 255, b: 255 })).toBe(1);
  });

  it('weights green more heavily than red and blue', () => {
    const greenLum = luminance({ r: 0, g: 255, b: 0 });
    const redLum = luminance({ r: 255, g: 0, b: 0 });
    const blueLum = luminance({ r: 0, g: 0, b: 255 });
    expect(greenLum).toBeGreaterThan(redLum);
    expect(redLum).toBeGreaterThan(blueLum);
  });
});

describe('charScreencodeFromRowCol', () => {
  // Build a simple font with sequential charOrder
  const font: Font = {
    bits: [],
    charOrder: Array.from({ length: 272 }, (_, i) => i),
  };

  it('returns the screencode for a valid row/col', () => {
    // idx = row*16 + col → charOrder[idx]
    expect(charScreencodeFromRowCol(font, { row: 0, col: 0 })).toBe(0);
    expect(charScreencodeFromRowCol(font, { row: 1, col: 0 })).toBe(16);
    expect(charScreencodeFromRowCol(font, { row: 0, col: 5 })).toBe(5);
  });

  it('returns null for out-of-bounds coordinates', () => {
    expect(charScreencodeFromRowCol(font, { row: -1, col: 0 })).toBeNull();
    expect(charScreencodeFromRowCol(font, { row: 17, col: 0 })).toBeNull();
    expect(charScreencodeFromRowCol(font, { row: 0, col: 16 })).toBeNull();
    expect(charScreencodeFromRowCol(font, { row: 0, col: -1 })).toBeNull();
  });

  it('returns 0xa0 if font is null', () => {
    expect(charScreencodeFromRowCol(null as any, { row: 0, col: 0 })).toBe(0xa0);
  });
});

describe('rowColFromScreencode', () => {
  const font: Font = {
    bits: [],
    charOrder: Array.from({ length: 272 }, (_, i) => i),
  };

  it('returns the row/col for a known screencode', () => {
    expect(rowColFromScreencode(font, 0)).toEqual({ row: 0, col: 0 });
    expect(rowColFromScreencode(font, 16)).toEqual({ row: 1, col: 0 });
    expect(rowColFromScreencode(font, 33)).toEqual({ row: 2, col: 1 });
  });

  it('throws for an unknown screencode', () => {
    const smallFont: Font = { bits: [], charOrder: [0, 1, 2] };
    expect(() => rowColFromScreencode(smallFont, 999)).toThrow();
  });
});
