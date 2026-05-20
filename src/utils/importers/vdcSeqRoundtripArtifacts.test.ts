jest.mock('../electronImports', () => ({
  electron: {
    remote: {
      app: {
        getAppPath: () => process.cwd(),
      },
    },
  },
  fs: require('fs'),
  path: require('path'),
  app: {
    getPath: () => require('os').tmpdir(),
  },
  buffer: require('buffer'),
}));

jest.mock('../../redux/workspace', () => ({
  framebufFromJson: (c: any) => c,
}));

import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

import { Framebuf, FramebufWithFont, Pixel } from '../../redux/types';
import { saveSEQ } from '../exporters/seq';
import { framebufToPixelsRGBA } from '../exporters/util';
import { loadSeqAdvanced, SeqAdvOptions } from './seq2petscii';
import { vdcPalette } from '../palette';
import { VDC_ATTR_ALTCHAR, VDC_ATTR_REVERSE, VDC_ATTR_UNDERLINE } from '../vdcAttr';

interface VdcMode {
  name: string;
  lower: boolean;
  reverse: boolean;
  underline: boolean;
}

const VDC_MODES: VdcMode[] = [
  { name: 'upper', lower: false, reverse: false, underline: false },
  { name: 'lower', lower: true, reverse: false, underline: false },
  { name: 'upper-rvs', lower: false, reverse: true, underline: false },
  { name: 'lower-rvs', lower: true, reverse: true, underline: false },
  { name: 'upper-und', lower: false, reverse: false, underline: true },
  { name: 'lower-und', lower: true, reverse: false, underline: true },
  { name: 'upper-rvs-und', lower: false, reverse: true, underline: true },
  { name: 'lower-rvs-und', lower: true, reverse: true, underline: true },
];

function repoRoot() {
  return path.resolve(__dirname, '../../../');
}

function artifactsDir() {
  return path.join(repoRoot(), '_tests', 'exports', 'vdc-seq-roundtrip');
}

function buildVdcFont(): FramebufWithFont['font'] {
  const root = repoRoot();
  const upper = fs.readFileSync(path.join(root, 'assets', 'c128-charset-upper.bin'));
  const lower = fs.readFileSync(path.join(root, 'assets', 'c128-charset-lower.bin'));
  const barMinimal = fs.readFileSync(path.join(root, 'assets', 'bar-minimal.bin'));
  const transparentGlyph = Buffer.from(barMinimal).slice(0, 8);
  return {
    bits: Array.from(Buffer.concat([Buffer.from(upper), Buffer.from(lower), transparentGlyph])),
    charOrder: [],
  };
}

function makeAttr(color: number, mode: VdcMode): number {
  let attr = color & 0x0f;
  if (mode.lower) attr |= VDC_ATTR_ALTCHAR;
  if (mode.reverse) attr |= VDC_ATTR_REVERSE;
  if (mode.underline) attr |= VDC_ATTR_UNDERLINE;
  return attr & 0xff;
}

function makeSourceFramebuf(): Framebuf {
  const width = 80;
  const height = 25;
  const rowsPerMode = 3;
  const framebuf: Pixel[][] = [];

  for (let y = 0; y < height; y++) {
    const row: Pixel[] = [];
    if (y < 24) {
      const mode = VDC_MODES[Math.floor(y / rowsPerMode)];
      for (let x = 0; x < width; x++) {
        const code = ((y * width) + x) & 0x7f;
        const color = (x + (y * 3)) & 0x0f;
        row.push({ code, color, attr: makeAttr(color, mode) });
      }
    } else {
      for (let x = 0; x < width; x++) {
        const mode = VDC_MODES[x % VDC_MODES.length];
        const color = Math.floor(x / VDC_MODES.length) & 0x0f;
        const code = (x * 11) & 0x7f;
        row.push({ code, color, attr: makeAttr(color, mode) });
      }
    }
    framebuf.push(row);
  }

  return {
    width,
    height,
    columnMode: 80,
    backgroundColor: 0,
    borderColor: 0,
    borderOn: false,
    charset: 'c128vdc',
    name: 'vdc-seq-roundtrip-source',
    framebuf,
    zoom: { zoomLevel: 2, alignment: 'left' },
    zoomReady: true,
  };
}

function withFont(fb: Framebuf): FramebufWithFont {
  return { ...fb, font: buildVdcFont() };
}

function writePngFromFramebuf(fb: FramebufWithFont, filename: string): Buffer {
  const rgba = framebufToPixelsRGBA(fb, vdcPalette, false);
  const png = new PNG({ width: fb.width * 8, height: fb.height * 8 });
  png.data = Buffer.from(rgba);
  fs.writeFileSync(filename, PNG.sync.write(png));
  return rgba;
}

function compareImagesAndWriteDiff(
  original: Buffer,
  roundtrip: Buffer,
  width: number,
  height: number,
  diffFilename: string
): number {
  const diff = Buffer.alloc(original.length);
  let mismatchedPixels = 0;

  for (let i = 0; i < original.length; i += 4) {
    const same =
      original[i] === roundtrip[i] &&
      original[i + 1] === roundtrip[i + 1] &&
      original[i + 2] === roundtrip[i + 2] &&
      original[i + 3] === roundtrip[i + 3];

    if (same) {
      diff[i] = original[i];
      diff[i + 1] = original[i + 1];
      diff[i + 2] = original[i + 2];
      diff[i + 3] = 255;
    } else {
      diff[i] = 255;
      diff[i + 1] = 0;
      diff[i + 2] = 255;
      diff[i + 3] = 255;
      mismatchedPixels++;
    }
  }

  const png = new PNG({ width, height });
  png.data = diff;
  fs.writeFileSync(diffFilename, PNG.sync.write(png));

  return mismatchedPixels;
}

describe('C128 VDC SEQ round-trip artifact compare', () => {
  it('exports source PNG/SEQ, re-imports via Adv SEQ c128vdc settings, and compares PNGs', () => {
    const outDir = artifactsDir();
    fs.mkdirSync(outDir, { recursive: true });

    const sourceFb = makeSourceFramebuf();
    const sourceWithFont = withFont(sourceFb);

    const sourcePetmate = path.join(outDir, 'vdc-roundtrip-source.petmate');
    fs.writeFileSync(sourcePetmate, JSON.stringify({
      version: 3,
      screens: [0],
      framebufs: [sourceFb],
      customFonts: {},
    }, null, 2));

    const sourcePng = path.join(outDir, 'vdc-roundtrip-source.png');
    const seqFile = path.join(outDir, 'vdc-roundtrip.seq');
    const importedPng = path.join(outDir, 'vdc-roundtrip-imported.png');
    const diffPng = path.join(outDir, 'vdc-roundtrip-diff.png');

    const sourceRgba = writePngFromFramebuf(sourceWithFont, sourcePng);

    const seqFmt: any = {
      exportOptions: {
        insCR: false,
        insClear: true,
        stripBlanks: false,
        insCharset: false,
      },
    };
    saveSEQ(seqFile, sourceWithFont, seqFmt);

    const options: SeqAdvOptions = {
      width: 80,
      minHeight: 25,
      crCodes: new Set<number>([0x0d, 0x8d]),
      honorCls: true,
      stripBlanks: false,
      charset: 'c128vdc',
      backgroundColor: sourceFb.backgroundColor,
      borderColor: sourceFb.borderColor,
    };
    const imported = loadSeqAdvanced(seqFile, options) as any;
    expect(imported).toBeDefined();
    expect(imported.width).toBe(80);
    expect(imported.height).toBe(25);
    expect(imported.charset).toBe('c128vdc');

    const importedWithFont = withFont({
      ...imported,
      borderOn: false,
      zoom: imported.zoom ?? { zoomLevel: 2, alignment: 'left' },
      zoomReady: imported.zoomReady ?? true,
      name: imported.name ?? 'vdc-seq-roundtrip-imported',
    });
    const importedRgba = writePngFromFramebuf(importedWithFont, importedPng);

    const mismatched = compareImagesAndWriteDiff(
      sourceRgba,
      importedRgba,
      sourceFb.width * 8,
      sourceFb.height * 8,
      diffPng
    );

    expect(mismatched).toBe(0);
  });
});
