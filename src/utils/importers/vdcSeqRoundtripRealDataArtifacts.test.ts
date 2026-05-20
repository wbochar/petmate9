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

import { Framebuf, FramebufWithFont } from '../../redux/types';
import { saveSEQ } from '../exporters/seq';
import { framebufToPixelsRGBA } from '../exporters/util';
import { loadSeqAdvanced, SeqAdvOptions } from './seq2petscii';
import { vdcPalette } from '../palette';

function repoRoot() {
  return path.resolve(__dirname, '../../../');
}

function artifactsDir() {
  return path.join(repoRoot(), '_tests', 'exports', 'vdc-seq-roundtrip-real');
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

describe('C128 VDC SEQ round-trip artifact compare (real petmate source)', () => {
  it('round-trips _tests/vdc-seq-test-data.petmate via SEQ export/import and compares PNGs', () => {
    const outDir = artifactsDir();
    fs.mkdirSync(outDir, { recursive: true });

    const sourcePetmatePath = path.join(repoRoot(), '_tests', 'vdc-seq-test-data.petmate');
    const sourceDoc = JSON.parse(fs.readFileSync(sourcePetmatePath, 'utf8'));
    const sourceFb = sourceDoc.framebufs[0] as Framebuf;
    expect(sourceFb.charset).toBe('c128vdc');
    expect(sourceFb.width).toBe(80);

    const sourceWithFont = withFont(sourceFb);

    const sourcePng = path.join(outDir, 'vdc-real-source.png');
    const seqFile = path.join(outDir, 'vdc-real-roundtrip.seq');
    const importedPng = path.join(outDir, 'vdc-real-imported.png');
    const diffPng = path.join(outDir, 'vdc-real-diff.png');

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
      name: imported.name ?? 'vdc-real-roundtrip-imported',
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
