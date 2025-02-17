import React, { Fragment, PureComponent } from "react";
import PropTypes from "prop-types";

import { Framebuf, Coord2, FramebufUIState } from "../redux/types";

const FixedWidthCoord = (props: {
  axis: string;
  number: number | string | null;
  numberPixelWidth?: number;
  charset?: string;
}) => {
  const { axis, number, numberPixelWidth = 50, charset="UPPER" } = props;
  var formatNumber = number?.toString();
  //console.log(formatNumber);
  if(formatNumber?.startsWith("*"))
  {
    formatNumber= formatNumber.substring(1,100);
  }

  if(number ===null)
  {
    return (<Fragment></Fragment>)
  }
  else
  {
  return (
    <div style={{ display: "flex", flexDirection: "row" }}>

      <div style={{ color: "var(--main-text-darker-color)" }}>{axis}:</div>
      <div
        style={{
          width: `${numberPixelWidth}px`,
          color: "var(--main-text-color)",
        }}
      >
        {formatNumber}
      </div>
    </div>
  );
}
};

function formatScreencode(num: number | null) {
  return num !== null ? `$${num.toString(16).toUpperCase()}/${num}` : null;
}
function formatPetsciicode(num: number | null, charset: string) {

  if(charset==null)
    charset=''

  let byte_char = num!;
  if (byte_char >= 0 && byte_char <= 0x1f) {
    byte_char = byte_char + 0x40;
  } else {
    if (byte_char >= 0x40 && byte_char <= 0x5d) {
      byte_char = byte_char + 0x80;
    } else {
      if (byte_char === 0x5e) {
        byte_char = 0xff;
      } else {
        if (byte_char === 0x5f) {
          byte_char = 0xdf;
        } else {
          if (byte_char === 0x95) {
            byte_char = 0xdf;
          } else {
            if (byte_char >= 0x60 && byte_char <= 0x7f) {
              byte_char = byte_char + 0x40;
            } else {
              if (byte_char >= 0x80 && byte_char <= 0xbf) {
                byte_char = byte_char - 0x80;
              } else {
                if (byte_char >= 0xc0 && byte_char <= 0xff) {
                  byte_char = byte_char - 0x40;
                }
              }
            }
          }
        }
      }
    }
  }

  switch (byte_char) {
    case 0x100:
      return byte_char !== null ? `*Transparent` : '';
      break;
    case 0x101:
      return charset.startsWith('cbase') ? `*F1` : '';
      break;
    case 0x102:
      return charset.startsWith('cbase') ? `*F3` : '';
      break;
    case 0x103:
      return charset.startsWith('cbase') ? `*F5` : '';
      break;
    case 0x104:
      return charset.startsWith('cbase') ? `*F7` : '';
      break;
    case 0x105:
      return charset.startsWith('cbase') ? `*Home` : '';
      break;
    case 0x106:
      return charset.startsWith('cbase') ? `*Clear Home` : '';
      break;
    case 0x107:
      return charset.startsWith('cbase') ? `*Cursor Left` : '';
      break;
    case 0x108:
      return charset.startsWith('cbase') ? `*Cursor Right` : '';
      break;
    case 0x109:
      return charset.startsWith('cbase') ? `*Cursor Up` : '';
      break;
    case 0x10a:
      return charset.startsWith('cbase') ? `*Cursor Down` : '';
      break;
    case 0x10b:
      return charset.startsWith('cbase') ? `*Delete` : '';
      break;
    case 0x10c:
      return charset.startsWith('cbase') ? `*Insert` : '';
      break;
    case 0x10d:
      return charset.startsWith('cbase') ? `*RVS ON` : '';
      break;
    case 0x10e:
      return charset.startsWith('cbase') ? `*RVS OFF` : '';
      break;
    case 0x10f:
      return charset.startsWith('cbase') ? `*End of Prompt` : '';
      break;

    default:
      return byte_char !== null
        ? `$${byte_char.toString(16).toUpperCase()}/${byte_char}${
            num! > 128 ? " (RVS)" : ""
          }`
        : '';
      break;
  }
}

interface CharSelectStatusbarProps {
  curScreencode: number | null;
  charset: string;
}

export class CharSelectStatusbar extends PureComponent<CharSelectStatusbarProps> {
  render() {
    const { curScreencode,charset } = this.props;
    return (
      <div style={{ fontSize: "0.8em", display: "flex", flexDirection: "row" }}>
        <FixedWidthCoord
          axis="F"
          number={formatScreencode(curScreencode)}
          numberPixelWidth={60}
        />
        <FixedWidthCoord
          axis="P"
          number={formatPetsciicode(curScreencode,charset)}
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
  zoom: { zoomLevel: number; alignment: string };
}

export class CanvasStatusbar extends PureComponent<CanvasStatusbarProps> {
  static propTypes = {
    framebuf: PropTypes.object.isRequired,
    isActive: PropTypes.bool,
    charPos: PropTypes.object,
    zoom: PropTypes.object,
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
    let zoomLevel = this.props.zoom.zoomLevel * 0.5;

    let zoomAlignment = this.props.zoom.alignment;
    const widthHeight = `${framebuf.width}x${framebuf.height}`;
    var screenMem = 1024;
    var colorMem = 55296;

    if(framebuf.charset.startsWith("vic20"))
    {
      screenMem = 0x1e00;
      colorMem = 0x9600;

    }


      if(framebuf.charset.startsWith("pet"))
        {
          screenMem = 0x8000;
          colorMem = 0;

        }



    return (
      <div
        style={{
          padding: "4px",
          fontSize: "0.8em",
          display: "flex",
          flexDirection: "row",
          border: "0px solid #eee",
        }}
      >

        <FixedWidthCoord
          axis="Size"
          number={widthHeight}
          numberPixelWidth={70}
        />
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
              ? formatScreencode(screenMem + cp!.row * width + cp!.col)
              : null

          }
          numberPixelWidth={140}
        />

        <FixedWidthCoord
          axis="COLR"
          number={colorMem !== 0 ?
            cc !== null
              ? formatScreencode(colorMem + cp!.row * width + cp!.col)
              : null
              : null
          }
          numberPixelWidth={140}
        />

      </div>
    );
  }
}
//<FixedWidthCoord axis="Zoom" number={zoomLevel}    numberPixelWidth={40}   />
//<FixedWidthCoord axis={'ZOOM ('+zoomAlignment+')'} number={zoomLevel} numberPixelWidth={80} />
