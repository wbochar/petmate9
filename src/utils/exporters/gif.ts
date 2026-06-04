
import { computeOutputImageDims, framebufToPixelsRGBA, scalePixelsXY } from './util'
import { fs } from '../electronImports'
import { FramebufWithFont, RgbPalette, FileFormatGif } from  '../../redux/types';
import { getPixelStretchX } from '../platformChecks';
const { GIFEncoder, quantize, applyPalette} = require('gifenc');

/** Resolve delay in ms from the user-entered string, clamped to sane range. */
function parseDelay(delayMS: string, fallback: number): number {
  if (delayMS === '') return fallback;
  const n = parseInt(delayMS, 10);
  if (!isNaN(n) && n > 0 && n < 10_000) return n;
  return fallback;
}

/** Scale an RGBA pixel buffer by the export scale + platform stretch. */
function applyScale(
  pixels: Buffer,
  imgWidth: number,
  imgHeight: number,
  fb: FramebufWithFont,
  scale: number,
): { buf: Buffer; w: number; h: number } {
  const stretchX = getPixelStretchX(fb);
  const s = scalePixelsXY(pixels, imgWidth, imgHeight, scale * stretchX, scale);
  return { buf: s.pixBuf, w: s.width, h: s.height };
}

/** Encode one RGBA frame and write it into the gif encoder. */
function writeFrame(
  gif: any,
  pixels: Buffer,
  width: number,
  height: number,
  delay?: number,
) {
  const pal = quantize(pixels, 16);
  const index = applyPalette(pixels, pal);
  const opts: any = { palette: pal };
  if (delay !== undefined) opts.delay = delay;
  gif.writeFrame(index, width, height, opts);
}

export function saveGIF(filename: string, fbs: FramebufWithFont[], palette: RgbPalette, fmt: FileFormatGif): void
{
  try
  {
  const options = fmt.exportOptions;
  const gif = GIFEncoder();
  const scale = options.scale ?? 1;

  const delay = parseDelay(options.delayMS, 250);

  if (options.animMode === 'blink') {
    // ---- Blink preview: 2-frame loop (normal + blink-off) ----
    const selectedFb = fbs[fmt.commonExportParams.selectedFramebufIndex];
    const { imgWidth, imgHeight } = computeOutputImageDims(selectedFb, options.borders);

    const pixelsOn  = framebufToPixelsRGBA(selectedFb, palette, options.borders, false);
    const pixelsOff = framebufToPixelsRGBA(selectedFb, palette, options.borders, true);

    const on  = applyScale(pixelsOn,  imgWidth, imgHeight, selectedFb, scale);
    const off = applyScale(pixelsOff, imgWidth, imgHeight, selectedFb, scale);

    writeFrame(gif, on.buf,  on.w,  on.h,  delay);
    writeFrame(gif, off.buf, off.w, off.h, delay);

  } else if (options.animMode !== 'anim' || fbs.length === 1) {
    // ---- Single Frame ----
    const selectedFb = fbs[fmt.commonExportParams.selectedFramebufIndex];
    const pixels = framebufToPixelsRGBA(selectedFb, palette, options.borders);
    const { imgWidth, imgHeight } = computeOutputImageDims(selectedFb, options.borders);
    const s = applyScale(pixels, imgWidth, imgHeight, selectedFb, scale);
    writeFrame(gif, s.buf, s.w, s.h);

  } else {
    // ---- Multiple Frames ----
    for (let fidx = 0; fidx < fbs.length; fidx++) {
      const selectedFb = fbs[fidx];
      const pixels = framebufToPixelsRGBA(selectedFb, palette, options.borders);
      const { imgWidth, imgHeight } = computeOutputImageDims(selectedFb, options.borders);
      const s = applyScale(pixels, imgWidth, imgHeight, selectedFb, scale);
      writeFrame(gif, s.buf, s.w, s.h, delay);
    }
    // Skip last and first frames when looping back to beginning.
    if (options.loopMode === 'pingpong') {
      for (let fidx = fbs.length - 2; fidx >= 1; fidx--) {
        const selectedFb = fbs[fidx];
        const pixels = framebufToPixelsRGBA(selectedFb, palette, options.borders);
        const { imgWidth, imgHeight } = computeOutputImageDims(selectedFb, options.borders);
        const s = applyScale(pixels, imgWidth, imgHeight, selectedFb, scale);
        writeFrame(gif, s.buf, s.w, s.h, delay);
      }
    }
  }
  // Write end-of-stream character
  gif.finish();

  // Get the Uint8Array output of your binary GIF file
  const output = gif.bytes();

  fs.writeFileSync(filename, output);

  } catch(e) {
    alert(`Failed to save file '${filename}'!`)
    console.error(e)
  }
}
