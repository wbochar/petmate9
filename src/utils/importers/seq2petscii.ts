import { fs } from '../electronImports';
import { framebufFromJson } from '../../redux/workspace';
import { DEFAULT_BACKGROUND_COLOR, DEFAULT_BORDER_COLOR } from '../../redux/editor';
import { Pixel } from '../../redux/types';
import * as fp from '../fp'
import { isVdcCharset, VDC_ATTR_ALTCHAR, VDC_ATTR_COLOR_MASK, VDC_ATTR_REVERSE } from '../vdcAttr';
const TED_EXTENDED_COLOR_ESCAPE = 0x16;
const ESCAPE = 0x1b;
const VDC_ESC_UNDERLINE_ON = 0x49; // I
const VDC_ESC_UNDERLINE_OFF = 0x4a; // J
const VDC_ESC_BLINK_ON = 0x4f; // O
const VDC_ESC_BLINK_OFF = 0x50; // P
const VDC_ESC_RAW_CHAR = 0x56; // V (Petmate VDC raw-character extension)
export type SeqTedColorMode = 'quantize16' | 'tedFull';
const C64_SEQ_COLOR_BY_CONTROL_BYTE: { [controlByte: number]: number } = {
  0x90: 0x00,
  0x05: 0x01,
  0x1c: 0x02,
  0x9f: 0x03,
  0x9c: 0x04,
  0x1e: 0x05,
  0x1f: 0x06,
  0x9e: 0x07,
  0x81: 0x08,
  0x95: 0x09,
  0x96: 0x0a,
  0x97: 0x0b,
  0x98: 0x0c,
  0x99: 0x0d,
  0x9a: 0x0e,
  0x9b: 0x0f,
};

const TED_SEQ_COLOR_BY_CONTROL_BYTE: { [controlByte: number]: number } = {
  0x90: 0x00,
  0x05: 0x71,
  0x1c: 0x32,
  0x9f: 0x63,
  0x9c: 0x44,
  0x1e: 0x35,
  0x1f: 0x46,
  0x9e: 0x77,
  0x81: 0x48,
  0x95: 0x29,
  0x96: 0x5a,
  0x97: 0x6b,
  0x98: 0x5c,
  0x99: 0x6d,
  0x9a: 0x2e,
  0x9b: 0x5f,
};

function isC16Charset(charset: string) {
  return charset.startsWith('c16');
}

function decodeSeqColorControlByte(controlByte: number, useTedColors: boolean): number | null {
  const colorMap = useTedColors ? TED_SEQ_COLOR_BY_CONTROL_BYTE : C64_SEQ_COLOR_BY_CONTROL_BYTE;
  const color = colorMap[controlByte];
  return color === undefined ? null : color;
}

class SeqDecoder {
  revsOn = false;
  underlineOn = false;
  blinkOn = false;
  c64Screen: Pixel[][] = [];
  cursorPosX: number = 0;
  cursorPosY: number = 0;
  cursorColor: number = 0;
  width: number = 40;
  height: number = 500;
  useTedColors: boolean;
  useVdcSemantics: boolean;
  charsetLowerMode: boolean = false;
  pendingEscape: boolean = false;
  pendingVdcRawChar: boolean = false;
  constructor(charset: string = 'upper') {
    this.useTedColors = isC16Charset(charset);
    this.useVdcSemantics = isVdcCharset(charset);
    if (this.useVdcSemantics) {
      this.width = 80;
    }
    this.cls();
  }

  chrout(c: number, lastByte: boolean) {
    // lastByte is kind of a hack here.  When decoding
    // the last byte of input, we don't want to move the
    // "virtual cursor" to the right as that will cause
    // the screen to be shifted up.
    const screencode = (c: number) => {
      this.scrnOut(c, lastByte);
    }
    if (this.useVdcSemantics && this.pendingVdcRawChar) {
      this.pendingVdcRawChar = false;
      screencode(c);
      return;
    }
    if (this.useVdcSemantics && this.pendingEscape) {
      this.pendingEscape = false;
      switch (c) {
        case VDC_ESC_UNDERLINE_ON:
          this.underlineOn = true;
          return;
        case VDC_ESC_UNDERLINE_OFF:
          this.underlineOn = false;
          return;
        case VDC_ESC_BLINK_ON:
          this.blinkOn = true;
          return;
        case VDC_ESC_BLINK_OFF:
          this.blinkOn = false;
          return;
        case VDC_ESC_RAW_CHAR:
          this.pendingVdcRawChar = true;
          return;
      }
      return;
    }
    const decodedColor = decodeSeqColorControlByte(c, this.useTedColors);
    if (decodedColor !== null) {
      this.cursorColor = decodedColor;
      return;
    }
    switch (c) {
      case 0x07:
        //Probably doesn't apply here: Play bell?
        break;
      case 0x0d:
        this.carriageReturn();
        break;
      case 0x8d:
        this.carriageReturn();
        break;
      case 0x0e:
        if (this.useVdcSemantics) {
          this.charsetLowerMode = true;
        }
        break;
      case ESCAPE:
        if (this.useVdcSemantics) {
          this.pendingEscape = true;
        }
        break;
      case 0x02:
        if (this.useVdcSemantics) {
          this.underlineOn = true;
        }
        break;
      case 0x0f:
        if (this.useVdcSemantics) {
          this.blinkOn = true;
        }
        break;
      case 0x11:
        this.cursorDown();
        break;
      case 0x12:
        this.revsOn = true;
        break;
      case 0x13:
        this.cursorPosX = 0;
        this.cursorPosY = 0;
        break;
      case 0x14:
        this.del();
        break;
      case 0x1d:
        this.cursorRight();
        break;
      case 0x8e:
        if (this.useVdcSemantics) {
          this.charsetLowerMode = false;
        }
        break;
      case 0x82:
        if (this.useVdcSemantics) {
          this.underlineOn = false;
        }
        break;
      case 0x8f:
        if (this.useVdcSemantics) {
          this.blinkOn = false;
        }
        break;
      case 0x91:
        this.cursorUp();
        break;
      case 0x92:
        this.revsOn = false;
        break;
      case 0x93:
        this.cls();
        break;
      case 0x9d:
        this.cursorLeft();
        break;
      case 0xff:
        screencode(94);
        break;
      default:
        if ((c >= 0x20) && (c < 0x40)) screencode(c);
        if ((c >= 0x40) && (c <= 0x5f)) screencode((c - 0x40));
        if ((c >= 0x60) && (c <= 0x7f)) screencode((c - 0x20));
        if ((c >= 0xa0) && (c <= 0xbf)) screencode((c - 0x40));
        if ((c >= 0xc0) && (c <= 0xfe)) screencode((c - 0x80));
        break;
    }
  }

  cls() {
    this.pendingEscape = false;
    this.pendingVdcRawChar = false;
    this.c64Screen = fp.mkArray(this.height, () => {
      return fp.mkArray(this.width, () => {
        return { code: 0x40, color: DEFAULT_BACKGROUND_COLOR };
      })
    });
  }

  carriageReturn() {
    this.cursorDown();
    this.cursorPosX = 0;
  }

  del() {
    this.cursorLeft();
    this.scrnOut(0x20, false);
    this.cursorLeft();
  }

  scrnOut(b: number, lastByte: boolean) {
    var c = b;
    if (this.useVdcSemantics) {
      const color = this.cursorColor & VDC_ATTR_COLOR_MASK;
      let attr = color;
      if (this.revsOn) attr |= VDC_ATTR_REVERSE;
      if (this.charsetLowerMode) attr |= VDC_ATTR_ALTCHAR;
      if (this.underlineOn) attr |= 0x20;
      if (this.blinkOn) attr |= 0x10;
      this.c64Screen[this.cursorPosY][this.cursorPosX] = { code: c & 0xff, color, attr };
    } else {
      if (this.revsOn) c += 0x80;
      this.c64Screen[this.cursorPosY][this.cursorPosX] = { code: c, color: this.cursorColor };
    }
    if (!lastByte) {
      this.cursorRight();
    }
  }

  cursorRight() {
    if (this.cursorPosX < this.width - 1) {
      this.cursorPosX++;
    }
    else {
      if (this.cursorPosY < this.height - 1) {
        this.cursorPosY++;
        this.cursorPosX = 0;
      }
      else {
        this.scrollAllUp();
        this.cursorPosX = 0;
        this.cursorPosY = this.height - 1;
      }
    }
  }
  cursorUp() {
    if (this.cursorPosY > 0) this.cursorPosY--;
  }

  cursorDown() {
    if (this.cursorPosY < this.height - 1) {
      this.cursorPosY++;
    }
    else {
      this.scrollAllUp();
    }
  }

  cursorLeft() {
    if (this.cursorPosX > 0) {
      this.cursorPosX--;
    }
    else {
      if (this.cursorPosY > 0) {
        this.cursorPosX = this.width - 1;
        this.cursorPosY--;
      }
    }
  }

  scrollAllUp() {
    for (let y = 1; y < this.height; y++) {
      this.c64Screen[y - 1] = this.c64Screen[y];
    }
  }

  decode(seqFile: any) {
    this.cls();
    for (let i = 0; i < seqFile.length; i++) {
      if (this.useTedColors && seqFile[i] === TED_EXTENDED_COLOR_ESCAPE && i + 1 < seqFile.length) {
        this.cursorColor = seqFile[i + 1] & 0xff;
        i++;
        continue;
      }
      this.chrout(seqFile[i], i === seqFile.length-1);
    }
  }

}

export function loadSeq(filename: string, charsetHint: string = 'upper') {
  try {
    const seqFile = fs.readFileSync(filename)
    const decoder = new SeqDecoder(charsetHint);
    decoder.decode(seqFile);
    var framebuffer = framebufFromJson({
      width: decoder.width,
      height: decoder.cursorPosY+1,
      backgroundColor: DEFAULT_BACKGROUND_COLOR,
      borderColor: DEFAULT_BORDER_COLOR,
      charset: charsetHint,
      framebuf: decoder.c64Screen.slice(0,decoder.cursorPosY+1),
      name: filename.startsWith('/') ? filename.split(".")[0].split('/')[filename.split(".")[0].split('/').length-1] : filename.split(".")[0].split('\\')[filename.split(".")[0].split('\\').length-1],

    })

    return framebuffer;
  } catch (e) {
    alert(`Failed to load file '${filename}'!`)
    console.error(e)
    return undefined;
  }
}

export interface SeqAdvOptions {
  width: number;
  minHeight?: number;
  crCodes: Set<number>;
  honorCls: boolean;
  stripBlanks: boolean;
  charset: string;
  tedColorMode?: SeqTedColorMode;
  backgroundColor: number;
  borderColor: number;
}

class SeqAdvDecoder {
  revsOn = false;
  underlineOn = false;
  blinkOn = false;
  c64Screen: Pixel[][] = [];
  cursorPosX: number = 0;
  cursorPosY: number = 0;
  cursorColor: number = 0;
  width: number;
  height: number = 500;
  crCodes: Set<number>;
  honorCls: boolean;
  useTedColors: boolean;
  useVdcSemantics: boolean;
  tedColorMode: SeqTedColorMode;
  charsetLowerMode: boolean = false;
  pendingEscape: boolean = false;
  pendingVdcRawChar: boolean = false;

  constructor(width: number, crCodes: Set<number>, honorCls: boolean, charset: string, tedColorMode: SeqTedColorMode) {
    this.width = width;
    this.crCodes = crCodes;
    this.honorCls = honorCls;
    this.useTedColors = isC16Charset(charset);
    this.useVdcSemantics = isVdcCharset(charset);
    this.tedColorMode = tedColorMode;
    this.cls();
  }

  chrout(c: number, lastByte: boolean) {
    const screencode = (c: number) => {
      this.scrnOut(c, lastByte);
    }
    if (this.useVdcSemantics && this.pendingVdcRawChar) {
      this.pendingVdcRawChar = false;
      screencode(c);
      return;
    }
    if (this.useVdcSemantics && this.pendingEscape) {
      this.pendingEscape = false;
      switch (c) {
        case VDC_ESC_UNDERLINE_ON:
          this.underlineOn = true;
          return;
        case VDC_ESC_UNDERLINE_OFF:
          this.underlineOn = false;
          return;
        case VDC_ESC_BLINK_ON:
          this.blinkOn = true;
          return;
        case VDC_ESC_BLINK_OFF:
          this.blinkOn = false;
          return;
        case VDC_ESC_RAW_CHAR:
          this.pendingVdcRawChar = true;
          return;
      }
      return;
    }

    // Check if this byte is a configured line ending
    if (this.crCodes.has(c)) {
      this.carriageReturn();
      return;
    }
    const decodedColor = decodeSeqColorControlByte(c, this.useTedColors);
    if (decodedColor !== null) {
      this.cursorColor = decodedColor;
      return;
    }

    switch (c) {
      case 0x07:
        break;
      case 0x0e:
        if (this.useVdcSemantics) {
          this.charsetLowerMode = true;
        }
        break;
      case ESCAPE:
        if (this.useVdcSemantics) {
          this.pendingEscape = true;
        }
        break;
      case 0x02:
        if (this.useVdcSemantics) {
          this.underlineOn = true;
        }
        break;
      case 0x0f:
        if (this.useVdcSemantics) {
          this.blinkOn = true;
        }
        break;
      case 0x11:
        this.cursorDown();
        break;
      case 0x12:
        this.revsOn = true;
        break;
      case 0x13:
        this.cursorPosX = 0;
        this.cursorPosY = 0;
        break;
      case 0x14:
        this.del();
        break;
      case 0x1d:
        this.cursorRight();
        break;
      case 0x8e:
        if (this.useVdcSemantics) {
          this.charsetLowerMode = false;
        }
        break;
      case 0x82:
        if (this.useVdcSemantics) {
          this.underlineOn = false;
        }
        break;
      case 0x8f:
        if (this.useVdcSemantics) {
          this.blinkOn = false;
        }
        break;
      case 0x91:
        this.cursorUp();
        break;
      case 0x92:
        this.revsOn = false;
        break;
      case 0x93:
        if (this.honorCls) {
          this.cls();
        }
        break;
      case 0x9d:
        this.cursorLeft();
        break;
      case 0xff:
        screencode(94);
        break;
      default:
        if ((c >= 0x20) && (c < 0x40)) screencode(c);
        if ((c >= 0x40) && (c <= 0x5f)) screencode((c - 0x40));
        if ((c >= 0x60) && (c <= 0x7f)) screencode((c - 0x20));
        if ((c >= 0xa0) && (c <= 0xbf)) screencode((c - 0x40));
        if ((c >= 0xc0) && (c <= 0xfe)) screencode((c - 0x80));
        break;
    }
  }

  cls() {
    this.pendingEscape = false;
    this.pendingVdcRawChar = false;
    this.c64Screen = fp.mkArray(this.height, () => {
      return fp.mkArray(this.width, () => {
        return { code: 0x40, color: DEFAULT_BACKGROUND_COLOR };
      })
    });
  }

  carriageReturn() {
    this.cursorDown();
    this.cursorPosX = 0;
  }

  del() {
    this.cursorLeft();
    this.scrnOut(0x20, false);
    this.cursorLeft();
  }

  scrnOut(b: number, lastByte: boolean) {
    var c = b;
    if (this.useVdcSemantics) {
      const color = this.cursorColor & VDC_ATTR_COLOR_MASK;
      let attr = color;
      if (this.revsOn) attr |= VDC_ATTR_REVERSE;
      if (this.charsetLowerMode) attr |= VDC_ATTR_ALTCHAR;
      if (this.underlineOn) attr |= 0x20;
      if (this.blinkOn) attr |= 0x10;
      this.c64Screen[this.cursorPosY][this.cursorPosX] = { code: c & 0xff, color, attr };
    } else {
      if (this.revsOn) c += 0x80;
      this.c64Screen[this.cursorPosY][this.cursorPosX] = { code: c, color: this.cursorColor };
    }
    if (!lastByte) {
      this.cursorRight();
    }
  }

  cursorRight() {
    if (this.cursorPosX < this.width - 1) {
      this.cursorPosX++;
    } else {
      if (this.cursorPosY < this.height - 1) {
        this.cursorPosY++;
        this.cursorPosX = 0;
      } else {
        this.scrollAllUp();
        this.cursorPosX = 0;
        this.cursorPosY = this.height - 1;
      }
    }
  }

  cursorUp() {
    if (this.cursorPosY > 0) this.cursorPosY--;
  }

  cursorDown() {
    if (this.cursorPosY < this.height - 1) {
      this.cursorPosY++;
    } else {
      this.scrollAllUp();
    }
  }

  cursorLeft() {
    if (this.cursorPosX > 0) {
      this.cursorPosX--;
    } else {
      if (this.cursorPosY > 0) {
        this.cursorPosX = this.width - 1;
        this.cursorPosY--;
      }
    }
  }

  scrollAllUp() {
    for (let y = 1; y < this.height; y++) {
      this.c64Screen[y - 1] = this.c64Screen[y];
    }
  }

  decode(seqFile: any) {
    this.cls();
    for (let i = 0; i < seqFile.length; i++) {
      if (
        this.useTedColors &&
        this.tedColorMode === 'tedFull' &&
        seqFile[i] === TED_EXTENDED_COLOR_ESCAPE &&
        i + 1 < seqFile.length
      ) {
        this.cursorColor = seqFile[i + 1] & 0xff;
        i++;
        continue;
      }
      this.chrout(seqFile[i], i === seqFile.length - 1);
    }
  }
}

function stripTrailingBlanks(screen: Pixel[][], width: number, height: number): Pixel[][] {
  return screen.map(row => {
    const result = [...row];
    let lastNonBlank = width - 1;
    while (lastNonBlank >= 0 && (result[lastNonBlank].code === 0x20 || result[lastNonBlank].code === 0x40)) {
      lastNonBlank--;
    }
    // Keep the row as-is (full width) but clear trailing blanks to space
    for (let x = lastNonBlank + 1; x < width; x++) {
      result[x] = { code: 0x20, color: result[x].color };
    }
    return result;
  });
}

export function loadSeqAdvanced(filename: string, options: SeqAdvOptions) {
  try {
    const seqFile = fs.readFileSync(filename);
    const decoder = new SeqAdvDecoder(
      options.width,
      options.crCodes,
      options.honorCls,
      options.charset,
      options.tedColorMode ?? 'quantize16'
    );
    decoder.decode(seqFile);
    const detectedHeight = decoder.cursorPosY + 1;
    const finalHeight = Math.max(detectedHeight, options.minHeight ?? 0);
    let screen = decoder.c64Screen.slice(0, finalHeight);

    if (options.stripBlanks) {
      screen = stripTrailingBlanks(screen, options.width, finalHeight);
    }

    const name = filename.startsWith('/')
      ? filename.split(".")[0].split('/')[filename.split(".")[0].split('/').length - 1]
      : filename.split(".")[0].split('\\')[filename.split(".")[0].split('\\').length - 1];

    const framebuffer = framebufFromJson({
      width: options.width,
      height: finalHeight,
      backgroundColor: options.backgroundColor,
      borderColor: options.borderColor,
      charset: options.charset,
      framebuf: screen,
      name,
    });

    return framebuffer;
  } catch (e) {
    alert(`Failed to load file '${filename}'!`);
    console.error(e);
    return undefined;
  }
}
