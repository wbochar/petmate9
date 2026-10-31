
import { fs } from '../electronImports'
import { FramebufWithFont, FileFormatJson, Pixel } from  '../../redux/types';
import { CustomFonts } from  '../../redux/customFonts';
import { effectiveAttr } from '../vdcAttr';
import {
  CHARSET_UPPER, CHARSET_LOWER, CHARSET_DIRART,
  CHARSET_CBASE_UPPER, CHARSET_CBASE_LOWER,
  CHARSET_C16_UPPER, CHARSET_C16_LOWER,
  CHARSET_C128_UPPER, CHARSET_C128_LOWER, CHARSET_C128_VDC,
  CHARSET_VIC20_UPPER, CHARSET_VIC20_LOWER,
  CHARSET_PET_UPPER, CHARSET_PET_LOWER,
} from '../../redux/editor';

// Charsets that ship with the app and never have a `customFonts` entry.
// Anything NOT in this set is assumed to be a user-added custom font and
// must be looked up (and embedded) via the `customFonts` map passed in.
const BUILTIN_CHARSETS = new Set<string>([
  CHARSET_UPPER, CHARSET_LOWER, CHARSET_DIRART,
  CHARSET_CBASE_UPPER, CHARSET_CBASE_LOWER,
  CHARSET_C16_UPPER, CHARSET_C16_LOWER,
  CHARSET_C128_UPPER, CHARSET_C128_LOWER, CHARSET_C128_VDC,
  CHARSET_VIC20_UPPER, CHARSET_VIC20_LOWER,
  CHARSET_PET_UPPER, CHARSET_PET_LOWER,
]);

// Build the `charsets` blob for a set of framebufs, looking up each
// non-built-in charset's font data in `customFonts`. Silently skips any
// custom charset that's missing from `customFonts` instead of throwing --
// this can legitimately happen when `customFonts` is incomplete (e.g. the
// internal clipboard protocol, which doesn't always have access to the full
// app-wide custom fonts map), and a missing font shouldn't abort the whole
// copy/export.
function buildCustomFontData(
  framebufs: FramebufWithFont[],
  customFonts: CustomFonts,
): {[charset: string]: { name: string, bits: number[] }} {
  const usedFonts = new Set<string>();
  for (const fb of framebufs) {
    if (!BUILTIN_CHARSETS.has(fb.charset)) {
      usedFonts.add(fb.charset);
    }
  }
  const customFontData: {[charset: string]: { name: string, bits: number[] }} = {};
  for (const charset of usedFonts) {
    const font = customFonts[charset];
    if (!font) continue;
    customFontData[charset] = {
      name: font.name,
      bits: font.font.bits,
    };
  }
  return customFontData;
}

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
    const selectedFb = fbs[fmt.commonExportParams.selectedFramebufIndex]
    const fbarr = fmt.exportOptions.currentScreenOnly ? [selectedFb] : fbs;

    //---------------------------------------------------------------
    // Convert to JSON and save out
    const json = {
      version: 1,
      framebufs: fbarr.map(convertFb),
      charsets: buildCustomFontData(fbarr, customFonts),
    };

    fs.writeFileSync(filename, JSON.stringify(json));
  } catch(e) {
    alert(`Failed to save file '${filename}'!`)
    console.error(e)
  }
}

// Used by the internal clipboard copy/paste protocol (a single framebuf,
// kept in its raw `FramebufWithFont` shape -- NOT run through `convertFb` --
// so `pasteFrame`/`addScreenPlusFramebuf` can feed it straight back into
// `Framebuffer.actions.copyFramebuf`). This is intentionally a different
// wire shape than `saveJSON`'s file format above.
export function getJSON(fb: FramebufWithFont, customFonts: CustomFonts): string {
    const json = {
      version: 1,
      framebufs: fb,
      charsets: buildCustomFontData([fb], customFonts),
    };

    return JSON.stringify(json);
}
