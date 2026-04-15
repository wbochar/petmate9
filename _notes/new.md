# Petmate 9 — What's New (0.9.6b → 0.9.11)

## 0.9.11 (Current — In Development)

### C16 / Plus4 (TED) Support
- New screen types: `c16Upper` and `c16Lower` charsets
- TED color palettes — PAL and NTSC variants, 128 colors each (16 hues × 8 luminance levels)
- 16×8 TED color grid in the Color Picker panel (replaces standard chip layout)
- TED hue names and `$hex: Name L#` tooltips on each color chip
- TED Color Bars test pattern generator (40×25)
- C16 emulator path added to Preferences → Emulation
- `selectedTedColorPalette` persisted in Settings

### Texture Tool — Undo/Redo
- Local undo/redo stack for texture strip edits (up to 50 levels)
- Ctrl+Z / Ctrl+Y intercepted when Texture tool is active — edits strip first, then falls through to canvas undo
- Undo tracked on cell clicks, add/remove slot, and pick-from-brush

### Multi-Instance Settings Safety
- Debounced auto-persist: line, box, and texture preset changes batched into a single disk write (250ms debounce)
- Dirty-key tracking: only keys this instance changed are written back
- Read-merge-write: re-reads the Settings file before saving so one instance doesn't overwrite another's changes
- File-watcher: detects external changes to the Settings file and merges non-dirty keys into Redux state in real time
- `mergeExternal` Redux action for hot-reloading settings from disk

### Extras
- Guide layer image now compensates for pixel aspect ratio (VDC 80-col 0.5×, VIC-20 2×)
- Color panel header controls (sort, rows, numbers) hidden in TED mode (128 colors don't use chip layout)
- Safe palette lookups in TexturePanel — out-of-range color indices clamped to 0
- Texture export now disables fill mode before writing the export screen
- `numFgColors` and `pixelStretchX` passed to panels for platform-aware rendering

---

## 0.9.10

### Fade Tool Rework
- **Per-source toggle persistence**: each fade source (built-in or custom) saves its own toggle settings (Show Source, Step Start, Step Count, Step Choice, Step Sort) — switching sources restores the previous configuration
- **Pencil / Box-select modes**: header toggle switches between click-to-fade and drag-a-rectangle-then-apply workflows
- **5 default custom fade presets**: H LINE B2T, H LINE T2B, V LINE L2R, V LINE R2L, BLOCKY — ready to use out of the box
- **Streamlined built-in sources**: reduced to 4 fixed presets (*All Chars, *AlphaNum, *AlphaNum+, *PETSCII)
- **Export/Import fade presets**: export all custom sources + toggle settings to a new screen (⭡), import from a `Fade_` screen (⭣) — same portable format as Lines/Boxes/Textures
- **Clear button** in the custom source character editor
- **Memoized source preview**: character list only reshuffles when inputs change or user clicks (no re-shuffle on hover)
- **New preset workflow**: "+" button now creates an empty preset and opens the editor immediately (instead of cloning the current source)

### Bug Fixes
- DirArt Lines tool palette switching fixes
- Machine-Color Palette switching fixes (foreground color now updates correctly when switching between charsets/platforms)

### Defaults Adjusted
- Fade Source Preview visible by default (`fadeShowSource: true`)
- Box Draw Mode enabled by default (`boxDrawMode: true`)
- Texture brush width/height settings added to state

---

## 0.9.9

### C128 VDC 80-Column Mode
- New screen type: **c128 VDC 80×25** (File → New Image menu)
- VDC RGBI color palette — 16 CGA-compatible hardware colors displayed in editor
- VDC color names in color chip tooltips (Dark Gray, Dark Blue, Light Cyan, Brown, etc.)
- Color panel title shows "C128 VDC Upper/Lower" for 80-column screens
- Half-width pixel aspect ratio (0.5× horizontal) matching real 640×200 VDC output on 4:3 monitors
- Default colors: black background/border (0), white foreground (15)
- **PRG Player export**: C128 VDC (80-col) single frame player writes screen codes and attributes to VDC RAM via indirect register access ($D600/$D601)
- VDC macros asset file (`assets/macrosC128VDC.asm`)
- Export & Launch passes `-80` flag to x128 for 80-column display

### Emulator Launch Fixes
- macOS `.app` bundle support — emulator launcher uses `open -a` for .app paths
- Fixes emulator launch for all platforms when configured with a .app bundle path

---

## 0.9.8

### Bug Fixes
- **Brush tool out-of-bounds crash**: Fixed `captureBrush` crashing when starting a brush drag outside the document (zoomed out) and dragging into it — brush region now clamped to framebuffer bounds
- **Texture tool Escape key**: Escape now follows the same two-step pattern as the Brush tool — first press clears the active brush, second press switches to Draw mode

### Texture Tool Enhancements
- **Texture preset persistence**: presets now persist between sessions (auto-saved to Settings file)
- **Texture preset list keyboard navigation**: Arrow Up/Down moves selection, Ctrl+Arrow reorders, Insert duplicates, Delete removes, `n` focuses name input
- **Preferences → Texture Tool tab**: "Reload Default Preset List" button resets presets to built-in defaults (with confirmation)
- **36 default texture presets**: expanded from 5 to 36 (10 PRINT, BLOCK DISINTEGRATE, TRIANGLE BANDS, TEARS IN RAIN, BORG, and many more)

### Build
- No-space artifact filenames (hyphens instead of spaces, e.g. `petmate9-0.9.8-win-x64-setup.exe`)
- Zip build targets: `dist-win-zip`, `dist-macos-zip`, `dist-linux-zip` for portable archives

---

## 0.9.7b

### Ultimate II+ Integration (Complete Suite)
- **Ultimate submenu**: all Ultimate features consolidated under File → Ultimate
- **Import Screen from Ultimate** (Ctrl+Shift+2): reads current C64 screen from a connected Ultimate via REST API — pauses machine, reads screen/color/border/bg RAM, auto-detects charset
- **Push to Ultimate** (Ctrl+Shift+3): writes screen RAM, color RAM, border, bg, and charset directly via `writemem` DMA — updates display in-place without reset
- **Export D64 to Ultimate** (Ctrl+Shift+4): exports DirArt as D64, mounts on Drive A, auto-types `LOAD"$",8` + `LIST`
- **Import Charset from Ultimate**: reads active character set from VIC memory (auto-detects VIC bank and char offset)
- **Play SID on Ultimate**: pick a .sid file and send it for playback via REST API
- **Mount D64 on Ultimate**: checkbox in D64 export dialog to upload and mount on Drive A
- **Reset Ultimate**: sends reset command via REST API
- **Test Connection**: button in Preferences → Emulation verifies device connectivity and shows API version

### Texture Panel — Complete Remake
- Preset-based workflow with scrollable preset list (4 visible rows) and strip preview
- Always-on strip editor: click cells to place selected char+color, +/− buttons adjust strip length (1–10 chars)
- Per-preset options: V/H, Inv, Col, and Diag toggles saved per-preset
- Force Foreground (F) toggle: overrides all preset colors with current foreground
- Export/Import: header buttons export presets to a new 24-wide screen and import from current screen
- **Removed**: Pattern type dropdown (Gradient, Dither, Noise, Stripes, Checker modes), seed slider, and all auto-generation code — only Manual mode remains
- Default presets: 5 hardcoded textures (MONO DITHER HORIZ, MONO BUBBLE DOTS, MONO BRA HOOKS, MONO CHEESE GRATER, MONO PEACOCK)

### Light Mode Fixes
- Replaced hardcoded dark colors with CSS custom properties across all panel components (~25 new theme tokens)
- Light mode toolbar icons, editor border, right-panel header controls, character panel dropdowns all theme-aware
- Windows titlebar theme sync (initial background color based on resolved theme)

### Bug Fixes
- Box presets defaults corrected (ROUNDED, SQUAREANDBROKEN, OUTSIDESQUARE, POINTYARC)
- Text entry shortcut suppression in GuideLayerPanel inputs
- Frame tabs scrollbar overlap fixed
- Guide Panel compass drag no longer creates undo entry per pixel of movement

### Extras
- No startup file loading — box and texture presets fully hardcoded in `toolbar.ts`
- `textureForceForeground` added to toolbar state

---

## 0.9.7 / 0.9.7a

### New Drawing Tools
- **Texture Tool**: fill areas with configurable texture patterns — preset-based selection, random and linear fill modes, color options
- **DirArt Separators Tool (Lines)**: draw horizontal separator lines using configurable PETSCII character patterns — preset system with export/import, Shift-lock axis constraint, brush stamp mode
- **Boxes Tool**: draw rectangular boxes with configurable corners, edges, and fill — preset system with export/import, live preview overlay, mirror/stretch/repeat side options
- **Lighten/Darken (Fade) Tool**: cycle through weight-sorted character variants — lighten/darken modes, configurable strength and source sets, Ctrl modifier for color-only mode, hover preview

### PRG Player v1.01 — Multi-Mode Export Engine
- **Single Frame** (all platforms): C64, C128, PET 4032, VIC-20 — optional SID music (C64)
- **Animation Player** (all platforms): RLE compression + nibble packing, configurable FPS, raster IRQ timing (C64/C128), busy-wait timing (PET/VIC-20)
- **Long Scroll** (C64): pixel-smooth vertical scrolling via VIC-II YSCROLL, double-buffered rendering
- **Wide Pan** (C64): pixel-smooth horizontal scrolling via VIC-II XSCROLL, double-buffered rendering
- **SID Music Support**: native TypeScript SID parser, file picker for .sid/.bin/.mus
- **VIC-20 RAM Expansion Selector**: Unexpanded through +24 KB, auto-adjusts data start address
- **Send to Ultimate II+**: checkbox in PRG Player export footer, POSTs binary via REST API
- **Emulator Integration**: per-platform emulator paths in Preferences, `-autostart` flag
- **Ctrl+Shift+X** shortcut opens PRG Player export dialog

### Guide Layer
- Overlay reference images on the canvas — import any image file (PNG, JPG, etc.)
- Positioning controls, adjustable scale/zoom, opacity, crop to canvas, lock, toggle visibility
- **Convert to PETSCII**: convert guide image to PETSCII characters directly on the canvas
- Per-frame independent guide layers, saved with .petmate workspace file

### Open Recent Files
- File → Open Recent submenu, persistent across sessions, cross-platform
- Tracks files opened via drag-and-drop, double-click, or File → Open
- Clear Recent option

### Dark / Light / Auto Theme
- Full dark mode, light mode, and system auto theme support
- Preferences → Program → Theme dropdown, Ctrl+Shift+D shortcut to cycle
- View menu radio buttons, persistent across sessions
- CSS custom properties for consistent theming across all panels

### Advanced SEQ Import
- File → Import → Adv. SEQ (.seq) with import mode, charset selection, screen presets, custom width, line ending detection, Honor CLS, Strip blanks

### Zoom & Navigation
- Left-corner anchored zoom (predictable scroll position)
- Mouse wheel zoom in all tools (zoom under cursor)
- Double-click in Pan/Zoom tool resets zoom to default
- Fixed zoom stutter (double negation bug, threshold raised to 80)
- Integer zoom steps only

### Color Palette Panel
- Sort modes: Default, Light → Dark, Dark → Light (luma)
- Color number overlay toggle
- Row mode toggle (1-row compact / 2-row standard)
- Adapts per charset (C64 16 colors, VIC-20 8, PET 1)
- Sort mode and color number settings persist across sessions

### Character Palette Panel
- Character sort dropdown in the panel header for reordering the character grid
- Collapsible panel with header controls matching the color palette style
- Tool-specific panels appear below the character palette when relevant tools are selected (DirArt Separators, Boxes, Textures, Fade/Lighten, Guide Layer)

### Preferences Redesign
- Tabbed layout: Program, Colors, Emulation
- Zoom sensitivity: separate sliders for scroll wheel and trackpad pinch (1–10 scale)
- Per-platform emulator path configuration with Browse… buttons (C64, C128, PET 4032, PET 8032, VIC-20)
- C64 palette selector (Petmate, Colodore, Pepto, VICE)
- VIC-20 palette selector (NTSC, PAL)
- PET default color selector (White, Green, Amber)

### Export Options Dialog
- Player Type section shows all four modes: Single Frame, Animation, Long Scroll, Wide Pan
- Long Scroll and Wide Pan disabled (greyed out) on non-C64 platforms
- FPS input for Animation mode; scroll speed input for scroll modes
- Platform notes in footer show memory constraints per platform
- Computer selection automatically disables SID and resets player type when switching away from C64

### Other Features & Fixes
- RVS Pen mode bug fix
- Ctrl+Shift+Z alternate Redo shortcut
- Border changes removed from undo chain
- Middle mouse button pan and scroll
- Chunky pixel mode line drawing fix
- Direction Mode for drawing tools
- Cursor/Character overlay shadow removed
- File dirty flag on app start fixed
- Zoom flicker issues resolved
- Flood fill optimizations
- VIC-20 display mode support
- Layout fix: removed unnecessary 16px margin gap above right-side tool panels
