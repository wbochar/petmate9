
import React, { Component } from 'react';
import { Rgb, Font, Pixel, Coord2 } from '../redux/types';
import * as selectors from '../redux/selectors'

class CharsetCache {
  private images: ImageData[][] = Array(17);

  constructor (
    ctx: CanvasRenderingContext2D,
    fontBits: number[],
    colorPalette: Rgb[],
    isTransparent: boolean,
    isDirart:boolean,
  ) {
    const data = fontBits

    if(isTransparent==null)
      isTransparent=false;



    const dirartChars = [34,128,141,148,160,161,162,163,164,165,166,167,168,169,170,171,172,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,205,
    224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]

    for (let colorIdx = 0; colorIdx < 16; colorIdx++) {
      const color = colorPalette[colorIdx]
      this.images[colorIdx] = []

      for (let c = 0; c < 272; c++) {
        const boffs = c*8;

        let dstIdx = 0
        let img = ctx.createImageData(8, 8);

        let bits = img.data


        if(c==256 && isTransparent)
        {
          for (let y = 0; y < 8; y++) {
            const p = data[boffs+y]
            for (let i = 0; i < 8; i++) {
              const v = ((128 >> i) & p) ? 255 : 0
              bits[dstIdx+0] = 0
              bits[dstIdx+1] = 0
              bits[dstIdx+2] = 0
              bits[dstIdx+3] = 0
              dstIdx += 4
            }
          }

        }


        if(isDirart && dirartChars.includes(c))
        {
          for (let y = 0; y < 8; y++) {
            const p = data[boffs+y]
            for (let i = 0; i < 8; i++) {
              const v = ((128 >> i) & p) ? 255 : 0
              bits[dstIdx+0] = 255
              bits[dstIdx+1] = 64
              bits[dstIdx+2] = 64
              bits[dstIdx+3] = v<64 ? 64 : v
              dstIdx += 4
            }
          }

        }



else{
        for (let y = 0; y < 8; y++) {
          const p = data[boffs+y]
          for (let i = 0; i < 8; i++) {
            const v = ((128 >> i) & p) ? 255 : 0
            bits[dstIdx+0] = color.r
            bits[dstIdx+1] = color.g
            bits[dstIdx+2] = color.b
            bits[dstIdx+3] = v
            dstIdx += 4
          }
        }
      }

        this.images[colorIdx].push(img)
      }
    }
  }

  getImage(screencode: number, color: number) {
    return this.images[color][screencode]
  }
}

interface CharGridProps {
  width: number;
  height: number;
  srcX: number;
  srcY: number;
  charPos: Coord2;
  curScreencode?: number;
  textColor?: number;
  backgroundColor: string;
  borderColor: string;
  grid: boolean;
  colorPalette: Rgb[];
  font: Font;
  framebuf: Pixel[][];
  borderWidth: number;
  borderOn: boolean;
  isTransparent: boolean;
  isDirart:boolean;
}

export default class CharGrid extends Component<CharGridProps> {
  static defaultProps = {
    srcX: 0,
    srcY: 0,
    charPos: {0:0},
    borderWidth: 0,
    borderColor: '#fff',
    borderOn: false,
    isTransparent: false,
    isDirart:false,
  }

  private font: CharsetCache | null = null;
  private canvasRef = React.createRef<HTMLCanvasElement>();

  componentDidMount() {
    this.draw()
  }

  componentDidUpdate (prevProps: Readonly<CharGridProps>) {
    if (this.props.width !== prevProps.width ||
      this.props.height !== prevProps.height ||
      this.props.srcX !== prevProps.srcX ||
      this.props.srcY !== prevProps.srcY ||
      this.props.framebuf !== prevProps.framebuf ||
      this.props.charPos !== prevProps.charPos ||
      this.props.curScreencode !== prevProps.curScreencode ||
      this.props.textColor !== prevProps.textColor ||
      this.props.backgroundColor !== prevProps.backgroundColor ||
      this.props.font !== prevProps.font ||
      this.props.colorPalette !== prevProps.colorPalette) {
      this.draw(prevProps)
    }
  }

  draw (prevProps?: CharGridProps) {
    const canvas = this.canvasRef.current
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d")!
    const framebuf = this.props.framebuf
    let invalidate = false
    if (this.font === null ||
      this.props.font !== prevProps!.font ||
      this.props.colorPalette !== prevProps!.colorPalette) {
      this.font = new CharsetCache(ctx, this.props.font.bits, this.props.colorPalette, this.props.isTransparent, this.props.isDirart)
      invalidate = true
    }

    const { grid, srcX, srcY } = this.props

    const xScale = grid ? 9 : 8
    const yScale = grid ? 9 : 8



    const dstSrcChanged =
      prevProps !== undefined ?
        (this.props.width !== prevProps.width ||
         this.props.height !== prevProps.height ||
         this.props.srcX !== prevProps.srcX ||
         this.props.srcY !== prevProps.srcY ||
         invalidate)
        :
        true
    for (var y = 0; y < this.props.height; y++) {
      const charRow = framebuf[y + srcY]
      if (!dstSrcChanged && charRow === prevProps!.framebuf[y + srcY]) {
        continue
      }
      for (var x = 0; x < this.props.width; x++) {
        const c = charRow[x + srcX]
        const img = this.font.getImage(c.code, c.color)

        ctx.putImageData(img, Math.trunc(x*xScale), Math.trunc(y*yScale))

      }
    }

    // Delete previous char highlighter
    if (prevProps !== undefined && prevProps.charPos !== null) {
      const charPos = prevProps.charPos
      if (charPos.row >= 0 && charPos.row < this.props.height &&
          charPos.col >= 0 && charPos.col < this.props.width) {
        const c = framebuf[charPos.row][charPos.col]
        const img = this.font.getImage(c.code, c.color)
        ctx.putImageData(img, Math.trunc(charPos.col*xScale), Math.trunc(charPos.row*yScale))
      }
    }
    // Render current char highlighter
    if (this.props.charPos !== null) {
      const charPos = this.props.charPos
      if (charPos.row >= 0 && charPos.row < this.props.height &&
          charPos.col >= 0 && charPos.col < this.props.width) {
        const c = {
          code: this.props.curScreencode !== undefined ?
            this.props.curScreencode :
            framebuf[charPos.row][charPos.col].code,
          color: this.props.textColor !== undefined ?
            this.props.textColor :
            framebuf[charPos.row][charPos.col].color
        }
        const img = this.font.getImage(c.code, c.color)
        ctx.putImageData(img, Math.trunc(charPos.col*xScale), Math.trunc(charPos.row*yScale))
      }
    }

    if (grid) {
      ctx.fillStyle = 'rgb(0,0,0,255)'
      for (var y = 0; y < this.props.height; y++) {
        ctx.fillRect(0, Math.trunc(y*yScale+8), Math.trunc(this.props.width*xScale), 1)
      }
      for (var x = 0; x < this.props.width; x++) {
        ctx.fillRect(Math.trunc(x*xScale+8), 0, 1, Math.trunc(this.props.height*yScale))
        ctx.fillRect(Math.trunc(x*xScale+8), 0, 1, Math.trunc(this.props.height*yScale))
      }
    }

  }

  render () {


    const scale = this.props.grid ? 9 : 8
    return (
      <canvas
        ref={this.canvasRef}
        style={{

         backgroundColor: this.props.backgroundColor,
          position: 'absolute',
          top: '0px',
          left: '0px',
          width: `${Math.trunc(this.props.width*scale)}px`,
          height: `${Math.trunc(this.props.height*scale)}px`,
          border: `${this.props.borderWidth*Number(this.props.borderOn)}px solid ${this.props.borderColor}`,


        }}
        width={Math.trunc(this.props.width*scale)}
        height={Math.trunc(this.props.height*scale)}>
      </canvas>
    )
  }
}
