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
import CharPreviewOverlay from "../components/CharPreviewOverlay";
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
  getSettingsScrollZoomSensitivity,
  getSettingsPinchZoomSensitivity,
  getSettingsConvertSettings,
} from "../redux/settingsSelectors";

import { framebufIndexMergeProps } from "../redux/utils";

import * as toolbar from "../redux/toolbar";
import { Toolbar } from "../redux/toolbar";
import * as utils from "../utils";
import * as matrix from "../utils/matrix";
import { getNextByWeight, getNextByWeightFiltered } from "../utils/charWeight";
import { caseModeFromCharset } from "../utils/charWeightConfig";
import { getNextColorByLuma } from "../utils/palette";
import { generateBox } from "../utils/boxGen";

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
  FadeMode,
  FadeSource,
  FadePickMode,
  BoxPreset,
  ConvertSettings,
  TRANSPARENT_SCREENCODE,
} from "../redux/types";
import * as settings from "../redux/settings";
import GuideLayerPanel from "../components/GuideLayerPanel";
import CollapsiblePanel from "../components/CollapsiblePanel";
import ToolPanel, { FadeHeaderControls } from "../components/ToolPanel";
import LinesPanel, { SeparatorHeaderControls } from "../components/LinesPanel";
import BoxesPanel, { BoxesHeaderControls } from "../components/BoxesPanel";
import TexturePanel, { TexturePatternTypeDropdown } from "../components/TexturePanel";
import { ConvertResult } from "../utils/petsciiConverter";

const charsetDisplayNames: Record<string, string> = {
  upper: 'C64 Upper',
  lower: 'C64 Lower',
  dirart: 'DirArt',
  cbaseUpper: 'Cbase Upper',
  cbaseLower: 'Cbase Lower',
  c128Upper: 'C128 Upper',
  c128Lower: 'C128 Lower',
  petGfx: 'Pet GFX',
  petBiz: 'Pet Business',
  vic20Upper: 'Vic20 Upper',
  vic20Lower: 'Vic20 Lower',
};
function getCharsetDisplayName(charset: string): string {
  return charsetDisplayNames[charset] || charset;
}

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
  isVic20: boolean;
  fadeMode: FadeMode;
  fadeStrength: number;
  fadeSource: FadeSource;
  fadePickMode: FadePickMode;
  fadeLinearCounter: number;
  charset: string;
  boxDrawMode: boolean;
  boxPresets: BoxPreset[];
  selectedBoxPresetIndex: number;
  scrollZoomSensitivity: number;
  pinchZoomSensitivity: number;

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
  private fadeTouchedCells: Set<string> = new Set();

  // Brush outline blink timer
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
    } else if (selectedTool === Tool.FadeLighten) {
      this.fadeTouchedCells.clear();
      this.fadeApply(coord);
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

    } else if (selectedTool === Tool.Boxes && this.props.boxDrawMode && this.props.brush === null) {
      // Box draw mode: start region selection
      this.props.Toolbar.setBrushRegion({
        min: coord,
        max: coord,
      });
    } else if ((selectedTool === Tool.Lines || selectedTool === Tool.Boxes || selectedTool === Tool.Textures) && this.props.brush !== null) {
      this.brushDraw(coord);
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

    } else if (selectedTool === Tool.Boxes && this.props.boxDrawMode && brush === null && brushRegion !== null) {
      // Box draw mode: expand region selection
      const clamped = {
        row: Math.max(0, Math.min(coord.row, this.props.framebufHeight - 1)),
        col: Math.max(0, Math.min(coord.col, this.props.framebufWidth - 1)),
      };
      this.props.Toolbar.setBrushRegion({
        ...brushRegion,
        max: clamped,
      });
    } else if ((selectedTool === Tool.Lines || selectedTool === Tool.Boxes || selectedTool === Tool.Textures) && brush !== null) {
      this.brushDraw(coord);
    } else if (selectedTool === Tool.FadeLighten) {
      utils.drawLine(
        (x, y) => this.fadeApply({ row: y, col: x }),
        prevDragPos.col, prevDragPos.row,
        coord.col, coord.row
      );
    } else if (selectedTool === Tool.FloodFill) {
      //FloodFill here
      this.SetFloodFill(coord, this.rightButton);
    } else {
      console.error("not implemented");
    }

    this.prevDragPos = coord;
  };

  fadeApply = (coord: Coord2) => {
    const { row, col } = coord;
    if (row < 0 || row >= this.props.framebufHeight ||
        col < 0 || col >= this.props.framebufWidth) {
      return;
    }
    // Skip cells already faded during this drag to prevent double-stepping
    const key = `${row},${col}`;
    if (this.fadeTouchedCells.has(key)) return;
    this.fadeTouchedCells.add(key);

    const cell = this.props.framebuf[row][col];
    // Right-click inverts the direction
    const baseDir = this.props.fadeMode === 'lighten' ? 'lighter' : 'darker';
    const direction: 'lighter' | 'darker' = this.rightButton
      ? (baseDir === 'lighter' ? 'darker' : 'lighter')
      : baseDir;

    // Ctrl+click: fade the color by luminance instead of the character
    if (this.props.ctrlKey) {
      const numColors = this.props.charset.startsWith('vic20') ? 8
        : this.props.charset.startsWith('pet') ? 2
        : 16;
      const newColor = getNextColorByLuma(
        this.props.colorPalette, cell.color, direction, numColors
      );
      if (newColor !== cell.color) {
        this.props.Framebuffer.setPixel(
          { ...coord, color: newColor },
          this.props.undoId
        );
      }
      return;
    }

    const caseMode = caseModeFromCharset(this.props.charset);
    const newCode = getNextByWeightFiltered(
      this.props.font, cell.code, direction, this.props.fadeStrength,
      this.props.fadeSource, caseMode, this.props.fadePickMode,
      this.props.fadeLinearCounter,
    );
    if (newCode !== cell.code) {
      this.props.Framebuffer.setPixel(
        { ...coord, screencode: newCode },
        this.props.undoId
      );
    }
    if (this.props.fadePickMode === 'linear') {
      this.props.Toolbar.incFadeLinearCounter();
    }
  };

  dragEnd = () => {
    const { selectedTool, brush, brushRegion } = this.props;
    if (selectedTool === Tool.Brush) {
      if (brush === null && brushRegion !== null) {
        this.props.Toolbar.captureBrush(this.props.framebuf, brushRegion);
      }
    }
    // Box draw mode: generate box at the dragged region and paint it
    if (selectedTool === Tool.Boxes && this.props.boxDrawMode && brush === null && brushRegion !== null) {
      const { min, max } = utils.sortRegion(brushRegion);
      const w = max.col - min.col + 1;
      const h = max.row - min.row + 1;
      if (w >= 2 && h >= 2) {
        const preset = this.props.boxPresets[this.props.selectedBoxPresetIndex];
        if (preset) {
          const px = generateBox(preset, w, h);
          const boxBrush = {
            framebuf: px,
            brushRegion: { min: { row: 0, col: 0 }, max: { row: h - 1, col: w - 1 } },
          };
          this.props.Framebuffer.setBrush(
            { col: min.col, row: min.row, brushType: BrushType.CharsColors, brush: boxBrush, brushColor: this.props.textColor },
            this.props.undoId
          );
        }
      }
      this.props.Toolbar.resetBrush();
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
    const pixelStretchX = this.props.isVic20 ? 2 : 1;
    // Mouse position in the scrollable content space, then convert to canvas pixels.
    const contentX = e.clientX - bbox.left + this.ref.current.scrollLeft;
    const contentY = e.clientY - bbox.top + this.ref.current.scrollTop;
    let x = contentX / (scale * pixelStretchX) / 8;
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

    if (this.props.ctrlKey
      && this.props.selectedTool !== Tool.Brush
      && this.props.selectedTool !== Tool.FadeLighten
      && this.props.selectedTool !== Tool.Lines
      && this.props.selectedTool !== Tool.Boxes
      && this.props.selectedTool !== Tool.Textures
      && e.button !== 2) {
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
  // Accumulated wheel delta for zoom stepping.  Small deltas (e.g. from
  // trackpad pinch or high-resolution scroll wheels) are collected until they
  // cross one full character-step threshold.
  private zoomDeltaAccum = 0;

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

    // Accumulate delta so small trackpad-pinch / high-res scroll events don't
    // each trigger a full zoom step.  Standard mouse wheels send ±100-120 per
    // notch; the threshold is set just above that so one notch = one zoom step.
    const BASE_THRESHOLD = 80;
    // e.ctrlKey is set by macOS for trackpad pinch-to-zoom gestures.
    const isPinch = e.ctrlKey;
    const sensitivity = isPinch
      ? this.props.pinchZoomSensitivity
      : this.props.scrollZoomSensitivity;
    // Scroll: slider 1–10, default 5 → multiplier 0.2–2.0.
    // Pinch:  shifted +2 so slider 1–10 → effective 3–12, multiplier 0.6–2.4.
    const effective = isPinch ? sensitivity + 2 : sensitivity;
    const multiplier = effective / 5;
    const ZOOM_DELTA_THRESHOLD = BASE_THRESHOLD / multiplier;
    this.zoomDeltaAccum += e.deltaY;
    if (Math.abs(this.zoomDeltaAccum) < ZOOM_DELTA_THRESHOLD) {
      return;
    }

    const scaleDir = this.zoomDeltaAccum < 0 ? 1 : -1;
    // Consume the accumulated delta (reset to zero for clean one-step-per-notch).
    this.zoomDeltaAccum = 0;

    const prevScale = this.props.framebufUIState.canvasTransform.v[0][0];
    const newScale = framebuf.stepZoom(prevScale, scaleDir as 1 | -1);

    if (newScale === prevScale) return;

    const container = this.ref.current!;
    const pixelStretchX = this.props.isVic20 ? 2 : 1;

    // Mouse position relative to the scrollable container
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left + container.scrollLeft;
    const mouseY = e.clientY - rect.top + container.scrollTop;

    // Convert mouse position to canvas-content coordinates at the old scale
    const contentX = mouseX / (prevScale * pixelStretchX);
    const contentY = mouseY / prevScale;

    const prevUIState = this.props.framebufUIState;
    const xform = matrix.scale(newScale);

    this.props.Toolbar.setCurrentFramebufUIState({
      ...prevUIState,
      canvasTransform: xform,
    });

    this.props.Framebuffer.setZoom({
      zoomLevel: newScale,
      alignment: 'left',
    });

    // Scroll so the point under the cursor stays in the same screen position
    const newMouseX = contentX * newScale * pixelStretchX;
    const newMouseY = contentY * newScale;
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    this.pendingScroll = {
      left: Math.max(0, newMouseX - offsetX),
      top: Math.max(0, newMouseY - offsetY),
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

    // Fade/Lighten hover preview: compute the replacement char for the cell
    // under the cursor and show it in the CharPreviewOverlay.
    // When ctrl is held, it's color-only mode — hide the character preview.
    if (selectedTool === Tool.FadeLighten && this.state.isActive) {
      if (this.props.ctrlKey) {
        highlightCharPos = false;
      } else {
        const cp = this.state.charPos;
        if (cp.row >= 0 && cp.row < this.props.framebufHeight &&
            cp.col >= 0 && cp.col < this.props.framebufWidth) {
          const cell = this.props.framebuf[cp.row][cp.col];
          const direction = this.props.fadeMode === 'lighten' ? 'lighter' : 'darker';
          const caseMode = caseModeFromCharset(this.props.charset);
          screencodeHighlight = getNextByWeightFiltered(
            this.props.font, cell.code, direction, this.props.fadeStrength,
            this.props.fadeSource, caseMode,
            this.props.fadePickMode === 'random' ? 'first' : this.props.fadePickMode,
            this.props.fadeLinearCounter,
          );
          colorHighlight = cell.color;
        }
      }
    }

    if (this.state.isActive) {
      // Box draw mode with no brush: show live box preview or crosshair
      if (selectedTool === Tool.Boxes && this.props.boxDrawMode && this.props.brush === null) {
        highlightCharPos = false;
        if (this.props.brushRegion !== null) {
          // Generate a live preview of the box at the current drag region
          const { min, max } = utils.sortRegion(this.props.brushRegion);
          const bw = max.col - min.col + 1;
          const bh = max.row - min.row + 1;
          const preset = this.props.boxPresets[this.props.selectedBoxPresetIndex];
          if (preset && bw >= 2 && bh >= 2) {
            const px = generateBox(preset, bw, bh);
            const liveBrush = {
              framebuf: px,
              brushRegion: { min: { row: 0, col: 0 }, max: { row: bh - 1, col: bw - 1 } },
            };
            overlays = (
              <BrushOverlay
                charPos={{ row: min.row + Math.floor(bh / 2), col: min.col + Math.floor(bw / 2) }}
                framebufWidth={this.props.framebufWidth}
                framebufHeight={this.props.framebufHeight}
                backgroundColor={backg}
                colorPalette={this.props.colorPalette}
                font={this.props.font}
                brush={liveBrush}
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
        } else {
          // No region yet — just show crosshair
          overlays = (
            <CharPosOverlay
              framebufWidth={this.props.framebufWidth}
              framebufHeight={this.props.framebufHeight}
              charPos={this.state.charPos}
              borderOn={this.props.borderOn}
              opacity={0.5}
            />
          );
        }
      } else if (selectedTool === Tool.Brush || ((selectedTool === Tool.Lines || selectedTool === Tool.Boxes || selectedTool === Tool.Textures) && this.props.brush !== null)) {
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
      } else if (selectedTool === Tool.FadeLighten) {
        // Show the CharPosOverlay + CharPreviewOverlay for the fade tool
        overlays = (
          <CharPosOverlay
            framebufWidth={this.props.framebufWidth}
            framebufHeight={this.props.framebufHeight}
            charPos={this.state.charPos}
            borderOn={this.props.borderOn}
            opacity={1.0}
          />
        );
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

    // Character preview overlay – renders the selected char/color at the cursor
    // position in a tiny separate canvas to avoid invalidating the main canvas
    // on every mouse move (which caused shimmer at fractional zoom levels).
    let charPreviewOverlay = null;
    if (this.state.isActive && highlightCharPos) {
      const cp = this.state.charPos;
      if (cp.row >= 0 && cp.row < this.props.framebufHeight &&
          cp.col >= 0 && cp.col < this.props.framebufWidth) {
        const fbCell = this.props.framebuf[cp.row][cp.col];
        const previewScreencode = screencodeHighlight !== undefined
          ? screencodeHighlight
          : fbCell.code;
        const previewColor = colorHighlight !== undefined
          ? colorHighlight
          : fbCell.color;
        charPreviewOverlay = (
          <CharPreviewOverlay
            charPos={cp}
            screencode={previewScreencode}
            textColor={previewColor}
            font={this.props.font}
            colorPalette={this.props.colorPalette}
            framebufWidth={this.props.framebufWidth}
            framebufHeight={this.props.framebufHeight}
            borderOn={this.props.borderOn}
            backgroundColor={backg}
          />
        );
      }
    }

    const pixelStretchX = this.props.isVic20 ? 2 : 1;
    // Compute scaled canvas dimensions for the sizer div that drives scrollbars.
    const canvasPixelW = charWidth * 8 + Number(this.props.borderOn) * 64;
    const canvasPixelH = charHeight * 8 + Number(this.props.borderOn) * 64;
    const scaledW = canvasPixelW * zoomScale * pixelStretchX;
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
      // Use CSS zoom instead of transform: scale() to avoid compositor
      // re-rasterization at fractional zoom levels.  transform: scale()
      // rasterises the full-resolution canvas and then re-samples during
      // compositing every time any sibling overlay changes, which caused
      // nearest-neighbour pixel shimmer.  zoom downscales once during the
      // paint step and caches the result – overlay changes only invalidate
      // their own paint region, not the canvas.
      zoom: zoomScale,
      // Isolate this stacking context so overlay blend/paint changes
      // cannot propagate up and trigger re-rasterization of sibling
      // elements (e.g. frame-tab thumbnails).
      isolation: 'isolate' as any,
      position: "absolute" as const,
      top: 0,
      left: 0,
      // VIC-20 double-width pixel stretch: the VIC-20 has pixels that are
      // physically twice as wide as C64 pixels.  Apply a horizontal CSS
      // stretch so the canvas accurately simulates this aspect ratio.
      ...(pixelStretchX > 1 ? {
        transform: `scaleX(${pixelStretchX})`,
        transformOrigin: '0 0',
      } : {}),
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
              font={this.props.font}
              colorPalette={this.props.colorPalette}
              borderOn={this.props.borderOn}
              borderWidth={32}
              borderColor={borderColor}
              isDirart={this.props.isDirart}
            />
            {charPreviewOverlay}
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
                      filter: [
                        this.props.guideLayer.grayscale ? 'grayscale(1)' : '',
                        this.props.guideLayer.brightness !== 100 ? `brightness(${this.props.guideLayer.brightness / 100})` : '',
                        this.props.guideLayer.contrast !== 100 ? `contrast(${this.props.guideLayer.contrast / 100})` : '',
                      ].filter(Boolean).join(' ') || 'none',
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
      isVic20: charset.substring(0, 3) === 'vic',
      guideLayer: framebuf.guideLayer,
      guideLayerVisible: state.toolbar.guideLayerVisible,
      fadeMode: state.toolbar.fadeMode,
      fadeStrength: state.toolbar.fadeStrength,
      fadeSource: state.toolbar.fadeSource,
      fadePickMode: state.toolbar.fadePickMode,
      fadeLinearCounter: state.toolbar.fadeLinearCounter,
      charset: framebuf.charset,
      boxDrawMode: state.toolbar.boxDrawMode,
      boxPresets: state.toolbar.boxPresets,
      selectedBoxPresetIndex: state.toolbar.selectedBoxPresetIndex,
      scrollZoomSensitivity: getSettingsScrollZoomSensitivity(state),
      pinchZoomSensitivity: getSettingsPinchZoomSensitivity(state),

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
  boxDrawMode: boolean;
  convertSettings: ConvertSettings;
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
    colorRowMode: 2 as 1 | 2,
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
      right: "0",
      top: "140px",
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
      ((this.props.selectedTool === Tool.Brush && !brushSelected && !spacebarKey)
        || (this.props.selectedTool === Tool.Boxes && this.props.boxDrawMode && !brushSelected && !spacebarKey))
        ? styles.select
        : null,
      (this.props.selectedTool === Tool.Brush || this.props.selectedTool === Tool.Lines || this.props.selectedTool === Tool.Boxes || this.props.selectedTool === Tool.Textures) && brushSelected && !spacebarKey
        ? styles.brushstamp
        : null,
      this.props.selectedTool === Tool.PanZoom || spacebarKey
        ? styles.panzoom
        : null
    );
    return (
      <div className={styles.editorLayoutContainer}>
        {/* Left column: canvas + status bar */}
        <div style={{ flex: 1, position: "relative", minWidth: 0, pointerEvents: "none" }}>
          <div className={fbContainerClass} style={{ ...framebufStyle, pointerEvents: "auto" }}>
            {this.props.framebuf ? (
              <FramebufferCont
                framebufLayout={framebufSize}
                framebufUIState={this.props.framebufUIState}
                onCharPosChanged={this.handleCharPosChanged}
              />
            ) : null}
          </div>
          <div
            style={{
              position: "absolute",
              left: "0",
              bottom: "0",
              paddingLeft: "20px",
              pointerEvents: "auto",
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

        {/* Right column: colors + chars */}
        <div
          className={styles.rightPanel}
          style={{
            width: "314px",
            flexShrink: 0,
            paddingLeft: "8px",
            paddingTop: "10px",
            overflowY: "auto",
            overflowX: "visible",
            boxSizing: "border-box",
          }}
        >
          <CollapsiblePanel
            title={`Colors (${getCharsetDisplayName(charset)})`}
            headerControls={
              <>
                <div
                  title="Toggle color rows (1 or 2)"
                  onClick={() => {
                    this.setState({ colorRowMode: this.state.colorRowMode === 2 ? 1 : 2 } as any);
                  }}
                  style={{
                    fontSize: "10px",
                    fontWeight: "bold",
                    background: this.state.colorRowMode === 1 ? "#555" : "#333",
                    color: this.state.colorRowMode === 1 ? "#fff" : "#777",
                    border: "1px solid #555",
                    padding: "1px 4px",
                    cursor: "pointer",
                    userSelect: "none",
                    lineHeight: "14px",
                  }}
                >
                  {this.state.colorRowMode}
                </div>
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
              </>
            }
          >
            <ColorPicker
              selected={this.props.textColor}
              paletteRemap={cr}
              colorPalette={cp}
              onSelectColor={this.handleSetColor}
              twoRows={this.state.colorRowMode === 1 ? false : tr}
              scale={this.state.colorRowMode === 1 ? { scaleX: 1, scaleY: 1 } : { scaleX: scaleX, scaleY: scaleY }}
              ctrlKey={this.props.ctrlKey}
              colorSortMode={this.props.colorSortMode}
              showColorNumbers={this.props.showColorNumbers}
              charset={charset}
            />
          </CollapsiblePanel>
          <CharSelect
            colorPalette={cp}
            textColor={this.props.textColor}
            canvasScale={{ scaleX, scaleY }}
            renderPanel={(charSelectContent: React.ReactNode, charSortDropdown: React.ReactNode) => (
              <CollapsiblePanel title="Characters" headerControls={charSortDropdown}>
                {charSelectContent}
              </CollapsiblePanel>
            )}
          />
          {this.props.selectedTool === Tool.Lines && (
            <CollapsiblePanel title="DirArt Separators" headerControls={<SeparatorHeaderControls />}>
              <LinesPanel />
            </CollapsiblePanel>
          )}
          {this.props.selectedTool === Tool.Boxes && (
            <CollapsiblePanel title="Boxes" headerControls={<BoxesHeaderControls />}>
              <BoxesPanel />
            </CollapsiblePanel>
          )}
          {this.props.selectedTool === Tool.Textures && (
            <CollapsiblePanel title="Textures" headerControls={<TexturePatternTypeDropdown />}>
              <TexturePanel />
            </CollapsiblePanel>
          )}
          {this.props.selectedTool === Tool.FadeLighten && (
            <CollapsiblePanel title="Fade/Lighten" headerControls={<FadeHeaderControls />}>
              <ToolPanel selectedTool={this.props.selectedTool} />
            </CollapsiblePanel>
          )}
          {this.props.guideLayerVisible && this.props.framebuf && (
            <CollapsiblePanel title="Guide">
              <GuideLayerPanel
                guideLayer={this.props.framebuf.guideLayer}
                framebufWidth={this.props.framebuf.width}
                framebufHeight={this.props.framebuf.height}
                borderOn={this.props.framebuf.borderOn}
                font={this.props.font}
                colorPalette={this.props.colorPalette}
                backgroundColor={this.props.framebuf.backgroundColor}
                convertSettings={this.props.convertSettings}
                onSetGuideLayer={(gl) => {
                  this.props.Framebuffer.setGuideLayer(gl);
                }}
                onConvertToPetscii={(result: ConvertResult) => {
                  this.props.Framebuffer.setFields({
                    framebuf: result.framebuf,
                    backgroundColor: result.backgroundColor,
                  });
                }}
                onToggleForceBackground={() => {
                  const cur = this.props.convertSettings.forceBackgroundColor;
                  this.props.Settings.setConvertSettings({ branch: 'saved', settings: { forceBackgroundColor: !cur } });
                  this.props.Settings.setConvertSettings({ branch: 'editing', settings: { forceBackgroundColor: !cur } });
                }}
              />
            </CollapsiblePanel>
          )}
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
      boxDrawMode: state.toolbar.boxDrawMode,
      convertSettings: getSettingsConvertSettings(state),
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
