// Regression tests for B7 (Group B master task list): clipboard paste now
// validates the pasted shape and restores embedded custom fonts, via the
// shared `pasteFramebufferFromClipboard` thunk used by both the Ctrl+V
// shortcut (toolbar.ts's pasteFrame) and the tab context menu's Paste
// (FramebufferTabs.tsx's handlePasteTab).
//
// This exercises the real combined reducer (createStore + redux-thunk) so
// the nested `addScreenPlusFramebuf` thunk's getState()-dependent logic is
// covered faithfully, rather than hand-rolling a fake dispatch/getState.

const mockClipboardHas = jest.fn();
const mockClipboardReadBuffer = jest.fn();

jest.mock('../utils/electronImports', () => ({
  electron: {
    remote: { app: { getAppPath: () => '/mock' }, getCurrentWindow: jest.fn() },
    ipcRenderer: { send: jest.fn() },
    clipboard: {
      has: (...args: any[]) => mockClipboardHas(...args),
      readBuffer: (...args: any[]) => mockClipboardReadBuffer(...args),
      writeBuffer: jest.fn(),
    },
  },
  fs: { readFileSync: () => Buffer.alloc(2048), writeFileSync: jest.fn(), existsSync: () => false },
  path: { resolve: (...a: string[]) => a.join('/'), join: (...a: string[]) => a.join('/'), extname: (f: string) => '' },
  buffer: {},
  app: {},
}));

// Break the toolbar <-> brush circular dependency, same as screens.test.ts.
jest.mock('./brush', () => ({
  findTransformedChar: jest.fn((font: any, code: number) => code),
  findInverseChar: jest.fn((font: any, code: number) => code),
  mirrorBrush: jest.fn(),
}));

import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import rootReducer from '../reducers/index';
import { actions as screensActions } from './screens';
import { RootState } from './types';

function makeStore() {
  return createStore(rootReducer as any, applyMiddleware(thunk)) as any as {
    dispatch: (action: any) => any;
    getState: () => RootState;
  };
}

function mkFramebufWithFont(overrides: Partial<any> = {}) {
  const width = 2;
  const height = 1;
  return {
    width,
    height,
    backgroundColor: 6,
    borderColor: 14,
    borderOn: true,
    charset: 'upper',
    name: 'pasted',
    framebuf: [[{ code: 1, color: 1 }, { code: 2, color: 2 }]],
    font: { bits: [], charOrder: [] },
    ...overrides,
  };
}

function setClipboard(payload: any) {
  mockClipboardHas.mockReturnValue(true);
  mockClipboardReadBuffer.mockReturnValue(Buffer.from(JSON.stringify(payload), 'utf-8'));
}

describe('pasteFramebufferFromClipboard', () => {
  let alertSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockClipboardHas.mockReset();
    mockClipboardReadBuffer.mockReset();
    alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('does nothing when the clipboard has no petmate/framebuffer data', () => {
    mockClipboardHas.mockReturnValue(false);
    const store = makeStore();
    const screensBefore = store.getState().screens.list.length;
    store.dispatch(screensActions.pasteFramebufferFromClipboard(0));
    expect(store.getState().screens.list.length).toBe(screensBefore);
  });

  it('rejects malformed clipboard JSON without touching state', () => {
    mockClipboardHas.mockReturnValue(true);
    mockClipboardReadBuffer.mockReturnValue(Buffer.from('{not valid json', 'utf-8'));
    const store = makeStore();
    const screensBefore = store.getState().screens.list.length;
    store.dispatch(screensActions.pasteFramebufferFromClipboard(0));
    expect(store.getState().screens.list.length).toBe(screensBefore);
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to paste'));
  });

  it('rejects a well-formed-JSON payload whose framebuf shape is invalid', () => {
    setClipboard({ version: 1, framebufs: { width: 4, height: 4, framebuf: [] } });
    const store = makeStore();
    const screensBefore = store.getState().screens.list.length;
    store.dispatch(screensActions.pasteFramebufferFromClipboard(0));
    expect(store.getState().screens.list.length).toBe(screensBefore);
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to paste'));
  });

  it('pastes a valid framebuf as a new screen', () => {
    const store = makeStore();
    // Start with one real screen so sourceFramebufIndex=0 is meaningful.
    store.dispatch(screensActions.newScreen());
    const screensBefore = store.getState().screens.list.length;

    setClipboard({ version: 1, framebufs: mkFramebufWithFont(), charsets: {} });
    store.dispatch(screensActions.pasteFramebufferFromClipboard(0));

    const state = store.getState();
    expect(state.screens.list.length).toBe(screensBefore + 1);
    expect(alertSpy).not.toHaveBeenCalled();
    const newFbIdx = state.screens.list[state.screens.current];
    expect(state.framebufList[newFbIdx].present.width).toBe(2);
    expect(state.framebufList[newFbIdx].present.framebuf[0][0].code).toBe(1);
  });

  it('restores an embedded custom font not already present in customFonts', () => {
    const store = makeStore();
    store.dispatch(screensActions.newScreen());

    setClipboard({
      version: 1,
      framebufs: mkFramebufWithFont({ charset: 'myCustomFont' }),
      charsets: {
        myCustomFont: { name: 'My Custom Font', bits: [1, 2, 3], charOrder: [5, 6, 7] },
      },
    });
    store.dispatch(screensActions.pasteFramebufferFromClipboard(0));

    const state = store.getState();
    expect(state.customFonts['myCustomFont']).toEqual({
      name: 'My Custom Font',
      font: { bits: [1, 2, 3], charOrder: [5, 6, 7] },
    });
  });

  it('falls back to an identity charOrder for fonts copied before charOrder was embedded', () => {
    const store = makeStore();
    store.dispatch(screensActions.newScreen());

    setClipboard({
      version: 1,
      framebufs: mkFramebufWithFont({ charset: 'legacyFont' }),
      charsets: {
        legacyFont: { name: 'Legacy Font', bits: [9, 9] }, // no charOrder
      },
    });
    store.dispatch(screensActions.pasteFramebufferFromClipboard(0));

    const state = store.getState();
    expect(state.customFonts['legacyFont'].font.bits).toEqual([9, 9]);
    expect(state.customFonts['legacyFont'].font.charOrder).toEqual(
      Array.from({ length: 256 }, (_, i) => i),
    );
  });

  it('does not overwrite an already-registered custom font with the same id', () => {
    const store = makeStore();
    store.dispatch(screensActions.newScreen());

    setClipboard({
      version: 1,
      framebufs: mkFramebufWithFont({ charset: 'upper' }), // built-in, no font restore needed for this part
      charsets: {
        existingFont: { name: 'Should Not Apply', bits: [0], charOrder: [0] },
      },
    });
    // Pre-register a font under the same id with different data.
    store.dispatch({ type: 'ADD_CUSTOM_FONT', data: { id: 'existingFont', name: 'Original', font: { bits: [42], charOrder: [42] } } });
    store.dispatch(screensActions.pasteFramebufferFromClipboard(0));

    const state = store.getState();
    expect(state.customFonts['existingFont'].name).toBe('Original');
    expect(state.customFonts['existingFont'].font.bits).toEqual([42]);
  });
});
