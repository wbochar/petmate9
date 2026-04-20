#!/usr/bin/env node
/**
 * Petmate Horizontal Smooth Scroll Player Test
 *
 * Exports a wide frame as a C64/C128 PRG with
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
const computerArgIdx = process.argv.indexOf('--computer');
const TARGET_COMPUTER = computerArgIdx >= 0 && computerArgIdx + 1 < process.argv.length
  ? String(process.argv[computerArgIdx + 1]).toLowerCase()
  : 'c64';
if (TARGET_COMPUTER !== 'c64' && TARGET_COMPUTER !== 'c128') {
  throw new Error(`Invalid --computer '${TARGET_COMPUTER}'. Expected 'c64' or 'c128'.`);
}
const IS_C128 = TARGET_COMPUTER === 'c128';
const DEFAULT_FRAME_INDEX = IS_C128 ? 69 : 68;
const frameArgIdx = process.argv.indexOf('--frame-index');
const FRAME_INDEX = frameArgIdx >= 0 && frameArgIdx + 1 < process.argv.length
  ? parseInt(process.argv[frameArgIdx + 1], 10)
  : DEFAULT_FRAME_INDEX;
if (Number.isNaN(FRAME_INDEX) || FRAME_INDEX < 0) {
  throw new Error(`Invalid --frame-index value '${process.argv[frameArgIdx + 1]}'.`);
}
const EMULATOR_EXE = IS_C128 ? 'x128.exe' : 'x64sc.exe';

const fpsArgIdx  = process.argv.indexOf('--fps');
const TARGET_FPS = fpsArgIdx >= 0 && fpsArgIdx + 1 < process.argv.length
                   ? parseFloat(process.argv[fpsArgIdx + 1]) : 60;
const SCROLL_SPEED = Math.max(1, Math.min(255, Math.round(60 / TARGET_FPS)));
const modeArgIdx = process.argv.indexOf('--mode');
const SCROLL_MODE = modeArgIdx >= 0 && modeArgIdx + 1 < process.argv.length
                    ? String(process.argv[modeArgIdx + 1]).toLowerCase()
                    : 'wrap';
if (SCROLL_MODE !== 'wrap' && SCROLL_MODE !== 'pingpong') {
  throw new Error(`Invalid --mode '${SCROLL_MODE}'. Expected 'wrap' or 'pingpong'.`);
}

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

function findTestSidByLoadAddress(loadAddress, preferredNames = []) {
  if (!fs.existsSync(TEST_SIDS_DIR)) return null;
  const preferredOrder = preferredNames.map(name => name.toLowerCase());
  const sidFiles = fs.readdirSync(TEST_SIDS_DIR)
    .filter(name => name.toLowerCase().endsWith('.sid'))
    .sort((a, b) => {
      const aIdx = preferredOrder.indexOf(a.toLowerCase());
      const bIdx = preferredOrder.indexOf(b.toLowerCase());
      const aRank = aIdx >= 0 ? aIdx : preferredOrder.length;
      const bRank = bIdx >= 0 ? bIdx : preferredOrder.length;
      if (aRank !== bRank) return aRank - bRank;
      return a.localeCompare(b);
    });
  for (const sidFile of sidFiles) {
    const fullPath = path.join(TEST_SIDS_DIR, sidFile);
    if (readSidLoadAddress(fullPath) === loadAddress) {
      return fullPath;
    }
  }
  return null;
}
const c128AutoSidPreference = ['bassechotest.sid', 'uuuristen.sid', 'geosix11.sid'];
const autoSidPreference = IS_C128 ? c128AutoSidPreference : [];
const autoTestSidFile = (!explicitSidFile && !NO_SID) ? findTestSidByLoadAddress(0x1000, autoSidPreference) : null;
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

function createHorizontalDebugFrame() {
  const width = 80;
  const height = 25;
  const BLOCK = 160; // reverse-space block
  const framebuf = [];
  const header = `HSCROLL-${SCROLL_MODE.toUpperCase()}`;
  const headerCodes = textToScreenCodes(header);
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      const colColor = x % 16;
      const columnId = ((x - 1 + 99) % 99) + 1; // data columns start at 01 on col 1
      const columnTensCode = 48 + Math.floor(columnId / 10);
      const columnOnesCode = 48 + (columnId % 10);
      let code = BLOCK;
      if (x === 0) {
        code = y < headerCodes.length ? headerCodes[y] : 32;
      } else if (y === 0) {
        code = columnTensCode;
      } else if (y === 1) {
        code = columnOnesCode;
      }
      row.push({
        code,
        color: colColor,
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
    charset: IS_C128 ? 'c128Upper' : 'upper',
    name: 'debug-hscroll-80x25',
  };
}

// ─── Load source ────────────────────────────────────────────────────
const petmate   = USE_DEFAULT_SOURCE ? JSON.parse(fs.readFileSync(SRC_FILE, 'utf-8')) : null;
const fb        = USE_DEFAULT_SOURCE ? petmate.framebufs[FRAME_INDEX] : createHorizontalDebugFrame();
if (!fb) {
  throw new Error(`Frame index ${FRAME_INDEX} is out of range for source file.`);
}
const macrosAsm = fs.readFileSync(path.join(ASSETS, IS_C128 ? 'macrosc128.asm' : 'macrosc64.asm'));

const { width, height, framebuf, backgroundColor, borderColor } = fb;
const VISIBLE_COLS = 40;
const SOURCE_COLS  = width;
const MAX_SCROLL   = SCROLL_MODE === 'wrap'
                   ? (SOURCE_COLS - 1)
                   : (SOURCE_COLS - VISIBLE_COLS);
const SRC_ROW_WIDTH = SCROLL_MODE === 'wrap'
                    ? (SOURCE_COLS + VISIBLE_COLS)
                    : SOURCE_COLS;
const scrollSummary = SCROLL_MODE === 'wrap'
                    ? `${SOURCE_COLS} cols/cycle (${SOURCE_COLS * 8} pixels)`
                    : `${MAX_SCROLL} cols each direction (${MAX_SCROLL * 8} pixels)`;

console.log(`\nPetmate Horizontal Smooth Scroll Test`);
console.log(`Target : ${TARGET_COMPUTER.toUpperCase()}`);
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
function toHex8(v) { return v.toString(16).toUpperCase().padStart(2, '0'); }
function toHex16(v) { return v.toString(16).toUpperCase().padStart(4, '0'); }
function chunkArray(a, s) { const o=[]; for(let i=0;i<a.length;i+=s) o.push(a.slice(i,i+s)); return o; }
function bytesToAsmLines(b, w=16) { return chunkArray(b,w).map(r=>`\n!byte ${r.map(n=>`$${toHex8(n)}`).join(',')}`); }
const tblHex = (a) => a.map(v=>`$${toHex8(v)}`).join(',');

// ─── Extract frame data (row-major, SRC_ROW_WIDTH cols per row) ─────
// Wrap mode uses circular source rows by appending the first 40 columns
// to each row, so copy routines can read a contiguous 40-byte strip.
const screenCodes = [];
const colorValues = [];
for (let y = 0; y < height; y++) {
  const rowCodes = [];
  const rowColors = [];
  for (let x = 0; x < SOURCE_COLS; x++) {
    rowCodes.push(framebuf[y][x].code);
    rowColors.push(framebuf[y][x].color);
  }
  if (SCROLL_MODE === 'wrap') {
    for (let x = 0; x < VISIBLE_COLS; x++) {
      const srcX = x % SOURCE_COLS;
      rowCodes.push(rowCodes[srcX]);
      rowColors.push(rowColors[srcX]);
    }
  }
  screenCodes.push(...rowCodes);
  colorValues.push(...rowColors);
}

console.log(`  Screen data: ${screenCodes.length} bytes (${SRC_ROW_WIDTH}×${height})`);
console.log(`  Color data:  ${colorValues.length} bytes`);
console.log(`  Total:       ${screenCodes.length + colorValues.length} bytes\n`);

// ─── Address tables ─────────────────────────────────────────────────
const SCR_DATA_ADDR_DEFAULT = 0x2200;
const SCR_DATA_ADDR_ALT = 0x8000;
const PLAYER_LOW_MEM_START_C64 = 0x0801;
const PLAYER_LOW_MEM_START_C128 = 0x1C01;
const PLAYER_LOW_MEM_END = 0x21FF;
const SID_RELOCATION_OVERHEAD = 0x2000;
const SID_RELOCATION_IO_LIMIT = 0xD000;

function rangesOverlap(startA, endA, startB, endB) {
  return startA <= endB && startB <= endA;
}

function selectScrollDataAddress() {
  if (!(MUSIC && SID_INFO)) return SCR_DATA_ADDR_DEFAULT;

  const sidStart = SID_INFO.loadAddress;
  const sidEnd = sidStart + SID_INFO.dataBytes.length - 1;
  const sidEndWrapped = sidEnd & 0xFFFF;
  const playerLowMemStart = IS_C128 ? PLAYER_LOW_MEM_START_C128 : PLAYER_LOW_MEM_START_C64;

  if (rangesOverlap(playerLowMemStart, PLAYER_LOW_MEM_END, sidStart, sidEnd)) {
    throw new Error(
      `SID load range $${toHex16(sidStart)}-$${toHex16(sidEndWrapped)} overlaps fixed player code/vars ($${toHex16(playerLowMemStart)}-$${toHex16(PLAYER_LOW_MEM_END)}).`
    );
  }

  const estimatedPlayerDataSpan = screenCodes.length + colorValues.length + SID_RELOCATION_OVERHEAD;
  const candidates = [SCR_DATA_ADDR_DEFAULT, SCR_DATA_ADDR_ALT];
  for (const base of candidates) {
    const end = base + estimatedPlayerDataSpan - 1;
    if (end >= SID_RELOCATION_IO_LIMIT) continue;
    if (IS_C128) {
      if (!rangesOverlap(base, end, sidStart, sidEnd)) return base;
      continue;
    }
    if (base <= sidEnd) continue;
    return base;
  }
  if (IS_C128) {
    throw new Error(
      `SID load range $${toHex16(sidStart)}-$${toHex16(sidEndWrapped)} overlaps all supported source-data regions.`
    );
  }
  throw new Error(
    `SID load range $${toHex16(sidStart)}-$${toHex16(sidEndWrapped)} leaves no supported source-data region above SID end.`
  );
}

const SCR_DATA_ADDR = selectScrollDataAddress();
const COL_DATA_ADDR = SCR_DATA_ADDR + screenCodes.length;
if (MUSIC && SID_INFO && SCR_DATA_ADDR !== SCR_DATA_ADDR_DEFAULT) {
  const sidStart = SID_INFO.loadAddress;
  const sidEndWrapped = (SID_INFO.loadAddress + SID_INFO.dataBytes.length - 1) & 0xFFFF;
  console.log(`  Relocated source data to $${toHex16(SCR_DATA_ADDR)} to avoid SID range $${toHex16(sidStart)}-$${toHex16(sidEndWrapped)}`);
  console.log('');
}

// Source row BASE addresses (25 entries, each row is SRC_ROW_WIDTH bytes wide)
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

// ─── Assembly ────────────────────────────────────────────────
const screenDataAsm = bytesToAsmLines(screenCodes, SRC_ROW_WIDTH).join('');
const colorDataAsm  = bytesToAsmLines(colorValues, SRC_ROW_WIDTH).join('');
const sidDataAsm    = MUSIC ? bytesToAsmLines(SID_INFO.dataBytes, 16).join('') : '';
const sidDataSize   = MUSIC ? SID_INFO.dataBytes.length : 0;
const sidCopyPageCount = Math.floor(sidDataSize / 256);
const sidCopyRemainder = sidDataSize % 256;

// Buf B MUST be below $1000: in VIC bank 0 the range $1000..$1FFF is
// the character-ROM ghost, so the VIC reads glyph ROM there instead of
// the RAM we write. $0C00 is the only clean 1KB slot in bank 0 outside
// of zero page, the code area, and the ROM-ghost. Row tables are moved
// after the commit routines so they don't collide with buf B.
const lowerCharset = IS_C128
                   ? (fb.charset === 'c128Lower' || fb.charset === 'lower')
                   : (fb.charset === 'lower');
const charsetBits = lowerCharset ? 0x07 : 0x05;
const D018_A = 0x10 | charsetBits;  // screen at $0400
const D018_B = 0x30 | charsetBits;  // screen at $0C00
const platformLabel = IS_C128 ? 'C128' : 'C64';
const runtimeBankingAsm = IS_C128
                        ? `    lda #$3e\n    sta $ff00`
                        : `    lda #$35\n    sta $01`;
const d018StoreAsm = IS_C128
                   ? `    sta $d018\n    sta $0a2c`
                   : `    sta $d018`;

// ─── Split-buffer color commit ───────────────────────────────────────
//
// Same scheme as the vertical player: no shadow, two chained raster
// IRQs commit $D800 directly.
//   irq_bottom (raster 251) — commits rows 19..24 of frame N-1 lower border.
//   irq_top    (raster   1) — atomically swaps $D018 and raster-chases
//                              rows 0..18 to $D800 before the beam
//                              reaches their badlines.
// For horizontal, each row's source base is src_col_row_lo/hi[row]
// plus scrollCol (unlike vertical where only the row pointer moves).
const IRQ_BOTTOM_LINE = 251;
// Keep lower-border work to 6 rows so worst-case (zp),y page-cross cycles
// from scrollCol offsets cannot overrun the frame boundary.
const TOP_COMMIT_ROWS = 19;
const BOT_COMMIT_ROWS = height - TOP_COMMIT_ROWS;
if (TOP_COMMIT_ROWS + BOT_COMMIT_ROWS !== height) {
  throw new Error('TOP_COMMIT_ROWS + BOT_COMMIT_ROWS must equal height');
}

// Emit a per-row color commit. X holds the row index (0..24),
// pre-incremented each row. Source pointer = src_col_row[X] + scrollCol.
// Uses zp_cmt_src (separate from main loop's zp_src) so a commit firing
// mid-char-copy won't corrupt copy_row's indirect source pointer.
function genCommitRowH(destBase) {
  const destHex = `$${destBase.toString(16).toUpperCase().padStart(4, '0')}`;
  const out = [];
  out.push(`    lda src_col_row_lo,x`);
  out.push(`    clc`);
  out.push(`    adc scrollCol`);
  out.push(`    sta zp_cmt_src`);
  out.push(`    lda src_col_row_hi,x`);
  out.push(`    adc #0`);
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

let commitTopAsm = `commit_colors_top: {\n    ldx #0\n`;
for (let r = 0; r < TOP_COMMIT_ROWS; r++) {
  commitTopAsm += genCommitRowH(0xD800 + r * VISIBLE_COLS) + '\n';
}
commitTopAsm += `    rts\n}`;

let commitBotAsm = `commit_colors_bottom: {\n    ldx #${TOP_COMMIT_ROWS}\n`;
for (let r = TOP_COMMIT_ROWS; r < height; r++) {
  commitBotAsm += genCommitRowH(0xD800 + r * VISIBLE_COLS) + '\n';
}
commitBotAsm += `    rts\n}`;

const coarseStepAsm = SCROLL_MODE === 'pingpong'
  ? `
    ; Pingpong fine+coarse stepping with smooth turnarounds
    lda scrollDir
    bne pp_reverse
    jmp pp_fwd_fine
pp_reverse:
    inc scrollFine
    lda scrollFine
    cmp #8
    bcs pp_rev_crossed
    jmp prep_fine
pp_rev_crossed:
    ; Reverse coarse boundary crossed
    lda scrollCol
    bne pp_rev_do_coarse
    ; At left edge: turn around and start moving forward
    lda #7
    sta scrollFine
    lda #0
    sta scrollDir
    jmp prep_fine
pp_rev_do_coarse:
    lda #0
    sta scrollFine
    dec scrollCol
    jmp do_coarse

pp_fwd_fine:
    dec scrollFine
    bmi pp_fwd_crossed
    jmp prep_fine
pp_fwd_crossed:
    ; Forward coarse boundary crossed
    lda scrollCol
    cmp #MAX_SCROLL
    bcc pp_fwd_do_coarse
    ; At right edge: turn around and start moving reverse
    lda #0
    sta scrollFine
    lda #1
    sta scrollDir
    jmp prep_fine
pp_fwd_do_coarse:
    lda #7
    sta scrollFine
    inc scrollCol
`
  : `
    ; Wrap fine+coarse stepping (mod SOURCE_COLS)
    dec scrollFine
    bpl prep_fine

    ; Coarse scroll needed
    lda #7
    sta scrollFine
    inc scrollCol
    lda scrollCol
    cmp #MAX_SCROLL+1
    bcc do_coarse
    ; Wrap
    lda #0
    sta scrollCol
`;
const sidCopyRoutineAsm = (MUSIC && IS_C128)
  ? `copy_sid_blob_to_load: {
    lda #<sid_blob
    sta zp_src
    lda #>sid_blob
    sta zp_src+1
    lda #<music_load
    sta zp_dst
    lda #>music_load
    sta zp_dst+1
${sidCopyPageCount > 0 ? `    ldx #${sidCopyPageCount}
copy_sid_page_loop:
    ldy #0
copy_sid_page_bytes:
    lda (zp_src),y
    sta (zp_dst),y
    iny
    bne copy_sid_page_bytes
    inc zp_src+1
    inc zp_dst+1
    dex
    bne copy_sid_page_loop
` : ''}${sidCopyRemainder > 0 ? `    ldy #0
copy_sid_tail_loop:
    lda (zp_src),y
    sta (zp_dst),y
    iny
    cpy #${sidCopyRemainder}
    bcc copy_sid_tail_loop
` : ''}    rts
}`
  : '';
const sidInitAsm = (MUSIC && IS_C128)
  ? `    jsr copy_sid_blob_to_load\n    lda $01\n    sta port01Saved\n    lda #0\n    jsr music_init\n    lda port01Saved\n    sta $01`
  : (MUSIC ? `    lda #0\n    jsr music_init` : '');
const sidPlayMainLoopAsm = IS_C128
  ? `    sei\n    lda #$3e\n    sta $ff00\n    jsr music_play\n    lda port01Saved\n    sta $01\n    lda #$3e\n    sta $ff00\n    cli`
  : `    jsr music_play`;
const musicMainLoopAsm = MUSIC
  ? `
    lda muteFlag
    beq music_unmuted
    lda #0
    sta $d404
    sta $d40b
    sta $d412
    sta $d417
    sta $d418
    jmp music_main_done
music_unmuted:
${sidPlayMainLoopAsm}
music_main_done:
`
  : '';
const sidDataBlockAsm = MUSIC
  ? (IS_C128 ? `sid_blob:${sidDataAsm}` : `* = music_load\nsid_data:${sidDataAsm}`)
  : '';
const sidDataPreCodeAsm = '';
const sidDataPostCodeAsm = (MUSIC && !IS_C128) ? sidDataBlockAsm : '';
const sidDataTailAsm = (MUSIC && IS_C128) ? sidDataBlockAsm : '';

const source = `
; Petmate9 Horizontal Smooth Scroller (${platformLabel}) — Double Buffered
; Source: ${fb.name} (${width}x${height}), scroll ${MAX_SCROLL} cols
; Buffer A = $0400, Buffer B = $0C00 — swap via $D018 in IRQ
!include "macros.asm"
${MUSIC ? `!let music_load = $${toHex16(SID_INFO.loadAddress)}
!let music_init = $${toHex16(SID_INFO.initAddress)}
!let music_play = $${toHex16(SID_INFO.playAddress)}` : ''}

!let irq_top_line    = 1
!let irq_bottom_line = ${IRQ_BOTTOM_LINE}
!let debug_build     = FALSE
!let VISIBLE_COLS    = ${VISIBLE_COLS}
!let VISIBLE_ROWS    = ${height}
!let MAX_SCROLL      = ${MAX_SCROLL}
!let SRC_ROW_WIDTH   = ${SRC_ROW_WIDTH}
!let SCROLL_SPEED    = ${SCROLL_SPEED}
!let D018_A          = $${toHex8(D018_A)}
!let D018_B          = $${toHex8(D018_B)}

!let zp_src          = $20
!let zp_dst          = $22
!let zp_vis_row      = $24
!let zp_col_lo       = $25   ; scrollCol low byte for source offset
!let zp_col_hi       = $26   ; scrollCol high byte (always 0 for col<256)
!let zp_cmt_src      = $28   ; dedicated commit-source pointer (IRQ-safe)
${sidDataPreCodeAsm}

+basic_start(entry)

;--------------------------------------------------------------
; Entry
;--------------------------------------------------------------
entry: {

    sei
${runtimeBankingAsm}
${sidInitAsm}
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
    sta coarsePhase
    sta scrollDir           ; 0 = forward/right, 1 = reverse/left (pingpong mode)
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

    ; Set VIC: 25 rows, YSCROLL=3 (normal), 38 cols, XSCROLL=7
    lda #$1b            ; 25-row mode, normal
    sta $d011
    lda #$c7            ; 38-col mode ($C0) + XSCROLL=7
    sta nextD016
    sta $d016
    lda #D018_A
    sta nextD018
${d018StoreAsm}

    ; ── Main loop: double-buffered prepare-ahead ──

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
    lda #$08
    jmp set_work
work_is_a:
    lda #$00
set_work:
    sta workBufOffset

    ; Flip displayBuf and queue $D018 swap BEFORE the long copy and
    ; BEFORE arming coarsePhase. That way, when the lower-border IRQ
    ; fires mid-copy and commits bottom (phase 1→2), the very next
    ; upper-border IRQ already has nextD018 ready to apply.
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

    ; Arm the commit BEFORE the char copy so the lower-border IRQ
    ; never misses the signal no matter how long the copy takes.
    ; The commit uses zp_cmt_src (not zp_src), so it's safe to preempt
    ; copy_row mid-byte.
    lda #1
    sta coarsePhase

    ; Big 25×40 char copy — may be preempted by the lower-border IRQ.
    ; Color RAM is NOT touched here; the IRQ chain commits $D800
    ; across frame N-1 lower border + frame N upper border.
    jsr copy_window_screen

prep_fine:
    lda #$c0            ; 38-col mode
    ora scrollFine
    sta nextD016
post_frame_work:
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
; copy_window_color – initial fill of LIVE $D800 during setup only.
; During scroll, $D800 is updated by irq_top/irq_bottom.
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
; copy_row – copy VISIBLE_COLS (40) bytes from (zp_src) to (zp_dst).
; Inner loop fully unrolled so the 25-row char copy finishes before
; the raster-251 lower-border IRQ fires.
;--------------------------------------------------------------
copy_row: {
    ldy #VISIBLE_COLS-1
${Array.from({ length: 40 }, (_, i) =>
  `    lda (zp_src),y\n    sta (zp_dst),y${i < 39 ? `\n    dey` : ''}`
).join('\n')}
    rts
}
${sidCopyRoutineAsm}

;--------------------------------------------------------------
; irq_top — upper border (raster 1)
;   • Apply nextD016 every frame (fine-scroll XSCROLL).
;   • On coarsePhase == 2: atomically swap $D018 and raster-chase
;     rows 0..18 of the new color matrix to $D800.
;   • Chain to irq_bottom (raster 251).
;--------------------------------------------------------------
irq_top: {
    +irq_start(end)

    lda nextD016
    sta $d016

    lda coarsePhase
    cmp #2
    bne skip_top_commit
    lda nextD018
${d018StoreAsm}
    jsr commit_colors_top
    lda #0
    sta coarsePhase
skip_top_commit:

    lda #1
    sta vsyncFlag
    +irq_end(irq_bottom, irq_bottom_line)
end:
}

;--------------------------------------------------------------
; irq_bottom — lower border (raster 251)
;   • On coarsePhase == 1: commit bottom 6 rows (19..24) to $D800.
;   • Chain back to irq_top (raster 1).
;--------------------------------------------------------------
irq_bottom: {
    +irq_start(end)

    lda coarsePhase
    cmp #1
    bne skip_bot_commit
    jsr commit_colors_bottom
    lda #2
    sta coarsePhase
skip_bot_commit:
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
scrollSpeed:    !byte SCROLL_SPEED
paused:         !byte 0
muteFlag:       !byte 0
${(MUSIC && IS_C128) ? 'port01Saved:   !byte 0' : ''}
keySpacePrev:   !byte 0
keyMPrev:       !byte 0
keyPlusPrev:    !byte 0
keyMinusPrev:   !byte 0
keyRowState:    !byte 0
displayBuf:     !byte 0
workBufOffset:  !byte 0
coarsePhase:    !byte 0     ; 0=idle, 1=lower commits bottom, 2=upper swaps + commits top
scrollDir:      !byte 0     ; 0=forward/right, 1=reverse/left (used by pingpong mode)
${sidDataPostCodeAsm}

;--------------------------------------------------------------
; Source data (uncompressed, 160 cols × 25 rows)
;--------------------------------------------------------------
* = $${SCR_DATA_ADDR.toString(16)}
screen_data:
${screenDataAsm}

color_data:
${colorDataAsm}

;--------------------------------------------------------------
; Color commit routines — placed after source data to avoid char
; buffer B at $0C00. Each row uses an indirect source pointer (base
; from src_col_row_lo/hi[X] + scrollCol) and an abs-Y destination
; at $D800 + row*40. Inner 40-byte body fully unrolled (12 cyc/byte).
;--------------------------------------------------------------
${commitTopAsm}

${commitBotAsm}

;--------------------------------------------------------------
; Row address tables — placed AFTER the commit routines so they
; don't occupy the $0AA0..$0C93 range that used to collide with
; char buffer B at $0C00. Referenced via absolute,X addressing
; so location doesn't matter.
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
${sidDataTailAsm}

`;

// ═══════════════════════════════════════════════════════════════════
//  ASSEMBLE + MAIN
// ═══════════════════════════════════════════════════════════════════

function assemble(src) {
  const sfm = { 'main.asm': src, 'macros.asm': macrosAsm };
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
    const exePath = path.join(VICE_BIN, EMULATOR_EXE);
    console.log(`  🚀 ${EMULATOR_EXE} -autostart ${path.basename(prgFile)}`);
    spawn(exePath, ['-autostart', prgFile], { detached:true, stdio:'ignore', shell:true }).unref();
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise(r => rl.question('  Press Enter to finish...', () => { rl.close(); r(); }));
  }
  console.log(`\n═══ DONE ═══`);
  process.exit(0);
}

main();
