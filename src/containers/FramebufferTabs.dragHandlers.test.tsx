// Regression tests for C4 (Group C master task list): FramebufferTabs_'s
// render() previously passed a brand-new arrow function per tab, per render,
// for onDragStartTab/onDragOverTab/onDropTab (e.g. `(e) =>
// this.handleTabDragStart(i, e)`). Since FramebufTab is a PureComponent,
// those ever-changing function references broke its shallow prop comparison
// -- every tab in the strip re-rendered on every parent render (e.g. every
// pixel edit on the active screen), not just the tab whose own data actually
// changed. This test instantiates FramebufferTabs_ directly (bypassing
// react-redux/ReactDOM) and inspects the React element tree render()
// returns, to verify the per-tab drag handlers are now stable across
// renders.

jest.mock('../utils/electronImports', () => ({
  electron: {
    remote: { app: { getAppPath: () => '/mock' }, getCurrentWindow: jest.fn() },
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

import { FramebufferTabs_ } from './FramebufferTabs';
import { Framebuf } from '../redux/types';

function makeFramebuf(): Framebuf {
  return {
    width: 4,
    height: 2,
    backgroundColor: 6,
    borderColor: 14,
    borderOn: false,
    charset: 'upper',
    name: 'test',
    framebuf: [
      [{ code: 32, color: 14 }, { code: 32, color: 14 }, { code: 32, color: 14 }, { code: 32, color: 14 }],
      [{ code: 32, color: 14 }, { code: 32, color: 14 }, { code: 32, color: 14 }, { code: 32, color: 14 }],
    ],
    zoom: { zoomLevel: 1, alignment: 'left' },
    zoomReady: false,
  };
}

function makeInstance(screens: number[]): FramebufferTabs_ {
  const props: any = {
    screens,
    activeScreen: 0,
    colorPalette: [],
    vic20colorPalette: [],
    petcolorPalette: [],
    tedcolorPalette: [],
    newScreenSize: { width: 40, height: 25 },
    customFonts: {},
    getFramebufByIndex: (_id: number) => makeFramebuf(),
    getFont: (fb: any) => ({ charset: fb.charset, font: { bits: [], charOrder: [] } }),
    setFramebufName: jest.fn(),
    Screens: {} as any,
    Toolbar: { setCtrlKey: jest.fn() } as any,
  };
  return new FramebufferTabs_(props);
}

// Recursively walk a React element tree (as returned directly by a class
// component's render(), without ReactDOM) looking for FramebufTab elements
// -- identified by having a `framebufId` prop, which is unique to how
// FramebufferTabs_ renders its tabs. Robust against incidental changes to
// the surrounding wrapper markup.
function collectFramebufTabElements(node: any, out: any[] = []): any[] {
  if (node === null || node === undefined || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((n) => collectFramebufTabElements(n, out));
    return out;
  }
  if (node.props && Object.prototype.hasOwnProperty.call(node.props, 'framebufId')) {
    out.push(node);
  }
  if (node.props && node.props.children !== undefined) {
    collectFramebufTabElements(node.props.children, out);
  }
  return out;
}

describe('FramebufferTabs_ per-tab drag-handler memoization (C4)', () => {
  it('reuses the same drag-handler function references for the same tab index across renders', () => {
    const instance = makeInstance([10, 20, 30]);
    const tabs1 = collectFramebufTabElements(instance.render());
    const tabs2 = collectFramebufTabElements(instance.render());

    expect(tabs1).toHaveLength(3);
    expect(tabs2).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(tabs2[i].props.onDragStartTab).toBe(tabs1[i].props.onDragStartTab);
      expect(tabs2[i].props.onDragOverTab).toBe(tabs1[i].props.onDragOverTab);
      expect(tabs2[i].props.onDropTab).toBe(tabs1[i].props.onDropTab);
    }
  });

  it('gives distinct tabs distinct handlers that still invoke with the correct tab index', () => {
    const instance = makeInstance([10, 20, 30]);
    const tabs = collectFramebufTabElements(instance.render());

    // Different tabs must not accidentally share the exact same handler.
    expect(tabs[0].props.onDragStartTab).not.toBe(tabs[1].props.onDragStartTab);

    const spy = jest.spyOn(instance as any, 'handleTabDragStart');
    const fakeEvent: any = {
      stopPropagation: jest.fn(),
      dataTransfer: { effectAllowed: '', setData: jest.fn() },
    };

    tabs[1].props.onDragStartTab(fakeEvent);
    expect(spy).toHaveBeenCalledWith(1, fakeEvent);

    tabs[0].props.onDragStartTab(fakeEvent);
    expect(spy).toHaveBeenCalledWith(0, fakeEvent);
  });
});
