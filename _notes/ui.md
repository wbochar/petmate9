# Petmate 9 — UI Region Map

This document describes the **current** visual layout regions of the Petmate 9 application and maps them to their source components. Use this as a reference when making UI changes.

> Last updated: 2026-03-31. This reflects the major right-panel refactor: fixed sidebar replaced by a stacked collapsible-panel system, plus guide layer, new drawing tools (Separators, Boxes, Fade/Lighten), and toolbar additions.

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

## Region: Left Toolbar

- **Grid area:** `leftmenu`
- **Component:** `src/containers/Toolbar.tsx` (`ToolbarView`)
- **CSS:** `src/containers/Toolbar.module.css`
- **Width:** 60px
- **Background:** `var(--panel-bg-color)`
- **Layout:** vertical icon stack

### Tools (top to bottom)

1. **Pan/Zoom** — `faArrowsAlt` + magnifier sub-icon
2. **Select / Brush** — dashed rectangle sub-icon
3. **Draw (char + color)** — `faPencilAlt`
4. **Colorize (color only)** — `faPencilAlt` + red dot sub-icon
5. **CharDraw (char only)** — `faPencilAlt` + `A` sub-icon
6. **Keyboard Entry Mode** — `faKeyboard`
7. **Flood Fill** — `faFillDrip`
8. **Separators** — `faGripLines`
9. **Boxes** — `faVectorSquare`
10. **Fade / Lighten** — `faAdjust`
11. **Crop / Resize** — `faCropAlt`, opens `ResizeSettings` modal
12. **Clear canvas** — `faDumpsterFire`
13. **Guide Layer toggle** — `faImage`, toggles the guide overlay on/off
14. **Border On/Off** — `faClone`
    - Plain click: toggle current screen border
    - Cmd/Ctrl click: enable border on all screens
    - Cmd/Ctrl+Shift click: disable border on all screens
    - Alt click: flip border on all screens
15. **Border color picker** — inline `FbColorPicker`
16. **Background color picker** — inline `FbColorPicker`
17. **Preferences** — `faCog`, bottom-aligned, opens `Settings` modal

### Hidden / commented-out items

- **Undo / Redo** buttons are present in `Toolbar.tsx` but commented out
- **Textures** tool is wired in code but hidden from the toolbar
- **Canvas fit submenu** exists but is hidden with `display: None`

---

## Region: Framebuffer Tabs

- **Grid area:** `topmenu`
- **Component:** `src/containers/FramebufferTabs.tsx`
- **CSS:** `src/containers/FramebufferTabs.module.css`
- **Layout:** horizontally scrollable strip

### Contents

1. **New tab button** — `faPlus`, screen dimensions editor, alignment controls
2. **Screen tabs** — sortable thumbnails
   - scaled `CharGrid` preview
   - border color in thumbnail outline
   - dimensions badge
   - editable screen name
   - active tab highlight
   - right-click context menu (copy / copy PNG / paste / remove)

---

## Region: Editor

- **Grid area:** `editor`
- **Component:** `src/containers/Editor.tsx`
- **CSS:** `src/containers/Editor.module.css`
- **Layout:** two-column flex
  - **left:** canvas + status bar
  - **right:** 314px scrollable collapsible-panel column

---

## Left Column: Canvas

### Main canvas

- **Component:** `FramebufferView` in `Editor.tsx`
- **DOM ids:** `#MainContainer`, `#MainCanvas`
- **Absolute position in left pane:** `left: 10px`, `top: 140px`, `bottom: 20px`, `right: 0`

#### Primary rendered layer

- **`CharGrid`** (`src/components/CharGrid.tsx`) — renders the PETSCII framebuffer
- Optional C64-style border when `borderOn` is enabled

#### Overlay layers (composited in order)

- **`CharPreviewOverlay`** — shows selected char/color under cursor without repainting the main canvas
- **Guide layer image** — absolute-positioned `<img>` over the canvas when guide is enabled
- **`CharPosOverlay`** — cursor cell highlight for draw / colorize / chardraw / flood fill tools
- **`TextCursorOverlay`** — blinking text cursor in keyboard entry mode
- **`BrushOverlay`** — brush stamp or live box-generation preview
- **`BrushSelectOverlay`** — selection region while dragging with Brush or Boxes tools
- **`GridOverlay`** — optional character-cell grid lines

#### Canvas behaviors

- Pointer-based drawing, selection, and tool interaction
- Scroll-wheel zoom (with accumulator for smooth trackpad/high-res wheels)
- Trackpad pinch-to-zoom support (`e.ctrlKey` on macOS)
- Double-click to reset zoom
- VIC-20 mode: `scaleX(2)` applied for correct wide-pixel aspect ratio
- Uses CSS `zoom` (not `transform: scale`) to avoid shimmer on fractional zoom levels

#### Tool-specific behaviors

- **Brush** — first drag selects region; subsequent clicks stamp the captured brush
- **Boxes** — drag-to-region generates a live box preview; releases stamp the box using a preset
- **Separators** — stamps line-separator brushes defined by the Lines panel
- **Fade / Lighten** — previews replacement character while hovering; ctrl-click mode fades color by luminance
- **Text** — separate text cursor overlay, keyboard input handled by `App.tsx`
- **Flood Fill** — BFS fill of contiguous char+color regions

### Canvas statusbar

- **Component:** `CanvasStatusbar` from `src/components/Statusbar.tsx`
- **Position:** bottom of the left column
- **Contents:** `Size:WxH  X:col  Y:row  CHAR:$hex/dec  SCRN:$hex/dec  COLR:$hex/dec`
- **Behavior:** updates live as the pointer moves over the canvas

---

## Right Column: Collapsible Panel Stack

The old fixed-position color picker + char selector sidebar has been replaced by a vertically stacked collapsible panel system. Each panel uses `src/components/CollapsiblePanel.tsx` which provides a clickable header with expand/collapse toggle and optional header-level controls.

- **Width:** 314px, fixed
- **Overflow:** vertically scrollable

### Panel: Colors

- **Title:** `Colors (<charset display name>)`
- **Component:** `src/components/ColorPicker.tsx`
- **Adapts per charset:** C64 (full palette), VIC-20 (8 colors), PET (restricted)

**Header controls:**
- Row mode toggle (1 or 2 rows)
- Color number visibility toggle
- Sort mode dropdown (Default / Light→Dark / Dark→Light)

### Panel: Characters

- **Component:** `src/containers/CharSelect.tsx`
- 16×17 character grid
- Hover + selected-char highlights
- `CharSelectStatusbar` — shows `F:$hex/dec` (screencode) and `P:$hex/dec` (PETSCII code)
- `FontSelector` — charset dropdown

### Panel: Separators

- **Visible when:** Separators (Lines) tool is active
- **Component:** `src/components/LinesPanel.tsx`
- **Header controls:** `SeparatorHeaderControls`
- Configures separator / DirArt-style line brushes

### Panel: Boxes

- **Visible when:** Boxes tool is active
- **Component:** `src/components/BoxesPanel.tsx`
- **Header controls:** `BoxesHeaderControls`
- Configures box drawing presets and draw-mode toggle

### Panel: Fade / Lighten

- **Visible when:** Fade/Lighten tool is active
- **Component:** `src/components/ToolPanel.tsx`
- **Header controls:** `FadeHeaderControls` (pick mode cycle + source dropdown)

**Body controls:**
- Lighten / Darken mode toggle buttons
- Strength slider (1 – max weight steps)
- Pick mode (First / Random / Linear)
- Source dropdown (All Chars / AlphaNum / AlphaNum+ / PETSCII / Blocks)

### Panel: Guide Layer

- **Visible when:** toolbar guide toggle (`faImage`) is on
- **Component:** `src/components/GuideLayerPanel.tsx`

**Icon toolbar row:**
- Show / hide guide
- Load image (PNG, JPG, GIF, BMP, WEBP)
- Clear image
- Fit image to canvas
- Lock / unlock position
- Crop-to-canvas toggle
- Convert to grayscale
- Convert guide to PETSCII

**Position/transform controls:**
- D-pad nudge (up/down/left/right 1px)
- Draggable center dot for freehand repositioning
- X and Y numeric inputs
- Opacity slider + numeric field
- Scale slider + numeric field (10%–400%)

---

## Modal Dialogs

All modals render outside `.appGrid` as siblings in `AppView`.

- **Settings / Preferences** — `src/containers/Settings.tsx` — gear icon
- **Resize / Crop** — `src/containers/ResizeSettings.tsx` — crop icon
- **Custom Fonts** — `src/containers/CustomFontsModal.tsx` — via Settings
- **Export** — `src/containers/ExportModal.tsx`
- **Import** — `src/containers/ImportModal.tsx`
- **Import SEQ Advanced** — `src/containers/ImportSeqAdvModal.tsx`
- **Progress** — `src/containers/ProgressModal.tsx`

Modal base: `src/components/Modal.tsx` / `src/components/Modal.module.css`

---

## Shared / Reusable Components

- **CharGrid** — `src/components/CharGrid.tsx`
- **CharPosOverlay / TextCursorOverlay** — `src/components/CharPosOverlay.tsx`
- **CharPreviewOverlay** — `src/components/CharPreviewOverlay.tsx`
- **GridOverlay** — `src/components/GridOverlay.tsx`
- **ColorPicker** — `src/components/ColorPicker.tsx`
- **FontSelector** — `src/components/FontSelector.tsx`
- **Statusbar** — `src/components/Statusbar.tsx`
- **CollapsiblePanel** — `src/components/CollapsiblePanel.tsx`
- **ToolPanel** — `src/components/ToolPanel.tsx`
- **LinesPanel** — `src/components/LinesPanel.tsx`
- **BoxesPanel** — `src/components/BoxesPanel.tsx`
- **GuideLayerPanel** — `src/components/GuideLayerPanel.tsx`
- **TexturePanel** — `src/components/TexturePanel.tsx` (partially wired, hidden from toolbar)
- **Tooltip** — `src/components/Tooltip.tsx`
- **FileDrop** — `src/containers/FileDrop.tsx`
- **ContextMenuArea** — `src/containers/ContextMenuArea.tsx`

---

## Visual Layout Sketch

```
┌──────────────────────────────────────────────────────────────────────┐
│ [+] [Tab1 ◆] [Tab2] [Tab3] ...               ← FramebufferTabs      │
├────┬───────────────────────────────────────┬─────────────────────────┤
│ ✥  │                                       │ ▼ Colors (C64 Upper)   │
│ ⬚  │                                       │   palette swatches      │
│ ✎  │                                       │   row/sort/num toggles  │
│ ✎• │                                       ├─────────────────────────┤
│ ✎A │          Main Canvas                  │ ▼ Characters            │
│ ⌨  │   CharGrid + overlays + guide img     │   char grid             │
│ 🪣 │                                       │   F:$xx P:$xx  [font▾] │
│ ≡  │                                       ├─────────────────────────┤
│ □  │                                       │ ▼ Separators (Lines)    │
│ ◐  │                                       ├─────────────────────────┤
│ ⬒  │                                       │ ▼ Boxes                 │
│ 🗑 │                                       ├─────────────────────────┤
│ 🖼 │                                       │ ▼ Fade / Lighten        │
│ ◫  │                                       │  Lighten | Darken [──]  │
│ ██ ├───────────────────────────────────────┤─────────────────────────┤
│ ██ │ Size / X / Y / CHAR / SCRN / COLR    │ ▼ Guide                 │
│ ⚙  │          CanvasStatusbar              │  load/fit/lock/crop...  │
└────┴───────────────────────────────────────┴─────────────────────────┘
```
