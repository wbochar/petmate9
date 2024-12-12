# Petmate 9 PETSCII Editor

## wbochar working version: 0.9.4

Originally written by nurpax, their version (8.x) is [here](https://nurpax.github.io/petmate/).
Petmate9 is a cross platform PETSCII graphics editor written in React/Redux/Electron, maintained by Wolfgang-Aaron Bochar (wbochar).

## Notes from Wolfgang

I like this tool for its simplicity and ease of use. I asked Nurpax/Janne if I could work on another version of it, trying to add some community requests and bug fixes. I am not a professional electron coder, so before reading some of the brutality contained in my updated sources: be kind. I'll take requests, but I do have a day job :)

## if you want to mess with it

- npm install
- npm start

be forewarned; do not go down the npm upgrade rabbit hole. there are so many extinct npm packages that you'll never come out from that hell.

I know that some of them are not safe (or up-to-date), but really I don't care. I got trapped in the hole for a long time and decided not to pursue it without a priest and someone who's a better/experienced coder than myself.

I use VSCODE/Win11 as my dev env for this project.

Change Log/History: [CHANGELOG.md](https://github.com/wbochar/petmate9/blob/main/CHANGELOG.md)

## Docker Command

docker run --rm -ti -v C:\C64\Projects\_Petmate\petmate9\:/petmate9 -w /petmate9 electronuserland/builder

## Current build types

Sometimes you may need..
npm install typescript@latest -D

PC: NSIS/.exe (via main dev PC)
MacOs: intel and amd 64bit (via macos laptop)
Linux: deb,apk,freebsd,pacman,p5p,rpm (via docker)

Notes: "electron-builder": "23.6.0", for MACOS
"electron-builder": "22.10.5", for PC

## Current Bugs (0.9.6 from previous revisions as well)

- [ ] Group/frame zoom not zooming/aligning the last frame in the stack
- [ ] after using a menu shortcuts (alt f) alt is trapped on

## Pre-Release Checklist of 0.9.6

- [ ] Do all of these on each major release platform PC-MacOS-Linux
  - [ ][ ][ ] Load one of everything file type
  - [ ][ ][ ] Drag and Drop Imports
  - [ ][ ][ ] Copy and paste frame internally
  - [ ][ ][ ] Copy and paste frame between instances
  - [ ][ ][ ] CopyPNG and paste to default bitmap editor
  - [ ][ ][ ] Import / Export Vanilla Dirart (internally and vs DirMaster)
  - [ ][ ][ ] Import / Export Wide Format Dirart (internally and vs DirMaster)
  - [ ][ ][ ] Import / Export Full Illegal dirart Charset (internally and vs DirMaster)
  - [ ][ ][ ] Check All keyboard commands
  - [ ][ ][ ] Check All menu commands
  - [ ][ ][ ] Review all exports/with transparency blocks
  - [ ][ ][ ] Review File/block level exports of various cbase text/prg files

## Exporter / Player Tasks

- [x] Dialog Fixes/Issues
  - [x] Remove options that are not working yet
  - [x] Set Default SID to false
- [ ] Macro's need to be assigned to each computer type
  - [x] c64
  - [x] pet
  - [ ] vic20
  - [ ] c16
  - [x] c128
- [ ] Music for PET, VIC, C16?
- [x] Move JS and other files to assets folder
- [ ] Single Frame Implementation
  - [ ] c64
  - [ ] pet
  - [ ] vic20
  - [ ] c16
  - [ ] c128
- [ ] Music with Single Frame Implementation
  - [ ] c64 (sid)
  - [ ] pet
  - [ ] vic20
  - [ ] c16
  - [ ] c128
- [ ] SID for 128?
- [ ] Compression stage at the end? is there JS compression?
- [ ] Tests
  - Song Numbers
  - Max average ram for non-single types

## Bug list 0.9.6 BETA6

## Current Tasks (0.9.6)

- [ ] ----- Misc Stuff ------------------------------------
  - [ ] Recent Files Menu
  - [ ] Update File format version
  - [ ] Review JSON Structure on save/load
  - [ ] Loading of large petmate files should show loading screen progress
  - [ ] vic20 display needs to be stretch horizontally 1.53

## Competed Tasks (0.9.6)

- [x] Status screen needs ram/colour/chars adjusted for various computer types
- [x] Pick a Pet Colour mode (other than petwhite), main UI colour picker/framebuffer/frametabs still has white selected
- [x] ----- Ultimate64 ------------------------------------
  - [x] Send to Ultimate Menu Item
  - [x] UltimateAddress Settings UI and store configure
  - [x] Quick Send only works with c64 Ultimate, so use only charset upper/lower and 40x25
- [x] ----- CBASE Tweaks and adjustments ------------------
  - [x] cbase: the max size of the export prompts file is 4608 decimal bytes plus 2 bytes for load address
  - [x] LASTYLE: Floating colours need to be added with transparency blocks
  - [x] LASTYLE: Character Palette status needs to have extended chars mapped properly (see transparency, RVS, cursor commands)
- [x] ----- Vic20 Related ---------------------------------
  - [x] Vic20 Toolbar Color Palettes lock BD to 8 and BG to 16
  - [x] Add vic20 palette to master palette list
  - [x] Add vic20 Pal Palette
  - [x] vic20 asm add upper/lower code
  - [x] vic20 strip upper 8 colours
- [x] ----- Misc ------------------------------------------
  - [x] tweak default editor window to the same size as the initial content
  - [x] Copy (frame/png) and paste to main menu Edit:
  - [x] Initial document always has wrong zoom level. Something about the initial state of the editor has to be adjusted.
  - [x] what is the pet white and pet green colours?
  - [x] Image -> Convert to Mono
  - [x] make loading/importing screens look nicer
  - [x] Make Extra ROM character command strip a separate file that gets bolted on during load
  - [x] Remove excess transparency char ($60/96) from rom data
  - [x] cbase import grab last colour
  - [x] All export windows / modals adapt to content size
  - [x] colour swaps (ctrl click)
  - [x] char swaps (ctrl click)
- [x] ----- Crop Window -----------------------------------
  - [x] Get current size into WxH
- [x] ----- Copy and Paste 096 ----------------------------
  - [x] Inter Instance Frame Copy/Paste (right click)
  - [x] Frame to Clipboard as image/png
- [x] ----- New: Additional Charsets ----------------------
  - [x] Pet GFX/Biz
  - [x] c128 U/L
  - [x] c64 Swedish3 U/L
  - [x] vic20 U/L
  - [x] c16 U/L
- [x] Fontawesome and Supporting have been updated to current versions (as of 3/7/2024)
- [x] General UI: Move Component Palettes to top of UI and shift frame stack around it
- [x] selections should be slightly transparent to make placement easier
- [x] selections / brushes should colour cycle slightly to show they are highlighted and not drawing
- [x] Shadow Characters (Icon Suggestion) Same FG/BG character colours makes colour palette useless
- [x] cbase bbs prompt support
  - [x] Loader to frames
  - [x] Start Prompt Numbering at 1
  - [x] Loader crops to max content
  - [x] add custom charset?
  - [x] Exporter
  - [x] Expand CharSets from special chars (transparency, f1, f3, f5, f7, clrhome, cursor N-S-E-W)
  - [x] loader progress modal
- [x] Thumbnails dimensions "40x25" colour needs to be readable ona light and dark pics
- [x] ----- New: Add New file Sub menu --------------------
  - [x] 40x25 (Default)
  - [x] Vic20 AxB
  - [x] Pet 80x25
  - [x] Dirart Short
  - [x] Dirart Maximum Size
- [x] ----- Transparency updates --------------------------
  - [x] show transparent blocks as rga(0,0,0,0) and and option to turn it on and off
  - [x] use for brushes to have see though transparent blocks, also consider turning off and on when keyboard modifiers are active.
  - [x] Repair Transparency Code to use new char
- [x] ----- Dirart updates --------------------------------
  - [x] Colour Dirart char palette 'invalid' chars red
  - [x] Colour Dirart Editor 'invalid' screen chars  red
  - [x] Modify exporter/importer to support invalid chars for special commands
  - [x] Wide format export for dirart (using shift del and command codes)

## Competed Tasks (0.9.5)

Note: I migrated c1541.git (repo) internally. It seems that the commander and other aspects of the repo do not work well with macosx. I don't need an external c1541 console app so now x1541.ts will handle all D64 operations internally

- [x] Copy Paste from one Petmate to another still only works when i toggled the charset to C64lower instead of cbase lower.
- [x] Colour Palette margin/padding issues on some linux versions. Test in debian works fine
- [x] MacOSX does not like c1541 js, need to figure out. Ended up migrating c1541.git to x1541 internally.
- [x] Update MACOS menu shortcuts to match PC/Linux
- [x] Top-left/Center align all frames in stack buttons (below add button)
- [x] Top-left/Center align all frames in Menu System
- [x] bring back the zoom level status bar item
- [x] gap between SCRN/COLR increased for larger numbers in wide/long format images (had to be huge)
- [x] OCD margin/padding at end of frame stack
- [x] Update MAC versions with new Menu system
- [x] fix scaling and css border issues that was leaving artifacts at some zoom levels
- [x] Make New Document button left locked to the UI
- [x] Zoom Menu Items wired up
- [x] Selection/Brush to new image in stack
- [x] Docker Setup for multiple version of Linux (DEB, REP, )
- [x] CTRL SHIFT +/- ZOOM Upper Left Aligned (CTRL ALT 0 sets scale 1)
- [x] CTRL +/- ZOOM Center Aligned (CTRL ALT 0 sets scale 1)
- [x] Invert Brush
- [x] Clear Brush
- [x] remove Frame (menu/key)
- [x] duplicate frame (menu/key)
- [x] Add all p8 applicable KB: commands to menus
- [x] Issues link now points: [Issues](https://github.com/wbochar/petmate9/issues)
- [x] Border shortcut key
- [x] grid added to menu
- [x] 'View' menu now holds zoom features and Original 'View' menu is renamed 'Tools'
- [x] BUG: Menu Accelerator CTRL ++ not showing up properly
- [x] Create a new Help Link (old one points to nurpax site) [Help](https://wbochar.com/petmate9)
- [x] Update menu system with new features (Crop, Fill, Paste text, etc)

### Wishful thinking / Someday

- [ ] Adjust SEQ import to handle animation captures (SHIFT/CLRHOME=New Frame etc..)
- [ ] copy should support multiple object types in clipboard
- [ ] Paste to global clipboard as PNG/Bitmap or JSON
- [ ] Guide Layer: load/show a guide layer
- [ ] Guide Layer: move/zoom/pan layer
- [ ] Guide Layer: change/toggle layer transparency
- [ ] PNG imports a little more forgiving
- [ ] c1541 Script export
- [ ] Gradient, shader, texture generator (tak-o-vision)
- [ ] Make Dark/Light Mode actually work.. sigh.

### Distribution

- [x] Setup Website
- [ ] record videos showing new tools and adjustments
- [ ] Instruction Manual

## Keyboard/Menu Shortcuts

- Menu "File"
  - [x] Menu KB: (ALT F)
  - Action: New PETMATE document
  - [x] Menu KB: (ALT F, N)
- Action: New PETSCII image (40x25)
  - [x] KB: (CTRL) T
  - [x] Menu KB: (ALT F, C)
- Action: New Dirart Image (16x32)
  - [x] KB: (CTRL) D
  - [x] Menu KB: (ALT F, D)
- Action: Open PETMATE File
  - [x] KB: (CTRL) O
  - [x] Menu KB: (ALT F, O)
- Action: Save PETMATE FILE
  - [x] KB: (CTRL) S
  - [x] Menu KB: (ALT F, S)
- Action: Save PETMATE file as
  - [x] KB: (CTRL+SHIFT) S
  - [x] Menu KB: (ALT F, A)
- Action: Fonts
  - [x] Menu KB: (ALT F, F)

- Action: Import D64
  - [x] Menu KB: (ALT F, I, D)
- Action: Import PETSCII (.c)
  - [x] Menu KB: (ALT F, I, C)
- Action: Import PNG
  - [x] Menu KB: (ALT F, I, P)
- Action: Import SEQ
  - [x] Menu KB: (ALT F, I, S)

- Action: Export Assembler Source (.asm)
  - [x] Menu KB: (ALT F, E, A)
- Action: Export BASIC (.bas)
  - [x] Menu KB: (ALT F, E, B)
- Action: Export D64
  - [x] Menu KB: (ALT F, E, D)
- Action: Export Executable (.prg)
  - [x] Menu KB: (ALT F, E, E)
- Action: Export GIF
  - [x] Menu KB: (ALT F, E, G)
- Action: Export JSON
  - [x] Menu KB: (ALT F, E, J)
- Action: Export PETSCII (.c)
  - [x] Menu KB: (ALT F, E, C)
- Action: Export PNG
  - [x] Menu KB: (ALT F, E, P)
- Action: Export SEQ
  - [x] Menu KB: (ALT F, E, S)
- Action: Export PET (.pet)
  - [x] Menu KB: (ALT F, E, T)

- Menu "Edit"
  - [x] Menu KB: (ALT E)
- Action: Undo
  - [x] KB: (CTRL) Z
  - [x] Menu KB: (ALT E, U)
- Action: Redo
  - [x] KB: (CTRL) Y
  - [x] Menu KB: (ALT E, R)
- Action: Paste Text
  - [x] KB: (CTRL) V
  - [x] Menu KB: (ALT E, T)
- Action: Preferences
  - [x] KB: (CTRL) P
  - [x] Menu KB: (ALT E, P)

- Menu "Selection"
  - [x] Menu KB: (ALT S)
- Action: Select All
  - [x] KB: (CTRL) A
  - [x] Menu KB: (ALT S, A)
- Action: Paste to New Image
  - [x] KB: (CTRL) N
  - [x] Menu KB: (ALT S, N)
- Action: Clear Selection
  - [x] KB: (CTRL+HOME)
  - [x] Menu KB: (ALT S, C)
- Action: Rotate Left
  - [x] KB: (CTRL) [
  - [x] Menu KB: (ALT S, L)
- Action: Rotate Right
  - [x] KB: (CTRL) ]
  - [x] Menu KB: (ALT S, R)
- Action: Flip Horizontally
  - [x] KB: H
  - [x] Menu KB: (ALT S, H)
- Action: Flip Vertically
  - [x] KB: V
  - [x] Menu KB: (ALT S, V)
- Action: Invert Characters
  - [x] KB: (CTRL) I
  - [x] Menu KB: (ALT S, I)

- Menu "Frames"
  - [x] Menu KB: (ALT R)
- Action: Align All Frames Top-Left 2x Zoom
  - [x] KB: (CTRL+ALT+SHIFT) 9
  - [x] Menu KB: (ALT R, T)
- Action: Align All Frames Centered 2x Zoom
  - [x] KB: (CTRL+ALT) 9
  - [x] Menu KB: (ALT R, C)
- Action: Move Frame Left in Stack
  - [x] KB: (CTRL) Left Arrow
  - [x] Menu KB: (ALT R, L)
- Action: Move Frame Right in Stack
  - [x] KB: (CTRL) Right Arrow
  - [x] Menu KB: (ALT R, R)
  - Action: Duplicate Frame
  - [x] KB: Insert key
  - [x] Menu KB: (ALT R, D)
- Action: Remove Frame
  - [x] KB: Delete key
  - [x] Menu KB: (ALT R, I)

- Menu "View"
  - [x] Menu KB: (ALT V)
- Action: Zoom In (centered)
  - [x] KB: (CTRL) =
- Action: Zoom Out (centered)
  - [x] KB: (CTRL) -
- Action: Zoom In (left-top)
  - [x] KB: (CTRL+SHIFT) +
- Action: Zoom In (left-top)
  - [x] KB: (CTRL+SHIFT) -
- Action: Zoom x2 (centered)
  - [x] KB: (CTRL) 9
- Action: Zoom x2 (left-top)
  - [x] KB: (CTRL+SHIFT) 9

- Menu "Tools"
  - [x] Menu KB: (ALT T)
- Action: Reload
  - [x] KB: (CTRL) R
  - [x] Menu KB: (ALT T, R)
- Action: Toggle Light/Dark Mode
  - [x] KB: (CTRL) M
  - [x] Menu KB: (ALT T, L)
- Action: Toggle Full Screen
  - [x] KB: F11
  - [x] Menu KB: (ALT T, F)
- Action: Toggle Developer Tools
  - [x] KB: (CTRL+ALT) I
  - [x] Menu KB: (ALT T, D)

- Menu "Help"
  - [x] Menu KB: (ALT H)
- Action: Online Documentation
  - [x] KB: F11
  - [x] Menu KB: (ALT H, D)
- Action: Search Issues Online
  - [x] KB: (CTRL) F1
  - [x] Menu KB: (ALT H, S)
- Action: About
  - [x] Menu KB: (ALT H, A)
