jest.mock('../../utils', () => ({
  chunkArray: (items: any[], size: number) => {
    const out: any[][] = [];
    for (let i = 0; i < items.length; i += size) {
      out.push(items.slice(i, i + size));
    }
    return out;
  },
}));

jest.mock('../electronImports', () => ({
  fs: require('fs'),
}));

jest.mock('../../redux/workspace', () => ({
  framebufFromJson: (c: any) => c,
}));

import fs from 'fs';
import os from 'os';
import path from 'path';

import { saveMarqC } from './marqc';
import { loadMarqCFramebuf } from '../importers/marqc';
import { Framebuf } from '../../redux/types';

function tempCPath(prefix: string) {
  return path.join(
    os.tmpdir(),
    `petmate9-${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.c`
  );
}

function makeFramebuf(width: number, height: number, fill: number, color: number, overrides: Partial<Framebuf> = {}): Framebuf {
  return {
    width,
    height,
    backgroundColor: 6,
    borderColor: 14,
    borderOn: false,
    charset: 'upper',
    name: 'test',
    framebuf: Array.from({ length: height }, () =>
      Array.from({ length: width }, () => ({ code: fill, color }))
    ),
    zoom: { zoomLevel: 2, alignment: 'left' },
    zoomReady: false,
    ...overrides,
  };
}

describe('saveMarqC', () => {
  it('writes a single trailing META line describing the whole multi-frame file', () => {
    const filename = tempCPath('marqc-export');
    const fbs = [
      makeFramebuf(4, 2, 32, 0),
      makeFramebuf(4, 2, 49, 1),
      makeFramebuf(4, 2, 51, 2),
    ];

    saveMarqC(filename, fbs, {} as any);
    const content = fs.readFileSync(filename, 'utf-8');
    fs.unlinkSync(filename);

    const metaLines = content.split('\n').filter(l => l.startsWith('// META:'));
    expect(metaLines).toHaveLength(1);
    expect(metaLines[0]).toBe('// META: 4 2 C64 upper');

    // Frame arrays are still present for every framebuf, in order.
    expect(content).toContain('unsigned char frame0000[]');
    expect(content).toContain('unsigned char frame0001[]');
    expect(content).toContain('unsigned char frame0002[]');

    // The single META line must be the very last non-empty line.
    const lines = content.split('\n').filter(l => l.length > 0);
    expect(lines[lines.length - 1]).toBe('// META: 4 2 C64 upper');
  });

  it('round-trips through loadMarqCFramebuf: all frames survive export + re-import', () => {
    const filename = tempCPath('marqc-roundtrip');
    const fbs = [
      makeFramebuf(4, 2, 32, 0),
      makeFramebuf(4, 2, 49, 1),
      makeFramebuf(4, 2, 51, 2),
    ];

    saveMarqC(filename, fbs, {} as any);

    const importFile = jest.fn();
    loadMarqCFramebuf(filename, importFile);
    fs.unlinkSync(filename);

    expect(importFile).toHaveBeenCalledTimes(1);
    const imported = importFile.mock.calls[0][0];
    expect(imported).toHaveLength(3);
    expect(imported[0].framebuf[0][0].code).toBe(32);
    expect(imported[1].framebuf[0][0].code).toBe(49);
    expect(imported[2].framebuf[0][0].code).toBe(51);
  });
});
