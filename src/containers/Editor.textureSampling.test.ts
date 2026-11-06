// Regression tests for C5 (Group C master task list): bucket-fill drag and
// the box-fill live preview previously called buildCanvasTexture(), which
// allocates a full framebufWidth x framebufHeight Pixel[][] grid, on every
// single dragged-over cell / every render while dragging. sampleTexturePixel
// computes one cell's texture pixel in O(1) without ever allocating a grid,
// and buildTiledTexture/buildCanvasTexture are now just thin wrappers around
// it for any caller that still needs a real materialized grid.

jest.mock('../utils/electronImports', () => ({
  electron: {
    remote: {
      app: { getAppPath: () => '/mock' },
      getCurrentWindow: jest.fn(),
      process: { platform: 'darwin' },
      require: jest.fn(() => ({ extname: () => '', resolve: (...a: string[]) => a.join('/'), join: (...a: string[]) => a.join('/') })),
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

import { FramebufferView } from './Editor';
import { TexturePreset } from '../redux/types';

function makeFramebuf(width: number, height: number) {
  return Array.from({ length: height }, (_, row) =>
    Array.from({ length: width }, (_, col) => ({ code: 32, color: 14 }))
  );
}

function makePreset(overrides: Partial<TexturePreset> = {}): TexturePreset {
  return {
    name: 'test',
    chars: [1, 2, 3, 4],
    colors: [5, 6, 7, 8],
    options: [false, false, false, false, false, false],
    ...overrides,
  };
}

function makeInstance(width: number, height: number, preset: TexturePreset): FramebufferView {
  const props: any = {
    undoId: null,
    framebufIndex: 0,
    altKey: false, ctrlKey: false, rawCtrlKey: false, shiftKey: false,
    shiftDrawingMode: 'axisLock', spacebarKey: false,
    textCursorPos: { row: 0, col: 0 },
    framebuf: makeFramebuf(width, height),
    framebufWidth: width,
    framebufHeight: height,
    selectedTool: 7, // Tool.Textures
    brush: null,
    brushRegion: null,
    framebufUIState: { canvasTransform: { v: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] }, canvasFit: 'nofit' },
    backgroundColor: 6,
    borderColor: 14,
    borderOn: false,
    textColor: 14,
    curScreencode: 65,
    colorPalette: [],
    zoom: { zoomLevel: 1, alignment: 'left' },
    font: { bits: [], charOrder: [] },
    zoomReady: true,
    canvasGrid: false,
    isDirart: false,
    guideLayerVisible: false,
    isVic20: false,
    isVDC80: false,
    fadeMode: 'lighten', fadeStrength: 1, fadeSource: 'AllCharacters',
    fadeStepStart: 'first', fadeStepCount: 1, fadeStepChoice: 'pingpong', fadeStepSort: 'default',
    fadeLinearCounter: 0, fadeDrawMode: false,
    charset: 'upper',
    vdcPaintFlags: 0, c16PaintBlink: false, vdcBlinkIntervalMs: 400,
    boxDrawMode: false, boxForceForeground: false, boxPresets: [], selectedBoxPresetIndex: 0,
    textureDrawMode: 'bucket',
    textureForceForeground: false,
    texturePresets: [preset],
    selectedTexturePresetIndex: 0,
    scrollZoomSensitivity: 5, pinchZoomSensitivity: 5,
    lineDrawActive: false, lineDrawChunkyMode: false, lineDrawPoints: [],
    guideLayerDragOffset: null,
    showTransparency: false,
    onCharPosChanged: jest.fn(),
    framebufLayout: { width, height, pixelScale: 1 },
    Framebuffer: { setPixels: jest.fn(), setBrush: jest.fn() } as any,
    Toolbar: { resetBrush: jest.fn(), incUndoId: jest.fn(), setBrushRegion: jest.fn(), captureBrush: jest.fn() } as any,
  };
  return new (FramebufferView as any)(props);
}

describe('sampleTexturePixel / buildTiledTexture equivalence (C5)', () => {
  it('buildTiledTexture (grid) matches per-cell sampleTexturePixel results exactly', () => {
    const preset = makePreset();
    const instance = makeInstance(6, 4, preset);

    const grid = instance.buildTiledTexture(6, 4)!;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 6; c++) {
        expect(instance.sampleTexturePixel(r, c)).toEqual(grid[r][c]);
      }
    }
  });

  it('matches for the inverted option too (reversed strip indexing)', () => {
    const preset = makePreset({ options: [false, true, false, false, false, false] }); // invert=true
    const instance = makeInstance(5, 3, preset);

    const grid = instance.buildTiledTexture(5, 3)!;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) {
        expect(instance.sampleTexturePixel(r, c)).toEqual(grid[r][c]);
      }
    }
  });

  it('matches for the diagonal + vertical options too', () => {
    const preset = makePreset({ options: [true, false, false, false, true, false] }); // vertical+diagonal
    const instance = makeInstance(5, 5, preset);

    const grid = instance.buildTiledTexture(5, 5)!;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        expect(instance.sampleTexturePixel(r, c)).toEqual(grid[r][c]);
      }
    }
  });

  it('returns null when there is no active texture preset', () => {
    const instance = makeInstance(4, 4, makePreset());
    (instance as any).props.texturePresets = [];
    expect(instance.sampleTexturePixel(0, 0)).toBeNull();
    expect(instance.buildTiledTexture(4, 4)).toBeNull();
  });

  it('SetTextureFloodFill paints the flood-filled region using sampled texture pixels, without needing a full grid', () => {
    const preset = makePreset({ chars: [99], colors: [3] }); // single-entry strip -> every cell samples the same pixel
    const width = 10, height = 10;
    const instance = makeInstance(width, height, preset);

    instance.SetTextureFloodFill({ row: 5, col: 5 });

    expect((instance.props.Framebuffer.setPixels as jest.Mock)).toHaveBeenCalledTimes(1);
    const [pixelChanges] = (instance.props.Framebuffer.setPixels as jest.Mock).mock.calls[0];
    // Entire framebuf is uniform (code 32/color 14), so flood fill covers
    // every cell -- and every one should be painted with the sampled texture.
    expect(pixelChanges.length).toBe(width * height);
    for (const change of pixelChanges) {
      expect(change.screencode).toBe(99);
      expect(change.color).toBe(3);
    }
  });

  it('never allocates a whole-canvas texture grid during bucket-fill, replace-all, or box-fill commit', () => {
    const preset = makePreset();
    const width = 20, height = 20;
    const instance = makeInstance(width, height, preset);

    const buildCanvasSpy = jest.spyOn(instance, 'buildCanvasTexture');
    const buildTiledSpy = jest.spyOn(instance, 'buildTiledTexture');

    // Bucket-fill (SetTextureFloodFill): the hot per-dragged-cell path.
    instance.SetTextureFloodFill({ row: 0, col: 0 });
    expect(buildCanvasSpy).not.toHaveBeenCalled();
    expect(buildTiledSpy).not.toHaveBeenCalled();

    // Replace-All: also must not build a full grid up front.
    instance.SetTextureReplaceAll({ row: 0, col: 0 });
    expect(buildCanvasSpy).not.toHaveBeenCalled();
    expect(buildTiledSpy).not.toHaveBeenCalled();

    // Box-fill commit (dragEnd): only the dragged rectangle should be sampled.
    (instance as any).props.textureDrawMode = 'box';
    (instance as any).props.brushRegion = { min: { row: 2, col: 2 }, max: { row: 4, col: 4 } };
    instance.dragEnd();
    expect(buildCanvasSpy).not.toHaveBeenCalled();
    expect(buildTiledSpy).not.toHaveBeenCalled();
  });
});
