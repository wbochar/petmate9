# Petmate PETSCII Editor (wbochar "wb" version)

Originally written by nurpax, their version is linked below.
A Commodore 64 PETSCII graphics editor written in React/Redux/Electron.
Documentation & downloads: [https://nurpax.github.io/petmate/](https://nurpax.github.io/petmate/)

## wbochar updates, fixes and tweaks

## fixes

- [Done] SEQ importer now supports long format SEQ files (GT 25 lines)
- [] Export .c File and reload (multiple frames, odd sizes)
- [] Zoom / Pan modes fix
- [] [LOW] Fix SEQ import to handle animation captures.
- [] [BUG] Click on left edge of char pallette to kill UI.

## UI updates

- [Done] Status Bar Addons: X:0 Y:0 C:$20/32 Size:40x25 SCRN: $0400/1024 CRAM: $D800/55296
- [Done] Palette chip border 50% opacity on hover/select (easier to see whats selected)
- [Done] Pencil Icons fix show differences between 3 modes
- [Done] Wide Paint Brush icon to Stamp
- [] PNG imports a little more forgiving
- [] make icons 40x25 example (no matter what size they are)
- [] show frame count in title bar
- [] show active palette
- [Done] toolbar colour chips like photoshop

## New Stuff

- [Done] Keyboard color selector using 12345678 (+CTRL for 9-16) like c64 inputs
- [Done] New Char ROM for DirArt with Layout like ABC ROM
- [Done] Add new DirArt + D to file menu
- [Done] New DirArt auto defaults to DirArt ROM
- [] Paste between multiple petmate instances
- [] remove borders
- [] CTRL <- -> arrows moves selected frame in stack
- [] export to d64

## Intentions

### [] c64 text entry mode replacing the Text tool

- [Done] change icon to keyboard
- [] import positional/translated charmaps from vice
- [] wire-up CLR SCREEN / HOME
- [] wire-up SHIFT DELETE
- [] Enter Enables, ESC exists
- [] prefs added to select input modes

### [] Paint bucket flood fill, color swap and clear canvas

- [Done] Clear Screen paint brush icon to paint bucket
- [] Flood Fill enable
- [] Screen Click: Flood Fill char and colour
- [] Screen CTRL Click: Flood Fill char
- [] Screen SHIFT Click: Flood File Colour
- [] CTRL Click Icon: clear canvas default
- [] CTRL SHIFT Click Icon: clear canvas Selected char/colour

### Select / Copy / Paste

- [] Select rectangle / copy
- [] paste to new frame
- [] show co-ordinates on the document palette and a crop button
- [] Paste to global clipboard as PNG/Bitmap or JSON

### [] Selection Tools: wand, square with shift/CTRL add remove from selection layer

- [] WithSelection: click "colour" for tint selection, click "char" to fill with char.
- [] figure out copy/paste and paste selection/stamp to new..

### [] Guide Layer

- [] load/show a guide layer
- [] move/zoom/pan layer
- [] change/toggle layer transparency
