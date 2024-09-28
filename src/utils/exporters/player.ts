
import { chunkArray } from '..'

import { electron, fs, path } from '../electronImports'
import { CHARSET_UPPER, CHARSET_LOWER } from '../../redux/editor';
import { FileFormatAsm, FileFormatPlayerV1, FramebufWithFont } from '../../redux/types';
import * as fp from '../fp'


import * as c64jasm from 'c64jasm';
import { readFile } from 'node:fs';

const singleFrameASM = (music: boolean, frameName: string, charsetBits: string, petsciiBytes: string[]) => `

!include "macros.asm"
${music == true ? '!use "plugins/sid" as sid' : ''}
${music == true ? '!let music = sid("assets/sidFile.sid")' : ''}

!let irq_top_line = 1
!let debug_build = FALSE
!let zptmp0 = $20

+basic_start(entry)
;--------------------------------------------------------------
; Execution starts here
;--------------------------------------------------------------
entry: {
${music == true ? '    lda #0 ; does song selector work?' : ''}
${music == true ? '    jsr music.init' : ''}

    sei
    lda #$35        ; Bank out kernal and basic
    sta $01         ; $e000-$ffff
    +setup_irq(irq_top, irq_top_line)
    cli



   lda ${frameName}
    sta $d020
    lda ${frameName}+1
    sta $d021
  lda #${charsetBits}
    sta $d018

    ldx #$00
loop:
    lda ${frameName}+2,x
    sta SCREEN,x
    lda ${frameName}+$3ea,x
    sta COLOR,x

    lda ${frameName}+$102,x
    sta SCREEN+$100,x
    lda ${frameName}+$4ea,x
    sta COLOR+$100,x

    lda ${frameName}+$202,x
    sta SCREEN+$200,x
    lda ${frameName}+$5ea,x
    sta COLOR+$200,x

    lda ${frameName}+$2ea,x
    sta SCREEN+$2e8,x
    lda ${frameName}+$6d2,x
    sta COLOR+$2e8,x
    inx
    bne loop



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

${music == true ? '    jsr music.play' : ''}

!if (debug_build) {
    dec $d020
}

    +irq_end(irq_top, irq_top_line)
end:
}

frameCount:     !byte 0



${music == true ? '    * = music.startAddress  ; most sids will go to $1000' : ''}
${music == true ? '    sid_data: !byte music.data' : ''}


* = $2000

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
  var source: string
  var sourceFileMap: { [index: string]: string } = {}

  switch (fmt.exportOptions.computer) {
    case 'c64':
      console.log('fmt.exportOptions.songFile', fmt.exportOptions.songFile)

      const sidFile = fmt.exportOptions.music ? fs.readFileSync(path.resolve(fmt.exportOptions.songFile[0])) : "";
      const sidJs = fmt.exportOptions.music ? fs.readFileSync(path.resolve(appPath, "assets/sid.js")): "";
      const macrosAsm = fs.readFileSync(path.resolve(appPath, "assets/macrosc64.asm"))

      const fb = fbs[fmt.commonExportParams.selectedFramebufIndex]

      const { width, height, framebuf, backgroundColor, borderColor, name } = fb;
      var lines: string[] = [];

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
        case 'upper': charsetBits = "$15"; break;
        case 'lower': charsetBits = "$17"; break;
        default: charsetBits = `%00010000 | ((${maybeLabelName(name)}_font/2048)*2)`; break;
      }




      source = singleFrameASM(fmt.exportOptions.music, maybeLabelName(name), charsetBits, lines);

      console.log(source)

      if (fmt.exportOptions.music) {
        var sourceFileMap: { [index: string]: string } = {
          "main.asm": source,
          "macros.asm": macrosAsm,
          "plugins/sid.js": sidJs,
          "assets/sidFile.sid": sidFile,
        }
      } else {
        var sourceFileMap: { [index: string]: string } = {
          "main.asm": source,
          "macros.asm": macrosAsm,
        }

      }
      break;

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
