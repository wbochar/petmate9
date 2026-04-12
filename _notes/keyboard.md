# Petmate 9 — Keyboard Shortcuts

Shortcuts are sourced from `public/menu.js` (menu accelerators) and `src/redux/toolbar.ts` (in-app key handler).

On macOS, `Cmd` is used where Windows/Linux uses `Ctrl`, except where noted.

---

## File

| Action | macOS | Windows / Linux |
|---|---|---|
| New 40×25 Screen | `Cmd+T` | `Ctrl+T` |
| Open File | `Cmd+O` | `Ctrl+O` |
| Save | `Cmd+S` | `Ctrl+S` |
| Save As | `Cmd+Shift+S` | `Ctrl+Shift+S` |
| Export Petmate Player (.prg) | `Cmd+Shift+X` | `Ctrl+Shift+X` |
| Preferences | `Cmd+,` | `Ctrl+P` |

---

## Ultimate (File → Ultimate)

| Action | macOS | Windows / Linux |
|---|---|---|
| Send to Ultimate | `Cmd+Shift+1` | `Ctrl+Shift+1` |
| Push to Ultimate (no reset) | `Cmd+Shift+3` | `Ctrl+Shift+3` |
| Import Screen from Ultimate | `Cmd+Shift+2` | `Ctrl+Shift+2` |
| Import Charset from Ultimate | — | — |
| Play SID on Ultimate | — | — |
| Export D64 to Ultimate | `Cmd+Shift+4` | `Ctrl+Shift+4` |
| Reset Ultimate | — | — |

---

## Edit

| Action | macOS | Windows / Linux |
|---|---|---|
| Undo | `Cmd+Z` | `Ctrl+Z` |
| Redo | `Cmd+Shift+Z` | `Ctrl+Y` |
| Copy Frame | `Cmd+C` | `Ctrl+C` |
| Copy Frame as PNG | `Cmd+Shift+C` | `Ctrl+Shift+C` |
| Paste Frame | `Cmd+Shift+V` | `Ctrl+V` |
| Paste Text (into text tool) | `Cmd+Alt+V` | `Ctrl+Shift+V` |

---

## Image

| Action | macOS | Windows / Linux |
|---|---|---|
| Shift Canvas Left | `Alt+Left` | `Alt+Left` |
| Shift Canvas Right | `Alt+Right` | `Alt+Right` |
| Shift Canvas Up | `Alt+Up` | `Alt+Up` |
| Shift Canvas Down | `Alt+Down` | `Alt+Down` |
| Toggle Border On/Off | `Cmd+B` | `Ctrl+B` |
| Toggle Grid On/Off | `Cmd+G` | `Ctrl+G` |
| Crop / Resize | `Cmd+\` | `Ctrl+\` |
| Convert to Mono | `Cmd+Shift+M` | `Ctrl+M` |
| Strip Upper 8 Colors | — | `Ctrl+U` |
| Clear Image | `Shift+Home` | `Shift+Home` |

---

## Selection

| Action | macOS | Windows / Linux |
|---|---|---|
| Select All | `Cmd+A` | `Ctrl+A` |
| Paste to New Image | `Cmd+N` | `Ctrl+N` |
| Clear Selection | `Cmd+Home` | `Ctrl+Home` |
| Rotate Left | `Cmd+[` | `Ctrl+[` |
| Rotate Right | `Cmd+]` | `Ctrl+]` |
| Flip Horizontally | `H` | `H` |
| Flip Vertically | `V` | `V` |
| Invert Characters | `Cmd+I` | `Ctrl+I` |

---

## Frames

| Action | macOS | Windows / Linux |
|---|---|---|
| Align All Frames ×2 Zoom | `Cmd+Alt+9` | `Ctrl+Alt+9` |
| Move Frame Left in Stack | `Cmd+Left` | `Ctrl+Left` |
| Move Frame Right in Stack | `Cmd+Right` | `Ctrl+Right` |
| Duplicate Frame | `Insert` | `Insert` |
| Remove Frame | `Delete` | `Delete` |

---

## View

| Action | macOS | Windows / Linux |
|---|---|---|
| Zoom In | `Cmd+=` | `Ctrl+=` |
| Zoom Out | `Cmd+-` | `Ctrl+-` |
| Zoom ×2 (Default) | `Cmd+9` | `Ctrl+9` |
| Zoom ×1 | `Cmd+0` | `Ctrl+0` |
| Toggle Theme (cycle) | `Cmd+Shift+D` | `Ctrl+Shift+D` |

---

## Tool Selection (no modifiers, canvas focused)

These are single-key shortcuts active when no modal is open and the text tool cursor is not active.

| Key | Tool |
|---|---|
| `x` | Draw (char + color) |
| `c` | Colorize (color only) |
| `0` | CharDraw (char only) |
| `b` | Brush / Select |
| `t` | Text / Keyboard Entry |
| `z` | Pan / Zoom |
| `q` | Previous color (step down palette) |
| `e` | Next color (step up palette) |
| `g` | Toggle Guide Layer visibility |

---

## Color Selection by Number

These shortcuts map number keys to C64 palette indices.

### Colors 0–7 (Alt or Tab + number)

| Key | C64 Color |
|---|---|
| `Alt+1` | 0 — Black |
| `Alt+2` | 1 — White |
| `Alt+3` | 2 — Red |
| `Alt+4` | 3 — Cyan |
| `Alt+5` | 4 — Purple |
| `Alt+6` | 5 — Green |
| `Alt+7` | 6 — Blue |
| `Alt+8` | 7 — Yellow |

### Colors 8–15 (Ctrl + number)

| Key | C64 Color |
|---|---|
| `Ctrl+1` | 8 — Orange |
| `Ctrl+2` | 9 — Brown |
| `Ctrl+3` | 10 — Light Red |
| `Ctrl+4` | 11 — Dark Gray |
| `Ctrl+5` | 12 — Medium Gray |
| `Ctrl+6` | 13 — Light Green |
| `Ctrl+7` | 14 — Light Blue |
| `Ctrl+8` | 15 — Light Gray |

---

## Canvas Mouse Modifier Keys

These modify drawing behavior while using the mouse on the canvas.

| Modifier | Effect |
|---|---|
| `Alt+click` | Eyedropper — picks char + color at cursor |
| `Ctrl+click` | Picks color only (most draw tools) |
| `Right-click` | Erases (draws space character / current color) |
| `Ctrl+Right-click` | Draws transparent character |
| `Spacebar` (hold) | Temporarily activates Pan/Zoom (all tools except Text) |
| `Shift+drag` | Locks drawing to horizontal or vertical axis |

---

## Brush / Stamp Modifier Keys

When a brush is captured and you are stamping it:

| Modifier | Effect |
|---|---|
| *(no mod)* | Stamp chars + colors |
| `Ctrl` | Stamp chars only |
| `Alt` | Stamp colors only |
| `Ctrl+Alt` | Stamp raw (chars + colors, bypasses color remapping) |
| `Right-click` | Color stamp mode |

---

## Border Toggle Modifier Keys

When clicking the Border On/Off icon in the toolbar:

| Modifier | Effect |
|---|---|
| *(no mod)* | Toggle current screen border |
| `Cmd/Ctrl` | Enable border on **all** screens |
| `Cmd/Ctrl+Shift` | Disable border on **all** screens |
| `Alt` | Flip border state on all screens |

---

## Text Tool

When the Text tool is active and the cursor is placed:

| Key | Action |
|---|---|
| Any printable key | Type character at cursor, advance cursor right |
| `Shift+key` | Type uppercase variant |
| `CapsLock` | Toggle PETSCII caps lock (switches character case set) |
| `Backspace` | Delete character, move cursor left |
| `ArrowLeft/Right` | Move cursor horizontally |
| `ArrowUp/Down` | Move cursor vertically |
| `Escape` | Deactivate cursor (first press), then exit to Draw tool (second press) |

---

## Escape Key — Tool Exit

`Escape` exits the current tool and returns to Draw in these cases:

| Context | Effect |
|---|---|
| Brush tool (no brush captured) | Exit to Draw |
| Flood Fill tool | Exit to Draw |
|| Separators / Boxes tool | Reset brush, exit to Draw |
|| Textures tool (brush captured) | Clear brush (return to selection mode) |
|| Textures tool (no brush) | Exit to Draw |
| Fade / Lighten tool | Exit to Draw |
| Text tool (cursor active) | Deactivate text cursor |
| Text tool (cursor inactive) | Exit to Draw |
| Any modal open | Close the modal |

---

## Texture Tool — Preset List

When the texture preset list has focus:

| Key | Action |
|---|---|
| `ArrowUp` | Select previous preset |
| `ArrowDown` | Select next preset |
| `Ctrl+ArrowUp` | Move selected preset up in list |
| `Ctrl+ArrowDown` | Move selected preset down in list |
| `Insert` | Duplicate selected preset |
| `Delete` | Delete selected preset |
| `n` | Focus preset name input (select all) |

---

## Navigation

| Key | Action |
|---|---|
| `ArrowLeft` | Previous screen tab (when no text cursor active) |
| `ArrowRight` | Next screen tab (when no text cursor active) |

---

## Application (macOS only)

| Shortcut | Action |
|---|---|
| `Cmd+H` | Hide Petmate 9 |
| `Cmd+Shift+H` | Hide Other apps |
| `Cmd+M` | Minimize window |
| `Cmd+W` | Close window |
| `Cmd+Q` | Quit |

---

## Dev / Tools

| Shortcut | macOS | Windows / Linux |
|---|---|---|
| Toggle Full Screen | `Ctrl+Cmd+F` | `F11` |
| Toggle Developer Tools | `Cmd+Alt+I` | `Ctrl+Alt+I` |
| Reload (dev builds only) | `Cmd+R` | `Ctrl+R` |
| Open Documentation | — | `F1` |
| Search Issues | — | `Ctrl+F1` |
