# Petmate 9 Changelog

## 0911 — 2026-04-15

### Bug Fixes
- **Guide layer lost on reload**: Fixed `IMPORT_FILE` reducer in `editor.ts` dropping the `guideLayer` field when loading a workspace. Guide layer images, positions, and all settings now survive save/load round-trips.

### New Features
- **Per-frame conversion settings**: Each frame can now have its own conversion tool and settings (tool selection, dithering mode, SSIM weight, matcher mode, mono mode/threshold, force background). When not overridden, the frame inherits from the global Preferences default. Settings are persisted in the .petmate file with the guide layer.
- **Conversion controls in Guide panel**: Added a "Conversion" section to the Guide Layer panel with tool selector dropdown, per-tool settings (matching the Preferences Convert tab), and a "Global" reset button. Shows "(global)" hint when using inherited settings.
- **Guide image deduplication**: When the same guide image is used across multiple frames, it is stored only once in the .petmate file and referenced by index. Significantly reduces file size for multi-frame documents with shared guide images.

### File Format
- **Workspace version 4**: Bumped from version 3. New top-level `guideImages` array stores deduplicated guide image data URLs. Per-frame `guideLayer` objects use `guideImageIndex` instead of inline `imageData`. Version 3 files (with inline `imageData`) are still loaded correctly.
- **Per-frame `convertSettings`**: Optional `convertSettings` object inside each frame's `guideLayer`. Absent means "use global default". Contains `selectedTool`, `forceBackgroundColor`, and per-tool sub-objects (`petsciiator`, `img2petscii`, `petmate9`).

## 098 — 2026-04-12

### Bug Fixes
- **Brush tool out-of-bounds crash**: Fixed `captureBrush` crashing with "Cannot read properties of undefined (reading 'slice')" when starting a brush drag outside the document (zoomed out) and dragging into it. The brush region is now clamped to framebuffer bounds; fully out-of-bounds selections gracefully reset the brush.
- **Texture tool Escape key**: Escape now follows the same two-step pattern as the Brush tool — first press clears the active brush, second press switches to Draw mode. Previously it always jumped straight to Draw.

### New Features
- **Texture preset persistence**: Texture presets now persist between sessions. Changes (add, edit, remove, reorder) are automatically saved to the Settings file, following the same pattern as line and box presets.
- **Texture preset list keyboard navigation**: The preset list is now focusable. Arrow Up/Down moves selection, Ctrl+Arrow Up/Down reorders presets, Insert duplicates the selected preset, Delete removes it, `n` focuses the name input. The list automatically regains focus after saving or editing the name.
- **Preferences — Texture Tool tab**: Added a "Texture Tool" tab to Preferences with a "Reload Default Preset List" button that resets presets to the built-in defaults (with confirmation dialog).
- **36 default texture presets**: Expanded the built-in texture preset library from 5 to 36 presets imported from `textures_098.petmate`, including 10 PRINT, BLOCK DISINTEGRATE, TRIANGLE BANDS, TEARS IN RAIN, BORG, and many more.

### Build
- **No-space artifact filenames**: Build output filenames now use hyphens instead of spaces (e.g. `petmate9-0.9.8-win-x64-setup.exe`).
- **Zip build targets**: Added `dist-win-zip`, `dist-macos-zip`, and `dist-linux-zip` npm scripts that produce a portable zip archive instead of an installer.

## 097b — 2026-04-09

### Bug Fixes
- **Box presets defaults**: Updated installer defaults to include correct presets: ROUNDED, SQUAREANDBROKEN, OUTSIDESQUARE, POINTYARC. Generated new `_defaults/boxes_n097b.petmate` file and updated hardcoded fallback in `toolbar.ts`.
- **Light Mode panel support**: Replaced hardcoded dark colors (#333, #555, #aaa, etc.) with CSS custom properties across all panel components (BoxesPanel, LinesPanel, LineDrawPanel, GuideLayerPanel, ToolPanel, TexturePanel, Editor). Added ~25 new theme tokens to `app.global.css` for both dark and light themes.
- **Text entry shortcut suppression**: All text inputs in GuideLayerPanel (Opacity, Scale, Brightness, Contrast, X, Y) now disable keyboard shortcuts on focus and re-enable on blur. Numeric text inputs use local state and only commit changes on blur or Enter key press — no more live-updating while typing.
- **Light Mode toolbar icons**: Guide Layer and Border toolbar icons render black in light mode. All other toolbar icons use a lighter gray (`#555`) in light mode for better visibility.
- **Frame tabs scrollbar overlap**: Increased `.tabHeadings` height from 128px to 136px with 8px bottom padding, and adjusted editor top offset from 140px to 148px so the scrollbar no longer covers the editor frame.
- **Guide Panel compass drag undo**: The compass center thumb drag no longer creates an undo entry for every pixel of movement. It now accumulates changes locally and dispatches a single update on pointer release.
- **Editor border light mode**: The dark border around the editor canvas area now uses `var(--editor-frame-border)` and adapts to light theme.
- **Right-panel header controls light mode**: Colors panel row toggle, color numbers toggle, sort dropdown, and character panel background mode toggle all use theme-aware CSS variables.
- **Characters panel dropdowns light mode**: FontSelector (charset dropdown) and character sort order dropdown now use CSS variable tokens for light mode compatibility.
- **Frame tabs scrollbar overlap (revised)**: Adjusted editor frame top offset from 140px to 146px to clear the 6px scrollbar without changing the tab headings dimensions.
- **Windows titlebar theme sync**: Set initial window background color based on resolved theme. Fixed `app.setName('petmate9')` so dev builds read the correct Settings file for theme persistence.
- **Known limitation**: The Windows active titlebar does not respect light mode in Electron 40 (Chromium 134). This is a confirmed upstream Electron bug — even a bare `new BrowserWindow()` with no theme config shows a dark active titlebar on a light-mode Windows 11 system. The inactive titlebar correctly follows the theme. All other light/dark mode switching (app content, menus, context menus) works correctly.

### New Features
- **Texture Panel complete remake**: Rebuilt the Textures tool panel from scratch with a preset-based workflow.
  - **Preset list UI**: Scrollable list (4 visible rows) showing each preset's name and a 1.5× strip preview, modeled after the DirArt Separators panel.
  - **Always-on editor**: Name input and character strip editor are always visible above the controls. Click cells to place the selected char+color. +/− buttons adjust strip length (1–10 chars max). Unused slots shown at 50% opacity.
  - **Per-preset options**: V/H, Inv, Col, and Diag toggles are saved per-preset and auto-save to the redux store on toggle.
  - **Save on Enter**: Pressing Enter in the name input triggers a save and blurs the field.
  - **Keyboard shortcut suppression**: Name input disables keyboard shortcuts on focus (matching BoxesPanel pattern).
  - **Force Foreground (F) toggle**: Header button overrides all preset colors with the current foreground color in brush/fill output.
  - **Export/Import**: Header buttons (⭡/⭣) export presets to a new 24-wide screen and import from the current screen. Format: 3 rows per preset — PETSCII-encoded name (max 23 chars + 0xBC marker), chars with per-cell colors (0xBD terminator after last char), and options row (6 bool flags + 0xBB marker). Import detects markers and falls back gracefully for legacy formats.
  - **Layout**: Controls (scale slider, option toggles, Brush/Fill output) at top; preset list and 16×16 tiling preview side-by-side at bottom.
  - **Removed**: Pattern type dropdown (Gradient, Dither, Noise, Stripes, Checker modes), seed slider, and all non-manual pattern generation code. Only Manual mode remains.
  - **Default presets**: 5 hardcoded texture presets from `textures_097b.petmate` (MONO DITHER HORIZ, MONO BUBBLE DOTS, MONO BRA HOOKS, MONO CHEESE GRATER, MONO PEACOCK).
- **Ultimate submenu**: All Ultimate features consolidated under File → Ultimate submenu.
- **Import Screen from Ultimate** (`Ctrl+Shift+2` / `Cmd+Shift+2`): Reads the current C64 screen from a connected Ultimate device via its REST API. Pauses the machine, reads screen RAM ($0400), color RAM ($D800), border/background colors ($D020/$D021), and auto-detects upper/lower charset from $D018, then creates a new 40×25 frame tab.
- **Push to Ultimate** (`Ctrl+Shift+3` / `Cmd+Shift+3`): Writes screen RAM, color RAM, border, background, and charset directly to C64 memory via `writemem` DMA — updates the display in-place without resetting the machine. Much faster iteration than Send to Ultimate.
- **Export D64 to Ultimate** (`Ctrl+Shift+4` / `Cmd+Shift+4`): Exports the current DirArt screen as a D64, mounts it on the Ultimate's Drive A, and auto-types `LOAD"$",8` + `LIST` on the C64 to display the directory — all without a save dialog.
- **Import Charset from Ultimate**: Reads the active character set from C64 VIC memory (auto-detects VIC bank from CIA2 $DD00 and char offset from $D018) and imports it as a Petmate custom font.
- **Play SID on Ultimate**: Pick a .sid file from disk and send it to the Ultimate for playback via `POST /v1/runners:sidplay`.
- **Mount D64 on Ultimate**: "Mount on Ultimate" checkbox in the D64 export dialog. When checked, the exported D64 is mounted on Drive A and the directory is listed.
- **Reset Ultimate**: Sends a reset command (`PUT /v1/machine:reset`) to the Ultimate.
- **Test Connection**: "Test" button next to the Ultimate address input in Preferences → Emulation. Calls `GET /v1/version` to verify the device is reachable and shows the API version.
- **No startup file loading**: Removed all `_defaults/` folder file loading at startup. Both box presets and texture presets are now fully hardcoded in `toolbar.ts`. The `_defaults/*.petmate` files are no longer read at runtime.
- **New redux state**: Added `textureForceForeground` to toolbar state, `options` field to `TexturePreset` type, and `DEFAULT_TEXTURE_OPTIONS` constant.
