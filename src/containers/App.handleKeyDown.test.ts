// Regression tests for D1 + D2 (Group D master task list): AppView's
// document-level keydown listener used to call event.preventDefault() for
// Tab/Space whenever focus was not on an INPUT/TEXTAREA/SELECT -- globally,
// regardless of which element actually had focus, and even while a modal
// was open. That made it impossible to Tab between toolbar buttons, panel
// controls, or dialog fields, since every one of those keydowns had its
// default action suppressed before it could move focus.
//
// The fix scopes the interception to only fire while the main drawing
// canvas container (id="MainContainer", made focusable in Editor.tsx) is
// itself the keydown event's target, and only when no modal/dialog is
// open (`isModalOpen`). This preserves the intentional C64-keyboard
// mimicry (Tab ~= CTRL for color slots, Space = pan) while canvas-focused,
// without breaking keyboard navigation anywhere else.

jest.mock('../utils/electronImports', () => ({
  electron: {
    remote: {
      app: { getAppPath: () => '/mock', getPath: () => '/tmp', getVersion: () => '0.0.0', addRecentDocument: jest.fn() },
      getCurrentWindow: jest.fn(),
      process: { platform: 'darwin' },
      require: jest.fn(() => ({ extname: () => '', resolve: (...a: string[]) => a.join('/'), join: (...a: string[]) => a.join('/') })),
      dialog: {},
    },
    ipcRenderer: { send: jest.fn() },
    clipboard: { writeBuffer: jest.fn(), readBuffer: jest.fn(), readText: jest.fn(), has: jest.fn(), availableFormats: jest.fn() },
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

import { AppView } from './App';

function makeInstance(isModalOpen: boolean) {
  const Toolbar = { keyDown: jest.fn(), keyUp: jest.fn() } as any;
  const instance = new AppView({ Toolbar, isModalOpen, dispatch: jest.fn() as any });
  return { instance, Toolbar };
}

function fakeEvent(key: string, targetId: string | undefined): any {
  return {
    key,
    target: targetId === undefined ? {} : { id: targetId },
    preventDefault: jest.fn(),
  };
}

describe('AppView.handleKeyDown (D1 + D2)', () => {
  it('prevents default for Tab/Space when the canvas container has focus and no modal is open', () => {
    const { instance } = makeInstance(false);
    const tabEvent = fakeEvent('Tab', 'MainContainer');
    const spaceEvent = fakeEvent(' ', 'MainContainer');

    instance.handleKeyDown(tabEvent);
    instance.handleKeyDown(spaceEvent);

    expect(tabEvent.preventDefault).toHaveBeenCalled();
    expect(spaceEvent.preventDefault).toHaveBeenCalled();
  });

  it('does not prevent default for Tab/Space when focus is elsewhere (e.g. a toolbar button or dialog field)', () => {
    const { instance } = makeInstance(false);
    const tabEvent = fakeEvent('Tab', 'SomeToolbarButton');
    const spaceEvent = fakeEvent(' ', undefined);

    instance.handleKeyDown(tabEvent);
    instance.handleKeyDown(spaceEvent);

    expect(tabEvent.preventDefault).not.toHaveBeenCalled();
    expect(spaceEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('does not prevent default for Tab/Space while a modal is open, even if the canvas container is the target', () => {
    const { instance } = makeInstance(true);
    const tabEvent = fakeEvent('Tab', 'MainContainer');

    instance.handleKeyDown(tabEvent);

    expect(tabEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('never prevents default for keys other than Tab/Space, regardless of focus', () => {
    const { instance } = makeInstance(false);
    const event = fakeEvent('a', 'MainContainer');

    instance.handleKeyDown(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('always forwards the raw key to Toolbar.keyDown regardless of focus/modal state', () => {
    const { instance, Toolbar } = makeInstance(true);
    instance.handleKeyDown(fakeEvent('Tab', 'MainContainer'));
    expect(Toolbar.keyDown).toHaveBeenCalledWith('Tab');
  });
});
