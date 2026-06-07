# Petmate 9 — Guide Tool & Conversion Reference

This note explains how to use the Guide panel, what each setting does, and how each converter works.

## What the Guide tool is for

The Guide tool lets you:

- load an external image as an overlay reference
- position/scale/tune that image against your PETSCII canvas
- convert the tuned image into PETSCII characters and colors

Guide data is stored per frame (`guideLayer`) and can include per-frame conversion overrides.

## Quick start

1. Toggle Guide visibility from the left toolbar (image icon) or press `g`.
2. In the right panel, open `Guide`.
3. Click **Load image** and pick PNG/JPG/GIF/BMP/WEBP.
4. Use **Fit to canvas** as a starting point.
5. Tune position + color adjustments until the preview looks right.
6. Choose a conversion tool in `Conversion`.
7. (Optional) limit colors with `ALL / NONE / INV / GRAYS / WARM / COOL` and chip toggles.
8. Click the lightning icon (**Convert to PETSCII**).

The conversion writes back:

- the frame character/color grid
- the frame background color (unless forced)

## Guide panel controls

### Icon row

- **Eye**: show/hide guide image overlay.
- **Folder**: load image.
- **Trash**: clear current image.
- **Expand**: fit image to canvas bounds (sets scale and resets X/Y to 0,0).
- **Lock**: stores guide lock state.
- **Crop**: clip guide rendering to canvas area.
- **Adjust**: grayscale on/off.
- **R**: reset visual adjustments to defaults:
  - grayscale false
  - brightness 100
  - contrast 100
  - hue 0
  - saturation 100
  - opacity 50%
  - scale 100%
- **Palette**: force document background in conversion.
- **Lightning**: run conversion.

## Image section

### Position controls

- D-pad arrows: nudge `x/y` by 1 pixel.
- Center dot: drag to reposition.
- Numeric X/Y fields: direct pixel entry.

### On-canvas pan/zoom controls

- **Space + drag**: pan the canvas viewport (standard pan).
- **Ctrl+Space + drag**: pan the guide image itself.
- While guide pan mode is active (`Ctrl+Space`), **mouse wheel or pinch** changes guide scale.
Note: on macOS, guide pan uses the physical `Control` key (`Control+Space`) to avoid the operating system `Command+Space` Spotlight shortcut. Other app shortcuts may still map `Command` into the editor control key path.
Note: on macOS, the app maps command/meta into the editor control key path.

### Visual adjustment ranges

- **Opacity**: 0–100%
- **Scale**: 1–400%
- **Brightness**: 0–200 (100 = neutral)
- **Contrast**: 0–200 (100 = neutral)
- **Hue**: -180 to +180
- **Saturation**: 0–200 (100 = neutral)

These adjustments affect both:

- guide preview rendering
- converter input rendering

## Conversion section

### Global vs per-frame settings

- If a frame has no `guideLayer.convertSettings`, it uses global Preferences convert settings.
- Once edited in the Guide panel, settings become per-frame overrides.
- **Global** button clears per-frame override and returns to inherited global settings.

### Tool selector

- `Petsciiator`
- `img2petscii`
- `Pet9scii`

### Tool-specific settings

#### Petsciiator

- **Dithering** (Floyd–Steinberg): on/off.

#### img2petscii

- **Matcher**
  - `slow` = best quality, more exhaustive
  - `fast` = reduced search
- **Mono** mode on/off.
- **Threshold** (0–255): only used in mono mode.

#### Pet9scii

- **Dither mode**
  - Floyd-Steinberg
  - Bayer 4×4
  - Bayer 2×2
  - None
- **SSIM** (0–100%): blend between structure and color matching.
- **Luminance matching**: uses luminance-only color distance path.

### Background handling

- **Force background ON**: keep current document background color.
- **Force background OFF**: converter auto-picks the most frequent color in image coverage area.

### Color filter controls

The `Colors` row filters which palette entries are eligible as foreground candidates.

- **ALL**: enable all colors (`colorMask = undefined`).
- **NONE**: disable all colors.
- **INV**: invert current mask.
- **GRAYS / WARM / COOL**: toggle platform-specific color groups.
  - these are toggle groups, not one-way presets
  - if all colors in a group are enabled, pressing the group button disables that group
  - otherwise, pressing it enables the group

Individual chips can be toggled directly.

### Chip layout and tooltip format

- Chips render as a fixed **16-column grid** (important for TED/C16 alignment).
- Tooltip text mirrors Color panel naming.
  - C16/TED example: `$66: Blue L6`
  - Other platforms example: `14: Light Blue`

### Platform-specific group behavior

Groups are selected by active color group (`c64`, `c128vdc`, `vic20`, `pet`, `c16`, etc.), not a fixed C64-only map.

- PET: only foreground color participates.
- C16/TED: group membership spans all luminance rows for selected hues.

## How conversion works (pipeline)

All three tools share a common high-level pipeline:

1. Build an offscreen image at framebuffer pixel resolution (`frame chars × 8`).
2. Fill with current background color.
3. Draw guide image at current `x/y/scale` with current filters.
4. Apply color-mask-aware palette prep.
5. Quantize/dither image to working palette.
6. Choose background (forced or auto-detected).
7. Process each 8×8 cell, choose foreground + character.
8. Return PETSCII frame + background color.

## Color mask effect in detail

Disabled colors are replaced with nearest enabled colors in a masked palette before dithering/quantization. This keeps dithering coherent while still respecting forbidden colors.

If all colors are disabled, converter falls back to background-safe behavior.

## Tool internals

### Petsciiator

- Converts each glyph to a compact feature vector.
- Converts each 8×8 tile to feature vector.
- Picks nearest glyph by feature distance.
- Optional Floyd-Steinberg dithering before matching.

### img2petscii

- Pixel/tile matching against rendered character candidates.
- `slow`: broad search across candidates.
- `fast`: narrows search by foreground first, then char.
- Mono mode binarizes image before matching.

### Pet9scii

- Uses Lab-space color handling and SSIM-based structural scoring.
- Two-pass strategy:
  - pass 1: luminance pre-filter
  - pass 2: blended SSIM + color score on top candidates
- `SSIM` slider controls the blend.

## Platform-sensitive conversion behavior

- Foreground color count is platform-aware:
  - PET: 2
  - VIC-20: 8
  - C64/VDC: 16
  - C16/TED: full TED palette length
- Pixel aspect is compensated during conversion input rendering:
  - VIC-20 wide pixels (`2x`)
  - VDC 80-col narrow pixels (`0.5x`)
- VDC-capable fonts can use extended glyph bank handling.

## Practical tuning tips

- Start with **Fit to canvas**, then correct scale/position.
- Use **Contrast** and **Saturation** before conversion to separate shapes.
- If output background feels wrong, toggle **Force background** on.
- Use **GRAYS/WARM/COOL** first, then fine-tune individual chips.
- For highly structured graphics, raise **SSIM** in Pet9scii.
- For pure monochrome logos, use `img2petscii` mono mode and tune threshold.
