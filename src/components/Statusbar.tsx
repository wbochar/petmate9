import React, { PureComponent } from "react";
import PropTypes from "prop-types";

import { Framebuf, Coord2 } from "../redux/types";

const FixedWidthCoord = (props: {
  axis: string;
  number: number | string | null;
  numberPixelWidth?: number;
}) => {
  const { axis, number, numberPixelWidth = 50 } = props;
  return (
    <div style={{ display: "flex", flexDirection: "row" }}>
      <div style={{ color: "var(--main-text-darker-color)" }}>{axis}:</div>
      <div
        style={{
          width: `${numberPixelWidth}px`,
          color: "var(--main-text-color)",
        }}
      >
        {number}
      </div>
    </div>
  );
};

function formatScreencode(num: number | null) {
  return num !== null ? `$${num.toString(16).toUpperCase()}/${num}` : null;
}

interface CharSelectStatusbarProps {
  curScreencode: number | null;
}

export class CharSelectStatusbar extends PureComponent<CharSelectStatusbarProps> {
  render() {
    const { curScreencode } = this.props;
    return (
      <div style={{ fontSize: "0.8em", display: "flex", flexDirection: "row" }}>
        <FixedWidthCoord
          axis="C"
          number={formatScreencode(curScreencode)}
          numberPixelWidth={40}
        />
      </div>
    );
  }
}

interface CanvasStatusbarProps {
  framebuf: Framebuf;
  isActive: boolean;
  charPos: Coord2 | null;
}

export class CanvasStatusbar extends PureComponent<CanvasStatusbarProps> {
  static propTypes = {
    framebuf: PropTypes.object.isRequired,
    isActive: PropTypes.bool,
    charPos: PropTypes.object,
    zoom: PropTypes.number,
  };
  render() {
    const { isActive, charPos, framebuf } = this.props;
    const { width, height } = framebuf;
    const cp = isActive ? charPos : null;
    let cc = null;

    if (cp !== null) {
      if (cp.row >= 0 && cp.row < height && cp.col >= 0 && cp.col < width) {
        cc = framebuf.framebuf[cp.row][cp.col].code;
      }
    }
    const zoomLevel = this.props.zoom;
    const widthHeight = `${framebuf.width}x${framebuf.height}`;
    return (
      <div
        style={{
          paddingTop: "4px",
          fontSize: "0.8em",
          display: "flex",
          flexDirection: "row",
        }}
      >
        <FixedWidthCoord axis="X" number={cc !== null ? cp.col : null} />
        <FixedWidthCoord axis="Y" number={cc !== null ? cp.row : null} />
        <FixedWidthCoord
          axis="CHAR"
          number={formatScreencode(cc)}
          numberPixelWidth={60}
        />
        <FixedWidthCoord
          axis="SCRN"
          number={
            cc !== null
              ? formatScreencode(1024 + cp.row * width + cp.col)
              : null
          }
          numberPixelWidth={80}
        />
        <FixedWidthCoord
          axis="COLR"
          number={
            cc !== null
              ? formatScreencode(55296 + cp.row * width + cp.col)
              : null
          }
          numberPixelWidth={100}
        />
        <FixedWidthCoord axis="ZOOM" number={zoomLevel} numberPixelWidth={80} />
        <FixedWidthCoord
          axis="Size"
          number={widthHeight}
          numberPixelWidth={40}
        />
      </div>
    );
  }
}
