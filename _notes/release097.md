# Petmate 9 — Release Notes v0.9.7

**Release Date:** April 2026
**Platform:** Windows, macOS, Linux

---

## Highlights

Version 0.9.7 introduces four new drawing tools (Textures, Lines, Boxes, Lighten/Darken), the **PRG Player v1.01** multi-mode export engine with animation, smooth scrolling, and SID music support, plus emulator integration, Ultimate II+ network support, zoom improvements, and numerous UI fixes.

---

## New Drawing Tools

### Texture Tool
- Fill areas with configurable texture patterns
- Preset-based texture selection with dropdown
- Random and linear fill modes
- Color options: use texture colors or random color assignment

### DirArt Separators Tool
- Draw horizontal separator lines using configurable PETSCII character patterns
- Designed for DirArt-style directory art layouts and decorative dividers
- Preset-based separator styles with saveable/editable pattern sets
- **Export/Import presets**: save separator presets to a `.petmate` image file and reimport them — portable preset sharing between users and machines
- Shift-lock constrains to horizontal/vertical axis
- Brush stamp mode for applying captured brushes along lines

### Boxes Tool
- Draw rectangular boxes with configurable corner pieces, edges, and fill
- Preset system with customizable corners, top/bottom/left/right sides
- Side options: mirror, stretch, repeat, start/end positioning
- Fill character and color for box interior (transparent fill supported)
- **Export/Import presets**: save box presets to a `.petmate` image file and reimport them — share box styles between projects and users
- Live preview overlay while drawing
- Box draw mode toggle for switching between selection and box drawing

### Lighten/Darken (Fade) Tool
- Gradually lighten or darken individual characters by cycling through weight-sorted character variants
- **Lighten mode**: replaces characters with visually lighter equivalents
- **Darken mode**: replaces characters with visually heavier equivalents
- Configurable **strength** (how many weight steps per application)
- Configurable **source sets**: All Characters, Alphanumeric, Alphanumeric Extended, PETSCII, Blocks
- **Pick modes**: First match, Random, Linear (sequential cycling)
- Ctrl modifier: color-only mode (skip character replacement)
- Hover preview shows the replacement character before clicking

---

## New Features

### PRG Player v1.01 — Multi-Mode Export Engine

The Petmate Player exporter (`File → Export As → Petmate Player`) has been completely reworked with four player modes:

#### Single Frame (all platforms)
- Exports the current screen as a self-running `.prg` file
- Supported platforms: **C64**, **C128**, **PET 4032**, **VIC-20**
- Optional SID music playback (C64 only)

#### Animation Player (all platforms)
- Exports all frames in the workspace as a looping animation `.prg`
- **RLE compression** on screen data (typical 90–97% savings on PETSCII art)
- **Nibble packing** on color data (50% savings — two 4-bit color values per byte)
- Configurable **FPS** (frames per second) with automatic conversion to platform-appropriate delay timing
- Platform support:
  - **C64** — raster IRQ timing, ~44 KB for frame data, SID music support
  - **C128** — raster IRQ timing, ~44 KB for frame data
  - **PET 4032** — busy-wait timing, ~30 KB, screen-only (no color RAM)
  - **VIC-20** — busy-wait timing, configurable RAM expansion (unexpanded through +24 KB)

#### Long Scroll — Vertical Smooth Scroller (C64)
- Pixel-smooth vertical scrolling using VIC-II YSCROLL register ($D011)
- **Double-buffered** rendering: screen buffer A ($0400) and B ($0C00) swap atomically via $D018 in the raster IRQ — zero tearing
- 24-row mode hides border row during scroll transitions
- Source data stored uncompressed with pre-computed row address lookup tables for fast random-access copies
- Both buffers pre-filled at startup to eliminate initial stutter
- Requires source frame height > 25 rows
- Optional SID music

#### Wide Pan — Horizontal Smooth Scroller (C64)
- Pixel-smooth horizontal scrolling using VIC-II XSCROLL register ($D016)
- Same **double-buffered** technique as Long Scroll
- 38-column mode hides border columns during scroll transitions
- Column-strip extraction from wide source rows (e.g., 160-byte rows with 40-byte visible window)
- Requires source frame width > 40 columns
- Optional SID music

### SID Music Support
- Available on **C64** for all player modes (Single Frame, Animation, Long Scroll, Wide Pan)
- File picker for `.sid` / `.bin` / `.mus` music files
- SID file parsed natively in TypeScript — no external c64jasm plugin dependency
- Extracts start address, init/play entry points, and raw data from SID header
- Music initialized before kernal bank-out, played in raster IRQ handler
- SID checkbox automatically hidden when non-C64 platform is selected

### VIC-20 RAM Expansion Selector
- Dropdown in Animation export options when VIC-20 is selected
- Options: Unexpanded (5 KB), +3 KB, +8 KB, +16 KB, +24 KB
- Automatically adjusts data start address and available memory
- Platform notes update dynamically to show available frame data space

### Send to Ultimate II+
- New **"Send to Ultimate"** checkbox in the PRG Player export footer
- After saving the `.prg` file, POSTs the binary to the configured Ultimate II+ address via REST API (`/v1/runners:run_prg`)
- Uses the address from Preferences → Program → Ultimate Address
- Default address updated to `http://192.168.1.64`
- Available for all player modes (Single Frame, Animation, Long Scroll, Wide Pan)

### Emulator Integration
- PRG Player exports can launch directly in an emulator after saving
- Emulator paths configured per platform in **Preferences → Emulation**:
  - C64 (x64sc), C128 (x128), PET 4032 (xpet), VIC-20 (xvic)
- Uses `-autostart` flag for automatic PRG loading
- Proper Windows compatibility with `shell: true` spawn option

### Keyboard Shortcut
- **Ctrl+Shift+X** (Windows/Linux) / **Cmd+Shift+X** (macOS) opens the PRG Player export dialog directly
- Shortcut visible in the File → Export As submenu

### Open Recent Files
- **File → Open Recent** submenu tracks recently opened `.petmate` workspace files
- Cross-platform support: Windows, macOS, Linux
- Persistent across sessions (stored in user data directory)
- **Clear Recent** option to reset the list
- Files opened via drag-and-drop, double-click, or File → Open are all tracked
- Menu rebuilds dynamically when files are added or cleared

### Dark / Light / Auto Theme
- Full **dark mode**, **light mode**, and **system auto** theme support
- Toggle via **Preferences → Program → Theme** dropdown, or **Ctrl+Shift+D** / **Cmd+Shift+D** keyboard shortcut to cycle themes
- Also accessible via **View** menu radio buttons (Light Mode / Dark Mode / Auto)
- Theme preference persists across sessions
- System auto mode follows the OS appearance setting (Windows dark/light mode, macOS Appearance)
- CSS custom properties drive all UI colors for consistent theming across all panels, modals, and controls
- Theme syncs between the main process (native title bar/menu) and the renderer (React UI)

### Guide Layer
- Overlay a reference image on the canvas to trace or use as a positioning guide
- **Import Image**: load any image file (PNG, JPG, etc.) as a guide layer
- **Positioning controls**: drag to reposition, adjustable scale/zoom
- **Opacity**: control transparency of the guide overlay
- **Crop to canvas**: clip the guide image to the canvas bounds
- **Lock**: prevent accidental repositioning once placed
- **Toggle visibility**: toolbar button and per-frame control
- **Convert to PETSCII**: convert the guide image to PETSCII characters directly on the canvas
- Guide layer data is saved with the `.petmate` workspace file
- Each frame can have its own independent guide layer

### Advanced SEQ Import
- **File → Import → Adv. SEQ (.seq)** provides fine-grained control over SEQ file parsing
- Import options:
  - **Import mode**: Overwrite current frame or create new frame
  - **Use current colors**: apply the active color palette instead of embedded colors
  - **Charset selection**: choose which character set to interpret the file with
  - **Screen preset**: target platform dimensions (C64, C128, VIC-20, PET, custom)
  - **Custom width**: override line width for non-standard SEQ files
  - **Line ending detection**: configurable CR (`$0D`), shifted CR (`$8D`), or custom byte sequences
  - **Honor CLS**: treat clear-screen codes (`$93`) as page breaks
  - **Strip blanks**: optimize by removing trailing blank characters
- Supports long-format SEQ files (greater than 25 lines) from various Commodore platforms
- Dedicated modal dialog with preview of import settings

---

## Zoom & Navigation

### Left-Corner Anchored Zoom
- Zoom now anchors to the **top-left corner** of the canvas instead of floating/centering
- Provides predictable scroll position after zoom changes
- Canvas scale locked to integer steps (no fractional zoom levels)
- Zoom level displayed in the status bar

### Mouse Wheel Zoom
- Available in **all tools** (not just Pan/Zoom)
- Zoom under cursor: scroll position adjusts so the point under the mouse stays fixed
- Double-click in Pan/Zoom tool resets zoom to default

---

## UI Improvements

### Export Options Dialog
- Version bumped to **PRG Player v1.01**
- **Player Type** section now shows all four modes: Single Frame, Animation, Long Scroll, Wide Pan
- Long Scroll and Wide Pan are disabled (greyed out) on non-C64 platforms
- **FPS input** appears for Animation mode; **Scroll speed input** appears for scroll modes
- **Platform notes** at the bottom of the dialog show memory constraints:
  - C64: data range, SID impact
  - C128: BASIC address conflict note
  - PET 4032: no color, no SID
  - VIC-20: RAM expansion-dependent data range
- Computer selection automatically disables SID and resets player type when switching to non-C64

### Color Palette Panel
- **Sort modes**: Default (Commodore order), Light → Dark (luma), Dark → Light (luma) — accessible via dropdown in the panel header
- **Color number overlay**: toggle `#` button in header to show/hide numeric color indices on each chip
- **Row mode toggle**: switch between 1-row (compact) and 2-row (standard) layouts via header button
- Adapts automatically per charset: C64 (16 colors, 2 rows), VIC-20 (8 colors, 1 row), PET (1 color)
- Sort mode and color number settings persist across sessions

### Character Palette Panel
- **Character sort dropdown** in the panel header for reordering the character grid
- Collapsible panel with header controls matching the color palette style
- Tool-specific panels appear below the character palette when relevant tools are selected:
  - **DirArt Separators** panel (Lines tool)
  - **Boxes** panel (Boxes tool)
  - **Textures** panel (Textures tool)
  - **Fade/Lighten** panel (Fade tool)
  - **Guide Layer** panel (when guide layer is visible)

### Preferences Redesign
The Preferences dialog has been reorganized into a **tabbed layout** with three tabs:

#### Program Tab
- **Theme**: System Default / Dark / Light dropdown
- **Show color numbers**: checkbox to display numeric indices on color picker chips
- **Zoom sensitivity**: separate sliders for scroll wheel and trackpad pinch (1–10 scale)
- **Reset to Defaults** button

#### Colors Tab
- **C64 Color Palette** selector: Petmate, Colodore, Pepto, VICE
- **VIC-20 Color Palette** selector: NTSC, PAL
- **PET Default Color** selector: White, Green, Amber
- **Reset to Defaults** button

#### Emulation Tab
- **Ultimate 64 Address/DNS**: text input for Ultimate II+ REST API address
- **Emulator Binaries**: per-platform path inputs with **Browse…** file picker buttons
  - C64 (x64sc), C128 (x128), PET 4032 (xpet), PET 8032 (xpet -model 8032), VIC-20 (xvic)
- **Reset to Defaults** button

### Form Components
- New **Select** (dropdown) component added to form helpers
- **RadioButton** now supports a `disabled` prop with visual dimming
- **CollapsiblePanel** component for tool panels with header controls

### Layout Fix
- Removed unnecessary 16px margin gap above the right-side tool panels (Color Picker + Character Selector)
- Previously this was a macOS-specific workaround that leaked to all platforms
- Both the CSS grid margin and the inline style margin have been removed

### Mouse Wheel Zoom Fix
- Fixed stutter during mouse wheel zoom in/out
- Corrected accumulator math that was adding to the delta instead of consuming it (double negation bug)
- Threshold raised from 50 to 80 to match standard mouse wheel notch size (±100-120)
- One wheel notch now produces exactly one clean zoom step

---

## Test Infrastructure

### New Test Scripts

#### `_tests/run_animation_player_test.js`
- Exports animation frames as a C64 `.prg` using RLE + nibble packing
- Supports `--fps <number>`, `--sid <filepath>`, `--no-launch`
- Verifies RLE and nibble-pack round-trip integrity

#### `_tests/run_scroll_player_test.js`
- Vertical smooth scroll using `c64-4xheight` frame (40×100)
- Double-buffered with vsync flag + prepare-ahead pattern

#### `_tests/run_hscroll_player_test.js`
- Horizontal smooth scroll using `c64-4xwidth` frame (160×25)
- Column-strip extraction from wide source rows

#### `_tests/run_player_test.js` (updated)
- Added `--sid <filepath>` support for SID music testing
- Tests all 8 platform frames (C64, C128, PET, VIC-20 × upper/lower)

### Test Data
- 8 new tick-mark test frames added to `computers_097a.petmate`:
  - `c64-4xwidth` (160×25), `c128-4xwidth` (160×25), `pet4032-4xwidth` (160×25), `vic20-4xwidth` (88×23)
  - `c64-4xheight` (40×100), `c128-4xheight` (40×100), `pet4032-4xheight` (40×100), `vic20-4xheight` (22×92)
- Grid pattern: PETSCII cross (╋), vertical line (│), horizontal line (─) every 4 characters

### Documentation
- `_notes/animation-notes.md` — comprehensive technical reference covering compression formats, platform configs, memory maps, FPS timing, 6502 decoder routines, and assembly template structure

---

## Technical Details

### Data Compression
- **RLE encoding** (marker `$FE`): `$FE,0` = literal `$FE`; `$FE,N,V` = run of N×V; runs encoded at length ≥ 4
- **Nibble packing**: `packed = (color_even << 4) | color_odd` — halves color data
- Combined savings on 60-frame test: 120,000 → 33,099 bytes (−72.4%)

### SID Integration
- Native TypeScript SID parser replaces c64jasm `!use` plugin system
- Eliminates `require()` / CWD dependency issues in packaged Electron apps
- SID constants (`sid_startAddress`, `sid_init`, `sid_play`) and data emitted as plain assembly `!let` / `!byte` directives

### Platform Architecture
- `ANIM_PLATFORMS` config registry in `player.ts` defines per-platform: macros file, color/IRQ/SID capabilities, screen size, charset setup, border/bg handling
- VIC-20 config generated dynamically via `getVic20Config(ramExpansion)`
- Scroll players use `assembleWithPlugins()` → `simpleAssemble()` with virtual file system

### Double-Buffer Scrolling
- Two screen buffers: A at `$0400`, B at `$0C00`
- `$D018` bits 4-7 select which buffer the VIC-II reads
- IRQ atomically applies both `$D011`/`$D016` (scroll register) and `$D018` (buffer pointer) at raster line 1
- `vsyncFlag` ensures clean frame synchronization
- Both buffers pre-filled at startup

---

## Files Changed

### Source (`src/`)
| File | Changes |
|------|---------|
| `redux/typesExport.ts` | Added `playerFPS`, `vic20RAM`, `sendToUltimate` to export options |
| `redux/settings.ts` | Default Ultimate address → `http://192.168.1.64` |
| `redux/types.ts` | `EmulatorPaths` interface |
| `containers/ExportModal.tsx` | Player type radios, FPS/scroll speed, VIC-20 RAM dropdown, platform notes, SID gating, Send to Ultimate checkbox, V1.01 |
| `containers/Editor.tsx` | Fixed right panel margin gap, fixed wheel zoom stutter |
| `containers/App.module.css` | Removed editor margin-top gap |
| `containers/Editor.module.css` | Removed darwin right-panel override |
| `containers/Settings.tsx` | Emulator paths configuration UI |
| `utils/exporters/player.ts` | `parseSidFile`, `rleEncode`, `nibblePack`, `fpsToVblanks`, `ANIM_PLATFORMS`, `saveAnimationPlayer`, `saveScrollPlayer`, `launchEmulator`, `sendPrgToUltimate` |
| `utils/index.ts` | Default format values for `playerFPS`, `vic20RAM`, `sendToUltimate` |
| `components/formHelpers.js` | `Select` component, `RadioButton` disabled prop |

### Electron (`public/`)
| File | Changes |
|------|---------|
| `menu.js` | `Ctrl+Shift+X` / `Cmd+Shift+X` shortcut for Player export, accelerator passthrough in `mkExportCmd` |

### Tests (`_tests/`)
| File | Description |
|------|-------------|
| `run_animation_player_test.js` | New — animation PRG export with RLE + nibble packing |
| `run_scroll_player_test.js` | New — vertical smooth scroll PRG export |
| `run_hscroll_player_test.js` | New — horizontal smooth scroll PRG export |
| `run_player_test.js` | Updated — added `--sid` support |
| `animation-notes.md` | New — comprehensive technical documentation |

### Data (`_defaults/`)
| File | Changes |
|------|---------|
| `computers_097a.petmate` | Added 8 tick-mark test frames (4× width + 4× height for each platform) |

---

## Known Limitations
- C128 SID music not yet supported (BASIC at `$1C01` conflicts with SID load at `$1000`)
- PET animation uses busy-wait timing (no hardware timer) — timing approximate
- VIC-20 unexpanded: only ~3 KB for animation data (~5-8 frames)
- Scroll players currently C64-only
- Double-buffer scroll may show brief color artifact during coarse scroll (color RAM at `$D800` is not double-buffered)
