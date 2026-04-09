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
- **Texture Panel Manual mode add/remove**: Manual mode now starts with 1 blank space character instead of 16. Users can add (+) and remove (−) characters with buttons (min 1, max 16). The Scale slider multiplies/tiles the manual characters in the 16×16 preview grid.
