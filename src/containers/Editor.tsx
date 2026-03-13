// @ts-ignore
import React, {
  Component,
  Fragment,
  CSSProperties,
  PointerEvent,
} from "react";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import classNames from "classnames";

import ColorPicker from "../components/ColorPicker";
import CharGrid from "../components/CharGrid";
import CharPosOverlay, {
  TextCursorOverlay,
} from "../components/CharPosOverlay";
import GridOverlay from "../components/GridOverlay";
import { CanvasStatusbar } from "../components/Statusbar";

import CharSelect from "./CharSelect";

import * as framebuf from "../redux/editor";
import { Framebuffer } from "../redux/editor";
import * as selectors from "../redux/selectors";
import * as screensSelectors from "../redux/screensSelectors";
import {
  getSettingsPaletteRemap,
  getSettingsPetPaletteRemap,
  getSettingsVic20PaletteRemap,
  getSettingsCurrentColorPalette,
  getSettingsCurrentVic20ColorPalette,
  getSettingsCurrentPetColorPalette,
  getSettingsIntegerScale,
  getSettingsColorSortMode,
  getSettingsShowColorNumbers,
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
  BrushType,
  Coord2,
  Rgb,
  Brush,
  Font,
  Tool,
  Pixel,
  Framebuf,
  GuideLayer,
  FramebufUIState,
  Zoom,
  ColorSortMode,
  TRANSPARENT_SCREENCODE,
} from "../redux/types";
import * as settings from "../redux/settings";
import GuideLayerPanel from "../components/GuideLayerPanel";
import { ConvertResult } from "../utils/petsciiConverter";

import {electron} from '../utils/electronImports'

const os = electron.remote.process.platform;

const brushOutlineSelectingColor = "rgba(128, 255, 128, 0.5)";
const gridColor = "rgba(128, 128, 128, 1)";

// Helper: derive the correct colour palette and remap for a given charset prefix.
function paletteForCharset(
  charset: string,
  defaultPalette: Rgb[],
  vic20Palette: Rgb[],
  petPalette: Rgb[],
): Rgb[] {
  const prefix = charset.substring(0, 3);
  if (prefix === 'vic') return vic20Palette;
  if (prefix === 'pet') return petPalette;
  return defaultPalette;
}


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
    return <div id="brush" style={s}></div>;
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
  zoom: Zoom;
  font: Font;
  zoomReady: boolean;
  canvasGrid: boolean;
  isDirart:boolean;
  guideLayer?: GuideLayer;
  guideLayerVisible: boolean;

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

  // Brush outline blink timer — kept as an instance field so it can be cleared on unmount.
  private brushBlinkInterval: ReturnType<typeof setInterval> | null = null;
  // Pending scroll position to apply after a React re-render (e.g. after zoom).
  private pendingScroll: { left: number; top: number } | null = null;

  componentDidMount() {
    this.brushBlinkInterval = setInterval(() => {
      const selectedBrushID = document.getElementById("selectedBrushID");
      if (selectedBrushID !== null) {
        const isDashed = selectedBrushID.style.outlineStyle === "dashed";
        selectedBrushID.style.outlineColor = isDashed
          ? "rgba(128, 255, 128, 0.5)"
          : "rgba(128, 255, 128, 0.51)";
        selectedBrushID.style.outlineStyle = isDashed ? "dotted" : "dashed";
        selectedBrushID.style.outlineWidth = "2";
      }
    }, 128);
    // Non-passive wheel listener so we can preventDefault to stop native scroll during zoom.
    if (this.ref.current) {
      this.ref.current.addEventListener('wheel', this.handleWheel as EventListener, { passive: false });
    }
  }

  componentDidUpdate() {
    if (this.pendingScroll && this.ref.current) {
      this.ref.current.scrollLeft = this.pendingScroll.left;
      this.ref.current.scrollTop = this.pendingScroll.top;
      this.pendingScroll = null;
    }
  }

  componentWillUnmount() {
    if (this.brushBlinkInterval !== null) {
      clearInterval(this.brushBlinkInterval);
      this.brushBlinkInterval = null;
    }
    if (this.ref.current) {
      this.ref.current.removeEventListener('wheel', this.handleWheel as EventListener);
    }
  }

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
  setTransparentChar = (clickLoc: Coord2) => {
    const { undoId } = this.props;
    const params = { ...clickLoc };
    if (this.props.selectedTool === Tool.Draw) {
      this.props.Framebuffer.setPixel(
        { ...params, color: this.props.textColor, screencode: TRANSPARENT_SCREENCODE },
        undoId
      );
    } else if (this.props.selectedTool === Tool.Colorize) {
      this.props.Framebuffer.setPixel(
        { ...params, color: this.props.textColor },
        undoId
      );
    } else if (this.props.selectedTool === Tool.CharDraw) {
      this.props.Framebuffer.setPixel(
        { ...params, screencode: TRANSPARENT_SCREENCODE },
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
    if (this.props.brush === null) return;
    const { min, max } = this.props.brush.brushRegion;
    const area = {
      width: max.col - min.col + 1,
      height: max.row - min.row + 1,
    };
    const destPos = computeBrushDstPos(coord, area);

    let btype = BrushType.CharsColors;
    //BrushType


    if (this.props.ctrlKey) {
      btype = BrushType.CharsOnly;
    } else if (this.props.altKey) {
      btype = BrushType.ColorsOnly;
    }


    if (this.props.altKey && this.props.ctrlKey) {
      btype = BrushType.Raw;
    }

    if (this.rightButton) {
      btype = BrushType.ColorStamp;
    }

    this.props.Framebuffer.setBrush(
      {
        ...destPos,
        brushType: btype,
        brush: this.props.brush,
        brushColor: this.props.textColor,
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
      if (!this.rightButton) {
        this.setChar(coord);
      } else {
        if (this.props.ctrlKey) {
          this.setTransparentChar(coord);
        } else {
          this.setBlankChar(coord);
        }
      }
    } else if (selectedTool === Tool.FloodFill) {
      this.SetFloodFill(coord, this.rightButton);
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

          if (!this.rightButton) {
            this.setChar({ row: y, col: x });
          } else {
            if (this.props.ctrlKey) {
              this.setTransparentChar({ row: y, col: x });
            } else {
              this.setBlankChar({ row: y, col: x });
            }
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

    } else if (selectedTool === Tool.FloodFill) {
      //FloodFill here
      this.SetFloodFill(coord, this.rightButton);
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

  ctrlClick = (charPos: Coord2) => {

    const x = charPos.col;
    const y = charPos.row;
    if (
      y >= 0 &&
      y < this.props.framebufHeight &&
      x >= 0 &&
      x < this.props.framebufWidth
    ) {
      const pix = this.props.framebuf[y][x];
      //this.props.Toolbar.setCurrentScreencodeAndColor(pix);
      this.props.Toolbar.setColor(pix.color);
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
      if (this.props.ctrlKey) {
        this.setTransparentChar(charPos);
      } else {
        this.setBlankChar(charPos);
      }
    }
  };


  middleClick = (coord: Coord2) => {
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

          if (!this.rightButton) {
            this.setChar({ row: y, col: x });
          } else {
            if (this.props.ctrlKey) {
              this.setTransparentChar({ row: y, col: x });
            } else {
              this.setBlankChar({ row: y, col: x });
            }
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

    } else if (selectedTool === Tool.FloodFill) {
      //FloodFill here
      this.SetFloodFill(coord, this.rightButton);
    } else {
      console.error("not implemented");
    }

    this.prevDragPos = coord;
  };


  // Returns true if specified row and col coordinates are in the matrix
  validCoordinates = (coords: Coord2) => {
    const x = coords.col;
    const y = coords.row;
    return (
      y >= 0 &&
      y < this.props.framebufHeight &&
      x >= 0 &&
      x < this.props.framebufWidth
    );
  };

  validFloodCoordinates = (
    coords: Coord2,
    sourceCode: number,
    sourceColor: number
  ) => {
    return (
      this.validCoordinates(coords) &&
      this.props.framebuf[coords.row][coords.col].code === sourceCode &&
      this.props.framebuf[coords.row][coords.col].color === sourceColor
    );
  };

  SetFloodFill = (startLoc: Coord2, isRightClick: boolean) => {
    const { undoId } = this.props;

    if (!this.validCoordinates(startLoc)) {
      return;
    }

    //Get the colour and char at the initial click location
    const sourceCode = this.props.framebuf[startLoc.row][startLoc.col].code;
    const sourceColor = this.props.framebuf[startLoc.row][startLoc.col].color;

    const destColor = this.props.textColor;
    let destCode = this.props.curScreencode;

    if (isRightClick) {
      destCode = this.props.ctrlKey ? TRANSPARENT_SCREENCODE : 32;
    }

    // Early exit if source and dest are identical (nothing to fill)
    if (sourceCode === destCode && sourceColor === destColor) {
      return;
    }

    // BFS with a Set for O(1) visited lookups instead of Array.find()
    const visited = new Set<string>();
    const queue: Coord2[] = [startLoc];
    const startKey = `${startLoc.row},${startLoc.col}`;
    visited.add(startKey);

    const pixelChanges: { row: number; col: number; screencode: number; color: number }[] = [];

    while (queue.length > 0) {
      const current = queue.pop()!;
      pixelChanges.push({
        row: current.row,
        col: current.col,
        color: destColor,
        screencode: destCode,
      });

      const { row, col } = current;
      const neighbors: Coord2[] = [
        { col, row: row + 1 },
        { col, row: row - 1 },
        { col: col + 1, row },
        { col: col - 1, row },
      ];

      for (const neighbor of neighbors) {
        const key = `${neighbor.row},${neighbor.col}`;
        if (!visited.has(key) && this.validFloodCoordinates(neighbor, sourceCode, sourceColor)) {
          visited.add(key);
          queue.push(neighbor);
        }
      }
    }

    // Apply all pixel changes in a single batch dispatch
    if (pixelChanges.length > 0) {
      this.props.Framebuffer.setPixels(pixelChanges, undoId);
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
  private middleButton = false;

  currentCharPos(e: any): { charPos: Coord2 } {
    if (!this.ref.current) {
      throw new Error("impossible?");
    }

    const bbox = this.ref.current.getBoundingClientRect();
    const scale = this.props.framebufUIState.canvasTransform.v[0][0];
    // Mouse position in the scrollable content space, then convert to canvas pixels.
    const contentX = e.clientX - bbox.left + this.ref.current.scrollLeft;
    const contentY = e.clientY - bbox.top + this.ref.current.scrollTop;
    let x = contentX / scale / 8;
    let y = contentY / scale / 8;

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
      this.props.selectedTool === Tool.PanZoom ||
      (this.props.selectedTool !== Tool.Text && this.props.spacebarKey)
    ) {
      this.handlePanZoomPointerDown(e);
      return;
    }

    const { charPos } = this.currentCharPos(e);
    this.setCharPos(true, charPos);

    this.rightButton = false;
    this.middleButton = false;


    // alt-left click doesn't start dragging
    if (this.props.altKey && this.props.selectedTool !== Tool.Brush) {
      this.dragging = false;
      this.altClick(charPos);
      return;
    }

    if (this.props.ctrlKey && this.props.selectedTool !== Tool.Brush && e.button !== 2) {
      this.dragging = false;
      this.ctrlClick(charPos);
      return;
    }


    if (e.button === 1) {

      //middle button
      this.middleButton = true;
      //this.handlePanZoomPointerDown(e);
      //this.handlePanZoomPointerDown(e);
      this.middleClick(charPos)
      return;

    }



    if (e.button === 2) {
      //right button
      this.rightClick(charPos);
      this.rightButton = true;

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
    if (this.props.selectedTool === Tool.PanZoom || this.panZoomDragging) {
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
      this.props.selectedTool === Tool.PanZoom ||
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

  xZoom = (zoom: Zoom) => {
  };

  // Mutable dst
  clampToWindow(xform: matrix.Matrix3x3): matrix.Matrix3x3 {

//console.log("xform"+xform.v[0] )

    return xform as matrix.Matrix3x3;
  }

  handlePanZoomPointerMove(e: any) {
    if (this.panZoomDragging && this.ref.current) {
      this.ref.current.scrollLeft -= e.nativeEvent.movementX;
      this.ref.current.scrollTop -= e.nativeEvent.movementY;
    }
  }

  // Reset canvas scale transform to identity on double click.
  handleDoubleClick = () => {
    if (this.props.selectedTool !== Tool.PanZoom) {
      return;
    }
    const prevUIState = this.props.framebufUIState;
    this.props.Toolbar.setCurrentFramebufUIState({
      ...prevUIState,
      canvasTransform: matrix.ident(),
    });
    this.props.Framebuffer.setZoom({
      zoomLevel: 1,
      alignment: 'left',
    });
    this.pendingScroll = { left: 0, top: 0 };
  };

  // Native wheel handler (attached via addEventListener for non-passive support).
  handleWheel = (evt: Event) => {
    const e = evt as globalThis.WheelEvent;
    if (this.props.selectedTool === Tool.Text) {
      return;
    }
    if (!this.ref.current) {
      return;
    }
    if (e.deltaY === 0) {
      return;
    }

    e.preventDefault();

    const scaleDir = e.deltaY < 0 ? 1 : -1;
    const prevScale = this.props.framebufUIState.canvasTransform.v[0][0];
    const newScale = Math.max(0.25, Math.min(8,
      Math.round((prevScale + (0.25 * scaleDir)) * 4) / 4
    ));

    if (newScale === prevScale) return;

    const container = this.ref.current;
    const bbox = container.getBoundingClientRect();
    const mx = e.clientX - bbox.left;
    const my = e.clientY - bbox.top;

    const canvasPixelW = this.props.framebufWidth * 8 + Number(this.props.borderOn) * 64;
    const canvasPixelH = this.props.framebufHeight * 8 + Number(this.props.borderOn) * 64;

    let newScrollLeft: number;
    let newScrollTop: number;

    if (this.props.ctrlKey && !this.props.shiftKey) {
      // Center-aligned zoom
      newScrollLeft = (canvasPixelW * newScale - bbox.width) / 2;
      newScrollTop = (canvasPixelH * newScale - bbox.height) / 2;
    } else if (this.props.ctrlKey && this.props.shiftKey) {
      // Top-left aligned zoom
      newScrollLeft = 0;
      newScrollTop = 0;
    } else {
      // Mouse-centered zoom: keep the canvas point under the cursor fixed
      const contentX = container.scrollLeft + mx;
      const contentY = container.scrollTop + my;
      const canvasX = contentX / prevScale;
      const canvasY = contentY / prevScale;
      newScrollLeft = canvasX * newScale - mx;
      newScrollTop = canvasY * newScale - my;
    }

    const prevUIState = this.props.framebufUIState;
    const xform = matrix.scale(newScale);

    this.props.Toolbar.setCurrentFramebufUIState({
      ...prevUIState,
      canvasTransform: xform,
    });

    this.props.Framebuffer.setZoom({
      zoomLevel: newScale,
      alignment: this.props.ctrlKey && !this.props.shiftKey ? 'center' :
                 this.props.ctrlKey && this.props.shiftKey ? 'left' : 'mouse',
    });

    this.pendingScroll = {
      left: Math.max(0, newScrollLeft),
      top: Math.max(0, newScrollTop),
    };
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
    const borderColor = utils.colorIndexToCssRgb(
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
        selectedTool === Tool.CharDraw ||
        selectedTool === Tool.FloodFill
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

    const transform = this.props.framebufUIState.canvasTransform;
    const zoomScale = transform.v[0][0];

    // Compute scaled canvas dimensions for the sizer div that drives scrollbars.
    const canvasPixelW = charWidth * 8 + Number(this.props.borderOn) * 64;
    const canvasPixelH = charHeight * 8 + Number(this.props.borderOn) * 64;
    const scaledW = canvasPixelW * zoomScale;
    const scaledH = canvasPixelH * zoomScale;

    const containerStyle: CSSProperties = {
      imageRendering: "pixelated",
      overflow: "auto",
      width: "100%",
      height: "100%",
    };

    const sizerStyle: CSSProperties = {
      width: `${scaledW}px`,
      height: `${scaledH}px`,
      position: "relative" as const,
    };

    const canvasContainerStyle: CSSProperties = {
      transformOrigin: "0 0",
      transform: `scale(${zoomScale})`,
      position: "absolute" as const,
      top: 0,
      left: 0,
    };

    return (
      <div
        id="MainContainer"
        style={containerStyle}
        ref={this.ref}
        onDoubleClick={this.handleDoubleClick}
        onMouseEnter={this.handleMouseEnter}
        onMouseLeave={this.handleMouseLeave}
        onPointerDown={(e) => this.handlePointerDown(e)}
        onPointerMove={(e) => this.handlePointerMove(e)}
        onPointerUp={(e) => this.handlePointerUp(e)}
      >
        <div style={sizerStyle}>
          <div id="MainCanvas" style={canvasContainerStyle}>
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
              borderColor={borderColor}
              isDirart={this.props.isDirart}
            />
            {/* Guide Layer Overlay */}
            {this.props.guideLayerVisible &&
              this.props.guideLayer?.enabled &&
              this.props.guideLayer?.imageData && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: `${canvasPixelW}px`,
                    height: `${canvasPixelH}px`,
                    overflow: this.props.guideLayer.cropToCanvas ? 'hidden' : 'visible',
                    pointerEvents: 'none',
                    zIndex: 1,
                  }}
                >
                  <img
                    src={this.props.guideLayer.imageData}
                    alt=""
                    draggable={false}
                    style={{
                      position: 'absolute',
                      left: `${this.props.guideLayer.x + (this.props.borderOn ? 32 : 0)}px`,
                      top: `${this.props.guideLayer.y + (this.props.borderOn ? 32 : 0)}px`,
                      opacity: this.props.guideLayer.opacity,
                      transform: `scale(${this.props.guideLayer.scale})`,
                      transformOrigin: '0 0',
                      imageRendering: 'auto',
                      pointerEvents: 'none',
                    }}
                  />
                </div>
              )}
            {overlays}
            {this.props.canvasGrid ? (
              <GridOverlay
                width={charWidth}
                height={charHeight}
                color={gridColor}
                borderWidth={32}
                borderColor={borderColor}
                borderOn={this.props.borderOn}
              />
            ) : null}
          </div>
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
  zoom: Zoom;
  zoomReady: boolean;

}) {
  const bottomPad = 0;
  const rightPad = 0;
  const { charWidth, charHeight } = args.framebufSize;
  const maxWidth = args.containerSize.width - rightPad;
  const maxHeight = args.containerSize.height - bottomPad;

  const canvasWidth = Math.trunc(charWidth * 8 + Number(args.borderOn) * 32);
  const canvasHeight = Math.trunc(charHeight * 8 + Number(args.borderOn) * 32);



  let ws = maxWidth / canvasWidth;
  let divWidth = canvasWidth * ws;
  let divHeight = canvasHeight * ws;

  if (args.canvasFit === "nofit") {
    ws = 2;
  } else if (args.canvasFit === "fitWidth") {
    if (divHeight > maxHeight) {
      divHeight = maxHeight;
    }
  } else if (args.canvasFit === "fitWidthHeight") {
    // If height is now larger than what we can fit in vertically, scale further
    if (divHeight > maxHeight) {
      const s = maxHeight / divHeight;
      divWidth *= s;
      divHeight *= s;
      ws *= s;
    }
  } else if (args.canvasFit === "fitHeight") {
    if (divWidth > maxWidth) {
      const s = maxWidth / divWidth;
      divWidth *= s;
      divHeight *= s;
      ws *= s;
    }
  }

  // no div scaling, lock to 1
  ws = 1;

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
    const charset = framebuf.charset;
    if (framebuf === null) {
      throw new Error(
        "cannot render FramebufferCont with a null framebuf, see Editor checks."
      );
    }


    const currentColourPalette = paletteForCharset(
      charset,
      getSettingsCurrentColorPalette(state),
      getSettingsCurrentVic20ColorPalette(state),
      getSettingsCurrentPetColorPalette(state),
    );


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
      zoom: framebuf.zoom,
      zoomReady: framebuf.zoomReady,
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
      ctrlKey: os==='darwin' ? state.toolbar.metaKey : state.toolbar.ctrlKey,
      font,
      colorPalette:currentColourPalette,

      canvasGrid: state.toolbar.canvasGrid,
      isDirart: framebuf.charset==='dirart',
      guideLayer: framebuf.guideLayer,
      guideLayerVisible: state.toolbar.guideLayerVisible,

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
  framebufIndex: number | null;
  textColor: number;
  colorPalette: Rgb[];
  vic20colorPalette: Rgb[];
  petcolorPalette: Rgb[];
  paletteRemap: number[];
  petpaletteRemap: number[];
  vic20paletteRemap: number[];
  selectedTool: Tool;
  spacebarKey: boolean;
  ctrlKey:boolean;
  brushActive: boolean;
  integerScale: boolean;
  containerSize: {width:number,height:number} | null;
  colorSortMode: ColorSortMode;
  showColorNumbers: boolean;
  guideLayerVisible: boolean;
  font: Font;
}
// moved from EditorProps
//zoom: Zoom;
//zoomReady: boolean;

interface EditorDispatch {
  Toolbar: toolbar.PropsFromDispatch;
  Framebuffer: framebuf.PropsFromDispatch;
  Settings: settings.PropsFromDispatch;
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

  // Clamp the active color when the charset changes to one with a restricted palette.
  componentDidUpdate(prevProps: EditorProps & EditorDispatch) {
    const charset = this.props.framebuf?.charset;
    if (charset !== prevProps.framebuf?.charset) {
      if (charset?.startsWith('vic20') && this.props.textColor > 7) {
        this.props.Toolbar.setColor(6);
      } else if (charset?.startsWith('pet')) {
        this.props.Toolbar.setColor(1);
      }
    }
  }

  render() {
    if (
      this.props.framebuf === null ||
      this.props.containerSize === null ||
      !this.props.framebufUIState
    ) {
      return null;
    }

    const framebufSize = computeFramebufLayout({
      containerSize: this.props.containerSize,
      framebufSize: {
        charWidth: this.props.framebuf.width,
        charHeight: this.props.framebuf.height,
      },
      canvasFit: this.props.framebufUIState.canvasFit,
      borderOn: this.props.framebuf.borderOn,
      zoom: this.props.framebuf.zoom,
      zoomReady: this.props.framebuf.zoomReady,
    });

    const framebufStyle = {
      position: "absolute",
      left: "10px",
      bottom: "20px",
      right: "320px",
      top: "0px",
      borderColor: "#3b3b3b",
      borderStyle: "solid",
      borderWidth: `${4}px`,
    } as React.CSSProperties;

    const spacebarKey = this.props.spacebarKey;
    const brushSelected = this.props.brushActive;
    const charset = this.props.framebuf.charset;
    const charsetPrefix = charset.substring(0, 3);

    let cr = this.props.paletteRemap;
    let cp = this.props.colorPalette;
    let tr = true;

    if (charsetPrefix === 'vic') {
      cr = this.props.vic20paletteRemap.slice(0, 8);
      cp = this.props.vic20colorPalette;
      tr = false;
    } else if (charsetPrefix === 'pet') {
      cr = this.props.petpaletteRemap.slice(1, 2);
      cp = this.props.petcolorPalette;
      tr = false;
    }
    const scaleX = 2;
    const scaleY = 2;
    const fbContainerClass = classNames(
      styles.fbContainer,

      this.props.selectedTool === Tool.Text ? styles.text : null,
      this.props.selectedTool === Tool.Brush && !brushSelected && !spacebarKey
        ? styles.select
        : null,
      this.props.selectedTool === Tool.Brush && brushSelected && !spacebarKey
        ? styles.brushstamp
        : null,
      this.props.selectedTool === Tool.PanZoom || spacebarKey
        ? styles.panzoom
        : null
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
            top: "0",
            bottom: "20px",
            width: "304px",
            paddingRight: "8px",
            overflowY: "auto",
            overflowX: "hidden",
            boxSizing: "content-box",
          }}
        >
          <div style={{ marginBottom: "4px", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "4px", width: "288px" }}>
            <div
              title="Toggle color numbers"
              onClick={() => {
                this.props.Settings.setShowColorNumbers({
                  branch: 'editing',
                  show: !this.props.showColorNumbers
                });
                this.props.Settings.saveEdits();
              }}
              style={{
                fontSize: "10px",
                fontWeight: "bold",
                background: this.props.showColorNumbers ? "#555" : "#333",
                color: this.props.showColorNumbers ? "#fff" : "#777",
                border: "1px solid #555",
                padding: "1px 4px",
                cursor: "pointer",
                userSelect: "none",
                lineHeight: "14px",
              }}
            >
              #
            </div>
            <select
              value={this.props.colorSortMode}
              onChange={(e) => {
                this.props.Settings.setColorSortMode({
                  branch: 'editing',
                  mode: e.target.value as ColorSortMode
                });
                this.props.Settings.saveEdits();
              }}
              style={{
                fontSize: "10px",
                background: "#333",
                color: "#aaa",
                border: "1px solid #555",
                padding: "1px 2px",
                cursor: "pointer",
              }}
            >
              <option value="default">Default</option>
              <option value="luma-light-dark">Light → Dark</option>
              <option value="luma-dark-light">Dark → Light</option>
            </select>
          </div>
          <div style={{ marginBottom: "10px" }}>
            <ColorPicker
              selected={this.props.textColor}
              paletteRemap={cr}
              colorPalette={cp}
              onSelectColor={this.handleSetColor}
              twoRows={tr}
              scale={{ scaleX, scaleY }}
              ctrlKey={this.props.ctrlKey}
              colorSortMode={this.props.colorSortMode}
              showColorNumbers={this.props.showColorNumbers}
              charset={charset}
            />
          </div>
          <CharSelect  colorPalette={cp} textColor={this.props.textColor} canvasScale={{ scaleX, scaleY }} />
          {this.props.guideLayerVisible && this.props.framebuf && (
            <GuideLayerPanel
              guideLayer={this.props.framebuf.guideLayer}
              framebufWidth={this.props.framebuf.width}
              framebufHeight={this.props.framebuf.height}
              borderOn={this.props.framebuf.borderOn}
              font={this.props.font}
              colorPalette={this.props.colorPalette}
              backgroundColor={this.props.framebuf.backgroundColor}
              onSetGuideLayer={(gl) => {
                this.props.Framebuffer.setGuideLayer(gl);
              }}
              onConvertToPetscii={(result: ConvertResult) => {
                this.props.Framebuffer.setFields({
                  framebuf: result.framebuf,
                  backgroundColor: result.backgroundColor,
                });
              }}
            />
          )}

        </div>

        <div
          style={{
            display: "relative",
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
            zoom={this.props.framebuf.zoom}
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
    const c64Palette = getSettingsCurrentColorPalette(state);
    const vic20Palette = getSettingsCurrentVic20ColorPalette(state);
    const petPalette = getSettingsCurrentPetColorPalette(state);
    const currentColourPalette = framebuf
      ? paletteForCharset(framebuf.charset, c64Palette, vic20Palette, petPalette)
      : c64Palette;
    const { font } = selectors.getCurrentFramebufFont(state);
    return {
      framebuf,
      framebufIndex,
      textColor: state.toolbar.textColor,
      selectedTool: state.toolbar.selectedTool,
      paletteRemap: getSettingsPaletteRemap(state),
      petpaletteRemap: getSettingsPetPaletteRemap(state),
      vic20paletteRemap: getSettingsVic20PaletteRemap(state),
      colorPalette: currentColourPalette,
      vic20colorPalette: vic20Palette,
      petcolorPalette: petPalette,
      integerScale: getSettingsIntegerScale(state),
      framebufUIState: selectors.getFramebufUIState(state, framebufIndex),
      spacebarKey: state.toolbar.spacebarKey,
      ctrlKey: os === 'darwin' ? state.toolbar.metaKey : state.toolbar.ctrlKey,
      brushActive: state.toolbar.brush !== null,
      colorSortMode: getSettingsColorSortMode(state),
      showColorNumbers: getSettingsShowColorNumbers(state),
      guideLayerVisible: state.toolbar.guideLayerVisible,
      font,
    };
  },
  (dispatch) => {
    return {
      Toolbar: Toolbar.bindDispatch(dispatch),
      Framebuffer: Framebuffer.bindDispatch(dispatch),
      Settings: bindActionCreators(settings.actions, dispatch),
    };
  },
  framebufIndexMergeProps
)(Editor);
