# Petmate 9 Changelog

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
- **Import from Ultimate**: New importer that reads the current C64 screen from a connected Ultimate device (Ultimate 64, Ultimate II+) via its REST API. Pauses the machine, reads screen RAM ($0400), color RAM ($D800), border/background colors ($D020/$D021), and auto-detects upper/lower charset from $D018, then creates a new 40×25 frame tab. Available under File → Import → From Ultimate (`Ctrl+Shift+2` / `Cmd+Shift+2`).
- **Push to Ultimate (no reset)**: Writes screen RAM, color RAM, border, background, and charset directly to C64 memory via `writemem` DMA — updates the display in-place without resetting the machine. Much faster iteration than Send to Ultimate. File → Push to Ultimate (`Ctrl+Shift+3` / `Cmd+Shift+3`).
- **Import Charset from Ultimate**: Reads the active character set from C64 VIC memory (auto-detects VIC bank from CIA2 $DD00 and char offset from $D018) and imports it as a Petmate custom font. Available under File → Import → Charset from Ultimate.
- **Play SID on Ultimate**: Pick a .sid file from disk and send it to the Ultimate for playback via `POST /v1/runners:sidplay`. Available under File → Play SID on Ultimate.
- **Mount D64 on Ultimate**: New "Mount on Ultimate" checkbox in the D64 export dialog. When checked, the exported D64 is uploaded to the Ultimate's temp storage and mounted on Drive A.
- **Test Connection**: New "Test" button next to the Ultimate address input in Preferences → Emulation. Calls `GET /v1/info` and shows device product name, firmware version, and hostname.
- **No startup file loading**: Removed all `_defaults/` folder file loading at startup. Both box presets and texture presets are now fully hardcoded in `toolbar.ts`. The `_defaults/*.petmate` files are no longer read at runtime.
- **New redux state**: Added `textureForceForeground` to toolbar state, `options` field to `TexturePreset` type, and `DEFAULT_TEXTURE_OPTIONS` constant.
