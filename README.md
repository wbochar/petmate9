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

## Current Tasks (0.9.4)

- [ ] CTRL +/-/0 Zoom in/out/100%
- [ ] Test file imports on MAC/Unix (filename separators issues)
- [ ] review keyboard shortcuts old and new and make sure they do as they say
- [ ] Update menu system with new features (Crop, Fill, Paste text, etc)
- [ ] remove Zoom State from everything
- [ ] Remove Debug Menu Item
- [ ] MacOS Bug Fixes (Folder Path Issues)
- [ ] MacOS DMG maker breaks from Python Script fail

## Competed Tasks (0.9.4)

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

### Wishful thinking / Someday

- [ ] Adjust SEQ import to handle animation captures (SHIFT/CLRHOME=New Frame etc..)
- [ ] copy should support multiple object types in clipboard
- [ ] paste to new frame
- [ ] Paste to global clipboard as PNG/Bitmap or JSON
- [ ] CTRL-SHIFT-N: selection to new screen
- [ ] Guide Layer: load/show a guide layer
- [ ] Guide Layer: move/zoom/pan layer
- [ ] Guide Layer: change/toggle layer transparency
- [ ] PNG imports a little more forgiving
- [ ] c1541 Script export
- [ ] Zoom Reset for all frames (helpful for animations)

### Distribution

- [ ] Setup Website
- [ ] record videos showing new tools and adjustments
- [ ] Instruction Manual
