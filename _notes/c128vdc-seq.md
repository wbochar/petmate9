# C128 VDC SEQ Export/Import Logic

## Overview

The C128 VDC SEQ format is a binary sequential file (`.seq`) that encodes 80-column VDC
screen content using PETSCII-style control bytes. It is designed to be loadable on a
real C128 (or in emulators) and played back via BASIC or machine code that streams the
bytes through the KERNAL CHROUT routine.

Petmate extends the standard PETSCII SEQ format in several ways to support the extra
attributes the VDC hardware provides (underline, blink, alternate charset). Those
extensions are documented below.

Relevant source files:
- `src/utils/exporters/seq.ts` — `saveSEQ` / `convertToSEQ`
- `src/utils/importers/seq2petscii.ts` — `loadSeq` / `loadSeqAdvanced`
- `src/utils/vdcAttr.ts` — VDC attribute byte constants and helpers

---

## VDC Attribute Byte

Each cell in a VDC frame carries a `Pixel.attr` byte alongside `Pixel.code` and
`Pixel.color`. The attribute byte is stored verbatim from the VDC attribute RAM format:

| Bit | Constant        | Value | Meaning                                    |
|-----|-----------------|-------|--------------------------------------------|
| 7   | `VDC_ATTR_ALTCHAR`   | 0x80  | Select alternate charset (glyphs 256–511)  |
| 6   | `VDC_ATTR_REVERSE`   | 0x40  | Invert the character bitmap in hardware    |
| 5   | `VDC_ATTR_UNDERLINE` | 0x20  | Draw underline at the bottom scanline      |
| 4   | `VDC_ATTR_BLINK`     | 0x10  | Flash character at VDC blink rate          |
| 3–0 | `VDC_ATTR_COLOR_MASK`| 0x0f  | Foreground colour (RGBI palette, 0–15)     |

`effectiveAttr(pix)` returns `pix.attr` if defined, otherwise falls back to
`pix.color & 0x0f`. This keeps non-VDC pixels compatible with the VDC pipeline.

---

## Export — `seq.ts`

### Entry point

```typescript path=null start=null
saveSEQ(filename, fb, fmt)
```

Reads the following from `fmt.exportOptions`:

| Option        | Default | Description                                       |
|---------------|---------|---------------------------------------------------|
| `insClear`    | false   | Prepend `0x93` (PETSCII CLS / clear screen)       |
| `insCharset`  | false   | Prepend charset switch byte                       |
| `insCR`       | false   | Append a CR after every row                       |
| `stripBlanks` | false   | Omit trailing blank chars; compress colour bytes  |
| `tedColorMode`| `'quantize16'` | TED-only; ignored for VDC                 |

`isVdcCharset(font)` detects VDC mode via the `'c128vdc'` charset ID.

---

### Screencode → SEQ byte mapping

`mapScreencodeByteToSeqCharByte(code)` converts a raw VDC screencode (0x00–0xFF) to the
byte that would be written into the SEQ file and interpreted as a displayable character
by the KERNAL CHROUT routine.

```
Screencode range  →  SEQ byte
0x00–0x1f         →  code + 0x40        (e.g. 0x00 → 0x40 '@')
0x40–0x5d         →  code + 0x80
0x5e              →  0xff               (pi symbol)
0x5f              →  0xdf
0x60–0x7f         →  code + 0x40
0x80–0xbf         →  code - 0x80
0xc0–0xff         →  code - 0x40
```

This is the standard inverse-screencode mapping used by all PETSCII SEQ exports.

---

### The ESC V raw-character extension

VDC screencodes whose SEQ byte would collide with a PETSCII colour or structural control
byte cannot be written directly. `canWriteVdcCodeAsDirectSeqByte(code)` detects this:

1. Apply `mapScreencodeByteToSeqCharByte` to get the candidate SEQ byte.
2. If the candidate is in `seqColorControlBytes` (the 16 colour-switch codes) or in
   `seqStructuralControlBytes` (CR, RVS, home, cursor moves, etc.) → **not safe**.
3. Also verify the inverse decode (`decodeSeqDataByteToVdcScreencode`) round-trips back
   to the original code.

`appendVdcCharByte(bytes, code)`:
- If safe → push the normal SEQ byte.
- If not safe → push `ESC V <raw_screencode>` (bytes 0x1b, 0x56, code).

`ESC V` is a Petmate-invented escape sequence. `0x56` is ASCII `'V'`. On re-import,
the decoder recognises the sequence and uses the raw byte that follows directly as the
screencode, bypassing all further interpretation.

---

### Attribute control bytes emitted per cell

For each cell in the framebuf, the VDC export path emits state-change bytes only when
the relevant attribute differs from the current encoder state:

#### 1. Foreground colour
Standard PETSCII colour-switch byte from the 16-entry table. Emitted only when
`cell.color` changes from the previous cell.

```
Petmate colour index  →  SEQ byte
0 black               →  0x90
1 white               →  0x05
2 red                 →  0x1c
3 cyan                →  0x9f
4 purple              →  0x9c
5 green               →  0x1e
6 blue                →  0x1f
7 yellow              →  0x9e
8 orange              →  0x81
9 brown               →  0x95
10 pink               →  0x96
11 grey 1             →  0x97
12 grey 2             →  0x98
13 lt green           →  0x99
14 lt blue            →  0x9a
15 grey 3             →  0x9b
```

#### 2. Alternate charset (ALTCHAR, bit 7 of attr)
```
ALTCHAR on  →  0x0e   (PETSCII "switch to lower/uppercase")
ALTCHAR off →  0x8e   (PETSCII "switch to upper/graphics")
```
These are the standard PETSCII charset-switch bytes, repurposed here to toggle the
VDC alternate charset rather than switch the C64 VIC-II charset.

#### 3. Underline (bit 5 of attr)
```
Underline on  →  ESC I  (0x1b, 0x49)
Underline off →  ESC J  (0x1b, 0x4a)
```
Non-standard Petmate extension. `0x49` is ASCII `'I'`, `0x4a` is `'J'`.

#### 4. Blink (bit 4 of attr)
```
Blink on  →  ESC O  (0x1b, 0x4f)
Blink off →  ESC P  (0x1b, 0x50)
```
Non-standard Petmate extension. `0x4f` is ASCII `'O'`, `0x50` is `'P'`.

#### 5. Reverse (bit 6 of attr)
```
Reverse on  →  0x12   (standard PETSCII RVS ON)
Reverse off →  0x92   (standard PETSCII RVS OFF)
```

#### 6. Character data
`appendVdcCharByte` — either a direct SEQ byte or `ESC V <raw>` as described above.

The full per-cell sequence when all attributes change simultaneously would be:
```
[colour byte] [0x0e or 0x8e] [ESC I/J] [ESC O/P] [0x12 or 0x92] [char byte(s)]
```
Only bytes for attributes that have actually changed are emitted.

---

### Row termination

After processing all cells in a row (and before the last row):

- If `stripBlanks` is on and trailing blanks were buffered (not yet emitted), a CR is
  emitted to advance to the next row. The buffered blanks are discarded.
- If `insCR` is on, a CR is appended unconditionally.

CR selection: `0x0d` is used if reverse is currently on, `0x8d` otherwise. Both are
treated equivalently on import. The `appendCR` helper avoids emitting duplicate CRs by
checking whether the last byte in the buffer is already a CR.

---

### Strip-blanks optimisation passes

When `stripBlanks = true`, two post-processing passes compact the colour bytes:

**`packColSequences`** — strips a colour byte that immediately precedes a CR when a new
colour byte follows the CR. Avoids the pattern `COLOR CR COLOR`, which wastes a byte.

**`removeDupColours`** — scans backwards through the buffer and removes any colour byte
that is a duplicate of the next colour byte seen (not necessarily adjacent). The most
recently seen colour byte is always the one that matters, so earlier duplicates are dead.

---

## Import — `seq2petscii.ts`

### Two decoder classes

| Class          | Used by           | Notes                                            |
|----------------|-------------------|--------------------------------------------------|
| `SeqDecoder`   | `loadSeq`         | Simple, legacy; width fixed at 40 (or 80 for VDC)|
| `SeqAdvDecoder`| `loadSeqAdvanced` | Configurable width, CR codes, `honorCls`, etc.   |

Both implement the same decode logic. The descriptions below apply to both.

---

### Decoder state

```
revsOn          boolean   — reverse video currently active
underlineOn     boolean   — underline currently active
blinkOn         boolean   — blink currently active
charsetLowerMode boolean  — alternate charset currently active
pendingEscape   boolean   — the previous byte was ESC (0x1b)
pendingVdcRawChar boolean — the previous bytes were ESC V; next byte is a raw screencode
cursorColor     number    — current foreground colour index (0–15)
cursorPosX      number    — current virtual cursor column
cursorPosY      number    — current virtual cursor row
c64Screen       Pixel[][] — virtual screen buffer (width × 500 rows)
```

Width is 80 for VDC (detected via `isVdcCharset`). Height is a 500-row virtual buffer;
the actual height is `cursorPosY + 1` after decoding.

---

### `decode(seqFile)` main loop

Iterates over every byte. For VDC mode (`useVdcSemantics = true`):

**Step 1 — ESC V raw character:**
If `pendingVdcRawChar` is set, use this byte directly as a screencode via `scrnOut`.
Clear `pendingVdcRawChar`. Do not interpret as a control byte.

**Step 2 — ESC dispatch:**
If `pendingEscape` is set, decode the escape type:
```
0x49 (I)  →  underlineOn = true
0x4a (J)  →  underlineOn = false
0x4f (O)  →  blinkOn = true
0x50 (P)  →  blinkOn = false
0x56 (V)  →  pendingVdcRawChar = true
```
Any unrecognised escape byte is silently ignored. Clear `pendingEscape`.

**Step 3 — Color control bytes:**
`decodeSeqColorControlByte` checks if the byte is one of the 16 PETSCII colour codes.
If so, update `cursorColor`. Do not write to the screen.

**Step 4 — Structural control bytes:**
```
0x07        bell — ignored
0x0d/0x8d   carriage return: cursor down + X → 0
0x0e        charset lower mode on  (VDC only)
0x8e        charset lower mode off (VDC only)
0x1b (ESC)  pendingEscape = true   (VDC only)
0x02        underline on  (legacy; VDC only)
0x82        underline off (legacy; VDC only)
0x0f        blink on      (legacy; VDC only)
0x8f        blink off     (legacy; VDC only)
0x11        cursor down
0x12        revsOn = true
0x13        cursor home (X=0, Y=0)
0x14        delete: cursor left, write space, cursor left
0x1d        cursor right
0x91        cursor up
0x92        revsOn = false
0x93        clear screen — only if honorCls=true (SeqAdvDecoder), always in SeqDecoder
0x9d        cursor left
0xff        screencode 94 (pi symbol)
```

In `SeqAdvDecoder`, `0x0d`/`0x8d` are handled by the configurable `crCodes` set before
the switch statement, so any CR code configured by the user triggers a carriage return.

**Step 5 — Data bytes (default case):**
Map SEQ data bytes to screencodes (inverse of export mapping):
```
SEQ byte range  →  screencode
0x20–0x3f       →  byte            (literal 0x20–0x3f)
0x40–0x5f       →  byte - 0x40    (0x00–0x1f)
0x60–0x7f       →  byte - 0x20    (0x40–0x5f)
0xa0–0xbf       →  byte - 0x40    (0x60–0x7f)
0xc0–0xfe       →  byte - 0x80    (0x40–0x7e)
0xff            →  94              (handled earlier)
```
Bytes 0x80–0x9f not in the colour or structural sets are silently ignored (they are
undefined in the standard PETSCII SEQ byte space for VDC content).

---

### `scrnOut(b, lastByte)` — writing to the virtual screen

For VDC (`useVdcSemantics = true`):
1. Extract `color = cursorColor & 0x0f`.
2. Build `attr = color`.
3. Conditionally OR in flags from current decoder state:
   - `revsOn` → `attr |= 0x40` (REVERSE)
   - `charsetLowerMode` → `attr |= 0x80` (ALTCHAR)
   - `underlineOn` → `attr |= 0x20` (UNDERLINE)
   - `blinkOn` → `attr |= 0x10` (BLINK)
4. Write `{ code: b & 0xff, color, attr }` to `c64Screen[cursorPosY][cursorPosX]`.
5. Unless `lastByte` is true, call `cursorRight()`.

The `lastByte` flag prevents the virtual cursor from advancing after the final byte of
the file, which would trigger a spurious scroll-up or add an extra empty row.

---

### Cursor movement

```
cursorRight()  →  X++; if X == width: Y++, X=0; if Y == height: scrollAllUp()
cursorLeft()   →  X--; if X < 0: Y--, X = width-1
cursorDown()   →  Y++; if Y == height: scrollAllUp()
cursorUp()     →  Y--; stops at 0
scrollAllUp()  →  shifts all rows up by one (c64Screen[y-1] = c64Screen[y])
```

---

### Output frame construction (`loadSeqAdvanced`)

After `decoder.decode(seqFile)`:

1. `detectedHeight = decoder.cursorPosY + 1`
2. `finalHeight = max(detectedHeight, options.minHeight ?? 0)`
3. `screen = decoder.c64Screen.slice(0, finalHeight)`
4. If `options.stripBlanks`: trailing blank cells per row are replaced with `{ code: 0x20, color }`.
5. A `framebufFromJson` is created with:
   - `width` from `options.width` (80 for VDC)
   - `height = finalHeight`
   - `charset`, `backgroundColor`, `borderColor` from options
   - `name` derived from the filename

---

## Roundtrip Guarantee

The exporter and importer are designed to be lossless for VDC content. The roundtrip
test (`vdcSeqRoundtripArtifacts.test.ts`) verifies this by:

1. Constructing a synthetic 80×25 framebuf that exercises all 8 combinations of
   `lower`, `reverse`, and `underline` across the rows.
2. Exporting to SEQ via `saveSEQ`.
3. Re-importing via `loadSeqAdvanced` with `charset: 'c128vdc'`.
4. Rendering both the original and re-imported framebuf to RGBA PNGs using the real
   C128 charset bitmap data.
5. Asserting zero mismatched pixels.

A second test (`vdcSeqRoundtripRealDataArtifacts.test.ts`) performs the same check
against the real-data test petmate file `_tests/vdc-seq-test-data.petmate`.

---

## Summary of Petmate-specific VDC SEQ extensions

| Extension              | Export bytes              | Import trigger                  | Purpose                              |
|------------------------|---------------------------|---------------------------------|--------------------------------------|
| Raw character escape   | `0x1b 0x56 <code>`        | `pendingEscape` + byte `0x56`  → `pendingVdcRawChar` | Write screencodes that collide with control bytes |
| Underline on           | `0x1b 0x49`               | `pendingEscape` + byte `0x49`   | Map to `VDC_ATTR_UNDERLINE` (0x20)   |
| Underline off          | `0x1b 0x4a`               | `pendingEscape` + byte `0x4a`   | Clear `VDC_ATTR_UNDERLINE`           |
| Blink on               | `0x1b 0x4f`               | `pendingEscape` + byte `0x4f`   | Map to `VDC_ATTR_BLINK` (0x10)       |
| Blink off              | `0x1b 0x50`               | `pendingEscape` + byte `0x50`   | Clear `VDC_ATTR_BLINK`               |
| Alternate charset on   | `0x0e` (std PETSCII)      | byte `0x0e`                     | Map to `VDC_ATTR_ALTCHAR` (0x80)     |
| Alternate charset off  | `0x8e` (std PETSCII)      | byte `0x8e`                     | Clear `VDC_ATTR_ALTCHAR`             |

Standard PETSCII `0x12`/`0x92` (RVS ON/OFF) and the 16 colour-switch bytes are used
without modification.

Legacy underline/blink control bytes `0x02`, `0x82`, `0x0f`, `0x8f` are recognised on
import for backward compatibility but are no longer emitted by the exporter.
