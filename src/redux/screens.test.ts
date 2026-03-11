// Mock modules that screens.ts transitively imports via toolbar/utils
jest.mock('../utils/electronImports', () => ({
  electron: { remote: { app: { getAppPath: () => '/mock' }, getCurrentWindow: jest.fn() }, ipcRenderer: { send: jest.fn() } },
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

import { reducer, actions } from './screens';
import { Screens } from './types';

function defaultState(): Screens {
  return reducer(undefined, { type: '@@INIT' } as any);
}

describe('screens reducer default state', () => {
  it('starts with an empty list and current=0', () => {
    const state = defaultState();
    expect(state.current).toBe(0);
    expect(state.list).toEqual([]);
  });
});

describe('ADD_SCREEN', () => {
  it('inserts a framebuf id after the given index', () => {
    const state: Screens = { current: 0, list: [0, 1, 2] };
    const next = reducer(state, actions.addScreen(99, 1));
    expect(next.list).toEqual([0, 1, 99, 2]);
  });

  it('inserts at the beginning when insertAfterIndex is -1', () => {
    const state: Screens = { current: 0, list: [0, 1] };
    const next = reducer(state, actions.addScreen(99, -1));
    expect(next.list).toEqual([99, 0, 1]);
  });

  it('appends when insertAfterIndex is last index', () => {
    const state: Screens = { current: 0, list: [0, 1] };
    const next = reducer(state, actions.addScreen(99, 1));
    expect(next.list).toEqual([0, 1, 99]);
  });
});

describe('REMOVE_SCREEN', () => {
  it('removes the screen at the given index', () => {
    const state: Screens = { current: 0, list: [0, 1, 2] };
    const next = reducer(state, actions.removeScreenAction(1));
    expect(next.list).toEqual([0, 2]);
  });

  it('removes the first screen', () => {
    const state: Screens = { current: 0, list: [0, 1, 2] };
    const next = reducer(state, actions.removeScreenAction(0));
    expect(next.list).toEqual([1, 2]);
  });

  it('removes the last screen', () => {
    const state: Screens = { current: 0, list: [0, 1, 2] };
    const next = reducer(state, actions.removeScreenAction(2));
    expect(next.list).toEqual([0, 1]);
  });
});

describe('SET_CURRENT_SCREEN_INDEX', () => {
  it('updates the current screen index', () => {
    const state: Screens = { current: 0, list: [0, 1, 2] };
    const next = reducer(state, actions.setCurrentScreenIndex(2));
    expect(next.current).toBe(2);
  });
});

describe('NEXT_SCREEN', () => {
  it('advances to the next screen', () => {
    const state: Screens = { current: 0, list: [0, 1, 2] };
    const next = reducer(state, actions.nextScreen(1));
    expect(next.current).toBe(1);
  });

  it('goes back to the previous screen', () => {
    const state: Screens = { current: 2, list: [0, 1, 2] };
    const next = reducer(state, actions.nextScreen(-1));
    expect(next.current).toBe(1);
  });

  it('clamps at the last screen', () => {
    const state: Screens = { current: 2, list: [0, 1, 2] };
    const next = reducer(state, actions.nextScreen(1));
    expect(next.current).toBe(2);
  });

  it('clamps at the first screen', () => {
    const state: Screens = { current: 0, list: [0, 1, 2] };
    const next = reducer(state, actions.nextScreen(-1));
    expect(next.current).toBe(0);
  });
});

describe('SET_SCREEN_ORDER', () => {
  it('reorders screens and updates current to follow the same framebuf', () => {
    // current=1 points to framebuf id 1. After reorder [2,1,0], framebuf 1 is at index 1.
    const state: Screens = { current: 1, list: [0, 1, 2] };
    const next = reducer(state, actions.setScreenOrder([2, 1, 0]));
    expect(next.list).toEqual([2, 1, 0]);
    expect(next.current).toBe(1); // framebuf 1 is still at index 1
  });

  it('tracks the current framebuf across a swap', () => {
    // current=0 points to framebuf 0. After reorder [2,0,1], framebuf 0 is at index 1.
    const state: Screens = { current: 0, list: [0, 1, 2] };
    const next = reducer(state, actions.setScreenOrder([2, 0, 1]));
    expect(next.list).toEqual([2, 0, 1]);
    expect(next.current).toBe(1);
  });
});
