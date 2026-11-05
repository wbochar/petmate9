// Regression tests for D3 (Group D master task list): the toolbar's
// tool-icon controls (tool selection, Crop/Resize, Clear canvas, Guide
// Layer toggle, Border On/Off toggle, Preferences) were plain
// `<div onClick>` elements with no way to reach or activate them via
// keyboard. Icon now renders as a focusable, labelled, keyboard-operable
// control: role="button", tabIndex={0}, aria-label from the tooltip text,
// aria-pressed for toggle-style icons, and Enter activates it (Space is
// intentionally left alone -- it is reserved for canvas panning).

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

import { Icon } from './Toolbar';
import { faCog } from '@fortawesome/free-solid-svg-icons';

function makeInstance(overrides: Record<string, any> = {}) {
  const onIconClick = jest.fn();
  const props: any = {
    tooltip: 'Preferences',
    iconName: faCog,
    bottom: false,
    onIconClick,
    ...overrides,
  };
  const instance = new Icon(props);
  return { instance, onIconClick };
}

describe('Toolbar Icon accessibility (D3)', () => {
  it('renders as a focusable, labelled button-like control', () => {
    const { instance } = makeInstance();
    const el = instance.render();
    expect(el.props.role).toBe('button');
    expect(el.props.tabIndex).toBe(0);
    expect(el.props['aria-label']).toBe('Preferences');
  });

  it('Enter key activates the icon', () => {
    const { instance, onIconClick } = makeInstance();
    const event = { key: 'Enter', preventDefault: jest.fn() } as any;
    instance.handleKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(onIconClick).toHaveBeenCalled();
  });

  it('other keys (e.g. Space) do not activate the icon', () => {
    const { instance, onIconClick } = makeInstance();
    const event = { key: ' ', preventDefault: jest.fn() } as any;
    instance.handleKeyDown(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onIconClick).not.toHaveBeenCalled();
  });

  it('exposes aria-pressed for toggle-style icons (selected prop provided)', () => {
    const { instance } = makeInstance({ selected: true });
    expect(instance.render().props['aria-pressed']).toBe(true);
  });

  it('omits aria-pressed for momentary-action icons (no selected prop)', () => {
    const { instance } = makeInstance();
    expect(instance.render().props['aria-pressed']).toBeUndefined();
  });
});
