#!/usr/bin/env node
/**
 * Petmate Player Export Test
 *
 * Exports the first 8 frames from computers_097a.petmate as
 * platform-specific .prg player binaries using c64jasm.
 *
 * Platform mapping (derived from charset):
 *   upper / lower          → C64       (macrosc64.asm,     singleFrameASM)
 *   c128Upper / c128Lower  → C128      (macrosc128.asm,    singleFrameASM)
 *   petGfx / petBiz        → PET 4032  (macrosPET4032.asm, singleFrameASM, no color)
 *   vic20Upper / vic20Lower→ VIC-20    (macrosvic20.asm,   singleFrameVic20ASM)
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

// Platform → VICE emulator + flags
const EMULATORS = {
  c64:     { exe: 'x64sc.exe', args: [] },
  c128:    { exe: 'x128.exe',  args: [] },
  pet4032: { exe: 'xpet.exe',  args: ['-model', '4032'] },
  vic20:   { exe: 'xvic.exe',  args: [] },
};

// ─── Load source ───────────────────────────────────────────────────
const petmate = JSON.parse(fs.readFileSync(SRC_FILE, 'utf-8'));
const frames  = petmate.framebufs.slice(0, 8);

// ─── SID music support (--sid <filepath>) ──────────────────────────
const sidArgIdx = process.argv.indexOf('--sid');
const SID_FILE  = sidArgIdx >= 0 && sidArgIdx + 1 < process.argv.length
                  ? process.argv[sidArgIdx + 1]
                  : null;
const MUSIC     = SID_FILE !== null;

// ─── Load platform macro files ─────────────────────────────────────
const macros = {
  c64:     fs.readFileSync(path.join(ASSETS, 'macrosc64.asm')),
  c128:    fs.readFileSync(path.join(ASSETS, 'macrosc128.asm')),
  pet4032: fs.readFileSync(path.join(ASSETS, 'macrosPET4032.asm')),
  vic20:   fs.readFileSync(path.join(ASSETS, 'macrosvic20.asm')),
};
const sidFileData = MUSIC ? fs.readFileSync(path.resolve(SID_FILE)) : null;
const sidJs       = MUSIC ? fs.readFileSync(path.join(ASSETS, 'sid.js')) : null;

// ─── Helpers ───────────────────────────────────────────────────────
function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function toHex8(v) {
  return v.toString(16).toUpperCase().padStart(2, '0');
}

function sanitizeLabel(name) {
  return (name || 'untitled').replace(/[^a-zA-Z0-9_]/g, '_') || 'untitled';
}

function bytesToAsmLines(bytes, bytesPerLine) {
  return chunkArray(bytes, bytesPerLine).map(row => {
    const nums = row.map(n => `$${toHex8(n)}`);
    return `\n!byte ${nums.join(',')}`;
  });
}

// ─── Determine platform from charset ───────────────────────────────
function getPlatform(charset) {
  if (charset.startsWith('vic20'))  return 'vic20';
  if (charset.startsWith('pet'))    return 'pet4032';
  if (charset.startsWith('c128'))   return 'c128';
  // upper, lower, dirart, cbase*, c16* → default to c64
  return 'c64';
}

// ═══════════════════════════════════════════════════════════════════
//  ASM TEMPLATES  (replicated from src/utils/exporters/player.ts)
// ═══════════════════════════════════════════════════════════════════

function singleFrameASM(computer, music, color, frameName, charsetBits, petsciiBytes) {
  return `
; Petmate9 Player (${computer} version) written by wbochar 2024
!include "macros.asm"
${music ? '!use "plugins/sid" as sid' : ''}
${music ? '!let music = sid("assets/sidFile.sid")' : ''}

!let irq_top_line = 1
!let debug_build = FALSE
!let zptmp0 = $20


+basic_start(entry)
;--------------------------------------------------------------
; Execution starts here
;--------------------------------------------------------------
entry: {
${music ? '    lda #0' : ''}
${music ? '    jsr music.init' : ''}

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
${color ? `    lda ${frameName}+$3ea,x` : ''}
${color ? '    sta COLOR,x' : ''}
    lda ${frameName}+$102,x
    sta SCREEN+$100,x
${color ? `    lda ${frameName}+$4ea,x` : ''}
${color ? '    sta COLOR+$100,x' : ''}

    lda ${frameName}+$202,x
    sta SCREEN+$200,x
${color ? `    lda ${frameName}+$5ea,x` : ''}
${color ? '    sta COLOR+$200,x' : ''}

    lda ${frameName}+$2ea,x
    sta SCREEN+$2e8,x
${color ? `    lda ${frameName}+$6d2,x` : ''}
${color ? '    sta COLOR+$2e8,x' : ''}
    inx
    bne loop

    jmp *


frame_loop:
    ; wait for vSync by polling the frameCount that's inc'd
    ; by the raster IRQ
    lda frameCount
vSync:
    cmp frameCount
    beq vSync


    jmp frame_loop
}

irq_top: {
    +irq_start(end)
    inc frameCount

!if (debug_build) {
    inc $d020
}

${music ? '    jsr music.play' : ''}

!if (debug_build) {
    dec $d020
}

    +irq_end(irq_top, irq_top_line)
end:
}

frameCount:     !byte 0

${music ? '* = music.startAddress' : ''}
${music ? 'sid_data: !byte music.data' : ''}

* = $2000

${petsciiBytes.join('')}

`;
}

function singleFrameVic20ASM(computer, color, frameName, charsetBits, petsciiBytes) {
  return `
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
${color ? `    lda ${frameName}Colours,x` : ''}
${color ? '    sta COLOR,x' : ''}
    lda ${frameName}Chars+$100,x
    sta SCREEN+$100,x
${color ? `    lda ${frameName}Colours+$100,x` : ''}
${color ? '    sta COLOR+$100,x' : ''}


    inx
    bne loop

    jmp *

}

${petsciiBytes.join('')}

`;
}

// ═══════════════════════════════════════════════════════════════════
//  GENERATE ASM SOURCE PER PLATFORM
// ═══════════════════════════════════════════════════════════════════

function generatePlayerSource(fb, platform) {
  const { width, height, framebuf, backgroundColor, borderColor, charset, name } = fb;
  const label = sanitizeLabel(name);
  const lines = [];

  if (platform === 'vic20') {
    // VIC-20: combined bg/border byte in $900f register
    const vic20BGBColor = (backgroundColor * 16) + borderColor + 8;
    lines.push(`!byte ${vic20BGBColor},${vic20BGBColor}`);
    lines.push(`\n${label}Chars:\n`);

    const bytesChar = [], bytesColour = [];
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        bytesChar.push(framebuf[y][x].code);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        bytesColour.push(framebuf[y][x].color);

    lines.push(...bytesToAsmLines(bytesChar, width));
    lines.push(`\n${label}Colours:\n`);
    lines.push(...bytesToAsmLines(bytesColour, width));

    let charsetBits;
    switch (charset) {
      case 'vic20Upper': charsetBits = " lda #$f0 \n sta $9005 \n"; break;
      case 'vic20Lower': charsetBits = " lda #$f2 \n sta $9005 \n"; break;
      default:           charsetBits = " lda #$f0 \n sta $9005 \n"; break;
    }

    return singleFrameVic20ASM('vic20', true, label, charsetBits, lines);
  }

  // C64 / C128 / PET — all use singleFrameASM template
  lines.push(`${label}:\n`);

  if (platform === 'pet4032') {
    // PET: screencodes only (no color RAM)
    const bytes = [];
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        bytes.push(framebuf[y][x].code);

    lines.push(`!byte ${borderColor},${backgroundColor}`);
    lines.push(...bytesToAsmLines(bytes, width));

    let charsetBits;
    switch (charset) {
      case 'petGfx': charsetBits = " lda #12 \n sta $e84c \n"; break;
      case 'petBiz': charsetBits = " lda #14 \n sta $e84c \n"; break;
      default:       charsetBits = " lda #12 \n sta $e84c \n"; break;
    }

    return singleFrameASM('pet4032', false, false, label, charsetBits, lines);
  }

  // C64 and C128: screencodes + colors
  const bytes = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      bytes.push(framebuf[y][x].code);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      bytes.push(framebuf[y][x].color);

  lines.push(`!byte ${borderColor},${backgroundColor}`);
  lines.push(...bytesToAsmLines(bytes, width));

  let charsetBits;
  if (platform === 'c128') {
    switch (charset) {
      case 'c128Upper': charsetBits = " lda #$15 \n sta $d018 \n sta $0a2c \n"; break;
      case 'c128Lower': charsetBits = " lda #$17 \n sta $d018 \n sta $0a2c \n"; break;
      default:          charsetBits = " lda #$15 \n sta $d018 \n"; break;
    }
  } else {
    // c64
    switch (charset) {
      case 'upper': charsetBits = " lda #$15 \n sta $d018 \n"; break;
      case 'lower': charsetBits = " lda #$17 \n sta $d018 \n"; break;
      default:      charsetBits = " lda #$15 \n sta $d018 \n"; break;
    }
  }

  // SID music only for C64 (C128 BASIC start at $1C01 conflicts with SID at $1000)
  const useMusic = MUSIC && platform === 'c64';
  return singleFrameASM(platform, useMusic, true, label, charsetBits, lines);
}

// ═══════════════════════════════════════════════════════════════════
//  ASSEMBLE
// ═══════════════════════════════════════════════════════════════════

function assemblePlayer(source, macrosBuf) {
  const sourceFileMap = {
    'main.asm':   source,
    'macros.asm': macrosBuf,
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
//  LAUNCH EMULATOR
// ═══════════════════════════════════════════════════════════════════

function launchEmulator(platform, prgFile) {
  const emu = EMULATORS[platform];
  const exePath = path.join(VICE_BIN, emu.exe);
  const args = [...emu.args, '-autostart', prgFile];
  console.log(`  🚀 ${emu.exe} ${emu.args.join(' ')} -autostart ${path.basename(prgFile)}`);
  const child = spawn(exePath, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    shell: true,
  });
  child.unref();
  return child;
}

function askContinue(rl, prompt) {
  return new Promise(resolve => rl.question(prompt, () => resolve()));
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN  (async so we can pause between emulator launches)
// ═══════════════════════════════════════════════════════════════════

async function main() {
  const doLaunch = !process.argv.includes('--no-launch');

  console.log(`\nPetmate Player Export Test`);
  console.log(`Source: ${SRC_FILE}`);
  console.log(`Frames: ${frames.length}`);
  if (MUSIC) console.log(`SID:    ${SID_FILE}`);
  if (doLaunch) {
    console.log(`VICE:   ${VICE_BIN}`);
    console.log(`        (pass --no-launch to skip emulators)`);
  }
  console.log('');

  const rl = doLaunch
    ? readline.createInterface({ input: process.stdin, output: process.stdout })
    : null;

  // Write SID plugin to disk if needed (c64jasm uses require() for plugins)
  const pluginDir = path.join(ROOT, 'plugins');
  if (MUSIC) {
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'sid.js'), sidJs);
  }

  let successes = 0, failures = 0;
  const assembled = [];  // { tag, platform, prgFile }

  // ── Phase 1: Assemble all PRGs ──
  for (let idx = 0; idx < frames.length; idx++) {
    const fb       = frames[idx];
    const tag      = fb.name || `frame${idx}`;
    const platform = getPlatform(fb.charset);
    const prgFile  = path.join(EXPORTS, `${tag}_player.prg`);
    const asmFile  = path.join(EXPORTS, `${tag}_player.asm`);

    console.log(`── Frame ${idx}: ${tag}  (${fb.width}x${fb.height}, charset=${fb.charset}) → ${platform} ──`);

    try {
      const source = generatePlayerSource(fb, platform);
      fs.writeFileSync(asmFile, source, 'utf-8');
      console.log(`  ✓ .asm  → ${path.basename(asmFile)}  (${source.length} bytes)`);

      const result = assemblePlayer(source, macros[platform]);

      if (result.errors && result.errors.length > 0) {
        console.error(`  ✗ Assembly errors:`);
        result.errors.forEach(e => {
          const msg = typeof e === 'string' ? e : JSON.stringify(e);
          console.error(`    ${msg}`);
        });
        failures++;
      } else {
        fs.writeFileSync(prgFile, result.prg);
        console.log(`  ✓ .prg  → ${path.basename(prgFile)}  (${result.prg.length} bytes)`);
        assembled.push({ tag, platform, prgFile });
        successes++;
      }
    } catch (e) {
      console.error(`  ✗ FAIL: ${e.message}`);
      failures++;
    }
    console.log('');
  }

  // ── Phase 2: Launch emulators one at a time ──
  if (doLaunch && assembled.length > 0) {
    console.log(`═══ LAUNCHING EMULATORS ═══\n`);
    for (let i = 0; i < assembled.length; i++) {
      const { tag, platform, prgFile } = assembled[i];
      const emu = EMULATORS[platform];
      console.log(`[${i + 1}/${assembled.length}] ${tag} → ${emu.exe}`);
      launchEmulator(platform, prgFile);

      if (i < assembled.length - 1) {
        await askContinue(rl, `  Press Enter for next (${assembled[i + 1].tag})...`);
      } else {
        await askContinue(rl, `  Press Enter to finish...`);
      }
      console.log('');
    }
    rl.close();
  }

  // ── Summary ──
  console.log(`═══ SUMMARY ═══`);
  console.log(`  Assembled: ${successes}/${frames.length}`);
  console.log(`  Failures:  ${failures}`);

  const playerFiles = fs.readdirSync(EXPORTS)
    .filter(f => f.includes('_player'))
    .sort();
  console.log(`\n  Player files (${playerFiles.length}):`);
  playerFiles.forEach(f => {
    const stat = fs.statSync(path.join(EXPORTS, f));
    console.log(`    ${f.padEnd(35)} ${stat.size.toLocaleString().padStart(8)} bytes`);
  });

  process.exit(failures > 0 ? 1 : 0);
}

main();
