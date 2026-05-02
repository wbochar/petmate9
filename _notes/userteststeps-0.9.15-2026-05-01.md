# Petmate 9 — Manual UI Test Steps (v0.9.15 — 2026-05-01)

**Version:** 0.9.15
**Date:** 2026-05-01
**Tester:** wbochar

---

## 1. Application Launch & Window

- [x] Application opens without errors
- [x] Window title displays correctly
- [x] Default canvas (40x25) is created
- [x] Left toolbar is visible (60px wide)
- [x] Top frame tabs strip is visible
- [x] Right collapsible panel column is visible (314px)
- [x] Canvas statusbar is visible at bottom

---

## 2. Left Toolbar — Tools

### 2.1 Pan/Zoom
- [x] Click icon activates Pan/Zoom mode
- [x] Press `z` activates Pan/Zoom mode
- [x] Scroll-wheel zoom works
- [x] Pinch-to-zoom works (macOS trackpad)
- [x] Double-click canvas resets zoom
- [x] Hold Spacebar temporarily activates Pan/Zoom from any other tool

### 2.2 Select / Brush
- [x] Click icon activates Brush mode
- [x] Press `b` activates Brush mode
- [x] Drag to select region captures brush
- [x] Click with captured brush stamps it
- [x] Stamp chars + colors (no modifier)
- [x] Ctrl+stamp: chars only
- [x] Alt+stamp: colors only
- [x] Ctrl+Alt+stamp: raw (bypasses color remap)
- [x] Right-click stamp: color stamp mode
- [x] Escape with no brush: exits to Draw tool
- [x] Shift+drag locks to horizontal or vertical axis

### 2.3 Draw (char + color)
- [x] Click icon activates Draw mode
- [x] Press `x` activates Draw mode
- [x] Left-click draws selected char + color
- [x] Right-click erases (space char / current color)
- [x] Ctrl+right-click draws transparent character
- [x] Alt+click eyedroppers char + color
- [x] Ctrl+click picks color only
- [x] Shift+drag locks to axis

### 2.4 Colorize (color only)
- [x] Click icon activates Colorize mode
- [x] Press `c` activates Colorize mode
- [x] Drawing applies color only, leaves char unchanged

### 2.5 CharDraw (char only)
- [x] Click icon activates CharDraw mode
- [x] Press `0` activates CharDraw mode
- [x] Drawing applies char only, leaves color unchanged

### 2.6 Keyboard Entry (Text)
- [x] Click icon activates Text mode
- [x] Press `t` activates Text mode
- [x] Blinking text cursor overlay appears on canvas click
- [x] Typing characters places PETSCII chars and advances cursor
- [x] Shift+key types uppercase variant
- [x] CapsLock toggles RVS Mode
- [x] Backspace deletes and moves cursor left
- [x] Arrow keys move cursor
- [x] Escape deactivates cursor (first press)
- [x] Escape exits to Draw (second press)

### 2.7 Flood Fill
- [x] Click icon activates Flood Fill mode
- [x] Fill contiguous char+color region works correctly
- [x] Escape exits to Draw

### 2.8 Separators (Lines)
- [x] Click icon activates Separators mode
- [x] Separators panel appears in right column
- [x] Stamp separator brush on canvas
- [x] Escape resets brush and exits to Draw

### 2.9 Boxes
- [x] Click icon activates Boxes mode
- [x] Boxes panel appears in right column
- [x] Drag-to-region shows live box preview
- [x] Release stamps the box using selected preset
- [x] Escape resets brush and exits to Draw

### 2.10 Fade / Lighten
- [x] Click icon activates Fade/Lighten mode
- [x] Fade/Lighten panel appears in right column
- [x] Hover shows replacement char preview
- [x] Click applies fade/lighten
- [x] Ctrl+click fades color by luminance
- [x] Lighten / Darken toggle works
- [x] Strength slider changes intensity
- [x] Pick mode cycle (First / Random / Linear)
- [x] Source dropdown (All Chars / AlphaNum / AlphaNum+ / PETSCII / Blocks)
- [x] Escape exits to Draw

### 2.11 Crop / Resize
- [x] Click icon opens Resize/Crop modal
- [x] Modal allows changing width and height
- [x] OK applies resize, Cancel aborts

### 2.12 Clear Canvas
- [x] Click icon clears the canvas

### 2.13 Guide Layer Toggle
- [x] Click icon toggles guide layer on/off
- [x] Press `g` toggles guide visibility
- [x] Guide Layer panel appears in right column when on

### 2.14 Border On/Off
- [x] Plain click toggles current screen border
- [x] Ctrl+click enables border on all screens
- [x] Ctrl+Shift+click disables border on all screens
- [x] Alt+click flips border on all screens

### 2.15 Border Color Picker
- [x] Inline color picker selects border color

### 2.16 Background Color Picker
- [x] Inline color picker selects background color

### 2.17 Preferences (Gear Icon)
- [x] Click opens Settings/Preferences modal

---

## 3. Frame Tabs (Top Bar)

### 3.1 New Tab
- [x] Click `+` button creates a new 40x25 screen
- [x] Screen dimensions editor appears
- [x] Alignment controls work

### 3.2 Tab Interaction
- [x] Click tab switches to that screen
- [x] Active tab is visually highlighted
- [x] Tab shows scaled CharGrid preview
- [x] Tab shows border color in outline
- [x] Tab shows dimensions badge
- [x] Tab name is editable (double-click or inline)
- [x] Tabs are horizontally scrollable
- [ ] Tabs are sortable (drag to reorder)

### 3.3 Tab Context Menu (Right-Click)
- [x] Copy option works
- [x] Copy as PNG option works
- [x] Paste option works
- [x] Remove option works

### 3.4 Tab Navigation
- [x] ArrowLeft goes to previous tab (no text cursor active)
- [x] ArrowRight goes to next tab (no text cursor active)
- [x] CTRL Left / Right changes order of selected tab

---

## 4. Right Panel — Collapsible Panels

### 4.1 Colors Panel
- [x] Panel displays color swatches for active charset
- [x] C64 mode: full 16-color palette
- [ ] VIC-20 mode: 8 colors
- [ ] PET mode: restricted palette
- [x] Click swatch selects foreground color
- [x] Row mode toggle (1 or 2 rows)
- [x] Color number visibility toggle
- [x] Sort mode dropdown (Default / Light→Dark / Dark→Light)
- [x] `q` steps to previous color
- [x] `e` steps to next color
- [x] Alt+1–8 selects colors 0–7
- [x] Ctrl+1–8 selects colors 8–15
- [x] Panel collapses/expands on header click

### 4.2 Characters Panel
- [x] 16×17 character grid displayed
- [x] Hover highlights character
- [x] Click selects character
- [x] Selected character is highlighted
- [x] CharSelectStatusbar shows F:$hex/dec and P:$hex/dec
- [x] FontSelector dropdown changes charset
- [x] Panel collapses/expands on header click

### 4.3 Separators Panel (Lines Tool Active)
- [x] Panel visible when Separators tool is active
- [x] Header controls (SeparatorHeaderControls) functional
- [x] Separator/DirArt-style line brush configuration works
- [x] Panel hides when switching away from Separators tool

### 4.4 Boxes Panel (Boxes Tool Active)
- [x] Panel visible when Boxes tool is active
- [x] Header controls (BoxesHeaderControls) functional
- [x] Box preset selection works
- [x] Draw-mode toggle works
- [x] Panel hides when switching away from Boxes tool

### 4.5 Fade / Lighten Panel (Fade Tool Active)
- [x] Panel visible when Fade/Lighten tool is active
- [x] FadeHeaderControls (pick mode cycle + source dropdown) work
- [x] Lighten / Darken toggle
- [x] Strength slider (1 – max)
- [x] Pick mode selector
- [x] Source dropdown
- [x] Pencil / Box-select mode toggle works
- [x] Built-in fade sources load correctly
- [x] Custom fade source create/edit/delete works
- [x] Export custom fade presets works
- [x] Import custom fade presets from `Fade_` screen works
- [x] Panel hides when switching away from Fade tool

### 4.6 Guide Layer Panel (Guide Active)
- [ ] Panel visible when guide toggle is on
- [ ] Show / hide guide button
- [ ] Load image (PNG, JPG, GIF, BMP, WEBP)
- [ ] Clear image button
- [ ] Fit image to canvas button
- [ ] Lock / unlock position button
- [ ] Crop-to-canvas toggle
- [ ] Convert to grayscale button
- [ ] Reset adjustments button restores defaults
- [ ] Convert guide to PETSCII button
- [ ] D-pad nudge (up/down/left/right 1px)
- [ ] Draggable center dot for freehand repositioning
- [ ] X and Y numeric inputs
- [ ] Opacity slider + numeric field
- [ ] Scale slider + numeric field (10%–400%)
- [ ] Brightness slider + numeric field
- [ ] Contrast slider + numeric field
- [ ] Hue slider + numeric field
- [ ] Saturation slider + numeric field
- [ ] Force background toggle affects conversion
- [ ] Compass center drag does NOT create undo per pixel
- [ ] Text inputs suppress keyboard shortcuts on focus
- [ ] Conversion section expands/collapses
- [ ] Tool selector (Petsciiator / img2petscii / Pet9scii) works
- [ ] Per-tool settings apply correctly
- [ ] Color mask buttons (All / None / Inv / Grays / Warm / Cool) affect conversion
- [ ] Per-frame conversion override can reset to Global

### 4.7 Textures Panel (Textures Tool)
- [ ] Preset list UI with scrollable list (4 visible rows)
- [ ] Strip preview at 1.5× per preset
- [ ] Name input and character strip editor always visible
- [ ] Click cells to place char+color
- [ ] +/− buttons adjust strip length (1–10)
- [ ] Unused slots shown at 50% opacity
- [ ] V/H, Inv, Col, Diag toggles per-preset
- [ ] Enter in name input saves and blurs
- [ ] Force Foreground (F) header toggle
- [ ] Draw mode toggle works
- [ ] Export (⭡) button exports presets to new 24-wide screen
- [ ] Import (⭣) button imports from current screen
- [ ] Scale slider and option toggles at top
- [ ] Brush/Fill output controls
- [ ] 16×16 tiling preview
- [ ] Preset list keyboard navigation (↑/↓, Ctrl+↑/↓, Insert, Delete, `n`) works
- [ ] Local strip undo/redo (Ctrl+Z / Ctrl+Y) works

### 4.8 Tool Presets Portability / Grouping
- [ ] Tools → Presets submenu is present
- [ ] Export all tools presets works
- [ ] Import All Presets works
- [ ] Clear Boxes/Separators/Textures presets works
- [ ] Per-group preset export works (C64/C16/C128 VDC/VIC-20/PET)

---

## 5. File Menu

- [ ] New Petmate Document: creates fresh document
- [ ] New 40x25 Screen (Ctrl+T): adds default screen
- [ ] New Screen submenu:
  - [ ] DirArt Small 16x10
  - [ ] DirArt Medium 16x20
  - [ ] DirArt Max 16x144
  - [ ] C16/Plus4 40x25
  - [ ] c128 40x25
  - [ ] c128 VDC 80x25
  - [ ] Vic20 22x23
  - [ ] Pet 40x25
  - [ ] Pet 80x25
- [ ] Open File (Ctrl+O): opens .petmate file
- [ ] Open Recent: shows recent files submenu
  - [ ] Recent file entries open correctly
  - [ ] Clear Recent clears the list
- [ ] Save (Ctrl+S): saves current file
- [ ] Save As (Ctrl+Shift+S): save to new location
- [ ] Ultimate submenu:
  - [ ] Send to Ultimate (Ctrl+Shift+1)
  - [ ] Push to Ultimate (Ctrl+Shift+3)
  - [ ] Import Screen (Ctrl+Shift+2)
  - [ ] Import Charset
  - [ ] Play SID
  - [ ] Export D64 to Ultimate (Ctrl+Shift+4)
  - [ ] Send Test Pattern
  - [ ] Reset Ultimate
- [ ] Import submenu:
  - [ ] D64 disk image (.d64)
  - [ ] PETSCII (.c)
  - [ ] PNG (.png)
  - [ ] SEQ (.seq)
  - [ ] Adv. SEQ (.seq)
  - [ ] CBASE (.prg)
- [ ] Export As submenu:
  - [ ] Assembler source (.asm)
  - [ ] BASIC (.bas)
  - [ ] D64 disk image (.d64)
  - [ ] Executable (.prg)
  - [ ] GIF (.gif)
  - [ ] JSON (.json)
  - [ ] PETSCII (.c)
  - [ ] PNG (.png)
  - [ ] SEQ (.seq)
  - [ ] CBASE (.prg)
  - [ ] PET (.pet)
  - [ ] Petmate Player (.prg) (Ctrl+Shift+X)
- [ ] Fonts: opens Custom Fonts modal
- [ ] Exit (Ctrl+Q): closes application

---

## 6. Edit Menu

- [ ] Undo (Ctrl+Z)
- [ ] Redo (Ctrl+Y / Ctrl+Shift+Z)
- [ ] Copy Frame (Ctrl+C)
- [ ] Copy Frame to PNG (Ctrl+Shift+C)
- [ ] Paste Frame (Ctrl+V)
- [ ] Paste Text (Ctrl+Shift+V)
- [ ] Preferences (Ctrl+P): opens Settings modal

---

## 7. Image Menu

- [ ] Shift Left (Alt+Left)
- [ ] Shift Right (Alt+Right)
- [ ] Shift Up (Alt+Up)
- [ ] Shift Down (Alt+Down)
- [ ] Border On/Off (Ctrl+B)
- [ ] Grid On/Off (Ctrl+G)
- [ ] Crop/Resize Image (Ctrl+\)
- [ ] Show Transparency (Ctrl+T)
- [ ] Convert to Mono (Ctrl+Shift+M)
- [ ] Clear Image (Shift+Home)

---

## 8. Selection Menu

- [ ] Select All (Ctrl+A)
- [ ] Paste to New Image (Ctrl+N)
- [ ] Clear Selection (Ctrl+Home)
- [ ] Rotate Left (Ctrl+[)
- [ ] Rotate Right (Ctrl+])
- [ ] Flip Horizontally (H)
- [ ] Flip Vertically (V)
- [ ] Invert Characters (Ctrl+I)

---

## 9. Frames Menu

- [ ] Align All Frames x2 Zoom (Ctrl+Alt+9)
- [ ] Move Frame Left in Stack (Ctrl+Left)
- [ ] Move Frame Right in Stack (Ctrl+Right)
- [ ] Duplicate Frame (Insert)
- [ ] Remove Frame (Delete)

---

## 10. View Menu

- [ ] Zoom In (Ctrl+=)
- [ ] Zoom Out (Ctrl+-)
- [ ] Zoom x2 Default (Ctrl+9)
- [ ] Zoom x1 (Ctrl+0)
- [ ] Toggle Theme cycle (Ctrl+Shift+D)
- [ ] Light Mode radio
- [ ] Dark Mode radio
- [ ] Auto (System) radio

---

## 11. Tools Menu

- [ ] Presets submenu:
  - [ ] Boxes presets export/import/clear
  - [ ] Separators presets export/clear
  - [ ] Textures presets export/import/clear
  - [ ] Export all tools presets
  - [ ] Import All Presets
- [ ] Toggle Full Screen (F11)
- [ ] Toggle Developer Tools (Ctrl+Alt+I)
- [ ] Reload (dev builds only, Ctrl+R)

---

## 12. Help Menu

- [ ] Documentation (F1): opens external docs site
- [ ] Search Issues (Ctrl+F1): opens GitHub issues
- [ ] About: shows about panel with version info

---

## 13. Modal Dialogs

### 13.1 Preferences / Settings
- [ ] Modal opens and closes correctly
- [ ] Tab bar: Program, UI, Colors, Emulation, Convert
- [ ] **Program tab:**
  - [ ] Theme dropdown (System Default / Dark / Light)
  - [ ] Scroll Sensitivity slider (1–10)
  - [ ] Pinch Sensitivity slider (1–10)
  - [ ] Reset to Defaults button
- [ ] **UI tab:**
  - [ ] Show color numbers checkbox
  - [ ] Characters Panel background mode (Document / Panel)
  - [ ] Reset to Defaults button
- [ ] **Colors tab:**
  - [ ] C64 palette selector (petmate / colodore / pepto / vice)
  - [ ] VIC-20 palette selector (vic20ntsc / vic20pal)
  - [ ] PET palette selector (petwhite / petgreen / petamber)
  - [ ] Reset to Defaults button
- [ ] **Emulation tab:**
  - [ ] Ultimate 64 Address/DNS input
  - [ ] Ultimate address preset add/edit/remove controls
  - [ ] Ultimate address Test button
  - [ ] Emulator binary paths (C64, C16, C128, PET 4032, PET 8032, VIC-20)
  - [ ] Browse buttons for each emulator
  - [ ] Reset to Defaults button
- [ ] **Convert tab:**
  - [ ] Tool selector (Petsciiator / img2petscii / Pet9scii Converter)
  - [ ] Use document background color checkbox
  - [ ] Petsciiator: dithering checkbox
  - [ ] img2petscii: matcher mode, mono mode, threshold slider
  - [ ] Pet9scii: dithering mode, SSIM weight slider, luminance matching
  - [ ] Reset to Defaults button
- [ ] **Texture Tool tab:** Reload Default Preset List button works
- [ ] OK saves, Cancel discards

### 13.2 Resize / Crop
- [ ] Modal opens from toolbar crop icon or Ctrl+\
- [ ] Width and height inputs
- [ ] OK applies, Cancel aborts

### 13.3 Custom Fonts
- [ ] Modal opens from File > Fonts
- [ ] Font management works correctly

### 13.4 Export Modal
- [ ] Opens for relevant export types
- [ ] Export options displayed correctly
- [ ] Export completes without error
- [ ] PRG Player computer targets include C16 and C128 VDC
- [ ] PRG Player modes (Single Frame / Animation / Long Scroll / Wide Pan) work as expected
- [ ] PRG Player frame range controls work in Animation mode
- [ ] PRG Player SID picker and load-address display work
- [ ] PRG Player Send to Ultimate checkbox appears only when supported
- [ ] PRG Player Export & Launch appears only when emulator path/fallback is valid
- [ ] D64 export Mount on Ultimate checkbox works

### 13.5 Import Modal
- [ ] Opens for relevant import types
- [ ] Import options displayed correctly
- [ ] Import completes without error

### 13.6 Import SEQ Advanced
- [ ] Opens from Import > Adv. SEQ
- [ ] Advanced options work

### 13.7 Progress Modal
- [ ] Shows during long operations
- [ ] Dismisses when complete

---

## 14. Canvas Interactions

- [ ] Canvas renders CharGrid correctly
- [ ] C64 border renders when borderOn is enabled
- [ ] VIC-20 mode applies scaleX(2) wide-pixel aspect
- [ ] CharPreviewOverlay shows selected char under cursor
- [ ] CharPosOverlay highlights cursor cell
- [ ] BrushOverlay shows brush stamp / live box preview
- [ ] BrushSelectOverlay shows selection region
- [ ] GridOverlay renders character-cell grid lines (Ctrl+G)
- [ ] Canvas statusbar updates: Size, X, Y, CHAR, SCRN, COLR

---

## 15. File Drag-and-Drop

- [ ] Drag .petmate file onto window opens it
- [ ] Drag PNG onto app opens PNG import flow
- [ ] Drag image file onto guide layer loads it (PNG, JPG/JPEG, GIF, BMP, WEBP)

---

## 16. Theme / Light Mode

- [ ] Dark mode: all panels, toolbar, menus styled correctly
- [ ] Light mode: all panels, toolbar, menus styled correctly
- [ ] System mode: follows OS theme
- [ ] Theme persists across app restart
- [ ] Panel backgrounds adapt to theme
- [ ] Toolbar icons adapt to theme
- [ ] Frame tabs adapt to theme

---

## 17. Cross-Platform (if applicable)

- [ ] Windows: menus, shortcuts, titlebar correct
- [ ] macOS: menus, shortcuts, app menu correct
- [ ] Linux: menus, shortcuts correct

---

## Notes

_(Use this space for observations, bugs found, and follow-up items)_

