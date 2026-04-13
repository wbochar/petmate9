# C128 VDC 80-Column Test Pattern

A standalone test PRG that generates a PETSCII test pattern on the Commodore 128's
VDC 80-column display (RGBI output).

## What it tests

- VDC indirect register access ($D600/$D601)
- Screen RAM writes (character codes at $0000–$07CF in VDC RAM)
- Attribute RAM writes (colors at $0800–$0FCF in VDC RAM)
- VDC block fill operations (register 30)
- All 16 RGBI colors displayed as labeled bars
- Full character set sample (screen codes $00–$FF)
- PETSCII box-drawing border around the 80×25 screen
- Column ruler showing all 80 columns

## Files

- `macros_vdc.asm` — VDC register constants, macros for read/write/fill/address operations, C128 BASIC start macro
- `vdc_test_pattern.asm` — Main test pattern generator (includes macros_vdc.asm)

## Building

### With c64jasm (used by Petmate internally)

```bash
npx c64jasm --out vdc_test.prg vdc_test_pattern.asm
```

### With other assemblers

The source uses c64jasm syntax (`!let`, `!byte`, `!macro`, `!include`, `+macro_call()`).
Adapt syntax as needed for ACME, ca65, 64tass, KickAssembler, etc.

## Running

### VICE x128 emulator

```bash
x128 -80 vdc_test.prg
```

The `-80` flag starts in 80-column mode. After loading, type `RUN` and press Enter.
The test pattern will appear on the 80-column (RGBI) display.

**Note:** VICE's VDC emulation has known inaccuracies, especially with block
fill operations and timing. Test on real hardware when possible.

### Real C128 hardware

1. Transfer `vdc_test.prg` to a disk image or SD card
2. Connect an RGBI monitor (or use an RGBI-to-VGA adapter)
3. Boot in C128 mode (not C64 mode)
4. `LOAD "VDC TEST",8` and `RUN`
5. The pattern appears on the 80-column RGBI output

## Test Pattern Layout

```
Row  0:  ┌─── PETSCII border ───────────────────────────────────────────────────────────┐
Row  1:  │ PETMATE 9 - C128 VDC 80-COLUMN TEST                                         │
Row  2:  │ RGBI OUTPUT - 640X200 - 16 COLORS                                           │
Row  3:  │                                                                              │
Row  4:  │──────────────────────────────────────────────────────────────────────────────│
Row  5:  │ BLK  GRY1 DBLU LBLU DGRN LGRN DCYN LCYN DRED LRED DPUR LPUR BRN  YEL  ... │
Row  6:  │ ████ ████ ████ ████ ████ ████ ████ ████ ████ ████ ████ ████ ████ ████ ... │
Row  7:  │ ████ ████ ████ ████ ████ ████ ████ ████ ████ ████ ████ ████ ████ ████ ... │
Row  8:  │  0    1    2    3    4    5    6    7    8    9   10   11   12   13   ...  │
Row  9:  │──────────────────────────────────────────────────────────────────────────────│
Row 10:  │ CHARACTER SET (SCREEN CODES $00-$FF):                                        │
Row 11-18: │ Sequential screen codes $00–$FF, 32 per row with space separators          │
Row 19:  │──────────────────────────────────────────────────────────────────────────────│
Row 20:  │                                                                              │
Row 21:  │ 80 COLUMNS: 0----+----1----+----2----+----3----+----4----+---- ...            │
Row 22:  │                                                                              │
Row 23:  │ VDC 8563/8568 - PETMATE 9 VDC TEST PATTERN                                  │
Row 24:  └──────────────────────────────────────────────────────────────────────────────┘
```

## VDC Architecture Notes

See `notes/c128-vdc-architecture.md` in the project root for detailed documentation
on the VDC registers, memory layout, and character cell configuration.
