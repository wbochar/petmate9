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
        getAppPath: () => process.cwd(),
      },
    },
  },
  fs: require('fs'),
  path: require('path'),
}));

import {
  parseSysEntryAddressFromPrg,
  savePlayer,
  shouldResetUltimateBeforeKeyboardLaunch,
  shouldUseUltimateKeyboardLaunch,
} from './player';
import fs from 'fs';
import path from 'path';

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

describe('savePlayer animation exporter', () => {
  const runAnimationFixtureExport = (fixtureFile: string, computer: string, vic20RAM: string = 'unexpanded') => {
    const petmatePath = path.resolve(process.cwd(), '_tests', fixtureFile);
    const outDir = path.resolve(process.cwd(), '_tests', 'exports');
    const fixtureBase = path.basename(fixtureFile, '.petmate');
    const outPrg = path.join(outDir, `${fixtureBase}-${computer}-animation-regression-test.prg`);

    const src = JSON.parse(fs.readFileSync(petmatePath, 'utf8'));
    const fbs = src.framebufs;

    fs.mkdirSync(outDir, { recursive: true });
    if (fs.existsSync(outPrg)) fs.unlinkSync(outPrg);

    const alertMock = jest.fn();
    (global as any).alert = alertMock;

    const fmt: any = {
      name: 'prgPlayer',
      ext: 'prg',
      description: 'Petmate Player v1 (.prg)',
      commonExportParams: {
        selectedFramebufIndex: 0,
      },
      exportOptions: {
        currentScreenOnly: true,
        music: false,
        songFile: '',
        songNumber: 1,
        playerDebug: false,
        playerType: 'Animation',
        playerAnimationDirection: 'Forward',
        playerAnimationLoop: true,
        playerSpeed: 1,
        playerFPS: 10,
        playerScrollMode: 'wrap',
        playerScrollType: 'Linear',
        animStartFrame: 0,
        animEndFrame: Math.max(0, fbs.length - 1),
        computer,
        vic20RAM,
        sendToUltimate: false,
      },
    };

    savePlayer(outPrg, fbs, fmt);

    expect(alertMock).not.toHaveBeenCalled();
    expect(fs.existsSync(outPrg)).toBe(true);
    expect(fs.readFileSync(outPrg).length).toBeGreaterThan(2);
  };

  it('exports vic20-5frame animation without program counter rewind error', () => {
    runAnimationFixtureExport('vic20-5frame.petmate', 'vic20', 'unexpanded');
  });

  it('exports c16-5frame animation without assembler errors', () => {
    runAnimationFixtureExport('c16-5frame.petmate', 'c16');
  });

  it('exports pet-5frame animation without assembler errors', () => {
    runAnimationFixtureExport('pet-5frame.petmate', 'pet4032');
  });

  it('exports pet80-5frame animation without assembler errors', () => {
    runAnimationFixtureExport('pet80-5frame.petmate', 'pet8032');
  });

  it('exports vdc-5frame animation without assembler errors', () => {
    runAnimationFixtureExport('vdc-5frame.petmate', 'c128vdc');
  });
});
