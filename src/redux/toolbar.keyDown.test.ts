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

import { Toolbar, isModalOpen } from './toolbar';
import { Tool, Toolbar as IToolbar } from './types';
import * as screensSelectors from './screensSelectors';
import * as selectors from './selectors';
import { buildDefaultKeybindings } from '../keybindings/registry';

const reducer = Toolbar.reducer;

function defaultState(): IToolbar {
  return reducer(undefined, { type: '@@INIT' } as any);
}

function makeState(toolbarOverrides: any = {}, keybindingOverrides: Record<string, string> = {}) {
  return {
    toolbar: {
      ...defaultState(),
      shortcutsActive: true,
      selectedPaletteRemap: 0,
      ...toolbarOverrides,
    },
    settings: {
      saved: {
        // Minimal palette data so Toolbar.actions.setColor's internal thunk
        // (reads the active palette remap before dispatching SET_COLOR) has
        // something to resolve against.
        palettes: [Array.from({ length: 16 }, (_, i) => i)],
        keybindings: { ...buildDefaultKeybindings('darwin'), ...keybindingOverrides },
      },
    },
  } as any;
}

function fire(
  key: string,
  mods: Partial<{ shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean; tabKey: boolean }>,
  state: any
) {
  const dispatch = jest.fn();
  const s = { ...state, toolbar: { ...state.toolbar, ...mods } };
  Toolbar.actions.keyDown(key)(dispatch as any, () => s);
  return dispatch;
}

beforeEach(() => {
  // No current framebuf by default -- irrelevant to the shortcuts under test
  // and keeps state setup minimal.
  jest.spyOn(screensSelectors, 'getCurrentScreenFramebufIndex').mockReturnValue(null);
  jest.spyOn(selectors, 'getCurrentFramebuf').mockReturnValue(undefined);
});

/** `Toolbar.actions.setColor(slot)` is itself a thunk (it reads the active
 *  palette remap from state before dispatching SET_COLOR), so keyDown's
 *  outer `dispatch` only ever receives that thunk function. Invoke it with
 *  a throwaway inner dispatch to observe the resulting SET_COLOR action. */
function resolveSetColorSlot(outerDispatch: jest.Mock, state: any): number | undefined {
  const thunkCalls = outerDispatch.mock.calls.map(c => c[0]).filter(a => typeof a === 'function');
  for (const thunk of thunkCalls) {
    const innerDispatch = jest.fn();
    thunk(innerDispatch, () => state);
    const call = innerDispatch.mock.calls.find(c => c[0]?.type === 'Toolbar/SET_COLOR');
    if (call) return call[0].data.slot;
  }
  return undefined;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('isModalOpen (D2)', () => {
  it('is false when no dialog flags are set', () => {
    expect(isModalOpen(makeState())).toBe(false);
  });

  it.each([
    ['showExport', { showExport: { show: true } }],
    ['showImport', { showImport: { show: true } }],
    ['showImportSeqAdv', { showImportSeqAdv: { show: true } }],
    ['showSettings', { showSettings: true }],
    ['showResizeSettings', { showResizeSettings: true }],
    ['showCustomFonts', { showCustomFonts: true }],
    ['presetDialog', { presetDialog: { show: true } }],
  ] as [string, any][])('is true when %s is open', (_name, override) => {
    expect(isModalOpen(makeState(override))).toBe(true);
  });
});

describe('keyDown: global guards', () => {
  it('does nothing when shortcuts are inactive', () => {
    const dispatch = fire('x', {}, makeState({ shortcutsActive: false }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('while a modal is open, Escape closes it and no other key dispatches anything', () => {
    const state = makeState({ showSettings: true });
    const escDispatch = fire('Escape', {}, state);
    expect(escDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'Toolbar/SET_SHOW_SETTINGS', data: false }));

    const otherDispatch = fire('x', {}, state);
    expect(otherDispatch).not.toHaveBeenCalled();
  });
});

describe('keyDown: tool switching (default keymap)', () => {
  const cases: [string, Tool][] = [
    ['x', Tool.Draw],
    ['c', Tool.Colorize],
    ['0', Tool.CharDraw],
    ['9', Tool.RvsPen],
    ['b', Tool.Brush],
    ['t', Tool.Text],
    ['z', Tool.PanZoom],
  ];
  it.each(cases)('%s selects the expected tool', (key, tool) => {
    const dispatch = fire(key, {}, makeState());
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'Toolbar/SET_SELECTED_TOOL', data: tool }));
  });

  it('does not switch tools while actively typing with the Text tool', () => {
    const dispatch = fire('x', {}, makeState({ selectedTool: Tool.Text, textCursorPos: { row: 0, col: 0 } }));
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'Toolbar/SET_SELECTED_TOOL' }));
  });
});

describe('keyDown: color and navigation shortcuts (default keymap)', () => {
  it('q/e dispatch nextColor', () => {
    expect(fire('q', {}, makeState()).mock.calls[0][0]).toEqual(expect.any(Function));
    expect(fire('e', {}, makeState()).mock.calls[0][0]).toEqual(expect.any(Function));
  });

  it('g toggles guide layer visibility', () => {
    const dispatch = fire('g', {}, makeState({ guideLayerVisible: false }));
    // keyDown dispatches a thunk for the guide toggle; invoke it to observe the action.
    const thunk = dispatch.mock.calls[0][0];
    const innerDispatch = jest.fn();
    thunk(innerDispatch, () => makeState({ guideLayerVisible: false }));
    expect(innerDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'Toolbar/SET_GUIDE_LAYER_VISIBLE', data: true }));
  });

  it('ArrowLeft/ArrowRight dispatch screen navigation', () => {
    const left = fire('ArrowLeft', {}, makeState());
    const right = fire('ArrowRight', {}, makeState());
    expect(left).toHaveBeenCalled();
    expect(right).toHaveBeenCalled();
  });
});

describe('keyDown: color slot shortcuts (default keymap)', () => {
  it('Alt+1..Alt+8 set color slots 0-7', () => {
    for (let i = 0; i < 8; i++) {
      const state = makeState();
      const dispatch = fire(String(i + 1), { altKey: true }, state);
      expect(resolveSetColorSlot(dispatch, state)).toBe(i);
    }
  });

  it('Tab+1 is a legacy synonym for Alt+1 while the binding is still default', () => {
    const state = makeState();
    const dispatch = fire('1', { tabKey: true }, state);
    expect(resolveSetColorSlot(dispatch, state)).toBe(0);
  });

  it('Tab+1 synonym stops applying once tool.colorSlot0 is remapped away from Alt+1', () => {
    const dispatch = fire('1', { tabKey: true }, makeState({}, { 'tool.colorSlot0': 'Alt+9' }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('Ctrl+1..Ctrl+8 set color slots 8-15', () => {
    for (let i = 0; i < 8; i++) {
      const state = makeState();
      const dispatch = fire(String(i + 1), { ctrlKey: true }, state);
      expect(resolveSetColorSlot(dispatch, state)).toBe(8 + i);
    }
  });

  it('extra modifiers (e.g. Shift+Alt+1) no longer match the default binding', () => {
    const state = makeState();
    const dispatch = fire('1', { altKey: true, shiftKey: true }, state);
    expect(resolveSetColorSlot(dispatch, state)).toBeUndefined();
  });
});

describe('keyDown: clipboard shortcuts (default keymap)', () => {
  it('Ctrl+A selects all and switches to Brush', () => {
    const dispatch = fire('a', { ctrlKey: true }, makeState());
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'Toolbar/SET_SELECTED_TOOL', data: Tool.Brush }));
  });

  it('Ctrl+V pastes a frame outside text input', () => {
    const dispatch = fire('v', { ctrlKey: true }, makeState());
    expect(dispatch).toHaveBeenCalled();
  });

  it('Ctrl+C copies the frame; Ctrl+Shift+C copies as PNG', () => {
    const copyDispatch = fire('c', { ctrlKey: true }, makeState());
    expect(copyDispatch).toHaveBeenCalled();
    const copyPngDispatch = fire('c', { ctrlKey: true, shiftKey: true }, makeState());
    expect(copyPngDispatch).toHaveBeenCalled();
  });
});

describe('keyDown: character picker / mirror / invert / rotate (default keymap, Draw tool)', () => {
  it('a/d/s/w move the character picker', () => {
    expect(fire('a', {}, makeState({ selectedTool: Tool.Draw }))).toHaveBeenCalled();
    expect(fire('d', {}, makeState({ selectedTool: Tool.Draw }))).toHaveBeenCalled();
    expect(fire('s', {}, makeState({ selectedTool: Tool.Draw }))).toHaveBeenCalled();
    expect(fire('w', {}, makeState({ selectedTool: Tool.Draw }))).toHaveBeenCalled();
  });

  it('v/h mirror the selected character', () => {
    expect(fire('v', {}, makeState({ selectedTool: Tool.Draw }))).toHaveBeenCalled();
    expect(fire('h', {}, makeState({ selectedTool: Tool.Draw }))).toHaveBeenCalled();
  });

  it('f inverts the selected character', () => {
    expect(fire('f', {}, makeState({ selectedTool: Tool.Draw }))).toHaveBeenCalled();
  });

  it('r rotates the brush when the Brush tool is active', () => {
    expect(fire('r', {}, makeState({ selectedTool: Tool.Brush }))).toHaveBeenCalled();
  });

  it('does not fire while the Text tool is selected', () => {
    const dispatch = fire('a', {}, makeState({ selectedTool: Tool.Text }));
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('keyDown: remapping', () => {
  it('a tool switch action responds to its remapped key instead of the default', () => {
    const state = makeState({}, { 'tool.selectDraw': 'Y' });
    expect(fire('x', {}, state)).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'Toolbar/SET_SELECTED_TOOL', data: Tool.Draw }));
    expect(fire('y', {}, state)).toHaveBeenCalledWith(expect.objectContaining({ type: 'Toolbar/SET_SELECTED_TOOL', data: Tool.Draw }));
  });
});
