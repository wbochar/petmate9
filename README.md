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

docker run --rm -ti -v C:\C64\Projects\_Petmate\petmate9\:/petmate9 -w /petmate9 electronuserland/buildernpm

## Current build types

Sometimes you may need..
npm install typescript@latest -D

PC: NSIS/.exe (via main dev PC)
MacOs: intel and amd 64bit (via macos laptop)
Linux: deb,apk,freebsd,pacman,p5p,rpm (via docker)

Notes: "electron-builder": "23.6.0", for MACOS
"electron-builder": "22.10.5", for PC

## Current Tasks (0.9.6)

- [ ] border on all frames from menu and button in frame bar
- [ ] after using a menu shortcuts (alt f) alt is trapped on
- [ ] Adjust *something* to make touch pad pinch/zoom usable
- [ ] Middle mouse Button Pan Control
- [ ] Recent Files menu
- [ ] Zoom Level display
- [ ] Dirart Clip Art
- [ ] Texture Generator
- [ ] Font Pack
- [ ] Gradient Shader
- [ ] lvllvl style character palette layout
- [ ] Light to Dark character palette layout
- [ ] Custom Layout (and save)
- [ ] complex copy and paste: selection (inter program copy), frame to frame, byte-array (string), png
- [ ] Anim player export
- [ ] Wide/Long Screen export
- [ ] Faux Terminal BBS export prg
- [ ] Guide Layer and adjustment controls
- [ ] Guide Layer to Frame conversion

## Competed Tasks (0.9.6)

## Competed Tasks (0.9.5)

Note: I migrated c1541.git (repo) internally. It seems that the commander and other aspects of the repo do not work well with macosx. I don't need an external c1541 console app so now x1541.ts will handle all D64 operations internally

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
