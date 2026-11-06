/**
 * Central keybinding registry.
 *
 * This is the single source of truth for every user-remappable keyboard
 * shortcut in Petmate 9. It intentionally only holds *data* (action ids,
 * labels, categories, and default accelerators) — no dispatch logic and no
 * runtime key-matching. That wiring lives elsewhere:
 *   - `kind: 'menu'` actions are consumed by `public/menu.js` (accelerators
 *     handed to Electron's `Menu.buildFromTemplate`) via the `keybindings`
 *     map pushed from the renderer.
 *   - `kind: 'tool'` actions are consumed by the renderer's raw `keydown`
 *     handling in `src/redux/toolbar.ts`.
 *
 * IMPORTANT: `id` values are persisted verbatim in the user's Settings file
 * (`settings.keybindings`). Never rename or remove an id without a migration
 * — add a new one and leave the old one as a deprecated alias instead.
 *
 * Accelerator strings use Electron's `accelerator` format (e.g.
 * `CmdOrCtrl+Shift+X`, `Alt+Left`, `H`) — see
 * https://www.electronjs.org/docs/latest/api/accelerator — even for
 * `kind: 'tool'` actions, which are never passed to Electron but are parsed
 * the same way in the renderer for consistency.
 */

export type KeybindingKind = 'menu' | 'tool';

/** Accelerator defaults that differ between macOS and other platforms
 *  (Windows/Linux). Use a plain string instead when the default is the same
 *  everywhere (e.g. already `CmdOrCtrl+...`, or a bare key like `H`).
 *  Either side may be omitted/empty to mean "no default binding on that
 *  platform" (the action exists but isn't bound out of the box there). */
export interface AcceleratorByPlatform {
  mac?: string;
  other?: string;
}

export interface KeybindingAction {
  /** Stable, persisted identifier. See the module-level warning above. */
  id: string;
  /** Human-readable name shown in the (future) Shortcuts settings UI. */
  label: string;
  /** Grouping used by the Shortcuts settings UI. */
  category: string;
  kind: KeybindingKind;
  defaultAccelerator: string | AcceleratorByPlatform;
  /** Short note on when a `kind: 'tool'` action applies (e.g. which tool
   *  must be selected, or "not while typing with the Text tool"). Purely
   *  documentation for now — Phase 3 (table-driven `keyDown`) is
   *  responsible for actually implementing these predicates. Omitted for
   *  `kind: 'menu'` actions, which have no context restrictions. */
  context?: string;
  /** Free-form note used to flag known overlaps/quirks discovered while
   *  cataloguing the existing hardcoded shortcuts (e.g. a menu accelerator
   *  and a tool shortcut that already share the same physical key today).
   *  Not used at runtime; purely to inform later conflict-detection UI. */
  note?: string;
}

function mac(accelerator: string): AcceleratorByPlatform {
  return { mac: accelerator };
}
function other(accelerator: string): AcceleratorByPlatform {
  return { other: accelerator };
}
function byPlatform(macAccelerator: string, otherAccelerator: string): AcceleratorByPlatform {
  return { mac: macAccelerator, other: otherAccelerator };
}

// ---------------------------------------------------------------------------
// `kind: 'menu'` actions — one entry per *currently accelerated* Electron
// menu command in `public/menu.js`. Command ids match the string passed to
// `sendMenuCommand(...)` there (and switched on in `src/index.ts`'s `'menu'`
// IPC handler), so remapping only ever changes which accelerator triggers an
// already-existing command — no business logic changes.
//
// Menu items that exist today but have no default accelerator (e.g. most
// Import/Export format entries, "New Petmate Document", Ultimate submenu
// items without a shortcut, dev-only Reload) are intentionally left out of
// this first registry pass: this plan is about making *existing* shortcuts
// remappable, not assigning new ones. They can be added later the same way.
// ---------------------------------------------------------------------------
const MENU_ACTIONS: KeybindingAction[] = [
  // File
  { id: 'menu.file.newScreen', label: 'New 40x25 Screen', category: 'File', kind: 'menu', defaultAccelerator: byPlatform('Command+Shift+T', 'Ctrl+Shift+T') },
  { id: 'menu.file.open', label: 'Open File...', category: 'File', kind: 'menu', defaultAccelerator: byPlatform('Command+O', 'Ctrl+O') },
  { id: 'menu.file.save', label: 'Save', category: 'File', kind: 'menu', defaultAccelerator: byPlatform('Command+S', 'Ctrl+S') },
  { id: 'menu.file.saveAs', label: 'Save As...', category: 'File', kind: 'menu', defaultAccelerator: byPlatform('Command+Shift+S', 'Ctrl+Shift+S') },
  { id: 'menu.file.exportPrgPlayer', label: "Export As... \u2192 Petmate Player (.prg)", category: 'File', kind: 'menu', defaultAccelerator: 'CmdOrCtrl+Shift+X' },
  { id: 'menu.file.quit', label: 'Quit / Exit', category: 'File', kind: 'menu', defaultAccelerator: byPlatform('Command+Q', 'CmdOrCtrl+Q'), note: 'Mac Quit calls app.quit() directly rather than going through sendMenuCommand; Windows/Linux Exit does the same.' },

  // File > Ultimate
  { id: 'menu.ultimate.send', label: 'Ultimate \u2192 Send to Ultimate', category: 'Ultimate', kind: 'menu', defaultAccelerator: byPlatform('Command+Shift+1', 'Ctrl+Shift+1') },
  { id: 'menu.ultimate.push', label: 'Ultimate \u2192 Push to Ultimate', category: 'Ultimate', kind: 'menu', defaultAccelerator: byPlatform('Command+Shift+3', 'Ctrl+Shift+3') },
  { id: 'menu.ultimate.import', label: 'Ultimate \u2192 Import Screen', category: 'Ultimate', kind: 'menu', defaultAccelerator: byPlatform('Command+Shift+2', 'Ctrl+Shift+2') },
  { id: 'menu.ultimate.exportD64', label: 'Ultimate \u2192 Export D64 to Ultimate', category: 'Ultimate', kind: 'menu', defaultAccelerator: byPlatform('Command+Shift+4', 'Ctrl+Shift+4') },

  // Edit
  { id: 'menu.edit.undo', label: 'Undo', category: 'Edit', kind: 'menu', defaultAccelerator: byPlatform('Command+Z', 'Ctrl+Z') },
  { id: 'menu.edit.redo', label: 'Redo', category: 'Edit', kind: 'menu', defaultAccelerator: byPlatform('Shift+Command+Z', 'Ctrl+Y') },
  { id: 'menu.edit.redoAlt', label: 'Redo (alternate)', category: 'Edit', kind: 'menu', defaultAccelerator: other('Ctrl+Shift+Z'), note: 'Secondary Windows/Linux-only redo shortcut (common convention alongside Ctrl+Y). Hidden from the menu (visible: false in menu.js) but still an active global accelerator -- previously hardcoded there with no registry entry at all, so remapping menu.edit.redo away from this key left it silently still bound, and conflict detection could never see it.' },
  { id: 'menu.edit.copyFrame', label: 'Copy Frame', category: 'Edit', kind: 'menu', defaultAccelerator: byPlatform('Command+C', 'Ctrl+C') },
  { id: 'menu.edit.copyFrameAsPng', label: 'Copy Frame to PNG', category: 'Edit', kind: 'menu', defaultAccelerator: byPlatform('Shift+Command+C', 'Shift+Ctrl+C') },
  { id: 'menu.edit.pasteFrame', label: 'Paste Frame', category: 'Edit', kind: 'menu', defaultAccelerator: byPlatform('Shift+Command+V', 'Ctrl+V') },
  { id: 'menu.edit.pasteText', label: 'Paste Text', category: 'Edit', kind: 'menu', defaultAccelerator: byPlatform('Alt+Command+V', 'Shift+Ctrl+V') },
  { id: 'menu.edit.findReplace', label: 'Find/Replace', category: 'Edit', kind: 'menu', defaultAccelerator: other('Ctrl+F'), note: 'Currently only present in the Windows/Linux menu; no mac default exists today.' },
  { id: 'menu.edit.preferences', label: 'Preferences', category: 'Edit', kind: 'menu', defaultAccelerator: byPlatform('Command+,', 'Ctrl+P'), note: 'Default key differs by platform, not just the modifier (comma vs P).' },

  // Image
  { id: 'menu.image.shiftLeft', label: 'Shift Left', category: 'Image', kind: 'menu', defaultAccelerator: 'Alt+Left' },
  { id: 'menu.image.shiftRight', label: 'Shift Right', category: 'Image', kind: 'menu', defaultAccelerator: 'Alt+Right' },
  { id: 'menu.image.shiftUp', label: 'Shift Up', category: 'Image', kind: 'menu', defaultAccelerator: 'Alt+Up' },
  { id: 'menu.image.shiftDown', label: 'Shift Down', category: 'Image', kind: 'menu', defaultAccelerator: 'Alt+Down' },
  { id: 'menu.image.toggleBorder', label: 'Border On/Off', category: 'Image', kind: 'menu', defaultAccelerator: byPlatform('Command+B', 'Ctrl+B') },
  { id: 'menu.image.toggleGrid', label: 'Grid On/Off', category: 'Image', kind: 'menu', defaultAccelerator: byPlatform('Command+G', 'Ctrl+G') },
  { id: 'menu.image.toggleTransparency', label: 'Show Transparency', category: 'Image', kind: 'menu', defaultAccelerator: byPlatform('Command+T', 'Ctrl+T') },
  { id: 'menu.image.cropResize', label: 'Crop/Resize Image', category: 'Image', kind: 'menu', defaultAccelerator: byPlatform('Command+\\', 'Ctrl+\\') },
  { id: 'menu.image.convertMono', label: 'Convert to Mono', category: 'Image', kind: 'menu', defaultAccelerator: byPlatform('Command+Shift+M', 'Ctrl+Shift+M') },
  { id: 'menu.image.clear', label: 'Clear Image', category: 'Image', kind: 'menu', defaultAccelerator: 'Shift+Home' },

  // Selection
  { id: 'menu.selection.selectAll', label: 'Select All', category: 'Selection', kind: 'menu', defaultAccelerator: byPlatform('Command+A', 'Ctrl+A'), note: 'The toolbar also has its own Ctrl/Cmd+A "select all + switch to Brush" raw shortcut (tool.selectAll) — these two should be reconciled in Phase 3.' },
  { id: 'menu.selection.pasteToNewImage', label: 'Paste to New Image', category: 'Selection', kind: 'menu', defaultAccelerator: byPlatform('Command+N', 'Ctrl+N') },
  { id: 'menu.selection.clear', label: 'Clear Selection', category: 'Selection', kind: 'menu', defaultAccelerator: byPlatform('Command+Home', 'Ctrl+Home') },
  { id: 'menu.selection.rotateLeft', label: 'Rotate Left', category: 'Selection', kind: 'menu', defaultAccelerator: byPlatform('Command+[', 'Ctrl+[') },
  { id: 'menu.selection.rotateRight', label: 'Rotate Right', category: 'Selection', kind: 'menu', defaultAccelerator: byPlatform('Command+]', 'Ctrl+]') },
  { id: 'menu.selection.flipHorizontal', label: 'Flip Horizontally', category: 'Selection', kind: 'menu', defaultAccelerator: 'H', note: 'Bare "H" — already overlaps with the toolbar\u2019s own "h" mirror-horizontal tool shortcut today.' },
  { id: 'menu.selection.flipVertical', label: 'Flip Vertically', category: 'Selection', kind: 'menu', defaultAccelerator: 'V', note: 'Bare "V" — already overlaps with the toolbar\u2019s own "v" mirror-vertical tool shortcut today.' },
  { id: 'menu.selection.invert', label: 'Invert Characters', category: 'Selection', kind: 'menu', defaultAccelerator: byPlatform('Command+I', 'Ctrl+I') },

  // Frames
  { id: 'menu.frames.alignAll2x', label: 'Align All Frames x2 Zoom', category: 'Frames', kind: 'menu', defaultAccelerator: byPlatform('Command+Alt+9', 'Ctrl+Alt+9') },
  { id: 'menu.frames.moveLeft', label: 'Move Frame Left in Stack', category: 'Frames', kind: 'menu', defaultAccelerator: byPlatform('Command+Left', 'Ctrl+Left') },
  { id: 'menu.frames.moveRight', label: 'Move Frame Right in Stack', category: 'Frames', kind: 'menu', defaultAccelerator: byPlatform('Command+Right', 'Ctrl+Right') },
  { id: 'menu.frames.duplicate', label: 'Duplicate Frame', category: 'Frames', kind: 'menu', defaultAccelerator: 'Insert' },
  { id: 'menu.frames.remove', label: 'Remove Frame', category: 'Frames', kind: 'menu', defaultAccelerator: 'Delete' },

  // View
  { id: 'menu.view.zoomIn', label: 'Zoom In', category: 'View', kind: 'menu', defaultAccelerator: byPlatform('Command+=', 'Ctrl+=') },
  { id: 'menu.view.zoomOut', label: 'Zoom Out', category: 'View', kind: 'menu', defaultAccelerator: byPlatform('Command+-', 'Ctrl+-') },
  { id: 'menu.view.zoom2x', label: 'Zoom x2 (Default)', category: 'View', kind: 'menu', defaultAccelerator: byPlatform('Command+9', 'Ctrl+9') },
  { id: 'menu.view.zoom1x', label: 'Zoom x1', category: 'View', kind: 'menu', defaultAccelerator: byPlatform('Command+0', 'Ctrl+0') },
  { id: 'menu.view.toggleTheme', label: 'Toggle Theme', category: 'View', kind: 'menu', defaultAccelerator: 'CmdOrCtrl+Shift+D' },

  // Tools
  { id: 'menu.tools.toggleFullScreen', label: 'Toggle Full Screen', category: 'Tools', kind: 'menu', defaultAccelerator: byPlatform('Ctrl+Command+F', 'F11') },
  { id: 'menu.tools.toggleDevTools', label: 'Toggle Developer Tools', category: 'Tools', kind: 'menu', defaultAccelerator: byPlatform('Alt+Command+I', 'Alt+Ctrl+I'), note: 'Mac only shows this item in unpackaged (dev) builds; Windows/Linux show it always.' },

  // Help
  { id: 'menu.help.documentation', label: 'Documentation', category: 'Help', kind: 'menu', defaultAccelerator: other('F1'), note: 'Currently only bound on Windows/Linux; no mac default exists today.' },
  { id: 'menu.help.searchIssues', label: 'Search Issues', category: 'Help', kind: 'menu', defaultAccelerator: other('Ctrl+F1'), note: 'Currently only bound on Windows/Linux; no mac default exists today.' },
];

// ---------------------------------------------------------------------------
// `kind: 'tool'` actions — the subset of `src/redux/toolbar.ts`'s raw
// `keyDown` handling that represents genuine, context-bound *shortcuts*
// (as opposed to text-typing mechanics). See the plan's scope boundary:
// `Escape`, Text-tool character typing/cursor movement, CapsLock/backtick,
// and Shift/Meta/Control/Alt/Tab/Space modifier tracking are deliberately
// NOT included here and are not intended to become remappable.
// ---------------------------------------------------------------------------
const TOOL_ACTIONS: KeybindingAction[] = [
  // Tool switching — active whenever the Text tool isn't capturing keystrokes.
  { id: 'tool.selectDraw', label: 'Select Draw Tool', category: 'Shortcuts: Tools', kind: 'tool', defaultAccelerator: 'X', context: 'No modifiers; not while typing with the Text tool.' },
  { id: 'tool.selectColorize', label: 'Select Colorize Tool', category: 'Shortcuts: Tools', kind: 'tool', defaultAccelerator: 'C', context: 'No modifiers; not while typing with the Text tool.' },
  { id: 'tool.selectCharDraw', label: 'Select Char Draw Tool', category: 'Shortcuts: Tools', kind: 'tool', defaultAccelerator: '0', context: 'No modifiers; not while typing with the Text tool.' },
  { id: 'tool.selectRvsPen', label: 'Select Reverse Pen Tool', category: 'Shortcuts: Tools', kind: 'tool', defaultAccelerator: '9', context: 'No modifiers; not while typing with the Text tool.' },
  { id: 'tool.selectBrush', label: 'Select Brush Tool', category: 'Shortcuts: Tools', kind: 'tool', defaultAccelerator: 'B', context: 'No modifiers; not while typing with the Text tool.' },
  { id: 'tool.selectText', label: 'Select Text Tool', category: 'Shortcuts: Tools', kind: 'tool', defaultAccelerator: 'T', context: 'No modifiers; not while typing with the Text tool.' },
  { id: 'tool.selectPanZoom', label: 'Select Pan/Zoom Tool', category: 'Shortcuts: Tools', kind: 'tool', defaultAccelerator: 'Z', context: 'No modifiers; not while typing with the Text tool.' },
  { id: 'tool.toggleGuideLayer', label: 'Toggle Guide Layer Visibility', category: 'Shortcuts: Tools', kind: 'tool', defaultAccelerator: 'G', context: 'No modifiers; not while typing with the Text tool.' },

  // Color
  { id: 'tool.colorPrev', label: 'Previous Color', category: 'Shortcuts: Color', kind: 'tool', defaultAccelerator: 'Q', context: 'No modifiers; not while typing with the Text tool.' },
  { id: 'tool.colorNext', label: 'Next Color', category: 'Shortcuts: Color', kind: 'tool', defaultAccelerator: 'E', context: 'No modifiers; not while typing with the Text tool.' },
  { id: 'tool.colorSlot0', label: 'Color Slot 1', category: 'Shortcuts: Color', kind: 'tool', defaultAccelerator: 'Alt+1', context: 'Also triggered by Tab+1 today.' },
  { id: 'tool.colorSlot1', label: 'Color Slot 2', category: 'Shortcuts: Color', kind: 'tool', defaultAccelerator: 'Alt+2', context: 'Also triggered by Tab+2 today.' },
  { id: 'tool.colorSlot2', label: 'Color Slot 3', category: 'Shortcuts: Color', kind: 'tool', defaultAccelerator: 'Alt+3', context: 'Also triggered by Tab+3 today.' },
  { id: 'tool.colorSlot3', label: 'Color Slot 4', category: 'Shortcuts: Color', kind: 'tool', defaultAccelerator: 'Alt+4', context: 'Also triggered by Tab+4 today.' },
  { id: 'tool.colorSlot4', label: 'Color Slot 5', category: 'Shortcuts: Color', kind: 'tool', defaultAccelerator: 'Alt+5', context: 'Also triggered by Tab+5 today.' },
  { id: 'tool.colorSlot5', label: 'Color Slot 6', category: 'Shortcuts: Color', kind: 'tool', defaultAccelerator: 'Alt+6', context: 'Also triggered by Tab+6 today.' },
  { id: 'tool.colorSlot6', label: 'Color Slot 7', category: 'Shortcuts: Color', kind: 'tool', defaultAccelerator: 'Alt+7', context: 'Also triggered by Tab+7 today.' },
  { id: 'tool.colorSlot7', label: 'Color Slot 8', category: 'Shortcuts: Color', kind: 'tool', defaultAccelerator: 'Alt+8', context: 'Also triggered by Tab+8 today.' },
  { id: 'tool.colorSlot8', label: 'Color Slot 9', category: 'Shortcuts: Color', kind: 'tool', defaultAccelerator: 'Ctrl+1' },
  { id: 'tool.colorSlot9', label: 'Color Slot 10', category: 'Shortcuts: Color', kind: 'tool', defaultAccelerator: 'Ctrl+2' },
  { id: 'tool.colorSlot10', label: 'Color Slot 11', category: 'Shortcuts: Color', kind: 'tool', defaultAccelerator: 'Ctrl+3' },
  { id: 'tool.colorSlot11', label: 'Color Slot 12', category: 'Shortcuts: Color', kind: 'tool', defaultAccelerator: 'Ctrl+4' },
  { id: 'tool.colorSlot12', label: 'Color Slot 13', category: 'Shortcuts: Color', kind: 'tool', defaultAccelerator: 'Ctrl+5' },
  { id: 'tool.colorSlot13', label: 'Color Slot 14', category: 'Shortcuts: Color', kind: 'tool', defaultAccelerator: 'Ctrl+6' },
  { id: 'tool.colorSlot14', label: 'Color Slot 15', category: 'Shortcuts: Color', kind: 'tool', defaultAccelerator: 'Ctrl+7' },
  { id: 'tool.colorSlot15', label: 'Color Slot 16', category: 'Shortcuts: Color', kind: 'tool', defaultAccelerator: 'Ctrl+8' },

  // Clipboard & selection
  // NOTE: these raw toolbar shortcuts check only the physical Ctrl key
  // (`state.toolbar.ctrlKey`), never Meta/Cmd — unlike the Electron menu's
  // equivalents (menu.selection.selectAll etc.), which use Cmd on mac. The
  // two paths are independent: on mac, Cmd+C/Cmd+V/Cmd+A are handled only by
  // the native menu; physical Ctrl+C/Ctrl+V/Ctrl+A additionally trigger
  // these raw shortcuts on every platform, including mac.
  { id: 'tool.selectAll', label: 'Select All (+ switch to Brush)', category: 'Shortcuts: Clipboard', kind: 'tool', defaultAccelerator: 'Ctrl+A', note: 'Ctrl-only (not Cmd); overlaps with menu.selection.selectAll\u2019s Cmd/Ctrl+A today.' },
  { id: 'tool.pasteFrameOrText', label: 'Paste Frame (or Text, if Text tool is active)', category: 'Shortcuts: Clipboard', kind: 'tool', defaultAccelerator: 'Ctrl+V', note: 'Ctrl-only (not Cmd).' },
  { id: 'tool.copyFrame', label: 'Copy Frame', category: 'Shortcuts: Clipboard', kind: 'tool', defaultAccelerator: 'Ctrl+C', note: 'Ctrl-only (not Cmd).' },
  { id: 'tool.copyFrameAsPng', label: 'Copy Frame as PNG', category: 'Shortcuts: Clipboard', kind: 'tool', defaultAccelerator: 'Ctrl+Shift+C', note: 'Ctrl-only (not Cmd).' },

  // Canvas / frame navigation
  { id: 'tool.prevScreen', label: 'Previous Screen', category: 'Shortcuts: Navigation', kind: 'tool', defaultAccelerator: 'Left', context: 'No modifiers; not while typing with the Text tool.' },
  { id: 'tool.nextScreen', label: 'Next Screen', category: 'Shortcuts: Navigation', kind: 'tool', defaultAccelerator: 'Right', context: 'No modifiers; not while typing with the Text tool.' },

  // Character picker / brush manipulation (Draw, CharDraw, RvsPen, Brush tools)
  { id: 'tool.charPickerLeft', label: 'Character Picker: Move Left', category: 'Shortcuts: Navigation', kind: 'tool', defaultAccelerator: 'A', context: 'No modifiers; not while typing with the Text tool.' },
  { id: 'tool.charPickerRight', label: 'Character Picker: Move Right', category: 'Shortcuts: Navigation', kind: 'tool', defaultAccelerator: 'D', context: 'No modifiers; not while typing with the Text tool.' },
  { id: 'tool.charPickerDown', label: 'Character Picker: Move Down', category: 'Shortcuts: Navigation', kind: 'tool', defaultAccelerator: 'S', context: 'No modifiers; not while typing with the Text tool.' },
  { id: 'tool.charPickerUp', label: 'Character Picker: Move Up', category: 'Shortcuts: Navigation', kind: 'tool', defaultAccelerator: 'W', context: 'No modifiers; not while typing with the Text tool.' },
  { id: 'tool.mirrorVertical', label: 'Mirror Vertically', category: 'Shortcuts: Navigation', kind: 'tool', defaultAccelerator: 'V', context: 'Brush tool mirrors the brush; Draw/CharDraw/RvsPen mirror the selected character.', note: 'Bare "V" — already overlaps with menu.selection.flipVertical today.' },
  { id: 'tool.mirrorHorizontal', label: 'Mirror Horizontally', category: 'Shortcuts: Navigation', kind: 'tool', defaultAccelerator: 'H', context: 'Brush tool mirrors the brush; Draw/CharDraw/RvsPen mirror the selected character.', note: 'Bare "H" — already overlaps with menu.selection.flipHorizontal today.' },
  { id: 'tool.invertChar', label: 'Invert Selected Character', category: 'Shortcuts: Navigation', kind: 'tool', defaultAccelerator: 'F', context: 'No modifiers; not while typing with the Text tool.' },
  { id: 'tool.rotate', label: 'Rotate Brush/Character', category: 'Shortcuts: Navigation', kind: 'tool', defaultAccelerator: 'R', context: 'Brush tool rotates the brush; Draw/CharDraw/RvsPen rotate the selected character.' },
];

export const KEYBINDING_ACTIONS: readonly KeybindingAction[] = [...MENU_ACTIONS, ...TOOL_ACTIONS];

const ACTIONS_BY_ID: ReadonlyMap<string, KeybindingAction> = new Map(
  KEYBINDING_ACTIONS.map(a => [a.id, a])
);

export function getKeybindingAction(id: string): KeybindingAction | undefined {
  return ACTIONS_BY_ID.get(id);
}

/** Resolve an action's default accelerator for a given platform. Returns ''
 *  when the action has no default binding on that platform. */
export function getDefaultAccelerator(
  action: KeybindingAction,
  platform: NodeJS.Platform = process.platform
): string {
  if (typeof action.defaultAccelerator === 'string') {
    return action.defaultAccelerator;
  }
  const isMac = platform === 'darwin';
  return (isMac ? action.defaultAccelerator.mac : action.defaultAccelerator.other) ?? '';
}

/** Build the full default keymap (action id -> accelerator string) for the
 *  given platform. Used to seed `Settings.keybindings` the first time, and
 *  to resolve any action id missing from a user's persisted keymap (e.g.
 *  after an app update adds a new remappable action). */
export function buildDefaultKeybindings(
  platform: NodeJS.Platform = process.platform
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const action of KEYBINDING_ACTIONS) {
    out[action.id] = getDefaultAccelerator(action, platform);
  }
  return out;
}

/** Merge a (possibly partial/stale) persisted keymap with current defaults:
 *  known ids keep the user's override, unknown/missing ids fall back to the
 *  current default. Unrecognized ids in the input (e.g. from a future
 *  version, or a removed action) are dropped. */
export function normalizeKeybindings(
  saved: Record<string, string> | undefined | null,
  platform: NodeJS.Platform = process.platform
): Record<string, string> {
  const defaults = buildDefaultKeybindings(platform);
  if (!saved) {
    return defaults;
  }
  const out: Record<string, string> = { ...defaults };
  for (const action of KEYBINDING_ACTIONS) {
    const override = saved[action.id];
    if (typeof override === 'string') {
      out[action.id] = override;
    }
  }
  return out;
}
