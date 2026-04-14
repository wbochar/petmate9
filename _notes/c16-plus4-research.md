# C16 / Plus/4 Integration Research Notes

## The TED Family (Commodore 264 Series)

Three machines share the same architecture:
- **Commodore C16** — 16KB RAM, no user port, no built-in apps
- **Commodore C116** — Same as C16 but rubber keyboard, European market
- **Commodore Plus/4** — 64KB RAM, user port, built-in 3-plus-1 office suite

All use the **MOS 7360/8360 TED** (Text Editing Device) which handles video, sound, timers, DRAM refresh, keyboard scanning, and bank switching. CPU is the 7501/8501 (6502-compatible) running at ~0.89 MHz during visible screen / ~1.77 MHz during borders.

The screen layout is **40×25** characters, same as C64.

---

## What Already Exists in Petmate9

The codebase has partial C16 support stubbed in:
- `CHARSET_C16_UPPER` / `CHARSET_C16_LOWER` constants in `editor.ts`
- Character ROM bins: `assets/c16-charset-upper.bin`, `assets/c16-charset-lower.bin`
- Font data loaded: `c16DataUpper`, `c16DataLower` in `utils/index.ts`
- ROM font map entries in `selectors.ts`
- `'c16'` already in the `computer` union type in `typesExport.ts`
- Platform config in `charWeightConfig.ts` (borderColor: 4, charsets defined)
- C16 charsets recognized in `json.ts` exporter as built-in (not custom)

**NOT yet done:**
- FontSelector dropdown — C16 entries are commented out in `FontSelector.tsx`
- Color palette — no TED palette defined in `palette.ts`
- Player export — no `c16` case in `player.ts` (neither single-frame nor animation)
- No macros ASM file for C16
- No emulator path for C16 in `EmulatorPaths` type
- No palette selector/remap for TED colors in settings
- `editor.ts` SET_CHARSET handler — `c16` prefix not handled (falls into default → C64 colors)

---

## Color Palette — The Big Decision

### How TED Colors Work

TED has **16 hues × 8 luminance levels = 128 combinations**, but hue 0 (black) is always black at every luminance, so the effective palette is **121 unique colors**.

Color byte encoding: `(luminance << 4) | hue` (7 bits used)
- Bits 6-4: luminance (0–7)
- Bits 3-0: hue (0–15)

Hue names (same first 8 as C64, 5 new):
```
 0 = Black          8 = Orange
 1 = White          9 = Brown
 2 = Red           10 = Yellow-Green
 3 = Cyan          11 = Pink
 4 = Purple        12 = Blue-Green
 5 = Green         13 = Light Blue
 6 = Blue          14 = Dark Blue (purplish)
 7 = Yellow        15 = Light Green
```

### Color RAM

Color RAM is at **$0800–$0BE7** (1000 bytes for 40×25).
Each byte stores: `(luminance << 4) | hue` — plus bit 7 for flash.

**Important:** Luminance is per-cell, NOT per-slot. Every character position on screen independently stores its own hue + luminance combination. Two cells can both be "red" but at different brightness levels. This is what enables 121 simultaneous colors on screen — it's not a global palette with 16 locked entries, it's a per-cell 7-bit color value.

This differs fundamentally from the C64, where color RAM is a simple 4-bit index into a fixed 16-color palette.

### Design: Full 121-Color Grid Picker

Since luminance is per-cell (not per-slot), the integration should expose all 121 colors.
The color picker for C16/Plus4 charsets will be a **16-column × 8-row grid**:

- **Column 0 (hue 0 = black):** All 8 rows are identical black — luminance has no visible effect
- **Columns 1–15:** Each column is one hue; rows 0–7 show luminance dark-to-bright
- User clicks any chip to select that hue+luminance combo for foreground, background, or border

The selected value maps directly to the TED color byte: `(luminance << 4) | hue`.
This means the `color` field stored per-cell in the `Pixel` type would hold values 0–127 for TED screens (vs. 0–15 for C64/VIC/PET).

---

### Color Index Model Change

The existing `Pixel.color` field is a `number` with no hard upper bound in the TypeScript type, so storing 0–127 requires no type change. However, many places in the codebase assume a 16-color range:

**Areas that assume 0–15 colors (need review/gating for TED):**
- `ColorPicker.tsx` — renders a flat row/two-row layout from `paletteRemap` (max 16 entries)
- `Toolbar.tsx` — switches palette by charset prefix; `paletteRemap` is always 16-element
- `palette.ts` — all palette arrays are 16 entries; `getNextColorByLuma()` takes `numColors` param
- `settings.ts` — palette remap arrays are 16-element
- Export code (`player.ts`, `asm.ts`, `seq.ts`, etc.) — writes color values directly; these would naturally output the TED byte if the stored value is already in TED format
- `getColorName()` in `palette.ts` — indexed by 0–15; needs a TED-aware path
- Nibble-pack in `player.ts` — packs two 4-bit colors per byte; TED colors are 7-bit so this won't work

---

### UI Changes Required

#### 1. New `TEDColorPicker` Component (or mode within `ColorPicker`)

The current `ColorPicker` renders a flat `paletteRemap.map(...)` row. For TED, we need a 2D grid.

Approach: Add a TED-specific rendering path inside `ColorPicker` (or a new sibling component) that:
- Renders a 16-wide × 8-tall grid of color chips
- Each chip represents `(row << 4) | col` = the TED color byte
- Column 0 (black) shows the same color in all 8 rows
- The `selected` value is a full TED byte, not an index into `paletteRemap`
- Tooltip shows: `"hue: Red, lum: 4"` (or similar)

The grid should be compact — smaller chips than the current picker since there are 128 cells.

#### 2. Toolbar Integration

In `Toolbar.tsx`, the `switch(charPrefix)` block (lines 579–602) already handles `vic`, `pet`, `c12`. Add a `c16` case:

```typescript
case "c16":
    // Use TED 121-color palette (128-entry Rgb array)
    // Set a flag or use a different picker component
    cp = tedColorPalette;  // 128-entry Rgb[] (all hue×lum combos)
    cr = Array.from({ length: 128 }, (_, i) => i);
    cb = cr;
    // Signal to use the grid picker instead of flat row
    isTED = true;
    break;
```

The `FbColorPicker` wrapper would need to detect TED mode and render the grid layout instead of the two-row strip.

#### 3. Palette Data

In `palette.ts`, define the full 128-entry TED palette:

```typescript
// 128 entries: index = (luminance << 4) | hue
// Hue 0 (black) at all luminances = #000000
// Hues 1-15 at luminances 0-7 from YAPE/RGBtoHDMI PAL values
export const tedPalette: Rgb[] = [ /* 128 entries */ ];
```

Source RGB values from the PAL table in the RGBtoHDMI/YAPE data (documented in the TED registers section below).

#### 4. Color Names

Add a `TED_COLOR_NAMES` function or lookup that returns both hue name and luminance:
```typescript
export function getTEDColorName(tedByte: number): string {
    const hue = tedByte & 0x0f;
    const lum = (tedByte >> 4) & 0x07;
    const hueNames = ['Black','White','Red','Cyan','Purple','Green',
        'Blue','Yellow','Orange','Brown','Yel-Green','Pink',
        'Blue-Green','Lt Blue','Dk Blue','Lt Green'];
    if (hue === 0) return 'Black';
    return `${hueNames[hue]} L${lum}`;
}
```

#### 5. Export Considerations

- **Color RAM bytes:** The stored `Pixel.color` value IS the TED byte — write directly to color RAM
- **Border/background:** Same — store as TED byte, write to $FF19/$FF15
- **Nibble packing (animation):** Cannot use the existing `nibblePack()` since TED colors are 7-bit not 4-bit. Need a TED-specific packing path (or just store full bytes, which doubles color data size)
- **SEQ export:** TED PETSCII escape codes for color are different from C64 — needs research
- **JSON export:** No issue — stores numeric values; just larger range

#### 6. Workspace File Compatibility

When loading a `.petmate` workspace with TED screens, the color values 0–127 will be preserved as-is since they're stored as numbers in JSON. Old workspaces with C64 screens (colors 0–15) remain valid.

New TED screens in a workspace would only work correctly in petmate9 versions that support TED colors.

---

### PAL vs NTSC Palette Differences

The TED produces different chroma phase angles on PAL vs NTSC hardware. The luminance ramp is identical, but the hue tones shift noticeably. Same TED byte → different on-screen color depending on the machine's video standard.

This is the same situation as the VIC-20, where petmate9 already provides `vic20ntsc` and `vic20pal` palette variants. The TED integration needs the same: two 128-entry Rgb arrays.

Palette type in `types.ts`:
```typescript
export type tedPaletteName = 'tedPAL' | 'tedNTSC';
```

Settings would include `selectedTedColorPalette` and `tedpalettes` remap arrays, following the existing VIC-20 pattern.

### TED PAL Palette RGB Values (128 entries)

From RGBtoHDMI / YAPE (PAL variant):

```
Hue 0 (Black):   all lum = #000000
Hue 1 (White):   L0=#202020 L1=#404040 L2=#606060 L3=#808080 L4=#9f9f9f L5=#bfbfbf L6=#dfdfdf L7=#ffffff
Hue 2 (Red):     L0=#651517 L1=#722224 L2=#7c2c2e L3=#8b3b3d L4=#ad5d5f L5=#d18183 L6=#e79799 L7=#ffcdcf
Hue 3 (Cyan):    L0=#004643 L1=#045350 L2=#0c5d5a L3=#1b6c69 L4=#3d8e8b L5=#61b2af L6=#77c8c5 L7=#adf2f0
Hue 4 (Purple):  L0=#5b0a6a L1=#681777 L2=#722181 L3=#813090 L4=#a352b2 L5=#c776d6 L6=#dd8cec L7=#fcc2ff
Hue 5 (Green):   L0=#005101 L1=#085e09 L2=#126813 L3=#217722 L4=#439944 L5=#67bd68 L6=#7dd37e L7=#b3f7b4
Hue 6 (Blue):    L0=#202190 L1=#2d2e9d L2=#3738a7 L3=#4647b6 L4=#6869d8 L5=#8c8df5 L6=#a2a3ff L7=#d8d9ff
Hue 7 (Yellow):  L0=#3a3a00 L1=#474700 L2=#515100 L3=#606000 L4=#828212 L5=#a6a636 L6=#bcbc4c L7=#ecec82
Hue 8 (Orange):  L0=#592300 L1=#663000 L2=#703a05 L3=#804912 L4=#a16b34 L5=#c58f58 L6=#dba56e L7=#fbdba4
Hue 9 (Brown):   L0=#4c2f00 L1=#593c00 L2=#634600 L3=#725503 L4=#94771e L5=#b89b42 L6=#ceb158 L7=#f5e68e
Hue 10 (YelGrn): L0=#1e4800 L1=#2b5500 L2=#355f00 L3=#446e00 L4=#669012 L5=#8ab436 L6=#a0ca4c L7=#d6f382
Hue 11 (Pink):   L0=#661031 L1=#731d3e L2=#7d2748 L3=#8c3657 L4=#ae5879 L5=#d27c9d L6=#e892b3 L7=#ffc8e7
Hue 12 (BluGrn): L0=#004b2d L1=#04583a L2=#0b6244 L3=#1a7153 L4=#3c9375 L5=#60b799 L6=#76cdaf L7=#acf4e5
Hue 13 (LtBlue): L0=#0b2f7e L1=#183c8b L2=#224695 L3=#3155a4 L4=#5377c6 L5=#779bea L6=#8db1f6 L7=#c3e6ff
Hue 14 (DkBlue): L0=#2d1995 L1=#3a26a2 L2=#4430ac L3=#533fbb L4=#7561dd L5=#9985f7 L6=#af9bff L7=#e5d1ff
Hue 15 (LtGrn):  L0=#0e4e00 L1=#1b5b00 L2=#256500 L3=#347404 L4=#569620 L5=#7aba44 L6=#90d05a L7=#c6f690
```

### TED NTSC Palette RGB Values (128 entries)

From RGBtoHDMI (NTSC variant):

```
Hue 0 (Black):   all lum = #000000
Hue 1 (White):   L0=#202020 L1=#404040 L2=#606060 L3=#808080 L4=#9f9f9f L5=#bfbfbf L6=#dfdfdf L7=#ffffff
Hue 2 (Red):     L0=#580902 L1=#782922 L2=#984942 L3=#b86962 L4=#d88882 L5=#f7a8a2 L6=#ffc8c2 L7=#ffe8e2
Hue 3 (Cyan):    L0=#00373d L1=#08575d L2=#27777d L3=#47969d L4=#67b6bd L5=#87d6dd L6=#a7f6fd L7=#c7ffff
Hue 4 (Purple):  L0=#4b0056 L1=#6b1f76 L2=#8b3f96 L3=#aa5fb6 L4=#ca7fd6 L5=#ea9ff6 L6=#ffbfff L7=#ffdfff
Hue 5 (Green):   L0=#004000 L1=#156009 L2=#358029 L3=#55a049 L4=#74c069 L5=#94e089 L6=#b4ffa9 L7=#d4ffc9
Hue 6 (Blue):    L0=#20116d L1=#40318d L2=#6051ac L3=#8071cc L4=#9f90ec L5=#bfb0ff L6=#dfd0ff L7=#fff0ff
Hue 7 (Yellow):  L0=#202f00 L1=#404f00 L2=#606f13 L3=#808e33 L4=#9fae53 L5=#bfce72 L6=#dfee92 L7=#ffffb2
Hue 8 (Orange):  L0=#4b1500 L1=#6b3409 L2=#8b5429 L3=#aa7449 L4=#ca9469 L5=#eab489 L6=#ffd4a9 L7=#fff4c9
Hue 9 (Brown):   L0=#372200 L1=#574200 L2=#776219 L3=#978139 L4=#b7a158 L5=#d7c178 L6=#f6e198 L7=#ffffb8
Hue 10 (YelGrn): L0=#093a00 L1=#285900 L2=#487919 L3=#689939 L4=#88b958 L5=#a8d978 L6=#c8f998 L7=#e8ffb8
Hue 11 (Pink):   L0=#5d0120 L1=#7d2140 L2=#9c4160 L3=#bc6180 L4=#dc809f L5=#fca0bf L6=#ffc0df L7=#ffe0ff
Hue 12 (BluGrn): L0=#003f20 L1=#035f40 L2=#237f60 L3=#439e80 L4=#63be9f L5=#82debf L6=#a2fedf L7=#c2ffff
Hue 13 (LtBlue): L0=#002b56 L1=#154b76 L2=#356b96 L3=#558bb6 L4=#74abd6 L5=#94cbf6 L6=#b4eaff L7=#d4ffff
Hue 14 (DkBlue): L0=#370667 L1=#572687 L2=#7746a7 L3=#9766c6 L4=#b786e6 L5=#d7a6ff L6=#f6c5ff L7=#ffe5ff
Hue 15 (LtGrn):  L0=#004202 L1=#086222 L2=#278242 L3=#47a262 L4=#67c282 L5=#87e2a2 L6=#a7ffc2 L7=#c7ffe2
```

### Comparison: PAL vs NTSC Hue Shift Examples

Same TED byte, different on-screen color:

```
Hue 2 Red L4:    PAL=#ad5d5f  NTSC=#d88882   (NTSC is warmer/lighter)
Hue 5 Green L4:  PAL=#439944  NTSC=#74c069   (NTSC is brighter/yellower)
Hue 6 Blue L3:   PAL=#4647b6  NTSC=#8071cc   (NTSC shifts toward purple)
Hue 13 LtBlue L4: PAL=#5377c6 NTSC=#74abd6   (NTSC is lighter/more cyan)
```

Luminance ramp (hue 1 = white/grey) is identical between PAL and NTSC.

---

## Foreground Color Tracking (Per-Group System)

Petmate9 now tracks the selected foreground color **per computer-type group**, not as a single global value. This is important for C16 integration.

### How It Works

The toolbar state has:
- `textColor: number` — the currently active foreground color
- `textColorByGroup: Record<string, number>` — saved foreground color per group
- `activeColorGroup: string` — which group is currently active

When the user switches between screens of different computer types, `SWITCH_FOREGROUND_GROUP` fires (via `nextScreenWithColor` or `componentDidUpdate` in Editor/FramebufferTabs). It:
1. Saves the current `textColor` into `textColorByGroup[prevGroup]`
2. Restores `textColor` from `textColorByGroup[newGroup]` (or falls back to `DEFAULT_COLORS_BY_GROUP[newGroup]`)
3. Sets `activeColorGroup` to the new group

### Color Groups (from `palette.ts:getColorGroup()`)

- `'c64'` — C64, C128 40-col, C16, DirArt, Cbase, custom fonts (the catch-all default)
- `'vic20'` — VIC-20 charsets
- `'pet'` — PET charsets
- `'c128vdc'` — C128 VDC 80-col

### Default Colors Per Group

```typescript
DEFAULT_COLORS_BY_GROUP = {
  c64: 14,       // light blue
  vic20: 6,      // blue
  pet: 1,        // foreground
  c128vdc: 15,   // white
};
```

### What C16 Needs

**Currently, C16 falls into the `'c64'` group** because `getColorGroup()` doesn't check for the `'c16'` prefix — it falls through to the default `return 'c64'`. This means:
- Switching between a C64 screen and a C16 screen does NOT trigger a group switch
- The foreground color carries over unchanged (which is wrong since C16 uses TED color bytes 0–127, not C64 indices 0–15)

**Changes needed:**

1. **Add a `'c16'` group** in `getColorGroup()`:
```typescript
if (prefix === 'c16') return 'c16';
```

2. **Add default color** in `DEFAULT_COLORS_BY_GROUP`:
```typescript
c16: 0x71,  // white at luminance 7 (TED byte)
```

3. **The `NEXT_COLOR` and `SET_COLOR` reducers** use `paletteRemap` arrays (max 16 entries) and `Math.min(15, ...)`. For TED's 128-color space, these need a TED-aware path:
   - `nextColor` should step through hue or luminance (or both) rather than a 16-slot remap
   - `setColor` with a slot-based remap won't work for 128 entries
   - The `nextScreenWithColor` thunk already handles group switching, so the plumbing is in place

4. **The `textColor` value for C16 group** would be a full TED byte (0–127), which is compatible with the existing `number` type.

---

## TED Register Map (Key Registers for Player)

All TED registers live at **$FF00–$FF3F** (not $D000 like VIC-II).

| Register | Address | Description |
|----------|---------|-------------|
| $FF06    | CR1     | Screen config (ECM, BMM, DEN, RSEL, YSCROLL) — like VIC $D011 |
| $FF07    | CR2     | RVS/256char, NTSC/PAL, MCM, CSEL, XSCROLL — like VIC $D016 |
| $FF09    | IRQST   | Interrupt flags |
| $FF0A    | IRQEN   | Interrupt enable + raster compare bit 8 |
| $FF0B    |         | Raster compare bits 7–0 |
| $FF12    |         | Bitmap addr, char ROM/RAM flag |
| $FF13    |         | Character generator address, single clock, ROM/RAM state |
| $FF14    |         | Screen memory address |
| $FF15    | B0C     | Background color 0 (luminance + hue) |
| $FF16    | B1C     | Background color 1 (multicolor) |
| $FF17    | B2C     | Background color 2 (multicolor) |
| $FF18    | B3C     | Background color 3 (multicolor) |
| $FF19    | EC      | Border color (luminance + hue) |
| $FF3E    |         | Write = switch $8000-$FFFF to ROM |
| $FF3F    |         | Write = switch $8000-$FFFF to RAM |

### Color register format
Background ($FF15) and Border ($FF19) each hold a full TED color byte:
`bit 7: unused | bits 6-4: luminance | bits 3-0: hue`

---

## Memory Map (Relevant to Player)

| Address       | Content                                |
|---------------|----------------------------------------|
| $0000–$0001   | CPU port (7501 data direction + I/O)   |
| $0002–$03FF   | Zero page, stack, KERNAL work area     |
| $0400–$07FF   | Free RAM (used by BASIC in default)    |
| $0800–$0BE7   | **Color RAM** (1000 bytes, 40×25)      |
| $0C00–$0FE7   | **Screen RAM** (1000 bytes, 40×25)     |
| $1000–$3FFF   | BASIC program area (C16: up to ~$3FFF) |
| $1000–$FCFF   | BASIC program area (Plus/4: up to ~$FCFF) |
| $8000–$BFFF   | BASIC ROM / RAM (banked)               |
| $C000–$CFFF   | BASIC ROM / RAM (banked)               |
| $D000–$DFFF   | Character ROM (4KB, accessible when switched in) |
| $FC00–$FCFF   | KERNAL work area                       |
| $FD00–$FF3F   | I/O area / ROM                         |
| $FF00–$FF3F   | **TED registers** (always visible)     |
| $FF40–$FFFF   | KERNAL ROM (vectors at $FFFA–$FFFF)    |

### Character ROM Address

The character generator address is set via **$FF13** (bits 7–2).
Default: character ROM at $D000 (bank-switched in during character fetch).

To switch between upper/lower:
- **Upper (graphics):** `$FF13` with bit pattern pointing to $D000 (upper half of char ROM)
- **Lower (text):** `$FF13` with bit pattern pointing to $D400 (lower half of char ROM)

The actual switching works differently from C64. The TED fetches character data directly from the address configured in $FF13. The ROM/RAM at $D000 is switched in only during TED character fetch cycles — the CPU sees RAM at that address.

Charset switching (similar to VIC-II $D018 concept but different bits):
```asm
; Switch to uppercase charset
lda $ff13
and #$fb        ; clear bit 2 (point to $D000)
sta $ff13

; Switch to lowercase charset
lda $ff13
ora #$04        ; set bit 2 (point to $D400)
sta $ff13
```

**Note:** The exact bit manipulation depends on the full $FF13 layout. The character generator address uses bits 7-2, but bit 2 specifically controls the upper/lower half of the 4K ROM. Need to verify against the TED data sheet for the exact default value and which bits to toggle.

---

## BASIC Start Address

BASIC programs load at **$1001** on C16/Plus4 (vs $0801 on C64).

The BASIC start stub for a player PRG:
```asm
* = $1001          ; BASIC start for C16/Plus4
!byte $0B, $10, $00, $00, $9E, $34, $31, $30
!byte $39, $00, $00, $00
; SYS 4109 — execution starts at $100D
```

This is different from the C64 ($0801) and PET ($0401).

---

## Player ASM — Integration Plan

### Macros File: `assets/macrosC16.asm`

Needs to define:
- `SCREEN = $0C00` (screen RAM)
- `COLOR = $0800` (color RAM)
- `basic_start` macro (with $1001 base address and appropriate SYS value)
- `setup_irq` / `irq_start` / `irq_end` macros using TED timer/raster interrupts
- No VIC-II equivalents — all TED register addresses

Key differences from C64 macros:
- Screen RAM at $0C00 instead of $0400
- Color RAM at $0800 instead of $D800
- Border = $FF19 instead of $D020
- Background = $FF15 instead of $D021
- No `$01` processor port banking (TED uses $FF3E/$FF3F for ROM/RAM switching)
- Raster IRQ via $FF0A/$FF0B/$FF09 instead of $D01A/$D012/$D019

### Single-Frame Player

```asm
; Petmate9 Player (C16/Plus4 version)
!include "macros.asm"
+basic_start(entry)

entry: {
    ; charset switching (charsetBits)
    
    ; Set border and background from data
    lda frameName
    sta $ff19       ; border color
    lda frameName+1
    sta $ff15       ; background color 0
    
    ; Copy screen codes
    ldx #$00
loop:
    lda frameName+2,x
    sta SCREEN,x
    lda frameName+$3ea,x
    sta COLOR,x
    lda frameName+$102,x
    sta SCREEN+$100,x
    lda frameName+$4ea,x
    sta COLOR+$100,x
    lda frameName+$202,x
    sta SCREEN+$200,x
    lda frameName+$5ea,x
    sta COLOR+$200,x
    lda frameName+$2ea,x
    sta SCREEN+$2e8,x
    lda frameName+$6d2,x
    sta COLOR+$2e8,x
    inx
    bne loop

    jmp *
}
```

### Animation Platform Config (for `ANIM_PLATFORMS` in player.ts)

```typescript
c16: {
    macrosFile: 'macrosC16.asm',
    hasColor: true,
    hasRasterIRQ: true,     // TED has raster IRQ
    canSID: false,          // No SID chip! TED sound only (basic)
    dataStartAddr: '$2000', // May need adjustment for C16 (16KB limit)
    bankingCode: '',        // No $01 banking — TED uses $FF3E/$FF3F
    screenBytes: 1000,
    colorPackedBytes: 500,
    charsetSetup: (cs) => {
        switch (cs) {
            case 'c16Lower': return '...'; // TBD: $FF13 manipulation
            default:         return '...'; // TBD: $FF13 manipulation
        }
    },
    borderBgSetup: `    lda frame_border,x
    sta $ff19
    lda frame_bg,x
    sta $ff15`,
    frameMeta: (fb) => ({ borderVal: fb.borderColor, bgVal: fb.backgroundColor }),
}
```

### Data Start Address Concern

On a C16 with only 16KB RAM, usable RAM is $1000–$3FFF. A BASIC stub + player code + 1000 screen + 1000 color = ~2.4KB minimum. Data at $2000 gives only ~8KB for frame data — tight for animation.

On Plus/4 (64KB), this is not an issue — data can go much higher.

Consider: add a `c16RAM` selector similar to `vic20RAM`, or just target Plus/4 (64KB) for animation and allow single-frame for C16.

---

## Color Data Export Encoding

When exporting, the color byte stored per cell needs to encode the TED format:

**With 16-color subset approach:**
The existing petmate color index (0–15) maps to a TED color byte via a lookup table:

```typescript
// Map petmate color index → TED color byte (hue | luminance<<4)
const C16_COLOR_MAP: number[] = [
    0x00, // 0  Black     → hue 0, lum 0
    0x71, // 1  White     → hue 1, lum 7
    0x42, // 2  Red       → hue 2, lum 4
    0x53, // 3  Cyan      → hue 3, lum 5
    0x44, // 4  Purple    → hue 4, lum 4
    0x55, // 5  Green     → hue 5, lum 5
    0x36, // 6  Blue      → hue 6, lum 3
    0x67, // 7  Yellow    → hue 7, lum 6
    0x48, // 8  Orange    → hue 8, lum 4
    0x39, // 9  Brown     → hue 9, lum 3
    0x4A, // 10 Yel-Green → hue 10, lum 4
    0x4B, // 11 Pink      → hue 11, lum 4
    0x5C, // 12 Blue-Grn  → hue 12, lum 5
    0x4D, // 13 Lt Blue   → hue 13, lum 4
    0x3E, // 14 Dk Blue   → hue 14, lum 3
    0x4F, // 15 Lt Green  → hue 15, lum 4
];
```

The player ASM writes these TED-encoded bytes directly to color RAM ($0800).

Similarly, border and background values must be TED-encoded bytes when written to $FF19 and $FF15.

---

## Raster IRQ on TED

TED supports raster interrupts similar to VIC-II:

```asm
; Enable raster IRQ
lda #$02        ; bit 1 = raster IRQ enable
sta $ff0a

; Set raster compare value
lda #<raster_line
sta $ff0b
lda $ff0a
and #$fe        ; clear bit 0 (raster compare bit 8)
; ora #$01      ; set bit 0 if raster_line > 255
sta $ff0a

; Acknowledge raster IRQ in handler
lda #$02        ; bit 1 = raster IRQ flag
sta $ff09
```

The IRQ vector is at $FFFE/$FFFF (same as 6502 standard). To use a custom handler, switch ROM out so CPU reads from RAM at $FFFE, or use the KERNAL vector at $0314/$0315.

### ROM Banking for IRQ

To bank out ROM and use a direct IRQ handler:
```asm
sei
sta $ff3f       ; switch $8000-$FFFF to RAM
; Set up IRQ vector in RAM at $FFFE/$FFFF
lda #<irq_handler
sta $fffe
lda #>irq_handler
sta $ffff
cli
```

**Warning:** Once ROM is banked out, KERNAL calls are unavailable. The player must handle everything directly (similar to C64's `lda #$35 / sta $01`).

---

## Sound

TED sound is very basic — 2 channels, square wave only (channel 2 can do noise).
- $FF0E: Channel 1 frequency low
- $FF0F: Channel 2 frequency low
- $FF10: Channel 2 frequency high (2 bits)
- $FF11: Sound control (volume, channel enable)
- $FF12: Contains channel 1 frequency high (2 bits) + bitmap/char ROM config

**No SID chip** — music playback (SID files) is NOT possible on C16/Plus4.
The player should set `canSID: false` and disable the music option when C16 is selected.

---

## Emulator Support

The standard emulator is **VICE xplus4** (or the standalone YAPE).
- VICE flag: `xplus4 -autostart file.prg`
- YAPE: standalone Plus/4 emulator

Add to `EmulatorPaths`:
```typescript
c16: string;  // or plus4 / c16plus4
```

The same emulator (xplus4) handles C16, C116, and Plus/4.

---

## Files That Need Changes

### Core Integration (Phase 1 — Charset + Palette)
1. **`FontSelector.tsx`** — Uncomment C16 Upper/Lower entries
2. **`palette.ts`** — Add C16 palette (16-color subset), color names, palette type
3. **`types.ts`** — Add `c16PaletteName` type, add to `Settings`, `SettingsJson`
4. **`settingsSelectors.ts`** — Add C16 palette selectors
5. **`editor.ts`** — Add `c16` prefix case to SET_CHARSET handler (set appropriate default border/bg)
6. **`root.ts`** — Add `c16` prefix to palette selection logic in `fileExportAs`

### Player Export (Phase 2)
7. **`assets/macrosC16.asm`** — New file: TED-specific macros
8. **`player.ts`** — Add `c16` single-frame case + `ANIM_PLATFORMS.c16` config
9. **`types.ts`** — Add `c16` to `EmulatorPaths`
10. **`settings.ts`** — Add default emulator path for C16

### UI / Settings (Phase 3)
11. Player export dialog — show C16 option, hide music controls when selected
12. Preferences — add emulator path for C16/Plus4

---

## Key Differences from C64 Summary

| Feature        | C64                | C16/Plus4                   |
|----------------|--------------------|-----------------------------|
| Video chip     | VIC-II ($D000)     | TED ($FF00)                 |
| Sound chip     | SID ($D400)        | TED (basic, 2 ch)           |
| Screen RAM     | $0400              | $0C00                       |
| Color RAM      | $D800              | $0800                       |
| Border reg     | $D020              | $FF19                       |
| Background reg | $D021              | $FF15                       |
| Charset reg    | $D018              | $FF13                       |
| Colors         | 16 fixed           | 121 (16 hues × 8 lum)      |
| Color byte     | 4 bits (0–15)      | 7 bits (lum<<4 | hue)       |
| BASIC start    | $0801              | $1001                       |
| ROM banking    | $01 (CPU port)     | $FF3E/$FF3F (TED)           |
| Sprites        | 8 hardware         | None                        |
| RAM            | 64KB               | 16KB (C16) / 64KB (Plus/4)  |
| IRQ vector     | $FFFE (bank via $01) | $FFFE (bank via $FF3F)    |
| Raster IRQ     | $D01A/$D012        | $FF0A/$FF0B                 |
| Screen size    | 40×25              | 40×25                       |

---

## References

- Plus/4 World TED Registers: https://plus4world.powweb.com/plus4encyclopedia/500024
- TED color palette (YAPE source / RGBtoHDMI): c0pperdragon/LumaCode wiki
- Lospec TED palette: https://lospec.com/palette-list/commodore-ted-plus-4-c16
- Wikipedia MOS Technology TED: https://en.wikipedia.org/wiki/MOS_Technology_TED
- cc65 C16 docs: https://cc65.github.io/doc/c16.html
- C16 screen/color memory: https://wpguru.co.uk/2014/09/commodore-plus4-screen-memory-map-display-ram
- TED System Hardware Manual PDF: https://www.pagetable.com/?p=541
