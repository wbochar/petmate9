// Regression test for B13 (Group B master task list): newScreen()'s
// Framebuffer.actions.setFields call spread `...zoom` (a {zoomLevel,
// alignment} object) directly onto the Framebuf root instead of assigning
// it to the Framebuf's nested `zoom` field, leaving stray top-level
// `zoomLevel`/`alignment` properties (which the Framebuf type doesn't even
// declare) on the object instead of a correctly-shaped `zoom` field.

jest.mock('../utils/electronImports', () => ({
  electron: { remote: { app: { getAppPath: () => '/mock' }, getCurrentWindow: jest.fn() }, ipcRenderer: { send: jest.fn() } },
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
import * as screensSelectors from './screensSelectors';
import { RootState } from './types';

function makeStore() {
  return createStore(rootReducer as any, applyMiddleware(thunk)) as any as {
    dispatch: (action: any) => any;
    getState: () => RootState;
  };
}

describe('newScreen() zoom field assignment (B13)', () => {
  it('does not leave stray top-level zoomLevel/alignment properties on the Framebuf', () => {
    const store = makeStore();
    store.dispatch(screensActions.newScreen());

    const fbIdx = screensSelectors.getCurrentScreenFramebufIndex(store.getState())!;
    const framebuf = store.getState().framebufList[fbIdx].present as any;

    expect(framebuf.zoomLevel).toBeUndefined();
    expect(framebuf.alignment).toBeUndefined();
  });

  it('sets a well-formed nested zoom field', () => {
    const store = makeStore();
    store.dispatch(screensActions.newScreen());

    const fbIdx = screensSelectors.getCurrentScreenFramebufIndex(store.getState())!;
    const framebuf = store.getState().framebufList[fbIdx].present;

    expect(framebuf.zoom).toBeDefined();
    expect(typeof framebuf.zoom.zoomLevel).toBe('number');
    expect(typeof framebuf.zoom.alignment).toBe('string');
  });
});
