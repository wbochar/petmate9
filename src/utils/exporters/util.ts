
import { FramebufWithFont, RgbPalette } from '../../redux/types'
import { Pixel, TRANSPARENT_SCREENCODE, VDC_TRANSPARENT_SCREENCODE } from '../../redux/types'
import { effectiveAttr, isVdcCharset, VDC_ATTR_ALTCHAR, VDC_ATTR_BLINK, VDC_ATTR_REVERSE, VDC_ATTR_UNDERLINE } from '../vdcAttr'
import { DIRART_ILLEGAL_CHARS } from '../../redux/editor'

/** Return a shallow copy of `fb` with DirArt-illegal screencodes replaced
 *  by spaces (0x20).  Non-destructive — the original framebuf is not mutated. */
export function applyDirartSafeFilter(fb: FramebufWithFont): FramebufWithFont {
  return {
    ...fb,
    framebuf: fb.framebuf.map(row =>
      row.map(cell =>
        DIRART_ILLEGAL_CHARS.has(cell.code) ? { ...cell, code: 0x20 } : cell
      )
    ),
  };
}

// These match what VICE exports as a PNG.
const BORDER_LEFT_WIDTH = 32;
const BORDER_RIGHT_WIDTH = 32;
const BORDER_TOP_HEIGHT = 35;
const BORDER_BOTTOM_HEIGHT = 37;

export function computeOutputImageDims(fb: FramebufWithFont, borders: boolean) {
  const { width, height } = fb;
  const borderLeftWidth = borders ? BORDER_LEFT_WIDTH : 0;  // 384x272 for 320x200
  const borderTopHeight = borders ? BORDER_TOP_HEIGHT : 0;
  let imgWidth = width*8;
  let imgHeight = height*8;
  if (borders) {
    imgWidth  += BORDER_LEFT_WIDTH + BORDER_RIGHT_WIDTH;
    imgHeight += BORDER_TOP_HEIGHT + BORDER_BOTTOM_HEIGHT;
  }
  return { imgWidth, imgHeight, imgXOffset: borderLeftWidth, imgYOffset: borderTopHeight };
}

export function screencodeToExportByte(px: Pick<Pixel, 'code' | 'transparent'>): number {
  if (
    px.transparent === true ||
    px.code === TRANSPARENT_SCREENCODE ||
    px.code === VDC_TRANSPARENT_SCREENCODE
  ) {
    return 0x20;
  }
  return px.code & 0xff;
}

/**
 * Render a framebuf to an indexed-colour pixel buffer.
 *
 * @param blinkOff  When true, cells with the VDC BLINK attribute (or TED
 *                  colour-bit-7 blink) are rendered in their blink-OFF
 *                  state: the character bitmap is replaced with all-zeros
 *                  and UNDERLINE / REVERSE still apply on top (matching
 *                  real VDC hardware behaviour).
 */
export function framebufToPixelsIndexed(fb: FramebufWithFont, borders: boolean, blinkOff = false): Buffer  {
  const { width, height, framebuf, backgroundColor, borderColor, font } = fb;
  const fontData = font.bits;
  const useVdcSemantics = isVdcCharset(fb.charset);
  const useTedSemantics = fb.charset.startsWith('c16');
  const normalizeIndexedColor = (color: number) => useTedSemantics ? (color & 0x7f) : color;
  const { imgWidth, imgHeight, imgXOffset, imgYOffset } = computeOutputImageDims(fb, borders);
  const buf = Buffer.alloc(imgWidth * imgHeight);
  const normalizedBackgroundColor = normalizeIndexedColor(backgroundColor);
  const normalizedBorderColor = normalizeIndexedColor(borderColor);

  buf.fill(normalizedBorderColor);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pix = framebuf[y][x]
      const c = screencodeToExportByte(pix)
      const attr = useVdcSemantics ? effectiveAttr(pix) : 0;
      const glyph = useVdcSemantics
        ? ((c & 0xff) + ((attr & VDC_ATTR_ALTCHAR) ? 256 : 0))
        : c;
      const col = normalizeIndexedColor(pix.color)
      const boffs = glyph*8;

      // TED blink-off: entire cell becomes background.
      if (blinkOff && useTedSemantics && (pix.color & 0x80) !== 0) {
        for (let cy = 0; cy < 8; cy++) {
          for (let i = 0; i < 8; i++) {
            const offs = (y*8 + cy + imgYOffset) * imgWidth + (x*8 + i) + imgXOffset;
            buf[offs] = normalizedBackgroundColor;
          }
        }
        continue;
      }

      // VDC blink-off: bitmap replaced with all-zeros, then UNDERLINE
      // and REVERSE still apply (matching VDC hardware pipeline).
      const vdcBlinkOff = blinkOff && useVdcSemantics && (attr & VDC_ATTR_BLINK) !== 0;

      for (let cy = 0; cy < 8; cy++) {
        let p = vdcBlinkOff ? 0 : (fontData[boffs + cy] ?? 0);
        if (useVdcSemantics) {
          // VDC pipeline: bitmap → underline → reverse.
          if ((attr & VDC_ATTR_UNDERLINE) !== 0 && cy === 7) {
            p = 0xff;
          }
          if ((attr & VDC_ATTR_REVERSE) !== 0) {
            p = (~p) & 0xff;
          }
        }
        for (let i = 0; i < 8; i++) {
          const set = ((128 >> i) & p) !== 0
          const offs = (y*8 + cy + imgYOffset) * imgWidth + (x*8 + i) + imgXOffset;

          const c = set ? col : normalizedBackgroundColor;
          buf[offs] = c;
        }
      }
    }
  }

  return buf
}

export function framebufToPixels(fb: FramebufWithFont, palette: RgbPalette, borders: boolean): Buffer {
  const { imgWidth, imgHeight } = computeOutputImageDims(fb, borders);

  const indexedBuf = framebufToPixelsIndexed(fb, borders)
  const buf = Buffer.alloc(imgWidth * imgHeight * 4)

  for (let y = 0; y < imgHeight; y++) {
    for (let x = 0; x < imgWidth; x++) {
      const offs = y*imgWidth + x
      const col = palette[indexedBuf[offs]] ?? palette[0]
      buf[offs * 4 + 0] = col.b
      buf[offs * 4 + 1] = col.g
      buf[offs * 4 + 2] = col.r
      buf[offs * 4 + 3] = 255
    }
  }
  return buf
}

export function framebufToPixelsRGBA(fb: FramebufWithFont, palette: RgbPalette, borders: boolean, blinkOff = false): Buffer {
  const { imgWidth, imgHeight } = computeOutputImageDims(fb, borders);

  const indexedBuf = framebufToPixelsIndexed(fb, borders, blinkOff)
  const buf = Buffer.alloc(imgWidth * imgHeight * 4)

  for (let y = 0; y < imgHeight; y++) {
    for (let x = 0; x < imgWidth; x++) {
      const offs = y*imgWidth + x
      const col = palette[indexedBuf[offs]] ?? palette[0]
      buf[offs * 4 + 0] = col.r
      buf[offs * 4 + 1] = col.g
      buf[offs * 4 + 2] = col.b
      buf[offs * 4 + 3] = 255
    }
  }
  return buf
}



export function scalePixels(buf: Buffer, width: number, height: number, scale: number): Buffer {
  return scalePixelsXY(buf, width, height, scale, scale).pixBuf;
}

function normalizeScale(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n;
}

export function scalePixelsXY(
  buf: Buffer,
  width: number,
  height: number,
  scaleX: number,
  scaleY: number
): { pixBuf: Buffer; width: number; height: number } {
  const sx = normalizeScale(scaleX);
  const sy = normalizeScale(scaleY);
  const pixelLength = 4;

  if (width <= 0 || height <= 0) {
    return { pixBuf: Buffer.alloc(0), width: 0, height: 0 };
  }
  if (sx === 1 && sy === 1) {
    return { pixBuf: buf, width, height };
  }

  const dstWidth = Math.max(1, Math.round(width * sx));
  const dstHeight = Math.max(1, Math.round(height * sy));
  const dst = Buffer.alloc(dstWidth * dstHeight * pixelLength);

  for (let y = 0; y < dstHeight; y++) {
    const srcY = Math.min(height - 1, Math.floor(y / sy));
    for (let x = 0; x < dstWidth; x++) {
      const srcX = Math.min(width - 1, Math.floor(x / sx));
      const srcOffs = (srcY * width + srcX) * pixelLength;
      const dstOffs = (y * dstWidth + x) * pixelLength;
      dst[dstOffs + 0] = buf[srcOffs + 0];
      dst[dstOffs + 1] = buf[srcOffs + 1];
      dst[dstOffs + 2] = buf[srcOffs + 2];
      dst[dstOffs + 3] = buf[srcOffs + 3];
    }
  }

  return { pixBuf: dst, width: dstWidth, height: dstHeight };
}

