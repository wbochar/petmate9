# Petmate9 PETSCII Editor (wbochar "wb" version 0.91)

Originally written by nurpax, their version (8.x) is [here](https://nurpax.github.io/petmate/).
Petmate9 is a Commodore 64 PETSCII graphics editor written in React/Redux/Electron.

## Notes from Wolfgang

I like this tool for its simplicity and ease of use. I asked Nurpax if I could work on another version of it, trying to add some community requests and bug fixes. I am not a professional electron coder, so before reading some of the brutality contained in my updated sources: be kind. I'll take requests, but I do have a day job :)

## if you want to mess with it, you can download then from the apps root

npm install
npm start

be forewarned; do not go down the npm upgrade rabbit hole. there are so many extinct npm packages that you'll never come out from that hell.

I know that some of them are not safe, but really I don't care. I got trapped in the hole for a long time and decided not to pursue it without a priest and someone who's a better/experienced coder than myself.

I use VSCODE/Win11 as my dev env for this project.
required: npm install typescript@latest --save-dev
in order to pass the build and dist

## Priority/Current Tasks

- [ ] CTRL +/- Zoom in/out
- [ ] [BUG] Click on left edge of char pallette kills UI.
- [ ] There is some CSS thats bumping down the screen by 10px on initial click of the drawing surface.
- [ ] PNG imports a little more forgiving
- [ ] make icons 40x25 example (no matter what size they are)
- [ ] show frame count in title bar
- [ ] show active palette name above the colour chips
- [ ] Paste between multiple petmate instances
- [ ] export to d64
- [ ] crop resize frame
- [ ] wire-up CLR SCREEN / HOME
- [ ] wire-up SHIFT DELETE

## Fixed (bugs from v 0.8.x)

- [x] SEQ importer now supports long format SEQ files (GT 25 lines)
- [x] .c Exporter does not show the meta data for each frame, only the first one
- [x] Export/Import .c File and reload (multiple frames, odd sizes), currently this cannot read its own exported .c files..

## New things, requests and clean up

- [x] Initial Zoom mode to cover the size of the document area
- [x] Zoom value in statusbar
- [x] Zoom using mouse wheel is available in all tools
- [x] border on/off per document (new toolbar entry)
- [x] 40x25 ratio for thumbnail previews (force odd sizes to the same shape/size)
- [x] include dimensions in thumbnail icon
- [x] move new document to front of the line as opposed to the caboose in the thumbnail list
- [x] Status Bar Addons: X:0 Y:0 C:$20/32 Size:40x25 SCRN: $0400/1024 CRAM: $D800/55296
- [x] Palette chip border 50% opacity on hover/select (easier to see whats selected)
- [x] Pencil Icons fix show differences between 3 modes (added a little A for text mode)
- [x] Wide Paint Brush icon to Select Dashed Square
- [x] toolbar colour chips like modern image editors (ex: photoshop)
- [x] Text tool is closer to c64 screen editor text entry wise
  - [x] Keyboard color selector using 12345678 (+CTRL for 9-16) like c64 inputs
  - [x] Use "ALT" as c64 CTRL and "CTRL" as c64 C= key
  - [x] CAPS Lock now work in the text editor as RVS/ON Off
  - [x] Enter now works (CR/LF)
  - [x] New Char ROM for DirArt with Layout like ABC ROM
- [x] Add new DirArt + D to file menu
- [x] New DirArt auto defaults to DirArt ROM
- [x] borders are now the same as c64 ratios and scale with the zoom. They can be toggled in each PETSCII frame in the stack independently
- [x] CTRL <- -> arrows moves selected frame in the stack left/right

### [ ] Paint bucket flood fill, color swap and clear canvas

- [ ] Flood Fill enable
- [ ] Screen Click: Flood Fill char and colour
- [ ] Screen CTRL Click: Flood Fill char
- [ ] Screen SHIFT Click: Flood File Colour
- [ ] CTRL Click Icon: clear canvas default
- [ ] CTRL SHIFT Click Icon: clear canvas Selected char/colour

### Select / Copy / Paste

- [x] Select rectangle / copy
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

### [ ] Someday

- [ ] [SOMEDAY?] Fix SEQ import to handle animation captures.



Nurpax version info:
Documentation & downloads: [https://nurpax.github.io/petmate/](https://nurpax.github.io/petmate/)
