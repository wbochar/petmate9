# C128 VDC Architecture Notes

## Overview
The Commodore 128 uses two video chips:
- **VIC-IIe** — 40-column mode (C64-compatible)
- **VDC (MOS 8563/8568)** — 80-column mode (640×200 RGB)

The C128DCR and some late D-models use the improved 8568 DVDC variant.

## VDC Video RAM
- The VDC has its own **dedicated video RAM**, separate from system memory.
- 16 KB on the original/flat C128 (upgradable to 64 KB).
- 64 KB on the C128DCR.
- RAM is **not directly accessible** by the CPU — all access is done indirectly through VDC registers at $D600/$D601.

## Character Set Handling
- The VDC **does not have its own character ROM**.
- During power-on initialization, the C128 kernal copies character patterns from the **VIC-II's character ROM into VDC RAM**.
- This includes both character sets (uppercase/graphics and upper/lowercase) plus reverse-video versions — up to **512 characters**.
- The kernal routine **DLCHAR at $FF62** performs this ROM-to-VDC-RAM copy.
  - Useful for restoring character definitions after bitmap mode has overwritten VDC RAM.
  - Does not touch screen matrix or attribute RAM.
- Because character data lives in VDC RAM, characters can be **freely redefined** without affecting the 40-column VIC-II display.

## Character Cell Size
- Default character cell: **8 pixels wide × 8 scanlines tall** (non-interlaced mode).
- In the default 80×25 mode: 25 rows × 8 scanlines = **200 visible scanlines** (640×200).
- The 8×8 character definitions from the VIC-II ROM fill the entire cell — **no built-in inter-line spacing** in the default configuration.
- To add inter-line spacing, increase Register 9 beyond the displayed character height (Register 23). Scanlines beyond Register 23's value render as background color.
- In interlaced mode, character cells can be 8×16 (8 scanlines glyph + 8 blank), yielding 640×400.

## VDC Register Configuration — Character Cell Height
The character cell height is controlled by several interrelated registers.
All register values below use the notation from the C128 Programmer's Reference Guide.

### Register 9 ($09) — Character Total Vertical
- **Bits 4–0**: Total scanlines per character row, minus 1
- **Bits 7–5**: Unused (always read as 1)
- **Default**: $E7 → bits 4–0 = %00111 = **7** → 8 scanlines per row
- This defines the **complete height** of each character cell, including any blank spacing lines.
- Each character definition in VDC RAM uses (Register 9 bits 4-0 + 1) bytes.
  - Default: 8 bytes per character
  - If set to 15: 16 bytes per character

### Register 23 ($17) — Character Display Vertical
- **Bits 4–0**: Number of displayed scanlines per character, minus 1
- **Bits 7–5**: Unused
- **Default**: 7 → 8 displayed scanlines (matches Register 9 in default config, so no spacing)
- Controls how many scanlines of the character definition are **actually rendered**.
- Scanlines beyond this value (up to Register 9's total) display as **background color**, creating inter-line spacing.
- Example: Register 9 = 15 (16 total), Register 23 = 7 (8 displayed) → 8 lines of glyph + 8 blank lines.

### Register 4 ($04) — Vertical Total
- **Bits 7–0**: Total character rows per frame, minus 1 (including non-visible rows)
- **Default**: $20 (32) for NTSC, $26 (38) for PAL
- Together with Register 9, determines total rasterlines per frame:
  - NTSC: (32+1) × (7+1) = 264 rasterlines
  - PAL: (38+1) × (7+1) = 312 rasterlines

### Register 5 ($05) — Vertical Fine Adjust
- **Bits 4–0**: Additional scanlines added to total frame height
- Used to fine-tune total frame timing when Register 4 × Register 9 doesn't exactly match the display standard.

### Register 6 ($06) — Vertical Displayed
- **Bits 7–0**: Number of visible character rows
- **Default**: $19 (25) → 25 visible rows
- Change this when altering character cell height to fill the screen.

### Register 7 ($07) — Vertical Sync Position
- **Bits 7–0**: Character row where vertical sync pulse occurs
- **Default**: $20 (32)
- Adjusts vertical centering of the display on the monitor.

### Register 8 ($08) — Interlace Mode
- **Bits 1–0**: Display mode
  - 00 or 10 = Non-interlaced (normal)
  - 01 = Interlace sync mode
  - 11 = Interlace sync + video (true doubled vertical resolution, but flickers)

### Common Mode Configurations

**80×25 (default, non-interlaced)**:
- Reg 9 = 7 (8 scanlines/row), Reg 23 = 7 (8 displayed)
- Reg 6 = 25, Reg 4 = 32 (NTSC) / 38 (PAL)
- Resolution: 640×200, no inter-line spacing

**80×25 with inter-line spacing**:
- Reg 9 = 9 (10 scanlines/row), Reg 23 = 7 (8 displayed)
- 2 blank scanlines between each row of text
- Reg 4 and Reg 5 must be adjusted to maintain correct frame timing

**80×50 (double rows)**:
- Reg 9 = 3 (4 scanlines/row), Reg 23 = 3 (4 displayed)
- Reg 6 = 50
- Characters are truncated to top 4 scanlines — readability suffers
- Reg 4/5/7 must be adjusted for timing

**Interlaced 80×25 (640×400)**:
- Reg 8 = 3 (interlace sync+video)
- Reg 9 = 15 (16 scanlines/row), Reg 23 = 15 (16 displayed)
- Reg 4 must be halved (approximately) since each row is now 16 scanlines
- 16-byte character definitions — full 8×16 glyphs possible
- Visible flicker on real hardware

### Character Generator Base Address (Register 28 / $1C)
- **Bits 7–5**: Character generator base address (bits 15–13 of VDC RAM address)
- **Bit 4**: DRAM type (0 = 4416 / 16KB, 1 = 4164 / 64KB)
- The character definitions must be stored at a location aligned to the address set here.
- Total font memory = num_characters × (Register 9 bits 4-0 + 1) bytes
  - Default: 512 chars × 8 bytes = 4096 bytes (4 KB)

## Screen Memory Layout (Default)
- Screen RAM: $0000–$07FF (2 KB, holds 2000 characters for 80×25)
- Attribute RAM: $0800–$0FFF (2 KB, holds 2000 attribute bytes for 80×25)
- Character definitions: typically at $2000+ (set via Register 28)
- Both screen and attribute addresses can be relocated to any 2 KB boundary in VDC RAM.
- Attribute start address is configured via Registers 20/21 ($14/$15).

## Attribute Byte Format
Each character has an attribute byte in color RAM:
- Bits 0–3: Foreground color (8 colors × 2 intensities = 16 values)
- Bit 4: Blink
- Bit 5: Underline
- Bit 6: Reverse (invert character bitmap)
- Bit 7: Alternate character set (selects characters 256–511)

### Attribute Processing Pipeline
The VDC applies attributes to each scanline in this order:
1. **Character bitmap** — fetched from VDC RAM for the current glyph
2. **Blink** — if set and in the OFF phase, the bitmap is replaced with all-zeros
3. **Underline** — if set, the underline scanline (Register 29, default = bottom) is forced to all-ones ($FF)
4. **Reverse** — if set, the entire scanline result is inverted (~p & $FF)

This ordering means combined attributes produce specific results:
- **Underline + Reverse**: bottom scanline forced ON, then inverted → all-OFF (background color line)
- **Blink + Reverse** (OFF phase): all-zero bitmap reversed → all-ones → solid foreground block
- **Blink + Underline** (OFF phase): all-zero bitmap, bottom forced ON → background with foreground underline
- **Blink + Reverse + Underline** (OFF phase): all-zero, bottom ON, then reversed → foreground block with background bottom line

### Register 29 ($1D) — Underline Position
- **Bits 4–0**: Scanline number within the character cell where the underline is drawn
- **Default**: 7 → bottom scanline of an 8-scanline cell
- The underline scanline is forced to all foreground pixels regardless of the glyph bitmap
- Interacts with REVERSE: the forced scanline is inverted along with the rest of the cell

### Register 24 ($18) — Blink and Screen Control
- **Bit 5**: Blink rate select (combined with bit 4)
  - %00 = 1/16 field rate, %01 = 1/32, %10 = 1/48, %11 = 1/64
- **Bit 4**: Blink rate select (low bit)
- **Bit 6**: Reverse screen (inverts all displayed characters globally)
- **Bit 7**: Block/underline cursor shape
- During the blink OFF phase the character bitmap is blanked (all-zeros) but UNDERLINE and REVERSE still apply — the character does not simply disappear

## VDC Register Access Pattern
All VDC access is indirect through two I/O addresses:
```
; Write to VDC register
  LDX #regnum
  STX $D600        ; select register
  BIT $D600        ; wait for ready (bit 7)
  BPL *-3
  STA $D601        ; write value

; Read from VDC register
  LDX #regnum
  STX $D600
  BIT $D600
  BPL *-3
  LDA $D601        ; read value
```

## Key Kernal Routines
- **$FF62 (DLCHAR)** — Copy character ROM patterns into VDC RAM
- **$CDCC** — Write value in A to VDC register in X
- **$CDDA** — Read VDC register in X, return value in A

## Additional Notes
- VDC supports **blitter operations** for block memory copies within VDC RAM.
- No sprite support on VDC (limits gaming use).
- RGBI output is compatible with IBM CGA monitors (60 Hz NTSC models).
- Bitmap mode is possible (640×200) but was not officially documented until the Programmer's Reference Guide.

## Petmate Implementation Notes

### Storage
- `Pixel.attr` stores the full VDC attribute byte verbatim for VDC frames
- `Pixel.color` retains the 4-bit foreground colour (bits 0–3) for backward compatibility with the C64-family paint pipelines
- Helpers in `src/utils/vdcAttr.ts` keep the two views in sync (`packAttr`, `unpackAttr`, `effectiveAttr`, `withColor`, `toggleFlag`)

### Editor Rendering (CharGrid.tsx)
- The `CharsetCache` builds both normal and reverse glyph caches from the font bitmap
- Underline is drawn as a post-pass `fillRect` on the bottom scanline — cleared to background when REVERSE is also set
- Blink is animated via a `setInterval` timer; the OFF phase renders the all-zero bitmap with UNDERLINE/REVERSE still applied
- TED/C16 blink uses colour bit 7 and simply hides the cell during the OFF phase

### Image Export (util.ts — framebufToPixelsIndexed)
- Software-renders the attribute pipeline in the same order as hardware: bitmap → underline → reverse
- Accepts an optional `blinkOff` flag to render the blink OFF phase for GIF blink-preview export
- TED blink-off cells are filled with background; VDC blink-off cells zero the bitmap then apply underline/reverse

### Paint Tools
- Drawing tools pass `attrFlags` (from `vdcPaintFlags` toolbar state) through `setPixel` so REVERSE/UNDERLINE/BLINK are stamped on each painted cell
- Text tool applies the same `attrFlags` and TED blink bit when typing characters
- Alt-click (eyedropper) reads back the cell's attribute byte and sets `vdcPaintFlags` to the REVERSE/UNDERLINE/BLINK bits (0x70 mask); ALTCHAR is handled separately via screencode selection
- Ctrl-click picks colour only (no attribute bits)

## Test Files
Standalone VDC 80-column test pattern assembly:
- `_tests/vdc80col_test/macros_vdc.asm` — VDC register constants and access macros
- `_tests/vdc80col_test/vdc_test_pattern.asm` — Procedural test pattern (border, color bars, charset sample)
- `_tests/vdc80col_test/README.md` — Build and run instructions

Build with: `npx c64jasm --out vdc_test.prg vdc_test_pattern.asm`
Run with: `x128 -80 vdc_test.prg` (VICE) or load on real C128 hardware.
