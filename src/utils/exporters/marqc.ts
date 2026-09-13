
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

export function saveMarqC(filename: string, fbs: Framebuf[], _options: FileFormat) {
  try {
    let lines: string[] = []
    fbs.forEach((fb, idx) => {
      convertToMarqC(lines, fb, idx)
    })

    // The .c array format (as produced by Marq's exporter) describes the
    // whole file - which may contain multiple frame arrays for a
    // multi-frame/animation document - with a single trailing META
    // comment, not one per frame. Writing more than one META comment
    // confuses readers that treat it as an end-of-document marker,
    // causing only the first frame to be loaded. The format has no way to
    // express per-frame width/height/charset, so we use the first
    // framebuf's properties for the whole file.
    const primary = fbs[0]
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
