import {
  KEYBINDING_ACTIONS,
  getKeybindingAction,
  getDefaultAccelerator,
  buildDefaultKeybindings,
  normalizeKeybindings,
} from './registry';

describe('KEYBINDING_ACTIONS data integrity', () => {
  it('has no duplicate ids', () => {
    const ids = KEYBINDING_ACTIONS.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every action has a non-empty id, label, and category', () => {
    for (const action of KEYBINDING_ACTIONS) {
      expect(action.id.length).toBeGreaterThan(0);
      expect(action.label.length).toBeGreaterThan(0);
      expect(action.category.length).toBeGreaterThan(0);
    }
  });

  it('only uses the two defined kinds', () => {
    for (const action of KEYBINDING_ACTIONS) {
      expect(['menu', 'tool']).toContain(action.kind);
    }
  });
});

describe('getKeybindingAction', () => {
  it('finds a known action by id', () => {
    expect(getKeybindingAction('menu.file.save')?.label).toBe('Save');
  });

  it('returns undefined for an unknown id', () => {
    expect(getKeybindingAction('nonexistent.action')).toBeUndefined();
  });
});

describe('getDefaultAccelerator', () => {
  it('returns a plain string default as-is regardless of platform', () => {
    const action = getKeybindingAction('menu.image.shiftLeft')!;
    expect(getDefaultAccelerator(action, 'darwin')).toBe('Alt+Left');
    expect(getDefaultAccelerator(action, 'win32')).toBe('Alt+Left');
  });

  it('resolves the mac-specific default on darwin', () => {
    const action = getKeybindingAction('menu.file.save')!;
    expect(getDefaultAccelerator(action, 'darwin')).toBe('Command+S');
  });

  it('resolves the "other" default on non-mac platforms', () => {
    const action = getKeybindingAction('menu.file.save')!;
    expect(getDefaultAccelerator(action, 'win32')).toBe('Ctrl+S');
    expect(getDefaultAccelerator(action, 'linux')).toBe('Ctrl+S');
  });

  it('returns an empty string when a platform has no default binding', () => {
    const action = getKeybindingAction('menu.image.convertMono')!;
    expect(getDefaultAccelerator(action, 'win32')).toBe('');
    expect(getDefaultAccelerator(action, 'darwin')).toBe('Command+Shift+M');
  });
});

describe('buildDefaultKeybindings', () => {
  it('includes every registered action id', () => {
    const defaults = buildDefaultKeybindings('darwin');
    for (const action of KEYBINDING_ACTIONS) {
      expect(Object.prototype.hasOwnProperty.call(defaults, action.id)).toBe(true);
    }
  });

  it('varies by platform for actions with platform-specific defaults', () => {
    const macDefaults = buildDefaultKeybindings('darwin');
    const winDefaults = buildDefaultKeybindings('win32');
    expect(macDefaults['menu.file.save']).toBe('Command+S');
    expect(winDefaults['menu.file.save']).toBe('Ctrl+S');
  });
});

describe('normalizeKeybindings', () => {
  it('returns full defaults when given undefined', () => {
    const result = normalizeKeybindings(undefined, 'darwin');
    expect(result).toEqual(buildDefaultKeybindings('darwin'));
  });

  it('preserves a known override and fills in everything else from defaults', () => {
    const result = normalizeKeybindings({ 'menu.file.save': 'Cmd+Shift+9' }, 'darwin');
    expect(result['menu.file.save']).toBe('Cmd+Shift+9');
    expect(result['menu.file.open']).toBe(buildDefaultKeybindings('darwin')['menu.file.open']);
  });

  it('drops unrecognized action ids from the input', () => {
    const result = normalizeKeybindings({ 'some.removed.action': 'X' }, 'darwin');
    expect(result).not.toHaveProperty('some.removed.action');
  });
});
