
import { computeOutputImageDims,framebufToPixelsRGBA  } from './util'
import { fs } from '../electronImports'
import { FramebufWithFont, RgbPalette, FileFormatGif } from  '../../redux/types';
const { GIFEncoder, quantize, applyPalette} = require('gifenc');



export function saveGIF(filename: string, fbs: FramebufWithFont[], palette: RgbPalette, fmt: FileFormatGif): void
{
  try
  {
  const options = fmt.exportOptions;
  const gif = GIFEncoder();

  let delay = 0
  const delayMS = options.delayMS
  if (delayMS !== '') {
    delay = parseInt(delayMS, 10)
    if (!isNaN(delay) && delay > 0 && delay < 10*1000) {
    }
    else
    {
      delay = 250
    }
  }
  if (options.animMode !== 'anim' || fbs.length == 1)
  {
    //Single Frame
    const selectedFb = fbs[fmt.commonExportParams.selectedFramebufIndex]
    const pixels = framebufToPixelsRGBA(selectedFb,palette, options.borders);
    const { imgWidth, imgHeight } = computeOutputImageDims(selectedFb, options.borders);
    const palettex= quantize(pixels, 16);
    const index = applyPalette(pixels, palettex);
    gif.writeFrame(index, imgWidth, imgHeight, { palette :palettex });

  } else {

    //Multiple Frames
    for (let fidx = 0; fidx < fbs.length; fidx++)
    {
    const selectedFb = fbs[fidx]
    const pixels = framebufToPixelsRGBA(selectedFb,palette, options.borders);
    const { imgWidth, imgHeight } = computeOutputImageDims(selectedFb, options.borders);
    const palettex= quantize(pixels, 16);
    const index = applyPalette(pixels, palettex);
    gif.writeFrame(index, imgWidth, imgHeight, { palette :palettex, delay: delay });
    }
    // Skip last and first frames when looping back to beginning.
    if (options.loopMode === 'pingpong')
    {
      for (let fidx = fbs.length-2; fidx >= 1; fidx--)
      {
        const selectedFb = fbs[fidx]
        const pixels = framebufToPixelsRGBA(selectedFb,palette, options.borders);
        const { imgWidth, imgHeight } = computeOutputImageDims(selectedFb, options.borders);
        const palettex= quantize(pixels, 16);
        const index = applyPalette(pixels, palettex);
        gif.writeFrame(index, imgWidth, imgHeight, { palette :palettex, delay: delay });
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
