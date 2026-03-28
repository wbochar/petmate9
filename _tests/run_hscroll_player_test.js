#!/usr/bin/env node
/**
 * Petmate Horizontal Smooth Scroll Player Test
 *
 * Exports the c64-4xwidth frame (160×25) as a C64 PRG with
 * pixel-smooth horizontal scrolling using VIC-II XSCROLL ($D016).
 *
 * Technique (lessons from vertical scroller):
 *   - Double buffered: A=$0400, B=$0C00 — no screen tearing
 *   - 38-column mode ($D016 bit 3=0) hides border columns
 *   - XSCROLL decrements 7→0 for 8 sub-pixel steps per column
 *   - On wrap (0→7): copy new 40-col window from source to work buffer
 *   - IRQ atomically applies $D016 + $D018 at fixed raster line
 *   - vsyncFlag + prepare-ahead pattern for stutter-free timing
 *   - Source data stored uncompressed; 40-byte column strips
 *     extracted from 160-byte wide rows at runtime
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
const FRAME_INDEX = 68;  // c64-4xwidth

const fpsArgIdx  = process.argv.indexOf('--fps');
const TARGET_FPS = fpsArgIdx >= 0 && fpsArgIdx + 1 < process.argv.length
                   ? parseFloat(process.argv[fpsArgIdx + 1]) : 60;
const SCROLL_SPEED = Math.max(1, Math.min(255, Math.round(60 / TARGET_FPS)));

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
const VISIBLE_COLS = 40;
const MAX_SCROLL   = width - VISIBLE_COLS;  // 120
const SRC_ROW_WIDTH = width;                // 160

console.log(`\nPetmate Horizontal Smooth Scroll Test`);
console.log(`Source : ${fb.name} (${width}×${height})`);
console.log(`Speed  : ${TARGET_FPS} steps/sec (delay=${SCROLL_SPEED})`);
console.log(`Scroll : ${MAX_SCROLL} cols (${MAX_SCROLL * 8} pixels)`);
if (MUSIC) console.log(`SID    : ${SID_FILE}`);
console.log('');

// ─── Helpers ────────────────────────────────────────────────────────
function toHex8(v) { return v.toString(16).toUpperCase().padStart(2, '0'); }
function chunkArray(a, s) { const o=[]; for(let i=0;i<a.length;i+=s) o.push(a.slice(i,i+s)); return o; }
function bytesToAsmLines(b, w=16) { return chunkArray(b,w).map(r=>`\n!byte ${r.map(n=>`$${toHex8(n)}`).join(',')}`); }
const tblHex = (a) => a.map(v=>`$${toHex8(v)}`).join(',');

// ─── Extract frame data (row-major, 160 cols per row) ───────────────
const screenCodes = [];
const colorValues = [];
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++) {
    screenCodes.push(framebuf[y][x].code);
    colorValues.push(framebuf[y][x].color);
  }

console.log(`  Screen data: ${screenCodes.length} bytes (${width}×${height})`);
console.log(`  Color data:  ${colorValues.length} bytes`);
console.log(`  Total:       ${screenCodes.length + colorValues.length} bytes\n`);

// ─── Address tables ─────────────────────────────────────────────────
const SCR_DATA_ADDR = 0x2000;
const COL_DATA_ADDR = SCR_DATA_ADDR + screenCodes.length;

// Source row BASE addresses (25 entries, each row is 160 bytes wide)
const srcScrRowLo = [], srcScrRowHi = [];
const srcColRowLo = [], srcColRowHi = [];
for (let row = 0; row < height; row++) {
  const sa = SCR_DATA_ADDR + row * SRC_ROW_WIDTH;
  const ca = COL_DATA_ADDR + row * SRC_ROW_WIDTH;
  srcScrRowLo.push(sa & 0xFF);
  srcScrRowHi.push((sa >> 8) & 0xFF);
  srcColRowLo.push(ca & 0xFF);
  srcColRowHi.push((ca >> 8) & 0xFF);
}

// Destination row addresses (screen $0400, color $D800, 40 bytes per row)
const screenDestLo = [], screenDestHi = [];
const colorDestLo  = [], colorDestHi  = [];
for (let row = 0; row < height; row++) {
  const sa = 0x0400 + row * VISIBLE_COLS;
  const ca = 0xD800 + row * VISIBLE_COLS;
  screenDestLo.push(sa & 0xFF);
  screenDestHi.push((sa >> 8) & 0xFF);
  colorDestLo.push(ca & 0xFF);
  colorDestHi.push((ca >> 8) & 0xFF);
}

// ─── Assembly ───────────────────────────────────────────────────────
const screenDataAsm = bytesToAsmLines(screenCodes, SRC_ROW_WIDTH).join('');
const colorDataAsm  = bytesToAsmLines(colorValues, SRC_ROW_WIDTH).join('');

const charsetBits = (fb.charset === 'lower') ? 0x07 : 0x05;
const D018_A = 0x10 | charsetBits;
const D018_B = 0x30 | charsetBits;

const source = `
; Petmate9 Horizontal Smooth Scroller (C64) — Double Buffered
; Source: ${fb.name} (${width}x${height}), scroll ${MAX_SCROLL} cols
; Buffer A = $0400, Buffer B = $0C00 — swap via $D018 in IRQ
!include "macros.asm"
${MUSIC ? '!use "plugins/sid" as sid' : ''}
${MUSIC ? '!let music = sid("assets/sidFile.sid")' : ''}

!let irq_top_line  = 1
!let debug_build   = FALSE
!let VISIBLE_COLS  = ${VISIBLE_COLS}
!let VISIBLE_ROWS  = ${height}
!let MAX_SCROLL    = ${MAX_SCROLL}
!let SRC_ROW_WIDTH = ${SRC_ROW_WIDTH}
!let SCROLL_SPEED  = ${SCROLL_SPEED}
!let D018_A        = $${toHex8(D018_A)}
!let D018_B        = $${toHex8(D018_B)}

!let zp_src        = $20
!let zp_dst        = $22
!let zp_vis_row    = $24
!let zp_col_lo     = $25   ; scrollCol low byte for source offset
!let zp_col_hi     = $26   ; scrollCol high byte (always 0 for col<256)

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
    sta scrollCol
    sta displayBuf
    sta workBufOffset
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

    ; Set VIC: 25 rows, YSCROLL=3 (normal), 38 cols, XSCROLL=7
    lda #$1b            ; 25-row mode, normal
    sta $d011
    lda #$c7            ; 38-col mode ($C0) + XSCROLL=7
    sta nextD016
    sta $d016
    lda #D018_A
    sta nextD018
    sta $d018

    ; ── Main loop: double-buffered prepare-ahead ──

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

    inc scrollCol
    lda scrollCol
    cmp #MAX_SCROLL
    bcc do_coarse
    ; Wrap
    lda #0
    sta scrollCol

do_coarse:
    ; Determine work-buffer offset
    lda displayBuf
    bne work_is_a
    lda #$08
    jmp set_work
work_is_a:
    lda #$00
set_work:
    sta workBufOffset

    ; Copy 25 rows × 40 cols from source to work buffer (invisible)
    jsr copy_window_screen
    ; Copy 25 rows × 40 cols to $D800
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
    lda #$c0            ; 38-col mode
    ora scrollFine
    sta nextD016
    jmp main_loop
}

;--------------------------------------------------------------
; copy_window_screen – extract 40-col strip from 160-col source
;   Reads from src_scr_row_base[row] + scrollCol
;   Writes to screen_dest[row] + workBufOffset
;--------------------------------------------------------------
copy_window_screen: {
    lda scrollCol
    sta zp_col_lo
    lda #0
    sta zp_col_hi       ; scrollCol < 256, but carry may bump hi
    sta zp_vis_row

row_loop:
    ldx zp_vis_row
    ; Source = src_scr_row_base + scrollCol
    lda src_scr_row_lo,x
    clc
    adc zp_col_lo
    sta zp_src
    lda src_scr_row_hi,x
    adc zp_col_hi
    sta zp_src+1

    ; Dest = screen_dest + workBufOffset
    lda screen_dest_lo,x
    sta zp_dst
    lda screen_dest_hi,x
    clc
    adc workBufOffset
    sta zp_dst+1

    jsr copy_row

    inc zp_vis_row
    lda zp_vis_row
    cmp #VISIBLE_ROWS
    bne row_loop
    rts
}

;--------------------------------------------------------------
; copy_window_color – extract 40-col strip to $D800
;--------------------------------------------------------------
copy_window_color: {
    lda scrollCol
    sta zp_col_lo
    lda #0
    sta zp_col_hi
    sta zp_vis_row

row_loop:
    ldx zp_vis_row
    lda src_col_row_lo,x
    clc
    adc zp_col_lo
    sta zp_src
    lda src_col_row_hi,x
    adc zp_col_hi
    sta zp_src+1

    lda color_dest_lo,x
    sta zp_dst
    lda color_dest_hi,x
    sta zp_dst+1

    jsr copy_row

    inc zp_vis_row
    lda zp_vis_row
    cmp #VISIBLE_ROWS
    bne row_loop
    rts
}

;--------------------------------------------------------------
; copy_row – copy VISIBLE_COLS (40) bytes from (zp_src) to (zp_dst)
;--------------------------------------------------------------
copy_row: {
    ldy #VISIBLE_COLS-1
loop:
    lda (zp_src),y
    sta (zp_dst),y
    dey
    bpl loop
    rts
}

;--------------------------------------------------------------
; Raster IRQ — applies $D016 + $D018 at fixed raster position
;--------------------------------------------------------------
irq_top: {
    +irq_start(end)

    lda nextD016
    sta $d016
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
nextD016:       !byte $c7    ; 38-col + XSCROLL=7
nextD018:       !byte D018_A
scrollFine:     !byte 7
scrollCol:      !byte 0
delayCounter:   !byte 1
displayBuf:     !byte 0
workBufOffset:  !byte 0

;--------------------------------------------------------------
; Row address tables
;--------------------------------------------------------------
; Source screen row BASES (25 entries, each row 160 bytes wide)
src_scr_row_lo: !byte ${tblHex(srcScrRowLo)}
src_scr_row_hi: !byte ${tblHex(srcScrRowHi)}
; Source color row BASES
src_col_row_lo: !byte ${tblHex(srcColRowLo)}
src_col_row_hi: !byte ${tblHex(srcColRowHi)}
; Dest screen rows (relative to $0400, workBufOffset adds $08 for $0C00)
screen_dest_lo: !byte ${tblHex(screenDestLo)}
screen_dest_hi: !byte ${tblHex(screenDestHi)}
; Dest color rows ($D800)
color_dest_lo: !byte ${tblHex(colorDestLo)}
color_dest_hi: !byte ${tblHex(colorDestHi)}

${MUSIC ? '* = music.startAddress' : ''}
${MUSIC ? 'sid_data: !byte music.data' : ''}

;--------------------------------------------------------------
; Source data (uncompressed, 160 cols × 25 rows)
;--------------------------------------------------------------
* = $${SCR_DATA_ADDR.toString(16)}
screen_data:
${screenDataAsm}

color_data:
${colorDataAsm}

`;

// ═══════════════════════════════════════════════════════════════════
//  ASSEMBLE + MAIN
// ═══════════════════════════════════════════════════════════════════

function assemble(src) {
  const sfm = { 'main.asm': src, 'macros.asm': macrosAsm };
  if (MUSIC) {
    sfm['plugins/sid.js'] = sidJs;
    sfm['assets/sidFile.sid'] = sidFileData;
  }
  return c64jasm.assemble('main.asm', {
    readFileSync: (f) => {
      const k = f.replace(/\\/g, '/');
      if (k in sfm) return Buffer.from(sfm[k]);
      if (f in sfm) return Buffer.from(sfm[f]);
      throw new Error(`File not found: ${f}`);
    }
  });
}

async function main() {
  const doLaunch = !process.argv.includes('--no-launch');
  if (!fs.existsSync(EXPORTS)) fs.mkdirSync(EXPORTS, { recursive: true });

  if (MUSIC) {
    const pluginDir = path.join(ROOT, 'plugins');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'sid.js'), sidJs);
  }

  const asmFile = path.join(EXPORTS, 'hscroll_player.asm');
  const prgFile = path.join(EXPORTS, 'hscroll_player.prg');

  fs.writeFileSync(asmFile, source, 'utf-8');
  console.log(`  ✓ ASM source → ${path.basename(asmFile)}  (${source.length} chars)`);

  const result = assemble(source);
  if (result.errors && result.errors.length > 0) {
    console.error(`  ✗ Assembly errors:`);
    result.errors.forEach(e => console.error(`    ${typeof e === 'string' ? e : JSON.stringify(e)}`));
    process.exit(1);
  }

  fs.writeFileSync(prgFile, result.prg);
  console.log(`  ✓ PRG binary → ${path.basename(prgFile)}  (${result.prg.length} bytes)`);
  console.log(`\n  Data: ${screenCodes.length + colorValues.length} bytes`);
  console.log(`  PRG:  ${result.prg.length} bytes total`);

  if (doLaunch) {
    console.log('');
    const exePath = path.join(VICE_BIN, 'x64sc.exe');
    console.log(`  🚀 x64sc.exe -autostart ${path.basename(prgFile)}`);
    spawn(exePath, ['-autostart', prgFile], { detached:true, stdio:'ignore', shell:true }).unref();
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise(r => rl.question('  Press Enter to finish...', () => { rl.close(); r(); }));
  }
  console.log(`\n═══ DONE ═══`);
  process.exit(0);
}

main();
