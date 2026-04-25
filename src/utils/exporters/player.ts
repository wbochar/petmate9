import { chunkArray } from '..'
import { electron, fs, path } from '../electronImports'
import { FileFormatPlayerV1, FramebufWithFont, EmulatorPaths } from '../../redux/types';
import * as fp from '../fp'
import * as c64jasm from 'c64jasm';

// `child_process` is only available in the Electron renderer via
// `window.require`.  Keep the lookup lazy so this module can be safely
// imported from non-renderer contexts (e.g. Jest's jsdom test env)
// where `window.require` doesn't exist.  `spawn` is only used by
// `launchEmulator` below.

const WINDOWS_DEV_VICE_BIN = 'C:\\C64\\VICE\\bin';
const WINDOWS_DEV_VICE_EMU: Record<string, string> = {
  c64: 'x64sc.exe',
  c128: 'x128.exe',
  pet4032: 'xpet.exe',
  pet8032: 'xpet.exe',
  vic20: 'xvic.exe',
  c16: 'xplus4.exe',
};

function isWindowsDevBuild(): boolean {
  return process.platform === 'win32' && !electron.remote.app.isPackaged;
}

function getWindowsDevVicePath(computer: string): string {
  const emuKey = computer === 'c128vdc' ? 'c128' : computer;
  const exe = WINDOWS_DEV_VICE_EMU[emuKey];
  return exe ? path.join(WINDOWS_DEV_VICE_BIN, exe) : '';
}

const singleFrameASM = (computer: string, music: boolean, color: boolean, frameName: string, charsetBits: string, petsciiBytes: string[], sidHeader?: string, sidData?: string) => `

; Petmate9 Player (${computer} version) written by wbochar 2024
!include "macros.asm"
${music ? sidHeader : ''}

!let irq_top_line = 1
!let debug_build = FALSE
!let zptmp0 = $20


+basic_start(entry)
;--------------------------------------------------------------
; Execution starts here
;--------------------------------------------------------------
entry: {
${music === true ? '    lda #0' : ''}
${music === true ? '    jsr sid_init' : ''}

    sei
    lda #$35        ; Bank out kernal and basic
    sta $01         ; $e000-$ffff
    +setup_irq(irq_top, irq_top_line)
    cli



    lda ${frameName}
    sta $d020
    lda ${frameName}+1
    sta $d021
    ${charsetBits}




    ldx #$00
loop:
    lda ${frameName}+2,x
    sta SCREEN,x
${color === true ? '    lda '+frameName+'+$3ea,x':''}
${color === true ? '    sta COLOR,x':''}
    lda ${frameName}+$102,x
    sta SCREEN+$100,x
${color === true ? '    lda '+frameName+'+$4ea,x':''}
${color === true ? '    sta COLOR+$100,x':''}

    lda ${frameName}+$202,x
    sta SCREEN+$200,x
${color === true ? '    lda '+frameName+'+$5ea,x':''}
${color === true ? '    sta COLOR+$200,x':''}

    lda ${frameName}+$2ea,x
    sta SCREEN+$2e8,x
${color === true ? '    lda '+frameName+'+$6d2,x':''}
${color === true ? '    sta COLOR+$2e8,x':''}
    inx
    bne loop

${music ? '    jmp frame_loop' : '    jmp *'}


frame_loop:
    ; wait for vSync by polling the frameCount that's inc'd
    ; by the raster IRQ
    lda frameCount
vSync:
    cmp frameCount
    beq vSync
${music ? '    jsr check_keys' : ''}

    jmp frame_loop
}

irq_top: {
    +irq_start(end)
    inc frameCount

!if (debug_build) {
    inc $d020
}

${music ? `    lda musicMuted
    bne skip_music
    jsr sid_play
skip_music:` : ''}

!if (debug_build) {
    dec $d020
}

    +irq_end(irq_top, irq_top_line)
end:
}

frameCount:     !byte 0
${music ? 'musicMuted:     !byte 0' : ''}

${music ? checkKeysASM_CIA(true, false) : ''}

${sidData || ''}

* = $2000

${petsciiBytes.join('')}


`;


const singleFrameC16ASM = (computer: string, color: boolean, frameName: string, charsetBits: string, petsciiBytes: string[]) => `

; Petmate9 Player (${computer} version) written by wbochar 2024
!include "macros.asm"
+basic_start(entry)
;--------------------------------------------------------------
; Execution starts here
;--------------------------------------------------------------
entry: {
    ${charsetBits}

    lda ${frameName}
    sta $ff19       ; TED border color
    lda ${frameName}+1
    sta $ff15       ; TED background color 0

    ldx #$00
loop:
    lda ${frameName}+2,x
    sta SCREEN,x
${color === true ? '    lda '+frameName+'+$3ea,x':''}
${color === true ? '    sta COLOR,x':''}
    lda ${frameName}+$102,x
    sta SCREEN+$100,x
${color === true ? '    lda '+frameName+'+$4ea,x':''}
${color === true ? '    sta COLOR+$100,x':''}

    lda ${frameName}+$202,x
    sta SCREEN+$200,x
${color === true ? '    lda '+frameName+'+$5ea,x':''}
${color === true ? '    sta COLOR+$200,x':''}

    lda ${frameName}+$2ea,x
    sta SCREEN+$2e8,x
${color === true ? '    lda '+frameName+'+$6d2,x':''}
${color === true ? '    sta COLOR+$2e8,x':''}
    inx
    bne loop

    jmp *
}

* = $2000

${petsciiBytes.join('')}


`;


const singleFrameVic20ASM = (computer: string, music: boolean, color: boolean, frameName: string, charsetBits: string, petsciiBytes: string[]) => `

; Petmate9 Player (${computer} version) written by wbochar 2024
!include "macros.asm"
+basic_start(entry)
;--------------------------------------------------------------
; Execution starts here
;--------------------------------------------------------------
entry: {

  ${charsetBits}

    lda ${frameName}Chars-2
    sta $900f
    ldx #$00

loop:
    lda ${frameName}Chars,x
    sta SCREEN,x
${color === true ? '    lda '+frameName+'Colours,x':''}
${color === true ? '    sta COLOR,x':''}
    lda ${frameName}Chars+$100,x
    sta SCREEN+$100,x
${color === true ? '    lda '+frameName+'Colours+$100,x':''}
${color === true ? '    sta COLOR+$100,x':''}


    inx
    bne loop

    jmp *

}

${petsciiBytes.join('')}


`;


const singleFramePET8032ASM = (frameName: string, charsetBits: string, petsciiBytes: string[]) => `

; Petmate9 Player (PET 8032 version) written by wbochar 2024
!include "macros.asm"

!let zp_src = $20
!let zp_dst = $22

+basic_start(entry)
;--------------------------------------------------------------
; Execution starts here
;--------------------------------------------------------------
entry: {
    ${charsetBits}

    ; Copy 2000 bytes ($7D0) from ${frameName}+2 to SCREEN
    lda #<(${frameName}+2)
    sta zp_src
    lda #>(${frameName}+2)
    sta zp_src+1
    lda #<SCREEN
    sta zp_dst
    lda #>SCREEN
    sta zp_dst+1

    ldx #7          ; 7 full pages (1792 bytes)
    ldy #0
page_loop:
    lda (zp_src),y
    sta (zp_dst),y
    iny
    bne page_loop
    inc zp_src+1
    inc zp_dst+1
    dex
    bne page_loop

    ; Remaining 208 bytes ($D0)
    ldy #0
remain_loop:
    lda (zp_src),y
    sta (zp_dst),y
    iny
    cpy #$d0
    bne remain_loop

    jmp *
}

* = $0800

${petsciiBytes.join('')}


`;


const singleFrameC128VDCASM = (frameName: string, charsetBits: string, petsciiBytes: string[]) => `

; Petmate9 Player (C128 VDC 80-column version) written by wbochar 2024
!include "macros.asm"

+basic_start(entry)
;--------------------------------------------------------------
; Execution starts here
;--------------------------------------------------------------
entry: {
    ${charsetBits}

    ; Set global background color (reg 26 low nibble)
    lda ${frameName}+1
    and #$0f
    sta zp_tmp
    lda #$f0
    ora zp_tmp
    ldx #VDC_REG_COLORS
    +vdc_write_reg()

    ; --- Write screen codes to VDC screen RAM ($0000) ---
    lda #>VDC_SCREEN
    ldy #<VDC_SCREEN
    +vdc_set_update_addr()

    ; Copy 2000 bytes from data+2 using indirect addressing
    lda #<(${frameName}+2)
    sta zp_ptr
    lda #>(${frameName}+2)
    sta zp_ptr+1

    lda #0
    sta zp_count
    lda #<2000
    sta zp_row
    lda #>2000
    sta zp_tmp

scr_copy:
    ldy zp_count
    lda (zp_ptr),y
    +vdc_write_byte()
    inc zp_count
    bne scr_no_page
    inc zp_ptr+1
scr_no_page:
    ; Decrement 16-bit counter
    lda zp_row
    bne scr_dec_lo
    dec zp_tmp
scr_dec_lo:
    dec zp_row
    lda zp_row
    ora zp_tmp
    bne scr_copy

    ; --- Write attributes to VDC attribute RAM ($0800) ---
    lda #>VDC_ATTRIB
    ldy #<VDC_ATTRIB
    +vdc_set_update_addr()

    ; Attribute data follows screen data: offset +2 +2000 = +2002
    lda #<(${frameName}+2002)
    sta zp_ptr
    lda #>(${frameName}+2002)
    sta zp_ptr+1

    lda #0
    sta zp_count
    lda #<2000
    sta zp_row
    lda #>2000
    sta zp_tmp

attr_copy:
    ldy zp_count
    lda (zp_ptr),y
    +vdc_write_byte()
    inc zp_count
    bne attr_no_page
    inc zp_ptr+1
attr_no_page:
    lda zp_row
    bne attr_dec_lo
    dec zp_tmp
attr_dec_lo:
    dec zp_row
    lda zp_row
    ora zp_tmp
    bne attr_copy

    ; Hide cursor off-screen
    lda #$07
    ldx #VDC_REG_CURSOR_HI
    +vdc_write_reg()
    lda #$d0
    ldx #VDC_REG_CURSOR_LO
    +vdc_write_reg()

    jmp *
}

* = $2000

${petsciiBytes.join('')}


`;


function maybeLabelName(name: string | undefined) {
  // Sanitize to a valid assembly label: letters, digits, underscores only
  const raw = fp.maybeDefault(name, 'untitled' as string);
  return raw.replace(/[^a-zA-Z0-9_]/g, '_') || 'untitled';
}


function toHex8(v: number): string {
  return `${v.toString(16).toUpperCase().padStart(2, '0')}`
}

function bytesToCommaDelimited(bytes: number[], bytesPerLine: number, hex: boolean) {
  let lines = chunkArray(bytes, bytesPerLine)
  let outLines: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const nums = lines[i].map(n => hex ? `$${toHex8(n)}` : `${n}`);
    const line = (`\n!byte ${nums.join(',')}`)
    outLines.push(line);
  }
  return outLines;
}

// ── RLE Encoder (marker $FE) ──────────────────────────────────────
const RLE_MARKER = 0xFE;

function rleEncode(bytes: number[]): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    let run = 1;
    while (i + run < bytes.length && bytes[i + run] === b && run < 255) run++;
    if (b === RLE_MARKER) {
      if (run === 1) { out.push(RLE_MARKER, 0); }
      else { out.push(RLE_MARKER, run, RLE_MARKER); }
    } else if (run >= 4) {
      out.push(RLE_MARKER, run, b);
    } else {
      for (let j = 0; j < run; j++) out.push(b);
    }
    i += run;
  }
  return out;
}

// ── Nibble Packer (two 4-bit colors per byte) ─────────────────────
function nibblePack(colors: number[]): number[] {
  const packed: number[] = [];
  for (let i = 0; i < colors.length; i += 2) {
    const hi = colors[i] & 0x0F;
    const lo = (i + 1 < colors.length) ? (colors[i + 1] & 0x0F) : 0;
    packed.push((hi << 4) | lo);
  }
  return packed;
}

function fpsToVblanks(fps: number): number {
  if (fps <= 0) return 8;
  return Math.max(1, Math.min(255, Math.round(60 / fps)));
}

// ── Keyboard scan routines for pause/mute controls ────────────────

// C64/C128: Direct CIA scan (KERNAL banked out)
// P key = row 5 ($DF), col 1 ($02) – toggles music mute
// Space = row 7 ($7F), col 4 ($10) – toggles animation/scroll pause
function checkKeysASM_CIA(music: boolean, hasAnim: boolean): string {
  if (!music && !hasAnim) return '';
  let asm = `\ncheck_keys: {\n`;
  if (music) {
    asm += `    ; --- Check P key (row 5, col 1) ---
    lda #$df
    sta $dc00
    lda $dc01
    and #$02
    bne no_p
    lda musicMuted
    eor #1
    sta musicMuted
    beq p_unmuted
    ; Silence SID immediately
    lda #0
    sta $d404
    sta $d40b
    sta $d412
p_unmuted:
wait_p:
    lda #$df
    sta $dc00
    lda $dc01
    and #$02
    beq wait_p
no_p:\n`;
  }
  if (hasAnim) {
    asm += `    ; --- Check Space key (row 7, col 4) ---
    lda #$7f
    sta $dc00
    lda $dc01
    and #$10
    bne no_space
    lda animPaused
    eor #1
    sta animPaused
wait_space:
    lda #$7f
    sta $dc00
    lda $dc01
    and #$10
    beq wait_space
no_space:\n`;
  }
  asm += `    lda #$ff
    sta $dc00
    rts
}\n`;
  return asm;
}

// PET/VIC-20: KERNAL GETIN ($FFE4) – only Space for pause
function checkKeysASM_GETIN(): string {
  return `
check_keys: {
    jsr $ffe4       ; KERNAL GETIN
    cmp #$20        ; space?
    bne no_space
    lda animPaused
    eor #1
    sta animPaused
no_space:
    rts
}
`;
}

// ── SID file parser
interface SidInfo {
  loadAddress: number;
  init: number;
  play: number;
  data: number[];
}

function parseSidFile(buf: Buffer): SidInfo {
  if (buf.length < 4) {
    throw new Error('SID/BIN file is too small.');
  }

  const magic = buf.toString('ascii', 0, 4);
  const isSid = magic === 'PSID' || magic === 'RSID';

  // Raw binary fallback: first two bytes are load address.
  if (!isSid) {
    if (buf.length < 3) {
      throw new Error('BIN/MUS file is missing load address and data.');
    }
    const loadAddress = buf[0] | (buf[1] << 8);
    return {
      loadAddress,
      init: loadAddress,
      play: loadAddress + 3,
      data: [...buf.slice(2)],
    };
  }

  if (buf.length < 0x7c) {
    throw new Error('SID file header is incomplete.');
  }

  const readWordBE = (o: number) => (buf[o] << 8) + buf[o + 1];
  const dataOffset = readWordBE(6);
  let loadAddress = readWordBE(8);
  const initAddress = readWordBE(10);
  const playAddress = readWordBE(12);

  let dataStart = dataOffset;
  if (loadAddress === 0) {
    if (dataOffset + 1 >= buf.length) {
      throw new Error('SID file data section is truncated.');
    }
    loadAddress = buf[dataOffset] | (buf[dataOffset + 1] << 8);
    dataStart += 2;
  }
  if (dataStart > buf.length) {
    throw new Error('SID file data offset is out of range.');
  }
  return {
    loadAddress,
    init: initAddress || loadAddress,
    play: playAddress || (loadAddress + 3),
    data: [...buf.slice(dataStart)],
  };
}

// Generate SID-related assembly lines from parsed SID info (no plugin needed)
function sidAsmHeader(sid: SidInfo): string {
  return `\n!let sid_startAddress = $${toHex8(sid.loadAddress >> 8)}${toHex8(sid.loadAddress & 0xFF)}
!let sid_init = $${toHex8(sid.init >> 8)}${toHex8(sid.init & 0xFF)}
!let sid_play = $${toHex8(sid.play >> 8)}${toHex8(sid.play & 0xFF)}`;
}

function sidAsmData(sid: SidInfo): string {
  return `\n* = sid_startAddress
sid_data:${bytesToCommaDelimited(sid.data, 16, true).join('')}`;
}

function getSongFilePath(songFile: string | string[] | undefined): string | null {
  if (Array.isArray(songFile)) {
    if (songFile.length === 0) return null;
    if (typeof songFile[0] !== 'string' || songFile[0] === '') return null;
    return path.resolve(songFile[0]);
  }
  if (typeof songFile === 'string' && songFile !== '') {
    return path.resolve(songFile);
  }
  return null;
}

function loadSidFromSongFile(songFile: string | string[] | undefined): SidInfo {
  const sidPath = getSongFilePath(songFile);
  if (!sidPath) {
    throw new Error('No SID file selected.');
  }
  return parseSidFile(fs.readFileSync(sidPath));
}

function simpleAssemble(source: string, macrosAsm: any) {
  const sourceFileMap: { [index: string]: string } = {
    'main.asm': source,
    'macros.asm': macrosAsm,
  };
  const options = {
    readFileSync: (fname: string) => {
      const key = fname.replace(/\\/g, '/');
      if (key in sourceFileMap) return Buffer.from(sourceFileMap[key]);
      if (fname in sourceFileMap) return Buffer.from(sourceFileMap[fname]);
      throw new Error(`File not found ${fname}`);
    }
  };
  return c64jasm.assemble('main.asm', options);
}

function sendPrgToUltimate(prgData: Buffer, ultimateAddress: string) {
  // Use Node's http module instead of browser fetch to avoid
  // macOS Chromium CORS/ATS restrictions on plain HTTP requests.
  const http = window.require('http');
  const url = new URL(ultimateAddress + '/v1/runners:run_prg');
  const options = {
    hostname: url.hostname,
    port: url.port || 80,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': prgData.length,
    },
  };
  const req = http.request(options, (res: any) => {
    let body = '';
    res.on('data', (chunk: any) => { body += chunk; });
    res.on('end', () => console.log('Ultimate:', body));
  });
  req.on('error', (error: any) => alert(`Ultimate send failed: ${error.message}`));
  req.write(prgData);
  req.end();
}

const savePlayer = (filename: string, fbs: FramebufWithFont[], fmt: FileFormatPlayerV1, ultimateAddress?: string) => {

  // Route by player type
  if (fmt.exportOptions.playerType === 'Animation') {
    const start = Math.max(0, parseInt(String(fmt.exportOptions.animStartFrame)) || 0);
    const end = Math.min(fbs.length - 1, parseInt(String(fmt.exportOptions.animEndFrame)) || fbs.length - 1);
    const animFbs = (start <= end) ? fbs.slice(start, end + 1) : fbs;
    return saveAnimationPlayer(filename, animFbs, fmt, ultimateAddress);
  }
  if (fmt.exportOptions.playerType === 'Long Scroll') {
    return saveScrollPlayerEnhanced(filename, fbs, fmt, 'vertical', ultimateAddress);
  }
  if (fmt.exportOptions.playerType === 'Wide Pan') {
    return saveScrollPlayerEnhanced(filename, fbs, fmt, 'horizontal', ultimateAddress);
  }

  const appPath = electron.remote.app.getAppPath()
  var source: string = "";
  var music = fmt.exportOptions.music;
  let sid: SidInfo | null = null;
  if (music) {
    try {
      sid = loadSidFromSongFile(fmt.exportOptions.songFile);
    } catch (e: any) {
      alert(`Unable to load SID file:\n${e.message}`);
      return;
    }
  }
  var macrosAsm
  var lines: string[] = [];
if(fmt.exportOptions.computer==='c64')
{
      macrosAsm = fs.readFileSync(path.resolve(appPath, "assets/macrosc64.asm"))

      const fb = fbs[fmt.commonExportParams.selectedFramebufIndex]
      const { width, height, framebuf, backgroundColor, borderColor, name } = fb;

      lines = [];
      lines.push(`${maybeLabelName(name)}:\n`);

      let bytes = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          bytes.push(framebuf[y][x].code);
        }
      }
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          bytes.push(framebuf[y][x].color);
        }
      }

      lines.push(`!byte ${borderColor},${backgroundColor}`);
      lines.push(...bytesToCommaDelimited(bytes, width, true));


      let charsetBits;
      switch (fb.charset) {
        case 'upper': charsetBits = " lda #$15 \n sta $d018 \n"; break;
        case 'lower': charsetBits = " lda #$17 \n sta $d018 \n"; break;
        default: charsetBits = `%00010000 | ((${maybeLabelName(name)}_font/2048)*2)`; break;
      }

      const sidHdr = sid ? sidAsmHeader(sid) : undefined;
      const sidDat = sid ? sidAsmData(sid) : undefined;
      source = singleFrameASM(fmt.exportOptions.computer,music, true, maybeLabelName(name), charsetBits, lines, sidHdr, sidDat);
    }

    else if(fmt.exportOptions.computer==='pet4032')
      {


      macrosAsm = fs.readFileSync(path.resolve(appPath, "assets/macrosPET4032.asm"))

      const fb = fbs[fmt.commonExportParams.selectedFramebufIndex]
      const { width, height, framebuf, backgroundColor, borderColor, name } = fb;
      lines = [];

      lines.push(`${maybeLabelName(name)}:\n`);

      let bytes = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          bytes.push(framebuf[y][x].code);
        }
      }

      lines.push(`!byte ${borderColor},${backgroundColor}`);
      lines.push(...bytesToCommaDelimited(bytes, width, true));

      let charsetBits;
      switch (fb.charset) {

        case 'petGfx': charsetBits = " lda #12 \n sta $e84c \n"; break;
        case 'petBiz': charsetBits = " lda #14 \n sta $e84c \n"; break;

        default: charsetBits = `%00010000 | ((${maybeLabelName(name)}_font/2048)*2)`; break;
      }
      //overriding music mode until I find a player..
      music = false;
      source = singleFrameASM(fmt.exportOptions.computer,music, false, maybeLabelName(name), charsetBits, lines, undefined);
  }
  else if(fmt.exportOptions.computer==='pet8032')
    {
      macrosAsm = fs.readFileSync(path.resolve(appPath, "assets/macrosPET8032.asm"))

      const fb = fbs[fmt.commonExportParams.selectedFramebufIndex]
      const { width, height, framebuf, backgroundColor, borderColor, name } = fb;
      lines = [];

      lines.push(`${maybeLabelName(name)}:\n`);

      let bytes = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          bytes.push(framebuf[y][x].code);
        }
      }

      lines.push(`!byte ${borderColor},${backgroundColor}`);
      lines.push(...bytesToCommaDelimited(bytes, width, true));

      let charsetBits;
      switch (fb.charset) {
        case 'petGfx': charsetBits = " lda #12 \n sta $e84c \n"; break;
        case 'petBiz': charsetBits = " lda #14 \n sta $e84c \n"; break;
        default: charsetBits = " lda #12 \n sta $e84c \n"; break;
      }
      music = false;
      source = singleFramePET8032ASM(maybeLabelName(name), charsetBits, lines);
  }
else if(fmt.exportOptions.computer==='c128')
    {


    macrosAsm = fs.readFileSync(path.resolve(appPath, "assets/macrosc128.asm"))

    const fb = fbs[fmt.commonExportParams.selectedFramebufIndex]
    const { width, height, framebuf, backgroundColor, borderColor, name } = fb;
    lines= [];

    lines.push(`${maybeLabelName(name)}:\n`);

    let bytes = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        bytes.push(framebuf[y][x].code);
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        bytes.push(framebuf[y][x].color);
      }
    }

    lines.push(`!byte ${borderColor},${backgroundColor}`);
    lines.push(...bytesToCommaDelimited(bytes, width, true));


    let charsetBits;
    switch (fb.charset) {
      case 'c128Upper': charsetBits = " lda #$15 \n sta $d018 \n sta $0a2c \n"; break;
      case 'c128Lower': charsetBits = " lda #$17 \n sta $d018 \n sta $0a2c \n"; break;
      default: charsetBits = `%00010000 | ((${maybeLabelName(name)}_font/2048)*2)`; break;
    }

    const sidHdr128 = sid ? sidAsmHeader(sid) : undefined;
    const sidDat128 = sid ? sidAsmData(sid) : undefined;
    source = singleFrameASM(fmt.exportOptions.computer,music, true, maybeLabelName(name), charsetBits, lines, sidHdr128, sidDat128);

}
else if(fmt.exportOptions.computer==='c128vdc')
  {
    macrosAsm = fs.readFileSync(path.resolve(appPath, "assets/macrosC128VDC.asm"))

    const fb = fbs[fmt.commonExportParams.selectedFramebufIndex]
    const { width, height, framebuf, backgroundColor, borderColor, name } = fb;
    lines = [];

    lines.push(`${maybeLabelName(name)}:\n`);

    // Screen codes (2000 bytes for 80x25)
    let bytes = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        bytes.push(framebuf[y][x].code);
      }
    }
    // VDC attribute bytes (color in low nibble)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        bytes.push(framebuf[y][x].color & 0x0f);
      }
    }

    // First two bytes: borderColor (unused on VDC, stored for compat), backgroundColor
    lines.push(`!byte ${borderColor},${backgroundColor}`);
    lines.push(...bytesToCommaDelimited(bytes, width, true));

    // VDC has no charset switching register like $D018;
    // the character set is already in VDC RAM from boot.
    // We just pass an empty string for charsetBits.
    let charsetBits = '';

    music = false;
    source = singleFrameC128VDCASM(maybeLabelName(name), charsetBits, lines);
}
else if(fmt.exportOptions.computer==='c16')
  {
    macrosAsm = fs.readFileSync(path.resolve(appPath, "assets/macrosC16.asm"))

    const fb = fbs[fmt.commonExportParams.selectedFramebufIndex]
    const { width, height, framebuf, backgroundColor, borderColor, name } = fb;

    lines = [];
    lines.push(`${maybeLabelName(name)}:\n`);

    let bytes = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        bytes.push(framebuf[y][x].code);
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        bytes.push(framebuf[y][x].color);
      }
    }

    lines.push(`!byte ${borderColor},${backgroundColor}`);
    lines.push(...bytesToCommaDelimited(bytes, width, true));

    let charsetBits;
    switch (fb.charset) {
      case 'c16Lower': charsetBits = " lda $ff13 \n ora #$04 \n sta $ff13 \n"; break;
      case 'c16Upper': charsetBits = " lda $ff13 \n and #$fb \n sta $ff13 \n"; break;
      default: charsetBits = " lda $ff13 \n and #$fb \n sta $ff13 \n"; break;
    }

    music = false;  // No SID on C16/Plus4
    source = singleFrameC16ASM(fmt.exportOptions.computer, true, maybeLabelName(name), charsetBits, lines);
}
else if(fmt.exportOptions.computer==='vic20')
  {


  macrosAsm = fs.readFileSync(path.resolve(appPath, "assets/macrosvic20.asm"))

  const fb = fbs[fmt.commonExportParams.selectedFramebufIndex]
  const { width, height, framebuf, backgroundColor, borderColor, name } = fb;
  lines = [];

  var vic20BGBColor = (backgroundColor * 16)+borderColor+8
  lines.push(`!byte ${vic20BGBColor},${vic20BGBColor}`);
  lines.push(`\n${maybeLabelName(name)}Chars:\n`);

  let bytesChar = [];
  let bytesColour = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      bytesChar.push(framebuf[y][x].code);
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      bytesColour.push(framebuf[y][x].color);

    }
  }


  lines.push(...bytesToCommaDelimited(bytesChar, width, true));
  lines.push(`\n${maybeLabelName(name)}Colours:\n`);
  lines.push(...bytesToCommaDelimited(bytesColour, width, true));




  let charsetBits;
  switch (fb.charset) {
    case 'vic20Upper': charsetBits = " lda #$f0 \n sta $9005 \n"; break;
    case 'vic20Lower': charsetBits = " lda #$f2 \n sta $9005 \n"; break;
    default: charsetBits = " lda #$f0 \n sta $9005 \n"; break;
  }



  source = singleFrameVic20ASM(fmt.exportOptions.computer,music, true, maybeLabelName(name), charsetBits, lines);

}






  const res = simpleAssemble(source, macrosAsm);

  if (res.errors.length !== 0) {
    const errMsgs = res.errors.map((e: any) => typeof e === 'string' ? e : JSON.stringify(e)).join('\n');
    console.error('c64jasm assembly errors:', res.errors);
    alert(`Player export failed:\n${errMsgs}`);
    return;
  }

  try {
    fs.writeFileSync(filename, res.prg, null)
    if (fmt.exportOptions.sendToUltimate && ultimateAddress) {
      sendPrgToUltimate(res.prg, ultimateAddress);
    }
  } catch (e) {
    alert(`Failed to save file '${filename}'!`)
    console.error(e)
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Animation Player Export (RLE + Nibble Packed) — All Platforms
// ═══════════════════════════════════════════════════════════════════

interface AnimPlatformConfig {
  macrosFile: string;       // e.g. 'macrosc64.asm'
  hasColor: boolean;        // has color RAM?
  hasRasterIRQ: boolean;    // VIC-II raster IRQ available?
  canSID: boolean;          // SID chip present?
  dataStartAddr: string;    // hex address for frame data origin
  bankingCode: string;      // code to bank out kernal, or ''
  screenBytes: number;      // screen size in bytes (w*h)
  colorPackedBytes: number; // nibble-packed color byte count, 0 if no color
  charsetSetup: (charset: string) => string;
  borderBgSetup: string;    // asm for show_frame border/bg; uses frame_border,x etc.
  frameMeta: (fb: FramebufWithFont) => { borderVal: number; bgVal: number };
}

const ANIM_PLATFORMS: Record<string, AnimPlatformConfig> = {
  c64: {
    macrosFile: 'macrosc64.asm',
    hasColor: true, hasRasterIRQ: true, canSID: true,
    dataStartAddr: '$2000',
    bankingCode: '    lda #$35\n    sta $01',
    screenBytes: 1000, colorPackedBytes: 500,
    charsetSetup: (cs) => {
      switch (cs) {
        case 'lower': return 'lda #$17\n    sta $d018';
        default:      return 'lda #$15\n    sta $d018';
      }
    },
    borderBgSetup: `    lda frame_border,x
    sta $d020
    lda frame_bg,x
    sta $d021`,
    frameMeta: (fb) => ({ borderVal: fb.borderColor, bgVal: fb.backgroundColor }),
  },
  c128: {
    macrosFile: 'macrosc128.asm',
    hasColor: true, hasRasterIRQ: true, canSID: false,
    dataStartAddr: '$2000',
    bankingCode: '    lda #$35\n    sta $01',
    screenBytes: 1000, colorPackedBytes: 500,
    charsetSetup: (cs) => {
      switch (cs) {
        case 'c128Lower': return 'lda #$17\n    sta $d018\n    sta $0a2c';
        default:          return 'lda #$15\n    sta $d018\n    sta $0a2c';
      }
    },
    borderBgSetup: `    lda frame_border,x
    sta $d020
    lda frame_bg,x
    sta $d021`,
    frameMeta: (fb) => ({ borderVal: fb.borderColor, bgVal: fb.backgroundColor }),
  },
  pet4032: {
    macrosFile: 'macrosPET4032.asm',
    hasColor: false, hasRasterIRQ: false, canSID: false,
    dataStartAddr: '$0800',
    bankingCode: '',
    screenBytes: 1000, colorPackedBytes: 0,
    charsetSetup: (cs) => {
      switch (cs) {
        case 'petBiz': return 'lda #14\n    sta $e84c';
        default:       return 'lda #12\n    sta $e84c';
      }
    },
    borderBgSetup: '',  // PET has no border/bg registers
    frameMeta: (_fb) => ({ borderVal: 0, bgVal: 0 }),
  },
  pet8032: {
    macrosFile: 'macrosPET8032.asm',
    hasColor: false, hasRasterIRQ: false, canSID: false,
    dataStartAddr: '$0800',
    bankingCode: '',
    screenBytes: 2000, colorPackedBytes: 0,
    charsetSetup: (cs) => {
      switch (cs) {
        case 'petBiz': return 'lda #14\n    sta $e84c';
        default:       return 'lda #12\n    sta $e84c';
      }
    },
    borderBgSetup: '',
    frameMeta: (_fb) => ({ borderVal: 0, bgVal: 0 }),
  },
  c16: {
    macrosFile: 'macrosC16.asm',
    hasColor: true, hasRasterIRQ: true, canSID: false,
    dataStartAddr: '$2000',
    bankingCode: '',  // TED uses $FF3E/$FF3F, handled in macros
    screenBytes: 1000, colorPackedBytes: 500,
    charsetSetup: (cs) => {
      switch (cs) {
        case 'c16Lower': return 'lda $ff13\n    ora #$04\n    sta $ff13';
        default:         return 'lda $ff13\n    and #$fb\n    sta $ff13';
      }
    },
    borderBgSetup: `    lda frame_border,x
    sta $ff19
    lda frame_bg,x
    sta $ff15`,
    frameMeta: (fb) => ({ borderVal: fb.borderColor, bgVal: fb.backgroundColor }),
  },
};

// VIC-20 RAM expansion → data start address lookup
const VIC20_DATA_ADDR: Record<string, string> = {
  'unexpanded': '$1200',  // $1200-$1DFF  ~3KB
  '3k':         '$0400',  // $0400-$0FFF  ~3KB (+ $1200-$1DFF via code)
  '8k':         '$1200',  // $1200-$3FFF  ~11KB
  '16k':        '$1200',  // $1200-$5FFF  ~19KB
  '24k':        '$1200',  // $1200-$7FFF  ~27KB
};

function getVic20Config(vic20RAM: string): AnimPlatformConfig {
  return {
    macrosFile: 'macrosvic20.asm',
    hasColor: true, hasRasterIRQ: false, canSID: false,
    dataStartAddr: VIC20_DATA_ADDR[vic20RAM] || '$1200',
    bankingCode: '',
    screenBytes: 506, colorPackedBytes: 253,  // 22×23
    charsetSetup: (cs) => {
      switch (cs) {
        case 'vic20Lower': return 'lda #$f2\n    sta $9005';
        default:           return 'lda #$f0\n    sta $9005';
      }
    },
    borderBgSetup: `    lda frame_border,x
    sta $900f`,
    frameMeta: (fb) => ({ borderVal: (fb.backgroundColor * 16) + fb.borderColor + 8, bgVal: 0 }),
  };
}

function saveAnimationPlayer(filename: string, fbs: FramebufWithFont[], fmt: FileFormatPlayerV1, ultimateAddress?: string) {
  const appPath = electron.remote.app.getAppPath();
  const computer = fmt.exportOptions.computer;
  const cfg = computer === 'vic20'
    ? getVic20Config(fmt.exportOptions.vic20RAM || 'unexpanded')
    : ANIM_PLATFORMS[computer];
  if (!cfg) {
    alert(`Animation not supported for platform: ${computer}`);
    return;
  }

  const music = cfg.canSID && fmt.exportOptions.music;
  const fps = fmt.exportOptions.playerFPS || 10;
  const animSpeed = fpsToVblanks(fps);
  const numFrames = fbs.length;
  let sid: SidInfo | null = null;
  if (music) {
    try {
      sid = loadSidFromSongFile(fmt.exportOptions.songFile);
    } catch (e: any) {
      alert(`Unable to load SID file:\n${e.message}`);
      return;
    }
  }

  const macrosAsm = fs.readFileSync(path.resolve(appPath, `assets/${cfg.macrosFile}`));

  // ── Process frames ──
  interface ProcessedFrame { borderVal: number; bgVal: number; rleScreen: number[]; packedColors: number[]; charset: string; }

  const processed: ProcessedFrame[] = fbs.map(fb => {
    const { width, height, framebuf, charset } = fb;
    const screenCodes: number[] = [];
    const colorValues: number[] = [];
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        screenCodes.push(framebuf[y][x].code);
        if (cfg.hasColor) colorValues.push(framebuf[y][x].color);
      }
    const meta = cfg.frameMeta(fb);
    return {
      ...meta,
      rleScreen: rleEncode(screenCodes),
      packedColors: cfg.hasColor ? nibblePack(colorValues) : [],
      charset,
    };
  });

  const charsetBits = cfg.charsetSetup(processed[0].charset);

  // ── Build compressed data section ──
  let frameDataAsm = '';
  for (let i = 0; i < processed.length; i++) {
    frameDataAsm += `\nframe${i}_scr:`;
    frameDataAsm += bytesToCommaDelimited(processed[i].rleScreen, 16, true).join('');
    if (cfg.hasColor) {
      frameDataAsm += `\nframe${i}_col:`;
      frameDataAsm += bytesToCommaDelimited(processed[i].packedColors, 16, true).join('');
    }
  }

  // ── Lookup tables ──
  const borders = processed.map(f => f.borderVal).join(',');
  const bgs     = processed.map(f => f.bgVal).join(',');
  const scrLos  = processed.map((_, i) => `frame${i}_scr & $ff`).join(',');
  const scrHis  = processed.map((_, i) => `frame${i}_scr >> 8`).join(',');
  const colLos  = cfg.hasColor ? processed.map((_, i) => `frame${i}_col & $ff`).join(',') : '';
  const colHis  = cfg.hasColor ? processed.map((_, i) => `frame${i}_col >> 8`).join(',') : '';

  // Remain bytes for decoders (hex)
  const scrRemainLo = `$${(cfg.screenBytes & 0xFF).toString(16).padStart(2,'0')}`;
  const scrRemainHi = `$${((cfg.screenBytes >> 8) & 0xFF).toString(16).padStart(2,'0')}`;
  const colRemainLo = `$${(cfg.colorPackedBytes & 0xFF).toString(16).padStart(2,'0')}`;
  const colRemainHi = `$${((cfg.colorPackedBytes >> 8) & 0xFF).toString(16).padStart(2,'0')}`;

  // ── show_frame: color section ──
  const showFrameColorSection = cfg.hasColor ? `
    ldx currentFrame
    lda frame_col_lo,x
    sta zp_src
    lda frame_col_hi,x
    sta zp_src+1
    lda #<COLOR
    sta zp_dst
    lda #>COLOR
    sta zp_dst+1
    lda #${colRemainLo}
    sta zp_remain
    lda #${colRemainHi}
    sta zp_remain+1
    jsr nibble_decode` : '';

  // ── IRQ-based timing (C64/C128) vs delay-loop (PET/VIC-20) ──
  let entryTimingSetup: string;
  let mainLoop: string;
  let irqAndTimingRoutines: string;

  if (cfg.hasRasterIRQ) {
    entryTimingSetup = `
${music ? '    lda #0' : ''}
${music ? '    jsr sid_init' : ''}

    sei
${cfg.bankingCode}
    +setup_irq(irq_top, irq_top_line)
    cli`;

    mainLoop = `
main_loop:
    lda frameCount
vsync_wait:
    cmp frameCount
    beq vsync_wait
    jsr check_keys
    lda animPaused
    bne main_loop
    dec delayCounter
    bne main_loop
    lda #ANIM_SPEED
    sta delayCounter`;

    irqAndTimingRoutines = `
irq_top: {
    +irq_start(end)
    inc frameCount
!if (debug_build) {
    inc $d020
}
${music ? `    lda musicMuted
    bne skip_music
    jsr sid_play
skip_music:` : ''}
!if (debug_build) {
    dec $d020
}
    +irq_end(irq_top, irq_top_line)
end:
}

frameCount:     !byte 0`;
  } else {
    // No raster IRQ — use busy-wait delay loop
    entryTimingSetup = cfg.bankingCode ? `\n${cfg.bankingCode}` : '';

    mainLoop = `
main_loop:
    jsr delay_frames
    jsr check_keys
    lda animPaused
    bne main_loop`;

    irqAndTimingRoutines = `
; Busy-wait delay (~1 frame ≈ 16667 cycles at 1 MHz per unit)
delay_frames: {
    ldx #ANIM_SPEED
wait:
    ldy #14
mid:
    lda #0
inner:
    sec
    sbc #1
    bne inner
    dey
    bne mid
    dex
    bne wait
    rts
}`;
  }

  // ── Full assembly source ──
  const source = `
; Petmate9 Animation Player (${computer}) – RLE + Nibble Packed
; Frames: ${numFrames}   Speed: ${animSpeed} delay units/frame (${fps} fps)
!include "macros.asm"
${sid ? sidAsmHeader(sid) : ''}

${cfg.hasRasterIRQ ? '!let irq_top_line  = 1' : ''}
${cfg.hasRasterIRQ ? '!let debug_build   = FALSE' : ''}
!let ANIM_FRAMES   = ${numFrames}
!let ANIM_SPEED    = ${animSpeed}
!let RLE_MARKER    = $fe

!let zp_src        = $20
!let zp_dst        = $22
!let zp_remain     = $24
!let zp_rle_val    = $26

+basic_start(entry)

entry: {
${entryTimingSetup}

    ${charsetBits}

    lda #0
    sta currentFrame
${cfg.hasRasterIRQ ? '    lda #1\n    sta delayCounter' : ''}

    jsr show_frame
${mainLoop}

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

show_frame: {
    ldx currentFrame
${cfg.borderBgSetup}

    lda frame_scr_lo,x
    sta zp_src
    lda frame_scr_hi,x
    sta zp_src+1
    lda #<SCREEN
    sta zp_dst
    lda #>SCREEN
    sta zp_dst+1
    lda #${scrRemainLo}
    sta zp_remain
    lda #${scrRemainHi}
    sta zp_remain+1
    jsr rle_decode
${showFrameColorSection}
    rts
}

rle_decode: {
    ldy #0
next:
    lda zp_remain
    ora zp_remain+1
    beq done
    lda (zp_src),y
    inc zp_src
    bne s1
    inc zp_src+1
s1: cmp #RLE_MARKER
    beq escape
    sta (zp_dst),y
    inc zp_dst
    bne d1
    inc zp_dst+1
d1: lda zp_remain
    bne r1
    dec zp_remain+1
r1: dec zp_remain
    jmp next
escape:
    lda (zp_src),y
    inc zp_src
    bne s2
    inc zp_src+1
s2: beq literal_fe
    tax
    lda (zp_src),y
    inc zp_src
    bne s3
    inc zp_src+1
s3: sta zp_rle_val
fill:
    lda zp_rle_val
    sta (zp_dst),y
    inc zp_dst
    bne d2
    inc zp_dst+1
d2: lda zp_remain
    bne r2
    dec zp_remain+1
r2: dec zp_remain
    dex
    bne fill
    jmp next
literal_fe:
    lda #RLE_MARKER
    sta (zp_dst),y
    inc zp_dst
    bne d3
    inc zp_dst+1
d3: lda zp_remain
    bne r3
    dec zp_remain+1
r3: dec zp_remain
    jmp next
done:
    rts
}

${cfg.hasColor ? `nibble_decode: {
    ldy #0
next:
    lda zp_remain
    ora zp_remain+1
    beq done
    lda (zp_src),y
    inc zp_src
    bne s1
    inc zp_src+1
s1: pha
    lsr
    lsr
    lsr
    lsr
    sta (zp_dst),y
    inc zp_dst
    bne d1
    inc zp_dst+1
d1: pla
    and #$0f
    sta (zp_dst),y
    inc zp_dst
    bne d2
    inc zp_dst+1
d2: lda zp_remain
    bne r1
    dec zp_remain+1
r1: dec zp_remain
    jmp next
done:
    rts
}` : ''}

${irqAndTimingRoutines}

currentFrame:   !byte 0
${cfg.hasRasterIRQ ? 'delayCounter:   !byte 0' : ''}
${music ? 'musicMuted:     !byte 0' : ''}
animPaused:     !byte 0

${cfg.hasRasterIRQ ? checkKeysASM_CIA(music as boolean, true) : checkKeysASM_GETIN()}

frame_border: !byte ${borders}
frame_bg:     !byte ${bgs}
frame_scr_lo: !byte ${scrLos}
frame_scr_hi: !byte ${scrHis}
${cfg.hasColor ? `frame_col_lo: !byte ${colLos}` : ''}
${cfg.hasColor ? `frame_col_hi: !byte ${colHis}` : ''}

${sid ? sidAsmData(sid) : ''}

* = ${cfg.dataStartAddr}
${frameDataAsm}

`;

  const res = simpleAssemble(source, macrosAsm);
  if (res.errors.length !== 0) {
    const errMsgs = res.errors.map((e: any) => typeof e === 'string' ? e : JSON.stringify(e)).join('\n');
    console.error('c64jasm assembly errors:', res.errors);
    alert(`Animation player export failed:\n${errMsgs}`);
    return;
  }

  try {
    fs.writeFileSync(filename, res.prg, null);
    if (fmt.exportOptions.sendToUltimate && ultimateAddress) {
      sendPrgToUltimate(res.prg, ultimateAddress);
    }
  } catch (e) {
    alert(`Failed to save file '${filename}'!`);
    console.error(e);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Smooth Scroll Player (Vertical / Horizontal) — Double Buffered
// ═══════════════════════════════════════════════════════════════════

function saveScrollPlayer(
  filename: string, fbs: FramebufWithFont[], fmt: FileFormatPlayerV1,
  direction: 'vertical' | 'horizontal', ultimateAddress?: string
) {
  const appPath = electron.remote.app.getAppPath();
  const fb = fbs[fmt.commonExportParams.selectedFramebufIndex];
  const { width, height, framebuf, backgroundColor, borderColor, charset } = fb;
  const music = fmt.exportOptions.music && fmt.exportOptions.computer === 'c64';
  const fps = fmt.exportOptions.playerFPS || 60;
  const scrollSpeed = fpsToVblanks(fps);
  let sid: SidInfo | null = null;
  if (music) {
    try {
      sid = loadSidFromSongFile(fmt.exportOptions.songFile);
    } catch (e: any) {
      alert(`Unable to load SID file:\n${e.message}`);
      return;
    }
  }

  const macrosAsm = fs.readFileSync(path.resolve(appPath, 'assets/macrosc64.asm'));

  // Extract uncompressed data
  const screenCodes: number[] = [];
  const colorValues: number[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      screenCodes.push(framebuf[y][x].code);
      colorValues.push(framebuf[y][x].color);
    }

  const SCR_DATA = 0x2000;
  const COL_DATA = SCR_DATA + screenCodes.length;
  // Charset $D018 values for double buffer.
  // Buf B MUST be below $1000: in VIC bank 0 the range $1000..$1FFF is
  // the character-ROM ghost, so the VIC reads glyph ROM there instead of
  // the RAM we write. Row tables are therefore emitted AFTER the commit
  // routines (at the tail of the PRG) so they don't collide with buf B.
  const csBits = (charset === 'lower') ? 0x07 : 0x05;
  const D018_A = 0x10 | csBits;  // $0400
  const D018_B = 0x30 | csBits;  // $0C00
  const platformLabel = 'C64';
  const runtimeBankingAsm = `    lda #$35
    sta $01`;
  const d018StoreAsm = `    sta $d018`;

  const screenDataAsm = bytesToCommaDelimited(screenCodes, width, true).join('');
  const colorDataAsm  = bytesToCommaDelimited(colorValues, width, true).join('');
  const tblHex = (a: number[]) => a.map(v => `$${toHex8(v)}`).join(',');

  // ── Split-buffer color commit (see test scripts for full rationale) ──
  // Two chained raster IRQs write $D800 directly (no shadow buffer).
  //   irq_bottom (raster 251): frame N-1 lower border, commits the lower block.
  //   irq_top    (raster   1): frame N upper border, swaps $D018 and
  //                            raster-chases the upper block into $D800.
  // Staying ahead of the beam, the new char matrix and the new color
  // matrix come on-screen together on the same frame.
  const IRQ_BOTTOM_LINE  = 251;
  const TOP_COMMIT_ROWS_H = 18;   // horizontal split (rows 0..17 top / 18..24 bottom)
  const hex4 = (v: number) => v.toString(16).toUpperCase().padStart(4, '0');
  // 40 unrolled lda (zp_cmt_src),y / sta ABS,y pairs with 39 dey's between.
  // zp_cmt_src is separate from zp_src so a commit firing mid-char-copy
  // won't corrupt copy_row's indirect source pointer.
  const genUnrolledRow = (destHex: string): string => {
    const L: string[] = [];
    for (let i = 0; i < 40; i++) {
      L.push(`    lda (zp_cmt_src),y`);
      L.push(`    sta ${destHex},y`);
      if (i < 39) L.push(`    dey`);
    }
    return L.join('\n');
  };
  // Unrolled char copy_row (indirect src → indirect dst), used by
  // copy_window_screen in main_loop. Unroll drops ~3000 cyc off the
  // 25-row char copy so it finishes before raster 251.
  const unrolledCopyRow = (() => {
    const L: string[] = [];
    for (let i = 0; i < 40; i++) {
      L.push(`    lda (zp_src),y`);
      L.push(`    sta (zp_dst),y`);
      if (i < 39) L.push(`    dey`);
    }
    return L.join('\n');
  })();

  let source: string;

  if (direction === 'vertical') {
    // ── Vertical scroll ──
    const VISIBLE = 25;
    const MAX_SCROLL = height - VISIBLE;
    if (MAX_SCROLL <= 0) { alert('Frame must be taller than 25 rows for Long Scroll.'); return; }
    // Row-18 boundary fix: commit row 18 in irq_top.
    const TOP_COMMIT_ROWS_V = 19; // rows 0..18
    const BOT_COMMIT_ROWS_V = VISIBLE - TOP_COMMIT_ROWS_V; // rows 19..24
    if (TOP_COMMIT_ROWS_V + BOT_COMMIT_ROWS_V !== VISIBLE) {
      throw new Error('TOP_COMMIT_ROWS_V + BOT_COMMIT_ROWS_V must equal VISIBLE');
    }

    const scrRowLo: number[] = [], scrRowHi: number[] = [];
    const colRowLo: number[] = [], colRowHi: number[] = [];
    for (let r = 0; r < height; r++) {
      const sa = SCR_DATA + r * width; const ca = COL_DATA + r * width;
      scrRowLo.push(sa & 0xFF); scrRowHi.push((sa >> 8) & 0xFF);
      colRowLo.push(ca & 0xFF); colRowHi.push((ca >> 8) & 0xFF);
    }
    const sdLo: number[] = [], sdHi: number[] = [], cdLo: number[] = [], cdHi: number[] = [];
    for (let r = 0; r < VISIBLE; r++) {
      const sa = 0x0400 + r * 40; const ca = 0xD800 + r * 40;
      sdLo.push(sa & 0xFF); sdHi.push((sa >> 8) & 0xFF);
      cdLo.push(ca & 0xFF); cdHi.push((ca >> 8) & 0xFF);
    }

    // Generate the unrolled commit routines. X holds a running
    // source-row index; each row pulls a pointer into zp_cmt_src from
    // col_row_lo/hi,x then unrolls 40 bytes to $D800+row*40,y.
    let vCommitWrapLabelCounter = 0;
    const genVCommitRow = (destBase: number): string => {
      const wrapLabel = `cmt_v_row_wrap_ok_${vCommitWrapLabelCounter++}`;
      const prelude = [
        `    lda col_row_lo,x`,
        `    sta zp_cmt_src`,
        `    lda col_row_hi,x`,
        `    sta zp_cmt_src+1`,
        `    inx`,
        `    cpx #TOTAL_ROWS`,
        `    bcc ${wrapLabel}`,
        `    ldx #0`,
        `${wrapLabel}:`,
        `    ldy #39`,
      ].join('\n');
      return prelude + '\n' + genUnrolledRow(`$${hex4(destBase)}`);
    };
    let commitTopAsm = `commit_colors_top: {\n    ldx scrollRow\n`;
    for (let r = 0; r < TOP_COMMIT_ROWS_V; r++) {
      commitTopAsm += genVCommitRow(0xD800 + r * 40) + '\n';
    }
    commitTopAsm += `    rts\n}`;
    let commitBotAsm = `commit_colors_bottom: {\n    lda scrollRow\n    clc\n    adc #${TOP_COMMIT_ROWS_V}\n    tax\n`;
    for (let r = TOP_COMMIT_ROWS_V; r < VISIBLE; r++) {
      commitBotAsm += genVCommitRow(0xD800 + r * 40) + '\n';
    }
    commitBotAsm += `    rts\n}`;

    source = `
; Petmate9 Vertical Smooth Scroller (${platformLabel}) — Double Buffered
!include "macros.asm"
${sid ? sidAsmHeader(sid) : ''}
!let irq_top_line    = 1
!let irq_bottom_line = ${IRQ_BOTTOM_LINE}
!let debug_build     = FALSE
!let TOTAL_ROWS      = ${height}
!let VISIBLE_ROWS    = ${VISIBLE}
!let MAX_SCROLL      = ${MAX_SCROLL}
!let ROW_WIDTH       = ${width}
!let SCROLL_SPEED    = ${scrollSpeed}
!let D018_A          = $${toHex8(D018_A)}
!let D018_B          = $${toHex8(D018_B)}
!let zp_src          = $20
!let zp_dst          = $22
!let zp_src_row      = $24
!let zp_vis_row      = $25
!let zp_cmt_src      = $26     ; dedicated commit-source pointer (IRQ-safe)
+basic_start(entry)
entry: {
${music ? '    lda #0\n    jsr sid_init' : ''}
    sei
${runtimeBankingAsm}
    +setup_irq(irq_top, irq_top_line)
    cli
    lda #${borderColor}
    sta $d020
    lda #${backgroundColor}
    sta $d021
    lda #7
    sta scrollFine
    lda #0
    sta scrollRow
    sta displayBuf
    sta workBufOffset
    sta coarsePhase
    lda #SCROLL_SPEED
    sta delayCounter
    jsr copy_window_screen
    jsr copy_window_color
    lda #$08           ; buf B at $0C00
    sta workBufOffset
    jsr copy_window_screen
    lda #$00
    sta workBufOffset
    lda #$17
    sta nextD011
    sta $d011
    lda #D018_A
    sta nextD018
${d018StoreAsm}
main_loop:
    lda vsyncFlag
    beq main_loop
    lda #0
    sta vsyncFlag
    jsr check_keys
    lda animPaused
    bne main_loop
    dec delayCounter
    bne main_loop
    lda #SCROLL_SPEED
    sta delayCounter
    dec scrollFine
    bpl prep_fine
    lda #7
    sta scrollFine
    inc scrollRow
    lda scrollRow
    cmp #MAX_SCROLL
    bcc do_coarse
    lda #0
    sta scrollRow
do_coarse:
    lda displayBuf
    bne work_a
    lda #$08           ; buf B at $0C00
    jmp set_w
work_a:
    lda #$00
set_w:
    sta workBufOffset
    ; Flip displayBuf + queue $D018 swap and arm coarsePhase BEFORE the
    ; big char copy. If the lower-border IRQ fires mid-copy, it will see
    ; coarsePhase=1 and commit the bottom rows safely (it uses zp_cmt_src,
    ; separate from copy_row's zp_src).
    lda displayBuf
    eor #1
    sta displayBuf
    beq sw_a
    lda #D018_B
    jmp q_sw
sw_a:
    lda #D018_A
q_sw:
    sta nextD018
    lda #1
    sta coarsePhase
    ; Now run the ~15,000-cyc char copy. Color RAM is NOT touched here;
    ; the IRQ chain commits $D800 across frame N-1 lower border +
    ; frame N upper border.
    jsr copy_window_screen
prep_fine:
    lda #$10
    ora scrollFine
    sta nextD011
    jmp main_loop
}
    lda scrollRow
    sta zp_src_row
    lda #0
    sta zp_vis_row
rl: ldx zp_src_row
    lda scr_row_lo,x
    sta zp_src
    lda scr_row_hi,x
    sta zp_src+1
    ldx zp_vis_row
    lda sd_lo,x
    sta zp_dst
    lda sd_hi,x
    clc
    adc workBufOffset
    sta zp_dst+1
    jsr copy_row
    inc zp_src_row
    inc zp_vis_row
    lda zp_vis_row
    cmp #VISIBLE_ROWS
    bne rl
    rts
}
; copy_window_color — initial $D800 fill only (during entry)
copy_window_color: {
    lda scrollRow
    sta zp_src_row
    lda #0
    sta zp_vis_row
rl: ldx zp_src_row
    lda col_row_lo,x
    sta zp_src
    lda col_row_hi,x
    sta zp_src+1
    ldx zp_vis_row
    lda cd_lo,x
    sta zp_dst
    lda cd_hi,x
    sta zp_dst+1
    jsr copy_row
    inc zp_src_row
    inc zp_vis_row
    lda zp_vis_row
    cmp #VISIBLE_ROWS
    bne rl
    rts
}
; copy_row — unrolled indirect-indexed 40-byte copy (12 cyc/byte).
copy_row: {
    ldy #39
${unrolledCopyRow}
    rts
}
; irq_top — upper border (raster 1)
irq_top: {
    +irq_start(end)
    lda nextD011
    sta $d011
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
${music ? `    lda musicMuted
    bne skip_music
    jsr sid_play
skip_music:` : ''}
    +irq_end(irq_bottom, irq_bottom_line)
end:
}
; irq_bottom — lower border (raster 251)
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
vsyncFlag:    !byte 0
nextD011:     !byte $17
nextD018:     !byte D018_A
scrollFine:   !byte 7
scrollRow:    !byte 0
delayCounter: !byte 1
displayBuf:   !byte 0
workBufOffset:!byte 0
coarsePhase:  !byte 0
${music ? 'musicMuted:     !byte 0' : ''}
animPaused:     !byte 0

${checkKeysASM_CIA(music, true)}

${sid ? sidAsmData(sid) : ''}
* = $${SCR_DATA.toString(16)}
screen_data:
${screenDataAsm}
color_data:
${colorDataAsm}
${commitTopAsm}
${commitBotAsm}
; Row tables at tail of PRG (absolute,X addressed — location doesn't matter).
; Placing them here keeps the $0AA0..$0C93 area free for char buffer B.
scr_row_lo: !byte ${tblHex(scrRowLo)}
scr_row_hi: !byte ${tblHex(scrRowHi)}
col_row_lo: !byte ${tblHex(colRowLo)}
col_row_hi: !byte ${tblHex(colRowHi)}
sd_lo: !byte ${tblHex(sdLo)}
sd_hi: !byte ${tblHex(sdHi)}
cd_lo: !byte ${tblHex(cdLo)}
cd_hi: !byte ${tblHex(cdHi)}
`;

  } else {
    // ── Horizontal scroll ──
    const VISIBLE_COLS = 40;
    const MAX_SCROLL = width - VISIBLE_COLS;
    if (MAX_SCROLL <= 0) { alert('Frame must be wider than 40 cols for Wide Pan.'); return; }

    const srcScrLo: number[] = [], srcScrHi: number[] = [];
    const srcColLo: number[] = [], srcColHi: number[] = [];
    for (let r = 0; r < height; r++) {
      const sa = SCR_DATA + r * width; const ca = COL_DATA + r * width;
      srcScrLo.push(sa & 0xFF); srcScrHi.push((sa >> 8) & 0xFF);
      srcColLo.push(ca & 0xFF); srcColHi.push((ca >> 8) & 0xFF);
    }
    const sdLo: number[] = [], sdHi: number[] = [], cdLo: number[] = [], cdHi: number[] = [];
    for (let r = 0; r < height; r++) {
      const sa = 0x0400 + r * VISIBLE_COLS; const ca = 0xD800 + r * VISIBLE_COLS;
      sdLo.push(sa & 0xFF); sdHi.push((sa >> 8) & 0xFF);
      cdLo.push(ca & 0xFF); cdHi.push((ca >> 8) & 0xFF);
    }

    // Horizontal per-row commit: src base = src_col_lo/hi[X] + scrollCol.
    // Uses zp_cmt_src so it's IRQ-safe against a mid-char-copy preempt.
    const genHCommitRow = (destBase: number): string => {
      const prelude = [
        `    lda src_col_lo,x`,
        `    clc`,
        `    adc scrollCol`,
        `    sta zp_cmt_src`,
        `    lda src_col_hi,x`,
        `    adc #0`,
        `    sta zp_cmt_src+1`,
        `    inx`,
        `    ldy #39`,
      ].join('\n');
      return prelude + '\n' + genUnrolledRow(`$${hex4(destBase)}`);
    };
    let commitTopAsmH = `commit_colors_top: {\n    ldx #0\n`;
    for (let r = 0; r < TOP_COMMIT_ROWS_H; r++) {
      commitTopAsmH += genHCommitRow(0xD800 + r * VISIBLE_COLS) + '\n';
    }
    commitTopAsmH += `    rts\n}`;
    let commitBotAsmH = `commit_colors_bottom: {\n    ldx #${TOP_COMMIT_ROWS_H}\n`;
    for (let r = TOP_COMMIT_ROWS_H; r < height; r++) {
      commitBotAsmH += genHCommitRow(0xD800 + r * VISIBLE_COLS) + '\n';
    }
    commitBotAsmH += `    rts\n}`;

    source = `
; Petmate9 Horizontal Smooth Scroller (${platformLabel}) — Double Buffered
!include "macros.asm"
${sid ? sidAsmHeader(sid) : ''}
!let irq_top_line    = 1
!let irq_bottom_line = ${IRQ_BOTTOM_LINE}
!let debug_build     = FALSE
!let VISIBLE_COLS    = ${VISIBLE_COLS}
!let VISIBLE_ROWS    = ${height}
!let MAX_SCROLL      = ${MAX_SCROLL}
!let SCROLL_SPEED    = ${scrollSpeed}
!let D018_A          = $${toHex8(D018_A)}
!let D018_B          = $${toHex8(D018_B)}
!let zp_src          = $20
!let zp_dst          = $22
!let zp_vis_row      = $24
!let zp_col_lo       = $25
!let zp_col_hi       = $26
!let zp_cmt_src      = $28     ; dedicated commit-source pointer (IRQ-safe)
+basic_start(entry)
entry: {
${music ? '    lda #0\n    jsr sid_init' : ''}
    sei
${runtimeBankingAsm}
    +setup_irq(irq_top, irq_top_line)
    cli
    lda #${borderColor}
    sta $d020
    lda #${backgroundColor}
    sta $d021
    lda #7
    sta scrollFine
    lda #0
    sta scrollCol
    sta displayBuf
    sta workBufOffset
    sta coarsePhase
    lda #SCROLL_SPEED
    sta delayCounter
    jsr copy_window_screen
    jsr copy_window_color
    lda #$08           ; buf B at $0C00
    sta workBufOffset
    jsr copy_window_screen
    lda #$00
    sta workBufOffset
    lda #$1b
    sta $d011
    lda #$c7
    sta nextD016
    sta $d016
    lda #D018_A
    sta nextD018
${d018StoreAsm}
main_loop:
    lda vsyncFlag
    beq main_loop
    lda #0
    sta vsyncFlag
    jsr check_keys
    lda animPaused
    bne main_loop
    dec delayCounter
    bne main_loop
    lda #SCROLL_SPEED
    sta delayCounter
    dec scrollFine
    bpl prep_fine
    lda #7
    sta scrollFine
    inc scrollCol
    lda scrollCol
    cmp #MAX_SCROLL
    bcc do_coarse
    lda #0
    sta scrollCol
do_coarse:
    lda displayBuf
    bne work_a
    lda #$08           ; buf B at $0C00
    jmp set_w
work_a:
    lda #$00
set_w:
    sta workBufOffset
    ; Flip displayBuf, queue $D018 swap, and arm coarsePhase BEFORE the
    ; long char copy so the lower-border IRQ never misses the signal.
    ; The commit uses zp_cmt_src (separate zp) so it's safe to preempt
    ; copy_row mid-byte.
    lda displayBuf
    eor #1
    sta displayBuf
    beq sw_a
    lda #D018_B
    jmp q_sw
sw_a:
    lda #D018_A
q_sw:
    sta nextD018
    lda #1
    sta coarsePhase
    ; Off-screen char buffer only; $D800 handled by IRQ chain.
    jsr copy_window_screen
prep_fine:
    lda #$c0
    ora scrollFine
    sta nextD016
    jmp main_loop
}
copy_window_screen: {
    lda scrollCol
    sta zp_col_lo
    lda #0
    sta zp_col_hi
    sta zp_vis_row
rl: ldx zp_vis_row
    lda src_scr_lo,x
    clc
    adc zp_col_lo
    sta zp_src
    lda src_scr_hi,x
    adc zp_col_hi
    sta zp_src+1
    lda sd_lo,x
    sta zp_dst
    lda sd_hi,x
    clc
    adc workBufOffset
    sta zp_dst+1
    jsr copy_row
    inc zp_vis_row
    lda zp_vis_row
    cmp #VISIBLE_ROWS
    bne rl
    rts
}
; copy_window_color — initial $D800 fill only (during entry)
copy_window_color: {
    lda scrollCol
    sta zp_col_lo
    lda #0
    sta zp_col_hi
    sta zp_vis_row
rl: ldx zp_vis_row
    lda src_col_lo,x
    clc
    adc zp_col_lo
    sta zp_src
    lda src_col_hi,x
    adc zp_col_hi
    sta zp_src+1
    lda cd_lo,x
    sta zp_dst
    lda cd_hi,x
    sta zp_dst+1
    jsr copy_row
    inc zp_vis_row
    lda zp_vis_row
    cmp #VISIBLE_ROWS
    bne rl
    rts
}
; copy_row — unrolled 40-byte indirect copy.
copy_row: {
    ldy #VISIBLE_COLS-1
${unrolledCopyRow}
    rts
}
; irq_top — upper border (raster 1)
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
${music ? `    lda musicMuted
    bne skip_music
    jsr sid_play
skip_music:` : ''}
    +irq_end(irq_bottom, irq_bottom_line)
end:
}
; irq_bottom — lower border (raster 251)
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
vsyncFlag:    !byte 0
nextD016:     !byte $c7
nextD018:     !byte D018_A
scrollFine:   !byte 7
scrollCol:    !byte 0
delayCounter: !byte 1
displayBuf:   !byte 0
workBufOffset:!byte 0
coarsePhase:  !byte 0
${music ? 'musicMuted:     !byte 0' : ''}
animPaused:     !byte 0

${checkKeysASM_CIA(music, true)}

${sid ? sidAsmData(sid) : ''}
* = $${SCR_DATA.toString(16)}
screen_data:
${screenDataAsm}
color_data:
${colorDataAsm}
${commitTopAsmH}
${commitBotAsmH}
; Row tables at tail of PRG, off the $0AA0..$0C93 range (buf B = $0C00).
src_scr_lo: !byte ${tblHex(srcScrLo)}
src_scr_hi: !byte ${tblHex(srcScrHi)}
src_col_lo: !byte ${tblHex(srcColLo)}
src_col_hi: !byte ${tblHex(srcColHi)}
sd_lo: !byte ${tblHex(sdLo)}
sd_hi: !byte ${tblHex(sdHi)}
cd_lo: !byte ${tblHex(cdLo)}
cd_hi: !byte ${tblHex(cdHi)}
`;
  }

  // ── Assemble ──
  const res = simpleAssemble(source, macrosAsm);
  if (res.errors.length !== 0) {
    const errMsgs = res.errors.map((e: any) => typeof e === 'string' ? e : JSON.stringify(e)).join('\n');
    console.error('c64jasm assembly errors:', res.errors);
    alert(`Scroll player export failed:\n${errMsgs}`);
    return;
  }
  try {
    fs.writeFileSync(filename, res.prg, null);
    if (fmt.exportOptions.sendToUltimate && ultimateAddress) {
      sendPrgToUltimate(res.prg, ultimateAddress);
    }
  } catch (e) {
    alert(`Failed to save file '${filename}'!`);
    console.error(e);
  }
}

function getPlayerScrollMode(fmt: FileFormatPlayerV1): 'wrap' | 'pingpong' {
  const explicitMode = String((fmt.exportOptions as any).playerScrollMode || '').toLowerCase();
  if (explicitMode === 'pingpong') return 'pingpong';
  if (explicitMode === 'wrap') return 'wrap';
  const legacyMode = String((fmt.exportOptions as any).playerScrollType || '').toLowerCase();
  if (legacyMode === 'pingpong') return 'pingpong';
  return 'wrap';
}

function saveScrollPlayerEnhanced(
  filename: string, fbs: FramebufWithFont[], fmt: FileFormatPlayerV1,
  direction: 'vertical' | 'horizontal', ultimateAddress?: string
) {
  const appPath = electron.remote.app.getAppPath();
  const computer = fmt.exportOptions.computer;
  if (computer !== 'c64' && computer !== 'c128') {
    alert(`Smooth scroll export is currently supported for C64 and C128 only (got '${computer}').`);
    return;
  }
  const isC128 = computer === 'c128';
  const fb = fbs[fmt.commonExportParams.selectedFramebufIndex];
  const { width, height, framebuf, backgroundColor, borderColor, charset } = fb;
  const music = fmt.exportOptions.music && (computer === 'c64' || computer === 'c128');
  const fps = fmt.exportOptions.playerFPS || 60;
  const scrollSpeed = fpsToVblanks(fps);
  const scrollMode = getPlayerScrollMode(fmt);
  let sid: SidInfo | null = null;
  if (music) {
    try {
      sid = loadSidFromSongFile(fmt.exportOptions.songFile);
    } catch (e: any) {
      alert(`Unable to load SID file:\n${e.message}`);
      return;
    }
  }
  const macrosAsm = fs.readFileSync(path.resolve(appPath, isC128 ? 'assets/macrosc128.asm' : 'assets/macrosc64.asm'));
  const VISIBLE_COLS = 40;
  const VISIBLE_ROWS = 25;

  if (direction === 'vertical' && height <= VISIBLE_ROWS) {
    alert('Frame must be taller than 25 rows for Long Scroll.');
    return;
  }
  if (direction === 'vertical' && width < VISIBLE_COLS) {
    alert('Long Scroll source frame must be at least 40 columns wide.');
    return;
  }
  if (direction === 'horizontal' && width <= VISIBLE_COLS) {
    alert('Frame must be wider than 40 cols for Wide Pan.');
    return;
  }
  if (direction === 'horizontal' && height !== VISIBLE_ROWS) {
    alert('Wide Pan source frame must be 25 rows tall.');
    return;
  }

  // Data extraction (horizontal wrap mode uses row extension for contiguous 40-byte reads).
  const sourceRowWidth = (direction === 'horizontal' && scrollMode === 'wrap')
    ? (width + VISIBLE_COLS)
    : width;
  const screenCodes: number[] = [];
  const colorValues: number[] = [];
  for (let y = 0; y < height; y++) {
    const rowCodes: number[] = [];
    const rowColors: number[] = [];
    for (let x = 0; x < width; x++) {
      rowCodes.push(framebuf[y][x].code);
      rowColors.push(framebuf[y][x].color);
    }
    if (direction === 'horizontal' && scrollMode === 'wrap') {
      for (let x = 0; x < VISIBLE_COLS; x++) {
        const srcX = x % width;
        rowCodes.push(rowCodes[srcX]);
        rowColors.push(rowColors[srcX]);
      }
    }
    screenCodes.push(...rowCodes);
    colorValues.push(...rowColors);
  }

  const SCR_DATA_DEFAULT = 0x2200;
  const SCR_DATA_ALT = 0x8000;
  const PLAYER_LOW_MEM_START = 0x1C01;
  const PLAYER_LOW_MEM_END = 0x21FF;
  const SID_RELOCATION_OVERHEAD = 0x2000;
  const SID_RELOCATION_IO_LIMIT = 0xD000;
  const fmtHex4 = (v: number) => v.toString(16).toUpperCase().padStart(4, '0');
  const rangesOverlap = (startA: number, endA: number, startB: number, endB: number): boolean =>
    startA <= endB && startB <= endA;
  const selectScrollDataAddress = (): number => {
    if (!(isC128 && sid)) return SCR_DATA_DEFAULT;

    const sidStart = sid.loadAddress;
    const sidEnd = sid.loadAddress + sid.data.length - 1;
    const sidEndWrapped = sidEnd & 0xFFFF;

    if (rangesOverlap(PLAYER_LOW_MEM_START, PLAYER_LOW_MEM_END, sidStart, sidEnd)) {
      throw new Error(
        `SID load range $${fmtHex4(sidStart)}-$${fmtHex4(sidEndWrapped)} overlaps fixed player code/vars ($${fmtHex4(PLAYER_LOW_MEM_START)}-$${fmtHex4(PLAYER_LOW_MEM_END)}).`
      );
    }

    const estimatedPlayerDataSpan = screenCodes.length + colorValues.length + SID_RELOCATION_OVERHEAD;
    const candidates = [SCR_DATA_DEFAULT, SCR_DATA_ALT];
    for (const base of candidates) {
      const end = base + estimatedPlayerDataSpan - 1;
      if (end >= SID_RELOCATION_IO_LIMIT) continue;
      if (!rangesOverlap(base, end, sidStart, sidEnd)) return base;
    }

    throw new Error(
      `SID load range $${fmtHex4(sidStart)}-$${fmtHex4(sidEndWrapped)} overlaps all supported source-data regions.`
    );
  };

  let SCR_DATA: number;
  try {
    SCR_DATA = selectScrollDataAddress();
  } catch (e: any) {
    alert(`Scroll player export failed:\n${e.message}`);
    return;
  }
  const COL_DATA = SCR_DATA + screenCodes.length;
  if (isC128 && sid && SCR_DATA !== SCR_DATA_DEFAULT) {
    const sidStart = sid.loadAddress;
    const sidEndWrapped = (sid.loadAddress + sid.data.length - 1) & 0xFFFF;
    console.info(`Relocating scroll source data to $${fmtHex4(SCR_DATA)} to avoid SID range $${fmtHex4(sidStart)}-$${fmtHex4(sidEndWrapped)}.`);
  }

  const lowerCharset = isC128
    ? (charset === 'c128Lower' || charset === 'lower')
    : (charset === 'lower');
  const csBits = lowerCharset ? 0x07 : 0x05;
  const D018_A = 0x10 | csBits;
  const D018_B = 0x30 | csBits;
  const platformLabel = isC128 ? 'C128' : 'C64';
  const runtimeBankingAsm = isC128
    ? `    lda #$3e
    sta $ff00`
    : `    lda #$35
    sta $01`;
  const d018StoreAsm = isC128
    ? `    sta $d018
    sta $0a2c`
    : `    sta $d018`;
  const sidRawDataAsm = sid ? bytesToCommaDelimited(sid.data, 16, true).join('') : '';
  const sidDataSize = sid ? sid.data.length : 0;
  const sidCopyPageCount = Math.floor(sidDataSize / 256);
  const sidCopyRemainder = sidDataSize % 256;
  const sidDataPreCodeAsm = '';
  const sidDataPostCodeAsm = (sid && !isC128) ? sidAsmData(sid) : '';
  const sidDataTailAsm = (sid && isC128) ? `sid_blob:${sidRawDataAsm}` : '';
  const sidCopyRoutineAsm = (sid && isC128)
    ? `copy_sid_blob_to_load: {
    lda #<sid_blob
    sta zp_src
    lda #>sid_blob
    sta zp_src+1
    lda #<sid_startAddress
    sta zp_dst
    lda #>sid_startAddress
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
  const sidInitAsm = (sid && isC128)
    ? `    jsr copy_sid_blob_to_load
    lda $01
    sta port01Saved
    lda #0
    jsr sid_init
    lda port01Saved
    sta $01`
    : (sid ? `    lda #0
    jsr sid_init` : '');

  const screenDataAsm = bytesToCommaDelimited(screenCodes, sourceRowWidth, true).join('');
  const colorDataAsm  = bytesToCommaDelimited(colorValues, sourceRowWidth, true).join('');
  const tblHex = (a: number[]) => a.map(v => `$${toHex8(v)}`).join(',');
  const IRQ_BOTTOM_LINE = 251;
  const TOP_COMMIT_ROWS_H = Math.min(19, height);
  const hex4 = (v: number) => v.toString(16).toUpperCase().padStart(4, '0');
  const unrolledCopyRow = (() => {
    const lines: string[] = [];
    for (let i = 0; i < 40; i++) {
      lines.push(`    lda (zp_src),y`);
      lines.push(`    sta (zp_dst),y`);
      if (i < 39) lines.push(`    dey`);
    }
    return lines.join('\n');
  })();
  const genUnrolledRow = (destHex: string) => {
    const lines: string[] = [];
    for (let i = 0; i < 40; i++) {
      lines.push(`    lda (zp_cmt_src),y`);
      lines.push(`    sta ${destHex},y`);
      if (i < 39) lines.push(`    dey`);
    }
    return lines.join('\n');
  };
  const handleInputAsm = `
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
`;
  const sidPlayMainLoopAsm = isC128
    ? `    sei
    lda #$3e
    sta $ff00
    jsr sid_play
    lda port01Saved
    sta $01
    lda #$3e
    sta $ff00
    cli`
    : `    jsr sid_play`;
  const musicMainLoopAsm = music
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

  let source: string;

  if (direction === 'vertical') {
    const TOTAL_ROWS = height;
    const MAX_SCROLL = scrollMode === 'pingpong'
      ? (height - VISIBLE_ROWS)
      : (height - 1);
    const TOP_COMMIT_ROWS_V = 19;

    const scrRowLo: number[] = [], scrRowHi: number[] = [];
    const colRowLo: number[] = [], colRowHi: number[] = [];
    for (let row = 0; row < height; row++) {
      const sa = SCR_DATA + row * width;
      const ca = COL_DATA + row * width;
      scrRowLo.push(sa & 0xFF);
      scrRowHi.push((sa >> 8) & 0xFF);
      colRowLo.push(ca & 0xFF);
      colRowHi.push((ca >> 8) & 0xFF);
    }
    const screenDestLo: number[] = [], screenDestHi: number[] = [];
    const colorDestLo: number[] = [], colorDestHi: number[] = [];
    for (let row = 0; row < VISIBLE_ROWS; row++) {
      const sa = 0x0400 + row * VISIBLE_COLS;
      const ca = 0xD800 + row * VISIBLE_COLS;
      screenDestLo.push(sa & 0xFF);
      screenDestHi.push((sa >> 8) & 0xFF);
      colorDestLo.push(ca & 0xFF);
      colorDestHi.push((ca >> 8) & 0xFF);
    }

    let vCommitWrapLabelCounter = 0;
    const genVCommitRow = (destBase: number): string => {
      const wrapLabel = `cmt_v_row_wrap_ok_enh_${vCommitWrapLabelCounter++}`;
      const prelude = [
        `    lda col_row_lo,x`,
        `    sta zp_cmt_src`,
        `    lda col_row_hi,x`,
        `    sta zp_cmt_src+1`,
        `    inx`,
        `    cpx #TOTAL_ROWS`,
        `    bcc ${wrapLabel}`,
        `    ldx #0`,
        `${wrapLabel}:`,
        `    ldy #39`,
      ].join('\n');
      return prelude + '\n' + genUnrolledRow(`$${hex4(destBase)}`);
    };
    let commitTopAsm = `commit_colors_top: {\n    ldx scrollRow\n`;
    for (let r = 0; r < TOP_COMMIT_ROWS_V; r++) {
      commitTopAsm += genVCommitRow(0xD800 + r * VISIBLE_COLS) + '\n';
    }
    commitTopAsm += `    rts\n}`;

    let commitBotAsm = `commit_colors_bottom: {
    lda scrollRow
    clc
    adc #${TOP_COMMIT_ROWS_V}
    cmp #TOTAL_ROWS
    bcc cmt_bot_idx_ok
    sec
    sbc #TOTAL_ROWS
cmt_bot_idx_ok:
    tax
`;
    for (let r = TOP_COMMIT_ROWS_V; r < VISIBLE_ROWS; r++) {
      commitBotAsm += genVCommitRow(0xD800 + r * VISIBLE_COLS) + '\n';
    }
    commitBotAsm += `    rts\n}`;

    const coarseStepAsm = scrollMode === 'pingpong'
      ? `
    lda scrollDir
    beq pp_fwd_fine
pp_rev_fine:
    inc scrollFine
    lda scrollFine
    cmp #8
    bcc prep_fine
    lda scrollRow
    bne pp_rev_do_coarse
    lda #7
    sta scrollFine
    lda #0
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
    lda scrollRow
    cmp #MAX_SCROLL
    bcc pp_fwd_do_coarse
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
    dec scrollFine
    bpl prep_fine
    lda #7
    sta scrollFine
    inc scrollRow
    lda scrollRow
    cmp #TOTAL_ROWS
    bcc do_coarse
    lda #0
    sta scrollRow
`;

    source = `
; Petmate9 Vertical Smooth Scroller (${platformLabel}) — Double Buffered
!include "macros.asm"
${sid ? sidAsmHeader(sid) : ''}
!let irq_top_line    = 1
!let irq_bottom_line = ${IRQ_BOTTOM_LINE}
!let debug_build     = FALSE
!let TOTAL_ROWS      = ${TOTAL_ROWS}
!let VISIBLE_ROWS    = ${VISIBLE_ROWS}
!let MAX_SCROLL      = ${MAX_SCROLL}
!let ROW_WIDTH       = ${width}
!let SCROLL_SPEED    = ${scrollSpeed}
!let D018_A          = $${toHex8(D018_A)}
!let D018_B          = $${toHex8(D018_B)}
!let zp_src          = $20
!let zp_dst          = $22
!let zp_src_row      = $24
!let zp_vis_row      = $25
!let zp_cmt_src      = $26
${sidDataPreCodeAsm}
+basic_start(entry)
entry: {
    sei
${runtimeBankingAsm}
${sidInitAsm}
    +setup_irq(irq_top, irq_top_line)
    cli
    lda #${borderColor}
    sta $d020
    lda #${backgroundColor}
    sta $d021
    lda #7
    sta scrollFine
    lda #0
    sta scrollRow
    sta displayBuf
    sta workBufOffset
    sta coarsePhase
    sta scrollDir
    sta paused
    sta muteFlag
    sta keySpacePrev
    sta keyMPrev
    sta keyPlusPrev
    sta keyMinusPrev
    lda #$ff
    sta $dc00
    sta $dc02
    lda #$00
    sta $dc03
    lda #SCROLL_SPEED
    sta scrollSpeed
    sta delayCounter
    jsr copy_window_screen
    jsr copy_window_color
    lda #$08
    sta workBufOffset
    jsr copy_window_screen
    lda #$00
    sta workBufOffset
    lda #$17
    sta nextD011
    sta $d011
    lda #D018_A
    sta nextD018
${d018StoreAsm}
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
${coarseStepAsm}
do_coarse:
    lda displayBuf
    bne work_a
    lda #$08
    jmp set_w
work_a:
    lda #$00
set_w:
    sta workBufOffset
    lda displayBuf
    eor #1
    sta displayBuf
    beq sw_a
    lda #D018_B
    jmp q_sw
sw_a:
    lda #D018_A
q_sw:
    sta nextD018
    lda #1
    sta coarsePhase
    jsr copy_window_screen
prep_fine:
    lda #$10
    ora scrollFine
    sta nextD011
post_frame_work:
    jsr handle_input
${musicMainLoopAsm}
    jmp main_loop
}
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
    adc workBufOffset
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
copy_row: {
    ldy #39
${unrolledCopyRow}
    rts
}
${sidCopyRoutineAsm}
${handleInputAsm}
irq_top: {
    +irq_start(end)
    lda nextD011
    sta $d011
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
vsyncFlag:      !byte 0
nextD011:       !byte $17
nextD018:       !byte D018_A
scrollFine:     !byte 7
scrollRow:      !byte 0
delayCounter:   !byte 1
scrollSpeed:    !byte SCROLL_SPEED
paused:         !byte 0
muteFlag:       !byte 0
${(sid && isC128) ? 'port01Saved:   !byte 0' : ''}
keySpacePrev:   !byte 0
keyMPrev:       !byte 0
keyPlusPrev:    !byte 0
keyMinusPrev:   !byte 0
keyRowState:    !byte 0
displayBuf:     !byte 0
workBufOffset:  !byte 0
coarsePhase:    !byte 0
scrollDir:      !byte 0
${sidDataPostCodeAsm}
* = $${SCR_DATA.toString(16)}
screen_data:
${screenDataAsm}
color_data:
${colorDataAsm}
${commitTopAsm}
${commitBotAsm}
scr_row_lo: !byte ${tblHex(scrRowLo)}
scr_row_hi: !byte ${tblHex(scrRowHi)}
col_row_lo: !byte ${tblHex(colRowLo)}
col_row_hi: !byte ${tblHex(colRowHi)}
screen_dest_lo: !byte ${tblHex(screenDestLo)}
screen_dest_hi: !byte ${tblHex(screenDestHi)}
color_dest_lo: !byte ${tblHex(colorDestLo)}
color_dest_hi: !byte ${tblHex(colorDestHi)}
${sidDataTailAsm}
`;
  } else {
    const SOURCE_COLS = width;
    const MAX_SCROLL = scrollMode === 'wrap'
      ? (SOURCE_COLS - 1)
      : (SOURCE_COLS - VISIBLE_COLS);

    const srcScrRowLo: number[] = [], srcScrRowHi: number[] = [];
    const srcColRowLo: number[] = [], srcColRowHi: number[] = [];
    for (let row = 0; row < height; row++) {
      const sa = SCR_DATA + row * sourceRowWidth;
      const ca = COL_DATA + row * sourceRowWidth;
      srcScrRowLo.push(sa & 0xFF);
      srcScrRowHi.push((sa >> 8) & 0xFF);
      srcColRowLo.push(ca & 0xFF);
      srcColRowHi.push((ca >> 8) & 0xFF);
    }
    const screenDestLo: number[] = [], screenDestHi: number[] = [];
    const colorDestLo: number[] = [], colorDestHi: number[] = [];
    for (let row = 0; row < height; row++) {
      const sa = 0x0400 + row * VISIBLE_COLS;
      const ca = 0xD800 + row * VISIBLE_COLS;
      screenDestLo.push(sa & 0xFF);
      screenDestHi.push((sa >> 8) & 0xFF);
      colorDestLo.push(ca & 0xFF);
      colorDestHi.push((ca >> 8) & 0xFF);
    }

    const genHCommitRow = (destBase: number): string => {
      const prelude = [
        `    lda src_col_row_lo,x`,
        `    clc`,
        `    adc scrollCol`,
        `    sta zp_cmt_src`,
        `    lda src_col_row_hi,x`,
        `    adc #0`,
        `    sta zp_cmt_src+1`,
        `    inx`,
        `    ldy #39`,
      ].join('\n');
      return prelude + '\n' + genUnrolledRow(`$${hex4(destBase)}`);
    };
    let commitTopAsm = `commit_colors_top: {\n    ldx #0\n`;
    for (let r = 0; r < TOP_COMMIT_ROWS_H; r++) {
      commitTopAsm += genHCommitRow(0xD800 + r * VISIBLE_COLS) + '\n';
    }
    commitTopAsm += `    rts\n}`;
    let commitBotAsm = `commit_colors_bottom: {\n    ldx #${TOP_COMMIT_ROWS_H}\n`;
    for (let r = TOP_COMMIT_ROWS_H; r < height; r++) {
      commitBotAsm += genHCommitRow(0xD800 + r * VISIBLE_COLS) + '\n';
    }
    commitBotAsm += `    rts\n}`;

    const coarseStepAsm = scrollMode === 'pingpong'
      ? `
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
    lda scrollCol
    bne pp_rev_do_coarse
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
    lda scrollCol
    cmp #MAX_SCROLL
    bcc pp_fwd_do_coarse
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
    dec scrollFine
    bpl prep_fine
    lda #7
    sta scrollFine
    inc scrollCol
    lda scrollCol
    cmp #MAX_SCROLL+1
    bcc do_coarse
    lda #0
    sta scrollCol
`;

    source = `
; Petmate9 Horizontal Smooth Scroller (${platformLabel}) — Double Buffered
!include "macros.asm"
${sid ? sidAsmHeader(sid) : ''}
!let irq_top_line    = 1
!let irq_bottom_line = ${IRQ_BOTTOM_LINE}
!let debug_build     = FALSE
!let VISIBLE_COLS    = ${VISIBLE_COLS}
!let VISIBLE_ROWS    = ${height}
!let MAX_SCROLL      = ${MAX_SCROLL}
!let SRC_ROW_WIDTH   = ${sourceRowWidth}
!let SCROLL_SPEED    = ${scrollSpeed}
!let D018_A          = $${toHex8(D018_A)}
!let D018_B          = $${toHex8(D018_B)}
!let zp_src          = $20
!let zp_dst          = $22
!let zp_vis_row      = $24
!let zp_col_lo       = $25
!let zp_col_hi       = $26
!let zp_cmt_src      = $28
${sidDataPreCodeAsm}
+basic_start(entry)
entry: {
    sei
${runtimeBankingAsm}
${sidInitAsm}
    +setup_irq(irq_top, irq_top_line)
    cli
    lda #${borderColor}
    sta $d020
    lda #${backgroundColor}
    sta $d021
    lda #7
    sta scrollFine
    lda #0
    sta scrollCol
    sta displayBuf
    sta workBufOffset
    sta coarsePhase
    sta scrollDir
    sta paused
    sta muteFlag
    sta keySpacePrev
    sta keyMPrev
    sta keyPlusPrev
    sta keyMinusPrev
    lda #$ff
    sta $dc00
    sta $dc02
    lda #$00
    sta $dc03
    lda #SCROLL_SPEED
    sta scrollSpeed
    sta delayCounter
    jsr copy_window_screen
    jsr copy_window_color
    lda #$08
    sta workBufOffset
    jsr copy_window_screen
    lda #$00
    sta workBufOffset
    lda #$1b
    sta $d011
    lda #$c7
    sta nextD016
    sta $d016
    lda #D018_A
    sta nextD018
${d018StoreAsm}
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
${coarseStepAsm}
do_coarse:
    lda displayBuf
    bne work_a
    lda #$08
    jmp set_w
work_a:
    lda #$00
set_w:
    sta workBufOffset
    lda displayBuf
    eor #1
    sta displayBuf
    beq sw_a
    lda #D018_B
    jmp q_sw
sw_a:
    lda #D018_A
q_sw:
    sta nextD018
    lda #1
    sta coarsePhase
    jsr copy_window_screen
prep_fine:
    lda #$c0
    ora scrollFine
    sta nextD016
post_frame_work:
    jsr handle_input
${musicMainLoopAsm}
    jmp main_loop
}
copy_window_screen: {
    lda scrollCol
    sta zp_col_lo
    lda #0
    sta zp_col_hi
    sta zp_vis_row
row_loop:
    ldx zp_vis_row
    lda src_scr_row_lo,x
    clc
    adc zp_col_lo
    sta zp_src
    lda src_scr_row_hi,x
    adc zp_col_hi
    sta zp_src+1
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
copy_row: {
    ldy #VISIBLE_COLS-1
${unrolledCopyRow}
    rts
}
${sidCopyRoutineAsm}
${handleInputAsm}
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
vsyncFlag:      !byte 0
nextD016:       !byte $c7
nextD018:       !byte D018_A
scrollFine:     !byte 7
scrollCol:      !byte 0
delayCounter:   !byte 1
scrollSpeed:    !byte SCROLL_SPEED
paused:         !byte 0
muteFlag:       !byte 0
${(sid && isC128) ? 'port01Saved:   !byte 0' : ''}
keySpacePrev:   !byte 0
keyMPrev:       !byte 0
keyPlusPrev:    !byte 0
keyMinusPrev:   !byte 0
keyRowState:    !byte 0
displayBuf:     !byte 0
workBufOffset:  !byte 0
coarsePhase:    !byte 0
scrollDir:      !byte 0
${sidDataPostCodeAsm}
* = $${SCR_DATA.toString(16)}
screen_data:
${screenDataAsm}
color_data:
${colorDataAsm}
${commitTopAsm}
${commitBotAsm}
src_scr_row_lo: !byte ${tblHex(srcScrRowLo)}
src_scr_row_hi: !byte ${tblHex(srcScrRowHi)}
src_col_row_lo: !byte ${tblHex(srcColRowLo)}
src_col_row_hi: !byte ${tblHex(srcColRowHi)}
screen_dest_lo: !byte ${tblHex(screenDestLo)}
screen_dest_hi: !byte ${tblHex(screenDestHi)}
color_dest_lo: !byte ${tblHex(colorDestLo)}
color_dest_hi: !byte ${tblHex(colorDestHi)}
${sidDataTailAsm}
`;
  }

  const res = simpleAssemble(source, macrosAsm);
  if (res.errors.length !== 0) {
    const errMsgs = res.errors.map((e: any) => typeof e === 'string' ? e : JSON.stringify(e)).join('\n');
    console.error('c64jasm assembly errors:', res.errors);
    alert(`Scroll player export failed:\n${errMsgs}`);
    return;
  }
  try {
    fs.writeFileSync(filename, res.prg, null);
    if (fmt.exportOptions.sendToUltimate && ultimateAddress) {
      sendPrgToUltimate(res.prg, ultimateAddress);
    }
  } catch (e) {
    alert(`Failed to save file '${filename}'!`);
    console.error(e);
  }
}

function launchEmulator(computer: string, prgFile: string, emulatorPaths: EmulatorPaths) {
  // Resolve `spawn` lazily — see comment near the top of this file.
  const { spawn } = window.require('child_process');
  // VDC 80-col uses the same C128 emulator
  const emuKey = computer === 'c128vdc' ? 'c128' : computer;
  const configuredPath = emulatorPaths[emuKey as keyof EmulatorPaths];
  let emuPath = configuredPath;
  if ((!emuPath || !fs.existsSync(emuPath)) && isWindowsDevBuild()) {
    const devPath = getWindowsDevVicePath(computer);
    if (devPath && fs.existsSync(devPath)) {
      emuPath = devPath;
    }
  }
  if (!emuPath) {
    alert(`No emulator configured for ${computer}. Set it in Preferences → Emulation.`);
    return;
  }
  const isMacApp = emuPath.endsWith('.app');
  if (!isMacApp && !fs.existsSync(emuPath)) {
    alert(`Emulator executable not found for ${computer}: ${emuPath}`);
    return;
  }
  try {
    // Build args: VDC mode needs -80 flag so x128 starts with 80-column display
    const emuArgs = computer === 'c128vdc'
      ? ['-80', '-autostart', prgFile]
      : ['-autostart', prgFile];

    // macOS .app bundles must be launched via 'open -a' with --args
    const cmd = isMacApp ? 'open' : emuPath;
    const args = isMacApp
      ? ['-a', emuPath, '--args', ...emuArgs]
      : emuArgs;
    console.log('Launching emulator:', cmd, args);
    const child = spawn(cmd, args, {
      detached: true,
      stdio: 'ignore',
      shell: true,        // required on Windows for .exe paths
      windowsHide: false,
    });
    child.on('error', (err: any) => {
      alert(`Failed to launch emulator: ${err.message}`);
    });
    child.unref();
  } catch (e: any) {
    alert(`Failed to launch emulator: ${e.message}`);
  }
}

export { savePlayer, launchEmulator }
