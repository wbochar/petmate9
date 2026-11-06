// Mock electron imports used transitively by selectors.ts (via '../utils').
// Mirrors the mock shape used by settings.test.ts/toolbar.test.ts.
jest.mock('../utils/electronImports', () => ({
  electron: {
    remote: {
      app: {
        getPath: () => '/tmp',
        getAppPath: () => '/mock',
        getVersion: () => '0.0.0',
        addRecentDocument: jest.fn(),
      },
      getCurrentWindow: jest.fn(),
      process: { platform: 'darwin' },
      dialog: {},
    },
    ipcRenderer: { send: jest.fn() },
    clipboard: {
      writeBuffer: jest.fn(),
      readBuffer: jest.fn(),
      readText: jest.fn(),
      has: jest.fn(),
      availableFormats: jest.fn(),
    },
  },
  fs: {
    readFileSync: () => Buffer.alloc(2048),
    writeFileSync: jest.fn(),
    existsSync: () => false,
  },
  path: {
    resolve: (...a: string[]) => a.join('/'),
    join: (...a: string[]) => a.join('/'),
    extname: (_f: string) => '',
  },
  buffer: {},
  app: {},
}));

// Mock './brush' so we can count calls through the memoized wrappers and
// break the toolbar <-> brush circular dependency, as in toolbar.test.ts.
// NOTE: this project's jest config sets `resetMocks: true` (react-scripts
// default), which strips any implementation passed to `jest.fn(impl)`
// inside the factory below before every single test runs. Implementations
// must instead be (re-)installed in `beforeEach` so they survive the reset.
jest.mock('./brush', () => ({
  findTransformedChar: jest.fn(),
  findInverseChar: jest.fn(),
  mirrorBrush: jest.fn(),
}));

import { getScreencodeWithTransform, getCharRowColWithTransform, transformBrush } from './selectors';
import { findTransformedChar as mockFindTransformedChar, mirrorBrush as mockMirrorBrushImport } from './brush';
import { Font, Transform, Brush } from './types';

const mockFindTransformedCharFn = mockFindTransformedChar as jest.Mock;
const mockMirrorBrush = mockMirrorBrushImport as jest.Mock;

beforeEach(() => {
  mockFindTransformedCharFn.mockImplementation((_font: any, code: number, _transform: any) => code);
  mockMirrorBrush.mockImplementation((brush: any, _transform: any, _font: any) => ({ ...brush, mirrored: true }));
});

function makeFont(): Font {
  // 2 rows x 16 cols of distinct screencodes, enough for row/col round-trips.
  return { bits: new Uint8Array(0) as any, charOrder: Array.from({ length: 32 }, (_, i) => i) };
}

const emptyTransform: Transform = { mirror: null, rotate: 0 } as any;

describe('getScreencodeWithTransform (memoizeLastCall)', () => {
  it('returns a cached result and does not recompute when all args are the same references', () => {
    const font = makeFont();
    const rowcol = { row: 0, col: 1 };
    const first = getScreencodeWithTransform(rowcol, font, emptyTransform);
    const second = getScreencodeWithTransform(rowcol, font, emptyTransform);
    expect(second).toBe(first);
    expect(mockFindTransformedCharFn).toHaveBeenCalledTimes(1);
  });

  it('recomputes when the font reference changes, even with identical content', () => {
    const rowcol = { row: 0, col: 1 };
    getScreencodeWithTransform(rowcol, makeFont(), emptyTransform);
    getScreencodeWithTransform(rowcol, makeFont(), emptyTransform);
    expect(mockFindTransformedCharFn).toHaveBeenCalledTimes(2);
  });

  it('recomputes when the rowcol reference changes', () => {
    const font = makeFont();
    getScreencodeWithTransform({ row: 0, col: 1 }, font, emptyTransform);
    getScreencodeWithTransform({ row: 0, col: 1 }, font, emptyTransform);
    expect(mockFindTransformedCharFn).toHaveBeenCalledTimes(2);
  });
});

describe('getCharRowColWithTransform (memoizeLastCall)', () => {
  it('round-trips a screencode back to its row/col and caches on repeat calls', () => {
    const font = makeFont();
    const rowcol = { row: 1, col: 2 };
    const result = getCharRowColWithTransform(rowcol, font, emptyTransform);
    expect(result).toEqual({ row: 1, col: 2 });

    const callsAfterFirst = mockFindTransformedCharFn.mock.calls.length;
    getCharRowColWithTransform(rowcol, font, emptyTransform);
    // Underlying transform computation shouldn't run again for identical args.
    expect(mockFindTransformedCharFn.mock.calls.length).toBe(callsAfterFirst);
  });
});

describe('transformBrush (memoizeLastCall)', () => {
  it('returns null without invoking mirrorBrush when brush is null', () => {
    const font = makeFont();
    const result = transformBrush(null, emptyTransform, font);
    expect(result).toBeNull();
    expect(mockMirrorBrush).not.toHaveBeenCalled();
  });

  it('caches the result when called again with the same brush/transform/font references', () => {
    const brush: Brush = { w: 1, h: 1, pixels: [[{ code: 1, color: 0 }]] } as any;
    const font = makeFont();
    const first = transformBrush(brush, emptyTransform, font);
    const second = transformBrush(brush, emptyTransform, font);
    expect(second).toBe(first);
    expect(mockMirrorBrush).toHaveBeenCalledTimes(1);
  });

  it('recomputes when the brush reference changes', () => {
    const font = makeFont();
    const brushA: Brush = { w: 1, h: 1, pixels: [[{ code: 1, color: 0 }]] } as any;
    const brushB: Brush = { w: 1, h: 1, pixels: [[{ code: 1, color: 0 }]] } as any;
    transformBrush(brushA, emptyTransform, font);
    transformBrush(brushB, emptyTransform, font);
    expect(mockMirrorBrush).toHaveBeenCalledTimes(2);
  });
});
