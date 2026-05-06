#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const c64jasm = require('c64jasm');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, '_tests', 'exports');
const MACROS_PATH = path.join(ROOT, 'assets', 'macrosvic20.asm');

const FRAME_WIDTH = 22;
const FRAME_HEIGHT = 23;
const FRAME_SIZE = FRAME_WIDTH * FRAME_HEIGHT;
const SCREEN_BASE = 0x1E00;
const COLOR_BASE = 0x9600;
const RLE_MARKER = 0xFE;

function parseArg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return fallback;
}

function toHex8(v) {
  return (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function toHex16(v) {
  return (v & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

function bytesToAsmLines(bytes, bytesPerLine = 16) {
  const out = [];
  for (let i = 0; i < bytes.length; i += bytesPerLine) {
    const chunk = bytes.slice(i, i + bytesPerLine);
    out.push(`\n!byte ${chunk.map((n) => `$${toHex8(n)}`).join(',')}`);
  }
  return out.join('');
}

function rleEncode(bytes) {
  const out = [];
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    let run = 1;
    while (i + run < bytes.length && bytes[i + run] === b && run < 255) run++;
    if (b === RLE_MARKER) {
      if (run === 1) out.push(RLE_MARKER, 0);
      else out.push(RLE_MARKER, run, RLE_MARKER);
    } else if (run >= 4) {
      out.push(RLE_MARKER, run, b);
    } else {
      for (let j = 0; j < run; j++) out.push(b);
    }
    i += run;
  }
  return out;
}

function nibblePack(colors) {
  const packed = [];
  for (let i = 0; i < colors.length; i += 2) {
    const hi = colors[i] & 0x0F;
    const lo = i + 1 < colors.length ? (colors[i + 1] & 0x0F) : 0;
    packed.push((hi << 4) | lo);
  }
  return packed;
}

function buildVic2DeltaRoutineBytes(fromScreen, fromColor, toScreen, toColor, screenBase, colorBase) {
  const valueToAddresses = new Map();
  const colorAliasByNibble = new Map();

  const addWrite = (value, address) => {
    const byteValue = value & 0xFF;
    const addresses = valueToAddresses.get(byteValue) || [];
    addresses.push(address & 0xFFFF);
    valueToAddresses.set(byteValue, addresses);
  };

  for (let i = 0; i < toScreen.length; i++) {
    const srcCode = fromScreen[i] & 0xFF;
    const dstCode = toScreen[i] & 0xFF;
    if (dstCode !== srcCode) {
      addWrite(dstCode, screenBase + i);
      const nibble = dstCode & 0x0F;
      if (!colorAliasByNibble.has(nibble)) {
        colorAliasByNibble.set(nibble, dstCode);
      }
    }

    const srcColor = fromColor[i] & 0x0F;
    const dstColor = toColor[i] & 0x0F;
    if (dstColor !== srcColor) {
      let loadValue = dstColor;
      if (!valueToAddresses.has(loadValue) && colorAliasByNibble.has(dstColor)) {
        loadValue = colorAliasByNibble.get(dstColor);
      }
      addWrite(loadValue, colorBase + i);
    }
  }

  const out = [];
  valueToAddresses.forEach((addresses, value) => {
    out.push(0xA9, value & 0xFF); // LDA #imm
    for (const addr of addresses) {
      out.push(0x8D, addr & 0xFF, (addr >> 8) & 0xFF); // STA abs
    }
  });
  out.push(0x60); // RTS
  return out;
}

function createSyntheticFrames(frameCount) {
  const frames = [];
  for (let i = 0; i < frameCount; i++) {
    const screenCodes = new Array(FRAME_SIZE).fill(32);
    const colorValues = new Array(FRAME_SIZE).fill(1);

    // Four probe cells that change every frame (small deltas, easy monitor checks).
    const probeCodes = [
      ((i + 0) % 26) + 1,
      ((i + 5) % 26) + 1,
      ((i + 10) % 26) + 1,
      ((i + 15) % 26) + 1,
    ];
    const probeColors = [
      (i + 0) % 16,
      (i * 3 + 1) % 16,
      (i * 5 + 2) % 16,
      (i * 7 + 3) % 16,
    ];
    const probeOffsets = [0, 1, FRAME_WIDTH, FRAME_WIDTH + 1];
    for (let p = 0; p < probeOffsets.length; p++) {
      const off = probeOffsets[p];
      screenCodes[off] = probeCodes[p];
      colorValues[off] = probeColors[p];
    }

    const borderColor = i % 8;
    const backgroundColor = (i + 2) % 8;
    const borderVal = (backgroundColor * 16) + borderColor + 8;

    frames.push({
      screenCodes,
      colorValues,
      borderVal,
      bgVal: 0,
      topLeftCode: screenCodes[0] & 0xFF,
      topLeftColor: colorValues[0] & 0x0F,
    });
  }
  return frames;
}

function labelAddr(labels, name) {
  const hit = labels.find((l) => l.name === name);
  return hit ? hit.addr : null;
}

function main() {
  const frameCount = Math.max(2, parseInt(parseArg('--frames', '8'), 10) || 8);
  const fps = Math.max(1, parseFloat(parseArg('--fps', '12')) || 12);
  const animSpeed = Math.max(1, Math.min(255, Math.round(60 / fps)));
  const dataStart = String(parseArg('--data-start', '$1200'));
  const outputBase = String(parseArg('--output-base', 'vic20_anim_delta_test'));
  const outputAsm = path.join(OUT_DIR, `${outputBase}.asm`);
  const outputPrg = path.join(OUT_DIR, `${outputBase}.prg`);
  const outputLabels = path.join(OUT_DIR, `${outputBase}.labels.json`);
  const outputSummary = path.join(OUT_DIR, `${outputBase}.summary.json`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const macrosAsm = fs.readFileSync(MACROS_PATH, 'utf8');
  const frames = createSyntheticFrames(frameCount);
  const processed = frames.map((f) => ({
    ...f,
    rleScreen: rleEncode(f.screenCodes),
    packedColors: nibblePack(f.colorValues),
  }));

  let frameDataAsm = '';
  let framePayloadBytes = 0;
  for (let i = 0; i < processed.length; i++) {
    frameDataAsm += `\nframe${i}_scr:`;
    frameDataAsm += bytesToAsmLines(processed[i].rleScreen, 16);
    frameDataAsm += `\nframe${i}_col:`;
    frameDataAsm += bytesToAsmLines(processed[i].packedColors, 16);
    framePayloadBytes += processed[i].rleScreen.length + processed[i].packedColors.length;
  }

  let frameDeltaAsm = '';
  let frameDeltaBytes = 0;
  for (let i = 0; i < processed.length; i++) {
    const nextIndex = (i + 1) % processed.length;
    const deltaBytes = buildVic2DeltaRoutineBytes(
      processed[i].screenCodes,
      processed[i].colorValues,
      processed[nextIndex].screenCodes,
      processed[nextIndex].colorValues,
      SCREEN_BASE,
      COLOR_BASE,
    );
    frameDeltaAsm += `\nframe${i}_delta:`;
    frameDeltaAsm += bytesToAsmLines(deltaBytes, 16);
    frameDeltaBytes += deltaBytes.length;
  }

  const startupFrame = processed[0];
  const frame1Interleaved = [];
  const frame1RowScrLoVals = [];
  const frame1RowScrHiVals = [];
  const frame1RowColLoVals = [];
  const frame1RowColHiVals = [];
  for (let row = 0; row < FRAME_HEIGHT; row++) {
    const rowOffset = row * FRAME_WIDTH;
    const scrAddr = (SCREEN_BASE + rowOffset) & 0xFFFF;
    const colAddr = (COLOR_BASE + rowOffset) & 0xFFFF;
    frame1RowScrLoVals.push(`$${toHex8(scrAddr & 0xFF)}`);
    frame1RowScrHiVals.push(`$${toHex8((scrAddr >> 8) & 0xFF)}`);
    frame1RowColLoVals.push(`$${toHex8(colAddr & 0xFF)}`);
    frame1RowColHiVals.push(`$${toHex8((colAddr >> 8) & 0xFF)}`);

    for (let col = 0; col < FRAME_WIDTH; col++) {
      frame1Interleaved.push(startupFrame.screenCodes[rowOffset + col] & 0xFF);
    }
    for (let col = 0; col < FRAME_WIDTH; col++) {
      frame1Interleaved.push(startupFrame.colorValues[rowOffset + col] & 0x0F);
    }
  }
  const frame1InterleavedAsm = `\nframe1_full_interleaved:${bytesToAsmLines(frame1Interleaved, FRAME_WIDTH)}`;

  const borders = processed.map((f) => f.borderVal).join(',');
  const bgs = processed.map((f) => f.bgVal).join(',');
  const scrLos = processed.map((_, i) => `frame${i}_scr & $ff`).join(',');
  const scrHis = processed.map((_, i) => `frame${i}_scr >> 8`).join(',');
  const colLos = processed.map((_, i) => `frame${i}_col & $ff`).join(',');
  const colHis = processed.map((_, i) => `frame${i}_col >> 8`).join(',');
  const deltaRetLos = processed.map((_, i) => `(frame${i}_delta - 1) & $ff`).join(',');
  const deltaRetHis = processed.map((_, i) => `((frame${i}_delta - 1) >> 8) & $ff`).join(',');

  const source = `
; VIC-20 delta/interleaved animation test payload
!include "macros.asm"
!let ANIM_FRAMES   = ${frameCount}
!let ANIM_SPEED    = ${animSpeed}
!let zp_src        = $20
!let zp_dst        = $22
!let zp_rle_val    = $26
+basic_start(entry)
entry: {
    lda #$f0
    sta $9005
    lda #0
    sta currentFrame
    jsr copy_frame1_full_interleaved
    ldx currentFrame
    lda frame_border,x
    sta $900f
main_loop:
    jsr delay_frames
    jsr check_keys
    lda animPaused
    bne main_loop
    ldx currentFrame
    jsr show_frame_delta
    inx
    cpx #ANIM_FRAMES
    bne no_wrap_after_delta
    ldx #0
no_wrap_after_delta:
    stx currentFrame
    jmp main_loop
}
show_frame_delta: {
    txa
    clc
    adc #1
    cmp #ANIM_FRAMES
    bcc delta_meta_ok
    lda #0
delta_meta_ok:
    tay
    lda frame_border,y
    sta $900f
    lda frame_delta_ret_hi,x
    pha
    lda frame_delta_ret_lo,x
    pha
    rts
}
copy_frame1_full_interleaved: {
    lda #<frame1_full_interleaved
    sta zp_src
    lda #>frame1_full_interleaved
    sta zp_src+1
    lda #0
    sta zp_rle_val
copy_frame1_row_loop:
    ldx zp_rle_val
    lda frame1_row_scr_lo,x
    sta zp_dst
    lda frame1_row_scr_hi,x
    sta zp_dst+1
    ldy #0
    ldx #${FRAME_WIDTH}
copy_frame1_screen_bytes:
    lda (zp_src),y
    sta (zp_dst),y
    iny
    dex
    bne copy_frame1_screen_bytes
    tya
    clc
    adc zp_src
    sta zp_src
    bcc copy_frame1_screen_src_ok
    inc zp_src+1
copy_frame1_screen_src_ok:
    ldx zp_rle_val
    lda frame1_row_col_lo,x
    sta zp_dst
    lda frame1_row_col_hi,x
    sta zp_dst+1
    ldy #0
    ldx #${FRAME_WIDTH}
copy_frame1_color_bytes:
    lda (zp_src),y
    and #$0f
    sta (zp_dst),y
    iny
    dex
    bne copy_frame1_color_bytes
    tya
    clc
    adc zp_src
    sta zp_src
    bcc copy_frame1_color_src_ok
    inc zp_src+1
copy_frame1_color_src_ok:
    inc zp_rle_val
    lda zp_rle_val
    cmp #${FRAME_HEIGHT}
    bne copy_frame1_row_loop
    rts
}
check_keys: {
    jsr $ffe4
    cmp #$20
    bne no_space
    lda animPaused
    eor #1
    sta animPaused
no_space:
    rts
}
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
}
currentFrame:   !byte 0
animPaused:     !byte 0
frame_border: !byte ${borders}
frame_bg:     !byte ${bgs}
frame_scr_lo: !byte ${scrLos}
frame_scr_hi: !byte ${scrHis}
frame_col_lo: !byte ${colLos}
frame_col_hi: !byte ${colHis}
frame_delta_ret_lo: !byte ${deltaRetLos}
frame_delta_ret_hi: !byte ${deltaRetHis}
frame1_row_scr_lo: !byte ${frame1RowScrLoVals.join(',')}
frame1_row_scr_hi: !byte ${frame1RowScrHiVals.join(',')}
frame1_row_col_lo: !byte ${frame1RowColLoVals.join(',')}
frame1_row_col_hi: !byte ${frame1RowColHiVals.join(',')}
* = ${dataStart}
${frameDeltaAsm}
${frame1InterleavedAsm}
${frameDataAsm}
`;

  fs.writeFileSync(outputAsm, source, 'utf8');

  const res = c64jasm.assemble('main.asm', {
    readFileSync: (fname) => {
      const key = fname.replace(/\\/g, '/');
      if (key === 'main.asm') return Buffer.from(source);
      if (key === 'macros.asm') return Buffer.from(macrosAsm);
      throw new Error(`Missing include: ${fname}`);
    },
  });

  if (res.errors && res.errors.length) {
    const msg = res.errors.map((e) => (e.formatted || JSON.stringify(e))).join('\n');
    throw new Error(`Assembly failed:\n${msg}`);
  }

  fs.writeFileSync(outputPrg, res.prg);
  fs.writeFileSync(outputLabels, JSON.stringify(res.labels, null, 2));

  const mainLoopAddr = labelAddr(res.labels, 'main_loop');
  const scopedMainLoopAddr = labelAddr(res.labels, 'entry::main_loop');

  const summary = {
    output: path.relative(ROOT, outputPrg).replace(/\\/g, '/'),
    asm: path.relative(ROOT, outputAsm).replace(/\\/g, '/'),
    labels: {
      entry: labelAddr(res.labels, 'entry') != null ? `$${toHex16(labelAddr(res.labels, 'entry'))}` : null,
      main_loop: (mainLoopAddr != null || scopedMainLoopAddr != null)
        ? `$${toHex16(mainLoopAddr != null ? mainLoopAddr : scopedMainLoopAddr)}`
        : null,
      currentFrame: labelAddr(res.labels, 'currentFrame') != null ? `$${toHex16(labelAddr(res.labels, 'currentFrame'))}` : null,
      animPaused: labelAddr(res.labels, 'animPaused') != null ? `$${toHex16(labelAddr(res.labels, 'animPaused'))}` : null,
      frame_border: labelAddr(res.labels, 'frame_border') != null ? `$${toHex16(labelAddr(res.labels, 'frame_border'))}` : null,
    },
    frameCount,
    frameWidth: FRAME_WIDTH,
    frameHeight: FRAME_HEIGHT,
    topLeftCodes: processed.map((f) => f.topLeftCode),
    topLeftColors: processed.map((f) => f.topLeftColor),
    borderValues: processed.map((f) => f.borderVal),
    bytes: {
      framePayloadBytes,
      frameDeltaBytes,
      frame1InterleavedBytes: frame1Interleaved.length,
      prgBytes: res.prg.length,
    },
  };
  fs.writeFileSync(outputSummary, JSON.stringify(summary, null, 2));

  console.log(`Generated ${path.relative(ROOT, outputPrg).replace(/\\/g, '/')}`);
  console.log(`ASM: ${path.relative(ROOT, outputAsm).replace(/\\/g, '/')}`);
  console.log(`Summary: ${path.relative(ROOT, outputSummary).replace(/\\/g, '/')}`);
  console.log(
    `Payload bytes: frame=${summary.bytes.framePayloadBytes} ` +
    `delta=${summary.bytes.frameDeltaBytes} interleaved=${summary.bytes.frame1InterleavedBytes} ` +
    `prg=${summary.bytes.prgBytes}`
  );
}

main();
