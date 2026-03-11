# Petmate 9 — UI Region Map

This document describes the visual layout regions of the Petmate 9 application and maps them to their source components. Use this as a reference when making UI changes.

## Top-Level Layout

The app uses a CSS Grid defined in `src/containers/App.module.css` (`.appGrid`):

```
grid-template-columns: 60px auto
grid-template-rows: auto 1fr

grid-template-areas:
  "leftmenu topmenu"
  "leftmenu editor"
```

Root component: `src/containers/App.tsx` (`AppView`)

---

## Region: Left Toolbar (vertical icon strip)

- **Grid area:** `leftmenu`
- **Component:** `src/containers/Toolbar.tsx` (`ToolbarView`)
- **CSS:** `src/containers/Toolbar.module.css`
- **Width:** 60px, full height of viewport
- **Background:** `rgb(51, 51, 51)`
- **Layout:** Flexbox column, centered icons

### Contents (top to bottom)
1. **Undo** — `faUndo` icon
2. **Redo** — `faRedo` icon
3. **Pan/Zoom tool** — `faArrowsAlt` icon + magnifying glass sub-icon
4. **Select/Brush tool** — dashed rectangle sub-icon (custom SVG div)
5. **Draw (Char & Color)** — `faPencilAlt` icon
6. **Colorize (Color only)** — `faPencilAlt` icon + red dot sub-icon
7. **CharDraw (Char only)** — `faPencilAlt` icon + "A" sub-icon
8. **Text/Keyboard tool** — `faKeyboard` icon
9. **Flood Fill tool** — `faFillDrip` icon
10. **Crop/Resize** — `faCropAlt` icon → opens `ResizeSettings` modal
11. **Clear Canvas** — `faDumpsterFire` icon
12. **Border On/Off** — `faClone` icon (modifier keys: ctrl=all on, ctrl+shift=all off, alt=flip all)
13. **Border Color picker** — color swatch (inline `FbColorPicker`)
14. **Background Color picker** — color swatch (inline `FbColorPicker`, smaller, overlaps above)
15. *(spacer — pushes settings to bottom)*
16. **Settings (gear)** — `faCog` icon → opens `Settings` modal (bottom-aligned via `.end` class)

Each tool icon uses the `Icon` / `SelectableTool` components with tooltip hover text.

---

## Region: Framebuffer Tabs (screen tab strip)

- **Grid area:** `topmenu` (top row, right of toolbar)
- **Component:** `src/containers/FramebufferTabs.tsx` (`FramebufferTabs_`)
- **CSS:** `src/containers/FramebufferTabs.module.css`
- **Layout:** Horizontal scrollable row of screen thumbnails

### Contents (left to right)
1. **New Tab button** — `faPlus` icon with:
   - Editable screen dimensions (`ScreenDims` / `ScreenDimsEdit`)
   - Align-left (`faAlignLeft`) and align-center (`faAlignCenter`) buttons for frame positioning
2. **Screen tabs** — sortable list (`SortableTabList`) of `FramebufTab` items:
   - Thumbnail preview: scaled-down `CharGrid` render of screen content
   - Border color shown as CSS border on thumbnail
   - Dimensions badge (e.g. `40x25`) overlaid bottom-right
   - Editable name label below thumbnail (`NameEditor`)
   - Active tab has white outline highlight (`.active` class)
   - Right-click context menu: Copy, Copy to PNG, Paste, Remove

---

## Region: Editor (central canvas area)

- **Grid area:** `editor`
- **Component:** `src/containers/Editor.tsx` (`Editor` class, wrapping `FramebufferView`)
- **CSS:** `src/containers/Editor.module.css`
- **Layout:** Absolute positioning within `editorLayoutContainer`

### Sub-regions

#### Canvas (main drawing surface)
- **Position:** absolute, `left: 10px, top: 0, bottom: 20px, right: 320px`
- **Component:** `FramebufferView` → renders into `#MainContainer` / `#MainCanvas`
- **Contents:**
  - `CharGrid` — the pixel-rendered PETSCII character grid (the actual screen being edited)
  - Overlays layered on top of CharGrid:
    - `CharPosOverlay` — cursor highlight for draw/colorize/chardraw/floodfill tools
    - `TextCursorOverlay` — blinking text cursor for keyboard entry mode
    - `BrushOverlay` — preview of brush stamp when brush tool has a captured region
    - `BrushSelectOverlay` — selection rectangle when brush tool is selecting
    - `GridOverlay` — optional character cell grid lines (toggled via `canvasGrid`)
  - Border rendering: when `borderOn` is true, a 32px border is drawn around the CharGrid
- **Interactions:** pointer down/move/up for drawing, pan/zoom via mouse wheel + modifier keys, double-click resets zoom

#### Color Picker (right sidebar, top)
- **Position:** absolute right, `right: 0`, `marginRight: 16px`
- **Component:** `src/components/ColorPicker.tsx` (`ColorPicker`)
- **CSS:** `src/components/ColorPicker.module.css`
- **Layout:** Grid of color swatches, 2 rows × 8 columns (for C64), scaled 2x
- **Behavior:** adapts palette based on charset (C64=16 colors/2 rows, VIC-20=8 colors/1 row, PET=1 color)
- **Interaction:** click to select foreground color, ctrl+click to swap colors on canvas

#### Character Selector (right sidebar, below color picker)
- **Position:** directly below ColorPicker in the right sidebar
- **Component:** `src/containers/CharSelect.tsx` → `CharSelectView`
- **CSS:** `src/containers/CharSelect.module.css`
- **Layout:** 16×17 character grid rendered via `CharGrid`, scaled 2x
- **Contents:**
  - Full character set grid (all 256+ screencodes displayed)
  - Hover highlight (`CharPosOverlay` at 50% opacity)
  - Selected char highlight (`CharPosOverlay` at 100% opacity)
  - Below the grid, a status/info row with:
    - **CharSelectStatusbar** (left): shows `F:$hex/dec` screencode and `P:$hex/dec (RVS)` PETSCII code
    - **FontSelector** dropdown (right): `<select>` element to switch charset (C64 Upper/Lower, DirArt, Cbase, C128, PET, VIC-20, custom fonts)

#### Canvas Statusbar (bottom of editor)
- **Position:** absolute, `left: 0, bottom: 0, paddingLeft: 20px`
- **Component:** `src/components/Statusbar.tsx` (`CanvasStatusbar`)
- **Layout:** Horizontal row of key-value pairs
- **Contents:** `Size:WxH  X:col  Y:row  CHAR:$hex/dec  SCRN:$hex/dec  COLR:$hex/dec`
- **Behavior:** values update on mouse hover over canvas; SCRN/COLR addresses adjust per charset (C64/VIC-20/PET base addresses)

---

## Modal Dialogs (overlay, not always visible)

All modals render outside the grid layout as siblings of `.appGrid` in `AppView`.

| Modal | Component File | Trigger |
|---|---|---|
| Settings/Preferences | `src/containers/Settings.tsx` | Gear icon in toolbar |
| Resize/Crop | `src/containers/ResizeSettings.tsx` | Crop icon in toolbar |
| Custom Fonts | `src/containers/CustomFontsModal.tsx` | Via settings |
| Export | `src/containers/ExportModal.tsx` | File menu / shortcut |
| Import | `src/containers/ImportModal.tsx` | File menu / shortcut |
| Progress | `src/containers/ProgressModal.tsx` | During long operations |

Modal base component: `src/components/Modal.tsx` with `src/components/Modal.module.css`

---

## Shared / Reusable Components

- **CharGrid** (`src/components/CharGrid.tsx`) — canvas-rendered PETSCII character grid, used in main editor, char selector, and tab thumbnails
- **CharPosOverlay** (`src/components/CharPosOverlay.tsx`) — highlights a single character cell position
- **GridOverlay** (`src/components/GridOverlay.tsx`) — renders character cell grid lines over the canvas
- **ColorPicker** (`src/components/ColorPicker.tsx`) — color swatch grid, used in editor sidebar and toolbar color pickers
- **FontSelector** (`src/components/FontSelector.tsx`) — charset dropdown selector
- **Statusbar** (`src/components/Statusbar.tsx`) — exports `CanvasStatusbar` and `CharSelectStatusbar`
- **FileDrop** (`src/containers/FileDrop.tsx`) — wraps the app grid to handle drag-and-drop file loading (.petmate, .seq, .d64, .c, .prg)
- **ContextMenuArea** (`src/containers/ContextMenuArea.tsx`) — wraps elements to provide right-click context menus (used on screen tabs)

---

## Visual Layout Sketch

```
┌──────────────────────────────────────────────────────────────────┐
│ [+] [Tab1 ◆] [Tab2] [Tab3] ...          ← FramebufferTabs      │
│  ↑ NewTab    (scrollable row)                                    │
├────┬─────────────────────────────────────────┬───────────────────┤
│ ↺  │                                         │ ■■■■■■■■ ← Color │
│ ↻  │                                         │ ■■■■■■■■  Picker │
│ ✥  │                                         │                   │
│ ⬚  │         Main Canvas                     │ ABCDEFGH ← Char  │
│ ✎  │         (CharGrid + overlays)           │ IJKLMNOP  Select  │
│ ✎• │         pan/zoom/draw area              │ QRSTUVWX   Grid   │
│ ✎A │                                         │ 01234567          │
│ ⌨  │                                         │ ........          │
│ 🪣 │                                         │ (16x17)           │
│ ⬒  │                                         │                   │
│ 🗑 │                                         │ F:$A0/160 P:$20   │
│ ◫  │                                         │      [C64 Upper▾] │
│ ██ │                                         │   ← FontSelector  │
│ ██ │                                         │                   │
│    │                                         │                   │
│    ├─────────────────────────────────────────┤                   │
│    │ Size:40x25  X:24  Y:12  CHAR:$20/32    │                   │
│ ⚙  │ SCRN:$5F8/1528  COLR:$D9F8/55800      │                   │
│    │              ↑ CanvasStatusbar          │                   │
└────┴─────────────────────────────────────────┴───────────────────┘
```
