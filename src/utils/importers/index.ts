
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
    let frames = [];
    let charset = 'upper';
    let bytes: number[] = []
    for (let li = 0; li < lines.length; li++) {
      let line = lines[li]
      if (/unsigned char (.*)\[\].*/.exec(line)) {
        frames = [];
        //console.log(line);
        continue
      }
      if (/};.*/.exec(line)) {
        frames.push(bytes)
        bytes = []
        continue
      }
      let m = line.match(/^\/\/ META:(.*)/);
      if (m) {
        m =  m[1].match(/\s*(\d+) (\d+) .* (upper|lower|dirart)/);
        if (m) {
          width = parseInt(m[1]);
          height = parseInt(m[2]);
          charset = m[3];
          //console.log(`Import frame: ${width}x${height} with charset: ${charset}`);

    const framebufs = frames.map(frame => {
      const bytes = frame;
      const nb = width*height;
      const charcodes = bytes.slice(2, nb+2)
      const colors = bytes.slice(nb+2, nb*2+2)
      const codes = screencodeColorMap(charcodes, colors)
      return framebufFromJson({
        width,
        height,
        backgroundColor: bytes[1],
        borderColor: bytes[0],
        borderOn: false,
        charset,
        name: filename.startsWith('/') ? filename.split(".")[0].split('/')[filename.split(".")[0].split('/').length-1] : filename.split(".")[0].split('\\')[filename.split(".")[0].split('\\').length-1],
        framebuf: chunkArray(codes, width),
        zoom:DEFAULT_ZOOM,
        zoomReady: DEFAULT_ZOOMREADY,
      })
    })
    // TODO don't call importFile here, just return the framebuf array
    importFile(framebufs)
continue;
        }
        break;
      }
      let str = line.trim()
      if (str[str.length-1] === ',') {
        str = str.substring(0, str.length - 1);
      }
      let arr = JSON.parse(`[${str}]`)
      arr.forEach((byte: number) => {
        bytes.push(byte)
      })
    }


  } catch(e) {
    alert(`Failed to load file '${filename}'!`)
    console.error(e)
  }
}

export { loadD64Framebuf } from './d64'
export { loadSeq } from './seq2petscii'
