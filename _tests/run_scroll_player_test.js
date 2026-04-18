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
const modeArgIdx = process.argv.indexOf('--mode');
const SCROLL_MODE = modeArgIdx >= 0 && modeArgIdx + 1 < process.argv.length
                    ? String(process.argv[modeArgIdx + 1]).toLowerCase()
                    : 'wrap';
if (SCROLL_MODE !== 'wrap' && SCROLL_MODE !== 'pingpong') {
  throw new Error(`Invalid --mode '${SCROLL_MODE}'. Expected 'wrap' or 'pingpong'.`);
}

// SID music support
const TEST_SIDS_DIR = path.join(__dirname, 'sids');
const sidArgIdx = process.argv.indexOf('--sid');
const explicitSidFile = sidArgIdx >= 0 && sidArgIdx + 1 < process.argv.length
                      ? path.resolve(process.argv[sidArgIdx + 1])
                      : null;
const NO_SID = process.argv.includes('--no-sid');

function readSidLoadAddress(filePath) {
  try {
    const sid = parseSidFile(filePath);
    return sid ? sid.loadAddress : null;
  } catch (_) {
    return null;
  }
}

function parseSidFile(filePath) {
  try {
    const bytes = fs.readFileSync(filePath);
    if (bytes.length < 0x7C) return null;
    const magic = bytes.toString('ascii', 0, 4);
    if (magic !== 'PSID' && magic !== 'RSID') return null;

    const dataOffset = (bytes[6] << 8) | bytes[7];
    let loadAddress = (bytes[8] << 8) | bytes[9];
    const initAddress = (bytes[10] << 8) | bytes[11];
    const playAddress = (bytes[12] << 8) | bytes[13];

    let dataStart = dataOffset;
    if (loadAddress === 0) {
      if (dataOffset + 1 >= bytes.length) return null;
      loadAddress = bytes[dataOffset] | (bytes[dataOffset + 1] << 8);
      dataStart += 2;
    }
    if (dataStart > bytes.length) return null;

    return {
      loadAddress,
      initAddress: initAddress || loadAddress,
      playAddress,
      dataBytes: [...bytes.slice(dataStart)],
    };
  } catch (_) {
    return null;
  }
}

function findTestSidByLoadAddress(loadAddress) {
  if (!fs.existsSync(TEST_SIDS_DIR)) return null;
  const sidFiles = fs.readdirSync(TEST_SIDS_DIR)
    .filter(name => name.toLowerCase().endsWith('.sid'))
    .sort();
  for (const sidFile of sidFiles) {
    const fullPath = path.join(TEST_SIDS_DIR, sidFile);
    if (readSidLoadAddress(fullPath) === loadAddress) {
      return fullPath;
    }
  }
  return null;
}

const autoTestSidFile = (!explicitSidFile && !NO_SID) ? findTestSidByLoadAddress(0x1000) : null;
const SID_FILE  = explicitSidFile || autoTestSidFile;
const MUSIC     = SID_FILE !== null;
const AUTO_TEST_SID = !explicitSidFile && !!autoTestSidFile;
const SID_INFO  = MUSIC ? parseSidFile(SID_FILE) : null;
if (MUSIC && !SID_INFO) {
  throw new Error(`Unable to parse SID file: ${SID_FILE}`);
}
if (MUSIC && SID_INFO.playAddress === 0) {
  throw new Error(`SID play address is $0000 (unsupported for this test runner): ${SID_FILE}`);
}
const USE_DEFAULT_SOURCE = process.argv.includes('--use-default-source');
function textCharToScreenCode(ch) {
  const c = ch.charCodeAt(0);
  if (c >= 65 && c <= 90) return c - 64;   // A-Z
  if (c >= 97 && c <= 122) return c - 96;  // a-z
  if (c >= 48 && c <= 57) return c;        // 0-9
  if (ch === ' ') return 32;
  if (ch === '-') return 45;
  if (ch === '_') return 95;
  if (ch === ':') return 58;
  return 32;
}

function textToScreenCodes(str) {
  return [...str].map(textCharToScreenCode);
}

function createVerticalDebugFrame() {
  const width = 40;
  const height = 50;
  const framebuf = [];
  const BLOCK = 160; // reverse-space block
  const header = `VSCROLL-${SCROLL_MODE.toUpperCase()}`;
  const headerCodes = textToScreenCodes(header);
  for (let y = 0; y < height; y++) {
    const row = [];
    const lineColor = y % 16;
    const lineId = ((y - 1 + 99) % 99) + 1; // data lines start at 01 on row 1
    const lineTensCode = 48 + Math.floor(lineId / 10);
    const lineOnesCode = 48 + (lineId % 10);
    for (let x = 0; x < width; x++) {
      let code = BLOCK;
      if (y === 0) {
        code = x < headerCodes.length ? headerCodes[x] : 32;
      } else if (x === 0) {
        code = lineTensCode;
      } else if (x === 1) {
        code = lineOnesCode;
      }
      row.push({
        code,
        color: lineColor,
      });
    }
    framebuf.push(row);
  }
  return {
    width,
    height,
    framebuf,
    backgroundColor: 0,
    borderColor: 0,
    borderOn: true,
    charset: 'upper',
    name: 'debug-vscroll-40x50',
  };
}

// ─── Load source ────────────────────────────────────────────────────
const petmate   = USE_DEFAULT_SOURCE ? JSON.parse(fs.readFileSync(SRC_FILE, 'utf-8')) : null;
const fb        = USE_DEFAULT_SOURCE ? petmate.framebufs[FRAME_INDEX] : createVerticalDebugFrame();
const macrosAsm = fs.readFileSync(path.join(ASSETS, 'macrosc64.asm'));

const { width, height, framebuf, backgroundColor, borderColor } = fb;
const VISIBLE_ROWS = 25;
const ROW_WRAP     = height;
const MAX_SCROLL   = SCROLL_MODE === 'pingpong'
                   ? (height - VISIBLE_ROWS)
                   : (height - 1);
const ROW_WIDTH    = width;
const scrollSummary = SCROLL_MODE === 'pingpong'
                    ? `${MAX_SCROLL} rows each direction (${MAX_SCROLL * 8} pixels)`
                    : `${ROW_WRAP} rows/cycle (${ROW_WRAP * 8} pixels)`;
const sourceModeDesc = SCROLL_MODE === 'pingpong'
                     ? `pingpong 0..${MAX_SCROLL}`
                     : `modulo-${ROW_WRAP} row wrap`;

console.log(`\nPetmate Vertical Smooth Scroll Test`);
console.log(`Source : ${fb.name} (${width}×${height})`);
console.log(`Speed  : ${TARGET_FPS} steps/sec (delay=${SCROLL_SPEED})`);
console.log(`Mode   : ${SCROLL_MODE}`);
console.log(`Scroll : ${scrollSummary}`);
if (MUSIC) {
  const sidDisplay = path.relative(ROOT, SID_FILE).replace(/\\/g, '/');
  console.log(`SID    : ${sidDisplay}${AUTO_TEST_SID ? ' (auto $1000 test SID)' : ''}`);
}
console.log('');

// ─── Helpers ────────────────────────────────────────────────────────

function toHex8(v) {
  return v.toString(16).toUpperCase().padStart(2, '0');
}

function toHex16(v) {
  return v.toString(16).toUpperCase().padStart(4, '0');
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
const sidDataAsm    = MUSIC ? bytesToAsmLines(SID_INFO.dataBytes, 16).join('') : '';

const tblHex = (arr) => arr.map(v => `$${toHex8(v)}`).join(',');

// $D018 values: buffer A ($0400) and buffer B ($0C00).
// Buf B MUST be below $1000: in VIC bank 0 the range $1000..$1FFF is
// the character-ROM ghost, and the VIC reads glyph data there instead
// of the RAM we write. $0C00 is the only free 1KB slot in bank 0 that
// is not in zero page, the code area, or the ROM-ghost. The row tables
// are placed AFTER the commit routines (below) so they don't collide
// with buf B's initial fill.
const charsetBits = (fb.charset === 'lower') ? 0x07 : 0x05;  // bits 1-3
const D018_A = 0x10 | charsetBits;  // screen at $0400
const D018_B = 0x30 | charsetBits;  // screen at $0C00

// ─── Split-buffer color commit ───────────────────────────────────────
//
// No shadow buffer. We write $D800 DIRECTLY from two chained raster
// IRQs. By the time the beam reaches the visible display of frame N,
// both $D018 (char buffer swap) and $D800 (new color matrix) are in
// place, so chars+colors swap atomically with zero tearing.
//
//   - irq_bottom at raster 251 (lower border of frame N-1): writes
//     the bottom 6 rows (19..24) of the new color matrix to $D800.
//     The beam has already drawn past these rows for frame N-1, and
//     the entire lower-border window is idle w.r.t. display reads.
//
//   - irq_top at raster 1 (upper border of frame N): atomically swaps
//     $D018, then raster-chases the top 19 rows (0..18) to $D800.
//     Row K's badline is at raster 51 + K*8; the blit stays ahead of
//     the beam (row 18 badline at raster 195, blit finishes before it).
//
// Per-row color commit body (unrolled, 40 bytes):
//   ldy #39
//   40 × [ lda (zp_src),y : sta $D800+K*40,y : dey ]   (last byte: no dey)
// = 40*(5+5) + 39*2 = 478 cyc body, ~18 cyc setup = ~496 cyc per row.
const IRQ_BOTTOM_LINE = 251;
const TOP_COMMIT_ROWS = 19;   // rows 0..18 in upper-border IRQ
const BOT_COMMIT_ROWS = 6;    // rows 19..24 in lower-border IRQ
if (TOP_COMMIT_ROWS + BOT_COMMIT_ROWS !== VISIBLE_ROWS) {
  throw new Error('TOP_COMMIT_ROWS + BOT_COMMIT_ROWS must equal VISIBLE_ROWS');
}

// Emit a per-row commit block. X holds the source-row index going in
// (pre-incremented each row so rows consume col_row_lo/hi sequentially).
// Uses zp_cmt_src (separate from main loop's zp_src) so a commit firing
// mid-char-copy won't corrupt copy_row's indirect source pointer.
function genCommitRow(destBase) {
  const hi = (destBase >> 8) & 0xFF, lo = destBase & 0xFF;
  const destHex = `$${((hi << 8) | lo).toString(16).toUpperCase().padStart(4, '0')}`;
  const idxLabel = `cmt_row_idx_ok_${genCommitRow.labelIndex++}`;
  const out = [];
  out.push(`    cpx #TOTAL_ROWS`);
  out.push(`    bcc ${idxLabel}`);
  out.push(`    ldx #0`);
  out.push(`${idxLabel}:`);
  out.push(`    lda col_row_lo,x`);
  out.push(`    sta zp_cmt_src`);
  out.push(`    lda col_row_hi,x`);
  out.push(`    sta zp_cmt_src+1`);
  out.push(`    inx`);
  out.push(`    ldy #39`);
  for (let i = 0; i < 40; i++) {
    out.push(`    lda (zp_cmt_src),y`);
    out.push(`    sta ${destHex},y`);
    if (i < 39) out.push(`    dey`);
  }
  return out.join('\n');
}
genCommitRow.labelIndex = 0;

let commitTopAsm = `commit_colors_top: {\n    ldx scrollRow\n`;
for (let r = 0; r < TOP_COMMIT_ROWS; r++) {
  commitTopAsm += genCommitRow(0xD800 + r * ROW_WIDTH) + '\n';
}
commitTopAsm += `    rts\n}`;

let commitBotAsm = `commit_colors_bottom: {
    lda scrollRow
    clc
    adc #${TOP_COMMIT_ROWS}
    cmp #TOTAL_ROWS
    bcc cmt_bot_idx_ok
    sec
    sbc #TOTAL_ROWS
cmt_bot_idx_ok:
    tax
`;
for (let r = TOP_COMMIT_ROWS; r < VISIBLE_ROWS; r++) {
  commitBotAsm += genCommitRow(0xD800 + r * ROW_WIDTH) + '\n';
}
commitBotAsm += `    rts\n}`;

const coarseStepAsm = SCROLL_MODE === 'pingpong'
  ? `
    ; Pingpong fine+coarse stepping with smooth turnarounds
    lda scrollDir
    beq pp_fwd_fine

pp_rev_fine:
    inc scrollFine
    lda scrollFine
    cmp #8
    bcc prep_fine
    ; Reverse coarse boundary crossed
    lda scrollRow
    bne pp_rev_do_coarse
    ; At top: turn around and start moving forward
    lda #7
    sta scrollFine
    lda #0
    sta $d404
    sta $d40b
    sta $d412
    sta $d417
    sta scrollDir
    jmp prep_fine
pp_rev_do_coarse:
    lda #0
    sta scrollFine
    dec scrollRow
    jmp do_coarse

pp_fwd_fine:
    dec scrollFine
    bpl prep_fine
    ; Forward coarse boundary crossed
    lda scrollRow
    cmp #MAX_SCROLL
    bcc pp_fwd_do_coarse
    ; At bottom: turn around and start moving reverse
    lda #0
    sta scrollFine
    lda #1
    sta scrollDir
    jmp prep_fine
pp_fwd_do_coarse:
    lda #7
    sta scrollFine
    inc scrollRow
`
  : `
    ; Wrap fine+coarse stepping (mod TOTAL_ROWS)
    dec scrollFine
    bpl prep_fine

    ; Coarse scroll needed
    lda #7
    sta scrollFine
    inc scrollRow
    lda scrollRow
    cmp #TOTAL_ROWS
    bcc do_coarse
    ; Wrap
    lda #0
    sta scrollRow
`;

const musicMainLoopAsm = MUSIC
  ? `
    lda muteFlag
    beq music_unmuted
    lda #0
    sta $d418
    jmp music_main_done
music_unmuted:
    jsr music_play
music_main_done:
`
  : '';

const source = `
; Petmate9 Vertical Smooth Scroller (C64) — Double Buffered
; Source: ${fb.name} (${width}x${height}), ${sourceModeDesc}
; Buffer A = $0400, Buffer B = $0C00 — swap via $D018 in IRQ
!include "macros.asm"
${MUSIC ? `!let music_load = $${toHex16(SID_INFO.loadAddress)}
!let music_init = $${toHex16(SID_INFO.initAddress)}
!let music_play = $${toHex16(SID_INFO.playAddress)}` : ''}

!let irq_top_line    = 1
!let irq_bottom_line = ${IRQ_BOTTOM_LINE}
!let debug_build     = FALSE
!let TOTAL_ROWS      = ${height}
!let VISIBLE_ROWS    = ${VISIBLE_ROWS}
!let MAX_SCROLL      = ${MAX_SCROLL}
!let ROW_WIDTH       = ${ROW_WIDTH}
!let SCROLL_SPEED    = ${SCROLL_SPEED}
!let D018_A          = $${toHex8(D018_A)}
!let D018_B          = $${toHex8(D018_B)}

!let zp_src        = $20
!let zp_dst        = $22
!let zp_src_row    = $24
!let zp_vis_row    = $25
!let zp_cmt_src    = $26     ; dedicated commit-source pointer (IRQ-safe)

+basic_start(entry)

;--------------------------------------------------------------
; Entry
;--------------------------------------------------------------
entry: {
${MUSIC ? '    lda #0' : ''}
${MUSIC ? '    jsr music_init' : ''}

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
    sta coarsePhase         ; 0 = idle (no split-buffer commit in flight)
    sta scrollDir           ; 0 = forward/down, 1 = reverse/up (pingpong mode)
    sta paused
    sta muteFlag
    sta keySpacePrev
    sta keyMPrev
    sta keyPlusPrev
    sta keyMinusPrev

    lda #$ff
    sta $dc00
    sta $dc02               ; CIA1 port A output (keyboard row select)
    lda #$00
    sta $dc03               ; CIA1 port B input  (keyboard columns)
    lda #SCROLL_SPEED
    sta scrollSpeed
    sta delayCounter

    ; Pre-fill BOTH buffers so the first swap is already ready
    ; Buffer A (workBufOffset = $00 → dest hi $04 → $0400)
    jsr copy_window_screen
    jsr copy_window_color
    ; Buffer B (workBufOffset = $08 → dest hi $04+$08=$0C → $0C00)
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
    lda paused
    beq not_paused
    jmp post_frame_work
not_paused:

    dec delayCounter
    beq delay_elapsed
    jmp post_frame_work
delay_elapsed:
    lda scrollSpeed
    sta delayCounter

    ; ── Prepare next scroll step ──
${coarseStepAsm}

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

    ; Arm the two-stage color commit BEFORE the long char copy. If
    ; the lower-border IRQ fires mid-copy, it will see coarsePhase=1
    ; and commit the bottom rows. The commit uses zp_cmt_src (not
    ; zp_src), so it won't disturb copy_row's state.
    ;   1 → lower-border IRQ this frame commits rows 19..24
    ;   2 → next upper-border IRQ swaps $D018 + commits rows 0..18
    ; Flip displayBuf and queue the $D018 swap BEFORE arming, so the
    ; next upper IRQ has everything it needs the moment phase==2.
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

    lda #1
    sta coarsePhase

    ; Now do the big 25-row char copy. It may be preempted by the
    ; lower-border IRQ — that's fine, the commit uses separate zp
    ; and writes to $D800 only, not to our char buffer.
    ; Color RAM is NOT touched here; the IRQ chain commits $D800
    ; across frame N-1 lower border + frame N upper border.
    jsr copy_window_screen

prep_fine:
    lda #$10
    ora scrollFine
    sta nextD011
post_frame_work:
    ; Keep coarse prep timing tight: do controls/music after
    ; nextD011 + optional off-screen copy has been prepared.
    jsr handle_input
${musicMainLoopAsm}
    jmp main_loop
}

;--------------------------------------------------------------
; handle_input — edge-triggered controls:
;   SPACE toggles pause
;   M toggles mute
;   + speeds up  (min delay=1)
;   - slows down (max delay=255)
;--------------------------------------------------------------
handle_input: {
    ; SPACE key: row 7, column 4
    lda #$7f
    sta $dc00
    lda $dc01
    and #$10
    bne space_up
space_down:
    lda keySpacePrev
    bne space_done
    lda #1
    sta keySpacePrev
    lda paused
    eor #1
    sta paused
space_done:
    jmp check_m
space_up:
    lda #0
    sta keySpacePrev

check_m:
    ; M key: row 4, column 4
    lda #$ef
    sta $dc00
    lda $dc01
    and #$10
    bne m_up
m_down:
    lda keyMPrev
    bne m_done
    lda #1
    sta keyMPrev
    lda muteFlag
    eor #1
    sta muteFlag
m_done:
    jmp check_speed
m_up:
    lda #0
    sta keyMPrev

check_speed:
    ; + / - keys: row 5, columns 0 and 3
    lda #$df
    sta $dc00
    lda $dc01
    sta keyRowState

    lda keyRowState
    and #$01
    bne plus_up
plus_down:
    lda keyPlusPrev
    bne plus_done
    lda #1
    sta keyPlusPrev
    lda scrollSpeed
    cmp #1
    beq plus_done
    dec scrollSpeed
plus_done:
    jmp check_minus
plus_up:
    lda #0
    sta keyPlusPrev

check_minus:
    lda keyRowState
    and #$08
    bne minus_up
minus_down:
    lda keyMinusPrev
    bne minus_done
    lda #1
    sta keyMinusPrev
    lda scrollSpeed
    cmp #255
    beq minus_done
    inc scrollSpeed
minus_done:
    jmp input_done
minus_up:
    lda #0
    sta keyMinusPrev

input_done:
    lda #$ff
    sta $dc00
    rts
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
    lda zp_src_row
    cmp #TOTAL_ROWS
    bcc copy_screen_src_ok
    lda #0
    sta zp_src_row
copy_screen_src_ok:
    inc zp_vis_row
    lda zp_vis_row
    cmp #VISIBLE_ROWS
    bne row_loop
    rts
}

;--------------------------------------------------------------
; copy_window_color – initial fill of LIVE $D800 during setup only.
; During scroll, $D800 is updated by the IRQs (commit_colors_top/bottom).
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
    lda zp_src_row
    cmp #TOTAL_ROWS
    bcc copy_color_src_ok
    lda #0
    sta zp_src_row
copy_color_src_ok:
    inc zp_vis_row
    lda zp_vis_row
    cmp #VISIBLE_ROWS
    bne row_loop
    rts
}

;--------------------------------------------------------------
; copy_row – copy ROW_WIDTH bytes from (zp_src) to (zp_dst).
; Inner loop fully unrolled: removes the per-byte 'bpl' branch and
; brings the 25-row char copy down to ~14,000 cyc so the main-loop
; coarse prep completes BEFORE the raster-251 lower-border IRQ fires
; at frame cycle 15813. Without the unroll it would overrun and the
; commit would slip by a frame.
;--------------------------------------------------------------
copy_row: {
    ldy #ROW_WIDTH-1
    ; 40 byte pairs, 39 inter-byte dey's. Last byte doesn't dey.
${Array.from({ length: 40 }, (_, i) =>
  `    lda (zp_src),y\n    sta (zp_dst),y${i < 39 ? `\n    dey` : ''}`
).join('\n')}
    rts
}

;--------------------------------------------------------------
; irq_top — upper border (raster 1)
;   • Apply nextD011 every frame (fine-scroll YSCROLL).
;   • On coarsePhase == 2: atomically swap $D018 to the new char
;     buffer, then raster-chase the top 19 rows of the new color
;     matrix into $D800. Row K's copy completes before raster 51+K*8.
;   • Chain to irq_bottom (raster 251).
;--------------------------------------------------------------
irq_top: {
    +irq_start(end)

    lda nextD011
    sta $d011

    lda coarsePhase
    cmp #2
    bne skip_top_commit
!if (debug_build) {
    lda #7
    sta $d020
}
    ; Chars and top-half colors commit together in the same IRQ
    lda nextD018
    sta $d018
    jsr commit_colors_top
    lda #0
    sta coarsePhase
!if (debug_build) {
    lda #14
    sta $d020
}
skip_top_commit:

    lda #1
    sta vsyncFlag

    +irq_end(irq_bottom, irq_bottom_line)
end:
}

;--------------------------------------------------------------
; irq_bottom — lower border (raster 251)
;   • On coarsePhase == 1: commit bottom 6 rows (19..24) to $D800.
;     The beam has already finished drawing all 25 rows of the
;     current frame, so these writes are invisible this frame
;     and will be displayed next frame along with the top half
;     (committed by the next irq_top).
;   • Chain back to irq_top (raster 1).
;--------------------------------------------------------------
irq_bottom: {
    +irq_start(end)

    lda coarsePhase
    cmp #1
    bne skip_bot_commit
!if (debug_build) {
    lda #2
    sta $d020
}
    jsr commit_colors_bottom
    lda #2
    sta coarsePhase
!if (debug_build) {
    lda #14
    sta $d020
}
skip_bot_commit:
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
scrollSpeed:    !byte SCROLL_SPEED
paused:         !byte 0
muteFlag:       !byte 0
keySpacePrev:   !byte 0
keyMPrev:       !byte 0
keyPlusPrev:    !byte 0
keyMinusPrev:   !byte 0
keyRowState:    !byte 0
displayBuf:     !byte 0     ; 0 = showing A, 1 = showing B
workBufOffset:  !byte 0     ; $00 = write to $04xx, $08 = write to $0Cxx
coarsePhase:    !byte 0     ; 0=idle, 1=lower-IRQ commits bottom, 2=upper-IRQ swaps + commits top
scrollDir:      !byte 0     ; 0=forward/down, 1=reverse/up (used by pingpong mode)

${MUSIC ? '* = music_load' : ''}
${MUSIC ? 'sid_data:' : ''}
${MUSIC ? sidDataAsm : ''}

;--------------------------------------------------------------
; Source data (uncompressed for fast row access)
;--------------------------------------------------------------
* = $${SCR_DATA_ADDR.toString(16)}
screen_data:
${screenDataAsm}

color_data:
${colorDataAsm}

;--------------------------------------------------------------
; Color commit routines — placed after source data so they don't
; collide with char buffer B at $0C00. Each row body is fully
; unrolled (40 × lda (zp),y / sta abs,y / dey) hitting 12 cyc/byte.
; Both routines use X as a running source-row pointer and pull
; the source base from col_row_lo/hi,x tables.
;--------------------------------------------------------------
${commitTopAsm}

${commitBotAsm}

;--------------------------------------------------------------
; Row address tables — placed AFTER the commit routines so they
; don't occupy the $0AA0..$0C93 range that used to collide with
; char buffer B at $0C00. They're referenced via absolute,X
; addressing so their actual load address doesn't matter.
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

`;

// ═══════════════════════════════════════════════════════════════════
//  ASSEMBLE
// ═══════════════════════════════════════════════════════════════════

function assemble(src) {
  const sourceFileMap = {
    'main.asm':   src,
    'macros.asm': macrosAsm,
  };
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
