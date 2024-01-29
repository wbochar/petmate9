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
function formatPetsciicode(num: number | null) {

    let byte_char = num!;
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


  return byte_char !== null ? `$${byte_char.toString(16).toUpperCase()}/${byte_char}${num!>128 ? ' (RVS)' : ''}` : null;
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
          axis="F"
          number={formatScreencode(curScreencode)}
          numberPixelWidth={60}
        />
        <FixedWidthCoord
          axis="P"
          number={formatPetsciicode(curScreencode)}
          numberPixelWidth={90}
        />
      </div>
    );
  }
}

interface CanvasStatusbarProps {
  framebuf: Framebuf;
  isActive: boolean;
  charPos: Coord2 | null;
  zoom: {zoomLevel:number,alignment:string},
}

export class CanvasStatusbar extends PureComponent<CanvasStatusbarProps> {
  static propTypes = {
    framebuf: PropTypes.object.isRequired,
    isActive: PropTypes.bool,
    charPos: PropTypes.object,
    zoom: PropTypes.object
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
    let zoomLevel = this.props.zoom.zoomLevel/.5;
    let zoomAlignment = this.props.zoom.alignment;
    const widthHeight = `${framebuf.width}x${framebuf.height}`;





    return (
      <div
        style={{
          padding: "4px",
          fontSize: "0.8em",
          display: "flex",
          flexDirection: "row",
          border: "0px solid #eee"
        }}
      >
        <FixedWidthCoord axis="X" number={cc !== null ? cp!.col : null} />
        <FixedWidthCoord axis="Y" number={cc !== null ? cp!.row : null} />
        <FixedWidthCoord
          axis="CHAR"
          number={formatScreencode(cc)}
          numberPixelWidth={62}
        />
        <FixedWidthCoord
          axis="SCRN"
          number={
            cc !== null
              ? formatScreencode(1024 + cp!.row * width + cp!.col)
              : null
          }
          numberPixelWidth={140}
        />
        <FixedWidthCoord
          axis="COLR"
          number={
            cc !== null
              ? formatScreencode(55296 + cp!.row * width + cp!.col)
              : null
          }
          numberPixelWidth={140}
        />

        <FixedWidthCoord
          axis="Size"
          number={widthHeight}
          numberPixelWidth={70}
        />



      </div>
    );
  }
}
//<FixedWidthCoord axis="Zoom" number={zoomLevel}    numberPixelWidth={40}   />
//<FixedWidthCoord axis={'ZOOM ('+zoomAlignment+')'} number={zoomLevel} numberPixelWidth={80} />
