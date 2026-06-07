
import { FramebufWithFont, FileFormatPng, RgbPalette } from '../../redux/types'
import { framebufToPixels, scalePixelsXY, computeOutputImageDims, applyDirartSafeFilter } from './util'
import { electron, fs } from '../electronImports'
import { getPixelStretchX } from '../platformChecks';

const nativeImage = electron.nativeImage
function createPNG(
  fb: FramebufWithFont,
  palette: RgbPalette,
  borders: boolean,
  scale: number,
  alphaPixel: boolean
): Buffer {
  const { imgWidth, imgHeight } = computeOutputImageDims(fb, borders);
  const buf = framebufToPixels(fb, palette, borders);
  const pixelStretchX = getPixelStretchX(fb);
  const scaled = scalePixelsXY(buf, imgWidth, imgHeight, scale * pixelStretchX, scale);
  const pixBuf = scaled.pixBuf;
  if (alphaPixel && pixBuf.length >= 4) {
    // TODO is this enough to fool png->jpeg transcoders heuristics?
    pixBuf[3] = 254;
  }
  const img = nativeImage.createFromBuffer(pixBuf, {
    width: scaled.width,
    height: scaled.height,
  });
  return img.toPNG();
}

export function getPNG(fb: FramebufWithFont, palette: RgbPalette): any {
  return createPNG(fb, palette, fb.borderOn, 1, false);

}


export function savePNG(filename: string, fb: FramebufWithFont, palette: RgbPalette, fmt: FileFormatPng): void {
  try {
    const options = fmt.exportOptions;
    const srcFb = options.dirartSafe ? applyDirartSafeFilter(fb) : fb;
    fs.writeFileSync(
      filename,
      createPNG(srcFb, palette, options.borders, options.scale, options.alphaPixel),
      null
    );
  }
  catch(e) {
    alert(`Failed to save file '${filename}'!`);
    console.error(e);
  }
}

