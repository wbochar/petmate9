
import React, { Component } from 'react';
import {
  Rgb,
  Font,
  Pixel,
  Coord2,
  TRANSPARENT_SCREENCODE,
  VDC_TRANSPARENT_SCREENCODE,
} from '../redux/types';
import {
  VDC_ATTR_BLINK,
  VDC_ATTR_ALTCHAR,
  VDC_ATTR_REVERSE,
  VDC_ATTR_UNDERLINE,
  effectiveAttr,
} from '../utils/vdcAttr';

/** Approximate editor blink cadence for VDC blink-attribute preview. */
const VDC_BLINK_INTERVAL_MS = 400;

class CharsetCache {
  private images: ImageData[][] = [];
  /** Reverse-video glyph cache, populated lazily for VDC frames. */
  private reverseImages: ImageData[][] | null = null;
  private numGlyphs: number = 0;
  private ctx: CanvasRenderingContext2D | null = null;
  private fontBits: number[] = [];
  private colorPalette: Rgb[] = [];

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

    const numColors = colorPalette.length;

    const dirartChars = [34,128,141,148,160,161,162,163,164,165,166,167,168,169,170,171,172,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,205,
    224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]

    // VDC font data carries both ROM banks (512 glyphs) plus an addon
    // transparent glyph; other built-in fonts carry 256 real glyphs +
    // 16 overlay glyphs. We
    // size the glyph cache to whatever the font actually supplies.
    const totalGlyphs = Math.max(0, Math.floor(fontBits.length / 8));
    this.numGlyphs = totalGlyphs;
    this.ctx = ctx;
    this.fontBits = fontBits;
    this.colorPalette = colorPalette;

    for (let colorIdx = 0; colorIdx < numColors; colorIdx++) {
      const color = colorPalette[colorIdx]
      this.images[colorIdx] = []

      for (let c = 0; c < totalGlyphs; c++) {
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
    const fallbackImages = this.images[0];
    const colorImages = this.images[color] ?? fallbackImages;
    // `VDC_TRANSPARENT_SCREENCODE` (512) is VDC-only.  When a VDC brush is
    // previewed on a non-VDC screen we map it to the legacy transparent slot.
    let glyph = screencode === VDC_TRANSPARENT_SCREENCODE
      ? TRANSPARENT_SCREENCODE
      : screencode;
    if (glyph < 0 || glyph >= colorImages.length) {
      glyph = 0;
    }
    return colorImages[glyph] ?? fallbackImages[0];
  }

  /** Build a reverse-video glyph cache lazily, for VDC frames that
   *  toggle the REVERSE attribute bit on individual cells. */
  private buildReverseCache() {
    if (this.reverseImages || !this.ctx) return;
    const ctx = this.ctx;
    const data = this.fontBits;
    const numColors = this.colorPalette.length;
    const total = this.numGlyphs;
    const cache: ImageData[][] = [];
    for (let colorIdx = 0; colorIdx < numColors; colorIdx++) {
      const color = this.colorPalette[colorIdx];
      cache[colorIdx] = [];
      for (let c = 0; c < total; c++) {
        const boffs = c * 8;
        const img = ctx.createImageData(8, 8);
        const bits = img.data;
        let dstIdx = 0;
        for (let y = 0; y < 8; y++) {
          const p = data[boffs + y] ?? 0;
          for (let i = 0; i < 8; i++) {
            // Invert the bitmap: lit pixels turn off, off pixels turn on.
            const v = ((128 >> i) & p) ? 0 : 255;
            bits[dstIdx + 0] = color.r;
            bits[dstIdx + 1] = color.g;
            bits[dstIdx + 2] = color.b;
            bits[dstIdx + 3] = v;
            dstIdx += 4;
          }
        }
        cache[colorIdx].push(img);
      }
    }
    this.reverseImages = cache;
  }

  /** Resolve a glyph image honouring REVERSE/ALTCHAR.  `glyph` is the
   *  pre-resolved 0–(numGlyphs-1) index, including any +256 alt-set bias. */
  getImageWithAttr(glyph: number, color: number, reverse: boolean): ImageData {
    if (reverse) {
      this.buildReverseCache();
      const colorImages = this.reverseImages![color] ?? this.reverseImages![0];
      return colorImages[glyph] ?? colorImages[0];
    }
    const colorImages = this.images[color] ?? this.images[0];
    return colorImages[glyph] ?? colorImages[0];
  }

  /** True when the underlying font has at least 512 glyphs (i.e. VDC). */
  hasAlternateBank(): boolean {
    return this.numGlyphs >= 512;
  }
}

interface CharGridProps {
  width: number;
  height: number;
  srcX: number;
  srcY: number;
  charPos?: Coord2;
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
  /** Render with VDC attribute semantics (ALT/RVS/UND/BLI + transparent). */
  isVdc?: boolean;
  /** When true, render the VDC transparent screencode as its addon glyph. */
  showVdcTransparentGlyph?: boolean;
  /** Blink phase toggle cadence for VDC BLINK-bit preview. */
  vdcBlinkIntervalMs?: number;
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
    isVdc:false,
    showVdcTransparentGlyph: true,
    vdcBlinkIntervalMs: VDC_BLINK_INTERVAL_MS,
  }

  private font: CharsetCache | null = null;
  private canvasRef = React.createRef<HTMLCanvasElement>();
  /** Current blink phase for VDC BLINK-bit cells (true = visible). */
  private blinkVisible = true;
  /** Interval id driving the blink phase toggle. */
  private blinkTimerId: number | null = null;
  /** Currently armed blink interval in ms (for restart-on-settings-change). */
  private blinkIntervalMs: number = VDC_BLINK_INTERVAL_MS;

  private isVdcTransparentCell(cell: Pixel): boolean {
    return (
      !!cell.transparent ||
      cell.code === TRANSPARENT_SCREENCODE ||
      cell.code === VDC_TRANSPARENT_SCREENCODE
    );
  }

  private hasVisibleBlinkCells(): boolean {
    if (!this.props.isVdc) return false;
    const { framebuf, srcX, srcY, width, height } = this.props;
    for (let y = 0; y < height; y++) {
      const row = framebuf[y + srcY];
      if (!row) continue;
      for (let x = 0; x < width; x++) {
        const cell = row[x + srcX];
        if (!cell) continue;
        if (this.isVdcTransparentCell(cell)) continue;
        if ((effectiveAttr(cell) & VDC_ATTR_BLINK) !== 0) return true;
      }
    }
    return false;
  }

  private stopBlinkTimer() {
    if (this.blinkTimerId !== null) {
      window.clearInterval(this.blinkTimerId);
      this.blinkTimerId = null;
    }
  }

  private ensureBlinkTimer() {
    if (!this.props.isVdc) {
      this.stopBlinkTimer();
      // Leaving VDC mode should restore full visibility immediately.
      if (!this.blinkVisible) {
        this.blinkVisible = true;
        this.draw();
      }
      return;
    }
    const intervalMs = this.props.vdcBlinkIntervalMs ?? VDC_BLINK_INTERVAL_MS;
    if (this.blinkTimerId !== null) {
      if (this.blinkIntervalMs === intervalMs) {
        return;
      }
      this.stopBlinkTimer();
    }
    this.blinkIntervalMs = intervalMs;
    this.blinkTimerId = window.setInterval(() => {
      if (!this.props.isVdc) return;
      // Skip redraws when no blink-flagged cells are visible.
      if (!this.hasVisibleBlinkCells()) {
        if (!this.blinkVisible) {
          this.blinkVisible = true;
          this.draw();
        }
        return;
      }
      this.blinkVisible = !this.blinkVisible;
      this.draw();
    }, intervalMs);
  }

  // Prevent React from re-rendering the canvas element on every mouse move.
  // Only re-render when props that affect the visual output actually change.
  shouldComponentUpdate(nextProps: Readonly<CharGridProps>) {
    return (
      this.props.width !== nextProps.width ||
      this.props.height !== nextProps.height ||
      this.props.srcX !== nextProps.srcX ||
      this.props.srcY !== nextProps.srcY ||
      this.props.framebuf !== nextProps.framebuf ||
      this.props.backgroundColor !== nextProps.backgroundColor ||
      this.props.font !== nextProps.font ||
      this.props.colorPalette !== nextProps.colorPalette ||
      this.props.borderOn !== nextProps.borderOn ||
      this.props.borderWidth !== nextProps.borderWidth ||
      this.props.borderColor !== nextProps.borderColor ||
      this.props.isDirart !== nextProps.isDirart ||
      this.props.grid !== nextProps.grid ||
      this.props.isTransparent !== nextProps.isTransparent ||
      this.props.isVdc !== nextProps.isVdc ||
      this.props.showVdcTransparentGlyph !== nextProps.showVdcTransparentGlyph ||
      this.props.vdcBlinkIntervalMs !== nextProps.vdcBlinkIntervalMs
    );
  }

  componentDidMount() {
    this.draw()
    this.ensureBlinkTimer()
  }

  componentWillUnmount() {
    this.stopBlinkTimer();
  }

  componentDidUpdate (prevProps: Readonly<CharGridProps>) {
    this.ensureBlinkTimer();
    if (this.props.width !== prevProps.width ||
      this.props.height !== prevProps.height ||
      this.props.srcX !== prevProps.srcX ||
      this.props.srcY !== prevProps.srcY ||
      this.props.framebuf !== prevProps.framebuf ||
      this.props.backgroundColor !== prevProps.backgroundColor ||
      this.props.font !== prevProps.font ||
      this.props.colorPalette !== prevProps.colorPalette ||
      this.props.isTransparent !== prevProps.isTransparent ||
      this.props.isDirart !== prevProps.isDirart ||
      this.props.isVdc !== prevProps.isVdc ||
      this.props.showVdcTransparentGlyph !== prevProps.showVdcTransparentGlyph) {
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
      prevProps === undefined ||
      this.props.font !== prevProps.font ||
      this.props.colorPalette !== prevProps.colorPalette ||
      this.props.isTransparent !== prevProps.isTransparent ||
      this.props.isDirart !== prevProps.isDirart) {
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
         this.props.backgroundColor !== prevProps.backgroundColor ||
         invalidate)
        :
        true
    const isVdc = !!this.props.isVdc;
    for (var y = 0; y < this.props.height; y++) {
      const charRow = framebuf[y + srcY]
      if (!dstSrcChanged && charRow === prevProps!.framebuf[y + srcY]) {
        continue
      }
      for (var x = 0; x < this.props.width; x++) {
        const c = charRow[x + srcX]
        if (!c) {
          ctx.clearRect(Math.trunc(x * xScale), Math.trunc(y * yScale), 8, 8);
          continue;
        }

        if (isVdc) {
          const isTransparentCell = this.isVdcTransparentCell(c);
          // VDC transparency keeps semantic transparency for tools/export, but
          // can still draw the visible addon X marker for editor parity with
          // legacy charsets.
          if (isTransparentCell && !this.props.showVdcTransparentGlyph) {
            ctx.clearRect(Math.trunc(x * xScale), Math.trunc(y * yScale), 8, 8);
            continue;
          }

          const attr = effectiveAttr(c);
          if (!isTransparentCell) {
            const blink = (attr & VDC_ATTR_BLINK) !== 0;
            if (blink && !this.blinkVisible) {
              // VDC blink attribute hides the glyph for the current phase.
              ctx.clearRect(Math.trunc(x * xScale), Math.trunc(y * yScale), 8, 8);
              continue;
            }
          }

          const glyph = isTransparentCell
            ? VDC_TRANSPARENT_SCREENCODE
            : (c.code & 0xff) + ((attr & VDC_ATTR_ALTCHAR) ? 256 : 0);
          const reverse = !isTransparentCell && (attr & VDC_ATTR_REVERSE) !== 0;
          const img = this.font.getImageWithAttr(glyph, c.color, reverse);
          ctx.putImageData(img, Math.trunc(x * xScale), Math.trunc(y * yScale));
          if (!isTransparentCell && (attr & VDC_ATTR_UNDERLINE)) {
            // Underline = VDC bit 5: paint a foreground-coloured line on
            // the bottom scanline of the cell.
            const pal = this.props.colorPalette[c.color] ?? this.props.colorPalette[0];
            ctx.fillStyle = `rgb(${pal.r},${pal.g},${pal.b})`;
            ctx.fillRect(Math.trunc(x * xScale), Math.trunc(y * yScale + 7), 8, 1);
          }
          continue;
        }

        // Non-VDC rendering: tolerate VDC-style transparent cells so a brush
        // captured in VDC mode can be previewed safely on c64/pet/vic/etc.
        const nonVdcCode = (c.transparent === true || c.code === VDC_TRANSPARENT_SCREENCODE)
          ? TRANSPARENT_SCREENCODE
          : c.code;
        const img = this.font.getImage(nonVdcCode, c.color)
        ctx.putImageData(img, Math.trunc(x*xScale), Math.trunc(y*yScale))
      }
    }


    if (grid) {
      ctx.fillStyle = 'rgb(0,0,0,255)'
      for (var y = 0; y < this.props.height; y++) {
        ctx.fillRect(0, Math.trunc(y*yScale+8), Math.trunc(this.props.width*xScale), 1)
      }
      for (var x = 0; x < this.props.width; x++) {
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
          // Promote canvas to its own GPU compositing layer so sibling overlay
          // changes (CharPosOverlay, CharPreviewOverlay) don't trigger
          // re-rasterization of the CSS-scaled canvas at fractional zoom levels.
          willChange: 'transform',
        }}
        width={Math.trunc(this.props.width*scale)}
        height={Math.trunc(this.props.height*scale)}>
      </canvas>
    )
  }
}
