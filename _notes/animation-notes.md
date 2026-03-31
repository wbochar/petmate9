# Petmate 9 — Animation Player Notes

## Overview
The PRG Player v1.01 exports C64-family PETSCII animations as standalone .prg files
using c64jasm assembly. Screen data is RLE-compressed, color data is nibble-packed
(two 4-bit color values per byte). A 6502 decoder on the target machine unpacks
frames at runtime.

## Data Compression

### RLE Encoding (screen codes)
Marker byte: `$FE`

| Stream | Meaning |
|--------|---------|
| `$FE, 0` | Literal `$FE` byte |
| `$FE, N, V` | Repeat value V, N times |
| any other byte | Literal |

Runs are only encoded at length ≥ 4 (otherwise literals are smaller or equal).
The marker itself is always escaped. Max run length per token: 255.

Typical compression on PETSCII art: **90–97%** savings (most screens are
dominated by spaces `$20`).

### Nibble Packing (color data)
C64 color RAM stores values 0–15 in full bytes. Since only the low nibble
matters, two consecutive colors are packed into one byte:

```
packed = (color_even << 4) | color_odd
```

This always halves color data: 1000 bytes → 500 bytes (40×25),
506 → 253 bytes (22×23 VIC-20). No additional RLE is applied to the
packed color stream.

### Combined savings (40×25 C64, 60-frame test file)
- Screen: 60,000 → 3,099 bytes (−94.8%)
- Color:  60,000 → 30,000 bytes (−50.0%)
- Total:  120,000 → 33,099 bytes (−72.4%)
- Final PRG: 39,244 bytes (includes code + decoder routines)

## Platform Configurations

### C64
- BASIC start: `$0801`
- Screen: `$0400` (40×25 = 1000 bytes)
- Color RAM: `$D800` (1000 bytes)
- Frame data: `$2000–$CFFF` (~44 KB, ~40 KB with SID)
- Timing: VIC-II raster IRQ (`frameCount` incremented each frame)
- Kernal banked out: `LDA #$35 / STA $01`
- SID music: supported (plugin at `$1000`, init before SEI, play in IRQ)
- Charset: `$D018` — `$15` (upper), `$17` (lower)

### C128
- BASIC start: `$1C01`
- Screen: `$0400`, Color: `$D800` (same as C64)
- Frame data: `$2000–$CFFF` (~44 KB)
- Timing: VIC-II raster IRQ (same as C64)
- Kernal banked out: same `$01` trick
- SID music: **not supported** — BASIC at `$1C01` overlaps SID load at `$1000`.
  Would need segment reordering to fix.
- Charset: `$D018` + shadow at `$0A2C` — `$15`/`$17`

### PET 4032
- BASIC start: `$0401`
- Screen: `$8000` (40×25 = 1000 bytes, separate video RAM chip)
- Color RAM: **none** (monochrome phosphor)
- Frame data: `$0800–$7FFF` (~30 KB)
- Timing: busy-wait delay loop (no VIC-II — PET uses VIA/PIA interrupts,
  the c64jasm IRQ macros reference non-existent VIC-II registers)
- SID music: **none** (no SID chip)
- Charset: `$E84C` — `12` (graphics), `14` (business)
- Animation data: RLE screen codes only, no color decode

### VIC-20
- BASIC start: `$1001` (unexpanded)
- Screen: `$1E00` (22×23 = 506 bytes)
- Color RAM: `$9600` (506 bytes)
- Border/BG: combined register `$900F` = `(bg << 4) | border | 8`
- Timing: busy-wait delay loop (no VIC-II raster IRQ)
- SID music: **none** (VIC chip has own sound, not used here)
- Charset: `$9005` — `$F0` (upper), `$F2` (lower)

#### VIC-20 RAM Expansion Options

| Config | Data Start | Data Range | Available | Est. Frames |
|--------|-----------|------------|-----------|-------------|
| Unexpanded (5 KB) | `$1200` | `$1200–$1DFF` | ~3 KB | ~5–8 |
| +3 KB (8 KB total) | `$0400` | `$0400–$0FFF` + code area | ~6 KB | ~10–15 |
| +8 KB (13 KB total) | `$1200` | `$1200–$3FFF` | ~11 KB | ~20–30 |
| +16 KB (21 KB total) | `$1200` | `$1200–$5FFF` | ~19 KB | ~35–50 |
| +24 KB (29 KB total) | `$1200` | `$1200–$7FFF` | ~27 KB | ~50–70 |

Frame estimates assume ~350–550 bytes/frame (RLE screen + nibble-packed color).
Actual size depends heavily on art complexity.

## FPS / Timing

The UI accepts an FPS value. This is converted to a delay count:

```
vblanks = round(60 / fps)     // clamped 1–255
```

- C64/C128: `vblanks` = number of raster frames to wait (via IRQ counter)
- PET/VIC-20: `vblanks` = iterations of a ~16,667-cycle busy-wait loop (~1/60 sec each at 1 MHz)

| FPS | Delay units |
|-----|-------------|
| 60 | 1 |
| 30 | 2 |
| 15 | 4 |
| 10 | 6 |
| 7.5 | 8 |
| 5 | 12 |
| 1 | 60 |

## SID Music Support

Only available on **C64** (single frame and animation).

The c64jasm `!use "plugins/sid"` directive loads `sid.js`, a plugin that
parses the SID file header and extracts:
- `music.startAddress` — where SID data loads (usually `$1000`)
- `music.init` — init entry point (= startAddress)
- `music.play` — play entry point (= startAddress + 3)
- `music.data` — raw SID payload bytes

In the assembly:
1. `JSR music.init` is called **before** `SEI` (kernal still available)
2. `JSR music.play` is called inside the raster IRQ handler
3. SID data is placed at `* = music.startAddress`

**Note:** c64jasm uses Node's `require()` for plugins (not the virtual FS),
so `sid.js` must exist on disk. The test scripts write it to `<project>/plugins/sid.js`.
The SID data file (`assets/sidFile.sid`) is served through the virtual `readFileSync`
callback — Windows path separators (`\`) are normalized to `/` in the callback.

## 6502 Decoder Routines

### RLE Decoder
Zero-page usage: `$20/$21` (src), `$22/$23` (dst), `$24/$25` (remain), `$26` (rle_val)

Always uses `Y=0` for indirect indexed addressing, manually incrementing
16-bit pointers. The `remain` counter tracks **output bytes** to produce.

### Nibble Decoder
Same zero-page pointers. `remain` counts **input (packed) bytes**.
Each packed byte produces two output bytes (high nibble first, low nibble second).

### Estimated decode time per frame (1 MHz)
- RLE decode 1000 bytes: ~10–15 ms depending on compression ratio
- Nibble decode 500 bytes: ~15 ms
- Total: ~25–30 ms (~1.5 raster frames). Minor tearing possible on complex frames.

## Assembly Template Structure

### IRQ-based platforms (C64, C128)
```
+basic_start(entry)
entry:     music.init → SEI → bank out kernal → setup_irq → CLI → charset → show first frame
main_loop: poll frameCount → decrement delay → advance frame → show_frame → loop
show_frame: RLE decode to SCREEN, nibble decode to COLOR, set border/bg
rle_decode: marker-based RLE unpacker
nibble_decode: split packed bytes into two color values
irq_top:   inc frameCount, music.play
variables: frameCount, currentFrame, delayCounter
tables:    frame_border, frame_bg, frame_scr_lo/hi, frame_col_lo/hi
data:      * = $2000, compressed frames
```

### Delay-based platforms (PET, VIC-20)
```
+basic_start(entry)
entry:     charset → show first frame
main_loop: delay_frames → advance frame → show_frame → loop
show_frame: RLE decode to SCREEN [, nibble decode to COLOR] [, set $900F]
rle_decode: same as above
nibble_decode: same (omitted on PET)
delay_frames: nested busy-wait loop (X=speed, Y=14, A=256 inner iterations)
variables: currentFrame
tables:    frame_scr_lo/hi [, frame_col_lo/hi] [, frame_border]
data:      * = platform-specific start, compressed frames
```

## Test Scripts

### `run_player_test.js` — Single-frame player test
Exports the first 8 frames from `computers_097a.petmate` as per-platform .prg files.

```
node _tests/run_player_test.js --no-launch
node _tests/run_player_test.js --no-launch --sid _tests/sids/Geosix11.sid
```

### `run_animation_player_test.js` — Animation player test
Exports 60 animation frames (indices 8–67) as a single C64 animation .prg.

```
node _tests/run_animation_player_test.js --no-launch
node _tests/run_animation_player_test.js --no-launch --fps 15
node _tests/run_animation_player_test.js --no-launch --fps 10 --sid _tests/sids/uuuristen.sid
```

### Available test SID files
- `_tests/sids/Geosix11.sid`
- `_tests/sids/bassechotest.sid`
- `_tests/sids/uuuristen.sid`

### Source petmate file
`_defaults/computers_097a.petmate` — 68 frames total:
- Frames 0–7: platform test screens (C64, C128, PET, VIC-20 upper/lower)
- Frames 8–67: 60 animation frames (40×25, upper charset, bg=0, border=11)

## Files Modified

| File | Changes |
|------|---------|
| `src/redux/typesExport.ts` | Added `playerFPS`, `vic20RAM` to export options |
| `src/containers/ExportModal.tsx` | Animation radio, FPS input, VIC-20 RAM dropdown, platform notes, SID gated to C64, V1.01 |
| `src/utils/exporters/player.ts` | `rleEncode`, `nibblePack`, `fpsToVblanks`, `ANIM_PLATFORMS` configs, `getVic20Config`, `saveAnimationPlayer` |
| `src/utils/index.ts` | Added `playerFPS`, `vic20RAM` defaults to formats |
| `src/components/formHelpers.js` | Added `Select` component, `disabled` prop on `RadioButton` |
| `_tests/run_animation_player_test.js` | Animation export test with `--fps`, `--sid` |
| `_tests/run_player_test.js` | Added `--sid` support |
