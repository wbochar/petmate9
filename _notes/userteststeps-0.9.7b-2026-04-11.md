# Petmate 9 — Manual UI Test Steps (v0.9.7b — 2026-04-11)

**Version:** 0.9.7b
**Date:** 2026-04-11
**Tester:** _______________

---

## 1. Application Launch & Window

- [ ] Application opens without errors
- [ ] Window title displays correctly
- [ ] Default canvas (40x25) is created
- [ ] Left toolbar is visible (60px wide)
- [ ] Top frame tabs strip is visible
- [ ] Right collapsible panel column is visible (314px)
- [ ] Canvas statusbar is visible at bottom

---

## 2. Left Toolbar — Tools

### 2.1 Pan/Zoom
- [ ] Click icon activates Pan/Zoom mode
- [ ] Press `z` activates Pan/Zoom mode
- [ ] Scroll-wheel zoom works
- [ ] Pinch-to-zoom works (macOS trackpad)
- [ ] Double-click canvas resets zoom
- [ ] Hold Spacebar temporarily activates Pan/Zoom from any other tool

### 2.2 Select / Brush
- [ ] Click icon activates Brush mode
- [ ] Press `b` activates Brush mode
- [ ] Drag to select region captures brush
- [ ] Click with captured brush stamps it
- [ ] Stamp chars + colors (no modifier)
- [ ] Ctrl+stamp: chars only
- [ ] Alt+stamp: colors only
- [ ] Ctrl+Alt+stamp: raw (bypasses color remap)
- [ ] Right-click stamp: color stamp mode
- [ ] Escape with no brush: exits to Draw tool
- [ ] Shift+drag locks to horizontal or vertical axis

### 2.3 Draw (char + color)
- [ ] Click icon activates Draw mode
- [ ] Press `x` activates Draw mode
- [ ] Left-click draws selected char + color
- [ ] Right-click erases (space char / current color)
- [ ] Ctrl+right-click draws transparent character
- [ ] Alt+click eyedroppers char + color
- [ ] Ctrl+click picks color only
- [ ] Shift+drag locks to axis

### 2.4 Colorize (color only)
- [ ] Click icon activates Colorize mode
- [ ] Press `c` activates Colorize mode
- [ ] Drawing applies color only, leaves char unchanged

### 2.5 CharDraw (char only)
- [ ] Click icon activates CharDraw mode
- [ ] Press `0` activates CharDraw mode
- [ ] Drawing applies char only, leaves color unchanged

### 2.6 Keyboard Entry (Text)
- [ ] Click icon activates Text mode
- [ ] Press `t` activates Text mode
- [ ] Blinking text cursor overlay appears on canvas click
- [ ] Typing characters places PETSCII chars and advances cursor
- [ ] Shift+key types uppercase variant
- [ ] CapsLock toggles PETSCII caps
- [ ] Backspace deletes and moves cursor left
- [ ] Arrow keys move cursor
- [ ] Escape deactivates cursor (first press)
- [ ] Escape exits to Draw (second press)

### 2.7 Flood Fill
- [ ] Click icon activates Flood Fill mode
- [ ] Fill contiguous char+color region works correctly
- [ ] Escape exits to Draw

### 2.8 Separators (Lines)
- [ ] Click icon activates Separators mode
- [ ] Separators panel appears in right column
- [ ] Stamp separator brush on canvas
- [ ] Escape resets brush and exits to Draw

### 2.9 Boxes
- [ ] Click icon activates Boxes mode
- [ ] Boxes panel appears in right column
- [ ] Drag-to-region shows live box preview
- [ ] Release stamps the box using selected preset
- [ ] Escape resets brush and exits to Draw

### 2.10 Fade / Lighten
- [ ] Click icon activates Fade/Lighten mode
- [ ] Fade/Lighten panel appears in right column
- [ ] Hover shows replacement char preview
- [ ] Click applies fade/lighten
- [ ] Ctrl+click fades color by luminance
- [ ] Lighten / Darken toggle works
- [ ] Strength slider changes intensity
- [ ] Pick mode cycle (First / Random / Linear)
- [ ] Source dropdown (All Chars / AlphaNum / AlphaNum+ / PETSCII / Blocks)
- [ ] Escape exits to Draw

### 2.11 Crop / Resize
- [ ] Click icon opens Resize/Crop modal
- [ ] Modal allows changing width and height
- [ ] OK applies resize, Cancel aborts

### 2.12 Clear Canvas
- [ ] Click icon clears the canvas

### 2.13 Guide Layer Toggle
- [ ] Click icon toggles guide layer on/off
- [ ] Press `g` toggles guide visibility
- [ ] Guide Layer panel appears in right column when on

### 2.14 Border On/Off
- [ ] Plain click toggles current screen border
- [ ] Ctrl+click enables border on all screens
- [ ] Ctrl+Shift+click disables border on all screens
- [ ] Alt+click flips border on all screens

### 2.15 Border Color Picker
- [ ] Inline color picker selects border color

### 2.16 Background Color Picker
- [ ] Inline color picker selects background color

### 2.17 Preferences (Gear Icon)
- [ ] Click opens Settings/Preferences modal

---

## 3. Frame Tabs (Top Bar)

### 3.1 New Tab
- [ ] Click `+` button creates a new 40x25 screen
- [ ] Screen dimensions editor appears
- [ ] Alignment controls work

### 3.2 Tab Interaction
- [ ] Click tab switches to that screen
- [ ] Active tab is visually highlighted
- [ ] Tab shows scaled CharGrid preview
- [ ] Tab shows border color in outline
- [ ] Tab shows dimensions badge
- [ ] Tab name is editable (double-click or inline)
- [ ] Tabs are horizontally scrollable
- [ ] Tabs are sortable (drag to reorder)

### 3.3 Tab Context Menu (Right-Click)
- [ ] Copy option works
- [ ] Copy as PNG option works
- [ ] Paste option works
- [ ] Remove option works

### 3.4 Tab Navigation
- [ ] ArrowLeft goes to previous tab (no text cursor active)
- [ ] ArrowRight goes to next tab (no text cursor active)

---

## 4. Right Panel — Collapsible Panels

### 4.1 Colors Panel
- [ ] Panel displays color swatches for active charset
- [ ] C64 mode: full 16-color palette
- [ ] VIC-20 mode: 8 colors
- [ ] PET mode: restricted palette
- [ ] Click swatch selects foreground color
- [ ] Row mode toggle (1 or 2 rows)
- [ ] Color number visibility toggle
- [ ] Sort mode dropdown (Default / Light→Dark / Dark→Light)
- [ ] `q` steps to previous color
- [ ] `e` steps to next color
- [ ] Alt+1–8 selects colors 0–7
- [ ] Ctrl+1–8 selects colors 8–15
- [ ] Panel collapses/expands on header click

### 4.2 Characters Panel
- [ ] 16×17 character grid displayed
- [ ] Hover highlights character
- [ ] Click selects character
- [ ] Selected character is highlighted
- [ ] CharSelectStatusbar shows F:$hex/dec and P:$hex/dec
- [ ] FontSelector dropdown changes charset
- [ ] Panel collapses/expands on header click

### 4.3 Separators Panel (Lines Tool Active)
- [ ] Panel visible when Separators tool is active
- [ ] Header controls (SeparatorHeaderControls) functional
- [ ] Separator/DirArt-style line brush configuration works
- [ ] Panel hides when switching away from Separators tool

### 4.4 Boxes Panel (Boxes Tool Active)
- [ ] Panel visible when Boxes tool is active
- [ ] Header controls (BoxesHeaderControls) functional
- [ ] Box preset selection works
- [ ] Draw-mode toggle works
- [ ] Panel hides when switching away from Boxes tool

### 4.5 Fade / Lighten Panel (Fade Tool Active)
- [ ] Panel visible when Fade/Lighten tool is active
- [ ] FadeHeaderControls (pick mode cycle + source dropdown) work
- [ ] Lighten / Darken toggle
- [ ] Strength slider (1 – max)
- [ ] Pick mode selector
- [ ] Source dropdown
- [ ] Panel hides when switching away from Fade tool

### 4.6 Guide Layer Panel (Guide Active)
- [ ] Panel visible when guide toggle is on
- [ ] Show / hide guide button
- [ ] Load image (PNG, JPG, GIF, BMP, WEBP)
- [ ] Clear image button
- [ ] Fit image to canvas button
- [ ] Lock / unlock position button
- [ ] Crop-to-canvas toggle
- [ ] Convert to grayscale button
- [ ] Convert guide to PETSCII button
- [ ] D-pad nudge (up/down/left/right 1px)
- [ ] Draggable center dot for freehand repositioning
- [ ] X and Y numeric inputs
- [ ] Opacity slider + numeric field
- [ ] Scale slider + numeric field (10%–400%)
- [ ] Compass center drag does NOT create undo per pixel
- [ ] Text inputs suppress keyboard shortcuts on focus

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
- [ ] Export (⭡) button exports presets to new 24-wide screen
- [ ] Import (⭣) button imports from current screen
- [ ] Scale slider and option toggles at top
- [ ] Brush/Fill output controls
- [ ] 16×16 tiling preview

---

## 5. File Menu

- [ ] New Petmate Document: creates fresh document
- [ ] New 40x25 Screen (Ctrl+T): adds default screen
- [ ] New Screen submenu:
  - [ ] DirArt Small 16x10
  - [ ] DirArt Medium 16x20
  - [ ] DirArt Max 16x144
  - [ ] c128 40x25
  - [ ] c128 80x25
  - [ ] Vic20 22x23
  - [ ] Pet 40x25
  - [ ] Pet 80x25
- [ ] Open File (Ctrl+O): opens .petmate file
- [ ] Open Recent: shows recent files submenu
  - [ ] Recent file entries open correctly
  - [ ] Clear Recent clears the list
- [ ] Save (Ctrl+S): saves current file
- [ ] Save As (Ctrl+Shift+S): save to new location
- [ ] Send to Ultimate (Ctrl+Shift+1): sends to Ultimate 64
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
- [ ] Convert to Pet Mono (Ctrl+M)
- [ ] Strip Upper 8 Colours (Ctrl+U)
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
  - [ ] Emulator binary paths (C64, C128, PET 4032, PET 8032, VIC-20)
  - [ ] Browse buttons for each emulator
  - [ ] Reset to Defaults button
- [ ] **Convert tab:**
  - [ ] Tool selector (Petsciiator / img2petscii / Pet9scii Converter)
  - [ ] Use document background color checkbox
  - [ ] Petsciiator: dithering checkbox
  - [ ] img2petscii: matcher mode, mono mode, threshold slider
  - [ ] Pet9scii: dithering mode, SSIM weight slider
  - [ ] Reset to Defaults button
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
- [ ] Drag image file onto guide layer loads it

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

