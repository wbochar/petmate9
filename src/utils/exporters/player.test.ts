jest.mock('..', () => ({
  chunkArray: (items: any[], size: number) => {
    const out: any[][] = [];
    for (let i = 0; i < items.length; i += size) {
      out.push(items.slice(i, i + size));
    }
    return out;
  },
}));
jest.mock('../electronImports', () => ({
  electron: {
    remote: {
      app: {
        isPackaged: true,
        getAppPath: () => '',
      },
    },
  },
  fs: {},
  path: {
    join: (...parts: string[]) => parts.join('/'),
    resolve: (...parts: string[]) => parts.join('/'),
  },
}));

import {
  parseSysEntryAddressFromPrg,
  shouldResetUltimateBeforeKeyboardLaunch,
  shouldUseUltimateKeyboardLaunch,
} from './player';

describe('shouldUseUltimateKeyboardLaunch', () => {
  it('enables keyboard launch for c128 targets', () => {
    expect(shouldUseUltimateKeyboardLaunch('c128')).toBe(true);
    expect(shouldUseUltimateKeyboardLaunch('c128vdc')).toBe(true);
  });

  it('keeps run_prg path for non-c128 targets', () => {
    expect(shouldUseUltimateKeyboardLaunch('c64')).toBe(false);
    expect(shouldUseUltimateKeyboardLaunch('pet8032')).toBe(false);
  });
});

describe('shouldResetUltimateBeforeKeyboardLaunch', () => {
  it('resets before keyboard launch in c128vdc mode', () => {
    expect(shouldResetUltimateBeforeKeyboardLaunch('c128vdc')).toBe(true);
  });

  it('does not reset for other targets', () => {
    expect(shouldResetUltimateBeforeKeyboardLaunch('c128')).toBe(false);
    expect(shouldResetUltimateBeforeKeyboardLaunch('c64')).toBe(false);
  });
});

describe('parseSysEntryAddressFromPrg', () => {
  it('parses a SYS token with decimal address', () => {
    const prg = Buffer.from([0x01, 0x1c, 0x9e, 0x34, 0x38, 0x36, 0x34, 0x00]);
    expect(parseSysEntryAddressFromPrg(prg)).toBe(4864);
  });

  it('parses when spaces appear after SYS token', () => {
    const prg = Buffer.from([0x01, 0x1c, 0x9e, 0x20, 0x20, 0x31, 0x32, 0x38, 0x30, 0x00]);
    expect(parseSysEntryAddressFromPrg(prg)).toBe(1280);
  });

  it('returns null when no SYS token is present', () => {
    const prg = Buffer.from([0x01, 0x1c, 0x20, 0x34, 0x38, 0x36, 0x34, 0x00]);
    expect(parseSysEntryAddressFromPrg(prg)).toBeNull();
  });

  it('returns null for out-of-range SYS values', () => {
    const prg = Buffer.from([0x01, 0x1c, 0x9e, 0x37, 0x30, 0x30, 0x30, 0x30, 0x00]);
    expect(parseSysEntryAddressFromPrg(prg)).toBeNull();
  });
});
