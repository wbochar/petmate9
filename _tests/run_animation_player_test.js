#!/usr/bin/env node
/**
 * Petmate Animation Player Export Test
 *
 * Exports frames 1-10 (indices 8-17) from computers_097a.petmate as
 * a single animated C64 .prg player binary using c64jasm.
 *
 * Data compression:
 *   Screen codes → RLE encoded  (marker $FE)
 *   Color values → nibble packed (two 4-bit colors per byte)
 *
 * RLE format:
 *   literal byte      → output byte directly
 *   $FE, 0            → output literal $FE
 *   $FE, count, value → output value repeated count times
 */

const fs      = require('fs');
const path    = require('path');
const c64jasm = require('c64jasm');
const { spawn } = require('child_process');
const readline = require('readline');

const ROOT     = path.resolve(__dirname, '..');
const SRC_FILE = path.join(ROOT, '_defaults', 'computers_097a.petmate');
const ASSETS   = path.join(ROOT, 'assets');
const EXPORTS  = path.join(__dirname, 'exports');
const VICE_BIN = 'C:\\C64\\VICE\\bin';

// ─── Configuration ──────────────────────────────────────────────────
const FIRST_FRAME_INDEX = 8;   // petmate file index of "frame-1"
const NUM_FRAMES        = 60;
const RLE_MARKER        = 0xFE;

// FPS support (--fps <number>, default 10)
const fpsArgIdx  = process.argv.indexOf('--fps');
const TARGET_FPS = fpsArgIdx >= 0 && fpsArgIdx + 1 < process.argv.length
                   ? parseFloat(process.argv[fpsArgIdx + 1])
                   : 10;
const FRAME_SPEED = Math.max(1, Math.min(255, Math.round(60 / TARGET_FPS)));

// ─── SID music support (--sid <filepath>) ───────────────────────────
const sidArgIdx = process.argv.indexOf('--sid');
const SID_FILE  = sidArgIdx >= 0 && sidArgIdx + 1 < process.argv.length
                  ? process.argv[sidArgIdx + 1]
                  : null;
const MUSIC     = SID_FILE !== null;

// ─── Load source ────────────────────────────────────────────────────
const petmate  = JSON.parse(fs.readFileSync(SRC_FILE, 'utf-8'));
const frames   = petmate.framebufs.slice(FIRST_FRAME_INDEX, FIRST_FRAME_INDEX + NUM_FRAMES);
const macrosAsm = fs.readFileSync(path.join(ASSETS, 'macrosc64.asm'));
const sidFileData = MUSIC ? fs.readFileSync(path.resolve(SID_FILE)) : null;
const sidJs       = MUSIC ? fs.readFileSync(path.join(ASSETS, 'sid.js')) : null;

// ─── Helpers ────────────────────────────────────────────────────────

function toHex8(v) {
  return v.toString(16).toUpperCase().padStart(2, '0');
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function bytesToAsmLines(bytes, bytesPerLine = 16) {
  return chunkArray(bytes, bytesPerLine).map(row =>
    `\n!byte ${row.map(n => `$${toHex8(n)}`).join(',')}`
  );
}

function pctStr(compressed, raw) {
  return ((1 - compressed / raw) * 100).toFixed(1);
}

// ─── RLE Encoder ────────────────────────────────────────────────────

function rleEncode(bytes) {
  const out = [];
  let i = 0;

  while (i < bytes.length) {
    const b = bytes[i];

    // measure run length (max 255)
    let run = 1;
    while (i + run < bytes.length && bytes[i + run] === b && run < 255) {
      run++;
    }

    if (b === RLE_MARKER) {
      // marker byte must always be escaped
      if (run === 1) {
        out.push(RLE_MARKER, 0);            // literal $FE
      } else {
        out.push(RLE_MARKER, run, RLE_MARKER); // run of $FEs
      }
    } else if (run >= 4) {
      out.push(RLE_MARKER, run, b);          // RLE run (saves at run>=4)
    } else {
      for (let j = 0; j < run; j++) out.push(b); // literals
    }
    i += run;
  }
  return out;
}

// ─── RLE Decoder (JS verification) ─────────────────────────────────

function rleDecode(encoded) {
  const out = [];
  let i = 0;
  while (i < encoded.length) {
    if (encoded[i] === RLE_MARKER) {
      i++;
      const count = encoded[i++];
      if (count === 0) {
        out.push(RLE_MARKER);
      } else {
        const val = encoded[i++];
        for (let j = 0; j < count; j++) out.push(val);
      }
    } else {
      out.push(encoded[i++]);
    }
  }
  return out;
}

// ─── Nibble Packer ──────────────────────────────────────────────────

function nibblePack(colors) {
  const packed = [];
  for (let i = 0; i < colors.length; i += 2) {
    const hi = colors[i] & 0x0F;
    const lo = (i + 1 < colors.length) ? (colors[i + 1] & 0x0F) : 0;
    packed.push((hi << 4) | lo);
  }
  return packed;
}

function nibbleUnpack(packed) {
  const out = [];
  for (const b of packed) {
    out.push((b >> 4) & 0x0F);
    out.push(b & 0x0F);
  }
  return out;
}

// ─── Process frames ─────────────────────────────────────────────────

console.log(`\nPetmate Animation Player Export Test`);
console.log(`Source : ${SRC_FILE}`);
console.log(`Frames : ${NUM_FRAMES} (indices ${FIRST_FRAME_INDEX}–${FIRST_FRAME_INDEX + NUM_FRAMES - 1})`);
console.log(`Speed  : ${TARGET_FPS} fps (${FRAME_SPEED} vblanks/frame)`);
if (MUSIC) console.log(`SID    : ${SID_FILE}`);
console.log('');

const processed = frames.map((fb, idx) => {
  const { width, height, framebuf, backgroundColor, borderColor, name } = fb;

  const screenCodes = [];
  const colorValues = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      screenCodes.push(framebuf[y][x].code);
      colorValues.push(framebuf[y][x].color);
    }
  }

  const rleScreen    = rleEncode(screenCodes);
  const packedColors = nibblePack(colorValues);

  // Verify round-trip
  const decoded = rleDecode(rleScreen);
  if (decoded.length !== screenCodes.length || !decoded.every((v, i) => v === screenCodes[i])) {
    throw new Error(`RLE round-trip FAILED for frame ${idx} (${name})`);
  }
  const unpackedColors = nibbleUnpack(packedColors).slice(0, colorValues.length);
  if (!unpackedColors.every((v, i) => v === (colorValues[i] & 0x0F))) {
    throw new Error(`Nibble round-trip FAILED for frame ${idx} (${name})`);
  }

  console.log(
    `  Frame ${idx} (${(name || 'untitled').padEnd(10)}): ` +
    `scr ${screenCodes.length}→${rleScreen.length} (-${pctStr(rleScreen.length, screenCodes.length)}%)  ` +
    `col ${colorValues.length}→${packedColors.length} (-${pctStr(packedColors.length, colorValues.length)}%)  ` +
    `total ${screenCodes.length + colorValues.length}→${rleScreen.length + packedColors.length}`
  );

  return {
    name,
    borderColor,
    backgroundColor,
    rleScreen,
    packedColors,
    rawScreenSize: screenCodes.length,
    rawColorSize: colorValues.length,
  };
});

// Totals
const totRawScr = processed.reduce((s, f) => s + f.rawScreenSize, 0);
const totRleScr = processed.reduce((s, f) => s + f.rleScreen.length, 0);
const totRawCol = processed.reduce((s, f) => s + f.rawColorSize, 0);
const totPkdCol = processed.reduce((s, f) => s + f.packedColors.length, 0);
console.log(
  `\n  TOTAL: scr ${totRawScr}→${totRleScr} (-${pctStr(totRleScr, totRawScr)}%)  ` +
  `col ${totRawCol}→${totPkdCol} (-${pctStr(totPkdCol, totRawCol)}%)  ` +
  `all ${totRawScr + totRawCol}→${totRleScr + totPkdCol} (-${pctStr(totRleScr + totPkdCol, totRawScr + totRawCol)}%)\n`
);

// ═══════════════════════════════════════════════════════════════════
//  GENERATE ASSEMBLY
// ═══════════════════════════════════════════════════════════════════

function generateAnimationASM() {
  // ── Compressed frame data ──
  let frameDataAsm = '';
  for (let i = 0; i < processed.length; i++) {
    const pf = processed[i];
    frameDataAsm += `\nframe${i}_scr:`;
    frameDataAsm += bytesToAsmLines(pf.rleScreen).join('');
    frameDataAsm += `\nframe${i}_col:`;
    frameDataAsm += bytesToAsmLines(pf.packedColors).join('');
  }

  // ── Lookup tables ──
  const borders = processed.map(f => f.borderColor).join(',');
  const bgs     = processed.map(f => f.backgroundColor).join(',');
  const scrLos  = processed.map((_, i) => `frame${i}_scr & $ff`).join(',');
  const scrHis  = processed.map((_, i) => `frame${i}_scr >> 8`).join(',');
  const colLos  = processed.map((_, i) => `frame${i}_col & $ff`).join(',');
  const colHis  = processed.map((_, i) => `frame${i}_col >> 8`).join(',');

  // ── Charset setup ──
  // All animation frames use 'upper' charset
  const charsetBits = `lda #$15\n    sta $d018`;

  return `
; ──────────────────────────────────────────────────────────────
; Petmate9 Animation Player (C64) – RLE + Nibble Packed
; Generated by run_animation_player_test.js
; Frames: ${NUM_FRAMES}   Speed: ${FRAME_SPEED} vblanks/frame
; ──────────────────────────────────────────────────────────────
!include "macros.asm"
${MUSIC ? '!use "plugins/sid" as sid' : ''}
${MUSIC ? '!let music = sid("assets/sidFile.sid")' : ''}

!let irq_top_line  = 1
!let debug_build   = FALSE
!let ANIM_FRAMES   = ${NUM_FRAMES}
!let ANIM_SPEED    = ${FRAME_SPEED}
!let RLE_MARKER    = $fe

; Zero-page pointers used by decoders
!let zp_src        = $20
!let zp_dst        = $22
!let zp_remain     = $24
!let zp_rle_val    = $26

+basic_start(entry)

;--------------------------------------------------------------
; Entry point
;--------------------------------------------------------------
entry: {
${MUSIC ? '    lda #0' : ''}
${MUSIC ? '    jsr music.init' : ''}

    sei
    lda #$35
    sta $01
    +setup_irq(irq_top, irq_top_line)
    cli

    ; Charset
    ${charsetBits}

    ; Init animation state
    lda #0
    sta currentFrame
    lda #1
    sta delayCounter

    jsr show_frame

main_loop:
    lda frameCount
vsync_wait:
    cmp frameCount
    beq vsync_wait

    dec delayCounter
    bne main_loop

    ; Reset delay, advance frame
    lda #ANIM_SPEED
    sta delayCounter

    ldx currentFrame
    inx
    cpx #ANIM_FRAMES
    bne no_wrap
    ldx #0
no_wrap:
    stx currentFrame

    jsr show_frame
    jmp main_loop
}

;--------------------------------------------------------------
; show_frame – decode current frame to screen + color RAM
;--------------------------------------------------------------
show_frame: {
    ldx currentFrame

    ; Border & background
    lda frame_border,x
    sta $d020
    lda frame_bg,x
    sta $d021

    ; ── RLE decode screen data ──
    lda frame_scr_lo,x
    sta zp_src
    lda frame_scr_hi,x
    sta zp_src+1
    lda #<SCREEN
    sta zp_dst
    lda #>SCREEN
    sta zp_dst+1
    lda #$e8            ; 1000 = $03E8
    sta zp_remain
    lda #$03
    sta zp_remain+1
    jsr rle_decode

    ; ── Nibble decode color data ──
    ldx currentFrame
    lda frame_col_lo,x
    sta zp_src
    lda frame_col_hi,x
    sta zp_src+1
    lda #<COLOR
    sta zp_dst
    lda #>COLOR
    sta zp_dst+1
    lda #$f4            ; 500 = $01F4
    sta zp_remain
    lda #$01
    sta zp_remain+1
    jsr nibble_decode

    rts
}

;--------------------------------------------------------------
; rle_decode
;   zp_src    → compressed stream
;   zp_dst    → destination (e.g. screen RAM)
;   zp_remain → bytes remaining to PRODUCE
;
; Format: $FE,0       = literal $FE
;         $FE,cnt,val = repeat val cnt times
;         other       = literal byte
;--------------------------------------------------------------
rle_decode: {
    ldy #0

next:
    lda zp_remain
    ora zp_remain+1
    beq done

    ; Read source byte
    lda (zp_src),y
    inc zp_src
    bne src1
    inc zp_src+1
src1:
    cmp #RLE_MARKER
    beq escape

    ; ── literal byte ──
    sta (zp_dst),y
    inc zp_dst
    bne dst1
    inc zp_dst+1
dst1:
    lda zp_remain
    bne rem1
    dec zp_remain+1
rem1:
    dec zp_remain
    jmp next

escape:
    ; Read count
    lda (zp_src),y
    inc zp_src
    bne src2
    inc zp_src+1
src2:
    beq literal_fe       ; count == 0 → literal $FE

    ; ── run of count × value ──
    tax
    lda (zp_src),y
    inc zp_src
    bne src3
    inc zp_src+1
src3:
    sta zp_rle_val

fill:
    lda zp_rle_val
    sta (zp_dst),y
    inc zp_dst
    bne dst2
    inc zp_dst+1
dst2:
    lda zp_remain
    bne rem2
    dec zp_remain+1
rem2:
    dec zp_remain
    dex
    bne fill
    jmp next

literal_fe:
    lda #RLE_MARKER
    sta (zp_dst),y
    inc zp_dst
    bne dst3
    inc zp_dst+1
dst3:
    lda zp_remain
    bne rem3
    dec zp_remain+1
rem3:
    dec zp_remain
    jmp next

done:
    rts
}

;--------------------------------------------------------------
; nibble_decode
;   zp_src    → nibble-packed stream
;   zp_dst    → destination (e.g. color RAM)
;   zp_remain → PACKED bytes to read (each produces 2 outputs)
;--------------------------------------------------------------
nibble_decode: {
    ldy #0

next:
    lda zp_remain
    ora zp_remain+1
    beq done

    ; Read packed byte
    lda (zp_src),y
    inc zp_src
    bne src1
    inc zp_src+1
src1:
    pha

    ; High nibble → first color
    lsr
    lsr
    lsr
    lsr
    sta (zp_dst),y
    inc zp_dst
    bne dst1
    inc zp_dst+1
dst1:

    ; Low nibble → second color
    pla
    and #$0f
    sta (zp_dst),y
    inc zp_dst
    bne dst2
    inc zp_dst+1
dst2:

    ; Decrement packed-byte counter
    lda zp_remain
    bne rem1
    dec zp_remain+1
rem1:
    dec zp_remain
    jmp next

done:
    rts
}

;--------------------------------------------------------------
; Raster IRQ
;--------------------------------------------------------------
irq_top: {
    +irq_start(end)
    inc frameCount

!if (debug_build) {
    inc $d020
}

${MUSIC ? '    jsr music.play' : ''}

!if (debug_build) {
    dec $d020
}

    +irq_end(irq_top, irq_top_line)
end:
}

;--------------------------------------------------------------
; Variables
;--------------------------------------------------------------
frameCount:     !byte 0
currentFrame:   !byte 0
delayCounter:   !byte 0

;--------------------------------------------------------------
; Frame lookup tables
;--------------------------------------------------------------
frame_border: !byte ${borders}
frame_bg:     !byte ${bgs}
frame_scr_lo: !byte ${scrLos}
frame_scr_hi: !byte ${scrHis}
frame_col_lo: !byte ${colLos}
frame_col_hi: !byte ${colHis}

${MUSIC ? '* = music.startAddress' : ''}
${MUSIC ? 'sid_data: !byte music.data' : ''}

;--------------------------------------------------------------
; Compressed frame data  (placed at $2000)
;--------------------------------------------------------------
* = $2000
${frameDataAsm}

`;
}

// ═══════════════════════════════════════════════════════════════════
//  ASSEMBLE
// ═══════════════════════════════════════════════════════════════════

function assembleAnimation(source) {
  const sourceFileMap = {
    'main.asm':   source,
    'macros.asm': macrosAsm,
  };
  if (MUSIC) {
    sourceFileMap['plugins/sid.js'] = sidJs;
    sourceFileMap['assets/sidFile.sid'] = sidFileData;
  }

  const options = {
    readFileSync: (fname) => {
      const key = fname.replace(/\\/g, '/');
      if (key in sourceFileMap) return Buffer.from(sourceFileMap[key]);
      if (fname in sourceFileMap) return Buffer.from(sourceFileMap[fname]);
      throw new Error(`File not found: ${fname}`);
    }
  };

  return c64jasm.assemble('main.asm', options);
}

// ═══════════════════════════════════════════════════════════════════
//  EMULATOR
// ═══════════════════════════════════════════════════════════════════

function launchEmulator(prgFile) {
  const exePath = path.join(VICE_BIN, 'x64sc.exe');
  const args = ['-autostart', prgFile];
  console.log(`  🚀 x64sc.exe -autostart ${path.basename(prgFile)}`);
  const child = spawn(exePath, args, {
    detached: true, stdio: 'ignore', windowsHide: false, shell: true,
  });
  child.unref();
  return child;
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════

async function main() {
  const doLaunch = !process.argv.includes('--no-launch');

  // Ensure exports dir exists
  if (!fs.existsSync(EXPORTS)) fs.mkdirSync(EXPORTS, { recursive: true });

  const asmFile = path.join(EXPORTS, 'animation_player.asm');
  const prgFile = path.join(EXPORTS, 'animation_player.prg');

  // Write SID plugin to disk if needed (c64jasm uses require() for plugins)
  const pluginDir = path.join(ROOT, 'plugins');
  if (MUSIC) {
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'sid.js'), sidJs);
  }

  // Generate assembly
  const source = generateAnimationASM();
  fs.writeFileSync(asmFile, source, 'utf-8');
  console.log(`  ✓ ASM source → ${path.basename(asmFile)}  (${source.length} chars)`);

  // Assemble
  const result = assembleAnimation(source);

  if (result.errors && result.errors.length > 0) {
    console.error(`  ✗ Assembly errors:`);
    result.errors.forEach(e => {
      const msg = typeof e === 'string' ? e : JSON.stringify(e);
      console.error(`    ${msg}`);
    });
    process.exit(1);
  }

  fs.writeFileSync(prgFile, result.prg);
  console.log(`  ✓ PRG binary → ${path.basename(prgFile)}  (${result.prg.length} bytes)`);

  // Raw size comparison
  const rawTotal = NUM_FRAMES * 2002; // 2 (border/bg) + 1000 (scr) + 1000 (col)
  console.log(`\n  Raw data (uncompressed):  ${rawTotal.toLocaleString()} bytes`);
  console.log(`  Compressed data:         ${(totRleScr + totPkdCol).toLocaleString()} bytes`);
  console.log(`  PRG file size:           ${result.prg.length.toLocaleString()} bytes`);

  // Launch emulator
  if (doLaunch) {
    console.log('');
    launchEmulator(prgFile);

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise(resolve => rl.question('  Press Enter to finish...', () => { rl.close(); resolve(); }));
  }

  console.log(`\n═══ DONE ═══`);
  process.exit(0);
}

main();
