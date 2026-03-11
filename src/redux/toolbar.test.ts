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
