// Regression tests for E6 (Group E master task list): BoxesPanel's
// boxWn/boxHn previously computed `Math.max(2, Number(boxW) || 16)` with no
// upper bound -- a typo'd value like "1e9" is a finite, truthy number so
// the `|| 16` short-circuit never kicked in, and generateBox() would
// attempt to allocate a brush with that many rows/columns.

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

import { clampBoxDimension, BOX_MAX_DIMENSION } from './BoxesPanel';

describe('clampBoxDimension (E6)', () => {
  it('passes through an in-range value unchanged', () => {
    expect(clampBoxDimension('16')).toBe(16);
  });

  it('clamps a value above the maximum down to the maximum', () => {
    expect(clampBoxDimension('1e9')).toBe(BOX_MAX_DIMENSION);
    expect(clampBoxDimension('99999')).toBe(BOX_MAX_DIMENSION);
  });

  it('clamps a value below the minimum up to 2', () => {
    expect(clampBoxDimension('0')).toBe(2);
    expect(clampBoxDimension('1')).toBe(2);
    expect(clampBoxDimension('-5')).toBe(2);
  });

  it('truncates fractional values', () => {
    expect(clampBoxDimension('16.7')).toBe(16);
  });

  it('falls back to the default (16) for non-finite input (NaN, Infinity)', () => {
    expect(clampBoxDimension('abc')).toBe(16);
    expect(clampBoxDimension('Infinity')).toBe(16);
  });

  it('falls back to a custom fallback value when provided', () => {
    expect(clampBoxDimension('abc', 8)).toBe(8);
  });
});
