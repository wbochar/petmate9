import { fs } from '../electronImports';
import { framebufFromJson } from '../../redux/workspace';
import { DEFAULT_BACKGROUND_COLOR, DEFAULT_BORDER_COLOR, Framebuffer } from '../../redux/editor';
import { Pixel } from '../../redux/types';
import * as fp from '../fp'
import { promptProceedWithUnsavedChanges } from '..';

class cbaseDecoder {
  revsOn = false;
  c64Screen: Pixel[][] = [];
  cursorPosX: number = 0;
  cursorPosY: number = 0;
  cursorColor: number = 6;
  width: number = 40;
  height: number = 25;
  constructor() {
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

    switch (c) {
    case 0x60:

      break;

      case 0x05:
        this.cursorColor = 0x01;
        break;
      case 0x07:
        //Probably doesn't apply here: Play bell?
        break;
      case 0x0d:
        //no user in text.prg
        //this.carriageReturn();
        break;
      case 0x8d:
        //this.carriageReturn();
        break;
      case 0x85:
        // put a F1
        screencode(0x101);
        break;
      case 0x86:
        // put a F3
        screencode(0x102);
        break;
      case 0x87:
        // put a F5
        screencode(0x103);
        break;
      case 0x88:
        // put a F7
        screencode(0x104);
        if(!lastByte)
        {
        this.carriageReturn();
        }
        break;
    case 0x0e:
        //Probably doesn't apply here: Set_Lowercase();
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
      case 0x1c:
        this.cursorColor = 0x02; //Red
        break;
      case 0x1d:
        this.cursorRight();
        break;
      case 0x1e:
        this.cursorColor = 0x05; //Green
        break;
      case 0x1f:
        this.cursorColor = 0x06; //Blue
        break;
      case 0x81:
        this.cursorColor = 0x08; //Orange
        break;
      case 0x8e:
        //Probably doesn't apply here: Set_Uppercase();
        break;
      case 0x90:
        this.cursorColor = 0x00; //Black
        break;
      case 0x91:
        this.cursorUp();
        break;
      case 0x92:
        this.revsOn = false;
        break;
      case 0x93:
        //this.cls();
        screencode(0x105);
        break;
      case 0x95:
        this.cursorColor = 0x09; //Brown
        break;
      case 0x96:
        this.cursorColor = 0x0a; //Pink
        break;
      case 0x97:
        this.cursorColor = 0x0b; //Grey1
        break;
      case 0x98:
        this.cursorColor = 0x0c; //Grey2
        break;
      case 0x99:
        this.cursorColor = 0x0d; //Lt Green
        break;
      case 0x9a:
        this.cursorColor = 0x0e; //Lt Blue
        break;
      case 0x9b:
        this.cursorColor = 0x0f; //Grey3
        break;
      case 0x9c:
        this.cursorColor = 0x04; //Purple
        break;
      case 0x9d:
        this.cursorLeft();
        break;
      case 0x9e:
        this.cursorColor = 0x07; //Yellow
        break;
      case 0x9f:
        this.cursorColor = 0x03; //Cyan
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
    if(lastByte)
      screencode(0x107)
  }

  cls() {
    this.c64Screen = fp.mkArray(this.height, () => {
      return fp.mkArray(this.width, () => {
        return { code: 0x20, color: 14 };
      })
    });
  }

  carriageReturn() {

    this.cursorDown();
    this.revsOn = false;
    this.cursorPosX = 0;

  }

  del() {
    this.cursorLeft();
    this.scrnOut(0x20, false);
    this.cursorLeft();
  }

  scrnOut(b: number, lastByte: boolean) {
    var c = b;

    if (this.revsOn && c < 255) c += 0x80;

    this.c64Screen[this.cursorPosY][this.cursorPosX] = { code: c, color: this.cursorColor };
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
    for (let i = 0; i < seqFile.length+1; i++) {
            this.chrout(seqFile[i], i === seqFile.length);
    }

  }

}

export function loadCbase(filename: string) {
  try {
    var src_seqFile = fs.readFileSync(filename)

    //strip off PRG load address
    src_seqFile=src_seqFile.slice(2,src_seqFile.length-2)



    const separator = 0x0d

    //split SEQ data on 0d/13 to create prompt frames
    var prompts = src_seqFile.reduce((r: any, s: any, i: any, a: any) => {
        if (!i || a[i - 1]== separator) r.push([]);
        r[r.length - 1].push(s);
        return r;
    }, []);



    var framebuffers:any[] = [];

    prompts.forEach((prompt: any,index: any) => {
      var decoder = new cbaseDecoder();

//index<=10

      if(true)
      {

      decoder.decode(prompt);
      const promptName = "prompt-"+(index+1);
      //console.log(promptName,decoder.c64Screen.slice(0,decoder.cursorPosY+1));
      var framebuffer = framebufFromJson({
        width: 40,
        height: decoder.c64Screen.slice(0,decoder.cursorPosY+1).length,
        backgroundColor: 0,
        borderColor: 0,
        framebuf: decoder.c64Screen.slice(0,decoder.cursorPosY+1),
        name: promptName,
        charset: 'cbase lower',
        borderOn: false,
        zoom:  {zoomLevel:8,alignment:'center'},
    })

    framebuffers.push(framebuffer);

  }
}
  );
  return framebuffers;

  } catch (e) {
    alert(`Failed to load file '${filename}'!`)
    console.error(e)
    return undefined;
  }
}