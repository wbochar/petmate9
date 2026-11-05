// Regression tests for B8 (Group B master task list): Root.actions.undo/redo
// previously *unconditionally* reapplied setBorderOn after every undo/redo
// step (to compensate for borderOn being excluded from undo history -- see
// framebufList.ts's excludeAction filter). Since setBorderOn always
// produces a brand-new Framebuf object (updateField's unconditional
// spread), this broke reference equality with `lastSavedSnapshot` even when
// borderOn hadn't actually changed, falsely marking the document dirty
// immediately after an otherwise-clean undo.

jest.mock('../utils/electronImports', () => ({
  electron: {
    remote: { app: { getAppPath: () => '/mock' }, getCurrentWindow: jest.fn() },
    ipcRenderer: { send: jest.fn() },
    clipboard: { has: jest.fn(() => false), readBuffer: jest.fn(), writeBuffer: jest.fn() },
  },
  fs: { readFileSync: () => Buffer.alloc(2048), writeFileSync: jest.fn(), existsSync: () => false },
  path: { resolve: (...a: string[]) => a.join('/'), join: (...a: string[]) => a.join('/'), extname: (f: string) => '' },
  buffer: {},
  app: {},
}));

jest.mock('./brush', () => ({
  findTransformedChar: jest.fn((font: any, code: number) => code),
  findInverseChar: jest.fn((font: any, code: number) => code),
  mirrorBrush: jest.fn(),
}));

import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import rootReducer from '../reducers/index';
import { actions as screensActions } from './screens';
import { actions as rootActions } from './root';
import { Framebuffer } from './editor';
import * as screensSelectors from './screensSelectors';
import * as selectors from './selectors';
import { RootState } from './types';

function makeStore() {
  return createStore(rootReducer as any, applyMiddleware(thunk)) as any as {
    dispatch: (action: any) => any;
    getState: () => RootState;
  };
}

describe('Root.actions.undo/redo -- borderOn reapplication', () => {
  it('preserves present object identity across undo when borderOn is unchanged', () => {
    const store = makeStore();
    store.dispatch(screensActions.newScreen());
    const fbIdx = screensSelectors.getCurrentScreenFramebufIndex(store.getState())!;

    // newScreen() itself dispatches some filtered (SET_ZOOM) actions as part
    // of screen setup, which redux-undo intentionally keeps out of the
    // "last unfiltered state" tracking it uses when later pushing a new
    // history entry. Make one tracked (unfiltered) edit first so the
    // reference we snapshot below is unambiguously the one that'll be
    // pushed onto the undo stack by the *next* tracked edit.
    store.dispatch(Framebuffer.actions.setPixel({ row: 0, col: 0, screencode: 1, color: 1 }, 1, fbIdx));

    // Snapshot "last saved" state -- this captures the exact object
    // reference currently at framebufList[fbIdx].present.
    store.dispatch(rootActions.updateLastSavedSnapshot());
    const savedPresent = store.getState().framebufList[fbIdx].present;

    // Make another tracked edit, in a new undo group (pushes `savedPresent`
    // onto the undo stack).
    store.dispatch(Framebuffer.actions.setPixel({ row: 0, col: 1, screencode: 2, color: 2 }, 2, fbIdx));
    expect(selectors.anyUnsavedChangesInFramebuf(store.getState(), fbIdx)).toBe(true);

    // Undo back to the saved state.
    store.dispatch(rootActions.undo());

    const afterUndo = store.getState().framebufList[fbIdx].present;
    // The whole point of the fix: undo must restore the *exact* object
    // reference that was saved, not a new (even if deeply-equal) object.
    expect(afterUndo).toBe(savedPresent);
    expect(selectors.anyUnsavedChangesInFramebuf(store.getState(), fbIdx)).toBe(false);
  });

  it('still restores borderOn correctly after undo when it actually changed outside the undo stack', () => {
    const store = makeStore();
    store.dispatch(screensActions.newScreen());
    const fbIdx = screensSelectors.getCurrentScreenFramebufIndex(store.getState())!;

    const borderOnBeforeToggle = store.getState().framebufList[fbIdx].present.borderOn;

    // One tracked edit to have something to undo back to.
    store.dispatch(Framebuffer.actions.setPixel({ row: 0, col: 0, screencode: 1, color: 1 }, 1, fbIdx));

    // Toggle borderOn -- excluded from undo history, so this doesn't touch
    // the undo stack, but it does change the *current* present's borderOn.
    store.dispatch(Framebuffer.actions.setBorderOn(!borderOnBeforeToggle, fbIdx));
    expect(store.getState().framebufList[fbIdx].present.borderOn).toBe(!borderOnBeforeToggle);

    // Undo the pixel edit. Without the explicit borderOn-preserve logic,
    // this would also revert borderOn back to whatever the undone-to past
    // entry had stored (borderOnBeforeToggle's original value at the time
    // of that entry) -- but the contract is that explicit border toggles
    // are NOT part of the undo stack, so the *current* borderOn should
    // survive the undo of an unrelated pixel edit.
    store.dispatch(rootActions.undo());

    expect(store.getState().framebufList[fbIdx].present.borderOn).toBe(!borderOnBeforeToggle);
  });

  it('preserves present object identity across redo when borderOn is unchanged', () => {
    const store = makeStore();
    store.dispatch(screensActions.newScreen());
    const fbIdx = screensSelectors.getCurrentScreenFramebufIndex(store.getState())!;

    // First tracked edit establishes a clean "last unfiltered" baseline
    // (see the comment in the previous test).
    store.dispatch(Framebuffer.actions.setPixel({ row: 0, col: 0, screencode: 1, color: 1 }, 1, fbIdx));
    // Second tracked edit (new group) is the one we'll undo then redo.
    store.dispatch(Framebuffer.actions.setPixel({ row: 0, col: 1, screencode: 2, color: 2 }, 2, fbIdx));
    const editedPresent = store.getState().framebufList[fbIdx].present;

    store.dispatch(rootActions.undo());
    store.dispatch(rootActions.redo());

    const afterRedo = store.getState().framebufList[fbIdx].present;
    expect(afterRedo).toBe(editedPresent);
  });
});
