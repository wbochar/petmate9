#!/usr/bin/env node
/**
 * Petmate Vertical Smooth Scroll Player Test
 *
 * Exports the c64-4xheight frame (40×100) as a C64 PRG with
 * pixel-smooth vertical scrolling using VIC-II YSCROLL ($D011).
 *
 * Technique:
 *   - 24-row mode hides the top/bottom border row to avoid glitches
 *   - YSCROLL decrements 7→0 for 8 sub-pixel steps per character row
 *   - On wrap (0→7), screen/color RAM shifts up 1 row and the new
 *     bottom row is copied from the source data buffer
 *   - Source data stored uncompressed for fast random-access row copies
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
const FRAME_INDEX = 72;  // c64-4xheight

// FPS = scroll steps per second (default 60 = 1 pixel/frame, max smooth)
const fpsArgIdx  = process.argv.indexOf('--fps');
const TARGET_FPS = fpsArgIdx >= 0 && fpsArgIdx + 1 < process.argv.length
                   ? parseFloat(process.argv[fpsArgIdx + 1])
                   : 60;
const SCROLL_SPEED = Math.max(1, Math.min(255, Math.round(60 / TARGET_FPS)));

// SID music support
const sidArgIdx = process.argv.indexOf('--sid');
const SID_FILE  = sidArgIdx >= 0 && sidArgIdx + 1 < process.argv.length
                  ? process.argv[sidArgIdx + 1] : null;
const MUSIC     = SID_FILE !== null;

// ─── Load source ────────────────────────────────────────────────────
const petmate   = JSON.parse(fs.readFileSync(SRC_FILE, 'utf-8'));
const fb        = petmate.framebufs[FRAME_INDEX];
const macrosAsm = fs.readFileSync(path.join(ASSETS, 'macrosc64.asm'));
const sidFileData = MUSIC ? fs.readFileSync(path.resolve(SID_FILE)) : null;
const sidJs       = MUSIC ? fs.readFileSync(path.join(ASSETS, 'sid.js')) : null;

const { width, height, framebuf, backgroundColor, borderColor } = fb;
const VISIBLE_ROWS = 25;
const MAX_SCROLL   = height - VISIBLE_ROWS;
const ROW_WIDTH    = width;

console.log(`\nPetmate Vertical Smooth Scroll Test`);
console.log(`Source : ${fb.name} (${width}×${height})`);
console.log(`Speed  : ${TARGET_FPS} steps/sec (delay=${SCROLL_SPEED})`);
console.log(`Scroll : ${MAX_SCROLL} rows (${MAX_SCROLL * 8} pixels)`);
if (MUSIC) console.log(`SID    : ${SID_FILE}`);
console.log('');

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

// ─── Extract frame data ─────────────────────────────────────────────

const screenCodes = [];
const colorValues = [];
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    screenCodes.push(framebuf[y][x].code);
    colorValues.push(framebuf[y][x].color);
  }
}

console.log(`  Screen data: ${screenCodes.length} bytes`);
console.log(`  Color data:  ${colorValues.length} bytes`);
console.log(`  Total:       ${screenCodes.length + colorValues.length} bytes (uncompressed)\n`);

// ─── Row address tables ─────────────────────────────────────────────

const SCR_DATA_ADDR = 0x2000;
const COL_DATA_ADDR = SCR_DATA_ADDR + screenCodes.length;

// Source data row addresses
const scrRowLo = [], scrRowHi = [];
const colRowLo = [], colRowHi = [];
for (let row = 0; row < height; row++) {
  const sa = SCR_DATA_ADDR + row * ROW_WIDTH;
  const ca = COL_DATA_ADDR + row * ROW_WIDTH;
  scrRowLo.push(sa & 0xFF);
  scrRowHi.push((sa >> 8) & 0xFF);
  colRowLo.push(ca & 0xFF);
  colRowHi.push((ca >> 8) & 0xFF);
}

// Destination row addresses (screen $0400, color $D800)
const screenDestLo = [], screenDestHi = [];
const colorDestLo  = [], colorDestHi  = [];
for (let row = 0; row < VISIBLE_ROWS; row++) {
  const sa = 0x0400 + row * ROW_WIDTH;
  const ca = 0xD800 + row * ROW_WIDTH;
  screenDestLo.push(sa & 0xFF);
  screenDestHi.push((sa >> 8) & 0xFF);
  colorDestLo.push(ca & 0xFF);
  colorDestHi.push((ca >> 8) & 0xFF);
}

// ─── Generate Assembly ──────────────────────────────────────────────

const screenDataAsm = bytesToAsmLines(screenCodes, ROW_WIDTH).join('');
const colorDataAsm  = bytesToAsmLines(colorValues, ROW_WIDTH).join('');

const tblHex = (arr) => arr.map(v => `$${toHex8(v)}`).join(',');

// $D018 values: buffer A ($0400) and buffer B ($0C00) with charset
const charsetBits = (fb.charset === 'lower') ? 0x07 : 0x05;  // bits 1-3
const D018_A = 0x10 | charsetBits;  // screen at $0400
const D018_B = 0x30 | charsetBits;  // screen at $0C00

const source = `
; Petmate9 Vertical Smooth Scroller (C64) — Double Buffered
; Source: ${fb.name} (${width}x${height}), scroll ${MAX_SCROLL} rows
; Buffer A = $0400, Buffer B = $0C00 — swap via $D018 in IRQ
!include "macros.asm"
${MUSIC ? '!use "plugins/sid" as sid' : ''}
${MUSIC ? '!let music = sid("assets/sidFile.sid")' : ''}

!let irq_top_line  = 1
!let debug_build   = FALSE
!let TOTAL_ROWS    = ${height}
!let VISIBLE_ROWS  = ${VISIBLE_ROWS}
!let MAX_SCROLL    = ${MAX_SCROLL}
!let ROW_WIDTH     = ${ROW_WIDTH}
!let SCROLL_SPEED  = ${SCROLL_SPEED}
!let D018_A        = $${toHex8(D018_A)}
!let D018_B        = $${toHex8(D018_B)}

!let zp_src        = $20
!let zp_dst        = $22
!let zp_src_row    = $24
!let zp_vis_row    = $25

+basic_start(entry)

;--------------------------------------------------------------
; Entry
;--------------------------------------------------------------
entry: {
${MUSIC ? '    lda #0' : ''}
${MUSIC ? '    jsr music.init' : ''}

    sei
    lda #$35
    sta $01
    +setup_irq(irq_top, irq_top_line)
    cli

    ; Border / background
    lda #${borderColor}
    sta $d020
    lda #${backgroundColor}
    sta $d021

    ; Init scroll state
    lda #7
    sta scrollFine
    lda #0
    sta scrollRow
    sta displayBuf          ; 0 = showing buffer A
    sta workBufOffset       ; 0 = writing to $0400 (initial fill)
    lda #SCROLL_SPEED
    sta delayCounter

    ; Pre-fill BOTH buffers so the first swap is already ready
    ; Buffer A (workBufOffset=0)
    jsr copy_window_screen
    jsr copy_window_color
    ; Buffer B (workBufOffset=8)
    lda #$08
    sta workBufOffset
    jsr copy_window_screen
    lda #$00
    sta workBufOffset

    ; Set initial VIC registers
    lda #$17                ; 24-row mode, YSCROLL=7
    sta nextD011
    sta $d011
    lda #D018_A
    sta nextD018
    sta $d018

    ; ── Main loop: double-buffered prepare-ahead ──
    ; Fine-scroll: just queue nextD011.
    ; Coarse-scroll: write 25 rows to the OFF-SCREEN buffer
    ; (no tearing), update color RAM, then queue buffer swap.
    ; IRQ applies $D011 + $D018 atomically at a fixed raster line.

main_loop:
    lda vsyncFlag
    beq main_loop
    lda #0
    sta vsyncFlag

    dec delayCounter
    bne main_loop
    lda #SCROLL_SPEED
    sta delayCounter

    ; ── Prepare next scroll step ──
    dec scrollFine
    bpl prep_fine

    ; Coarse scroll needed
    lda #7
    sta scrollFine

    inc scrollRow
    lda scrollRow
    cmp #MAX_SCROLL
    bcc do_coarse
    ; Wrap
    lda #0
    sta scrollRow

do_coarse:
    ; Determine work-buffer offset ($00 = $0400, $08 = $0C00)
    lda displayBuf
    bne work_is_a
    lda #$08                ; displaying A → work is B
    jmp set_work
work_is_a:
    lda #$00                ; displaying B → work is A
set_work:
    sta workBufOffset

    ; Copy 25 rows from source to work buffer (invisible — no tearing)
    jsr copy_window_screen
    ; Copy 25 rows from source to $D800 (live color RAM)
    jsr copy_window_color

    ; Queue buffer swap
    lda displayBuf
    eor #1
    sta displayBuf
    beq swap_a
    lda #D018_B
    jmp queue_swap
swap_a:
    lda #D018_A
queue_swap:
    sta nextD018

prep_fine:
    lda #$10
    ora scrollFine
    sta nextD011
    jmp main_loop
}

;--------------------------------------------------------------
; copy_window_screen – 25 rows from source to work buffer
;   workBufOffset: $00 writes to $04xx, $08 writes to $0Cxx
;--------------------------------------------------------------
copy_window_screen: {
    lda scrollRow
    sta zp_src_row
    lda #0
    sta zp_vis_row
row_loop:
    ldx zp_src_row
    lda scr_row_lo,x
    sta zp_src
    lda scr_row_hi,x
    sta zp_src+1
    ldx zp_vis_row
    lda screen_dest_lo,x
    sta zp_dst
    lda screen_dest_hi,x
    clc
    adc workBufOffset       ; +$00 for A, +$08 for B
    sta zp_dst+1
    jsr copy_row
    inc zp_src_row
    inc zp_vis_row
    lda zp_vis_row
    cmp #VISIBLE_ROWS
    bne row_loop
    rts
}

;--------------------------------------------------------------
; copy_window_color – 25 rows from source to $D800
;--------------------------------------------------------------
copy_window_color: {
    lda scrollRow
    sta zp_src_row
    lda #0
    sta zp_vis_row
row_loop:
    ldx zp_src_row
    lda col_row_lo,x
    sta zp_src
    lda col_row_hi,x
    sta zp_src+1
    ldx zp_vis_row
    lda color_dest_lo,x
    sta zp_dst
    lda color_dest_hi,x
    sta zp_dst+1
    jsr copy_row
    inc zp_src_row
    inc zp_vis_row
    lda zp_vis_row
    cmp #VISIBLE_ROWS
    bne row_loop
    rts
}

;--------------------------------------------------------------
; copy_row – copy ROW_WIDTH bytes from (zp_src) to (zp_dst)
;--------------------------------------------------------------
copy_row: {
    ldy #ROW_WIDTH-1
loop:
    lda (zp_src),y
    sta (zp_dst),y
    dey
    bpl loop
    rts
}

;--------------------------------------------------------------
; Raster IRQ — applies $D011 and $D018 at fixed raster position
;--------------------------------------------------------------
irq_top: {
    +irq_start(end)

    lda nextD011
    sta $d011
    lda nextD018
    sta $d018

    lda #1
    sta vsyncFlag

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
vsyncFlag:      !byte 0
nextD011:       !byte $17
nextD018:       !byte D018_A
scrollFine:     !byte 7
scrollRow:      !byte 0
delayCounter:   !byte 1
displayBuf:     !byte 0     ; 0 = showing A, 1 = showing B
workBufOffset:  !byte 0     ; $00 = write to $04xx, $08 = write to $0Cxx

;--------------------------------------------------------------
; Row address tables
;--------------------------------------------------------------
scr_row_lo: !byte ${tblHex(scrRowLo)}
scr_row_hi: !byte ${tblHex(scrRowHi)}
col_row_lo: !byte ${tblHex(colRowLo)}
col_row_hi: !byte ${tblHex(colRowHi)}
; Dest rows relative to $0400 (workBufOffset adds $08 for $0C00)
screen_dest_lo: !byte ${tblHex(screenDestLo)}
screen_dest_hi: !byte ${tblHex(screenDestHi)}
color_dest_lo: !byte ${tblHex(colorDestLo)}
color_dest_hi: !byte ${tblHex(colorDestHi)}

${MUSIC ? '* = music.startAddress' : ''}
${MUSIC ? 'sid_data: !byte music.data' : ''}

;--------------------------------------------------------------
; Source data (uncompressed for fast row access)
;--------------------------------------------------------------
* = $${SCR_DATA_ADDR.toString(16)}
screen_data:
${screenDataAsm}

color_data:
${colorDataAsm}

`;

// ═══════════════════════════════════════════════════════════════════
//  ASSEMBLE
// ═══════════════════════════════════════════════════════════════════

function assemble(src) {
  const sourceFileMap = {
    'main.asm':   src,
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
//  MAIN
// ═══════════════════════════════════════════════════════════════════

async function main() {
  const doLaunch = !process.argv.includes('--no-launch');

  if (!fs.existsSync(EXPORTS)) fs.mkdirSync(EXPORTS, { recursive: true });

  // Write SID plugin to disk if needed
  if (MUSIC) {
    const pluginDir = path.join(ROOT, 'plugins');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'sid.js'), sidJs);
  }

  const asmFile = path.join(EXPORTS, 'scroll_player.asm');
  const prgFile = path.join(EXPORTS, 'scroll_player.prg');

  fs.writeFileSync(asmFile, source, 'utf-8');
  console.log(`  ✓ ASM source → ${path.basename(asmFile)}  (${source.length} chars)`);

  const result = assemble(source);

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
  console.log(`\n  Data: ${screenCodes.length + colorValues.length} bytes (screen+color)`);
  console.log(`  PRG:  ${result.prg.length} bytes total`);

  if (doLaunch) {
    console.log('');
    const exePath = path.join(VICE_BIN, 'x64sc.exe');
    console.log(`  🚀 x64sc.exe -autostart ${path.basename(prgFile)}`);
    const child = spawn(exePath, ['-autostart', prgFile], {
      detached: true, stdio: 'ignore', windowsHide: false, shell: true,
    });
    child.unref();
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise(resolve => rl.question('  Press Enter to finish...', () => { rl.close(); resolve(); }));
  }

  console.log(`\n═══ DONE ═══`);
  process.exit(0);
}

main();
