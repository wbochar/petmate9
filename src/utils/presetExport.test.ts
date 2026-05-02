import {
  BOX_HEADER_MARKER,
  PRESET_EXPORT_WIDTH,
  TEXTURE_CHARS_TERMINATOR,
  TEXTURE_OPTS_MARKER,
  buildBoxesExportPixels,
  buildTexturesExportPixels,
  getExportFrameSpec,
} from './presetExport';
import { BoxPreset, TexturePreset, TRANSPARENT_SCREENCODE } from '../redux/types';

function makeBoxPreset(): BoxPreset {
  return {
    name: 'BOX',
    corners: [0x55, 0x49, 0x4a, 0x4b],
    cornerColors: [3, 4, 5, 6],
    top: {
      chars: [0x43],
      colors: [2],
      mirror: false,
      stretch: false,
      repeat: true,
      startEnd: 'none',
    },
    bottom: {
      chars: [0x43],
      colors: [7],
      mirror: false,
      stretch: false,
      repeat: true,
      startEnd: 'none',
    },
    left: {
      chars: [0x42],
      colors: [8],
      mirror: false,
      stretch: false,
      repeat: true,
      startEnd: 'none',
    },
    right: {
      chars: [0x42],
      colors: [9],
      mirror: false,
      stretch: false,
      repeat: true,
      startEnd: 'none',
    },
    fill: TRANSPARENT_SCREENCODE,
    fillColor: 10,
  };
}

function makeTexturePreset(): TexturePreset {
  return {
    name: 'TEX',
    chars: [0x41, 0x42],
    colors: [5, 7],
    options: [true, false, false, false, false, false],
    random: false,
    brushWidth: 8,
    brushHeight: 8,
  };
}

describe('getExportFrameSpec', () => {
  test('returns machine-default foreground colors per platform group', () => {
    expect(getExportFrameSpec('c64')).toEqual({
      charset: 'upper',
      width: PRESET_EXPORT_WIDTH,
      backgroundColor: 6,
      textColor: 14,
    });
    expect(getExportFrameSpec('vic20')).toEqual({
      charset: 'vic20Upper',
      width: PRESET_EXPORT_WIDTH,
      backgroundColor: 1,
      textColor: 6,
    });
    expect(getExportFrameSpec('c16')).toEqual({
      charset: 'c16Upper',
      width: PRESET_EXPORT_WIDTH,
      backgroundColor: 0x71,
      textColor: 0x00,
    });
    expect(getExportFrameSpec('c128vdc')).toEqual({
      charset: 'c128Upper',
      width: 80,
      backgroundColor: 0,
      textColor: 15,
    });
    expect(getExportFrameSpec('pet')).toEqual({
      charset: 'petGfx',
      width: PRESET_EXPORT_WIDTH,
      backgroundColor: 0,
      textColor: 1,
    });
  });
});

describe('preset export row colors', () => {
  test('boxes export keeps metadata cells in text color while preserving data colors', () => {
    const textColor = 14;
    const rows = buildBoxesExportPixels([makeBoxPreset()], 'c64', textColor, PRESET_EXPORT_WIDTH, false);
    const header = rows[0];
    const topSide = rows[2];

    expect(header[5].code).toBe(BOX_HEADER_MARKER);
    expect(header[5].color).toBe(textColor);
    expect(header[9].color).toBe(textColor); // start of embedded group key

    expect(topSide[0].color).toBe(textColor); // count metadata cell
    expect(topSide[1].color).toBe(2); // preserved top side char color
    expect(topSide[5].color).toBe(textColor); // mirror metadata cell
  });

  test('textures export uses text color for options/terminator metadata cells', () => {
    const textColor = 14;
    const rows = buildTexturesExportPixels([makeTexturePreset()], 'c64', textColor, PRESET_EXPORT_WIDTH, false);
    const charsRow = rows[1];
    const optsRow = rows[2];

    expect(charsRow[0].color).toBe(5);
    expect(charsRow[1].color).toBe(7);
    expect(charsRow[2].code).toBe(TEXTURE_CHARS_TERMINATOR);
    expect(charsRow[2].color).toBe(textColor);

    expect(optsRow[6].code).toBe(TEXTURE_OPTS_MARKER);
    expect(optsRow[0].color).toBe(textColor);
    expect(optsRow[6].color).toBe(textColor);
    expect(optsRow[10].color).toBe(textColor);
  });

  test('forceForeground still clamps content colors to the export text color', () => {
    const rows = buildTexturesExportPixels([makeTexturePreset()], 'vic20', 6, PRESET_EXPORT_WIDTH, true);
    const charsRow = rows[1];
    expect(charsRow[0].color).toBe(6);
    expect(charsRow[1].color).toBe(6);
  });
});
