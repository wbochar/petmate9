import { FileFormatSeq, Framebuf, FramebufWithFont } from '../../redux/types'
import { fs } from '../electronImports'
import { effectiveAttr, isVdcCharset, VDC_ATTR_ALTCHAR, VDC_ATTR_REVERSE } from '../vdcAttr'
import { screencodeToExportByte } from './util'

const C64_COLOR_INDEX_TO_SEQ_CONTROL_BYTE: number[] = [
  0x90, //black
  0x05, //white
  0x1c, //red
  0x9f, //cyan
  0x9c, //purple
  0x1e, //green
  0x1f, //blue
  0x9e, //yellow
  0x81, //orange
  0x95, //brown
  0x96, //pink
  0x97, //grey 1
  0x98, //grey 2
  0x99, //lt green
  0x9a, //lt blue
  0x9b //grey 3
]

const TED_HUE_TO_SEQ_CONTROL_BYTE: number[] = [
  0x90, //black
  0x05, //white
  0x1c, //red
  0x9f, //cyan
  0x9c, //purple
  0x1e, //green
  0x1f, //blue
  0x9e, //yellow
  0x81, //orange
  0x95, //brown
  0x96, //yel green
  0x97, //pink
  0x98, //blue green
  0x99, //lt blue
  0x9a, //dk blue
  0x9b //lt green
]

const seqColorControlBytes = new Set<number>(C64_COLOR_INDEX_TO_SEQ_CONTROL_BYTE)
const TED_EXTENDED_COLOR_ESCAPE = 0x16
const VDC_ESCAPE = 0x1b
const VDC_ESC_RAW_CHAR = 0x56 // V (Petmate VDC raw-character extension)
const seqStructuralControlBytes = new Set<number>([
  0x07, // bell
  0x0d, // carriage return
  0x8d, // shifted carriage return
  0x0e, // lower/upper charset
  0x8e, // upper/gfx charset
  0x1b, // escape
  0x02, // underline on (legacy)
  0x82, // underline off (legacy)
  0x0f, // blink on (legacy)
  0x8f, // blink off (legacy)
  0x11, // cursor down
  0x91, // cursor up
  0x12, // reverse on
  0x92, // reverse off
  0x13, // home
  0x93, // clear screen
  0x14, // delete
  0x1d, // cursor right
  0x9d // cursor left
])
type SeqTedColorMode = 'quantize16' | 'tedFull'

function isSeqColorControlByte(byte: number | undefined) {
  return typeof byte === 'number' && seqColorControlBytes.has(byte)
}

function isSeqStructuralControlByte(byte: number | undefined) {
  return typeof byte === 'number' && seqStructuralControlBytes.has(byte)
}

function isTEDCharset(font: string) {
  return font.startsWith('c16')
}

function isLowercaseCharset(font: string) {
  const normalizedFont = font.toLowerCase()
  return normalizedFont.includes('lower') || normalizedFont === 'petbiz'
}

function getSeqColorControlByte(colorByte: number, useTEDColorSemantics: boolean) {
  const mapping = useTEDColorSemantics ? TED_HUE_TO_SEQ_CONTROL_BYTE : C64_COLOR_INDEX_TO_SEQ_CONTROL_BYTE
  return mapping[colorByte & 0x0f] ?? mapping[0]
}

function getTedExtendedColorByte(cell: { color: number; attr?: number }) {
  const hueLum = cell.color & 0x7f
  const hasCanonicalBlink = (cell.color & 0x80) !== 0
  // Backward compatibility for older data paths that stashed TED blink in attr.
  const hasLegacyAttrBlink = typeof cell.attr === 'number' && (cell.attr & 0x80) !== 0
  const flash = (hasCanonicalBlink || hasLegacyAttrBlink) ? 0x80 : 0x00
  return (hueLum | flash) & 0xff
}

function mapScreencodeByteToSeqCharByte(byte_char: number) {
  if ((byte_char >= 0) && (byte_char <= 0x1f)) {
    return byte_char + 0x40;
  }
  if ((byte_char >= 0x40) && (byte_char <= 0x5d)) {
    return byte_char + 0x80;
  }
  if (byte_char === 0x5e) {
    return 0xff;
  }
  if (byte_char === 0x5f) {
    return 0xdf;
  }
  if (byte_char === 0x95) {
    return 0xdf;
  }
  if ((byte_char >= 0x60) && (byte_char <= 0x7f)) {
    return byte_char + 0x40;
  }
  if ((byte_char >= 0x80) && (byte_char <= 0xbf)) {
    return byte_char - 0x80;
  }
  if ((byte_char >= 0xc0) && (byte_char <= 0xff)) {
    return byte_char - 0x40;
  }
  return byte_char;
}

function decodeSeqDataByteToVdcScreencode(byte: number) {
  if ((byte >= 0x20) && (byte < 0x40)) return byte
  if ((byte >= 0x40) && (byte <= 0x5f)) return (byte - 0x40)
  if ((byte >= 0x60) && (byte <= 0x7f)) return (byte - 0x20)
  if ((byte >= 0xa0) && (byte <= 0xbf)) return (byte - 0x40)
  if ((byte >= 0xc0) && (byte <= 0xfe)) return (byte - 0x80)
  if (byte === 0xff) return 94
  return null
}

function canWriteVdcCodeAsDirectSeqByte(code: number) {
  const normalizedCode = code & 0xff
  const seqByte = mapScreencodeByteToSeqCharByte(normalizedCode)
  if (isSeqColorControlByte(seqByte) || isSeqStructuralControlByte(seqByte)) {
    return false
  }
  const decoded = decodeSeqDataByteToVdcScreencode(seqByte)
  return decoded === normalizedCode
}

function appendVdcCharByte(bytes: number[], code: number) {
  const normalizedCode = code & 0xff
  if (canWriteVdcCodeAsDirectSeqByte(normalizedCode)) {
    bytes.push(mapScreencodeByteToSeqCharByte(normalizedCode))
  } else {
    bytes.push(VDC_ESCAPE, VDC_ESC_RAW_CHAR, normalizedCode)
  }
}

function appendCR(bytes:number[], currev:boolean, force:boolean) {
  // Append a Carriage Return if not already done
  if (force || (bytes.length && (bytes[bytes.length -1] & 0x7f) !== 0x0d))
    bytes.push(currev ? 0x0d : 0x8d)
}

function packColSequences(bytes:number[]) {
  let idx:number = bytes.length;
  while (idx >= 0) {
    // Strip colour byte if it appears before a CR and a new colour byte
    if ((bytes[idx] & 0x7f) === 0x0d) {
      if (isSeqColorControlByte(bytes[idx - 1]) && isSeqColorControlByte(bytes[idx + 1])) {
        bytes.splice(idx - 1,1);
        idx--;
      }
    }
    // Strip sequence of colour bytes except the last one
    if (isSeqColorControlByte(bytes[idx - 1]) && isSeqColorControlByte(bytes[idx])) {
      bytes.splice(idx - 1,1);
      idx--;
    }
    idx--;
  }
}

function removeDupColours(bytes:number[]) {
  let idx:number = bytes.length -1;
  let prevColByte:number = -1;
  let prevColByteIdx:number = -1;

  while (idx >= 0) {
    // Seek for repetitive colour bytes (non adjacent too)
    // and remove them from sequence
    let currByte:number = bytes[idx];
    if (isSeqColorControlByte(currByte)) {
      if (currByte === prevColByte) {
        bytes.splice(prevColByteIdx, 1);
      }
      prevColByte = currByte;
      prevColByteIdx = idx;
    }
    idx--;
  }
}


function convertToSEQ(
  fb: Framebuf,
  bytes:number[],
  insCR:boolean,
  insClear:boolean,
  stripBlanks:boolean,
  insCharset:boolean,
  font:string,
  tedColorMode: SeqTedColorMode
) {
  const { width, height, framebuf } = fb;
  let currColorControlByte = -1;
  let currTedExtendedColorByte = -1;
  let currev = false;
  let blank_buffer: number[] = [];
  let lastCRrow = -1;
  const useTEDColorSemantics = isTEDCharset(font);
  const useVdcSemantics = isVdcCharset(font);
  let vdcLowerMode = false;
  let vdcUnderlineMode = false;
  let vdcBlinkMode = false;
  const normalizeSeqCharCode = (code: number) => {
    const normalizedCode = code & 0xff
    if (useVdcSemantics) {
      return normalizedCode
    }
    if (normalizedCode >= 0x80) {
      return normalizedCode & 0x7f
    }
    return normalizedCode
  }
  const isBlankSeqCharCode = (code: number) => {
    const mappedByte = mapScreencodeByteToSeqCharByte(normalizeSeqCharCode(code))
    return mappedByte === 0xc0 || mappedByte === 0x20
  }
  const appendSeqCharCode = (code: number) => {
    const normalizedCode = normalizeSeqCharCode(code)
    if (useVdcSemantics) {
      appendVdcCharByte(bytes, normalizedCode)
    } else {
      bytes.push(mapScreencodeByteToSeqCharByte(normalizedCode))
    }
  }


  if (insClear) {
    bytes.push(0x93);
  }
  if (insCharset) {
    if (isLowercaseCharset(font))
    {
      bytes.push(0x0e); //Lower/Upper
    }else
    {
    bytes.push(0x8e); //Upper/GFX
    }
  }


  for (let y = 0; y < height; y++) {

    for (let x = 0; x < width; x++) {
      const cell = framebuf[y][x];
      const attr = useVdcSemantics ? effectiveAttr(cell) : 0;
      const byte_color = cell.color;
      if (useTEDColorSemantics && tedColorMode === 'tedFull') {
        const tedExtendedColorByte = getTedExtendedColorByte(cell);
        if (tedExtendedColorByte !== currTedExtendedColorByte) {
          bytes.push(TED_EXTENDED_COLOR_ESCAPE);
          bytes.push(tedExtendedColorByte);
          currTedExtendedColorByte = tedExtendedColorByte;
        }
      } else {
        const seqColorControlByte = getSeqColorControlByte(byte_color, useTEDColorSemantics);
        if (seqColorControlByte !== currColorControlByte) {
          bytes.push(seqColorControlByte);
          currColorControlByte = seqColorControlByte;
        }
      }
      if (useVdcSemantics) {
        const wantsLower = (attr & VDC_ATTR_ALTCHAR) !== 0;
        if (wantsLower !== vdcLowerMode) {
          bytes.push(wantsLower ? 0x0e : 0x8e);
          vdcLowerMode = wantsLower;
        }
        const wantsUnderline = (attr & 0x20) !== 0;
        if (wantsUnderline !== vdcUnderlineMode) {
          bytes.push(VDC_ESCAPE, wantsUnderline ? 0x49 : 0x4a);
          vdcUnderlineMode = wantsUnderline;
        }
        const wantsBlink = (attr & 0x10) !== 0;
        if (wantsBlink !== vdcBlinkMode) {
          bytes.push(VDC_ESCAPE, wantsBlink ? 0x4f : 0x50);
          vdcBlinkMode = wantsBlink;
        }
        const wantsReverse = (attr & VDC_ATTR_REVERSE) !== 0;
        if (wantsReverse !== currev) {
          bytes.push(wantsReverse ? 0x12 : 0x92);
          currev = wantsReverse;
        }
      } else {
        const code = cell.code;
        if (code >= 0x80 && code < 0x100) {
          if (!currev){
            bytes.push(0x12);
            currev = true;
          }
        } else {
          if (currev) {
            bytes.push(0x92);
            currev = false;
          }
        }
      }
      const byte_char = screencodeToExportByte(cell) & 0xff;

      if (stripBlanks) {
        // Save blanks into a buffer array
        if (!currev && isBlankSeqCharCode(byte_char)) {
          blank_buffer.push(byte_char);
        } else {
          // If the char is not a blank take all previous blanks (if any)
          // then print current char
          // If blanks are the latest chars they are just ignored
          for (let b = 0; b < blank_buffer.length; b++) {
            if (currev) {
              bytes.push(0x92);
            }
            appendSeqCharCode(blank_buffer[b]);
            if (currev) {
              bytes.push(0x12);
            }
          }
          blank_buffer = []; // reset blank buffer
          appendSeqCharCode(byte_char);
        }
      } else {
        appendSeqCharCode(byte_char);
      }
    }

    // Check if there are blanks left behind
    // In that case substitute them with a Carriage Return
    if (y < height - 1) {
      if (stripBlanks && blank_buffer.length > 0 && y !== lastCRrow) {
        appendCR(bytes, currev, blank_buffer.length === width);
        lastCRrow = y;
      }
      blank_buffer = [];

      if (insCR) {
        appendCR(bytes, currev, false);
        lastCRrow = y;
      }
    }
  }

  if (stripBlanks) {
    packColSequences(bytes);
    removeDupColours(bytes);
  }
}

const  saveSEQ = (filename: string, fb: FramebufWithFont, fmt: FileFormatSeq) => {
  try {
    let bytes:number[] = []
    let font = fb.charset;
    const {insCR, insClear, stripBlanks, insCharset, tedColorMode = 'quantize16'} = fmt.exportOptions;
    convertToSEQ(fb, bytes, insCR, insClear, stripBlanks, insCharset, font, tedColorMode);
    let buf = Buffer.from(bytes);
    fs.writeFileSync(filename, buf, null);
  }
  catch(e) {
    alert(`Failed to save file '${filename}'!`);
    console.error(e);
  }
}

export { saveSEQ }
