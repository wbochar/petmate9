# Change Log: Petmate 9 (Current Version 0.9.4)

## Changes (0.9.4)

- [x] After Editing/Saving then File/New shows the old filename in the titlebar
- [x] Added **New File** as blank filename in titlebar
- [x] D64 export window needs header and ID input boxes
- [x] D64 export window Needs explanation paragraph about inputs
- [x] Petmate File/Open defaults borderOn:true (should load from file or false)
- [x] Remove debugging console.log's
- [x] right click floodfill does blank char
- [x] ctrl right click floodfill does transparency char
- [x] esc key resets to pencil (From Keyboard, FloodFill and Brush)
- [x] reset tool if character palette is clicked and the current tool is not fill or pencils
- [x] add marching ants to brush/selector to give active visual feedback about what tool is in use.
- [x] MacOS Bug Fixes (Folder Path Issues)
- [x] MacOS DMG maker breaks from Python Script fail
- [x] Test file imports on MAC/Unix (filename separators issues)

## Changes (0.9.3)

- [x] export to d64
- [x] moved gif exporter to gifenc

## Changes (0.9.2)

- [x] Drag and Drop Import Files now works (.c, .seq, .d64)
- [x] Get Mac compiles working
- [x] BUG: seq import makes a 500px long image not matter what..
- [x] modal's and UI crop/resize frame
- [x] crop/resize frame
- [x] Import of D64, SEQ and .C files now take the filename (without ext) as their name
- [x] Import of D64 now loads the correct charset and sets border off on import
- [x] BUG: PNG import crashes from missing new props

## New things, requests and clean up (0.9.1)

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

Nurpax version info:
Documentation & downloads: [https://nurpax.github.io/petmate/](https://nurpax.github.io/petmate/)
