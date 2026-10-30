import { parseAccelerator, matchesAccelerator, acceleratorFromKeyEvent, KeyModifiers } from './matchAccelerator';

const noMods: KeyModifiers = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false };

describe('parseAccelerator', () => {
  it('returns null for empty/undefined/null input', () => {
    expect(parseAccelerator('')).toBeNull();
    expect(parseAccelerator(undefined)).toBeNull();
    expect(parseAccelerator(null)).toBeNull();
  });

  it('parses a bare single-character key with no modifiers', () => {
    expect(parseAccelerator('X')).toEqual({
      key: 'x', shiftKey: false, ctrlKey: false, metaKey: false, cmdOrCtrl: false, altKey: false,
    });
  });

  it('parses modifier + single-character key', () => {
    expect(parseAccelerator('Alt+1')).toMatchObject({ key: '1', altKey: true, ctrlKey: false });
  });

  it('parses CmdOrCtrl as its own flag, distinct from Ctrl/Cmd', () => {
    const parsed = parseAccelerator('CmdOrCtrl+Shift+X');
    expect(parsed).toMatchObject({ key: 'x', shiftKey: true, cmdOrCtrl: true, ctrlKey: false, metaKey: false });
  });

  it('maps Left/Right/Up/Down aliases to Arrow* key names', () => {
    expect(parseAccelerator('Alt+Left')).toMatchObject({ key: 'ArrowLeft' });
    expect(parseAccelerator('Alt+Right')).toMatchObject({ key: 'ArrowRight' });
    expect(parseAccelerator('Up')).toMatchObject({ key: 'ArrowUp' });
    expect(parseAccelerator('Down')).toMatchObject({ key: 'ArrowDown' });
  });

  it('is case-insensitive for modifier names but preserves non-letter key tokens', () => {
    expect(parseAccelerator('COMMAND+shift+c')).toMatchObject({ metaKey: true, shiftKey: true, key: 'c' });
    expect(parseAccelerator('Ctrl+=')).toMatchObject({ ctrlKey: true, key: '=' });
  });
});

describe('matchesAccelerator', () => {
  it('matches a bare key with no modifiers held', () => {
    expect(matchesAccelerator('X', 'x', noMods)).toBe(true);
  });

  it('does not match when an unexpected modifier is held', () => {
    expect(matchesAccelerator('X', 'x', { ...noMods, shiftKey: true })).toBe(false);
    expect(matchesAccelerator('X', 'x', { ...noMods, ctrlKey: true })).toBe(false);
  });

  it('does not match when a required modifier is missing', () => {
    expect(matchesAccelerator('Alt+1', '1', noMods)).toBe(false);
  });

  it('matches exact modifier + key combos', () => {
    expect(matchesAccelerator('Alt+1', '1', { ...noMods, altKey: true })).toBe(true);
    expect(matchesAccelerator('Ctrl+Shift+C', 'c', { ...noMods, ctrlKey: true, shiftKey: true })).toBe(true);
  });

  it('rejects extra modifiers even if the required ones are present (tightened vs legacy sloppy matching)', () => {
    expect(matchesAccelerator('Alt+1', '1', { ...noMods, altKey: true, shiftKey: true })).toBe(false);
    expect(matchesAccelerator('Ctrl+A', 'a', { ...noMods, ctrlKey: true, metaKey: true })).toBe(false);
  });

  it('CmdOrCtrl matches exactly one of Ctrl/Cmd, never both or neither', () => {
    expect(matchesAccelerator('CmdOrCtrl+X', 'x', { ...noMods, ctrlKey: true })).toBe(true);
    expect(matchesAccelerator('CmdOrCtrl+X', 'x', { ...noMods, metaKey: true })).toBe(true);
    expect(matchesAccelerator('CmdOrCtrl+X', 'x', { ...noMods, ctrlKey: true, metaKey: true })).toBe(false);
    expect(matchesAccelerator('CmdOrCtrl+X', 'x', noMods)).toBe(false);
  });

  it('returns false for an empty/unbound accelerator', () => {
    expect(matchesAccelerator('', 'x', noMods)).toBe(false);
    expect(matchesAccelerator(undefined, 'x', noMods)).toBe(false);
  });

  it('matches Arrow-key aliases', () => {
    expect(matchesAccelerator('Left', 'ArrowLeft', noMods)).toBe(true);
    expect(matchesAccelerator('Alt+Right', 'ArrowRight', { ...noMods, altKey: true })).toBe(true);
  });
});

describe('acceleratorFromKeyEvent', () => {
  it('returns null while only a standalone modifier key is pressed', () => {
    expect(acceleratorFromKeyEvent({ key: 'Shift', ...noMods, shiftKey: true })).toBeNull();
    expect(acceleratorFromKeyEvent({ key: 'Control', ...noMods, ctrlKey: true })).toBeNull();
    expect(acceleratorFromKeyEvent({ key: 'Alt', ...noMods, altKey: true })).toBeNull();
    expect(acceleratorFromKeyEvent({ key: 'Meta', ...noMods, metaKey: true })).toBeNull();
  });

  it('captures a bare single-character key, uppercased for display', () => {
    const captured = acceleratorFromKeyEvent({ key: 'x', ...noMods });
    expect(captured).toEqual({ accelerator: 'X', key: 'x', mods: noMods });
  });

  it('captures modifier + key combos in a canonical order', () => {
    const captured = acceleratorFromKeyEvent({ key: 'c', shiftKey: true, ctrlKey: true, altKey: false, metaKey: false });
    expect(captured?.accelerator).toBe('Ctrl+Shift+C');
  });

  it('the captured accelerator round-trips through matchesAccelerator', () => {
    const mods: KeyModifiers = { shiftKey: true, ctrlKey: true, altKey: false, metaKey: false };
    const captured = acceleratorFromKeyEvent({ key: 'c', ...mods })!;
    expect(matchesAccelerator(captured.accelerator, captured.key, captured.mods)).toBe(true);
  });

  it('preserves non-letter key tokens (e.g. arrow keys) as-is', () => {
    const captured = acceleratorFromKeyEvent({ key: 'ArrowLeft', ...noMods, altKey: true });
    expect(captured).toEqual({ accelerator: 'Alt+ArrowLeft', key: 'ArrowLeft', mods: { ...noMods, altKey: true } });
  });
});
