# Petmate9 PETSCII Editor (wbochar "wb" version 0.9.x)

Originally written by nurpax, their version is linked below.
A Commodore 64 PETSCII graphics editor written in React/Redux/Electron.
Documentation & downloads: [https://nurpax.github.io/petmate/](https://nurpax.github.io/petmate/)

## Notes from Wolfgang

I really like working with PETSCII, also making DirArt which uses a subset of PETSCII. I pretty much exclusively use PETMATE, made by nurpax.
So, I started wanting more features and bug fixes so I pulled the last version from github (0.8.3) and started my own version (0.9.x) as PETMATE9.

if you want to mess with it, you can download then from the apps root:
npm install
npm start

be forewarned; do not go down the npm upgrade rabbit hole. there are so many extinct npm packages that you'll never come out from that hell.
I know that some of them are not safe, but really I don't care. I got trapped in the hole for a long time and decided not to pursue it without a priest and someone who's a better/experienced coder than myself.

I use VSCODE/Win11 as my dev env for this project.
required: npm install typescript@latest --save-dev
in order to pass the build and dist

general BS I've been encountering: I wanted [TAB] key to work like it does in Vice kb wise. the browser/electron something keeps messing with the tab key. I've decided to go with alt as my choice, but i'm not happy with it. when the whole thing is done maybe i'll go back to this one.

Below is what I've fixed and working on..

## fixes (weird bugs from v 0.8.x)

- [x] SEQ importer now supports long format SEQ files (GT 25 lines)
- [x] .c Exporter does not show the meta data for each frame, only the first one
- [x] Export/Import .c File and reload (multiple frames, odd sizes), currently this cannot read its own exported .c files..
- [ ] Zoom / Pan modes fix
- [ ] [LOW] Fix SEQ import to handle animation captures.
- [ ] [BUG] Click on left edge of char pallette to kill UI.
- [ ] There is some CSS thats bumping down the screen by 10px on initial click of the drawing surface.

## UI updates, ease of use and requests

- [x] Status Bar Addons: X:0 Y:0 C:$20/32 Size:40x25 SCRN: $0400/1024 CRAM: $D800/55296
- [x] Palette chip border 50% opacity on hover/select (easier to see whats selected)
- [x] Pencil Icons fix show differences between 3 modes
- [x] Wide Paint Brush icon to Stamp
- [ ] PNG imports a little more forgiving
- [ ] make icons 40x25 example (no matter what size they are)
- [ ] show frame count in title bar
- [ ] show active palette name above the colour chips
- [x] toolbar colour chips like modern image editors (eg photoshop)

## New Stuff

- [x] Keyboard color selector using 12345678 (+CTRL for 9-16) like c64 inputs
  - [x] Use "ALT" as c64 CTRL and "CTRL" as c64 C= key
- [x] New Char ROM for DirArt with Layout like ABC ROM
- [x] Add new DirArt + D to file menu
- [x] New DirArt auto defaults to DirArt ROM
- [ ] Paste between multiple petmate instances
- [ ] remove borders
- [ ] CTRL <- -> arrows moves selected frame in stack
- [ ] export to d64

## Intentions

### [ ] c64 text entry mode replacing the Text tool

- [x] change icon to keyboard
- [x] Use "ALT" as c64 CTRL and "CTRL" as c64 C= key
- [ ] [Maybe] import positional/translated charmaps from vice
- [ ] wire-up CLR SCREEN / HOME
- [ ] wire-up SHIFT DELETE
- [x] T Enables, ESC exists
- [ ] prefs added to select input modes
- [ ] RVS ON / OFF CTRL 9/0
- [ ] Enter key moves to next line

### [ ] Paint bucket flood fill, color swap and clear canvas

- [x] Clear Screen paint brush icon to paint bucket
- [ ] Flood Fill enable
- [ ] Screen Click: Flood Fill char and colour
- [ ] Screen CTRL Click: Flood Fill char
- [ ] Screen SHIFT Click: Flood File Colour
- [ ] CTRL Click Icon: clear canvas default
- [ ] CTRL SHIFT Click Icon: clear canvas Selected char/colour

### Select / Copy / Paste

- [ ] Select rectangle / copy
- [ ] paste to new frame
- [ ] show co-ordinates on the document palette and a crop button
- [ ] Paste to global clipboard as PNG/Bitmap or JSON

### [ ] Selection Tools: wand, square with shift/CTRL add remove from selection layer

- [ ] WithSelection: click "colour chip" for colour selection, click "char" to fill with char.
- [ ] figure out copy/paste and paste selection/stamp to new..

### [ ] Guide Layer

- [ ] load/show a guide layer
- [ ] move/zoom/pan layer
- [ ] change/toggle layer transparency
