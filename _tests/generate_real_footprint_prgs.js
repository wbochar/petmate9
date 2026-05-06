#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const c64jasm = require('c64jasm');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, '_tests', 'exports');
const MACROS_PATH = path.join(ROOT, 'assets', 'macrosc64.asm');

const TRANSPARENT_SCREENCODE = 256;
const VDC_TRANSPARENT_SCREENCODE = 512;
const SCREEN_BYTES = 1000;
const COLOR_PACKED_BYTES = 500;

function toHex8(v) {
  return (v & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

function toHex16(v) {
  return (v & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

function bytesToAsmLines(bytes, bytesPerLine = 16) {
  const out = [];
  for (let i = 0; i < bytes.length; i += bytesPerLine) {
    const chunk = bytes.slice(i, i + bytesPerLine);
    out.push(`\n!byte ${chunk.map((n) => `$${toHex8(n)}`).join(',')}`);
  }
  return out.join('');
}

function screencodeToExportByte(px) {
  if (
    px.transparent === true ||
    px.code === TRANSPARENT_SCREENCODE ||
    px.code === VDC_TRANSPARENT_SCREENCODE
  ) {
    return 0x20;
  }
  return px.code & 0xff;
}

const RLE_MARKER = 0xFE;
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
    const hi = colors[i] & 0x0f;
    const lo = i + 1 < colors.length ? (colors[i + 1] & 0x0f) : 0;
    packed.push((hi << 4) | lo);
  }
  return packed;
}

function buildVic2DeltaRoutineBytes(fromScreen, fromColor, toScreen, toColor, screenBase, colorBase) {
  const valueToAddresses = new Map();
  const colorAliasByNibble = new Map();

  const addWrite = (value, address) => {
    const byteValue = value & 0xff;
    const addresses = valueToAddresses.get(byteValue) || [];
    addresses.push(address & 0xffff);
    valueToAddresses.set(byteValue, addresses);
  };

  for (let i = 0; i < toScreen.length; i++) {
    const srcCode = fromScreen[i] & 0xff;
    const dstCode = toScreen[i] & 0xff;
    if (dstCode !== srcCode) {
      addWrite(dstCode, screenBase + i);
      const nibble = dstCode & 0x0f;
      if (!colorAliasByNibble.has(nibble)) colorAliasByNibble.set(nibble, dstCode);
    }

    const srcCol = fromColor[i] & 0x0f;
    const dstCol = toColor[i] & 0x0f;
    if (dstCol !== srcCol) {
      let loadValue = dstCol;
      if (!valueToAddresses.has(loadValue) && colorAliasByNibble.has(dstCol)) {
        loadValue = colorAliasByNibble.get(dstCol);
      }
      addWrite(loadValue, colorBase + i);
    }
  }

  const out = [];
  valueToAddresses.forEach((addresses, value) => {
    out.push(0xA9, value & 0xff); // LDA #imm
    for (const addr of addresses) {
      out.push(0x8D, addr & 0xff, (addr >> 8) & 0xff); // STA abs
    }
  });
  out.push(0x60); // RTS
  return out;
}

function parseSidFile(buf) {
  if (buf.length < 4) throw new Error('SID file too small');
  const magic = buf.toString('ascii', 0, 4);
  const isSid = magic === 'PSID' || magic === 'RSID';
  if (!isSid) throw new Error('Expected PSID/RSID file');

  const readWordBE = (o) => (buf[o] << 8) + buf[o + 1];
  const dataOffset = readWordBE(6);
  let loadAddress = readWordBE(8);
  let dataStart = dataOffset;
  if (loadAddress === 0) {
    loadAddress = buf[dataOffset] | (buf[dataOffset + 1] << 8);
    dataStart += 2;
  }
  const data = [...buf.slice(dataStart)];
  return { loadAddress, data };
}

function buildAnimationPayloadFromPetmate(petmatePath, startFrame, frameCount) {
  const petmate = JSON.parse(fs.readFileSync(petmatePath, 'utf8'));
  const frames = (petmate.framebufs || []).slice(startFrame, startFrame + frameCount);
  if (frames.length !== frameCount) {
    throw new Error(`Expected ${frameCount} frames in ${petmatePath}, found ${frames.length}`);
  }

  const width = frames[0].width;
  const height = frames[0].height;
  if (width !== 40 || height !== 25) {
    throw new Error(`Expected 40x25 frame size, got ${width}x${height} in ${petmatePath}`);
  }

  const processed = frames.map((fb) => {
    const screenCodes = [];
    const colorValues = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const px = fb.framebuf[y][x];
        screenCodes.push(screencodeToExportByte(px));
        colorValues.push(px.color & 0x0f);
      }
    }
    return {
      borderVal: fb.borderColor & 0xff,
      bgVal: fb.backgroundColor & 0xff,
      rleScreen: rleEncode(screenCodes),
      packedColors: nibblePack(colorValues),
      screenCodes,
      colorValues,
    };
  });

  let frameDataAsm = '';
  let frameDataBytes = 0;
  for (let i = 0; i < processed.length; i++) {
    frameDataAsm += `\nframe${i}_scr:`;
    frameDataAsm += bytesToAsmLines(processed[i].rleScreen, 16);
    frameDataAsm += `\nframe${i}_col:`;
    frameDataAsm += bytesToAsmLines(processed[i].packedColors, 16);
    frameDataBytes += processed[i].rleScreen.length + processed[i].packedColors.length;
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
      0x0400,
      0xD800
    );
    frameDeltaAsm += `\nframe${i}_delta:`;
    frameDeltaAsm += bytesToAsmLines(deltaBytes, 16);
    frameDeltaBytes += deltaBytes.length;
  }

  const interleaved = [];
  const frame1RowScrLoVals = [];
  const frame1RowScrHiVals = [];
  const frame1RowColLoVals = [];
  const frame1RowColHiVals = [];
  const startup = processed[0];
  for (let row = 0; row < height; row++) {
    const rowOffset = row * width;
    const scrAddr = (0x0400 + rowOffset) & 0xffff;
    const colAddr = (0xD800 + rowOffset) & 0xffff;
    frame1RowScrLoVals.push(`$${toHex8(scrAddr & 0xff)}`);
    frame1RowScrHiVals.push(`$${toHex8((scrAddr >> 8) & 0xff)}`);
    frame1RowColLoVals.push(`$${toHex8(colAddr & 0xff)}`);
    frame1RowColHiVals.push(`$${toHex8((colAddr >> 8) & 0xff)}`);

    for (let col = 0; col < width; col++) interleaved.push(startup.screenCodes[rowOffset + col] & 0xff);
    for (let col = 0; col < width; col++) interleaved.push(startup.colorValues[rowOffset + col] & 0x0f);
  }

  const frame1InterleavedAsm = `\nframe1_full_interleaved:${bytesToAsmLines(interleaved, width)}`;
  const borders = processed.map((f) => f.borderVal).join(',');
  const bgs = processed.map((f) => f.bgVal).join(',');
  const scrLos = processed.map((_, i) => `frame${i}_scr & $ff`).join(',');
  const scrHis = processed.map((_, i) => `frame${i}_scr >> 8`).join(',');
  const colLos = processed.map((_, i) => `frame${i}_col & $ff`).join(',');
  const colHis = processed.map((_, i) => `frame${i}_col >> 8`).join(',');
  const deltaRetLos = processed.map((_, i) => `(frame${i}_delta - 1) & $ff`).join(',');
  const deltaRetHis = processed.map((_, i) => `((frame${i}_delta - 1) >> 8) & $ff`).join(',');

  return {
    width,
    height,
    frameCount: processed.length,
    frameDataAsm,
    frameDeltaAsm,
    frame1InterleavedAsm,
    frame1InterleavedBytes: interleaved.length,
    frameDataBytes,
    frameDeltaBytes,
    borders,
    bgs,
    scrLos,
    scrHis,
    colLos,
    colHis,
    deltaRetLos,
    deltaRetHis,
    frame1RowScrLo: frame1RowScrLoVals.join(','),
    frame1RowScrHi: frame1RowScrHiVals.join(','),
    frame1RowColLo: frame1RowColLoVals.join(','),
    frame1RowColHi: frame1RowColHiVals.join(','),
  };
}

function buildSource(payload, sidBytes, sidAddressHex, sidAfterFrames) {
  const sidStart = parseInt(sidAddressHex.replace('$', ''), 16) & 0xffff;
  const sidDataAsm = `\n* = ${sidAddressHex}\nsid_data:${bytesToAsmLines(sidBytes, 16)}`;

  const sidHeaderAsm = `\n!let sid_startAddress = $${toHex16(sidStart)}\n!let sid_init = $${toHex16(sidStart)}\n!let sid_play = $${toHex16((sidStart + 3) & 0xffff)}`;

  const source = `
; Production-footprint animation memory test
!include "macros.asm"${sidHeaderAsm}

!let irq_top_line  = 1
!let debug_build   = FALSE
!let ANIM_FRAMES   = ${payload.frameCount}
!let ANIM_SPEED    = 6
!let RLE_MARKER    = $fe
!let zp_src        = $20
!let zp_dst        = $22
!let zp_remain     = $24
!let zp_rle_val    = $26

+basic_start(entry)

entry: {
    lda #0
    jsr sid_init
    sei
    lda #$35
    sta $01
    +setup_irq(irq_top, irq_top_line)
    cli
    lda #$15
    sta $d018
    lda #0
    sta currentFrame
    lda #ANIM_SPEED
    sta delayCounter
    jsr copy_frame1_full_interleaved
    ldx currentFrame
    lda frame_border,x
    sta $d020
    lda frame_bg,x
    sta $d021
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
    sta delayCounter
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
    sta $d020
    lda frame_bg,y
    sta $d021
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
    ldx #${payload.width}
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
    ldx #${payload.width}
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
    cmp #${payload.height}
    bne copy_frame1_row_loop
    rts
}

irq_top: {
    +irq_start(end)
    inc frameCount
    lda musicMuted
    bne skip_music
    jsr sid_play
skip_music:
    +irq_end(irq_top, irq_top_line)
end:
}

frameCount:     !byte 0
currentFrame:   !byte 0
delayCounter:   !byte 0
musicMuted:     !byte 0
animPaused:     !byte 0

check_keys: {
    lda #$df
    sta $dc00
    lda $dc01
    and #$02
    bne no_p
    lda musicMuted
    eor #1
    sta musicMuted
p_wait:
    lda #$df
    sta $dc00
    lda $dc01
    and #$02
    beq p_wait
no_p:
    lda #$7f
    sta $dc00
    lda $dc01
    and #$10
    bne no_space
    lda animPaused
    eor #1
    sta animPaused
space_wait:
    lda #$7f
    sta $dc00
    lda $dc01
    and #$10
    beq space_wait
no_space:
    lda #$ff
    sta $dc00
    rts
}

frame_border: !byte ${payload.borders}
frame_bg:     !byte ${payload.bgs}
frame_scr_lo: !byte ${payload.scrLos}
frame_scr_hi: !byte ${payload.scrHis}
frame_col_lo: !byte ${payload.colLos}
frame_col_hi: !byte ${payload.colHis}
frame_delta_ret_lo: !byte ${payload.deltaRetLos}
frame_delta_ret_hi: !byte ${payload.deltaRetHis}
frame1_row_scr_lo: !byte ${payload.frame1RowScrLo}
frame1_row_scr_hi: !byte ${payload.frame1RowScrHi}
frame1_row_col_lo: !byte ${payload.frame1RowColLo}
frame1_row_col_hi: !byte ${payload.frame1RowColHi}

${sidAfterFrames ? '' : sidDataAsm}
* = $2000
${payload.frameDeltaAsm}
${payload.frame1InterleavedAsm}
${payload.frameDataAsm}
${sidAfterFrames ? sidDataAsm : ''}
`;
  return source;
}

function assembleOne(cfg, macrosAsm) {
  const payload = buildAnimationPayloadFromPetmate(
    path.resolve(ROOT, cfg.petmatePath),
    cfg.startFrame,
    cfg.frameCount
  );
  const sidInfo = parseSidFile(fs.readFileSync(path.resolve(ROOT, cfg.sidPath)));
  const source = buildSource(payload, sidInfo.data, cfg.sidAddressHex, cfg.sidAfterFrames);

  const res = c64jasm.assemble('main.asm', {
    readFileSync: (fname) => {
      const key = fname.replace(/\\/g, '/');
      if (key === 'main.asm') return Buffer.from(source);
      if (key === 'macros.asm') return Buffer.from(macrosAsm);
      throw new Error(`Missing include: ${fname}`);
    },
  });

  if (res.errors.length) {
    throw new Error(
      `${cfg.outputBase} assembly failed:\n${res.errors.map((e) => e.formatted || JSON.stringify(e)).join('\n')}`
    );
  }

  const prgPath = path.join(OUT_DIR, `${cfg.outputBase}.prg`);
  const labelsPath = path.join(OUT_DIR, `${cfg.outputBase}.labels.json`);
  const summaryPath = path.join(OUT_DIR, `${cfg.outputBase}.summary.json`);
  fs.writeFileSync(prgPath, res.prg);
  fs.writeFileSync(labelsPath, JSON.stringify(res.labels, null, 2));

  const pick = (name) => {
    const hit = res.labels.find((l) => l.name === name);
    return hit ? `$${toHex16(hit.addr)}` : null;
  };

  const summary = {
    output: path.relative(ROOT, prgPath).replace(/\\/g, '/'),
    petmate: cfg.petmatePath,
    sid: cfg.sidPath,
    sidAddress: cfg.sidAddressHex,
    frameCount: payload.frameCount,
    frameDataBytes: payload.frameDataBytes,
    frameDeltaBytes: payload.frameDeltaBytes,
    frame1InterleavedBytes: payload.frame1InterleavedBytes,
    sidDataBytes: sidInfo.data.length,
    prgBytes: res.prg.length,
    labels: {
      entry: pick('entry'),
      sid_data: pick('sid_data'),
      frame0_scr: pick('frame0_scr'),
      frame4_scr: pick('frame4_scr'),
      frame0_delta: pick('frame0_delta'),
      frame1_full_interleaved: pick('frame1_full_interleaved'),
    },
  };
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  return summary;
}
function getCliArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return null;
}

function parseBoolArg(name) {
  const val = getCliArg(name);
  if (val === null) return null;
  const norm = String(val).toLowerCase();
  if (norm === 'true' || norm === '1' || norm === 'yes') return true;
  if (norm === 'false' || norm === '0' || norm === 'no') return false;
  throw new Error(`Invalid boolean for --${name}: ${val}`);
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const macrosAsm = fs.readFileSync(MACROS_PATH, 'utf8');
  let jobs;
  const customPetmate = getCliArg('petmate');
  const customSid = getCliArg('sid');
  if (customPetmate || customSid) {
    if (!customPetmate || !customSid) {
      throw new Error('Custom mode requires both --petmate and --sid');
    }
    const sidAddressHex = getCliArg('sidAddress') || '$1000';
    const sidAddressNum = parseInt(String(sidAddressHex).replace('$', ''), 16);
    if (!Number.isFinite(sidAddressNum)) {
      throw new Error(`Invalid --sidAddress value: ${sidAddressHex}`);
    }
    const sidAfterFramesArg = parseBoolArg('sidAfterFrames');
    const sidAfterFrames = sidAfterFramesArg === null ? sidAddressNum >= 0x2000 : sidAfterFramesArg;
    const startFrame = parseInt(getCliArg('startFrame') || '0', 10);
    const frameCount = parseInt(getCliArg('frameCount') || '5', 10);
    const outputBase = getCliArg('outputBase') || 'prod_real_custom';
    jobs = [
      {
        outputBase,
        petmatePath: customPetmate,
        sidPath: customSid,
        sidAddressHex,
        sidAfterFrames,
        startFrame,
        frameCount,
      },
    ];
  } else {
    jobs = [
      {
        outputBase: 'prod_real_computers_commando_sid1000',
        petmatePath: '_defaults/computers_097a.petmate',
        sidPath: '_tests/sids/Commando.sid',
        sidAddressHex: '$1000',
        sidAfterFrames: false,
        startFrame: 0,
        frameCount: 5,
      },
      {
        outputBase: 'prod_real_chunky_geosix_sid5000',
        petmatePath: '_defaults/chunkyfail2.petmate',
        sidPath: '_tests/sids/Geosix11.sid',
        sidAddressHex: '$5000',
        sidAfterFrames: true,
        startFrame: 0,
        frameCount: 5,
      },
    ];
  }

  const results = jobs.map((j) => assembleOne(j, macrosAsm));
  console.log('\nGenerated production-footprint PRG artifacts:');
  for (const r of results) {
    console.log(
      `- ${r.output} | SID ${r.sidAddress} (${r.sidDataBytes} bytes) | frameData=${r.frameDataBytes} delta=${r.frameDeltaBytes} interleaved=${r.frame1InterleavedBytes} | PRG=${r.prgBytes}`
    );
  }
}

main();
