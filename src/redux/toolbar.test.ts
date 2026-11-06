// Mock electron imports used transitively by toolbar.ts
jest.mock('../utils/electronImports', () => ({
  electron: {
    remote: {
      app: { getAppPath: () => '/mock', getPath: () => '/tmp', getVersion: () => '0.0.0', addRecentDocument: jest.fn() },
      getCurrentWindow: jest.fn(),
      process: { platform: 'darwin' },
      dialog: {},
    },
    ipcRenderer: { send: jest.fn() },
    clipboard: { writeBuffer: jest.fn(), readBuffer: jest.fn(), readText: jest.fn(), has: jest.fn(), availableFormats: jest.fn() },
  },
  fs: { readFileSync: () => Buffer.alloc(2048), writeFileSync: jest.fn(), existsSync: () => false },
  path: { resolve: (...a: string[]) => a.join('/'), join: (...a: string[]) => a.join('/'), extname: (f: string) => '' },
  buffer: {},
  app: {},
}));

// Break the toolbar ↔ brush circular dependency
jest.mock('./brush', () => ({
  findTransformedChar: jest.fn((font: any, code: number) => code),
  findInverseChar: jest.fn((font: any, code: number) => code),
  mirrorBrush: jest.fn(),
}));

import { Toolbar } from './toolbar';
import { Tool, Toolbar as IToolbar, Brush, DEFAULT_FB_WIDTH, DEFAULT_FB_HEIGHT } from './types';
import * as selectors from './selectors';
import * as screensSelectors from './screensSelectors';
import { colorPalettes, sortPaletteByLuma } from '../utils/palette';

const reducer = Toolbar.reducer;

function defaultState(): IToolbar {
  return reducer(undefined, { type: '@@INIT' } as any);
}

describe('toolbar reducer default state', () => {
  it('starts with the Draw tool selected', () => {
    expect(defaultState().selectedTool).toBe(Tool.Draw);
  });

  it('starts with no brush', () => {
    expect(defaultState().brush).toBeNull();
  });

  it('starts with default text color 14', () => {
    expect(defaultState().textColor).toBe(14);
  });

  it('starts with all modifier keys false', () => {
    const state = defaultState();
    expect(state.altKey).toBe(false);
    expect(state.ctrlKey).toBe(false);
    expect(state.shiftKey).toBe(false);
    expect(state.metaKey).toBe(false);
    expect(state.tabKey).toBe(false);
    expect(state.spacebarKey).toBe(false);
  });

  it('starts with shortcuts active', () => {
    expect(defaultState().shortcutsActive).toBe(true);
  });

  it('starts with C16 blink paint disabled', () => {
    expect(defaultState().c16PaintBlink).toBe(false);
  });
});

describe('c16 blink paint state', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('SET_C16_PAINT_BLINK updates the blink toggle', () => {
    const state = defaultState();
    const next = reducer(state, Toolbar.actions.setC16PaintBlink(true));
    expect(next.c16PaintBlink).toBe(true);
  });

  it('setCurrentScreencodeAndColor splits TED color into base hue/luma and blink bit', () => {
    jest.spyOn(selectors, 'getCurrentFramebuf').mockReturnValue({ charset: 'c16Upper', width: 40 } as any);
    const dispatch = jest.fn();
    const state = {
      toolbar: {
        ...defaultState(),
        selectedTool: Tool.Draw,
      },
    } as any;

    Toolbar.actions.setCurrentScreencodeAndColor({ code: 65, color: 0x9f } as any)(
      dispatch as any,
      () => state
    );

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'Toolbar/SET_TEXT_COLOR', data: 0x1f }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'Toolbar/SET_C16_PAINT_BLINK', data: true }));
  });
});

describe('VDC paint flag state', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('SET_VDC_PAINT_FLAGS updates the vdcPaintFlags field', () => {
    const state = defaultState();
    const next = reducer(state, Toolbar.actions.setVdcPaintFlags(0x70));
    expect(next.vdcPaintFlags).toBe(0x70);
  });

  it('setCurrentScreencodeAndColor picks up VDC REVERSE/UNDERLINE/BLINK flags', () => {
    jest.spyOn(selectors, 'getCurrentFramebuf').mockReturnValue({ charset: 'c128vdc', width: 80 } as any);
    const dispatch = jest.fn();
    const state = {
      toolbar: {
        ...defaultState(),
        selectedTool: Tool.Draw,
      },
    } as any;

    // attr = 0x75: REVERSE(0x40) | UNDERLINE(0x20) | BLINK(0x10) | color 5
    Toolbar.actions.setCurrentScreencodeAndColor({ code: 65, color: 5, attr: 0x75 } as any)(
      dispatch as any,
      () => state
    );

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'Toolbar/SET_TEXT_COLOR', data: 5 }));
    // Flag mask should be 0x70 (bits 4-6 only, ALTCHAR excluded)
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'Toolbar/SET_VDC_PAINT_FLAGS', data: 0x70 }));
  });

  it('setCurrentScreencodeAndColor clears VDC flags when cell has none', () => {
    jest.spyOn(selectors, 'getCurrentFramebuf').mockReturnValue({ charset: 'c128vdc', width: 80 } as any);
    const dispatch = jest.fn();
    const state = {
      toolbar: {
        ...defaultState(),
        selectedTool: Tool.Draw,
        vdcPaintFlags: 0x70,
      },
    } as any;

    // attr = 0x05: just color 5, no flags
    Toolbar.actions.setCurrentScreencodeAndColor({ code: 65, color: 5, attr: 0x05 } as any)(
      dispatch as any,
      () => state
    );

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'Toolbar/SET_VDC_PAINT_FLAGS', data: 0x00 }));
  });
});

describe('nextColor thunk', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function makeState(toolbarOverrides: any = {}, settingsOverrides: any = {}) {
    return {
      toolbar: {
        ...defaultState(),
        selectedPaletteRemap: 0,
        ...toolbarOverrides,
      },
      settings: {
        saved: {
          palettes: [Array.from({ length: 16 }, (_, i) => i)],
          vic20palettes: [Array.from({ length: 16 }, (_, i) => i)],
          petpalettes: [Array.from({ length: 16 }, (_, i) => i)],
          selectedColorPalette: 'petmate',
          selectedVic20ColorPalette: 'vic20pal',
          selectedPetColorPalette: 'petwhite',
          selectedTedColorPalette: 'tedPAL',
          colorSortMode: 'default',
          ...settingsOverrides,
        },
      },
    } as any;
  }

  it('steps according to luma sort order when luma-light-dark is active', () => {
    const sorted = sortPaletteByLuma(
      Array.from({ length: 16 }, (_, i) => i),
      colorPalettes.petmate,
      'luma-light-dark'
    );
    const state = makeState(
      { textColor: sorted[0] },
      { colorSortMode: 'luma-light-dark' }
    );
    jest.spyOn(selectors, 'getCurrentFramebuf').mockReturnValue({ charset: 'upper', width: 40 } as any);
    const dispatch = jest.fn();

    Toolbar.actions.nextColor(1)(dispatch as any, () => state);

    const action = dispatch.mock.calls[0][0];
    const next = reducer(state.toolbar, action);
    expect(next.textColor).toBe(sorted[1]);
  });

  it('limits VIC-20 q/e stepping to sub-palette colors 0-7', () => {
    const state = makeState({ textColor: 7 });
    jest.spyOn(selectors, 'getCurrentFramebuf').mockReturnValue({ charset: 'vic20', width: 22 } as any);
    const dispatch = jest.fn();

    Toolbar.actions.nextColor(1)(dispatch as any, () => state);

    const action = dispatch.mock.calls[0][0];
    expect(action.data.paletteRemap).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const next = reducer(state.toolbar, action);
    expect(next.textColor).toBe(7);
  });
});

describe('tool selection', () => {
  it('SET_SELECTED_TOOL changes the tool', () => {
    const state = defaultState();
    const next = reducer(state, Toolbar.actions.setSelectedTool(Tool.Brush));
    expect(next.selectedTool).toBe(Tool.Brush);
  });
});

describe('text color', () => {
  it('SET_TEXT_COLOR updates the current text color', () => {
    const state = defaultState();
    const next = reducer(state, Toolbar.actions.setTextColor(5));
    expect(next.textColor).toBe(5);
  });
});

describe('NEXT_COLOR', () => {
  it('cycles the color forward in the palette remap', () => {
    const remap = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const state = { ...defaultState(), textColor: 14 };
    const next = reducer(state, Toolbar.actions.nextColorAction(1, remap));
    expect(next.textColor).toBe(15);
  });

  it('cycles the color backward', () => {
    const remap = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const state = { ...defaultState(), textColor: 14 };
    const next = reducer(state, Toolbar.actions.nextColorAction(-1, remap));
    expect(next.textColor).toBe(13);
  });

  it('clamps at 0', () => {
    const remap = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const state = { ...defaultState(), textColor: 0 };
    const next = reducer(state, Toolbar.actions.nextColorAction(-1, remap));
    expect(next.textColor).toBe(0);
  });

  it('clamps at 15', () => {
    const remap = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const state = { ...defaultState(), textColor: 15 };
    const next = reducer(state, Toolbar.actions.nextColorAction(1, remap));
    expect(next.textColor).toBe(15);
  });
});

describe('SET_COLOR', () => {
  it('sets color from a palette slot', () => {
    const remap = [5, 10, 15, 0, 1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14];
    const state = defaultState();
    const next = reducer(state, Toolbar.actions.setColorAction(0, remap));
    expect(next.textColor).toBe(5);
  });
});

describe('INC_UNDO_ID', () => {
  it('increments the undo id', () => {
    const state = defaultState();
    expect(state.undoId).toBe(0);
    const next = reducer(state, Toolbar.actions.incUndoId());
    expect(next.undoId).toBe(1);
  });
});

// Regression tests for B9 (Group B master task list): pasteText previously
// dispatched one setPixel per pasted character with undoId=null, and
// groupByUndoId in framebufList.ts never merges null-grouped actions with
// each other -- so pasting N characters pushed N separate undo-history
// entries instead of one. pasteText now shares the toolbar's current
// undoId across every character, then closes the group with incUndoId().
describe('pasteText thunk', () => {
  const { electron } = require('../utils/electronImports');

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function makeState(overrides: any = {}) {
    return {
      toolbar: {
        ...defaultState(),
        selectedTool: Tool.Text,
        textCursorPos: { row: 0, col: 0 },
        undoId: 7,
        ...overrides,
      },
      screens: { current: 0, list: [0] },
    } as any;
  }

  it('shares a single undoId across every pasted character and closes the group afterward', () => {
    electron.clipboard.readText.mockReturnValue('abc');
    electron.clipboard.availableFormats.mockReturnValue(['text/plain']);
    jest.spyOn(selectors, 'getFramebufByIndex').mockReturnValue({ width: 40, height: 25, charset: 'upper' } as any);

    const state = makeState();
    const dispatch = jest.fn();
    Toolbar.actions.pasteText()(dispatch as any, () => state);

    const setPixelActions = dispatch.mock.calls
      .map(([action]) => action)
      .filter((a: any) => a.type === 'Framebuffer/SET_PIXEL');
    expect(setPixelActions).toHaveLength(3);
    // Every pasted character's setPixel shares the toolbar's undoId (7),
    // not null -- this is what lets framebufList.ts's groupByUndoId merge
    // them into a single undo-history entry.
    for (const action of setPixelActions) {
      expect(action.undoId).toBe(7);
    }

    // The group is closed afterward so the *next* unrelated edit doesn't
    // get merged into this paste's undo entry.
    const incUndoIdCalls = dispatch.mock.calls
      .map(([action]) => action)
      .filter((a: any) => a.type === 'Toolbar/INC_UNDO_ID');
    expect(incUndoIdCalls).toHaveLength(1);
  });

  it('does not dispatch any setPixel for an empty clipboard paste', () => {
    electron.clipboard.readText.mockReturnValue('');
    electron.clipboard.availableFormats.mockReturnValue(['text/plain']);
    jest.spyOn(selectors, 'getFramebufByIndex').mockReturnValue({ width: 40, height: 25, charset: 'upper' } as any);

    const state = makeState();
    const dispatch = jest.fn();
    Toolbar.actions.pasteText()(dispatch as any, () => state);

    const setPixelActions = dispatch.mock.calls
      .map(([action]) => action)
      .filter((a: any) => a.type === 'Framebuffer/SET_PIXEL');
    expect(setPixelActions).toHaveLength(0);
  });
});

describe('RESET_BRUSH', () => {
  it('clears the brush, brushRegion, and brushTransform', () => {
    const state = {
      ...defaultState(),
      brush: { framebuf: [[{ code: 1, color: 1 }]], brushRegion: { min: { row: 0, col: 0 }, max: { row: 0, col: 0 } } } as Brush,
    };
    const next = reducer(state, Toolbar.actions.resetBrush());
    expect(next.brush).toBeNull();
    expect(next.brushRegion).toBeNull();
    expect(next.brushTransform).toEqual({ mirror: 0, rotate: 0 });
  });
});

describe('CAPTURE_BRUSH', () => {
  it('sets the brush from captured framebuf data', () => {
    const state = defaultState();
    const brushData = {
      framebuf: [[{ code: 65, color: 1 }]],
      brushRegion: { min: { row: 0, col: 0 }, max: { row: 0, col: 0 } },
    };
    const next = reducer(state, Toolbar.actions.captureBrush(
      [[{ code: 65, color: 1 }, { code: 66, color: 2 }]],
      { min: { row: 0, col: 0 }, max: { row: 0, col: 0 } }
    ));
    expect(next.brush).not.toBeNull();
    expect(next.brush!.framebuf[0][0]).toEqual({ code: 65, color: 1 });
  });
});

describe('MIRROR_BRUSH', () => {
  it('toggles mirror X on the brush transform', () => {
    const state = defaultState();
    const next = reducer(state, Toolbar.actions.mirrorBrush(1)); // MIRROR_X
    expect(next.brushTransform.mirror).toBe(1);
    // Toggle again
    const next2 = reducer(next, Toolbar.actions.mirrorBrush(1));
    expect(next2.brushTransform.mirror).toBe(0);
  });

  it('toggles mirror Y on the brush transform', () => {
    const state = defaultState();
    const next = reducer(state, Toolbar.actions.mirrorBrush(2)); // MIRROR_Y
    expect(next.brushTransform.mirror).toBe(2);
  });
});

describe('ROTATE_BRUSH', () => {
  it('rotates brush transform by 90 degrees', () => {
    const state = defaultState();
    const r1 = reducer(state, Toolbar.actions.rotateBrush(-1));
    expect(r1.brushTransform.rotate).toBe(90);
    const r2 = reducer(r1, Toolbar.actions.rotateBrush(-1));
    expect(r2.brushTransform.rotate).toBe(180);
    const r3 = reducer(r2, Toolbar.actions.rotateBrush(-1));
    expect(r3.brushTransform.rotate).toBe(270);
    const r4 = reducer(r3, Toolbar.actions.rotateBrush(-1));
    expect(r4.brushTransform.rotate).toBe(0);
  });
});

describe('MIRROR_CHAR', () => {
  it('toggles mirror on the char transform', () => {
    const state = defaultState();
    const next = reducer(state, Toolbar.actions.mirrorChar(1));
    expect(next.charTransform.mirror).toBe(1);
  });
});

describe('ROTATE_CHAR', () => {
  it('rotates char transform', () => {
    const state = defaultState();
    const next = reducer(state, Toolbar.actions.rotateChar(-1));
    expect(next.charTransform.rotate).toBe(90);
  });
});

describe('CLEAR_MOD_KEY_STATE', () => {
  it('resets all modifier keys to false', () => {
    const state = {
      ...defaultState(),
      altKey: true,
      ctrlKey: true,
      shiftKey: true,
      metaKey: true,
      tabKey: true,
      capslockKey: true,
    };
    const next = reducer(state, Toolbar.actions.clearModKeyState());
    expect(next.altKey).toBe(false);
    expect(next.ctrlKey).toBe(false);
    expect(next.shiftKey).toBe(false);
    expect(next.metaKey).toBe(false);
    expect(next.tabKey).toBe(false);
    expect(next.capslockKey).toBe(false);
  });
});

describe('modifier key setters', () => {
  it('SET_SHIFT_KEY', () => {
    const next = reducer(defaultState(), Toolbar.actions.setShiftKey(true));
    expect(next.shiftKey).toBe(true);
  });

  it('SET_META_KEY', () => {
    const next = reducer(defaultState(), Toolbar.actions.setMetaKey(true));
    expect(next.metaKey).toBe(true);
  });

  it('SET_CTRL_KEY', () => {
    const next = reducer(defaultState(), Toolbar.actions.setCtrlKey(true));
    expect(next.ctrlKey).toBe(true);
  });

  it('SET_ALT_KEY', () => {
    const next = reducer(defaultState(), Toolbar.actions.setAltKey(true));
    expect(next.altKey).toBe(true);
  });

  it('SET_TAB_KEY', () => {
    const next = reducer(defaultState(), Toolbar.actions.setTabKey(true));
    expect(next.tabKey).toBe(true);
  });

  it('SET_SPACEBAR_KEY', () => {
    const next = reducer(defaultState(), Toolbar.actions.setSpacebarKey(true));
    expect(next.spacebarKey).toBe(true);
  });
});

describe('SET_FRAMEBUF_UI_STATE', () => {
  it('sets UI state for a specific framebuf index', () => {
    const state = defaultState();
    const uiState = {
      canvasTransform: { v: [[2,0,0],[0,2,0],[0,0,1]] as any },
      canvasFit: 'fitWidth' as const,
    };
    const next = reducer(state, Toolbar.actions.setFramebufUIState(0, uiState));
    expect(next.framebufUIState[0]).toEqual(uiState);
  });
});

describe('UI toggle setters', () => {
  it('SET_SHOW_SETTINGS', () => {
    const next = reducer(defaultState(), Toolbar.actions.setShowSettings(true));
    expect(next.showSettings).toBe(true);
  });

  it('SET_SHOW_RESIZESETTINGS', () => {
    const next = reducer(defaultState(), Toolbar.actions.setShowResizeSettings(true));
    expect(next.showResizeSettings).toBe(true);
  });

  it('SET_SHOW_CUSTOM_FONTS', () => {
    const next = reducer(defaultState(), Toolbar.actions.setShowCustomFonts(true));
    expect(next.showCustomFonts).toBe(true);
  });

  it('SET_SHOW_EXPORT', () => {
    const next = reducer(defaultState(), Toolbar.actions.setShowExport({ show: true, fmt: { name: 'pngFile', ext: 'png', description: 'PNG', commonExportParams: { selectedFramebufIndex: 0 } } }));
    expect(next.showExport.show).toBe(true);
  });

  it('SET_SHOW_IMPORT', () => {
    const next = reducer(defaultState(), Toolbar.actions.setShowImport({ show: true, fmt: { name: 'd64File', ext: 'd64', description: 'D64', commonExportParams: { selectedFramebufIndex: 0 } } }));
    expect(next.showImport.show).toBe(true);
  });

  it('SET_CANVAS_GRID', () => {
    const next = reducer(defaultState(), Toolbar.actions.setCanvasGrid(true));
    expect(next.canvasGrid).toBe(true);
  });

  it('SET_SHORTCUTS_ACTIVE', () => {
    const next = reducer(defaultState(), Toolbar.actions.setShortcutsActive(false));
    expect(next.shortcutsActive).toBe(false);
  });
});

describe('workspace and resize', () => {
  it('SET_WORKSPACE_FILENAME', () => {
    const next = reducer(defaultState(), Toolbar.actions.setWorkspaceFilename('/path/to/file.petmate'));
    expect(next.workspaceFilename).toBe('/path/to/file.petmate');
  });

  it('SET_RESIZEWIDTH / SET_RESIZEHEIGHT', () => {
    let state = defaultState();
    state = reducer(state, Toolbar.actions.setResizeWidth(80));
    state = reducer(state, Toolbar.actions.setResizeHeight(50));
    expect(state.resizeWidth).toBe(80);
    expect(state.resizeHeight).toBe(50);
  });

  it('SET_RESIZECROP', () => {
    const next = reducer(defaultState(), Toolbar.actions.setResizeCrop(false));
    expect(next.resizeCrop).toBe(false);
  });
});

describe('SET_NEW_SCREEN_SIZE', () => {
  it('updates the new screen size dimensions', () => {
    const next = reducer(defaultState(), Toolbar.actions.setNewScreenSize({ width: 22, height: 23 }));
    expect(next.newScreenSize).toEqual({ width: 22, height: 23 });
  });
});

describe('text cursor', () => {
  it('SET_TEXT_CURSOR_POS sets and clears cursor', () => {
    let state = defaultState();
    state = reducer(state, Toolbar.actions.setTextCursorPos({ row: 5, col: 10 }));
    expect(state.textCursorPos).toEqual({ row: 5, col: 10 });

    state = reducer(state, Toolbar.actions.setTextCursorPos(null));
    expect(state.textCursorPos).toBeNull();
  });
});

// Regression tests for J2 (Group J master task list): findReplaceExecute's
// matchPattern/applyReplace previously compared/updated raw `.code`/`.color`
// fields directly, which on VDC (c128vdc) frames misses ALTCHAR-only glyph
// differences and leaves the attribute byte's colour nibble stale on a
// color-only replace (the renderer prefers `.attr` once it's present, so an
// un-synced attr silently no-ops a "color only" replace).
describe('findReplaceExecute thunk (J2: VDC-aware matching/attr sync)', () => {
  const VDC_ATTR_ALTCHAR = 0x80;
  const VDC_ATTR_REVERSE = 0x40;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function makeState(overrides: any = {}) {
    return {
      toolbar: {
        ...defaultState(),
        findReplaceAllFrames: false,
        findReplaceMode: 'first',
        findReplaceReplaceWidth: 1,
        findReplaceReplaceHeight: 1,
        ...overrides,
      },
    } as any;
  }

  it('chars-only replace matches by effective glyph and carries over the ALTCHAR bank, preserving other attr flags', () => {
    // Destination cell: code=1, ALTCHAR+REVERSE set, color nibble 5 in attr.
    const destCell = { code: 1, color: 0, attr: VDC_ATTR_ALTCHAR | VDC_ATTR_REVERSE | 5 };
    // Find pattern: same effective glyph (code=1, ALTCHAR set) -- color is
    // irrelevant to a 'chars'-only match.
    const findPattern = [[{ code: 1, color: 0, attr: VDC_ATTR_ALTCHAR }]];
    // Replace pattern: different code, ALTCHAR unset (the other bank).
    const replacePattern = [[{ code: 9, color: 0, attr: 0 }]];
    const fb = { charset: 'c128vdc', width: 1, height: 1, framebuf: [[destCell]] };
    jest.spyOn(selectors, 'getFramebufByIndex').mockReturnValue(fb as any);
    jest.spyOn(screensSelectors, 'getCurrentScreenFramebufIndex').mockReturnValue(0);

    const state = makeState({
      findReplaceFind: findPattern,
      findReplaceReplace: replacePattern,
      findReplaceReplaceWhat: 'chars',
    });
    const dispatch = jest.fn();
    Toolbar.actions.findReplaceExecute()(dispatch as any, () => state);

    expect(dispatch).toHaveBeenCalledTimes(1);
    const newCell = dispatch.mock.calls[0][0].data.framebuf[0][0];
    expect(newCell.code).toBe(9);
    // ALTCHAR carried over from the replacement pattern (now unset)...
    expect(newCell.attr & VDC_ATTR_ALTCHAR).toBe(0);
    // ...but REVERSE and the colour nibble are preserved from the destination.
    expect(newCell.attr & VDC_ATTR_REVERSE).toBe(VDC_ATTR_REVERSE);
    expect(newCell.attr & 0x0f).toBe(5);
  });

  it('does not match cells with the same code but a different ALTCHAR bank', () => {
    const destCell = { code: 1, color: 0, attr: 0 }; // ALTCHAR unset
    const findPattern = [[{ code: 1, color: 0, attr: VDC_ATTR_ALTCHAR }]]; // ALTCHAR set
    const replacePattern = [[{ code: 9, color: 0 }]];
    const fb = { charset: 'c128vdc', width: 1, height: 1, framebuf: [[destCell]] };
    jest.spyOn(selectors, 'getFramebufByIndex').mockReturnValue(fb as any);
    jest.spyOn(screensSelectors, 'getCurrentScreenFramebufIndex').mockReturnValue(0);

    const state = makeState({
      findReplaceFind: findPattern,
      findReplaceReplace: replacePattern,
      findReplaceReplaceWhat: 'chars',
    });
    const dispatch = jest.fn();
    Toolbar.actions.findReplaceExecute()(dispatch as any, () => state);

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('color-only replace updates the VDC attr byte colour nibble, not just the legacy color field', () => {
    const destCell = { code: 1, color: 0, attr: 5 }; // colour nibble 5 lives in attr
    const findPattern = [[{ code: 0, color: 0, attr: 5 }]]; // matches dest's effective colour
    const replacePattern = [[{ code: 0, color: 9 }]]; // legacy color field only
    const fb = { charset: 'c128vdc', width: 1, height: 1, framebuf: [[destCell]] };
    jest.spyOn(selectors, 'getFramebufByIndex').mockReturnValue(fb as any);
    jest.spyOn(screensSelectors, 'getCurrentScreenFramebufIndex').mockReturnValue(0);

    const state = makeState({
      findReplaceFind: findPattern,
      findReplaceReplace: replacePattern,
      findReplaceReplaceWhat: 'color',
    });
    const dispatch = jest.fn();
    Toolbar.actions.findReplaceExecute()(dispatch as any, () => state);

    expect(dispatch).toHaveBeenCalledTimes(1);
    const newCell = dispatch.mock.calls[0][0].data.framebuf[0][0];
    expect(newCell.code).toBe(1); // code unchanged
    expect(newCell.attr & 0x0f).toBe(9); // colour nibble updated in attr
  });
});
