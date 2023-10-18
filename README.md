# Petmate9 PETSCII Editor

## wbochar version: 0.91

Originally written by nurpax, their version (8.x) is [here](https://nurpax.github.io/petmate/).
Petmate9 is a Commodore 64 PETSCII graphics editor written in React/Redux/Electron, maintained by Wolfgang-Aaron Bochar (wbochar).

## Notes from Wolfgang

I like this tool for its simplicity and ease of use. I asked Nurpax if I could work on another version of it, trying to add some community requests and bug fixes. I am not a professional electron coder, so before reading some of the brutality contained in my updated sources: be kind. I'll take requests, but I do have a day job :)

## if you want to mess with it

- npm install
- npm start

be forewarned; do not go down the npm upgrade rabbit hole. there are so many extinct npm packages that you'll never come out from that hell.

I know that some of them are not safe, but really I don't care. I got trapped in the hole for a long time and decided not to pursue it without a priest and someone who's a better/experienced coder than myself.

I use VSCODE/Win11 as my dev env for this project.

required:

- npm install typescript@latest --save-dev

in order to pass the build and dist

## Current Tasks

- [ ] crop/resize frame
- [ ] review keyboard shortcuts old and new and make sure they do as they say
- [ ] global defaults should be in prefs and stored locally specific to machine
- [ ] record videos showing new tools and adjustments
- [ ] Update menu system with new features
- [ ] CTRL +/- Zoom in/out
- [ ] Zoom Reset for all frames (helpful for animations)
- [ ] Right click frame stack item submenu "Copy/Paste"
- [ ] Copy/Paste between multiple petmate instances, Brush / Frame Clipboard
- [ ] PNG imports a little more forgiving
- [ ] export to d64
- [ ] Border toggle needs to be removed from the undo chain

### Select / Copy / Paste

- [ ] copy should support multiple object types in clipboard
- [ ] paste to new frame
- [ ] show co-ordinates on the document palette and a crop button
- [ ] Paste to global clipboard as PNG/Bitmap or JSON
- [ ] CTRL-SHIFT-N: selection to new screen

### Guide Layer

- [ ] load/show a guide layer
- [ ] move/zoom/pan layer
- [ ] change/toggle layer transparency

## New things, requests and clean up

- [x] Clear Screen Icon now DumpsterFire
- [x] Flood Fill enable
- [x] Speed up flood fills
- [x] brush/stamp right click set mono paint mode
- [x] CTRL Right Click now paints a transparency block
- [x] petmate9 edited to Petmate 9
- [x] Brush Transparency
- [x] Brush/Stamp modes (RAW, Char/Color, Color, Char, ColorStamp)
- [x] Zoom Wheel + CTRL modifier to center document (as opposed to mouse pointer)
- [x] Zoom Wheel CTRL + SHIFT modifier to Upper Left Corner (as opposed to mouse pointer)
- [x] Petmate9 installs to its own area and will co-exist with older versions
- [x] Font/Char palette now shows F:0/0h (position in font) and p:0/0h for PETSCII charcode value
- [x] New Icons for application and toolbar (Windows, Linux, OSX)
- [x] Dark Theme mode enabled for windows/macosx
- [x] mouse pointer is affected by tool select and spacebar move/pan
- [x] Select rectangle / copy
- [x] Text/Plain clipboard paste into text tool. Can take Upper/lowercase and respect \r\n in the text stream
- [x] Zoom needs to be stepped (no fractional zoom levels)
- [x] FontAwesome / Tool Icons can now accept null and be blank (or use HTML only elements)
- [x] "Attitude" bug: Check file loader/border defaults affecting initial grid placement.
- [x] SEQ Export: Insert active font bytes, (0x0E) lower charset or (0x8E) for upper charset
- [x] Right mouse button now works like an eraser in drawing modes (uses char $20/32 and current color)
- [x] make icons 40x25 example (no matter what size they are)
- [x] wire-up CLR SCREEN / HOME
- [x] [BUG] Click on left edge of char pallette kills UI.
- [x] [BUG] Status updating outsize of Screen dimensions
- [x] [BUG] There is some CSS thats bumping down the screen by 10px on initial click of the drawing surface.
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

## Fixed (bugs from v 0.8.x)

- [x] SEQ importer now supports long format SEQ files (GT 25 lines)
- [x] .c Exporter does not show the meta data for each frame, only the first one
- [x] Export/Import .c File and reload (multiple frames, odd sizes), currently this cannot read its own exported .c files..

### Someday

- [ ] [SOMEDAY?] Fix SEQ import to handle animation captures.

Nurpax version info:
Documentation & downloads: [https://nurpax.github.io/petmate/](https://nurpax.github.io/petmate/)


"@types/yargs": "^17.0.25",

