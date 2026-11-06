
import { DEFAULT_ZOOM, DEFAULT_ZOOMREADY } from '../../redux/editor'
import { framebufFromJson } from '../../redux/workspace'
import { chunkArray } from '../../utils'

import { fs } from '../electronImports'

// TODO get rid of this
type ImportDispatch = any

// Guards against corrupt/hand-edited META lines declaring a pathological
// (negative, zero, non-integer, or absurdly large) dimension -- without
// this, `nb = width*height` below could become 0/NaN/negative (producing a
// degenerate or garbage-sized slice) or a legitimate-looking but huge
// number that silently truncates/misaligns every frame's chars/colors
// slice against the actual byte array. Real Petmate9 platforms top out
// around 80-100 per axis; this ceiling is generous headroom above that
// while still catching obviously-corrupt values.
const MAX_MARQC_DIMENSION = 1000;

function isValidMarqCDimension(n: number): boolean {
  return Number.isInteger(n) && n > 0 && n <= MAX_MARQC_DIMENSION;
}

// Screencode/colour bytes come from JSON.parse-ing a comma-separated list
// straight out of the file, so a corrupted or hand-edited .c could contain
// negative numbers, floats, or values outside the 0-255 byte range. Clamp
// defensively rather than letting an out-of-range value reach the
// CharGrid/font-bit-offset code downstream, which assumes a valid 0-255
// screencode/colour.
function clampByte(v: number): number {
  const n = Math.trunc(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, n));
}

function screencodeColorMap(charcodes: number[], colors: number[]) {
  return charcodes.map((c,i) => {
    return {
      code: clampByte(c),
      color: clampByte(colors[i])
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
          const parsedWidth = parseInt(dims[1]);
          const parsedHeight = parseInt(dims[2]);
          if (isValidMarqCDimension(parsedWidth) && isValidMarqCDimension(parsedHeight)) {
            width = parsedWidth;
            height = parsedHeight;
            charset = dims[3];
          } else {
            // Dimensions parsed but are out of a sane range (0, negative,
            // or implausibly large) -- keep whatever width/height/charset
            // was already in effect rather than letting a corrupt value
            // propagate into the frame-slicing logic below.
            alert(
              `File '${filename}' has an invalid META dimension (${dims[1]}x${dims[2]}).\n` +
              `Using ${width}x${height} ${charset} instead.`
            );
          }
        } else {
          // The META comment is present but doesn't match a charset we
          // know how to round-trip (only upper/lower/dirart are
          // supported). Rather than silently misinterpret the frame data
          // below, surface this to the user. width/height/charset are left
          // untouched -- i.e. whatever they currently are (the 40x25/upper
          // defaults if no META line has been successfully parsed yet, or
          // the last successfully-parsed META line's values otherwise) --
          // so the message must describe that actual value, not a
          // hardcoded "40x25 upper" that may not match reality.
          alert(
            `File '${filename}' has an unrecognized or unsupported META line:\n` +
            `${line.trim()}\n` +
            `Only upper/lower/dirart charsets can be imported from .c files. ` +
            `Using ${width}x${height} ${charset} instead.`
          );
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
    // Each frame needs 2 header bytes (border, background) plus nb
    // screencode bytes plus nb colour bytes. The declared META dimensions
    // apply to every frame (see B12's note on marqc export emitting a
    // single shared META for a whole file), but a truncated/corrupted
    // file -- or one whose META genuinely doesn't match a particular
    // frame's actual data -- would otherwise silently misalign chars and
    // colors, or at the extreme leave some framebuf rows shorter than
    // `width` (ragged rows that violate the shape every other part of the
    // app assumes a framebuf has). Skip any frame that doesn't have enough
    // data instead of building one of those.
    const requiredFrameLength = 2 + nb * 2;
    const skippedFrameIndices: number[] = [];
    const validFrames: { frame: number[]; originalIndex: number }[] = [];
    frames.forEach((frame, idx) => {
      if (frame.length < requiredFrameLength) {
        skippedFrameIndices.push(idx);
      } else {
        validFrames.push({ frame, originalIndex: idx });
      }
    });
    if (skippedFrameIndices.length > 0) {
      console.error(
        `File '${filename}': frame(s) at index ${skippedFrameIndices.join(', ')} have fewer bytes ` +
        `than required for the declared ${width}x${height} dimensions (need ${requiredFrameLength}); skipping.`
      );
    }
    if (validFrames.length === 0) {
      alert(`File '${filename}' has no frames matching the declared ${width}x${height} dimensions!`);
      return;
    }

    const framebufs = validFrames.map(({ frame, originalIndex }) => {
      const charcodes = frame.slice(2, nb+2)
      const colors = frame.slice(nb+2, nb*2+2)
      const codes = screencodeColorMap(charcodes, colors)
      return framebufFromJson({
        width,
        height,
        backgroundColor: clampByte(frame[1]),
        borderColor: clampByte(frame[0]),
        borderOn: false,
        charset,
        name: validFrames.length > 1 ? `${baseName}_${String(originalIndex).padStart(4, '0')}` : baseName,
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
