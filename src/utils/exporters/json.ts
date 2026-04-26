
import { fs } from '../electronImports'
import { FramebufWithFont, FileFormatJson, Pixel } from  '../../redux/types';
import { CustomFonts } from  '../../redux/customFonts';
import { effectiveAttr } from '../vdcAttr';

function flatten2d(arr: Pixel[][], field: 'code' | 'color'): number[] {
  const res = [];
  for (let y = 0; y < arr.length; y++) {
    const row = arr[y];
    for (let x = 0; x < row.length; x++) {
      res.push(row[x][field]);
    }
  }
  return res;
}

/** Flatten the VDC attribute byte for every cell.  Falls back to
 *  `color & 0x0f` when the cell hasn't yet been painted with an explicit
 *  `attr`, matching what the PRG exporter would emit. */
function flattenAttrs(arr: Pixel[][]): number[] {
  const res: number[] = [];
  for (let y = 0; y < arr.length; y++) {
    const row = arr[y];
    for (let x = 0; x < row.length; x++) {
      res.push(effectiveAttr(row[x]));
    }
  }
  return res;
}

/** Flatten the explicit transparency flag.  Treats the legacy sentinel
 *  `code === 256` as transparent so older non-VDC files still round-trip. */
function flattenTransparent(arr: Pixel[][]): number[] {
  const res: number[] = [];
  for (let y = 0; y < arr.length; y++) {
    const row = arr[y];
    for (let x = 0; x < row.length; x++) {
      const px = row[x];
      res.push((px.transparent || px.code === 256) ? 1 : 0);
    }
  }
  return res;
}

function convertFb(fb: FramebufWithFont) {
  const out: any = {
    width: fb.width,
    height: fb.height,
    backgroundColor: fb.backgroundColor,
    borderColor: fb.borderColor,
    borderOn: fb.borderOn,
    charset: fb.charset ? fb.charset : 'upper',
    name: fb.name ? fb.name : undefined,
    screencodes: flatten2d(fb.framebuf, 'code'),
    colors: flatten2d(fb.framebuf, 'color'),
  };
  if (fb.charset === 'c128vdc') {
    out.attrs = flattenAttrs(fb.framebuf);
    out.transparent = flattenTransparent(fb.framebuf);
  }
  return out;
}

export function saveJSON(filename: string, fbs: FramebufWithFont[], customFonts: CustomFonts, fmt: FileFormatJson): void {
  try {

    console.log(fbs);

    const selectedFb = fbs[fmt.commonExportParams.selectedFramebufIndex]
    const fbarr = fmt.exportOptions.currentScreenOnly ? [selectedFb] : fbs;

    //---------------------------------------------------------------
    // Figure out what custom fonts were used and transform to export
    // JSON format.
    const usedFonts = new Set<string>();
    for (let fb of fbarr) {
      if (fb.charset !== 'upper' && fb.charset !== 'lower') {
        usedFonts.add(fb.charset);
      }
    }
    const customFontData: {[charset: string]: { name: string, bits: number[] }} = {};
    for (let charset of usedFonts) {
      customFontData[charset] = {
        name: customFonts[charset].name,
        bits: customFonts[charset].font.bits
      }
    }

    //---------------------------------------------------------------
    // Convert to JSON and save out
    const json = {
      version: 1,
      framebufs: fbarr.map(convertFb),
      charsets: customFontData
    };

    fs.writeFileSync(filename, JSON.stringify(json));
  } catch(e) {
    alert(`Failed to save file '${filename}'!`)
    console.error(e)
  }
}

export function getJSON(fbs: FramebufWithFont, customFonts: CustomFonts): string {

    const selectedFb = fbs
    const fbarr = fbs;

    //---------------------------------------------------------------
    // Figure out what custom fonts were used and transform to export
    // JSON format.
    const usedFonts = new Set<string>();

      if (fbs.charset !== 'upper' &&
          fbs.charset !== 'lower'  &&
          fbs.charset !== 'dirart' &&
          fbs.charset !== 'cbaseUpper' &&
          fbs.charset !== 'cbaseLower' &&
          fbs.charset !== 'c16Upper' &&
          fbs.charset !== 'c16Lower' &&
          fbs.charset !== 'c128Upper' &&
          fbs.charset !== 'c128Lower' &&
          fbs.charset !== 'c128vdc' &&
          fbs.charset !== 'vic20Upper' &&
          fbs.charset !== 'vic20Lower' &&
          fbs.charset !== 'petGfx' &&
          fbs.charset !== 'petBiz'

        ) {
        usedFonts.add(fbs.charset);
      }

    const customFontData: {[charset: string]: { name: string, bits: number[] }} = {};
    for (let charset of usedFonts) {
      customFontData[charset] = {
        name: customFonts[charset].name,
        bits: customFonts[charset].font.bits
      }
    }

    //---------------------------------------------------------------
    // Convert to JSON and save out
    const json = {
      version: 1,
      framebufs: fbarr,
      charsets: customFontData
    };

    return JSON.stringify(json);

}
