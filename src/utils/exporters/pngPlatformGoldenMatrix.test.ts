import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { PNG } from 'pngjs';

import { Font, FramebufWithFont, Pixel } from '../../redux/types';
import { framebufToPixelsRGBA } from './util';
import {
  colorPalettes,
  petColorPalettes,
  selectPaletteForFramebuf,
  tedColorPalettes,
  vdcPalette,
  vic20ColorPalettes,
} from '../palette';
import { VDC_ATTR_ALTCHAR, VDC_ATTR_REVERSE, VDC_ATTR_UNDERLINE } from '../vdcAttr';

interface PlatformCase {
  id: 'c64' | 'c16' | 'vic20' | 'pet' | 'c128' | 'c128vdc';
  charset: string;
  width: number;
  height: number;
  font: Font;
}

const paletteSet = {
  c64: colorPalettes.colodore,
  c16: tedColorPalettes.tedPAL,
  vic20: vic20ColorPalettes.vic20pal,
  pet: petColorPalettes.petgreen,
};

function repoRoot() {
  return path.resolve(__dirname, '../../../');
}

function artifactsDir() {
  return path.join(repoRoot(), '_tests', 'exports', 'png-platform-matrix');
}

function loadFontPlus(fontFileName: string, addonFileName = 'bar-minimal.bin'): Font {
  const root = repoRoot();
  const font = fs.readFileSync(path.join(root, 'assets', fontFileName));
  const addon = fs.readFileSync(path.join(root, 'assets', addonFileName));
  return {
    bits: Array.from(Buffer.concat([Buffer.from(font), Buffer.from(addon)])),
    charOrder: [],
  };
}

function loadVdcFont(): Font {
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

function buildFramebuf(platform: PlatformCase): FramebufWithFont {
  const framebuf: Pixel[][] = [];

  for (let y = 0; y < platform.height; y++) {
    const row: Pixel[] = [];
    for (let x = 0; x < platform.width; x++) {
      let color = (x * 7 + y * 3) & 0x0f;
      if (platform.id === 'pet') color = (x + y) & 0x01;
      if (platform.id === 'c16') color = (x * 5 + y * 9) & 0x7f;

      if (platform.id === 'c128vdc') {
        const code = (x * 11 + y * 13) & 0x7f;
        let attr = color & 0x0f;
        if (((x + y) & 1) === 0) attr |= VDC_ATTR_REVERSE;
        if (y === platform.height - 1) attr |= VDC_ATTR_UNDERLINE;
        if ((x % 3) === 0) attr |= VDC_ATTR_ALTCHAR;
        row.push({ code, color, attr: attr & 0xff });
      } else {
        const code = ((x * 13) + (y * 17) + 1) & 0xff;
        row.push({ code, color });
      }
    }
    framebuf.push(row);
  }

  return {
    framebuf,
    width: platform.width,
    height: platform.height,
    backgroundColor: platform.id === 'c16' ? 0x11 : 0,
    borderColor: platform.id === 'c16' ? 0x22 : 0,
    borderOn: false,
    charset: platform.charset,
    name: `golden-${platform.id}`,
    zoom: { zoomLevel: 2, alignment: 'left' },
    zoomReady: true,
    font: platform.font,
  };
}

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function writeArtifactPng(id: string, rgba: Buffer, width: number, height: number): void {
  fs.mkdirSync(artifactsDir(), { recursive: true });
  const png = new PNG({ width, height });
  png.data = Buffer.from(rgba);
  fs.writeFileSync(path.join(artifactsDir(), `${id}.png`), PNG.sync.write(png));
}

describe('PNG platform golden matrix', () => {
  const cases: PlatformCase[] = [
    { id: 'c64', charset: 'upper', width: 40, height: 25, font: loadFontPlus('c64-charset-upper.bin') },
    { id: 'c16', charset: 'c16Upper', width: 40, height: 25, font: loadFontPlus('c16-charset-upper.bin') },
    { id: 'vic20', charset: 'vic20Upper', width: 22, height: 23, font: loadFontPlus('vic20-charset-upper.bin') },
    { id: 'pet', charset: 'petGfx', width: 40, height: 25, font: loadFontPlus('pet-charset-upper.bin') },
    { id: 'c128', charset: 'c128Upper', width: 40, height: 25, font: loadFontPlus('c128-charset-upper.bin') },
    { id: 'c128vdc', charset: 'c128vdc', width: 80, height: 25, font: loadVdcFont() },
  ];

  it('selects expected palette family for each platform', () => {
    expect(selectPaletteForFramebuf({ charset: 'upper', width: 40 }, paletteSet)).toBe(paletteSet.c64);
    expect(selectPaletteForFramebuf({ charset: 'c16Upper', width: 40 }, paletteSet)).toBe(paletteSet.c16);
    expect(selectPaletteForFramebuf({ charset: 'vic20Upper', width: 22 }, paletteSet)).toBe(paletteSet.vic20);
    expect(selectPaletteForFramebuf({ charset: 'petGfx', width: 40 }, paletteSet)).toBe(paletteSet.pet);
    expect(selectPaletteForFramebuf({ charset: 'c128Upper', width: 40 }, paletteSet)).toBe(paletteSet.c64);
    expect(selectPaletteForFramebuf({ charset: 'c128Upper', width: 80 }, paletteSet)).toBe(vdcPalette);
    expect(selectPaletteForFramebuf({ charset: 'c128vdc', width: 80 }, paletteSet)).toBe(vdcPalette);
  });

  it('matches golden hashes for rendered platform PNG pixel data', () => {
    const actualHashes: Record<string, string> = {};

    for (const platform of cases) {
      const fb = buildFramebuf(platform);
      const palette = selectPaletteForFramebuf(fb, paletteSet);
      const rgba = framebufToPixelsRGBA(fb, palette, false);
      writeArtifactPng(platform.id, rgba, fb.width * 8, fb.height * 8);
      actualHashes[platform.id] = sha256Hex(rgba);
    }

    const expectedHashes: Record<string, string> = {
      c64: 'f328967cc3ca76e048b5a6b57c29830b397fdd9b6034800027b407027cbc37f2',
      c16: '66351b04427cd6a8d4a5ef490aac9821fb5d2da64eaa1bc170423811fb888add',
      vic20: 'b5df75d0acccb77e6899eb8c1fa185c5278007af9415fd50a8b9ca1790e3e77c',
      pet: 'c966969c596c93068af95c49ed03abaa3f731652c0bed28a7b93c2462996b3be',
      c128: 'f328967cc3ca76e048b5a6b57c29830b397fdd9b6034800027b407027cbc37f2',
      c128vdc: 'd225de4b001e9ae1352d6e9d0873be1ee0eada48f5951dd85eb58c04ef8e6749',
    };

    expect(actualHashes).toEqual(expectedHashes);
  });
});
