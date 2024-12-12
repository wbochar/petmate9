import { chunkArray } from '..'
import { electron, fs, path } from '../electronImports'
import { FileFormatPlayerV1, FramebufWithFont } from '../../redux/types';
import * as fp from '../fp'
import * as c64jasm from 'c64jasm';

const singleFrameASM = (computer: string, music: boolean, color: boolean, frameName: string, charsetBits: string, petsciiBytes: string[]) => `

; Petmate9 Player (${computer} version) written by wbochar 2024
!include "macros.asm"
${music === true ? '!use "plugins/sid" as sid' : ''}
${music === true ? '!let music = sid("assets/sidFile.sid")' : ''}

!let irq_top_line = 1
!let debug_build = FALSE
!let zptmp0 = $20


+basic_start(entry)
;--------------------------------------------------------------
; Execution starts here
;--------------------------------------------------------------
entry: {
${music === true ? '    lda #0 ; does song selector work?' : ''}
${music === true ? '    jsr music.init' : ''}

    sei
    lda #$35        ; Bank out kernal and basic
    sta $01         ; $e000-$ffff
    +setup_irq(irq_top, irq_top_line)
    cli



    lda ${frameName}
    sta $d020
    lda ${frameName}+1
    sta $d021
    ${charsetBits}




    ldx #$00
loop:
    lda ${frameName}+2,x
    sta SCREEN,x
${color === true ? '    lda '+frameName+'+$3ea,x':''}
${color === true ? '    sta COLOR,x':''}
    lda ${frameName}+$102,x
    sta SCREEN+$100,x
${color === true ? '    lda '+frameName+'+$4ea,x':''}
${color === true ? '    sta COLOR+$100,x':''}

    lda ${frameName}+$202,x
    sta SCREEN+$200,x
${color === true ? '    lda '+frameName+'+$5ea,x':''}
${color === true ? '    sta COLOR+$200,x':''}

    lda ${frameName}+$2ea,x
    sta SCREEN+$2e8,x
${color === true ? '    lda '+frameName+'+$6d2,x':''}
${color === true ? '    sta COLOR+$2e8,x':''}
    inx
    bne loop

    jmp *


frame_loop:
    ; wait for vSync by polling the frameCount that's inc'd
    ; by the raster IRQ
    lda frameCount
vSync:
    cmp frameCount
    beq vSync


    jmp frame_loop
}

irq_top: {
    +irq_start(end)
    inc frameCount

!if (debug_build) {
    inc $d020
}

${music === true ? '    jsr music.play' : ''}

!if (debug_build) {
    dec $d020
}

    +irq_end(irq_top, irq_top_line)
end:
}

frameCount:     !byte 0



${music === true ? '    * = music.startAddress  ; most sids will go to $1000' : ''}
${music === true ? '    sid_data: !byte music.data' : ''}


* = $2000

${petsciiBytes.join('')}


`;


const singleFrameVic20ASM = (computer: string, music: boolean, color: boolean, frameName: string, charsetBits: string, petsciiBytes: string[]) => `

; Petmate9 Player (${computer} version) written by wbochar 2024
!include "macros.asm"
+basic_start(entry)
;--------------------------------------------------------------
; Execution starts here
;--------------------------------------------------------------
entry: {

  ${charsetBits}

    lda ${frameName}Chars-2
    sta $900f
    ldx #$00

loop:
    lda ${frameName}Chars,x
    sta SCREEN,x
${color === true ? '    lda '+frameName+'Colours,x':''}
${color === true ? '    sta COLOR,x':''}
    lda ${frameName}Chars+$100,x
    sta SCREEN+$100,x
${color === true ? '    lda '+frameName+'Colours+$100,x':''}
${color === true ? '    sta COLOR+$100,x':''}


    inx
    bne loop

    jmp *

}

${petsciiBytes.join('')}


`;


function maybeLabelName(name: string | undefined) {
  return fp.maybeDefault(name, 'untitled' as string);
}


function toHex8(v: number): string {
  return `${v.toString(16).toUpperCase().padStart(2, '0')}`
}

function bytesToCommaDelimited(bytes: number[], bytesPerLine: number, hex: boolean) {
  let lines = chunkArray(bytes, bytesPerLine)
  let outLines: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const nums = lines[i].map(n => hex ? `$${toHex8(n)}` : `${n}`);
    const line = (`\n!byte ${nums.join(',')}`)
    outLines.push(line);
  }
  return outLines;
}



const savePlayer = (filename: string, fbs: FramebufWithFont[], fmt: FileFormatPlayerV1) => {

  const appPath = electron.remote.app.getAppPath()
  var source: string = "";
  var sourceFileMap: { [index: string]: string } = {}
  var music = fmt.exportOptions.music;
  var sidFile = music ? fs.readFileSync(path.resolve(fmt.exportOptions.songFile[0])) : "";
  var sidJs = music ? fs.readFileSync(path.resolve(appPath, "assets/sid.js")): "";
  var macrosAsm
  var lines: string[] = [];
if(fmt.exportOptions.computer==='c64')
{
      macrosAsm = fs.readFileSync(path.resolve(appPath, "assets/macrosc64.asm"))

      const fb = fbs[fmt.commonExportParams.selectedFramebufIndex]
      const { width, height, framebuf, backgroundColor, borderColor, name } = fb;

      lines = [];
      lines.push(`${maybeLabelName(name)}:\n`);

      let bytes = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          bytes.push(framebuf[y][x].code);
        }
      }
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          bytes.push(framebuf[y][x].color);
        }
      }

      lines.push(`!byte ${borderColor},${backgroundColor}`);
      lines.push(...bytesToCommaDelimited(bytes, width, true));


      let charsetBits;
      switch (fb.charset) {
        case 'upper': charsetBits = " lda #$15 \n sta $d018 \n"; break;
        case 'lower': charsetBits = " lda #$17 \n sta $d018 \n"; break;
        default: charsetBits = `%00010000 | ((${maybeLabelName(name)}_font/2048)*2)`; break;
      }

      source = singleFrameASM(fmt.exportOptions.computer,music, true, maybeLabelName(name), charsetBits, lines);
    console.log(source);
    }

    else if(fmt.exportOptions.computer==='pet4032')
      {


      macrosAsm = fs.readFileSync(path.resolve(appPath, "assets/macrosPET4032.asm"))

      const fb = fbs[fmt.commonExportParams.selectedFramebufIndex]
      const { width, height, framebuf, backgroundColor, borderColor, name } = fb;
      lines = [];

      lines.push(`${maybeLabelName(name)}:\n`);

      let bytes = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          bytes.push(framebuf[y][x].code);
        }
      }

      lines.push(`!byte ${borderColor},${backgroundColor}`);
      lines.push(...bytesToCommaDelimited(bytes, width, true));

      let charsetBits;
      switch (fb.charset) {

        case 'petGfx': charsetBits = " lda #12 \n sta $e84c \n"; break;
        case 'petBiz': charsetBits = " lda #14 \n sta $e84c \n"; break;

        default: charsetBits = `%00010000 | ((${maybeLabelName(name)}_font/2048)*2)`; break;
      }
      //overriding music mode until I find a player..
      music = false;
      source = singleFrameASM(fmt.exportOptions.computer,music, false, maybeLabelName(name), charsetBits, lines);
    // console.log(source)
  }
  else if(fmt.exportOptions.computer==='c128')
    {


    macrosAsm = fs.readFileSync(path.resolve(appPath, "assets/macrosc128.asm"))

    const fb = fbs[fmt.commonExportParams.selectedFramebufIndex]
    const { width, height, framebuf, backgroundColor, borderColor, name } = fb;
    lines= [];

    lines.push(`${maybeLabelName(name)}:\n`);

    let bytes = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        bytes.push(framebuf[y][x].code);
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        bytes.push(framebuf[y][x].color);
      }
    }

    lines.push(`!byte ${borderColor.toString(16)},${backgroundColor.toString(16)}`);
    lines.push(...bytesToCommaDelimited(bytes, width, true));


    let charsetBits;
    switch (fb.charset) {
      case 'c128Upper': charsetBits = " lda #$15 \n sta $d018 \n"; break;
      case 'c128Lower': charsetBits = " lda #$17 \n sta $d018 \n"; break;
      default: charsetBits = `%00010000 | ((${maybeLabelName(name)}_font/2048)*2)`; break;
    }

    source = singleFrameASM(fmt.exportOptions.computer,music, true, maybeLabelName(name), charsetBits, lines);

}
else if(fmt.exportOptions.computer==='vic20')
  {


  macrosAsm = fs.readFileSync(path.resolve(appPath, "assets/macrosvic20.asm"))

  const fb = fbs[fmt.commonExportParams.selectedFramebufIndex]
  const { width, height, framebuf, backgroundColor, borderColor, name } = fb;
  lines = [];

  var vic20BGBColor = (backgroundColor * 16)+borderColor+8
  lines.push(`!byte ${vic20BGBColor},${vic20BGBColor}`);
  lines.push(`\n${maybeLabelName(name)}Chars:\n`);

  let bytesChar = [];
  let bytesColour = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      bytesChar.push(framebuf[y][x].code);
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      bytesColour.push(framebuf[y][x].color);

    }
  }



  //console.log("BG:"+backgroundColor,"BD:"+borderColor,"VicBgBd:"+vic20BGBColor,vic20BGBColor.toString(16),vic20BGBColor.toString(2))


  lines.push(...bytesToCommaDelimited(bytesChar, width, true));
  lines.push(`\n${maybeLabelName(name)}Colours:\n`);
  lines.push(...bytesToCommaDelimited(bytesColour, width, true));




  let charsetBits;
  switch (fb.charset) {
    case 'vic20Upper': charsetBits = " lda #$f0 \n sta $9005 \n"; break;
    case 'vic20Lower': charsetBits = " lda #$f2 \n sta $9005 \n"; break;
    default: charsetBits = " lda #$f0 \n sta $9005 \n"; break;
  }



  source = singleFrameVic20ASM(fmt.exportOptions.computer,music, true, maybeLabelName(name), charsetBits, lines);

  console.log(source);

}






  if (music) {
    sourceFileMap = {
      "main.asm": source,
      "macros.asm": macrosAsm,
      "plugins/sid.js": sidJs,
      "assets/sidFile.sid": sidFile,
    }
  } else {
    sourceFileMap = {
      "main.asm": source,
      "macros.asm": macrosAsm,
    }

  }







  const options = {
    readFileSync: (fname: string) => {
      if (fname in sourceFileMap) {
        return Buffer.from(sourceFileMap[fname]);
      }
      throw new Error(`File not found ${fname}`);
    }
  }






  // const res = c64jasm.assemble(path.resolve(appPath, 'assets/main.asm'));
 const res = c64jasm.assemble('main.asm', options);

  if (res.errors.length !== 0) {
    console.log(res.errors)
    throw new Error("c64jasm.assemble failed, this should not happen.");
  }

  try {
    fs.writeFileSync(filename, res.prg, null)
  } catch (e) {
    alert(`Failed to save file '${filename}'!`)
    console.error(e)
  }
}

export { savePlayer }
