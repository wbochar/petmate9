# C128 Player Programming Notes

## The Problem
The C128 lowercase player PRG does not switch to the lowercase character set.
The uppercase player appears to work, but only by coincidence.

## Root Cause: VIC-II Shadow Registers

On the C128, the kernal's screen editor IRQ routine maintains **shadow registers** in RAM
and periodically copies them to the actual VIC-II hardware registers. The shadow register
for `$D018` (character generator / screen memory pointer) is at **`$0A2C`**.

The default shadow value is **`$14`** (`%00010100`):
- Bits 4-7 = `%0001` → screen memory at `$0400`
- Bits 1-3 = `%010` → character ROM at `$1000` (uppercase)

### Why uppercase "works"

| Value | Bits 1-3 | Char base | Charset    |
|-------|----------|-----------|------------|
| `$14` | `%010`   | `$1000`   | Uppercase  |
| `$15` | `%010`   | `$1000`   | Uppercase  |
| `$17` | `%011`   | `$1800`   | Lowercase  |

`$14` and `$15` both resolve to the same character base (`$1000` = uppercase ROM).
The only difference is bit 0, which is unused by the VIC-II.

So when the player sets `$D018 = $15` for uppercase, and the kernal overwrites it
with `$14` from the shadow register, the character set stays uppercase — it looks correct.

When the player sets `$D018 = $17` for lowercase, the kernal overwrites it with `$14`,
reverting to uppercase. The charset switch is lost.

## Why This Doesn't Happen on the C64

On the C64, the player code does:
```asm
lda #$35
sta $01         ; Bank out kernal and basic ROM
```

This properly disables the kernal ROM at `$E000-$FFFF`. The custom IRQ vector at
`$FFFE/$FFFF` then reads from RAM (our vector), so the kernal's IRQ handler never runs.

On the C128, **`$01` does not control ROM banking** — the MMU at `$FF00`/`$D500` does.
Writing `$35` to `$01` has limited or no effect in C128 mode. The kernal ROM remains
mapped, so:

1. IRQ fires → CPU reads vector from `$FFFE` in **ROM** (kernal's vector, not ours)
2. Kernal's IRQ handler runs
3. Kernal copies shadow registers → VIC hardware registers
4. Our `$D018` value is overwritten

## The Fix: Update the Shadow Register

Write the charset value to **both** `$D018` (hardware) and `$0A2C` (shadow):

```asm
lda #$17        ; lowercase charset
sta $d018       ; set VIC-II register directly
sta $0a2c       ; also update the shadow register
```

Now when the kernal's IRQ copies shadow → hardware, it copies **our** value.

### In player.ts / run_player_test.js

```typescript
case 'c128Upper': charsetBits = " lda #$15 \n sta $d018 \n sta $0a2c \n"; break;
case 'c128Lower': charsetBits = " lda #$17 \n sta $d018 \n sta $0a2c \n"; break;
```

## Alternative Approaches Considered

### 1. Disable screen editor VIC updates (`$D8 = $FF`)

Location `$D8` (216 decimal) controls the screen editor portion of the kernal IRQ.
Storing `$FF` there disables VIC register updates from shadow RAM.

```asm
lda #$ff
sta $d8         ; disable screen editor VIC shadow updates
```

**Source:** "Mapping the C128", page 69, address 216.

**Result:** When added to the `setup_irq` macro in `macrosc128.asm`, this caused
garbage on screen in x128.exe. The screen editor may be responsible for additional
display maintenance beyond just shadow register copies. Not recommended without
further investigation.

**Note from commodore-128.org forum:** Disabling `$D8` also stops BASIC's `GRAPHIC`
command from working and may affect other screen editor functions. A second flag at
`$0A04` (bit 1) controls BASIC's sprite/collision portion of the VIC IRQ separately.

### 2. Bank out kernal via MMU (`$FF00`)

The C128 MMU configuration register at `$FF00` controls ROM/RAM mapping:

```asm
lda #$xx        ; configuration value for all-RAM + I/O
sta $ff00       ; apply immediately
```

This would make `$FFFE/$FFFF` read from RAM (our custom IRQ vector), preventing the
kernal IRQ from running at all. The `$01` write in the player template would become
redundant.

**Not attempted** — the exact bit layout of the MMU configuration register is complex
(controls $4000-$7FFF, $8000-$BFFF, $C000-$FFFF ROM selection, RAM block, and I/O
visibility). Would require updating `macrosc128.asm` and potentially the player
template. Worth exploring for a more complete C128 player.

### 3. Use kernal IRQ vector (`$0314/$0315`) instead of (`$FFFE/$FFFF`)

The C128 kernal's hardware IRQ handler at `$FFFE` (in ROM) eventually jumps through
the software vector at `$0314/$0315`. Setting our custom IRQ address there instead
of `$FFFE/$FFFF` would let the kernal do its housekeeping first, then call our handler.

This would require changing `macrosc128.asm`'s `setup_irq` and `end_irq` macros.
The kernal would still update VIC from shadows before calling our handler, so the
shadow register fix (`$0A2C`) would still be needed.

## Other C128 Player Issues Found

### Border/background color hex formatting (player.ts)

The C128 section in `player.ts` line 286 uses:
```typescript
lines.push(`!byte ${borderColor.toString(16)},${backgroundColor.toString(16)}`);
```

This outputs bare hex digits like `!byte d,b` instead of `!byte 13,11` or `!byte $0d,$0b`.
The assembler would interpret `d` and `b` as label references, not numbers.

The C64 section correctly uses decimal:
```typescript
lines.push(`!byte ${borderColor},${backgroundColor}`);
```

### Custom IRQ handler never runs on C128

Because `$01=$35` doesn't bank out the kernal on C128, the IRQ vector at `$FFFE/$FFFF`
always reads from ROM. The custom `irq_top` handler (which increments `frameCount`)
never executes. This doesn't affect the single-frame player (which uses `jmp *`), but
would break any future multi-frame animation that relies on `frameCount` or the
`frame_loop`/`vSync` code.

## References

- "Mapping the Commodore 128" — address 216 (`$D8`), screen editor IRQ control
- commodore-128.org forum — "Shadow registers of VIC" thread (Jan 2010)
- c128.freeforums.net — double buffering thread confirming `$0A2C` as `$D018` shadow
- fightingcomputers.nl — "C128 assembly Part 2" — MMU configuration register usage
