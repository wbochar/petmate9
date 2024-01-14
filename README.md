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

Notes: "electron-builder": "23.6.0", for MACOS
"electron-builder": "22.10.5", for PC
"deb,apk,freebsd,pacman,p5p,rpm"

docker run --rm -ti -v C:\C64\Projects\_Petmate\petmate9\:/petmate9 -w /petmate9 electronuserland/buildernpm

## Current Tasks (0.9.5)

- [ ] review keyboard shortcuts old and new and make sure they do as they say
- [ ] Make Dark/Light Mode actually work.. sigh.
- [ ] Colour Palette margin/padding issues on some linux versions
- [ ] Adjust *something* to make touch pad pinch/zoom usable
- [ ] Update MAC versions with new Menu system

## Competed Tasks (0.9.5)

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
- [x] Add all p8 applicable kb commands to menus
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
- [ ] Zoom Reset for all frames (helpful for animations)

### Distribution

- [x] Setup Website
- [ ] record videos showing new tools and adjustments
- [ ] Instruction Manual
