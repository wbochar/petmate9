#!/usr/bin/env node
/**
 * Generate a multi-frame .petmate workspace used by Tools > Color Bars.
 * Each frame name is the exact menu label so runtime lookup is stable.
 */
const fs = require('fs');
const path = require('path');

const SPACE = 32;
const BLOCK = 160;
const HLINE = 64;

const FRAMES = [
  { title: 'C64 Uppercase 40x25', charset: 'upper', width: 40, height: 25, backgroundColor: 6, borderColor: 14, borderOn: true, columnMode: 40 },
  { title: 'C64 Lowercase 40x25', charset: 'lower', width: 40, height: 25, backgroundColor: 6, borderColor: 14, borderOn: true, columnMode: 40 },
  { title: 'C128 Uppercase 40x25', charset: 'c128Upper', width: 40, height: 25, backgroundColor: 11, borderColor: 13, borderOn: true, columnMode: 40 },
  { title: 'C128 Lowercase 40x25', charset: 'c128Lower', width: 40, height: 25, backgroundColor: 11, borderColor: 13, borderOn: true, columnMode: 40 },
  { title: 'C128 VDC 80x25', charset: 'c128vdc', width: 80, height: 25, backgroundColor: 0, borderColor: 0, borderOn: false, columnMode: 80 },
  { title: 'C16 Uppercase 40x25', charset: 'c16Upper', width: 40, height: 25, backgroundColor: 0x71, borderColor: 0x6b, borderOn: true, columnMode: 40 },
  { title: 'C16 Lowercase 40x25', charset: 'c16Lower', width: 40, height: 25, backgroundColor: 0x71, borderColor: 0x6b, borderOn: true, columnMode: 40 },
  { title: 'Vic20 Uppercase 22x23', charset: 'vic20Upper', width: 22, height: 23, backgroundColor: 1, borderColor: 3, borderOn: true, columnMode: 40 },
  { title: 'Vic20 Lowercase 22x23', charset: 'vic20Lower', width: 22, height: 23, backgroundColor: 1, borderColor: 3, borderOn: true, columnMode: 40 },
  { title: 'PET Graphics 40x25', charset: 'petGfx', width: 40, height: 25, backgroundColor: 0, borderColor: 0, borderOn: true, columnMode: 40 },
  { title: 'PET Business 40x25', charset: 'petBiz', width: 40, height: 25, backgroundColor: 0, borderColor: 0, borderOn: true, columnMode: 40 },
  { title: 'PET Graphics 80x25', charset: 'petGfx', width: 80, height: 25, backgroundColor: 0, borderColor: 0, borderOn: true, columnMode: 80 },
  { title: 'PET Business 80x25', charset: 'petBiz', width: 80, height: 25, backgroundColor: 0, borderColor: 0, borderOn: true, columnMode: 80 },
];

function defaultFgColor(charset) {
  if (charset.startsWith('c16')) return 0x00;
  if (charset === 'c128vdc') return 15;
  return 14;
}

function titleBarColors(charset) {
  if (charset.startsWith('c16')) return { bg: 0x36, fg: 0x71 };
  if (charset === 'c128vdc') return { bg: 7, fg: 0 };
  if (charset.startsWith('pet')) return { bg: 1, fg: 0 };
  if (charset.startsWith('vic20')) return { bg: 6, fg: 1 };
  if (charset.startsWith('c128')) return { bg: 6, fg: 14 };
  return { bg: 6, fg: 14 };
}

function paletteValues(charset) {
  if (charset.startsWith('c16')) {
    // TED hue bars at luminance 7.
    return Array.from({ length: 16 }, (_, i) => 0x70 + i);
  }
  return Array.from({ length: 16 }, (_, i) => i);
}

function labelColor(charset, barColor) {
  if (charset.startsWith('c16')) {
    return ((barColor >> 4) & 0x0f) >= 4 ? 0x00 : 0x71;
  }
  return [0, 2, 6, 8, 9, 11].includes(barColor) ? 1 : 0;
}

function textToScreencodes(str) {
  return [...str].map((ch) => {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90) return c - 64;  // A-Z
    if (c >= 97 && c <= 122) return c - 96; // a-z
    if (c >= 48 && c <= 57) return c;       // 0-9
    if (ch === ' ') return 32;
    if (ch === '-') return 45;
    if (ch === ':') return 58;
    if (ch === '/') return 47;
    if (ch === '&') return 38;
    if (ch === '#') return 35;
    return 32;
  });
}

function blank(width, height, color) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ code: SPACE, color }))
  );
}

function writeText(fb, row, col, text, color) {
  if (row < 0 || row >= fb.length) return;
  const width = fb[0].length;
  const codes = textToScreencodes(text);
  for (let i = 0; i < codes.length; i++) {
    const x = col + i;
    if (x < 0 || x >= width) continue;
    fb[row][x] = { code: codes[i], color };
  }
}

function fillRect(fb, y1, x1, y2, x2, code, color) {
  const h = fb.length;
  const w = fb[0].length;
  for (let y = y1; y <= y2; y++) {
    if (y < 0 || y >= h) continue;
    for (let x = x1; x <= x2; x++) {
      if (x < 0 || x >= w) continue;
      fb[y][x] = { code, color };
    }
  }
}

function segmentForIndex(i, n, width) {
  const x1 = Math.floor((i * width) / n);
  const x2 = Math.floor(((i + 1) * width) / n) - 1;
  return [x1, Math.max(x1, x2)];
}
function isLowercaseBasedBarStyle(def) {
  const title = String(def.title || '').toLowerCase();
  const charset = String(def.charset || '').toLowerCase();
  if (title.includes('lowercase')) return true;
  if (charset.includes('lower')) return true;
  if (charset === 'petbiz') return true;
  return false;
}

function buildStyledColorBarsFrame(def, opts = {}) {
  const { title, charset, width, height, columnMode } = def;
  const fg = defaultFgColor(charset);
  const fb = blank(width, height, fg);
  const titleText = title.toUpperCase();
  const centeredTitleCol = Math.max(0, Math.floor((width - titleText.length) / 2));
  const titleShift = opts.shiftTitleRight ? 1 : 0;
  const titleCol = Math.min(width - titleText.length, centeredTitleCol + titleShift);
  writeText(fb, 0, titleCol, titleText, 1);

  const BORDER_TOP = 111;
  const BORDER_BOTTOM = 119;
  const BORDER_LEFT = 106;
  const BORDER_RIGHT = 101;

  const barColors = paletteValues(charset);
  const barCount = barColors.length;
  const barWidth = typeof opts.barWidth === 'number' ? opts.barWidth : 2;
  const innerWidth = barCount * barWidth;
  const boxWidth = innerWidth + 2;
  let boxLeft = typeof opts.boxLeft === 'number'
    ? opts.boxLeft
    : Math.max(0, Math.floor((width - boxWidth) / 2));
  let boxRight = boxLeft + boxWidth - 1;
  if (boxRight >= width) {
    boxRight = width - 1;
    boxLeft = Math.max(0, boxRight - boxWidth + 1);
  }
  const topBorderRow = 1;
  const barsTop = 2;
  const barsHeight = 7;
  const barsBottom = barsTop + barsHeight - 1;
  const bottomBorderRow = barsBottom + 1;

  for (let x = boxLeft + 1; x <= boxRight - 1; x++) {
    fb[topBorderRow][x] = { code: BORDER_TOP, color: 1 };
    fb[bottomBorderRow][x] = { code: BORDER_BOTTOM, color: 1 };
  }
  for (let y = barsTop; y <= barsBottom; y++) {
    fb[y][boxLeft] = { code: BORDER_LEFT, color: 1 };
    fb[y][boxRight] = { code: BORDER_RIGHT, color: 1 };
  }

  const useLowerStyle = (typeof opts.forceLowerStyle === 'boolean')
    ? opts.forceLowerStyle
    : isLowercaseBasedBarStyle(def);
  const barsLeft = boxLeft + 1;
  const decimalRow = barsTop + 2;
  const separatorRow = decimalRow + 1;
  const hexRow = separatorRow + 1;
  const lowerStyleRow = hexRow + 1;
  const bottomStyleRow = lowerStyleRow + 1;

  for (let i = 0; i < barCount; i++) {
    const barColor = barColors[i];
    const x1 = barsLeft + (i * barWidth);
    const x2 = x1 + barWidth - 1;
    const c64LikeLabels = title.startsWith('C64 ');
    const labelFg = c64LikeLabels ? (i === 0 ? 15 : i) : labelColor(charset, barColor);
    if (barWidth >= 2) {
      const topRightCode = useLowerStyle && i > 0 ? 160 : 234;
      const midRightCode = useLowerStyle && i > 0 ? 239 : 250;
      const lowerRightCode = useLowerStyle && i > 0 ? 247 : 208;
      const bottomRightCode = useLowerStyle && i > 0 ? 160 : 234;

      fb[barsTop][x1] = { code: 160, color: barColor };
      fb[barsTop][x2] = { code: topRightCode, color: barColor };
      fb[barsTop + 1][x1] = { code: 239, color: barColor };
      fb[barsTop + 1][x2] = { code: midRightCode, color: barColor };
      writeText(fb, decimalRow, x1, i.toString(10).padStart(2, '0'), labelFg);
      fb[separatorRow][x1] = { code: 45, color: barColor };
      fb[separatorRow][x2] = { code: 45, color: barColor };
      writeText(fb, hexRow, x1, i.toString(16).toUpperCase().padStart(2, '0'), labelFg);
      fb[lowerStyleRow][x1] = { code: 247, color: barColor };
      fb[lowerStyleRow][x2] = { code: lowerRightCode, color: barColor };
      fb[bottomStyleRow][x1] = { code: 160, color: barColor };
      fb[bottomStyleRow][x2] = { code: bottomRightCode, color: barColor };
    } else {
      const hexCode = textToScreencodes(i.toString(16).toUpperCase())[0];
      fb[barsTop][x1] = { code: 160, color: barColor };
      fb[barsTop + 1][x1] = { code: 239, color: barColor };
      fb[decimalRow][x1] = { code: hexCode, color: labelFg };
      fb[separatorRow][x1] = { code: 45, color: barColor };
      fb[hexRow][x1] = { code: hexCode, color: labelFg };
      fb[lowerStyleRow][x1] = { code: 247, color: barColor };
      fb[bottomStyleRow][x1] = { code: 160, color: barColor };
    }
  }

  const charCount = charset === 'c128vdc' ? 512 : 256;
  const charsetStartRow = bottomBorderRow + 1;
  const availableRows = Math.max(0, height - charsetStartRow);
  if (availableRows > 0) {
    let charsPerRow = Math.min(width, typeof opts.preferredCharsPerRow === 'number' ? opts.preferredCharsPerRow : 32);
    if (charsPerRow < 1) charsPerRow = 1;
    if (Math.ceil(charCount / charsPerRow) > availableRows) {
      charsPerRow = Math.min(width, Math.max(1, Math.ceil(charCount / availableRows)));
    }
    const rowsNeeded = Math.ceil(charCount / charsPerRow);
    const startCol = Math.max(0, Math.floor((width - charsPerRow) / 2));
    let code = 0;
    for (let row = 0; row < rowsNeeded && row < availableRows; row++) {
      const y = charsetStartRow + row;
      if (y < 0 || y >= height) continue;
      for (let col = 0; col < charsPerRow && code < charCount; col++) {
        const x = startCol + col;
        if (x >= 0 && x < width) {
          fb[y][x] = { code, color: fg };
        }
        code++;
      }
    }
  }

  return {
    width,
    height,
    columnMode,
    backgroundColor: 0,
    borderColor: 0,
    borderOn: true,
    charset,
    name: title,
    framebuf: fb,
    zoom: { zoomLevel: 3, alignment: 'left' },
    zoomReady: false,
  };
}

function buildC64FortyFrame(def) {
  return buildStyledColorBarsFrame(def, {
    shiftTitleRight: true,
    boxLeft: 3,
    preferredCharsPerRow: 32,
  });
}

function buildFrame(def) {
  const { title, charset, width, height, backgroundColor, borderColor, borderOn, columnMode } = def;
  if (width === 40 && height === 25 && title.startsWith('C64 ')) {
    return buildC64FortyFrame(def);
  }
  if (width >= 34) {
    return buildStyledColorBarsFrame(def, {
      preferredCharsPerRow: 32,
    });
  }

  // Fallback for narrow screens (e.g. VIC 22x23): keep prior compact layout.
  const fg = defaultFgColor(charset);
  const fb = blank(width, height, fg);
  const charCount = charset === 'c128vdc' ? 512 : 256;
  const charsPerRow = Math.min(width, 16);
  const rowsNeeded = Math.ceil(charCount / charsPerRow);
  const charsetStartRow = Math.max(0, height - rowsNeeded);
  const topRows = charsetStartRow;

  if (topRows > 0) {
    const { bg: titleBg, fg: titleFg } = titleBarColors(charset);
    fillRect(fb, 0, 0, 0, width - 1, BLOCK, titleBg);
    const titleCol = Math.max(0, Math.floor((width - title.length) / 2));
    writeText(fb, 0, titleCol, title.toUpperCase(), titleFg);
  }
  if (topRows > 1) {
    for (let x = 0; x < width; x++) fb[1][x] = { code: HLINE, color: fg };
  }
  const barsTop = topRows >= 5 ? 2 : (topRows >= 3 ? 1 : 0);
  const barsBottom = Math.max(barsTop, topRows - 3);
  const bars = paletteValues(charset);
  if (barsBottom >= barsTop && topRows > 0) {
    for (let i = 0; i < bars.length; i++) {
      const [x1, x2] = segmentForIndex(i, bars.length, width);
      fillRect(fb, barsTop, x1, barsBottom, x2, BLOCK, bars[i]);
    }
  }
  const labelRow = topRows - 2;
  if (labelRow >= barsTop && labelRow >= 0) {
    for (let i = 0; i < bars.length; i++) {
      const [x1, x2] = segmentForIndex(i, bars.length, width);
      if (x2 - x1 < 0) continue;
      const label = i.toString(16).toUpperCase();
      const col = x1 + Math.max(0, Math.floor(((x2 - x1 + 1) - label.length) / 2));
      writeText(fb, labelRow, col, label, labelColor(charset, bars[i]));
    }
  }
  const totalColsUsed = charsPerRow;
  const startCol = Math.max(0, Math.floor((width - totalColsUsed) / 2));
  let code = 0;
  for (let row = 0; row < rowsNeeded; row++) {
    const y = charsetStartRow + row;
    if (y < 0 || y >= height) continue;
    for (let col = 0; col < charsPerRow && code < charCount; col++) {
      const x = startCol + col;
      if (x >= 0 && x < width) fb[y][x] = { code, color: fg };
      code++;
    }
  }
  return {
    width,
    height,
    columnMode,
    backgroundColor,
    borderColor,
    borderOn,
    charset,
    name: title,
    framebuf: fb,
    zoom: { zoomLevel: 3, alignment: 'left' },
    zoomReady: false,
  };
}

const workspace = {
  version: 3,
  screens: FRAMES.map((_, idx) => idx),
  framebufs: FRAMES.map((frame) => buildFrame(frame)),
  customFonts: {},
};

const outPath = path.join(__dirname, '..', 'assets', 'colorbars_workspace.petmate');
fs.writeFileSync(outPath, JSON.stringify(workspace), 'utf-8');
console.log(`Wrote ${outPath}`);
console.log(`Frames: ${workspace.framebufs.length}`);
