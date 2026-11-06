
import React, { Component, createRef } from 'react';
import { Coord2, Rgb, Font } from '../redux/types';

interface CharPreviewOverlayProps {
  charPos: Coord2;
  /** Effective glyph index (0–511 for VDC, already ALTCHAR-biased by the
   *  caller via resolveEffectivePixel/effectiveGlyph; 0–255 otherwise). */
  screencode: number;
  textColor: number;
  font: Font;
  colorPalette: Rgb[];
  framebufWidth: number;
  framebufHeight: number;
  borderOn: boolean;
  backgroundColor: string;
  /** VDC REVERSE preview: swap which glyph pixels are shown instead of a
   *  plain silhouette, so the preview actually looks inverted. Always
   *  false/absent outside VDC. */
  reverse?: boolean;
  /** VDC UNDERLINE preview: force the glyph's bottom scanline on. Always
   *  false/absent outside VDC. */
  underline?: boolean;
}

export default class CharPreviewOverlay extends Component<CharPreviewOverlayProps> {
  private canvasRef = createRef<HTMLCanvasElement>();

  componentDidMount() {
    this.drawChar();
  }

  componentDidUpdate(prevProps: CharPreviewOverlayProps) {
    if (
      this.props.screencode !== prevProps.screencode ||
      this.props.textColor !== prevProps.textColor ||
      this.props.charPos.row !== prevProps.charPos.row ||
      this.props.charPos.col !== prevProps.charPos.col ||
      this.props.font !== prevProps.font ||
      this.props.colorPalette !== prevProps.colorPalette ||
      this.props.reverse !== prevProps.reverse ||
      this.props.underline !== prevProps.underline
    ) {
      this.drawChar();
    }
  }

  drawChar() {
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const { screencode, textColor, font, colorPalette, reverse, underline } = this.props;
    const colorIndex = colorPalette.length >= 128 ? (textColor & 0x7f) : textColor;
    const color = colorPalette[colorIndex];
    if (!color) return;
    const boffs = screencode * 8;
    const data = font.bits;
    if (boffs < 0 || boffs + 7 >= data.length) return;
    const img = ctx.createImageData(8, 8);
    let dstIdx = 0;
    for (let y = 0; y < 8; y++) {
      const p = data[boffs + y];
      // VDC UNDERLINE draws a solid line on the bottom scanline on top of
      // the glyph's own pixels (hardware behavior).
      const rowBits = (underline && y === 7) ? 0xff : p;
      for (let i = 0; i < 8; i++) {
        let on = ((128 >> i) & rowBits) !== 0;
        // VDC REVERSE swaps which pixels are considered "foreground" --
        // preview that by inverting the on/off test instead of drawing a
        // plain glyph silhouette.
        if (reverse) on = !on;
        const v = on ? 255 : 0;
        img.data[dstIdx + 0] = color.r;
        img.data[dstIdx + 1] = color.g;
        img.data[dstIdx + 2] = color.b;
        img.data[dstIdx + 3] = v;
        dstIdx += 4;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  render() {
    const { charPos, framebufWidth, framebufHeight, borderOn, backgroundColor } = this.props;
    if (
      charPos.row < 0 || charPos.row >= framebufHeight ||
      charPos.col < 0 || charPos.col >= framebufWidth
    ) {
      return null;
    }
    const borderOffset = Number(borderOn) * 32;
    return (
      <canvas
        ref={this.canvasRef}
        width={8}
        height={8}
        style={{
          position: 'absolute',
          left: `${charPos.col * 8 + borderOffset}px`,
          top: `${charPos.row * 8 + borderOffset}px`,
          width: '8px',
          height: '8px',
          backgroundColor,
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />
    );
  }
}
