jest.mock('../../utils', () => ({
  chunkArray: (items: any[], size: number) => {
    const out: any[][] = [];
    for (let i = 0; i < items.length; i += size) {
      out.push(items.slice(i, i + size));
    }
    return out;
  },
}));

jest.mock('../../redux/workspace', () => ({
  framebufFromJson: (c: any) => c,
}));

jest.mock('../electronImports', () => ({
  fs: require('fs'),
}));

import fs from 'fs';
import os from 'os';
import path from 'path';

import { loadMarqCFramebuf } from './marqc';

function tempCPath(prefix: string) {
  return path.join(
    os.tmpdir(),
    `petmate9-${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.c`
  );
}

function writeAndLoad(content: string) {
  const filename = tempCPath('marqc-test');
  fs.writeFileSync(filename, content);
  const importFile = jest.fn();
  try {
    loadMarqCFramebuf(filename, importFile);
  } finally {
    fs.unlinkSync(filename);
  }
  return importFile;
}

// Build a minimal frame array body: border, bg, then width*height chars,
// then width*height colors (all constant values for simplicity).
function frameBody(width: number, height: number, border: number, bg: number, char: number, color: number) {
  const nb = width * height;
  const chars = Array.from({ length: nb }, () => char);
  const colors = Array.from({ length: nb }, () => color);
  return `${border},${bg},\n${chars.join(',')},\n${colors.join(',')}`;
}

describe('loadMarqCFramebuf', () => {
  it('imports all frames from a file with a single trailing META (Marq format)', () => {
    const w = 4, h = 2;
    const content = [
      `unsigned char frame0000[]={// border,bg,chars,colors`,
      frameBody(w, h, 14, 6, 32, 0),
      `};`,
      `unsigned char frame0001[]={// border,bg,chars,colors`,
      frameBody(w, h, 14, 6, 49, 1),
      `};`,
      `unsigned char frame0002[]={// border,bg,chars,colors`,
      frameBody(w, h, 14, 6, 51, 2),
      `};`,
      `// META: ${w} ${h} C64 upper`,
      ``,
    ].join('\n');

    const importFile = writeAndLoad(content);

    expect(importFile).toHaveBeenCalledTimes(1);
    const framebufs = importFile.mock.calls[0][0];
    expect(framebufs).toHaveLength(3);
    expect(framebufs[0].width).toBe(w);
    expect(framebufs[0].height).toBe(h);
    expect(framebufs[0].charset).toBe('upper');
    expect(framebufs[0].framebuf[0][0].code).toBe(32);
    expect(framebufs[1].framebuf[0][0].code).toBe(49);
    expect(framebufs[1].framebuf[0][0].color).toBe(1);
    expect(framebufs[2].framebuf[0][0].code).toBe(51);
    expect(framebufs[2].framebuf[0][0].color).toBe(2);
  });

  it('imports all frames from a file with a META comment after every frame (legacy Petmate format)', () => {
    const w = 4, h = 2;
    const content = [
      `unsigned char frame0000[]={// border,bg,chars,colors`,
      frameBody(w, h, 14, 6, 32, 0),
      `};`,
      `// META: ${w} ${h} C64 upper`,
      `unsigned char frame0001[]={// border,bg,chars,colors`,
      frameBody(w, h, 14, 6, 49, 1),
      `};`,
      `// META: ${w} ${h} C64 upper`,
      ``,
    ].join('\n');

    const importFile = writeAndLoad(content);

    expect(importFile).toHaveBeenCalledTimes(1);
    const framebufs = importFile.mock.calls[0][0];
    expect(framebufs).toHaveLength(2);
    expect(framebufs[0].framebuf[0][0].code).toBe(32);
    expect(framebufs[1].framebuf[0][0].code).toBe(49);
  });

  it('imports a single-frame file correctly', () => {
    const w = 4, h = 2;
    const content = [
      `unsigned char frame0000[]={// border,bg,chars,colors`,
      frameBody(w, h, 14, 6, 32, 5),
      `};`,
      `// META: ${w} ${h} C64 lower`,
      ``,
    ].join('\n');

    const importFile = writeAndLoad(content);

    expect(importFile).toHaveBeenCalledTimes(1);
    const framebufs = importFile.mock.calls[0][0];
    expect(framebufs).toHaveLength(1);
    expect(framebufs[0].charset).toBe('lower');
    expect(framebufs[0].borderColor).toBe(14);
    expect(framebufs[0].backgroundColor).toBe(6);
  });

  it('reports an error and does not call importFile when no frames are present', () => {
    (global as any).alert = jest.fn();
    const importFile = writeAndLoad('// META: 4 2 C64 upper\n');
    expect(importFile).not.toHaveBeenCalled();
    expect((global as any).alert).toHaveBeenCalled();
  });
});
