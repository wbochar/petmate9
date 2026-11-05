
import { chunkArray } from '../../utils'
import { Framebuf, FileFormat } from '../../redux/types'
import { fs } from '../electronImports'
import { screencodeToExportByte } from './util'

function bytesToCommaDelimited(dstLines: string[], bytes: number[], bytesPerLine: number) {
  let lines = chunkArray(bytes, bytesPerLine)
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i].join(',')
    if (i === lines.length - 1) {
      dstLines.push(s)
    } else {
      dstLines.push(`${s},`)
    }
  }
}

function convertToMarqC(lines: string[], fb: Framebuf, idx: number) {
  const { width, height, framebuf, backgroundColor, borderColor } = fb

  const num = String(idx).padStart(4, '0')
  lines.push(`unsigned char frame${num}[]={// border,bg,chars,colors`)

  let bytes = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      bytes.push(screencodeToExportByte(framebuf[y][x]))
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      bytes.push(framebuf[y][x].color)
    }
  }
  lines.push(`${borderColor},${backgroundColor},`)
  bytesToCommaDelimited(lines, bytes, width)
  lines.push('};')
}

// The .c array format has no per-frame charset field -- a single trailing
// META comment describes the whole file, and loadMarqCFramebuf only
// recognizes 'upper'/'lower'/'dirart' there. Exporting any other charset
// (e.g. VIC-20/PET/TED/C128 VDC) would silently round-trip as the wrong
// charset (and, for VDC frames, lose the attr byte entirely since this
// format only stores a plain color per cell).
const MARQC_SUPPORTED_CHARSETS = new Set(['upper', 'lower', 'dirart']);

export function saveMarqC(filename: string, fbs: Framebuf[], _options: FileFormat) {
  try {
    const unsupported = fbs.find(fb => !MARQC_SUPPORTED_CHARSETS.has(fb.charset));
    if (unsupported) {
      alert(
        `C export only supports C64 upper/lower/DirArt charsets.\n` +
        `Current frame charset: ${unsupported.charset}.`
      );
      return;
    }

    // The .c array format has no way to express per-frame width/height/
    // charset -- only a single trailing META comment for the whole file
    // (see below). Previously this was emitted unconditionally from just
    // the first frame's properties, even when other frames had different
    // dimensions or charsets; loadMarqCFramebuf applies that one META to
    // every frame when decoding, so any frame not matching it would be
    // sliced at the wrong byte offsets (silently truncating/misreading its
    // chars+colors, or -- after the B11 length-validation fix -- being
    // dropped outright if its actual byte count came up short). Refuse the
    // export up front instead of silently emitting data that can't be read
    // back correctly.
    const primary = fbs[0]
    if (primary) {
      const mismatchedIdx = fbs.findIndex(fb =>
        fb.width !== primary.width || fb.height !== primary.height || fb.charset !== primary.charset
      );
      if (mismatchedIdx > 0) {
        const mismatched = fbs[mismatchedIdx];
        alert(
          `C export requires every frame to share the same dimensions and charset.\n` +
          `Frame 1 is ${primary.width}x${primary.height} ${primary.charset}, ` +
          `but frame ${mismatchedIdx + 1} is ${mismatched.width}x${mismatched.height} ${mismatched.charset}.`
        );
        return;
      }
    }

    let lines: string[] = []
    fbs.forEach((fb, idx) => {
      convertToMarqC(lines, fb, idx)
    })

    // The .c array format (as produced by Marq's exporter) describes the
    // whole file - which may contain multiple frame arrays for a
    // multi-frame/animation document - with a single trailing META
    // comment, not one per frame. Writing more than one META comment
    // confuses readers that treat it as an end-of-document marker,
    // causing only the first frame to be loaded. Every frame is now
    // guaranteed (by the check above) to share the first frame's
    // width/height/charset, so using `primary`'s properties for the whole
    // file is safe.
    if (primary) {
      lines.push(`// META: ${primary.width} ${primary.height} C64 ${primary.charset}`)
    }

    fs.writeFileSync(filename, lines.join('\n') + '\n', null)
  }
  catch (e) {
    alert(`Failed to save file '${filename}'!`)
    console.error(e)
  }
}
