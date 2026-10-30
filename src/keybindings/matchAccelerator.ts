/**
 * Parses and matches Electron-style accelerator strings (e.g.
 * `CmdOrCtrl+Shift+X`, `Alt+Left`, `H`) against a raw DOM `KeyboardEvent`-ish
 * key + modifier state, as tracked by `src/redux/toolbar.ts`'s `keyDown`
 * thunk (single lower-cased characters for length-1 keys, e.g. `'x'`; the
 * original `KeyboardEvent.key` value otherwise, e.g. `'ArrowLeft'`).
 *
 * This is only used for `kind: 'tool'` actions (see
 * `src/keybindings/registry.ts`) — `kind: 'menu'` actions are matched by
 * Electron itself via `public/menu.js`'s `accelerator` property and never
 * go through this module.
 */

export interface KeyModifiers {
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

export interface ParsedAccelerator {
  /** Normalized key token: lower-cased for single characters (matching
   *  toolbar.ts's own convention), otherwise the DOM `KeyboardEvent.key`
   *  form (e.g. `ArrowLeft`, `Escape`). */
  key: string;
  shiftKey: boolean;
  /** Exactly one of `ctrlKey`, `metaKey`, `cmdOrCtrl` describes the
   *  "command" modifier requirement; all three are false for accelerators
   *  with no command modifier at all. */
  ctrlKey: boolean;
  metaKey: boolean;
  /** `CmdOrCtrl`/`CommandOrControl`: satisfied by either Ctrl or Cmd alone
   *  (matching Electron's own accelerator semantics), not by neither or both. */
  cmdOrCtrl: boolean;
  altKey: boolean;
}

// Electron accepts both the modifier name and a couple of aliases; the key
// token itself also has a handful of names that differ from
// `KeyboardEvent.key` (e.g. 'Left' vs 'ArrowLeft'). See
// https://www.electronjs.org/docs/latest/api/accelerator
const KEY_TOKEN_ALIASES: Record<string, string> = {
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Esc: 'Escape',
  Plus: '+',
};

function normalizeKeyToken(token: string): string {
  const resolved = KEY_TOKEN_ALIASES[token] ?? token;
  return resolved.length === 1 ? resolved.toLowerCase() : resolved;
}

/** Parse an accelerator string into its modifier flags + normalized key
 *  token. Returns `null` for an empty/unparseable string (e.g. an action
 *  with no default binding on the current platform). */
export function parseAccelerator(accelerator: string | undefined | null): ParsedAccelerator | null {
  if (!accelerator) return null;
  const parts = accelerator.split('+').map(p => p.trim()).filter(p => p.length > 0);
  if (parts.length === 0) return null;
  const keyToken = parts[parts.length - 1];
  const modifierTokens = parts.slice(0, -1).map(p => p.toLowerCase());
  const has = (...names: string[]) => modifierTokens.some(m => names.includes(m));
  return {
    key: normalizeKeyToken(keyToken),
    shiftKey: has('shift'),
    ctrlKey: has('ctrl', 'control'),
    metaKey: has('cmd', 'command', 'meta', 'super'),
    cmdOrCtrl: has('cmdorctrl', 'commandorcontrol'),
    altKey: has('alt', 'option'),
  };
}

/** Exact match of a pressed key + modifier state against an accelerator
 *  string. All modifiers must match precisely (no "extra" modifiers
 *  allowed) — `CmdOrCtrl` is satisfied by exactly one of Ctrl/Cmd being
 *  held, never both or neither. Returns `false` for an empty/unparseable
 *  accelerator, so an unbound action never matches. */
export function matchesAccelerator(
  accelerator: string | undefined | null,
  key: string,
  mods: KeyModifiers
): boolean {
  const parsed = parseAccelerator(accelerator);
  if (!parsed) return false;
  if (parsed.key !== key) return false;
  if (parsed.shiftKey !== mods.shiftKey) return false;
  if (parsed.altKey !== mods.altKey) return false;
  if (parsed.cmdOrCtrl) {
    // Exactly one of Ctrl/Cmd must be held.
    return mods.ctrlKey !== mods.metaKey;
  }
  return parsed.ctrlKey === mods.ctrlKey && parsed.metaKey === mods.metaKey;
}

const STANDALONE_MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta']);

export interface CapturedAccelerator {
  /** Canonical accelerator string to persist (e.g. `Ctrl+Shift+X`). */
  accelerator: string;
  /** Normalized key token, same convention as `matchesAccelerator`'s `key`
   *  param — pass straight through for conflict-checking against other
   *  actions' current bindings. */
  key: string;
  mods: KeyModifiers;
}

/** Used by the Shortcuts settings UI's "press a key" capture mode: turns a
 *  raw keydown event into a canonical accelerator string + the same
 *  key/mods shape `matchesAccelerator` expects, or `null` while only a
 *  modifier key is held (the caller should keep waiting for a real key). */
export function acceleratorFromKeyEvent(e: {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}): CapturedAccelerator | null {
  if (STANDALONE_MODIFIER_KEYS.has(e.key)) return null;
  const keyToken = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  const modParts: string[] = [];
  if (e.ctrlKey) modParts.push('Ctrl');
  if (e.altKey) modParts.push('Alt');
  if (e.shiftKey) modParts.push('Shift');
  if (e.metaKey) modParts.push('Cmd');
  return {
    accelerator: [...modParts, keyToken].join('+'),
    key: normalizeKeyToken(keyToken),
    mods: { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey },
  };
}
