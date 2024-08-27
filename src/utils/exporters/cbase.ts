
import { FileFormatCbase, Framebuf, FramebufWithFont } from '../../redux/types'
import { fs } from '../electronImports'


const seq_colors: number[]=[
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

function appendCR(bytes:number[], currev:boolean, force:boolean) {
  // Append a Carriage Return if not already done
  if (force || (bytes.length && (bytes[bytes.length -1] & 0x7f) != 0x0d))
    bytes.push(currev ? 0x0d : 0x8d)
}

function packColSequences(bytes:number[]) {
  let idx:number = bytes.length;
  while (idx >= 0) {
    // Strip colour byte if it appears before a CR and a new colour byte
    if ((bytes[idx] & 0x7f) == 0x0d) {
      if (seq_colors.includes(bytes[idx - 1]) && seq_colors.includes(bytes[idx + 1])) {
        bytes.splice(idx - 1,1);
        idx--;
      }
    }
    // Strip sequence of colour bytes except the last one
    if (seq_colors.includes(bytes[idx - 1]) && seq_colors.includes(bytes[idx])) {
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
    if (seq_colors.includes(currByte)) {
      if (currByte == prevColByte) {
        bytes.splice(prevColByteIdx, 1);
      }
      prevColByte = currByte;
      prevColByteIdx = idx;
    }
    idx--;
  }
}


function convertToCbase(fb: Framebuf, bytes:number[], insCR:boolean, insClear:boolean, stripBlanks:boolean, insCharset:boolean, font:string) {
  const { width, height, framebuf } = fb;
  let currcolor = -1;
  let currev = false;
  let blank_buffer: number[] = [];
  let lastCRrow = -1;

  for (let y = 0; y < height; y++) {

    for (let x = 0; x < width; x++) {

      let byte_char = framebuf[y][x].code;
      let byte_color = framebuf[y][x].color;

      if (byte_char === 0x100)
      {
        //P:transparency in -> space out
        bytes.push(0x20)

      }
      if (byte_char === 0x101)
      {
        //P:F1
        bytes.push(0x85)

      }
      if (byte_char === 0x102)
      {
        //P:F3
        bytes.push(0x86)
      }
      if (byte_char === 0x103)
      {
        //P:F5
        bytes.push(0x87)
      }
      if (byte_char === 0x104)
      {
        //P:F7 / Line break
        bytes.push(0x88)
        break;
      }
      if (byte_char === 0x105)
      {
        //P:Home
        bytes.push(0x13)
      }
      if (byte_char === 0x106)
      {
        //P:CLR HOME
        bytes.push(0x93)
      }
      if (byte_char === 0x107)
      {
        //P:Left Cursor
        bytes.push(0x9d)
      }
      if (byte_char === 0x108)
      {
        //P:Right Cursor
        bytes.push(0x1d)
      }
      if (byte_char === 0x109)
      {
        //P:Up Cursor
        bytes.push(0x91)
      }
      if (byte_char === 0x10a)
      {
        //P:Down Cursor
        bytes.push(0x11)
      }
      if (byte_char === 0x10b)
      {
        //P:Delete
        bytes.push(0x14)
      }
      if (byte_char === 0x10c)
      {
        //P:Insert
        bytes.push(0x94)
      }

      if (byte_char === 0x10f)
      {
        //P:End of Prompt
        bytes.push(0x0d)
        break;
      }



      if(byte_char < 0x100)
      {
      if (byte_color != currcolor) {
        bytes.push(seq_colors[byte_color]);
        currcolor = byte_color;
      }
      }





      if (byte_char >= 0x80 && byte_char <= 0xff) {
        if (!currev){
          bytes.push(0x12);
          currev = true;
        }
        byte_char &= 0x7f
      } else {
        if (currev) {
          bytes.push(0x92);
          currev = false;
        }
      }
      if ((byte_char >= 0) && (byte_char <= 0x1f)) {
        byte_char = byte_char + 0x40;
      }
      else
      {
          if ((byte_char >= 0x40) && (byte_char <= 0x5d))
          {
            byte_char = byte_char + 0x80;
          }
          else
          {
              if (byte_char == 0x5e) {
                byte_char = 0xff;
              }
              else
              {
                  if (byte_char == 0x5f) {
                    byte_char = 0xdf;
                  }
                  else
                  {
                      if (byte_char == 0x95)
                      {
                        byte_char = 0xdf;
                      }
                      else
                      {
                          if ((byte_char >= 0x60) && (byte_char <= 0x7f))
                          {
                            byte_char = byte_char + 0x40;
                          }
                          else
                          {
                              if ((byte_char >= 0x80) && (byte_char <= 0xbf))
                              {
                                byte_char = byte_char - 0x80;
                              }
                              else
                              {
                                  if ((byte_char >= 0xc0) && (byte_char <= 0xff))
                                  {
                                    byte_char = byte_char - 0x40;
                                  }
                              }
                          }
                      }
                  }
              }
          }
      }

      if(byte_char<=0xff)
        bytes.push(byte_char);

    }

  }
}

const  saveCbase = (filename: string, fbs: FramebufWithFont[], fmt: FileFormatCbase) => {

  console.log("saveCbase:",filename);



  let prgBytes:number[] = [0x00,0xe3];

  try {

    let totalFrames = 0;
    fbs.forEach((fb: any,index: any) => {

      console.log(fb.name);
      if(fb.name.startsWith('prompt'))
        totalFrames++;




    })

    console.log("Total Frames:",totalFrames);


    fbs.forEach((fb: any,index: any) => {

      if(fb.name.startsWith('prompt'))
      {

    let font = fb.charset;
    let bytes:number[] = []
    const {insCR, insClear, stripBlanks, insCharset} = fmt.exportOptions;
    console.log(fb.name,fb);

    convertToCbase(fb, bytes, insCR, insClear, stripBlanks, insCharset, font);

    [...bytes].forEach((byteNumber: any)=>{
      console.log(fb.name,byteNumber.toString(16))
    })

    //let buf = new Buffer(bytes);
    prgBytes.push(...bytes);
      }
    });

    let buf = new Buffer(prgBytes);

    fs.writeFileSync(filename, buf, null);


  }
  catch(e) {
    alert(`Failed to save file '${filename}'!`);
    console.error(e);
  }
}

export { saveCbase }