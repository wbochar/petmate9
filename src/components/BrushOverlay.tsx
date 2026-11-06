import React, { Component, CSSProperties } from 'react';

import CharGrid from './CharGrid';
import * as utils from '../utils';
import { Coord2, Brush, Rgb, Font } from '../redux/types';

// Extracted verbatim from containers/Editor.tsx (Group L / L8-L11a) -- a
// self-contained, props-only overlay with no dependency on FramebufferView's
// internal state, so this move is purely mechanical (no logic changes).
// `computeBrushDstPos` moves along with it since it's only used here and by
// FramebufferView.brushDraw (which now imports it from this module).

const brushOverlayStyleBase: CSSProperties = {
  outlineColor: "rgba(255, 255, 255, 0.5)",
  outlineStyle: "dashed",
  outlineOffset: "0",
  outlineWidth: 2,
  backgroundColor: "rgba(255,255,255,0)",
  zIndex: 1,
  pointerEvents: "none",
  opacity:".75"
};

export function computeBrushDstPos(
  charPos: Coord2,
  dims: { width: number; height: number }
) {
  return {
    col: charPos.col - Math.floor(dims.width / 2),
    row: charPos.row - Math.floor(dims.height / 2),
  };
}

interface BrushOverlayProps {
  charPos: Coord2;
  framebufWidth: number;
  framebufHeight: number;
  backgroundColor: string;
  colorPalette: Rgb[];
  brush: Brush | null;
  font: Font;
  borderOn: boolean;
  /** True when the active framebuf is a C128 VDC frame.  Controls whether
   *  the brush preview's CharGrid honours per-cell VDC attribute fields
   *  (REVERSE/UNDERLINE/ALT) and the 512-glyph code space.  Defaults to
   *  false so existing call sites keep their non-VDC behaviour. */
  isVdc?: boolean;
}

export default class BrushOverlay extends Component<BrushOverlayProps> {
  render() {
    if (this.props.brush === null) {
      return null;
    }
    const { charPos, backgroundColor, framebufWidth, framebufHeight } =
      this.props;
    const { min, max } = utils.sortRegion(this.props.brush.brushRegion);
    const brushw = max.col - min.col + 1;
    const brushh = max.row - min.row + 1;
    let bw = brushw;
    let bh = brushh;
    const destPos = computeBrushDstPos(charPos, { width: bw, height: bh });
    let dstx = destPos.col;
    let dsty = destPos.row;
    if (bw + dstx > framebufWidth) {
      bw = framebufWidth - dstx;
    }
    if (bh + dsty > framebufHeight) {
      bh = framebufHeight - dsty;
    }
    let srcX = 0;
    let srcY = 0;
    if (dstx < 0) {
      srcX = -dstx;
      bw -= srcX;
      dstx = 0;
    }
    if (dsty < 0) {
      srcY = -dsty;
      bh -= srcY;
      dsty = 0;
    }
    if (bw <= 0 || bh <= 0) {
      return null;
    }
    const s: CSSProperties = {
      ...brushOverlayStyleBase,

      position: "absolute",
      left: (dstx + Number(this.props.borderOn) * 4) * 8,
      top: (dsty + Number(this.props.borderOn) * 4) * 8,
      width: `${bw * 8}px`,
      height: `${bh * 8}px`,
    };

    return (
      <div id="selectedBrushID" style={s}>
        <CharGrid
          width={bw}
          height={bh}
          srcX={srcX}
          srcY={srcY}
          grid={false}
          backgroundColor={backgroundColor}
          colorPalette={this.props.colorPalette}
          font={this.props.font}
          framebuf={this.props.brush.framebuf}
          borderOn={this.props.borderOn}
          isTransparent={true}
          isVdc={this.props.isVdc === true}
          showVdcTransparentGlyph={false}
          />
      </div>
    );
  }
}
