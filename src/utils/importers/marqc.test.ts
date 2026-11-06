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

// Regression tests for B11 (Group B master task list): the importer
// previously trusted the META-declared width/height unconditionally
// (including applying them to the frame-slicing logic even when they were
// zero, negative, or far larger than the actual frame data), and never
// clamped out-of-range screencode/colour byte values.
describe('loadMarqCFramebuf dimension/value validation (B11)', () => {
  beforeEach(() => {
    (global as any).alert = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects an absurdly large META dimension and keeps the last valid width/height', () => {
    const w = 4, h = 2;
    // Per-frame META style: first frame establishes a valid 4x2 dimension;
    // the second frame's META is corrupt and must be rejected rather than
    // clobbering width/height with a huge, data-mismatched value.
    const content = [
      `unsigned char frame0000[]={// border,bg,chars,colors`,
      frameBody(w, h, 14, 6, 32, 0),
      `};`,
      `// META: ${w} ${h} C64 upper`,
      `unsigned char frame0001[]={// border,bg,chars,colors`,
      frameBody(w, h, 14, 6, 49, 1),
      `};`,
      `// META: 999999 999999 C64 upper`,
      ``,
    ].join('\n');

    const importFile = writeAndLoad(content);

    expect((global as any).alert).toHaveBeenCalledWith(expect.stringContaining('invalid META dimension'));
    expect(importFile).toHaveBeenCalledTimes(1);
    const framebufs = importFile.mock.calls[0][0];
    // Both frames import using the last *valid* 4x2 dimension, not the
    // rejected 999999x999999 value (which would have made every frame
    // fail the length check and import nothing at all).
    expect(framebufs).toHaveLength(2);
    expect(framebufs[0].width).toBe(w);
    expect(framebufs[0].height).toBe(h);
    expect(framebufs[1].framebuf[0][0].code).toBe(49);
  });

  it('rejects a META dimension too large for any frame and reports no frames imported', () => {
    const w = 4, h = 2;
    const content = [
      `unsigned char frame0000[]={// border,bg,chars,colors`,
      frameBody(w, h, 14, 6, 32, 0),
      `};`,
      `// META: 999999 999999 C64 upper`,
      ``,
    ].join('\n');

    const importFile = writeAndLoad(content);

    // The bogus dimension is rejected outright (never adopted), so the
    // importer falls back to its built-in 40x25 default -- which this
    // frame's actual (4x2-sized) data is also too short for, so nothing
    // imports. This is the correct, safe outcome: never silently apply an
    // implausible dimension to real frame data.
    expect((global as any).alert).toHaveBeenCalledWith(expect.stringContaining('invalid META dimension'));
    expect(importFile).not.toHaveBeenCalled();
  });

  it('skips a frame whose byte length is too short for the declared dimensions', () => {
    const w = 4, h = 2;
    const shortFrame = frameBody(w, h, 14, 6, 32, 0).split(',').slice(0, 5).join(','); // truncated
    const content = [
      `unsigned char frame0000[]={// border,bg,chars,colors`,
      shortFrame,
      `};`,
      `unsigned char frame0001[]={// border,bg,chars,colors`,
      frameBody(w, h, 14, 6, 49, 1),
      `};`,
      `// META: ${w} ${h} C64 upper`,
      ``,
    ].join('\n');

    const importFile = writeAndLoad(content);

    expect(importFile).toHaveBeenCalledTimes(1);
    const framebufs = importFile.mock.calls[0][0];
    // Only the second (well-formed) frame should have been imported.
    expect(framebufs).toHaveLength(1);
    expect(framebufs[0].framebuf[0][0].code).toBe(49);
    expect(console.error).toHaveBeenCalled();
  });

  it('alerts and does not call importFile when every frame is too short', () => {
    const w = 4, h = 2;
    const shortFrame = frameBody(w, h, 14, 6, 32, 0).split(',').slice(0, 5).join(',');
    const content = [
      `unsigned char frame0000[]={// border,bg,chars,colors`,
      shortFrame,
      `};`,
      `// META: ${w} ${h} C64 upper`,
      ``,
    ].join('\n');

    const importFile = writeAndLoad(content);

    expect(importFile).not.toHaveBeenCalled();
    expect((global as any).alert).toHaveBeenCalledWith(expect.stringContaining('no frames matching'));
  });

  it('clamps out-of-range screencode/colour byte values to 0-255', () => {
    const w = 2, h = 1;
    const content = [
      `unsigned char frame0000[]={// border,bg,chars,colors`,
      `14,6,`,
      `-10,300,`,
      `-1,999,`,
      `};`,
      `// META: ${w} ${h} C64 upper`,
      ``,
    ].join('\n');

    const importFile = writeAndLoad(content);

    expect(importFile).toHaveBeenCalledTimes(1);
    const framebufs = importFile.mock.calls[0][0];
    expect(framebufs[0].framebuf[0][0].code).toBe(0);   // -10 clamped
    expect(framebufs[0].framebuf[0][1].code).toBe(255); // 300 clamped
    expect(framebufs[0].framebuf[0][0].color).toBe(0);   // -1 clamped
    expect(framebufs[0].framebuf[0][1].color).toBe(255); // 999 clamped
  });
});
