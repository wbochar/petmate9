import React, { Component } from 'react';

import { Font, Rgb } from '../redux/types';
import { LinePixel } from '../utils/chunkyLine';

// Extracted verbatim from containers/Editor.tsx (Group L / L8-L11a) -- a
// self-contained, props-only overlay with no dependency on FramebufferView's
// internal state, so this move is purely mechanical (no logic changes).

interface LinePreviewOverlayProps {
  pixels: LinePixel[];
  font: Font;
  colorPalette: Rgb[];
  textColor: number;
  framebufWidth: number;
  framebufHeight: number;
  borderOn: boolean;
}

export default class LinePreviewOverlay extends Component<LinePreviewOverlayProps> {
  private canvasRef = React.createRef<HTMLCanvasElement>();

  componentDidMount() { this.draw(); }
  componentDidUpdate() { this.draw(); }

  draw() {
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const { pixels, font, colorPalette, textColor, framebufWidth, framebufHeight } = this.props;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (pixels.length === 0) return;
    const normalizeColorIndex = (color: number) =>
      colorPalette.length >= 128 ? (color & 0x7f) : color;
    const fallbackFg = colorPalette[normalizeColorIndex(textColor)] ?? colorPalette[0];
    if (!fallbackFg) return;
    for (const px of pixels) {
      if (px.col < 0 || px.col >= framebufWidth || px.row < 0 || px.row >= framebufHeight) continue;
      const boffs = px.code * 8;
      if (boffs < 0 || boffs + 7 >= font.bits.length) continue;
      // Per-pixel colour lets callers (e.g. Link-Line tool-aware preview)
      // show each cell in the colour the paint action would actually apply
      // — Colorize uses textColor, CharDraw / RvsPen keep the cell's own
      // colour, etc.  Falls back to the overlay's textColor when unset.
      const fg = (px.color !== undefined ? colorPalette[normalizeColorIndex(px.color)] : undefined) ?? fallbackFg;
      const img = ctx.createImageData(8, 8);
      let di = 0;
      for (let y = 0; y < 8; y++) {
        const p = font.bits[boffs + y];
        // VDC UNDERLINE draws a solid line on the bottom scanline on top of
        // the glyph's own pixels (hardware behavior), so force that row on
        // regardless of the glyph bitmap.
        const rowBits = (px.underline && y === 7) ? 0xff : p;
        for (let i = 0; i < 8; i++) {
          let on = (128 >> i) & rowBits;
          // VDC REVERSE swaps which pixels are considered "foreground" --
          // preview that by inverting the on/off test instead of drawing a
          // plain glyph silhouette, so the preview actually looks inverted.
          if (px.reverse) on = on ? 0 : 1;
          img.data[di + 0] = fg.r;
          img.data[di + 1] = fg.g;
          img.data[di + 2] = fg.b;
          img.data[di + 3] = on ? 180 : 0;
          di += 4;
        }
      }
      ctx.putImageData(img, px.col * 8, px.row * 8);
    }
  }

  render() {
    const { pixels, framebufWidth, framebufHeight, borderOn } = this.props;
    if (pixels.length === 0) return null;
    const borderOffset = Number(borderOn) * 32;
    return (
      <canvas
        ref={this.canvasRef}
        width={framebufWidth * 8}
        height={framebufHeight * 8}
        style={{
          position: 'absolute',
          left: `${borderOffset}px`,
          top: `${borderOffset}px`,
          width: `${framebufWidth * 8}px`,
          height: `${framebufHeight * 8}px`,
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />
    );
  }
}
