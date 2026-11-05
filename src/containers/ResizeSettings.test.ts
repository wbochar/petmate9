// Regression tests for E5 (Group E master task list): ResizeSettings'
// handleOK previously computed `Math.max(1, Number(width) || fallback)`
// with no upper bound -- a typo'd value like "1e9" is a finite, truthy
// number so the `|| fallback` short-circuit never kicked in, and the
// resize would attempt to allocate a framebuf with that many rows/columns.

jest.mock('../utils/electronImports', () => ({
  electron: {
    remote: {
      app: { getAppPath: () => '/mock' },
      getCurrentWindow: jest.fn(),
      process: { platform: 'darwin' },
      dialog: {},
    },
    ipcRenderer: { send: jest.fn() },
    clipboard: { has: jest.fn(() => false), readBuffer: jest.fn(), writeBuffer: jest.fn() },
  },
  fs: { readFileSync: () => Buffer.alloc(2048), writeFileSync: jest.fn(), existsSync: () => false },
  path: { resolve: (...a: string[]) => a.join('/'), join: (...a: string[]) => a.join('/'), extname: () => '' },
  buffer: {},
  app: {},
}));

jest.mock('../redux/brush', () => ({
  findTransformedChar: jest.fn((font: any, code: number) => code),
  findInverseChar: jest.fn((font: any, code: number) => code),
  mirrorBrush: jest.fn(),
}));

import { clampResizeDimension, RESIZE_MAX_DIMENSION } from './ResizeSettings';

describe('clampResizeDimension (E5)', () => {
  it('passes through an in-range value unchanged', () => {
    expect(clampResizeDimension('40', 999)).toBe(40);
  });

  it('clamps a value above the maximum down to the maximum', () => {
    expect(clampResizeDimension('1e9', 40)).toBe(RESIZE_MAX_DIMENSION);
    expect(clampResizeDimension('99999', 40)).toBe(RESIZE_MAX_DIMENSION);
  });

  it('clamps a value below the minimum up to 1', () => {
    expect(clampResizeDimension('0', 40)).toBe(1);
    expect(clampResizeDimension('-5', 40)).toBe(1);
  });

  it('truncates fractional values', () => {
    expect(clampResizeDimension('40.7', 999)).toBe(40);
  });

  it('falls back for non-finite input (NaN, Infinity)', () => {
    expect(clampResizeDimension('abc', 40)).toBe(40);
    expect(clampResizeDimension('Infinity', 40)).toBe(40);
  });

  it('treats an empty string as 0, clamped up to the minimum of 1 (Number("") is 0, not NaN)', () => {
    expect(clampResizeDimension('', 40)).toBe(1);
  });
});
