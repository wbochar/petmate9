// Regression tests for D5 (Group D master task list): the toolbar's
// drawing-tool icon strip previously gave every icon tabIndex=0 (from the
// D3 fix), so Tab had to step through all 14 tool icons individually
// before reaching anything else in the toolbar -- the ARIA "toolbar"
// pattern instead expects exactly one Tab stop for the whole group, with
// Arrow keys moving focus between its items.
//
// ToolbarView now wraps the tool-icon strip in a role="toolbar"
// (aria-orientation="vertical", matching the strip's top-to-bottom layout)
// container. Only one icon (tracked by `toolFocusIndex` state) has
// tabIndex=0 at a time; ArrowDown/ArrowUp move focus to the next/previous
// icon (wrapping at the ends) and Home/End jump to the first/last icon.
// Focusing an icon directly (e.g. via mouse click) also updates
// toolFocusIndex, so Tab-out-and-back returns to the same icon.

jest.mock('../utils/electronImports', () => ({
  electron: {
    remote: {
      app: { getAppPath: () => '/mock' },
      getCurrentWindow: jest.fn(),
      process: { platform: 'darwin' },
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

import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, Root } from 'react-dom/client';

import { ToolbarView } from './Toolbar';
import { Tool } from '../redux/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function makeProps(): any {
  return {
    backgroundColor: 6,
    borderColor: 14,
    borderOn: false,
    width: 40,
    height: 25,
    charset: 'upper',
    framebufIndex: 0,
    selectedTool: Tool.Draw,
    paletteRemap: [],
    colorPalette: [],
    vic20colorPalette: [],
    petcolorPalette: [],
    tedcolorPalette: [],
    canvasFit: 'fitWidth',
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    guideLayerVisible: false,
    ultimateOnline: false,
    ultimateMachineType: null,
    ultimateMode: null,
    ultimateLastContactedAt: null,
    ultimateAddress: '',
    Framebuffer: { setBackgroundColor: jest.fn(), setBorderColor: jest.fn(), setBorderOn: jest.fn() },
    Toolbar: {
      setSelectedTool: jest.fn(),
      resizeDims: jest.fn(),
      setShowResizeSettings: jest.fn(),
      clearCanvas: jest.fn(),
      setGuideLayerVisible: jest.fn(),
      setAllBorder: jest.fn(),
      setAllBorderFlip: jest.fn(),
      setShowSettings: jest.fn(),
    },
    setFramebufCanvasFit: jest.fn(),
    undo: jest.fn(),
    redo: jest.fn(),
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

function renderToolbar() {
  act(() => {
    root.render(React.createElement(ToolbarView, makeProps()));
  });
  const group = container.querySelector('[role="toolbar"]') as HTMLElement;
  const items = Array.from(group.querySelectorAll('[role="button"]')) as HTMLElement[];
  return { group, items };
}

function fire(el: HTMLElement, key: string) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

// React 17+ listens for the (bubbling) 'focusin' event at the root to
// implement onFocus, not the native non-bubbling 'focus' event -- calling
// the real .focus() method is the simplest way to trigger that correctly
// in jsdom, and also matches how a real mouse click would focus an icon.
function focusItem(el: HTMLElement) {
  act(() => {
    el.focus();
  });
}

describe('Toolbar tool-icon group roving tabindex (D5)', () => {
  it('container is role=toolbar with vertical orientation, and only one item is a Tab stop', () => {
    const { group, items } = renderToolbar();
    expect(group.getAttribute('aria-orientation')).toBe('vertical');
    expect(items.length).toBeGreaterThan(1);
    const tabbable = items.filter((el) => el.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    expect(items[0].getAttribute('tabindex')).toBe('0');
  });

  it('ArrowDown moves the Tab stop to the next icon and focuses it', () => {
    const { group, items } = renderToolbar();
    focusItem(items[0]);
    fire(group, 'ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    expect(items[1].getAttribute('tabindex')).toBe('0');
    expect(items[0].getAttribute('tabindex')).toBe('-1');
  });

  it('ArrowUp from the first icon wraps to the last icon', () => {
    const { group, items } = renderToolbar();
    focusItem(items[0]);
    fire(group, 'ArrowUp');
    const last = items[items.length - 1];
    expect(document.activeElement).toBe(last);
    expect(last.getAttribute('tabindex')).toBe('0');
  });

  it('ArrowDown from the last icon wraps to the first icon', () => {
    const { group, items } = renderToolbar();
    const last = items[items.length - 1];
    focusItem(last);
    fire(group, 'ArrowDown');
    expect(document.activeElement).toBe(items[0]);
  });

  it('Home/End jump to the first/last icon', () => {
    const { group, items } = renderToolbar();
    focusItem(items[2]);
    fire(group, 'End');
    expect(document.activeElement).toBe(items[items.length - 1]);

    fire(group, 'Home');
    expect(document.activeElement).toBe(items[0]);
  });

  it('focusing an icon directly (e.g. mouse click) updates the roving Tab stop', () => {
    const { group, items } = renderToolbar();
    focusItem(items[3]);
    expect(items[3].getAttribute('tabindex')).toBe('0');
    expect(items[0].getAttribute('tabindex')).toBe('-1');

    // Subsequent ArrowDown should move relative to the newly-focused item.
    fire(group, 'ArrowDown');
    expect(document.activeElement).toBe(items[4]);
  });

  it('non-arrow keys are ignored by the group handler', () => {
    const { group, items } = renderToolbar();
    focusItem(items[0]);
    fire(group, 'a');
    expect(document.activeElement).toBe(items[0]);
  });
});
