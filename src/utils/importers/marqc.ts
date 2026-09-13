
import { DEFAULT_ZOOM, DEFAULT_ZOOMREADY } from '../../redux/editor'
import { framebufFromJson } from '../../redux/workspace'
import { chunkArray } from '../../utils'

import { fs } from '../electronImports'

// TODO get rid of this
type ImportDispatch = any

function screencodeColorMap(charcodes: number[], colors: number[]) {
  return charcodes.map((c,i) => {
    return {
      code: c,
      color: colors[i]
    }
  })
}

export function loadMarqCFramebuf(filename: string, importFile: ImportDispatch) {
  try {
    const content = fs.readFileSync(filename, 'utf-8')
    const lines = content.split('\n')

    let width = 40;
    let height = 25;
    let charset = 'upper';
    // Accumulate every frame array found in the file. Some tools (e.g.
    // Marq's exporter) emit a single trailing '// META:' comment that
    // describes the whole (possibly multi-frame) file, while older
    // Petmate exports emitted one '// META:' comment per frame. Either
    // way we want to keep every frame we've seen and only build the
    // resulting framebufs once the whole file has been read, instead of
    // resetting our accumulator whenever a new frame array starts or a
    // META comment is seen.
    const frames: number[][] = [];
    let bytes: number[] = []
    for (let li = 0; li < lines.length; li++) {
      let line = lines[li]
      if (/unsigned char (.*)\[\].*/.exec(line)) {
        continue
      }
      if (/};.*/.exec(line)) {
        frames.push(bytes)
        bytes = []
        continue
      }
      const metaMatch = line.match(/^\/\/ META:(.*)/);
      if (metaMatch) {
        const dims = metaMatch[1].match(/\s*(\d+) (\d+) .* (upper|lower|dirart)/);
        if (dims) {
          width = parseInt(dims[1]);
          height = parseInt(dims[2]);
          charset = dims[3];
        }
        continue;
      }
      let str = line.trim()
      if (str.length === 0) {
        continue
      }
      if (str[str.length-1] === ',') {
        str = str.substring(0, str.length - 1);
      }
      let arr = JSON.parse(`[${str}]`)
      arr.forEach((byte: number) => {
        bytes.push(byte)
      })
    }

    if (frames.length === 0) {
      alert(`No frames found in file '${filename}'!`)
      return
    }

    const baseName = filename.startsWith('/')
      ? filename.split(".")[0].split('/')[filename.split(".")[0].split('/').length-1]
      : filename.split(".")[0].split('\\')[filename.split(".")[0].split('\\').length-1];

    const nb = width*height;
    const framebufs = frames.map((frame, idx) => {
      const charcodes = frame.slice(2, nb+2)
      const colors = frame.slice(nb+2, nb*2+2)
      const codes = screencodeColorMap(charcodes, colors)
      return framebufFromJson({
        width,
        height,
        backgroundColor: frame[1],
        borderColor: frame[0],
        borderOn: false,
        charset,
        name: frames.length > 1 ? `${baseName}_${String(idx).padStart(4, '0')}` : baseName,
        framebuf: chunkArray(codes, width),
        zoom:DEFAULT_ZOOM,
        zoomReady: DEFAULT_ZOOMREADY,
      })
    })
    // TODO don't call importFile here, just return the framebuf array
    importFile(framebufs)
  } catch(e) {
    alert(`Failed to load file '${filename}'!`)
    console.error(e)
  }
}
