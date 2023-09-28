// @ts-ignore
import React, {
  Component,
  Fragment,
  CSSProperties,
  PointerEvent,
  WheelEvent,
} from "react";
import { connect } from "react-redux";
import classNames from "classnames";

import ColorPicker from "../components/ColorPicker";
import CharGrid from "../components/CharGrid";
import CharPosOverlay, {
  TextCursorOverlay,
} from "../components/CharPosOverlay";
import GridOverlay from "../components/GridOverlay";
import { CanvasStatusbar } from "../components/Statusbar";

import Resize from "../components/Resize"

import CharSelect from "./CharSelect";

import * as framebuf from "../redux/editor";
import { Framebuffer } from "../redux/editor";
import * as selectors from "../redux/selectors";
import * as screensSelectors from "../redux/screensSelectors";
import {
  getSettingsPaletteRemap,
  getSettingsCurrentColorPalette,
  getSettingsIntegerScale,
} from "../redux/settingsSelectors";

import { framebufIndexMergeProps } from "../redux/utils";

import * as toolbar from "../redux/toolbar";
import { Toolbar } from "../redux/toolbar";
import * as utils from "../utils";
import * as matrix from "../utils/matrix";

import styles from "./Editor.module.css";
import {
  RootState,
  BrushRegion,
  Coord2,
  Rgb,
  Brush,
  Font,
  Tool,
  Pixel,
  Framebuf,
  FramebufUIState,
} from "../redux/types";

//import Root from "./Root";

let Zum = {zoomLevel:1,alignment:'Center'};

const brushOutlineSelectingColor = "rgba(128, 255, 128, 0.5)";

const gridColor = "rgba(128, 128, 128, 1)";





const brushOverlayStyleBase: CSSProperties = {
  outlineColor: "rgba(255, 255, 255, 0.5)",
  outlineStyle: "dashed",
  outlineWidth: 0.5,
  backgroundColor: "rgba(255,255,255,0)",
  zIndex: 1,
  pointerEvents: "none",
};

interface BrushSelectOverlayProps {
  framebufWidth: number;
  framebufHeight: number;
  brushRegion: BrushRegion | null;
  charPos: Coord2;
  borderOn: boolean;
}

class BrushSelectOverlay extends Component<BrushSelectOverlayProps> {
  render() {
    if (this.props.brushRegion === null) {
      return (
        <CharPosOverlay
          charPos={this.props.charPos}
          framebufWidth={this.props.framebufWidth}
          framebufHeight={this.props.framebufHeight}
          color={brushOutlineSelectingColor}
          borderOn={this.props.borderOn}
        />
      );
    }
    const { min, max } = utils.sortRegion(this.props.brushRegion);
    const s: CSSProperties = {
      ...brushOverlayStyleBase,
      outlineColor: brushOutlineSelectingColor,
      position: "absolute",
      left: (min.col + Number(this.props.borderOn) * 4) * 8,
      top: (min.row + Number(this.props.borderOn) * 4) * 8,
      width: `${(max.col - min.col + 1) * 8}px`,
      height: `${(max.row - min.row + 1) * 8}px`,
    };
    return <div style={s}></div>;
  }
}

function computeBrushDstPos(
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
}

class BrushOverlay extends Component<BrushOverlayProps> {
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
      <div style={s}>
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
        />
      </div>
    );
  }
}

interface FramebufferViewProps {
  undoId: number | null;

  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  spacebarKey: boolean;

  textCursorPos: Coord2;

  framebuf: Pixel[][];
  framebufWidth: number;
  framebufHeight: number;
  selectedTool: Tool;
  brush: Brush | null;
  brushRegion: BrushRegion | null;
  // Scale and translation for pan/zoom
  framebufUIState: FramebufUIState;
  backgroundColor: number;
  borderColor: number;
  borderOn: boolean;
  textColor: number;
  curScreencode: number;
  colorPalette: Rgb[];

  font: Font;

  canvasGrid: boolean;

  onCharPosChanged: (args: { isActive: boolean; charPos: Coord2 }) => void;

  framebufLayout: {
    width: number;
    height: number;
    pixelScale: number;
  };
}

interface FramebufferViewDispatch {
  Framebuffer: framebuf.PropsFromDispatch;
  Toolbar: toolbar.PropsFromDispatch;
}

interface FramebufferViewState {
  // Floor'd to int
  charPos: Coord2;
  isActive: boolean;
}

class FramebufferView extends Component<
  FramebufferViewProps & FramebufferViewDispatch,
  FramebufferViewState
> {
  state: FramebufferViewState = {
    charPos: { row: -1, col: 0 },
    isActive: false,
  };

  prevDragPos: Coord2 | null = null;

setBlankChar = (clickLoc: Coord2) => {
  const { undoId } = this.props;
  const params = {
    ...clickLoc,
  };
  if (this.props.selectedTool === Tool.Draw) {
    this.props.Framebuffer.setPixel(
      {
        ...params,
        color: this.props.textColor,
        screencode: 32,
      },
      undoId
    );
  } else if (this.props.selectedTool === Tool.Colorize) {
    this.props.Framebuffer.setPixel(
      {
        ...params,
        color: this.props.textColor,
      },
      undoId
    );
  } else if (this.props.selectedTool === Tool.CharDraw) {
    this.props.Framebuffer.setPixel(
      {
        ...params,
        screencode: 32,
      },
      undoId
    );
  } else {
    console.error("shouldn't get here");
  }
};


  setChar = (clickLoc: Coord2) => {
    const { undoId } = this.props;
    const params = {
      ...clickLoc,
    };
    if (this.props.selectedTool === Tool.Draw) {
      this.props.Framebuffer.setPixel(
        {
          ...params,
          color: this.props.textColor,
          screencode: this.props.curScreencode,
        },
        undoId
      );
    } else if (this.props.selectedTool === Tool.Colorize) {
      this.props.Framebuffer.setPixel(
        {
          ...params,
          color: this.props.textColor,
        },
        undoId
      );
    } else if (this.props.selectedTool === Tool.CharDraw) {
      this.props.Framebuffer.setPixel(
        {
          ...params,
          screencode: this.props.curScreencode,
        },
        undoId
      );
    } else {
      console.error("shouldn't get here");
    }
  };

  brushDraw = (coord: Coord2) => {
    const { min, max } = this.props.brush.brushRegion;
    const area = {
      width: max.col - min.col + 1,
      height: max.row - min.row + 1,
    };
    const destPos = computeBrushDstPos(coord, area);
    this.props.Framebuffer.setBrush(
      {
        ...destPos,
        brush: this.props.brush,
      },
      this.props.undoId
    );
  };

  dragStart = (coord: Coord2) => {
    const { selectedTool } = this.props;
    if (
      selectedTool === Tool.Draw ||
      selectedTool === Tool.Colorize ||
      selectedTool === Tool.CharDraw
    ) {

      if(!this.rightButton)
      {
        this.setChar(coord);
      }
      else
      {
        this.setBlankChar(coord);
      }




    } else if (selectedTool === Tool.Brush) {
      if (this.props.brush === null) {
        this.props.Toolbar.setBrushRegion({
          min: coord,
          max: coord,
        });
      } else {
        this.brushDraw(coord);
      }
    } else if (selectedTool === Tool.Text) {
      this.props.Toolbar.setTextCursorPos(coord);
    }
    this.prevDragPos = coord;
  };

  dragMove = (coord: Coord2) => {
    const prevDragPos = this.prevDragPos!; // set in dragStart
    const { selectedTool, brush, brushRegion } = this.props;
    if (
      selectedTool === Tool.Draw ||
      selectedTool === Tool.Colorize ||
      selectedTool === Tool.CharDraw
    ) {
      utils.drawLine(
        (x, y) => {
          //this.setChar({ row: y, col: x });

          if(!this.rightButton)
          {
            this.setChar({ row: y, col: x });
          }
          else
          {
            this.setBlankChar({ row: y, col: x });
          }



        },
        prevDragPos.col,
        prevDragPos.row,
        coord.col,
        coord.row
      );
    } else if (selectedTool === Tool.Brush) {
      if (brush !== null) {
        this.brushDraw(coord);
      } else if (brushRegion !== null) {
        const clamped = {
          row: Math.max(0, Math.min(coord.row, this.props.framebufHeight - 1)),
          col: Math.max(0, Math.min(coord.col, this.props.framebufWidth - 1)),
        };
        this.props.Toolbar.setBrushRegion({
          ...brushRegion,
          max: clamped,
        });
      }
    } else {
      console.error("not implemented");
    }

    this.prevDragPos = coord;
  };

  dragEnd = () => {
    const { selectedTool, brush, brushRegion } = this.props;
    if (selectedTool === Tool.Brush) {
      if (brush === null && brushRegion !== null) {
        this.props.Toolbar.captureBrush(this.props.framebuf, brushRegion);
      }
    }
    this.props.Toolbar.incUndoId();
  };

  altClick = (charPos: Coord2) => {
    const x = charPos.col;
    const y = charPos.row;
    if (
      y >= 0 &&
      y < this.props.framebufHeight &&
      x >= 0 &&
      x < this.props.framebufWidth
    ) {
      const pix = this.props.framebuf[y][x];
      this.props.Toolbar.setCurrentScreencodeAndColor(pix);
    }
  };

  rightClick = (charPos: Coord2) => {
    const x = charPos.col;
    const y = charPos.row;
    if (
      y >= 0 &&
      y < this.props.framebufHeight &&
      x >= 0 &&
      x < this.props.framebufWidth
    ) {


      //console.log("pix:",pix)
      //this.props.Toolbar.setCurrentScreencodeAndColor(blank);
      this.setBlankChar(charPos);
    }
  };



  //---------------------------------------------------------------------
  // Mechanics of tracking pointer drags with mouse coordinate -> canvas char pos
  // transformation.

  private ref = React.createRef<HTMLDivElement>();
  private prevCharPos: Coord2 | null = null;
  private prevCoord: Coord2 | null = null;
  private lockStartCoord: Coord2 | null = null;
  private shiftLockAxis: "shift" | "row" | "col" | null = null;
  private dragging = false;
  private rightButton = false;



  currentCharPos(e: any): { charPos: Coord2 } {
    if (!this.ref.current) {
      throw new Error("impossible?");
    }

    const bbox = this.ref.current.getBoundingClientRect();
    const xx = (e.clientX - bbox.left) / this.props.framebufLayout.pixelScale;
    const yy = (e.clientY - bbox.top) / this.props.framebufLayout.pixelScale;

    const invXform = matrix.invert(this.props.framebufUIState.canvasTransform);
    let [x, y] = matrix.multVect3(invXform, [xx, yy, 1]);
    x /= 8;
    y /= 8;

    if (!this.props.borderOn) {
      return { charPos: { row: Math.floor(y), col: Math.floor(x) } };
    } else {
      return { charPos: { row: Math.floor(y) - 4, col: Math.floor(x) - 4 } };
    }
  }

  setCharPos(isActive: boolean, charPos: Coord2) {
    this.setState({ isActive, charPos });
    this.props.onCharPosChanged({ isActive, charPos });
  }

  handleMouseEnter = (e: any) => {
    const { charPos } = this.currentCharPos(e);
    this.setCharPos(true, charPos);
  };

  handleMouseLeave = (e: any) => {
    const { charPos } = this.currentCharPos(e);
    this.setCharPos(false, charPos);
  };

  handlePointerDown = (e: any) => {
    if (
      this.props.selectedTool == Tool.PanZoom ||
      (this.props.selectedTool !== Tool.Text && this.props.spacebarKey)
    ) {

      this.handlePanZoomPointerDown(e);
      return;
    }

    const { charPos } = this.currentCharPos(e);
    this.setCharPos(true, charPos);

    this.rightButton = false

    // alt-left click doesn't start dragging
    if (this.props.altKey) {
      this.dragging = false;
      this.altClick(charPos);
      return;
    }
    if (e.button==2) {
      this.dragging = false;
      this.rightClick(charPos);
      this.rightButton = true;
      //this.brushDraw(charPos)
     //return;
    }



    this.dragging = true;
    e.target.setPointerCapture(e.pointerId);
    this.prevCoord = charPos;
    this.dragStart(charPos);

    const lock = this.props.shiftKey;
    this.shiftLockAxis = lock ? "shift" : null;
    if (lock) {
      this.lockStartCoord = {
        ...charPos,
      };
    }
  };

  handlePointerUp = (e: PointerEvent) => {
    if (this.props.selectedTool == Tool.PanZoom || this.panZoomDragging) {
      this.handlePanZoomPointerUp(e);
      return;
    }

    if (this.dragging) {
      this.dragEnd();
    }

    this.rightButton = false;
    this.dragging = false;
    this.lockStartCoord = null;
    this.shiftLockAxis = null;
  };

  handlePointerMove = (e: PointerEvent) => {
    if (
      this.props.selectedTool == Tool.PanZoom ||
      (this.props.selectedTool !== Tool.Text && this.props.spacebarKey)
    ) {
      this.handlePanZoomPointerMove(e);
      return;
    }

    const { charPos } = this.currentCharPos(e);
    this.setCharPos(true, charPos);

    if (
      this.prevCharPos === null ||
      this.prevCharPos.row !== charPos.row ||
      this.prevCharPos.col !== charPos.col
    ) {
      this.prevCharPos = { ...charPos };
      this.props.onCharPosChanged({ isActive: this.state.isActive, charPos });
    }

    if (!this.dragging) {
      return;
    }

    // Note: prevCoord is known to be not null here as it's been set
    // in mouse down
    const coord = charPos;
    if (
      this.prevCoord!.row !== coord.row ||
      this.prevCoord!.col !== coord.col
    ) {
      if (this.shiftLockAxis === "shift") {
        if (this.prevCoord!.row === coord.row) {
          this.shiftLockAxis = "row";
        } else if (this.prevCoord!.col === coord.col) {
          this.shiftLockAxis = "col";
        }
      }

      if (this.shiftLockAxis !== null) {
        let lockedCharPos = {
          ...this.lockStartCoord!,
        };

        if (this.shiftLockAxis === "row") {
          lockedCharPos.col = charPos.col;
        } else if (this.shiftLockAxis === "col") {
          lockedCharPos.row = charPos.row;
        }
        this.dragMove(lockedCharPos);
      } else {
        this.dragMove(charPos);
      }
      this.prevCoord = charPos;
    }
  };
  //---------------------------------------------------------------------
  // Pan/zoom mouse event handlers.  Called by the bound handlePointerDown/Move/Up
  // functions if the pan/zoom tool is selected.

  private panZoomDragging = false;

  handlePanZoomPointerDown(e: any) {
    this.panZoomDragging = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  handlePanZoomPointerUp(_e: any) {
    this.panZoomDragging = false;
  }

  // Mutable dst
  clampToWindow(xform: matrix.Matrix3x3): matrix.Matrix3x3 {
    const xf = matrix.copy(xform);
    // Clamp translation so that the canvas doesn't go out of the window
    let tx = xf.v[0][2];
    let ty = xf.v[1][2];
    tx = Math.min(tx, 0);
    ty = Math.min(ty, 0);
    const xx =
      this.props.framebufLayout.width +
      (Number(this.props.borderOn) * 64) / this.props.framebufLayout.pixelScale;
    const yy =
      this.props.framebufLayout.height +
      (Number(this.props.borderOn) * 64) / this.props.framebufLayout.pixelScale;
    const [swidth, sheight] = matrix.multVect3(xform, [
      (this.props.framebufWidth+(Number(this.props.borderOn) * 8)) * 8,
      (this.props.framebufHeight+(Number(this.props.borderOn) * 8)) * 8,
      0,
    ]);
    tx = Math.max(tx, -(swidth - xx));
    ty = Math.max(ty, -(sheight - yy));
    xf.v[0][2] = tx * 0.25;
    xf.v[1][2] = ty * 0.25;

    console.log("clamp to window");

    return xform;
    //return xf;
  }

  handlePanZoomPointerMove(e: any) {
    if (this.panZoomDragging) {
      const dx = e.nativeEvent.movementX / this.props.framebufLayout.pixelScale;
      const dy = e.nativeEvent.movementY / this.props.framebufLayout.pixelScale;

      const prevUIState = this.props.framebufUIState;
      const prevTransform = prevUIState.canvasTransform;

      const invXform = matrix.invert(prevTransform);
      const srcDxDy = matrix.multVect3(invXform, [dx, dy, 0]);

      const xform = matrix.mult(
        prevTransform,
        matrix.translate(srcDxDy[0], srcDxDy[1])
      );
      this.props.Toolbar.setCurrentFramebufUIState({
        ...prevUIState,
        canvasTransform: this.clampToWindow(xform),
      });
    }
  }



  // Reset canvas scale transform to identity on double click.
  handleDoubleClick = () => {
    if (this.props.selectedTool != Tool.PanZoom) {
      return;
    }
    const prevUIState = this.props.framebufUIState;
    this.props.Toolbar.setCurrentFramebufUIState({
      ...prevUIState,
      canvasTransform: matrix.ident(),
    });
  };


  setZoom = (zoomLevel:number,alignment:string) => {

    console.log('Zoom Level'+zoomLevel,alignment);

  }



  handleWheel = (e: WheelEvent) => {

    if (this.props.selectedTool == Tool.Text) {
      return;
    }

    if (!this.ref.current) {
      return;
    }

    let xform;

    const wheelScale = 1 ;
    const delta = Math.min(Math.abs(e.deltaY), wheelScale);
    const scaleDelta =
      e.deltaY < 0.0
        ? 1.0 / (1.0 - delta / (wheelScale + 1.0))
        : 1.0 - delta / (wheelScale + 1.0);


    //console.log('wheel',wheelScale,'delta',delta,'scaleDelta',scaleDelta);

    const bbox = this.ref.current.getBoundingClientRect();
    let mouseX =
      (e.nativeEvent.clientX - bbox.left) /
      this.props.framebufLayout.pixelScale;
    let mouseY =
      (e.nativeEvent.clientY - bbox.top) / this.props.framebufLayout.pixelScale;


    const prevUIState = this.props.framebufUIState;

    let invXform = matrix.invert(prevUIState.canvasTransform);
    let srcPos = matrix.multVect3(invXform, [mouseX, mouseY, 1]);



    if (e.deltaY == 0) {
      return;
    }





    if(this.props.ctrlKey)
    {


    const framewidthpx =this.props.framebufWidth*8 + Number(this.props.borderOn)*64  ;//need to calc border and custom frame sizes..(non 320/200 etc)
    const frameheightpx = this.props.framebufHeight*8 + Number(this.props.borderOn)*64;


    const bwidth = Math.ceil(bbox.width/this.props.framebufLayout.pixelScale/2)-(framewidthpx/2);
    const bheight = Math.ceil(bbox.height/this.props.framebufLayout.pixelScale/2)-(frameheightpx/2);


//      xform =  matrix.mult(matrix.translate(bwidth,bheight), matrix.scale(1));


  xform =  matrix.translate(bwidth,bheight);

console.log("b tests",this.props.framebufWidth,this.props.framebufHeight,bwidth,bheight,framewidthpx,frameheightpx);
}
else{

  xform = matrix.mult(
    prevUIState.canvasTransform,
    matrix.mult(
      matrix.translate(
        srcPos[0] - scaleDelta * srcPos[0],
        srcPos[1] - scaleDelta * srcPos[1]
      ),
      matrix.scale(scaleDelta)
    )
  );

}


   if(xform.v[0][0] <= 0.25)
   {
  //  const invScale = matrix.scale(0.25 / xform.v[0][0]);
 //   xform = matrix.mult(xform, invScale);
    xform.v[0][0] = 0.25;
    xform.v[1][1] = 0.25;

   }
   if(xform.v[0][0] >= 0.26 && xform.v[0][0] <= 0.5)
   {
  //  const invScale = matrix.scale(0.25 / xform.v[0][0]);
 //   xform = matrix.mult(xform, invScale);
    xform.v[0][0] = 0.50;
    xform.v[1][1] = 0.50;

  }
   if(xform.v[0][0] >= 0.51 && xform.v[0][0] <= 0.75)
   {
   // const invScale = matrix.scale(0.25 / xform.v[0][0]);
   // xform = matrix.mult(xform, invScale);
    xform.v[0][0] = 0.75;
    xform.v[1][1] = 0.75;

  }

  if(xform.v[0][0] >= 0.76 && xform.v[0][0] < 8)
  {



 }

    if (xform.v[0][0] >= 8 || xform.v[1][1] >= 8) {
     // const invScale = matrix.scale(0.25 / xform.v[0][0]);
     // xform = matrix.mult(xform, invScale);
      // scale is roughly 1.0 now but let's force float values
      // to exact 1.0
      xform.v[0][0] = 8;
      xform.v[1][1] = 8;
    }

    //xform = matrix.translate(384, 100);

    // Zum = Number((+xform.v[0][0]).toFixed(2)) * 4;
    //{zoomLevel:4,alignment:'center'};

    if(this.props.ctrlKey)
    {
    Zum = {zoomLevel:Number((+xform.v[0][0]).toFixed(2)),alignment:'Center'}
    }
    else
    {
    Zum = {zoomLevel:Number((+xform.v[0][0]).toFixed(2)),alignment:'Mouse'}

    }

    if (xform.v[0][0] == prevUIState.canvasTransform.v[0][0]) {
    } else {
      this.props.Toolbar.setCurrentFramebufUIState({
        ...prevUIState,
        canvasTransform: this.clampToWindow(xform),
      });
    }

   // console.log('delta',delta,'scaleDelta',scaleDelta,'ctrl',this.props.ctrlKey,xform.v[0][0] ,xform.v[1][1],bbox.width );


  };

  render() {
    // Editor needs to specify a fixed width/height because the contents use
    // relative/absolute positioning and thus seem to break out of the CSS
    // grid.
    const charWidth = this.props.framebufWidth;
    const charHeight = this.props.framebufHeight;
    const backg = utils.colorIndexToCssRgb(
      this.props.colorPalette,
      this.props.backgroundColor
    );
    const bord = utils.colorIndexToCssRgb(
      this.props.colorPalette,
      this.props.borderColor
    );

    const { selectedTool } = this.props;
    let overlays = null;
    let screencodeHighlight: number | undefined = this.props.curScreencode;
    let colorHighlight: number | undefined = this.props.textColor;
    let highlightCharPos = true;

    if (this.state.isActive) {
      if (selectedTool === Tool.Brush) {
        highlightCharPos = false;
        if (this.props.brush !== null) {
          overlays = (
            <BrushOverlay
              charPos={this.state.charPos}
              framebufWidth={this.props.framebufWidth}
              framebufHeight={this.props.framebufHeight}
              backgroundColor={backg}
              colorPalette={this.props.colorPalette}
              font={this.props.font}
              brush={this.props.brush}
              borderOn={this.props.borderOn}
            />
          );
        } else {
          overlays = (
            <BrushSelectOverlay
              charPos={this.state.charPos}
              framebufWidth={this.props.framebufWidth}
              framebufHeight={this.props.framebufHeight}
              brushRegion={this.props.brushRegion}
              borderOn={this.props.borderOn}
            />
          );
        }
      } else if (
        selectedTool === Tool.Draw ||
        selectedTool === Tool.Colorize ||
        selectedTool === Tool.CharDraw
      ) {
        overlays = (
          <CharPosOverlay
            framebufWidth={this.props.framebufWidth}
            framebufHeight={this.props.framebufHeight}
            charPos={this.state.charPos}
            borderOn={this.props.borderOn}
            opacity={1.0}
          />
        );
        if (selectedTool === Tool.Colorize) {
          screencodeHighlight = undefined;
        } else if (selectedTool === Tool.CharDraw) {
          colorHighlight = undefined;
        }
        // Don't show current char/color when the ALT color/char picker is active
        if (this.props.altKey) {
          highlightCharPos = false;
        }
      } else {
        highlightCharPos = false;
        screencodeHighlight = undefined;
        colorHighlight = undefined;
      }
    }

    if (selectedTool === Tool.Text) {
      screencodeHighlight = undefined;
      colorHighlight = undefined;
      const { textCursorPos, textColor } = this.props;
      let textCursorOverlay = null;
      if (textCursorPos !== null) {
        const color = utils.colorIndexToCssRgb(
          this.props.colorPalette,
          textColor
        );
        textCursorOverlay = (
          <TextCursorOverlay
            framebufWidth={this.props.framebufWidth}
            framebufHeight={this.props.framebufHeight}
            charPos={textCursorPos}
            fillColor={color}
            opacity={0.5}
            borderOn={this.props.borderOn}
          />
        );
      }
      overlays = (
        <Fragment>
          {textCursorOverlay}
          {this.state.isActive ? (
            <CharPosOverlay
              framebufWidth={this.props.framebufWidth}
              framebufHeight={this.props.framebufHeight}
              charPos={this.state.charPos}
              opacity={0.5}
              borderOn={this.props.borderOn}
            />
          ) : null}
        </Fragment>
      );
    }

    /*
      width: `${this.props.framebufLayout.width}px`,
      height: `${this.props.framebufLayout.height}px`,

      clipPath: `polygon(0% 0%, ${cx} 0%, ${cx} ${cy}, 0% ${cy})`,
*/

   // const cx = "100%";
   // const cy = "100%";
    // TODO scaleX and Y
    const transform = this.props.framebufUIState.canvasTransform;

    //const transform: CSSProperties = { transform: "translate(384px, 2%)" };

    const scale: CSSProperties = {
      display: "flex",
      flexDirection: "row",
      alignItems: "flex-start",
      imageRendering: "pixelated",
      overflowX: "hidden",
      overflowY: "hidden",
      transformOrigin: "0,0",
      border: "1px solid rgba(255,255,255,.25)",

      width: `100%`,
      height: `100%`,
    };
    const canvasContainerStyle: CSSProperties = {
      transform: matrix.toCss(
        matrix.mult(
          matrix.scale(this.props.framebufLayout.pixelScale),
          this.clampToWindow(transform)
        )
      ),
    };

    return (
      <div
        style={scale}
        ref={this.ref}
        onWheel={this.handleWheel}
        onDoubleClick={this.handleDoubleClick}
        onMouseEnter={this.handleMouseEnter}
        onMouseLeave={this.handleMouseLeave}
        onPointerDown={(e) => this.handlePointerDown(e)}
        onPointerMove={(e) => this.handlePointerMove(e)}
        onPointerUp={(e) => this.handlePointerUp(e)}
      >
        <div style={canvasContainerStyle}>
          <CharGrid
            width={charWidth}
            height={charHeight}
            grid={false}
            backgroundColor={backg}
            framebuf={this.props.framebuf}
            charPos={
              this.state.isActive && highlightCharPos
                ? this.state.charPos
                : undefined
            }
            curScreencode={screencodeHighlight}
            textColor={colorHighlight}
            font={this.props.font}
            colorPalette={this.props.colorPalette}
            borderOn={this.props.borderOn}
            borderWidth={32}
            borderColor={bord}
          />
          {overlays}
          {this.props.canvasGrid ? (
            <GridOverlay
              width={charWidth}
              height={charHeight}
              color={gridColor}
              borderWidth={32}
              borderColor={bord}
              borderOn={this.props.borderOn}
            />
          ) : null}
        </div>
      </div>
    );
  }
}

function computeFramebufLayout(args: {
  containerSize: { width: number; height: number };
  framebufSize: { charWidth: number; charHeight: number };
  canvasFit: FramebufUIState["canvasFit"];
  borderOn: boolean;
}) {
  const bottomPad = 0;
  const rightPad = 0;
  const { charWidth, charHeight } = args.framebufSize;
  const maxWidth = args.containerSize.width - rightPad;
  const maxHeight = args.containerSize.height - bottomPad;

  const canvasWidth = charWidth * 8 + (Number(args.borderOn)*32);
  const canvasHeight = charHeight * 8 + (Number(args.borderOn)*32)

  let ws = maxWidth / canvasWidth;
  let divWidth = canvasWidth * ws;
  let divHeight = canvasHeight * ws;

  if (args.canvasFit == "nofit") {
    ws=2;
  }
  else if (args.canvasFit == "fitWidth") {
    if (divHeight > maxHeight) {
      divHeight = maxHeight;
    }
  }
  else if (args.canvasFit == "fitWidthHeight") {
    // If height is now larger than what we can fit in vertically, scale further
    if (divHeight > maxHeight) {
      const s = maxHeight / divHeight;
      divWidth *= s;
      divHeight *= s;
      ws *= s;
    }
  }
  else if (args.canvasFit == "fitHeight") {
    if (divWidth > maxWidth) {
      const s = maxWidth / divWidth;
      divWidth *= s;
      divHeight *= s;
      ws *= s;
    }

  }

  return {
    width: divWidth,
    height: divHeight,
    pixelScale: ws,
  };
}

const FramebufferCont = connect(
  (state: RootState) => {
    const selected = state.toolbar.selectedChar;
    const charTransform = state.toolbar.charTransform;
    const framebuf = selectors.getCurrentFramebuf(state)!;
    if (framebuf == null) {
      throw new Error(
        "cannot render FramebufferCont with a null framebuf, see Editor checks."
      );
    }
    const framebufIndex = screensSelectors.getCurrentScreenFramebufIndex(state);
    const { font } = selectors.getCurrentFramebufFont(state);
    return {
      framebufIndex,
      framebuf: framebuf.framebuf,
      framebufWidth: framebuf.width,
      framebufHeight: framebuf.height,
      backgroundColor: framebuf.backgroundColor,
      borderColor: framebuf.borderColor,
      borderOn: framebuf.borderOn,
      undoId: state.toolbar.undoId,
      curScreencode: selectors.getScreencodeWithTransform(
        selected,
        font,
        charTransform
      ),
      selectedTool: state.toolbar.selectedTool,
      textColor: state.toolbar.textColor,
      brush: selectors.transformBrush(
        state.toolbar.brush,
        state.toolbar.brushTransform,
        font
      ),
      brushRegion: state.toolbar.brushRegion,
      textCursorPos: state.toolbar.textCursorPos,
      shiftKey: state.toolbar.shiftKey,
      altKey: state.toolbar.altKey,
      spacebarKey: state.toolbar.spacebarKey,
      ctrlKey: state.toolbar.ctrlKey,
      font,
      colorPalette: getSettingsCurrentColorPalette(state),
      canvasGrid: state.toolbar.canvasGrid,
    };
  },
  (dispatch) => {
    return {
      Framebuffer: Framebuffer.bindDispatch(dispatch),
      Toolbar: Toolbar.bindDispatch(dispatch),
    };
  },
  framebufIndexMergeProps
)(FramebufferView);

interface EditorProps {
  framebuf: Framebuf | null;
  framebufUIState: FramebufUIState | undefined;
  textColor: number;
  colorPalette: Rgb[];
  paletteRemap: number[];
  selectedTool: Tool;
  spacebarKey: boolean;
  brushActive: boolean;
  integerScale: boolean;
  containerSize: { width: number; height: number };
}

interface EditorDispatch {
  Toolbar: toolbar.PropsFromDispatch;


}

class Editor extends Component<EditorProps & EditorDispatch> {
  state = {
    isActive: false,
    charPos: { row: -1, col: 0 },
  };

  handleSetColor = (color: number) => {
    this.props.Toolbar.setCurrentColor(color);
  };

  handleCharPosChanged = (args: { isActive: boolean; charPos: Coord2 }) => {
    this.setState({
      charPos: args.charPos,
      isActive: args.isActive,
    });
  };

  render() {
    if (
      this.props.framebuf === null ||
      this.props.containerSize == null ||
      !this.props.framebufUIState
    ) {
      return null;
    }
    const { colorPalette } = this.props;
    //const borderColor = utils.colorIndexToCssRgb(colorPalette, this.props.framebuf.borderColor)

    const framebufSize = computeFramebufLayout({
      containerSize: this.props.containerSize,
      framebufSize: {
        charWidth: this.props.framebuf.width,
        charHeight: this.props.framebuf.height,
      },
      canvasFit: this.props.framebufUIState.canvasFit,
      borderOn: this.props.framebuf.borderOn,
    });

    const framebufStyle = {
      position: "absolute",
      left: "10px",
      bottom: "20px",
      right: "320px",
      top: "0px",
      borderColor: "#3b3b3b",
      borderStyle: "solid",
      borderWidth: `${8}px`,
    } as React.CSSProperties;



    const spacebarKey = this.props.spacebarKey;
    const brushSelected = this.props.brushActive;

    //const brushSelected = true;
    const scaleX = 2;
    const scaleY = 2;
    const fbContainerClass = classNames(
      styles.fbContainer,

      this.props.selectedTool == Tool.Text ? styles.text : null,
      this.props.selectedTool == Tool.Brush && !brushSelected && !spacebarKey ? styles.select : null,
      this.props.selectedTool == Tool.Brush && brushSelected && !spacebarKey ? styles.brushstamp : null,
      this.props.selectedTool == Tool.PanZoom || spacebarKey ? styles.panzoom : null,
    );
    return (
      <div className={styles.editorLayoutContainer}>
        <div>
          <div className={fbContainerClass} style={framebufStyle}>
            {this.props.framebuf ? (
              <FramebufferCont
                framebufLayout={framebufSize}
                framebufUIState={this.props.framebufUIState}
                onCharPosChanged={this.handleCharPosChanged}
              />
            ) : null}
          </div>
        </div>
        <div
          style={{
            display: "block",
            position: "absolute",
            right: "0",
            marginLeft: "8px",
            marginRight: "16px",
            border: "0px dotted blue",
          }}
        >
          <div style={{ marginBottom: "10px" }}>

            <ColorPicker
              selected={this.props.textColor}
              paletteRemap={this.props.paletteRemap}
              colorPalette={colorPalette}
              onSelectColor={this.handleSetColor}
              twoRows={true}
              scale={{ scaleX, scaleY }}
            />
          </div>
          <CharSelect canvasScale={{ scaleX, scaleY }} />



        </div>

        <div
          style={{
            display: "block",
            position: "absolute",
            left: "0",
            bottom: "0",
            paddingLeft: "20px",
          }}
        >
          <CanvasStatusbar
            framebuf={this.props.framebuf}
            isActive={this.state.isActive}
            charPos={this.state.charPos}
            zoom={Zum}
          />
        </div>
      </div>
    );
  }
}

export default connect(
  (state: RootState) => {
    const framebuf = selectors.getCurrentFramebuf(state);
    const framebufIndex = screensSelectors.getCurrentScreenFramebufIndex(state);
    return {
      framebuf,
      textColor: state.toolbar.textColor,
      selectedTool: state.toolbar.selectedTool,
      paletteRemap: getSettingsPaletteRemap(state),
      colorPalette: getSettingsCurrentColorPalette(state),
      integerScale: getSettingsIntegerScale(state),
      framebufUIState: selectors.getFramebufUIState(state, framebufIndex),
      spacebarKey: state.toolbar.spacebarKey,
      brushActive: state.toolbar.brush !== null ? true : false,

    };
  },
  (dispatch) => {
    return {
      Toolbar: Toolbar.bindDispatch(dispatch),
    };
  }
)(Editor);
