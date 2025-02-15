
import { chunkArray, executablePrgTemplate } from '../../utils'

import { Framebuf, FileFormat, FileFormatPrg, FramebufWithFont, FileFormatPlayerV1, FileFormatUltPrg} from '../../redux/types'
import { CHARSET_LOWER } from '../../redux/editor'

import { saveAsm, genAsm } from './asm'
import { saveBASIC } from './basic'
import { saveGIF } from './gif'
import { savePNG, getPNG } from './png'
import { saveJSON, getJSON } from './json'
import { saveSEQ } from './seq'
import { savePET } from './pet'
import { saveD64 } from './d64'
import { saveCbase } from './cbase'
import { savePlayer } from './player'
import { fs } from '../electronImports'
import * as c64jasm from 'c64jasm';

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

  // TODO support multiple screens
  const num = String(idx).padStart(4, '0')
  lines.push(`unsigned char frame${num}[]={// border,bg,chars,colors`)

  let bytes = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      bytes.push(framebuf[y][x].code)
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

function saveMarqC(filename: string, fbs: Framebuf[], _options: FileFormat) {
  try {
    let lines: string[] = []
    fbs.forEach((fb, idx) => {
      convertToMarqC(lines, fb, idx)

      lines.push(`// META: ${fb.width} ${fb.height} C64 ${fbs[idx].charset}`)
    })


    fs.writeFileSync(filename, lines.join('\n') + '\n', null)
  }
  catch (e) {
    alert(`Failed to save file '${filename}'!`)
    console.error(e)
  }
}

function exportC64jasmPRG(filename: string, fb: FramebufWithFont, fmt: FileFormatPrg) {
  //console.log("c64jasm export");
  const source = genAsm([fb], {
    ...fmt,
    name: 'asmFile',
    description: 'ASM Assembly source files (.asm)',
    ext: 'asm',

    exportOptions: {
      currentScreenOnly: true,
      standalone: true,
      hex: true,
      assembler: 'c64jasm'
    }
  });

  const sourceFileMap: { [index: string]: string } = {
    "main.asm": source
  }
  const options = {
    readFileSync: (fname: string) => {
      if (fname in sourceFileMap) {
        return Buffer.from(sourceFileMap[fname]);
      }
      throw new Error(`File not found ${fname}`);
    }
  }
  const res = c64jasm.assemble("main.asm", options);
  if (res.errors.length !== 0) {
    throw new Error("c64jasm.assemble failed, this should not happen.");
  }

  try {
    fs.writeFileSync(filename, res.prg, null)
  } catch (e) {
    alert(`Failed to save file '${filename}'!`)
    console.error(e)
  }
}

/*
function isFrameSizeOk(fb:Framebuf,maxWidth:number,maxHeight:number) : boolean
{
  return (fb.width<=maxWidth && fb.height<=maxHeight)
}
*/
function saveExecutablePlayer(filename: string, fbs: FramebufWithFont[], fmt: FileFormatPlayerV1)
  {

    const options = fmt.exportOptions;
    var maxWidth = 0
    var maxHeight = 0
    //const fbIndex = fmt.commonExportParams.selectedFramebufIndex


    switch (options.computer) {
      case 'c64':

        maxWidth = 40
        maxHeight = 25
        break;

      case 'vic20':

        maxWidth = 22
        maxHeight = 23
        break;

      case 'pet4032':

        maxWidth = 80
        maxHeight = 25
        break;

      default:
        console.log('Should not get here!!');
        return;

    }

    console.log("Computer",options.computer,"Max Dimensions",maxWidth,maxHeight)
/*
    if(!options.currentScreenOnly)
      {
        // Single fb (Single Frame, Long, Wide, Omni, Terminal/Noter)


       // console.log("single fb", "Frame Size ok?:"+isFrameSizeOk(fbs[fbIndex],maxWidth,maxHeight))



      }
      else
      {

        Multiple Frames, frame stack animations so Fb dimensions
        have to be equal or smaller than the platforms max size. Also
        have to calculate the available memory...
        c64 base mem, c64 REU
        vic20 base mem 5k, Music player? expands to

        if(options.playerType==='Animation')
        {

          for (let fidx = 0; fidx < fbs.length; fidx++)
          {
            const selectedFb = fbs[fidx]
          //  console.log("multiple fb:"+fidx, "Frame Size ok?:"+isFrameSizeOk(selectedFb,maxWidth,maxHeight))

          }

        }
        else
        {
          return;

        }


      }

*/

    //  exportC64jasmPRG(filename, fb, options);

  }


  function saveExecutablePRG(filename: string, fb: FramebufWithFont, options: FileFormatPrg) {
    try {
      const {
        width,
        height,
        framebuf,
        backgroundColor,
        borderColor,
        charset
      } = fb

      if (width !== 40 || height !== 25) {
        throw new Error('Only 40x25 framebuffer widths are supported!')
      }

      // Custom font export chooses a more complex path that doesn't produce
      // the same .PRG binary format as the below code.  This assembler
      // path would support the same features as this template thingie,
      // but some apps like Marq's PETSCII support loading .PRG files
      // if the binary is exactly as converted below.
      if (!(charset === 'upper' || charset === 'lower')) {
        exportC64jasmPRG(filename, fb, options);
        return;
      }

      // Patch a .prg template that has a known code structure.
      // We search for STA instructions that write to registers and
      // modify the values we store.  For example, to set the
      // lowercase charset, search for the below and modify it:
      //
      // Look for this:
      //
      // LDA #$14   (default on C64 is actually $15 but bit 0 is unused)
      // STA $d018
      //
      // Change it to:
      //
      // LDA #$17
      // STA $d018

      let buf = executablePrgTemplate.slice(0)
      // Search for STA $d020
      const d020idx = buf.indexOf(Buffer.from([0x8d, 0x20, 0xd0]))
      buf[d020idx - 1] = borderColor
      // Search for STA $d021
      const d021idx = buf.indexOf(Buffer.from([0x8d, 0x21, 0xd0]))
      buf[d021idx - 1] = backgroundColor

      if (charset === CHARSET_LOWER) {
        // LDA #$14 -> LDA #$17
        const offs = buf.indexOf(Buffer.from([0x8d, 0x18, 0xd0]))
        buf[offs - 1] = 0x17;
      }

      let screencodeOffs = 0x62
      let colorOffs = screencodeOffs + 1000

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          buf[screencodeOffs++] = framebuf[y][x].code
          buf[colorOffs++] = framebuf[y][x].color
        }
      }

      fs.writeFileSync(filename, buf, null)
    }
    catch (e) {
      alert(`Failed to save file '${filename}'!`)
      console.error(e)
    }
  }
function saveUltimatePRG(filename: string, fb: FramebufWithFont, options: FileFormatUltPrg,ultimateAddress:string) {
  try {
    const {
      width,
      height,
      framebuf,
      backgroundColor,
      borderColor,
      charset
    } = fb

    if(charset!=="upper" && charset !=="lower")
    {
        alert("Only base c64 charsets are supported");
        return;
    }
    if (width !== 40 || height !== 25) {
      //throw new Error('Only 40x25 framebuffer widths are supported!')
      alert("40x25 c64 images only")
      return;
    }

    let buf = executablePrgTemplate.slice(0)
    // Search for STA $d020
    const d020idx = buf.indexOf(Buffer.from([0x8d, 0x20, 0xd0]))
    buf[d020idx - 1] = borderColor
    // Search for STA $d021
    const d021idx = buf.indexOf(Buffer.from([0x8d, 0x21, 0xd0]))
    buf[d021idx - 1] = backgroundColor

    if (charset === CHARSET_LOWER) {
      // LDA #$14 -> LDA #$17
      const offs = buf.indexOf(Buffer.from([0x8d, 0x18, 0xd0]))
      buf[offs - 1] = 0x17;
    }

    let screencodeOffs = 0x62
    let colorOffs = screencodeOffs + 1000

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        buf[screencodeOffs++] = framebuf[y][x].code
        buf[colorOffs++] = framebuf[y][x].color
      }
    }

    //fs.writeFileSync(filename, buf, null)



    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/octet-stream");

    const file = buf;

    let params: RequestInit = {
      headers: myHeaders,
      method: "POST",
      body: file,

    }



    fetch(ultimateAddress+"/v1/runners:run_prg", params)
      .then((response) => response.text())
      .then((result) => console.log(result))
      .catch((error) => alert(error));



  }
  catch (e) {
    alert(`Failed to save file '${filename}'!`)
    console.error(e)
  }
}

export {
  savePNG,
  saveMarqC,
  saveExecutablePRG,
  saveAsm,
  saveBASIC,
  saveGIF,
  saveJSON,
  saveSEQ,
  savePET,
  saveD64,
  saveCbase,
  getJSON,
  getPNG,
  saveExecutablePlayer,
  savePlayer,
  saveUltimatePRG,

}
