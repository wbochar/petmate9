import { chunkArray } from '..'
import { electron, fs, path } from '../electronImports'
import { FileFormatPlayerV1, FramebufWithFont, EmulatorPaths } from '../../redux/types';
import * as fp from '../fp'
import * as c64jasm from 'c64jasm';

const { spawn } = window.require('child_process');

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
  startAddress: number;
  init: number;
  play: number;
  data: number[];
}

function parseSidFile(buf: Buffer): SidInfo {
  const readWord   = (o: number) => buf[o] + (buf[o + 1] << 8);
  const readWordBE = (o: number) => (buf[o] << 8) + buf[o + 1];
  const dataOffset = readWordBE(6);
  const startAddress = readWord(dataOffset);
  return {
    startAddress,
    init: startAddress,
    play: startAddress + 3,
    data: [...buf.slice(dataOffset + 2)],
  };
}

// Generate SID-related assembly lines from parsed SID info (no plugin needed)
function sidAsmHeader(sid: SidInfo): string {
  return `\n!let sid_startAddress = $${toHex8(sid.startAddress >> 8)}${toHex8(sid.startAddress & 0xFF)}
!let sid_init = $${toHex8(sid.init >> 8)}${toHex8(sid.init & 0xFF)}
!let sid_play = $${toHex8(sid.play >> 8)}${toHex8(sid.play & 0xFF)}`;
}

function sidAsmData(sid: SidInfo): string {
  return `\n* = sid_startAddress
sid_data:${bytesToCommaDelimited(sid.data, 16, true).join('')}`;
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
    return saveScrollPlayer(filename, fbs, fmt, 'vertical', ultimateAddress);
  }
  if (fmt.exportOptions.playerType === 'Wide Pan') {
    return saveScrollPlayer(filename, fbs, fmt, 'horizontal', ultimateAddress);
  }

  const appPath = electron.remote.app.getAppPath()
  var source: string = "";
  var music = fmt.exportOptions.music;
  const sid = music ? parseSidFile(fs.readFileSync(path.resolve(fmt.exportOptions.songFile[0]))) : null;
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
  const sid = music ? parseSidFile(fs.readFileSync(path.resolve(fmt.exportOptions.songFile[0]))) : null;

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
  const sid = music ? parseSidFile(fs.readFileSync(path.resolve(fmt.exportOptions.songFile[0]))) : null;

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

  // Charset $D018 values for double buffer
  const csBits = (charset === 'lower') ? 0x07 : 0x05;
  const D018_A = 0x10 | csBits;  // $0400
  const D018_B = 0x30 | csBits;  // $0C00

  const screenDataAsm = bytesToCommaDelimited(screenCodes, width, true).join('');
  const colorDataAsm  = bytesToCommaDelimited(colorValues, width, true).join('');
  const tblHex = (a: number[]) => a.map(v => `$${toHex8(v)}`).join(',');

  let source: string;

  if (direction === 'vertical') {
    // ── Vertical scroll ──
    const VISIBLE = 25;
    const MAX_SCROLL = height - VISIBLE;
    if (MAX_SCROLL <= 0) { alert('Frame must be taller than 25 rows for Long Scroll.'); return; }

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

    source = `
; Petmate9 Vertical Smooth Scroller (C64) — Double Buffered
!include "macros.asm"
${sid ? sidAsmHeader(sid) : ''}
!let irq_top_line = 1
!let debug_build = FALSE
!let VISIBLE_ROWS = ${VISIBLE}
!let MAX_SCROLL = ${MAX_SCROLL}
!let ROW_WIDTH = ${width}
!let SCROLL_SPEED = ${scrollSpeed}
!let D018_A = $${toHex8(D018_A)}
!let D018_B = $${toHex8(D018_B)}
!let zp_src = $20
!let zp_dst = $22
!let zp_src_row = $24
!let zp_vis_row = $25
+basic_start(entry)
entry: {
${music ? '    lda #0\n    jsr sid_init' : ''}
    sei
    lda #$35
    sta $01
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
    lda #SCROLL_SPEED
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
    sta $d018
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
    lda #$08
    jmp set_w
work_a:
    lda #$00
set_w:
    sta workBufOffset
    jsr copy_window_screen
    jsr copy_window_color
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
prep_fine:
    lda #$10
    ora scrollFine
    sta nextD011
    jmp main_loop
}
copy_window_screen: {
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
copy_row: {
    ldy #ROW_WIDTH-1
lp: lda (zp_src),y
    sta (zp_dst),y
    dey
    bpl lp
    rts
}
irq_top: {
    +irq_start(end)
    lda nextD011
    sta $d011
    lda nextD018
    sta $d018
    lda #1
    sta vsyncFlag
${music ? `    lda musicMuted
    bne skip_music
    jsr sid_play
skip_music:` : ''}
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
${music ? 'musicMuted:     !byte 0' : ''}
animPaused:     !byte 0

${checkKeysASM_CIA(music, true)}

scr_row_lo: !byte ${tblHex(scrRowLo)}
scr_row_hi: !byte ${tblHex(scrRowHi)}
col_row_lo: !byte ${tblHex(colRowLo)}
col_row_hi: !byte ${tblHex(colRowHi)}
sd_lo: !byte ${tblHex(sdLo)}
sd_hi: !byte ${tblHex(sdHi)}
cd_lo: !byte ${tblHex(cdLo)}
cd_hi: !byte ${tblHex(cdHi)}
${sid ? sidAsmData(sid) : ''}
* = $${SCR_DATA.toString(16)}
screen_data:
${screenDataAsm}
color_data:
${colorDataAsm}
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

    source = `
; Petmate9 Horizontal Smooth Scroller (C64) — Double Buffered
!include "macros.asm"
${sid ? sidAsmHeader(sid) : ''}
!let irq_top_line = 1
!let debug_build = FALSE
!let VISIBLE_COLS = ${VISIBLE_COLS}
!let VISIBLE_ROWS = ${height}
!let MAX_SCROLL = ${MAX_SCROLL}
!let SCROLL_SPEED = ${scrollSpeed}
!let D018_A = $${toHex8(D018_A)}
!let D018_B = $${toHex8(D018_B)}
!let zp_src = $20
!let zp_dst = $22
!let zp_vis_row = $24
!let zp_col_lo = $25
!let zp_col_hi = $26
+basic_start(entry)
entry: {
${music ? '    lda #0\n    jsr sid_init' : ''}
    sei
    lda #$35
    sta $01
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
    lda #SCROLL_SPEED
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
    sta $d018
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
    lda #$08
    jmp set_w
work_a:
    lda #$00
set_w:
    sta workBufOffset
    jsr copy_window_screen
    jsr copy_window_color
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
copy_row: {
    ldy #VISIBLE_COLS-1
lp: lda (zp_src),y
    sta (zp_dst),y
    dey
    bpl lp
    rts
}
irq_top: {
    +irq_start(end)
    lda nextD016
    sta $d016
    lda nextD018
    sta $d018
    lda #1
    sta vsyncFlag
${music ? `    lda musicMuted
    bne skip_music
    jsr sid_play
skip_music:` : ''}
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
${music ? 'musicMuted:     !byte 0' : ''}
animPaused:     !byte 0

${checkKeysASM_CIA(music, true)}

src_scr_lo: !byte ${tblHex(srcScrLo)}
src_scr_hi: !byte ${tblHex(srcScrHi)}
src_col_lo: !byte ${tblHex(srcColLo)}
src_col_hi: !byte ${tblHex(srcColHi)}
sd_lo: !byte ${tblHex(sdLo)}
sd_hi: !byte ${tblHex(sdHi)}
cd_lo: !byte ${tblHex(cdLo)}
cd_hi: !byte ${tblHex(cdHi)}
${sid ? sidAsmData(sid) : ''}
* = $${SCR_DATA.toString(16)}
screen_data:
${screenDataAsm}
color_data:
${colorDataAsm}
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

function launchEmulator(computer: string, prgFile: string, emulatorPaths: EmulatorPaths) {
  const emuPath = emulatorPaths[computer as keyof EmulatorPaths];
  if (!emuPath) {
    alert(`No emulator configured for ${computer}. Set it in Preferences → Emulation.`);
    return;
  }
  try {
    const child = spawn(emuPath, ['-autostart', prgFile], {
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
