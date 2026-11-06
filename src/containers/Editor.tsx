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
  getSettingsCurrentTedColorPalette,
  getSettingsIntegerScale,
  getSettingsColorSortMode,
  getSettingsShowColorNumbers,
  getSettingsScrollZoomSensitivity,
  getSettingsPinchZoomSensitivity,
  getSettingsConvertSettings,
  getSettingsCharPanelBgMode,
  getSettingsShiftDrawingMode,
  getSettingsVdcBlinkIntervalMs,
  getSettingsShowTransparency,
} from "../redux/settingsSelectors";

import { framebufIndexMergeProps } from "../redux/utils";

import * as toolbar from "../redux/toolbar";
import { Toolbar } from "../redux/toolbar";
import * as utils from "../utils";
import * as matrix from "../utils/matrix";
import { getNextByWeight, getNextByWeightFiltered } from "../utils/charWeight";
import { caseModeFromCharset } from "../utils/charWeightConfig";
import { getNextColorByLuma, vdcPalette, getColorGroup } from "../utils/palette";
import { effectiveGlyph, effectiveAttr, VDC_ATTR_REVERSE, VDC_ATTR_UNDERLINE } from "../utils/vdcAttr";
import { effectivePixelsEqual, EffectivePixelOptions, resolveEffectivePixel } from "../utils/effectivePixel";
import { generateBox } from "../utils/boxGen";
import { drawCharLine, drawChunkyLine, drawCharCircle, drawChunkyCircle, LinePixel } from "../utils/chunkyLine";

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
  FadeStepStart,
  FadeStepChoice,
  FadeStepSort,
  BoxPreset,
  TexturePreset,
  ConvertSettings,
  DEFAULT_GUIDE_LAYER,
  TRANSPARENT_SCREENCODE,
  VDC_TRANSPARENT_SCREENCODE,
  TextureDrawMode,
} from "../redux/types";
import * as settings from "../redux/settings";
import GuideLayerPanel, { GuideHeaderControls } from "../components/GuideLayerPanel";
import CollapsiblePanel from "../components/CollapsiblePanel";
import ToolPanel, { FadeHeaderControls } from "../components/ToolPanel";
import FindReplacePanel from "../components/FindReplacePanel";
import LinesPanel, { SeparatorHeaderControls } from "../components/LinesPanel";
import BoxesPanel, { BoxesHeaderControls } from "../components/BoxesPanel";
import TexturePanel, { TextureHeaderControls } from "../components/TexturePanel";
import LineDrawPanel from "../components/LineDrawPanel";
import { ConvertResult } from "../utils/petsciiConverter";
import { getPixelStretchX, resolveColumnMode } from "../utils/platformChecks";

const charsetDisplayNames: Record<string, string> = {
  upper: 'C64 Upper',
  lower: 'C64 Lower',
  dirart: 'DirArt',
  cbaseUpper: 'Cbase Upper',
  cbaseLower: 'Cbase Lower',
  c128Upper: 'C128 Upper',
  c128Lower: 'C128 Lower',
  c128vdc: 'C128 VDC (dual)',
  c16Upper: 'C16 Upper',
  c16Lower: 'C16 Lower',
  petGfx: 'Pet GFX',
  petBiz: 'Pet Business',
  vic20Upper: 'Vic20 Upper',
  vic20Lower: 'Vic20 Lower',
};
function getCharsetDisplayName(charset: string, width?: number, customFonts?: Record<string, { name: string }>): string {
  if (charset === 'c128vdc') return 'C128 VDC (dual)';
  // Show VDC designation for legacy 80-col C128 screens that haven't been
  // migrated yet (workspace migration upgrades them to `c128vdc` on load).
  if (width !== undefined && width >= 80 && charset.startsWith('c128')) {
    return charset === 'c128Lower' ? 'C128 VDC Lower' : 'C128 VDC Upper';
  }
  if (charsetDisplayNames[charset]) {
    return charsetDisplayNames[charset];
  }
  // Custom font: show the user-given name + platform label
  if (customFonts && customFonts[charset]) {
    const fontName = customFonts[charset].name;
    const prefix = charset.substring(0, 3);
    const platformLabels: Record<string, string> = {
      'c64': 'C64', 'c12': 'C128', 'vic': 'VIC-20', 'pet': 'PET', 'c16': 'C16',
    };
    const platform = platformLabels[prefix] || 'C64';
    return `${fontName} (${platform})`;
  }
  return charset;
}

import {electron} from '../utils/electronImports'

const os = electron.remote.process.platform;

const brushOutlineSelectingColor = "rgba(128, 255, 128, 0.5)";
const gridColor = "rgba(128, 128, 128, 1)";

// Helper: derive the correct colour palette and remap for a given charset prefix.
// When width >= 80 and charset is c128*, use the VDC RGBI palette.
function paletteForCharset(
  charset: string,
  defaultPalette: Rgb[],
  vic20Palette: Rgb[],
  petPalette: Rgb[],
  width?: number,
  tedPalette?: Rgb[],
): Rgb[] {
  const prefix = charset.substring(0, 3);
  if (prefix === 'c16' && tedPalette) return tedPalette;
  if (prefix === 'vic') return vic20Palette;
  if (prefix === 'pet') return petPalette;
  // The dedicated VDC charset always uses the RGBI palette regardless of
  // dimensions; the legacy `c128Upper`/`c128Lower` 80-col path stays for
  // backwards compatibility until migration runs.
  if (charset === 'c128vdc') return vdcPalette;
  if (prefix === 'c12' && width !== undefined && width >= 80) return vdcPalette;
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
  /** True when the active framebuf is a C128 VDC frame.  Controls whether
   *  the brush preview's CharGrid honours per-cell VDC attribute fields
   *  (REVERSE/UNDERLINE/ALT) and the 512-glyph code space.  Defaults to
   *  false so existing call sites keep their non-VDC behaviour. */
  isVdc?: boolean;
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
          isVdc={this.props.isVdc === true}
          showVdcTransparentGlyph={false}
          />
      </div>
    );
  }
}

// ---- Line Draw Preview Overlay ----
interface LinePreviewOverlayProps {
  pixels: LinePixel[];
  font: Font;
  colorPalette: Rgb[];
  textColor: number;
  framebufWidth: number;
  framebufHeight: number;
  borderOn: boolean;
}

class LinePreviewOverlay extends Component<LinePreviewOverlayProps> {
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

interface FramebufferViewProps {
  undoId: number | null;
  // Which framebuf in framebufList this view is rendering. Used as a React
  // `key` on the main CharGrid so switching frames forces a fresh canvas
  // instance, avoiding any retained GPU layer / font cache state from the
  // previously rendered frame.
  framebufIndex: number | null;

  altKey: boolean;
  ctrlKey: boolean;
  rawCtrlKey: boolean;
  shiftKey: boolean;
  shiftDrawingMode: import('../redux/types').ShiftDrawingMode;
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
  isVDC80: boolean;
  fadeMode: FadeMode;
  fadeStrength: number;
  fadeSource: FadeSource;
  fadeStepStart: FadeStepStart;
  fadeStepCount: number;
  fadeStepChoice: FadeStepChoice;
  fadeStepSort: FadeStepSort;
  fadeLinearCounter: number;
  fadeCustomScreencodes?: number[];
  fadeDrawMode: boolean;
  charset: string;
  /** Active VDC paint-attribute flag bits (high nibble: BLINK 0x10,
   *  UNDERLINE 0x20, REVERSE 0x40).  Threaded through into setPixel
   *  payloads so the reducer can OR them on top of the cell's attr.
   *  Always 0 when not painting on a c128vdc framebuf. */
  vdcPaintFlags: number;
  /** C16/TED paint blink toggle. */
  c16PaintBlink: boolean;
  vdcBlinkIntervalMs: number;
  boxDrawMode: boolean;
  boxForceForeground: boolean;
  boxPresets: BoxPreset[];
  selectedBoxPresetIndex: number;
  textureDrawMode: TextureDrawMode;
  textureForceForeground: boolean;
  texturePresets: TexturePreset[];
  selectedTexturePresetIndex: number;
  scrollZoomSensitivity: number;
  pinchZoomSensitivity: number;
  lineDrawActive: boolean;
  lineDrawChunkyMode: boolean;
  lineDrawPoints: Coord2[];
  guideLayerDragOffset: { dx: number; dy: number } | null;
  showTransparency: boolean;

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

// Exported (in addition to the default connected view below) so
// sampleTexturePixel and the texture fill/preview methods can be
// unit-tested by instantiating this class directly, without needing a full
// react-redux Provider + ReactDOM mount.
export class FramebufferView extends Component<
  FramebufferViewProps & FramebufferViewDispatch,
  FramebufferViewState
> {
  state: FramebufferViewState = {
    charPos: { row: -1, col: 0 },
    isActive: false,
  };

  prevDragPos: Coord2 | null = null;
  private fadeTouchedCells: Set<string> = new Set();
  private rvsTouchedCells: Set<string> = new Set();
  // Reseeded in componentDidUpdate when the pen cycles from 'none' into an
  // "on" texture mode, or when the active texture preset/options change --
  // NOT per-drag/per-fill -- so every fill made during the same session
  // (box-drags, bucket-fills, replace-all) samples the same "random" tile
  // choices and the pattern looks continuous across separate operations
  // instead of reshuffling every time.
  private textureRandomSeed = 0;
  private lineDrawSubPixels: { subCol: number; subRow: number }[] = [];
  private lineDrawHoverSubCol = 0;
  private lineDrawHoverSubRow = 0;

  // Brush outline blink timer
  private brushBlinkInterval: ReturnType<typeof setInterval> | null = null;
  // Pending scroll position to apply after a React re-render (e.g. after zoom).
  private pendingScroll: { left: number; top: number } | null = null;

  private appliedScrollForState: FramebufUIState | null = null;

  /** Tools that should honour the Link-Line shift mode.  Matches the set of
   *  tools that pass through dragStart/dragMove with shift-axis-lock today. */
  private isLinkLineTool(tool: Tool, fadeDrawMode: boolean): boolean {
    if (tool === Tool.Draw || tool === Tool.Colorize || tool === Tool.CharDraw) return true;
    if (tool === Tool.RvsPen) return true;
    if (tool === Tool.FadeLighten && !fadeDrawMode) return true;
    return false;
  }

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
    // Restore saved scroll position from framebufUIState after initial render
    this.restoreSavedScroll();
  }

  componentDidUpdate(prevProps: FramebufferViewProps & FramebufferViewDispatch) {
    if (this.pendingScroll && this.ref.current) {
      this.ref.current.scrollLeft = this.pendingScroll.left;
      this.ref.current.scrollTop = this.pendingScroll.top;
      this.pendingScroll = null;
    }
    // Restore saved scroll when switching to a frame with saved scroll position
    this.restoreSavedScroll();
    // Link-Line shift mode: clear the anchor as soon as SHIFT is released or
    // the user switches to a tool that doesn't honour link-line drawing, so
    // the preview overlay disappears and the next shift+click starts fresh.
    const wasLinkLineEligible = prevProps.shiftKey
      && prevProps.shiftDrawingMode === 'linkLine'
      && this.isLinkLineTool(prevProps.selectedTool, prevProps.fadeDrawMode);
    const isLinkLineEligible = this.props.shiftKey
      && this.props.shiftDrawingMode === 'linkLine'
      && this.isLinkLineTool(this.props.selectedTool, this.props.fadeDrawMode);
    if (wasLinkLineEligible && !isLinkLineEligible && this.linkLineAnchor !== null) {
      this.linkLineAnchor = null;
      this.forceUpdate();
    }
    // Reseed the texture random-fill seed on entering an "on" pen mode from
    // 'none', or when the active preset/options change while already on --
    // see textureRandomSeed's comment for why this isn't done per-fill.
    const enteringTextureOnMode = prevProps.textureDrawMode === 'none' && this.props.textureDrawMode !== 'none';
    const texturePresetChanged = this.props.texturePresets !== prevProps.texturePresets
      || this.props.selectedTexturePresetIndex !== prevProps.selectedTexturePresetIndex;
    if (this.props.textureDrawMode !== 'none' && (enteringTextureOnMode || texturePresetChanged)) {
      this.textureRandomSeed = (Math.random() * 0xffffffff) >>> 0;
    }
  }

  private restoreSavedScroll() {
    const uiState = this.props.framebufUIState;
    if (uiState && uiState !== this.appliedScrollForState && this.ref.current) {
      const sx = uiState.scrollX;
      const sy = uiState.scrollY;
      if (sx !== undefined || sy !== undefined) {
        requestAnimationFrame(() => {
          if (this.ref.current) {
            if (sx !== undefined) this.ref.current.scrollLeft = sx;
            if (sy !== undefined) this.ref.current.scrollTop = sy;
          }
        });
      }
      this.appliedScrollForState = uiState;
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

  /** Build the optional VDC paint-attribute payload key for setPixel.
   *  Returns the empty object on non-VDC frames so the wire shape stays
   *  identical to the legacy `{ ...params, color, screencode }` form. */
  private vdcAttrPayload(): { attrFlags?: number } {
    return this.props.charset === 'c128vdc'
      ? { attrFlags: this.props.vdcPaintFlags }
      : {};
  }

  private transparentScreencode(): number {
    return this.props.charset === 'c128vdc'
      ? VDC_TRANSPARENT_SCREENCODE
      : TRANSPARENT_SCREENCODE;
  }

  private isTedCharset(): boolean {
    return this.props.charset.startsWith('c16');
  }

  /** Platform flags for resolveEffectivePixel/effectivePixelsEqual, derived
   *  from the active framebuf's charset -- see effectivePixel.ts. */
  private effectivePixelOptions(): EffectivePixelOptions {
    return {
      isVdc: this.props.charset === 'c128vdc',
      isTed: this.isTedCharset(),
    };
  }

  private currentPaintColor(): number {
    if (!this.isTedCharset()) return this.props.textColor;
    const hueLum = this.props.textColor & 0x7f;
    return this.props.c16PaintBlink ? (hueLum | 0x80) : hueLum;
  }

  setBlankChar = (clickLoc: Coord2) => {
    const { undoId } = this.props;
    const params = {
      ...clickLoc,
    };
    const vdcExtras = this.vdcAttrPayload();
    const paintColor = this.currentPaintColor();
    if (this.props.selectedTool === Tool.Draw) {
      this.props.Framebuffer.setPixel(
        {
          ...params,
          ...vdcExtras,
          color: paintColor,
          screencode: 32,
        },
        undoId
      );
    } else if (this.props.selectedTool === Tool.Colorize) {
      this.props.Framebuffer.setPixel(
        {
          ...params,
          ...vdcExtras,
          color: paintColor,
        },
        undoId
      );
    } else if (this.props.selectedTool === Tool.CharDraw) {
      this.props.Framebuffer.setPixel(
        {
          ...params,
          ...vdcExtras,
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
    const vdcExtras = this.vdcAttrPayload();
    const transparentCode = this.transparentScreencode();
    const paintColor = this.currentPaintColor();
    if (this.props.selectedTool === Tool.Draw) {
      this.props.Framebuffer.setPixel(
        { ...params, ...vdcExtras, color: paintColor, screencode: transparentCode },
        undoId
      );
    } else if (this.props.selectedTool === Tool.Colorize) {
      this.props.Framebuffer.setPixel(
        { ...params, ...vdcExtras, color: paintColor },
        undoId
      );
    } else if (this.props.selectedTool === Tool.CharDraw) {
      this.props.Framebuffer.setPixel(
        { ...params, ...vdcExtras, screencode: transparentCode },
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
    const vdcExtras = this.vdcAttrPayload();
    const paintColor = this.currentPaintColor();
    if (this.props.selectedTool === Tool.Draw) {
      this.props.Framebuffer.setPixel(
        {
          ...params,
          ...vdcExtras,
          color: paintColor,
          screencode: this.props.curScreencode,
        },
        undoId
      );
    } else if (this.props.selectedTool === Tool.Colorize) {
      this.props.Framebuffer.setPixel(
        {
          ...params,
          ...vdcExtras,
          color: paintColor,
        },
        undoId
      );
    } else if (this.props.selectedTool === Tool.CharDraw) {
      this.props.Framebuffer.setPixel(
        {
          ...params,
          ...vdcExtras,
          screencode: this.props.curScreencode,
        },
        undoId
      );
    } else {
      console.error("shouldn't get here");
    }
  };

  setRvsChar = (clickLoc: Coord2) => {
    const { row, col } = clickLoc;
    if (row < 0 || row >= this.props.framebufHeight ||
        col < 0 || col >= this.props.framebufWidth) {
      return;
    }
    // Skip cells already flipped during this drag to prevent double-toggle
    const key = `${row},${col}`;
    if (this.rvsTouchedCells.has(key)) return;
    this.rvsTouchedCells.add(key);
    const cell = this.props.framebuf[row][col];
    // Skip transparent cells – RVS doesn't paint them.
    const isVdc = this.props.charset === 'c128vdc';
    const isTransparentCell = isVdc
      ? (cell.transparent === true || cell.code === VDC_TRANSPARENT_SCREENCODE)
      : (
        cell.transparent === true ||
        cell.code === TRANSPARENT_SCREENCODE ||
        cell.code === VDC_TRANSPARENT_SCREENCODE
      );
    if (isTransparentCell) return;
    if (isVdc) {
      // VDC: toggle the REVERSE attribute bit on this cell only.  Every
      // other field (code / colour / ALT / UNDERLINE / BLINK) is
      // preserved — this is the correct hardware semantic.
      this.props.Framebuffer.toggleVdcAttr(
        { row, col, mask: 0x40 /* VDC_ATTR_REVERSE */ },
        this.props.undoId,
      );
      return;
    }
    // Non-VDC fonts: original behaviour — toggle bit 7 of the screencode
    // (PETSCII reverse).  Only meaningful for codes 0–255.
    if (cell.code >= 256) return;
    this.props.Framebuffer.setPixel(
      {
        ...clickLoc,
        screencode: cell.code ^ 0x80,
      },
      this.props.undoId
    );
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
        brushColor: this.currentPaintColor(),
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
      if (this.rightButton && this.props.altKey) {
        // Alt+Right click = RVS mode
        this.rvsTouchedCells.clear();
        this.setRvsChar(coord);
      } else if (!this.rightButton) {
        this.setChar(coord);
      } else {
        if (this.props.ctrlKey) {
          this.setTransparentChar(coord);
        } else {
          this.setBlankChar(coord);
        }
      }
    } else if (selectedTool === Tool.RvsPen) {
      this.rvsTouchedCells.clear();
      this.setRvsChar(coord);
    } else if (selectedTool === Tool.FadeLighten && !this.props.fadeDrawMode) {
      this.fadeTouchedCells.clear();
      this.fadeApply(coord);
    } else if (selectedTool === Tool.FadeLighten && this.props.fadeDrawMode && this.props.brush === null) {
      // Fade box-select mode: start region
      this.props.Toolbar.setBrushRegion({ min: coord, max: coord });
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
    } else if (selectedTool === Tool.Circles && this.props.brush === null) {
      // Circles tool: start region selection (drag out bounding box)
      this.props.Toolbar.setBrushRegion({
        min: coord,
        max: coord,
      });
    } else if (selectedTool === Tool.Textures && this.props.textureDrawMode === 'box' && this.props.brush === null) {
      // Box-fill mode: start region selection. (textureRandomSeed is
      // reseeded in componentDidUpdate on entering an "on" mode or when the
      // preset changes -- NOT per-drag -- so random texture fills stay
      // continuous with other fills made during the same session.)
      this.props.Toolbar.setBrushRegion({
        min: coord,
        max: coord,
      });
    } else if (selectedTool === Tool.Textures && this.props.textureDrawMode === 'bucket') {
      // Bucket-fill mode: flood-fill the contiguous region under the
      // cursor with the canvas-anchored texture pattern.
      this.SetTextureFloodFill(coord);
    } else if (selectedTool === Tool.Textures && this.props.textureDrawMode === 'replace') {
      // Replace-All mode: replace every matching cell on the whole canvas
      // with the canvas-anchored texture pattern.
      this.SetTextureReplaceAll(coord);
    } else if (selectedTool === Tool.Textures && this.props.textureDrawMode === 'none' && this.props.brush === null) {
      // Select mode: start region selection (same as Brush tool); captured
      // as a brush from the existing canvas content on release.
      this.props.Toolbar.setBrushRegion({
        min: coord,
        max: coord,
      });
    } else if (selectedTool === Tool.FindReplace) {
      // FindReplace: always brush-select on canvas (no stamp)
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
          if (this.rightButton && this.props.altKey) {
            this.setRvsChar({ row: y, col: x });
          } else if (!this.rightButton) {
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
    } else if (selectedTool === Tool.RvsPen) {
      utils.drawLine(
        (x, y) => this.setRvsChar({ row: y, col: x }),
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
    } else if (selectedTool === Tool.Circles && brush === null && brushRegion !== null) {
      // Circles tool: expand bounding box
      const clamped = {
        row: Math.max(0, Math.min(coord.row, this.props.framebufHeight - 1)),
        col: Math.max(0, Math.min(coord.col, this.props.framebufWidth - 1)),
      };
      this.props.Toolbar.setBrushRegion({
        ...brushRegion,
        max: clamped,
      });
    } else if (selectedTool === Tool.Textures && this.props.textureDrawMode === 'box' && brush === null && brushRegion !== null) {
      // Box-fill mode: expand region selection
      const clamped = {
        row: Math.max(0, Math.min(coord.row, this.props.framebufHeight - 1)),
        col: Math.max(0, Math.min(coord.col, this.props.framebufWidth - 1)),
      };
      this.props.Toolbar.setBrushRegion({
        ...brushRegion,
        max: clamped,
      });
    } else if (selectedTool === Tool.Textures && this.props.textureDrawMode === 'bucket') {
      // Bucket-fill mode: re-trigger on every new cell entered while
      // dragging, like Flood Fill does, so one drag stroke can fill
      // multiple separate regions.
      this.SetTextureFloodFill(coord);
    } else if (selectedTool === Tool.Textures && this.props.textureDrawMode === 'none' && brush === null && brushRegion !== null) {
      // Select mode: expand region
      const clamped = {
        row: Math.max(0, Math.min(coord.row, this.props.framebufHeight - 1)),
        col: Math.max(0, Math.min(coord.col, this.props.framebufWidth - 1)),
      };
      this.props.Toolbar.setBrushRegion({
        ...brushRegion,
        max: clamped,
      });
    } else if (selectedTool === Tool.FindReplace && brushRegion !== null) {
      // FindReplace: expand region selection
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
    } else if (selectedTool === Tool.FadeLighten && !this.props.fadeDrawMode) {
      utils.drawLine(
        (x, y) => this.fadeApply({ row: y, col: x }),
        prevDragPos.col, prevDragPos.row,
        coord.col, coord.row
      );
    } else if (selectedTool === Tool.FadeLighten && this.props.fadeDrawMode && brush === null && brushRegion !== null) {
      // Fade box-select mode: expand region
      const clamped = {
        row: Math.max(0, Math.min(coord.row, this.props.framebufHeight - 1)),
        col: Math.max(0, Math.min(coord.col, this.props.framebufWidth - 1)),
      };
      this.props.Toolbar.setBrushRegion({ ...brushRegion, max: clamped });
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
      const isTedColor = this.props.charset.startsWith('c16');
      // TED's palette is 128 entries (8 luminances x 16 hues), not 16 --
      // the previous numColors=16 default restricted luma-fading to only
      // luminance-0 entries, so fading almost any TED color (whose index
      // is >= 16) was a no-op.
      const numColors = this.props.charset.startsWith('vic20') ? 8
        : this.props.charset.startsWith('pet') ? 2
        : isTedColor ? 128
        : 16;
      // TED color bytes pack a blink flag into bit 7 (see currentPaintColor
      // above). Mask it off before using the byte as a luma-sorted palette
      // index -- otherwise a blinking cell's color (>= 0x80) never matched
      // any entry in `indices` and fading silently did nothing -- then
      // reapply it afterward so fading doesn't clear the cell's blink state.
      const blinkBit = isTedColor ? (cell.color & 0x80) : 0;
      const baseColor = isTedColor ? (cell.color & 0x7f) : cell.color;
      const newBaseColor = getNextColorByLuma(
        this.props.colorPalette, baseColor, direction, numColors
      );
      const newColor = newBaseColor | blinkBit;
      if (newColor !== cell.color) {
        this.props.Framebuffer.setPixel(
          { ...coord, color: newColor },
          this.props.undoId
        );
      }
      return;
    }

    const caseMode = caseModeFromCharset(this.props.charset);
    const sourceCode = this.props.charset === 'c128vdc'
      ? effectiveGlyph(cell)
      : cell.code;
    const newCode = getNextByWeightFiltered(
      this.props.font, sourceCode, direction, this.props.fadeStrength,
      this.props.fadeSource as any, caseMode,
      this.props.fadeLinearCounter,
      this.props.fadeStepStart, this.props.fadeStepCount,
      this.props.fadeStepChoice, this.props.fadeStepSort,
      this.props.fadeCustomScreencodes,
    );
    if (newCode !== sourceCode) {
      this.props.Framebuffer.setPixel(
        { ...coord, screencode: newCode },
        this.props.undoId
      );
    }
    // Increment counter for traversal modes that need it
    if (this.props.fadeStepChoice !== 'random') {
      this.props.Toolbar.incFadeLinearCounter();
    }
  };

  /** Deterministic pseudo-random value in [0, 1) for a given cell, seeded by
   *  `textureRandomSeed`. Not for cryptographic use -- just needs to be
   *  stable for a given (seed, r, c) so repeated calls during the same
   *  drag session agree with each other. */
  private seededRandom(r: number, c: number): number {
    let h = (this.textureRandomSeed ^ Math.imul(r + 1, 374761393) ^ Math.imul(c + 1, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  }

  /** Sample a single cell of the canvas-anchored texture pattern, in O(1),
   *  without allocating a tiled grid. `(r, c)` are canvas-absolute
   *  coordinates, so sampling any subset of cells this way lines up exactly
   *  with sampling the whole canvas via `buildTiledTexture`/
   *  `buildCanvasTexture` below (both are now implemented in terms of this).
   *  This is what lets bucket-fill (one sample per BFS-visited cell) and the
   *  box-fill live preview/commit (one sample per cell in the dragged
   *  rectangle) avoid ever allocating a full framebufWidth x framebufHeight
   *  Pixel[][] just to read a handful of cells out of it -- previously both
   *  of those call sites rebuilt the entire canvas-sized grid on every
   *  dragged-over cell / every render while dragging. */
  sampleTexturePixel = (r: number, c: number): Pixel | null => {
    const texPreset = this.props.texturePresets[this.props.selectedTexturePresetIndex];
    if (!texPreset) return null;
    const opts = texPreset.options ?? [false, false, false, false, false, false];
    const vertical = opts[0];
    const invert = opts[1];
    const colorGrad = opts[2];
    const diagonal = opts[4];
    const isRandom = texPreset.random ?? false;

    const baseChars = texPreset.chars;
    const baseColors = texPreset.colors;
    const stripLen = baseChars.length || 1;

    let idx: number;
    if (isRandom) {
      idx = Math.floor(this.seededRandom(r, c) * stripLen);
    } else if (vertical) {
      idx = diagonal ? (r + c) % stripLen : r % stripLen;
    } else {
      idx = diagonal ? (c + r) % stripLen : c % stripLen;
    }
    // Equivalent to reversing baseChars/baseColors up front and indexing
    // with `idx` directly (what this used to do), but without allocating
    // and reversing a full copy of the preset's chars/colors arrays on
    // every single sampled cell.
    const arrIdx = invert ? (stripLen - 1 - idx) : idx;
    const code = baseChars[arrIdx] ?? 0x20;
    let color = baseColors[arrIdx] ?? 14;
    if (colorGrad) {
      color = idx % 2 === 0 ? this.currentPaintColor() : this.props.backgroundColor;
    }
    return { code, color };
  };

  /** Build a w×h tiled texture grid from the current preset, respecting
   *  options. Only used where a real materialized grid is actually needed;
   *  prefer `sampleTexturePixel` directly for hot per-cell paths (see
   *  above). */
  buildTiledTexture = (w: number, h: number): Pixel[][] | null => {
    const texPreset = this.props.texturePresets[this.props.selectedTexturePresetIndex];
    if (!texPreset) return null;
    const grid: Pixel[][] = [];
    for (let r = 0; r < h; r++) {
      const row: Pixel[] = [];
      for (let c = 0; c < w; c++) {
        row.push(this.sampleTexturePixel(r, c)!);
      }
      grid.push(row);
    }
    return grid;
  };

  /** Build the texture tiling across the WHOLE canvas, anchored at canvas-
   *  absolute (0,0). Bucket-fill, Replace-All, and Box-fill all sample from
   *  this single canvas-anchored pattern (instead of each re-tiling from its
   *  own local origin via buildTiledTexture(w, h)) so separate fill
   *  operations line up seamlessly as windows onto one continuous pattern,
   *  rather than each restarting the pattern's phase at its own corner. */
  buildCanvasTexture = (): Pixel[][] | null => {
    return this.buildTiledTexture(this.props.framebufWidth, this.props.framebufHeight);
  };

  /** Bucket-fill: BFS flood-fill over 4-connected neighbors matching the
   *  clicked cell's exact (code, color), mirroring SetFloodFill's algorithm,
   *  but each matched cell is painted from the canvas-anchored texture
   *  layer at that cell's own (row, col) instead of a single flat
   *  replacement code/color. */
  SetTextureFloodFill = (startLoc: Coord2) => {
    const { undoId } = this.props;
    if (!this.validCoordinates(startLoc)) {
      return;
    }

    // Compared via effectivePixelsEqual (not raw code/color) so VDC
    // ALTCHAR-only differences aren't treated as a match -- see
    // validFloodCoordinates/SetFloodFill above.
    const sourcePixel = this.props.framebuf[startLoc.row][startLoc.col];

    const visited = new Set<string>();
    const queue: Coord2[] = [startLoc];
    const startKey = `${startLoc.row},${startLoc.col}`;
    visited.add(startKey);

    const pixelChanges: { row: number; col: number; screencode: number; color: number; attrFlags?: number }[] = [];
    const vdcExtras = this.vdcAttrPayload();
    const forceFg = this.props.textureForceForeground;
    const fgColor = this.currentPaintColor();

    while (queue.length > 0) {
      const current = queue.pop()!;
      // Sampled lazily per visited cell instead of building a full
      // framebufWidth x framebufHeight texture grid up front -- this runs
      // once per cell entered while dragging (see dragMove's bucket-fill
      // branch above), so a prebuilt whole-canvas grid was reallocated on
      // every single dragged-over cell even though a flood-fill region is
      // typically a small fraction of the canvas.
      const texPix = this.sampleTexturePixel(current.row, current.col);
      if (texPix) {
        pixelChanges.push({
          row: current.row,
          col: current.col,
          screencode: texPix.code,
          color: forceFg ? fgColor : texPix.color,
          ...vdcExtras,
        });
      }

      const { row, col } = current;
      const neighbors: Coord2[] = [
        { col, row: row + 1 },
        { col, row: row - 1 },
        { col: col + 1, row },
        { col: col - 1, row },
      ];

      for (const neighbor of neighbors) {
        const key = `${neighbor.row},${neighbor.col}`;
        if (!visited.has(key) && this.validFloodCoordinates(neighbor, sourcePixel)) {
          visited.add(key);
          queue.push(neighbor);
        }
      }
    }

    if (pixelChanges.length > 0) {
      this.props.Framebuffer.setPixels(pixelChanges, undoId);
    }
  };

  /** Replace-All: scans the WHOLE canvas (no connectivity requirement) for
   *  every cell matching the clicked cell's exact (code, color), painting
   *  each from the canvas-anchored texture layer at that cell's own
   *  (row, col). */
  SetTextureReplaceAll = (startLoc: Coord2) => {
    const { undoId, framebuf, framebufWidth, framebufHeight } = this.props;
    if (!this.validCoordinates(startLoc)) {
      return;
    }

    // Compared via effectivePixelsEqual (not raw code/color) so VDC
    // ALTCHAR-only differences aren't treated as a match -- see
    // validFloodCoordinates/SetFloodFill above.
    const sourcePixel = framebuf[startLoc.row][startLoc.col];
    const effectiveOpts = this.effectivePixelOptions();

    const pixelChanges: { row: number; col: number; screencode: number; color: number; attrFlags?: number }[] = [];
    const vdcExtras = this.vdcAttrPayload();
    const forceFg = this.props.textureForceForeground;
    const fgColor = this.currentPaintColor();

    for (let row = 0; row < framebufHeight; row++) {
      for (let col = 0; col < framebufWidth; col++) {
        const cell = framebuf[row][col];
        if (!effectivePixelsEqual(cell, sourcePixel, effectiveOpts)) continue;
        // Sampled only for cells that actually match, instead of building a
        // full canvas-sized texture grid (most of which would never be read).
        const texPix = this.sampleTexturePixel(row, col);
        if (!texPix) continue;
        pixelChanges.push({
          row,
          col,
          screencode: texPix.code,
          color: forceFg ? fgColor : texPix.color,
          ...vdcExtras,
        });
      }
    }

    if (pixelChanges.length > 0) {
      this.props.Framebuffer.setPixels(pixelChanges, undoId);
    }
  };

  dragEnd = () => {
    const { selectedTool, brush, brushRegion } = this.props;
    if (selectedTool === Tool.Brush) {
      if (brush === null && brushRegion !== null) {
        this.props.Toolbar.captureBrush(this.props.framebuf, brushRegion);
      }
    }
    // Select mode: capture brush from existing canvas content (same as Brush tool)
    if (selectedTool === Tool.Textures && this.props.textureDrawMode === 'none' && brush === null && brushRegion !== null) {
      this.props.Toolbar.captureBrush(this.props.framebuf, brushRegion);
    }
    // FindReplace: capture brush selection
    if (selectedTool === Tool.FindReplace && brushRegion !== null) {
      this.props.Toolbar.captureBrush(this.props.framebuf, brushRegion);
    }
    // Box-fill mode: stamp the canvas-anchored texture pattern at the
    // dragged region (sampled directly at canvas-absolute coordinates, not
    // re-tiled from this rectangle's own local origin, so it lines up with
    // other fills -- and not via a full-canvas buildCanvasTexture() grid,
    // since only this rectangle's cells are ever read).
    if (selectedTool === Tool.Textures && this.props.textureDrawMode === 'box' && brush === null && brushRegion !== null) {
      const { min, max } = utils.sortRegion(brushRegion);
      const w = max.col - min.col + 1;
      const h = max.row - min.row + 1;
      if (w >= 1 && h >= 1) {
        const texPreset = this.props.texturePresets[this.props.selectedTexturePresetIndex];
        if (texPreset) {
          const forceFg = this.props.textureForceForeground;
          const fgColor = this.currentPaintColor();
          const tiledFb: Pixel[][] = [];
          for (let r = 0; r < h; r++) {
            const row: Pixel[] = [];
            for (let c = 0; c < w; c++) {
              const texPix = this.sampleTexturePixel(min.row + r, min.col + c) ?? { code: 0x20, color: 14 };
              row.push(forceFg ? { ...texPix, color: fgColor } : texPix);
            }
            tiledFb.push(row);
          }
          const texBrush = {
            framebuf: tiledFb,
            brushRegion: { min: { row: 0, col: 0 }, max: { row: h - 1, col: w - 1 } },
          };
          this.props.Framebuffer.setBrush(
            { col: min.col, row: min.row, brushType: BrushType.CharsColors, brush: texBrush, brushColor: this.currentPaintColor() },
            this.props.undoId
          );
        }
      }
      this.props.Toolbar.resetBrush();
    }
    // Circles tool: draw an ellipse fitted to the dragged bounding box
    if (selectedTool === Tool.Circles && brush === null && brushRegion !== null) {
      const { min, max } = utils.sortRegion(brushRegion);
      let circlePixels: LinePixel[];
      if (this.props.lineDrawChunkyMode) {
        circlePixels = drawChunkyCircle(min.col, min.row, max.col, max.row);
      } else {
        circlePixels = drawCharCircle(min.col, min.row, max.col, max.row, this.props.curScreencode);
      }
      const pixelChanges = circlePixels
        .filter(p => p.col >= 0 && p.col < this.props.framebufWidth && p.row >= 0 && p.row < this.props.framebufHeight)
        .map(p => ({ row: p.row, col: p.col, screencode: p.code, color: this.currentPaintColor(), ...this.vdcAttrPayload() }));
      if (pixelChanges.length > 0) {
        this.props.Framebuffer.setPixels(pixelChanges, this.props.undoId);
      }
      this.props.Toolbar.resetBrush();
    }
    // Box draw mode: generate box at the dragged region and paint it
    if (selectedTool === Tool.Boxes && this.props.boxDrawMode && brush === null && brushRegion !== null) {
      const { min, max } = utils.sortRegion(brushRegion);
      const w = max.col - min.col + 1;
      const h = max.row - min.row + 1;
      if (w >= 2 && h >= 2) {
        const preset = this.props.boxPresets[this.props.selectedBoxPresetIndex];
        if (preset) {
          let px = generateBox(preset, w, h);
          if (this.props.boxForceForeground) {
            px = px.map(row => row.map(p => ({ ...p, color: this.currentPaintColor() })));
          }
          const boxBrush = {
            framebuf: px,
            brushRegion: { min: { row: 0, col: 0 }, max: { row: h - 1, col: w - 1 } },
          };
          this.props.Framebuffer.setBrush(
            { col: min.col, row: min.row, brushType: BrushType.CharsColors, brush: boxBrush, brushColor: this.currentPaintColor() },
            this.props.undoId
          );
        }
      }
      this.props.Toolbar.resetBrush();
    }
    // Fade box-select mode: apply fade to every cell in the region
    if (selectedTool === Tool.FadeLighten && this.props.fadeDrawMode && brush === null && brushRegion !== null) {
      const { min, max } = utils.sortRegion(brushRegion);
      this.fadeTouchedCells.clear();
      for (let r = min.row; r <= max.row; r++) {
        for (let c = min.col; c <= max.col; c++) {
          this.fadeApply({ row: r, col: c });
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
      if (this.isTedCharset()) {
        this.props.Toolbar.setColor(pix.color & 0x7f);
        this.props.Toolbar.setC16PaintBlink((pix.color & 0x80) !== 0);
      } else {
        this.props.Toolbar.setColor(pix.color);
      }
    }
  };

  rightClick = (charPos: Coord2) => {
    // Alt+Right click = RVS mode on pen tools, handled by dragStart
    if (this.props.altKey && (
      this.props.selectedTool === Tool.Draw ||
      this.props.selectedTool === Tool.Colorize ||
      this.props.selectedTool === Tool.CharDraw
    )) {
      return;
    }
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
      selectedTool === Tool.CharDraw ||
      selectedTool === Tool.RvsPen
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
    sourcePixel: Pixel
  ) => {
    return (
      this.validCoordinates(coords) &&
      effectivePixelsEqual(this.props.framebuf[coords.row][coords.col], sourcePixel, this.effectivePixelOptions())
    );
  };

  SetFloodFill = (startLoc: Coord2, isRightClick: boolean) => {
    const { undoId } = this.props;

    if (!this.validCoordinates(startLoc)) {
      return;
    }

    //Get the colour and char at the initial click location. Compared via
    //effectivePixelsEqual below (not raw code/color) so VDC ALTCHAR-only
    //differences aren't treated as a match -- two cells with the same code
    //and color but a different ALTCHAR bank render completely differently.
    const sourcePixel = this.props.framebuf[startLoc.row][startLoc.col];
    const sourceCode = sourcePixel.code;
    const sourceColor = sourcePixel.color;

    const destColor = this.currentPaintColor();
    let destCode = this.props.curScreencode;

    if (isRightClick) {
      destCode = this.props.ctrlKey ? this.transparentScreencode() : 32;
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

    const pixelChanges: { row: number; col: number; screencode: number; color: number; attrFlags?: number }[] = [];
    const vdcExtras = this.vdcAttrPayload();

    while (queue.length > 0) {
      const current = queue.pop()!;
      pixelChanges.push({
        row: current.row,
        col: current.col,
        color: destColor,
        screencode: destCode,
        ...vdcExtras,
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
        if (!visited.has(key) && this.validFloodCoordinates(neighbor, sourcePixel)) {
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

  /** Walk a cell-resolution line from `from` to `to` (Bresenham) and yield
   *  a LinePixel for each cell with code+colour set to what the currently-
   *  selected paint tool would commit at that cell.  Drives the Link-Line
   *  preview overlay so the user sees the tool's actual outcome (Colorize
   *  re-colours existing chars, CharDraw preserves cell colours, RvsPen
   *  XORs bits, FadeLighten previews the faded char, etc.). */
  buildLinkLinePreviewPixels = (from: Coord2, to: Coord2): LinePixel[] => {
    const {
      selectedTool, framebuf, framebufWidth, framebufHeight,
      curScreencode,
    } = this.props;
    const paintColor = this.currentPaintColor();
    const isVdc = this.props.charset === 'c128vdc';
    const armedReverse = isVdc && (this.props.vdcPaintFlags & VDC_ATTR_REVERSE) !== 0;
    const armedUnderline = isVdc && (this.props.vdcPaintFlags & VDC_ATTR_UNDERLINE) !== 0;
    const pixels: LinePixel[] = [];
    let cx = from.col, cy = from.row;
    const dx = Math.abs(to.col - from.col);
    const dy = Math.abs(to.row - from.row);
    const stepX = from.col < to.col ? 1 : from.col > to.col ? -1 : 0;
    const stepY = from.row < to.row ? 1 : from.row > to.row ? -1 : 0;
    let err = dx - dy;
    // Cap iterations to avoid runaway in pathological cases.
    const maxSteps = framebufWidth * framebufHeight + 1;
    for (let step = 0; step < maxSteps; step++) {
      const inBounds = cx >= 0 && cx < framebufWidth && cy >= 0 && cy < framebufHeight;
      if (inBounds) {
        const cell = framebuf[cy][cx];
        let code = curScreencode;
        let color = paintColor;
        let reverse = false;
        let underline = false;
        if (selectedTool === Tool.Draw) {
          code = curScreencode;
          color = paintColor;
          // Draw applies the armed VDC paint flags on every commit (see
          // applyVdcSet in redux/editor.ts).
          reverse = armedReverse;
          underline = armedUnderline;
        } else if (selectedTool === Tool.Colorize) {
          // Colorize only changes colour, so preview the existing char --
          // biased via effectiveGlyph on VDC so an ALTCHAR-banked glyph
          // previews as itself instead of silently falling back to the
          // lower bank's glyph at the same raw code.
          code = isVdc ? effectiveGlyph(cell) : cell.code;
          color = paintColor;
          // Colorize also applies the armed VDC paint flags on every commit.
          reverse = armedReverse;
          underline = armedUnderline;
        } else if (selectedTool === Tool.CharDraw) {
          // CharDraw only changes the char, so keep the existing colour.
          code = curScreencode;
          color = cell.color;
          // CharDraw also applies the armed VDC paint flags on every commit.
          reverse = armedReverse;
          underline = armedUnderline;
        } else if (selectedTool === Tool.RvsPen) {
          if (isVdc) {
            // VDC: RvsPen toggles only the REVERSE attribute bit, preserving
            // the glyph (including ALTCHAR bank) and colour -- preview the
            // resulting REVERSE state via the overlay's reverse flag instead
            // of XORing the raw code, which doesn't reflect VDC hardware
            // semantics at all (see setRvsChar).
            code = effectiveGlyph(cell);
            color = resolveEffectivePixel(cell, this.effectivePixelOptions()).color;
            reverse = (effectiveAttr(cell) & VDC_ATTR_REVERSE) === 0;
            underline = (effectiveAttr(cell) & VDC_ATTR_UNDERLINE) !== 0;
          } else {
            // Non-VDC fonts: RVS toggles the 0x80 bit (chars 0–255 only)
            // and preserves colour -- this is a real glyph swap (PETSCII
            // reverse character), not a hardware attribute, for these
            // charsets.
            code = cell.code < 256 ? (cell.code ^ 0x80) : cell.code;
            color = cell.color;
          }
        } else if (selectedTool === Tool.FadeLighten && !this.props.fadeDrawMode) {
          // Fade tool: show the char the next fade step would produce.
          const direction = this.props.fadeMode === 'lighten' ? 'lighter' : 'darker';
          const caseMode = caseModeFromCharset(this.props.charset);
          const sourceCode = this.props.charset === 'c128vdc'
            ? effectiveGlyph(cell)
            : cell.code;
          code = getNextByWeightFiltered(
            this.props.font, sourceCode, direction, this.props.fadeStrength,
            this.props.fadeSource as any, caseMode,
            this.props.fadeLinearCounter,
            this.props.fadeStepStart, this.props.fadeStepCount,
            this.props.fadeStepChoice === 'random' ? 'pingpong' : this.props.fadeStepChoice,
            this.props.fadeStepSort === 'random' ? 'default' : this.props.fadeStepSort,
            this.props.fadeCustomScreencodes,
          );
          color = cell.color;
        }
        pixels.push({ col: cx, row: cy, code, color, reverse, underline });
      }
      if (cx === to.col && cy === to.row) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += stepX; }
      if (e2 < dx)  { err += dx; cy += stepY; }
    }
    return pixels;
  };

  /** Paint a straight line between two cells using the currently-selected
   *  paint tool's per-cell behavior.  Used by the Link-Line shift-drawing
   *  mode so shift+click → shift+click draws a tool-aware line segment.
   *
   *  Supports Draw/Colorize/CharDraw (via setChar / setBlankChar / setTransparentChar
   *  for left / shift+right / shift+ctrl+right respectively), RvsPen (via
   *  setRvsChar for both buttons), and FadeLighten in non-drawMode (via
   *  fadeApply; right button inverts the fade direction like normal drag).
   *
   *  `mode` controls the left/right-click behavior: 'paint' paints with the
   *  current char/color, 'blank' writes a space + current color, and
   *  'transparent' writes the active transparency screencode + current color. */
  paintLineForCurrentTool = (from: Coord2, to: Coord2, mode: 'paint' | 'blank' | 'transparent' = 'paint') => {
    const { selectedTool } = this.props;
    if (selectedTool === Tool.Draw || selectedTool === Tool.Colorize || selectedTool === Tool.CharDraw) {
      const painter =
        mode === 'transparent' ? this.setTransparentChar :
        mode === 'blank'       ? this.setBlankChar :
                                 this.setChar;
      utils.drawLine(
        (x, y) => painter({ row: y, col: x }),
        from.col, from.row, to.col, to.row
      );
    } else if (selectedTool === Tool.RvsPen) {
      // RvsPen has no "erase" behavior; both buttons just toggle 0x80.
      this.rvsTouchedCells.clear();
      utils.drawLine(
        (x, y) => this.setRvsChar({ row: y, col: x }),
        from.col, from.row, to.col, to.row
      );
    } else if (selectedTool === Tool.FadeLighten && !this.props.fadeDrawMode) {
      // fadeApply reads this.rightButton to flip the fade direction, so mirror
      // the caller's right-click intent onto the instance var for the duration
      // of the line paint, then restore it.
      this.fadeTouchedCells.clear();
      const prevRightButton = this.rightButton;
      this.rightButton = (mode !== 'paint');
      try {
        utils.drawLine(
          (x, y) => this.fadeApply({ row: y, col: x }),
          from.col, from.row, to.col, to.row
        );
      } finally {
        this.rightButton = prevRightButton;
      }
    }
  };

  // ---- Line Draw tool click handler ----
  getSubPixel(e: any): { subCol: number; subRow: number } {
    if (!this.ref.current) return { subCol: 0, subRow: 0 };
    const bbox = this.ref.current.getBoundingClientRect();
    const scale = this.props.framebufUIState.canvasTransform.v[0][0];
    const pixelStretchX = this.props.isVic20 ? 2 : this.props.isVDC80 ? 0.5 : 1;
    const contentX = e.clientX - bbox.left + this.ref.current.scrollLeft;
    const contentY = e.clientY - bbox.top + this.ref.current.scrollTop;
    let px = contentX / (scale * pixelStretchX);
    let py = contentY / scale;
    if (this.props.borderOn) { px -= 32; py -= 32; }
    const col = Math.floor(px / 8);
    const row = Math.floor(py / 8);
    const fracX = (px / 8) - col;
    const fracY = (py / 8) - row;
    return { subCol: fracX >= 0.5 ? 1 : 0, subRow: fracY >= 0.5 ? 1 : 0 };
  }

  lineDrawClick = (coord: Coord2, e: any) => {
    if (!this.props.lineDrawActive) {
      // First click: set start point
      const sub = this.getSubPixel(e);
      this.lineDrawSubPixels = [sub];
      this.props.Toolbar.setLineDrawPoints([coord]);
      this.props.Toolbar.setLineDrawActive(true);
    } else {
      // Subsequent click: draw line from last point to current
      const points = this.props.lineDrawPoints;
      const lastPoint = points[points.length - 1];
      const lastSub = this.lineDrawSubPixels[this.lineDrawSubPixels.length - 1] || { subCol: 0, subRow: 0 };
      const curSub = this.getSubPixel(e);

      let linePixels: LinePixel[];
      if (this.props.lineDrawChunkyMode) {
        linePixels = drawChunkyLine(
          lastPoint.col, lastPoint.row, coord.col, coord.row,
          lastSub.subCol, lastSub.subRow, curSub.subCol, curSub.subRow
        );
      } else {
        linePixels = drawCharLine(
          lastPoint.col, lastPoint.row, coord.col, coord.row,
          this.props.curScreencode
        );
      }

      const pixelChanges = linePixels
        .filter(p => p.col >= 0 && p.col < this.props.framebufWidth && p.row >= 0 && p.row < this.props.framebufHeight)
        .map(p => ({ row: p.row, col: p.col, screencode: p.code, color: this.currentPaintColor(), ...this.vdcAttrPayload() }));
      if (pixelChanges.length > 0) {
        this.props.Framebuffer.setPixels(pixelChanges, this.props.undoId);
        this.props.Toolbar.incUndoId();
      }
      this.lineDrawSubPixels.push(curSub);
      this.props.Toolbar.setLineDrawPoints([...points, coord]);
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
  // Link-Line shift-drawing mode: anchor point for the current shift-held
  // chained-line session (null when inactive). Cleared on SHIFT release.
  private linkLineAnchor: Coord2 | null = null;
  private rightButton = false;
  private middleButton = false;

  currentCharPos(e: any): { charPos: Coord2 } {
    if (!this.ref.current) {
      throw new Error("impossible?");
    }

    const bbox = this.ref.current.getBoundingClientRect();
    const scale = this.props.framebufUIState.canvasTransform.v[0][0];
    const pixelStretchX = this.props.isVic20 ? 2 : this.props.isVDC80 ? 0.5 : 1;
    // Mouse position relative to the scrollable container
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
    if (this.isGuidePanShortcutActive()) {
      this.handleGuideLayerPanPointerDown(e);
      return;
    }
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
    // Alt+Right click on pen tools = RVS mode, let it fall through
    const isPenTool = this.props.selectedTool === Tool.Draw ||
      this.props.selectedTool === Tool.Colorize ||
      this.props.selectedTool === Tool.CharDraw;
    if (this.props.altKey && this.props.selectedTool !== Tool.Brush) {
      if (!(e.button === 2 && isPenTool)) {
        this.dragging = false;
        this.altClick(charPos);
        return;
      }
    }

    if (this.props.ctrlKey
      && this.props.selectedTool !== Tool.Brush
      && this.props.selectedTool !== Tool.FadeLighten
      && this.props.selectedTool !== Tool.Lines
      && this.props.selectedTool !== Tool.LinesDraw
      && this.props.selectedTool !== Tool.Boxes
      && this.props.selectedTool !== Tool.Circles
      && this.props.selectedTool !== Tool.Textures
      && e.button !== 2) {
      this.dragging = false;
      this.ctrlClick(charPos);
      return;
    }


    if (e.button === 1) {
      // Middle button: pan the canvas (like spacebar + drag)
      this.handlePanZoomPointerDown(e);
      return;
    }

    // ---- Link-Line shift drawing mode ----
    // When the user has opted in to the Link-Line mode in Preferences, SHIFT
    // repurposes the tool into a LineDraw-style click session: first click
    // places an anchor, subsequent shift+clicks paint a straight line from
    // the anchor to the new click using the tool's normal drawing behavior
    // (setChar / setRvsChar / fadeApply).  Right-click uses blank (or
    // transparent with CTRL) instead of the current char for Draw/Colorize/
    // CharDraw.  We short-circuit the regular drag logic so no dragging
    // occurs during a link-line session.
    const isLeftBtn = e.button === 0;
    const isRightBtn = e.button === 2;
    // Allow CTRL only with right-click (transparent line); left-click with
    // CTRL still falls through to the existing ctrl-click color picker.
    const ctrlOK = !this.props.ctrlKey || isRightBtn;
    const linkLineEligible = this.props.shiftKey
      && this.props.shiftDrawingMode === 'linkLine'
      && !this.props.altKey
      && ctrlOK
      && (isLeftBtn || isRightBtn)
      && this.isLinkLineTool(this.props.selectedTool, this.props.fadeDrawMode);
    if (linkLineEligible) {
      if (this.linkLineAnchor === null) {
        // First shift+click (left OR right): just set the anchor, no drawing
        // yet.  The preview overlay will start tracking the cursor on the
        // next move.
        this.linkLineAnchor = charPos;
      } else {
        const mode: 'paint' | 'blank' | 'transparent' = isRightBtn
          ? (this.props.ctrlKey ? 'transparent' : 'blank')
          : 'paint';
        this.paintLineForCurrentTool(this.linkLineAnchor, charPos, mode);
        this.linkLineAnchor = charPos;
        this.props.Toolbar.incUndoId();
      }
      this.dragging = false;
      this.forceUpdate();
      return;
    }

    // Line draw tool: click-based, no dragging
    if (this.props.selectedTool === Tool.LinesDraw) {
      if (e.button === 0) {
        this.lineDrawClick(charPos, e);
      } else if (e.button === 2 && this.props.lineDrawActive) {
        // Right-click cancels line drawing session
        this.props.Toolbar.setLineDrawActive(false);
        this.props.Toolbar.setLineDrawPoints([]);
        this.lineDrawSubPixels = [];
      }
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
    if (this.guidePanDragging) {
      this.handleGuideLayerPanPointerUp(e);
      return;
    }
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
    if (this.guidePanDragging || this.isGuidePanShortcutActive()) {
      this.handleGuideLayerPanPointerMove(e);
      return;
    }
    if (
      this.props.selectedTool === Tool.PanZoom ||
      (this.props.selectedTool !== Tool.Text && this.props.spacebarKey)
    ) {
      this.handlePanZoomPointerMove(e);
      return;
    }

    const { charPos } = this.currentCharPos(e);
    this.setCharPos(true, charPos);

    // Track sub-pixel for chunky line preview
    if (this.props.selectedTool === Tool.LinesDraw && this.props.lineDrawActive) {
      const sub = this.getSubPixel(e);
      this.lineDrawHoverSubCol = sub.subCol;
      this.lineDrawHoverSubRow = sub.subRow;
    }

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
  private guidePanDragging = false;
  private guidePanStart: { startX: number; startY: number; origX: number; origY: number } | null = null;
  // Accumulated wheel delta for zoom stepping.  Small deltas (e.g. from
  // trackpad pinch or high-resolution scroll wheels) are collected until they
  // cross one full character-step threshold.
  private zoomDeltaAccum = 0;
  private guideScaleDeltaAccum = 0;

  private isGuidePanShortcutActive(): boolean {
    const gl = this.props.guideLayer;
    return this.props.selectedTool !== Tool.Text
      && this.props.rawCtrlKey
      && this.props.spacebarKey
      && this.props.guideLayerVisible
      && !!gl?.enabled
      && !!gl?.imageData;
  }

  handleGuideLayerPanPointerDown(e: any) {
    const gl = this.props.guideLayer;
    if (!gl) return;
    this.guidePanDragging = true;
    this.guidePanStart = { startX: e.clientX, startY: e.clientY, origX: gl.x, origY: gl.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  // guideLayer.x/y are in pre-zoom canvas (character-grid) coordinates, but
  // the pointer deltas below are raw screen pixels. Divide by the current
  // zoom scale (and pixelStretchX for the X axis) before applying, matching
  // the coordinate transform used elsewhere (see getSubPixel/currentCharPos).
  // Without this, panning the guide image at any zoom level other than 1x
  // moves it faster or slower than the cursor.
  private guidePanScale(): { scaleX: number; scaleY: number } {
    const scale = this.props.framebufUIState.canvasTransform.v[0][0] || 1;
    const pixelStretchX = this.props.isVic20 ? 2 : this.props.isVDC80 ? 0.5 : 1;
    return { scaleX: scale * pixelStretchX, scaleY: scale };
  }

  handleGuideLayerPanPointerUp(e: any) {
    const start = this.guidePanStart;
    const gl = this.props.guideLayer;
    const { scaleX, scaleY } = this.guidePanScale();
    const dx = start ? Math.round((e.clientX - start.startX) / scaleX) : 0;
    const dy = start ? Math.round((e.clientY - start.startY) / scaleY) : 0;
    this.props.Toolbar.setGuideLayerDragOffset(null);
    if (start && gl) {
      this.props.Framebuffer.setGuideLayer({
        ...gl,
        x: start.origX + dx,
        y: start.origY + dy,
      });
    }
    this.guidePanDragging = false;
    this.guidePanStart = null;
  }

  handleGuideLayerPanPointerMove(e: any) {
    if (!this.guidePanDragging || !this.guidePanStart) return;
    const { scaleX, scaleY } = this.guidePanScale();
    const dx = Math.round((e.clientX - this.guidePanStart.startX) / scaleX);
    const dy = Math.round((e.clientY - this.guidePanStart.startY) / scaleY);
    this.props.Toolbar.setGuideLayerDragOffset({ dx, dy });
  }

  handleGuideLayerWheelScale(e: globalThis.WheelEvent) {
    const gl = this.props.guideLayer;
    if (!gl || !gl.enabled || !gl.imageData) return;
    if (e.deltaY === 0) return;

    e.preventDefault();

    const BASE_THRESHOLD = 80;
    const isPinch = e.ctrlKey && !this.props.ctrlKey;
    const sensitivity = isPinch
      ? this.props.pinchZoomSensitivity
      : this.props.scrollZoomSensitivity;
    const effective = isPinch ? sensitivity + 2 : sensitivity;
    const multiplier = effective / 5;
    const SCALE_DELTA_THRESHOLD = BASE_THRESHOLD / multiplier;
    this.guideScaleDeltaAccum += e.deltaY;

    const currentPercent = Math.round(gl.scale * 100);
    let nextPercent = currentPercent;

    while (this.guideScaleDeltaAccum <= -SCALE_DELTA_THRESHOLD) {
      nextPercent = Math.min(400, nextPercent + 1);
      this.guideScaleDeltaAccum += SCALE_DELTA_THRESHOLD;
    }
    while (this.guideScaleDeltaAccum >= SCALE_DELTA_THRESHOLD) {
      nextPercent = Math.max(1, nextPercent - 1);
      this.guideScaleDeltaAccum -= SCALE_DELTA_THRESHOLD;
    }

    if (nextPercent !== currentPercent) {
      this.props.Framebuffer.setGuideLayer({
        ...gl,
        scale: nextPercent / 100,
      });
    }
  }

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
    if (this.guidePanDragging || this.isGuidePanShortcutActive()) {
      this.handleGuideLayerWheelScale(e);
      return;
    }
    this.guideScaleDeltaAccum = 0;
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
    const pixelStretchX = this.props.isVic20 ? 2 : this.props.isVDC80 ? 0.5 : 1;

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
    // Draw/Colorize/CharDraw all apply the toolbar's armed VDC paint-attribute
    // flags on every paint (see applyVdcSet in redux/editor.ts, which ORs
    // vdcPaintFlags onto the attr byte regardless of which of screencode/
    // color was provided) -- so the default hover preview should reflect
    // those armed REVERSE/UNDERLINE flags too, not just the plain glyph.
    // Always false outside VDC (vdcPaintFlags is forced to 0 for non-VDC
    // frames upstream in FramebufferCont's mapStateToProps).
    let reverseHighlight = (this.props.vdcPaintFlags & VDC_ATTR_REVERSE) !== 0;
    let underlineHighlight = (this.props.vdcPaintFlags & VDC_ATTR_UNDERLINE) !== 0;

    // Fade/Lighten hover preview: compute the replacement char for the cell
    // under the cursor and show it in the CharPreviewOverlay.
    // When ctrl is held, it's color-only mode — hide the character preview.
    if (selectedTool === Tool.FadeLighten && this.state.isActive && !this.props.fadeDrawMode) {
      if (this.props.ctrlKey) {
        highlightCharPos = false;
      } else {
        const cp = this.state.charPos;
        if (cp.row >= 0 && cp.row < this.props.framebufHeight &&
            cp.col >= 0 && cp.col < this.props.framebufWidth) {
          const cell = this.props.framebuf[cp.row][cp.col];
          const sourceCode = this.props.charset === 'c128vdc'
            ? effectiveGlyph(cell)
            : cell.code;
          const direction = this.props.fadeMode === 'lighten' ? 'lighter' : 'darker';
          const caseMode = caseModeFromCharset(this.props.charset);
          screencodeHighlight = getNextByWeightFiltered(
            this.props.font, sourceCode, direction, this.props.fadeStrength,
            this.props.fadeSource as any, caseMode,
            this.props.fadeLinearCounter,
            this.props.fadeStepStart, this.props.fadeStepCount,
            this.props.fadeStepChoice === 'random' ? 'pingpong' : this.props.fadeStepChoice,
            this.props.fadeStepSort === 'random' ? 'default' : this.props.fadeStepSort,
            this.props.fadeCustomScreencodes,
          );
          colorHighlight = cell.color;
        }
      }
    }

    if (this.state.isActive) {
      // Fade box-select mode: live preview of faded region
      if (selectedTool === Tool.FadeLighten && this.props.fadeDrawMode && this.props.brush === null) {
        highlightCharPos = false;
        if (this.props.brushRegion !== null) {
          const sorted = utils.sortRegion(this.props.brushRegion);
          // Clamp to framebuffer bounds
          const cMin = { row: Math.max(0, sorted.min.row), col: Math.max(0, sorted.min.col) };
          const cMax = { row: Math.min(this.props.framebufHeight - 1, sorted.max.row), col: Math.min(this.props.framebufWidth - 1, sorted.max.col) };
          const bw = cMax.col - cMin.col + 1;
          const bh = cMax.row - cMin.row + 1;
          if (bw >= 1 && bh >= 1) {
            const direction = this.props.fadeMode === 'lighten' ? 'lighter' : 'darker';
            const cm = caseModeFromCharset(this.props.charset);
            const previewFb: Pixel[][] = [];
            for (let r = 0; r < bh; r++) {
              const row: Pixel[] = [];
              for (let c = 0; c < bw; c++) {
                const fr = cMin.row + r, fc = cMin.col + c;
                if (fr >= 0 && fr < this.props.framebufHeight && fc >= 0 && fc < this.props.framebufWidth) {
                  const cell = this.props.framebuf[fr][fc];
                  const sourceCode = this.props.charset === 'c128vdc'
                    ? effectiveGlyph(cell)
                    : cell.code;
                  const nc = getNextByWeightFiltered(
                    this.props.font, sourceCode, direction, this.props.fadeStrength,
                    this.props.fadeSource as any, cm, 0,
                    this.props.fadeStepStart, this.props.fadeStepCount,
                    this.props.fadeStepChoice === 'random' ? 'pingpong' : this.props.fadeStepChoice,
                    this.props.fadeStepSort === 'random' ? 'default' : this.props.fadeStepSort,
                    this.props.fadeCustomScreencodes,
                  );
                  row.push({ code: nc, color: cell.color });
                } else {
                  row.push({ code: 0x20, color: 0 });
                }
              }
              previewFb.push(row);
            }
            const liveBrush = {
              framebuf: previewFb,
              brushRegion: { min: { row: 0, col: 0 }, max: { row: bh - 1, col: bw - 1 } },
            };
            overlays = (
              <BrushOverlay
                charPos={{ row: cMin.row + Math.floor(bh / 2), col: cMin.col + Math.floor(bw / 2) }}
                framebufWidth={this.props.framebufWidth}
                framebufHeight={this.props.framebufHeight}
                backgroundColor={backg}
                colorPalette={this.props.colorPalette}
                font={this.props.font}
                brush={liveBrush}
                borderOn={this.props.borderOn}
                isVdc={this.props.charset === 'c128vdc'}
              />
            );
          }
        } else {
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
      // Circles tool: show live ellipse preview or crosshair
      } else if (selectedTool === Tool.Circles && this.props.brush === null) {
        highlightCharPos = false;
        screencodeHighlight = undefined;
        colorHighlight = undefined;
        if (this.props.brushRegion !== null) {
          const { min, max } = utils.sortRegion(this.props.brushRegion);
          let previewPixels: LinePixel[];
          if (this.props.lineDrawChunkyMode) {
            previewPixels = drawChunkyCircle(min.col, min.row, max.col, max.row);
          } else {
            previewPixels = drawCharCircle(min.col, min.row, max.col, max.row, this.props.curScreencode);
          }
          overlays = (
            <LinePreviewOverlay
              pixels={previewPixels}
              font={this.props.font}
              colorPalette={this.props.colorPalette}
              textColor={this.currentPaintColor()}
              framebufWidth={this.props.framebufWidth}
              framebufHeight={this.props.framebufHeight}
              borderOn={this.props.borderOn}
            />
          );
        } else {
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
      // Box draw mode with no brush: show live box preview or crosshair
      } else if (selectedTool === Tool.Boxes && this.props.boxDrawMode && this.props.brush === null) {
        highlightCharPos = false;
        if (this.props.brushRegion !== null) {
          // Generate a live preview of the box at the current drag region
          const { min, max } = utils.sortRegion(this.props.brushRegion);
          const bw = max.col - min.col + 1;
          const bh = max.row - min.row + 1;
          const preset = this.props.boxPresets[this.props.selectedBoxPresetIndex];
          if (preset && bw >= 2 && bh >= 2) {
            let px = generateBox(preset, bw, bh);
            if (this.props.boxForceForeground) {
              px = px.map(row => row.map(p => ({ ...p, color: this.currentPaintColor() })));
            }
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
                isVdc={this.props.charset === 'c128vdc'}
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
      } else if (selectedTool === Tool.Textures && this.props.textureDrawMode === 'box' && this.props.brush === null) {
        highlightCharPos = false;
        if (this.props.brushRegion !== null) {
          const { min, max } = utils.sortRegion(this.props.brushRegion);
          const bw = max.col - min.col + 1;
          const bh = max.row - min.row + 1;
          if (bw >= 1 && bh >= 1) {
            // Sample from the canvas-anchored texture layer directly at
            // canvas-absolute coordinates (not a fresh local-origin tiling,
            // and not via a full-canvas buildCanvasTexture() grid rebuilt on
            // every render while dragging) so this live preview matches
            // exactly what dragEnd will commit, cheaply enough to recompute
            // on every mousemove.
            const texPresetForPreview = this.props.texturePresets[this.props.selectedTexturePresetIndex];
            let px: Pixel[][] | null = texPresetForPreview ? [] : null;
            if (texPresetForPreview) {
              for (let r = 0; r < bh; r++) {
                const row: Pixel[] = [];
                for (let c = 0; c < bw; c++) {
                  row.push(this.sampleTexturePixel(min.row + r, min.col + c) ?? { code: 0x20, color: 14 });
                }
                px!.push(row);
              }
            }
            if (px) {
              if (this.props.textureForceForeground) {
                px = px.map(row => row.map(p => ({ ...p, color: this.currentPaintColor() })));
              }
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
                  isVdc={this.props.charset === 'c128vdc'}
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
      } else if (selectedTool === Tool.FindReplace || selectedTool === Tool.Brush || (selectedTool === Tool.Textures && this.props.textureDrawMode === 'none') || ((selectedTool === Tool.Lines || selectedTool === Tool.Boxes || selectedTool === Tool.Textures) && this.props.brush !== null)) {
        highlightCharPos = false;
        if (selectedTool === Tool.FindReplace && this.props.brushRegion !== null) {
          overlays = (
            <BrushSelectOverlay
              charPos={this.state.charPos}
              framebufWidth={this.props.framebufWidth}
              framebufHeight={this.props.framebufHeight}
              brushRegion={this.props.brushRegion}
              borderOn={this.props.borderOn}
            />
          );
        } else if (this.props.brush !== null) {
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
              isVdc={this.props.charset === 'c128vdc'}
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
        selectedTool === Tool.FloodFill ||
        // Bucket-fill and Replace-All are click-triggered (no drag region to
        // preview), so just show the same simple crosshair Flood Fill uses.
        (selectedTool === Tool.Textures && (this.props.textureDrawMode === 'bucket' || this.props.textureDrawMode === 'replace'))
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
      } else if (selectedTool === Tool.RvsPen) {
        overlays = (
          <CharPosOverlay
            framebufWidth={this.props.framebufWidth}
            framebufHeight={this.props.framebufHeight}
            charPos={this.state.charPos}
            borderOn={this.props.borderOn}
            opacity={1.0}
          />
        );
        const cp = this.state.charPos;
        if (cp.row >= 0 && cp.row < this.props.framebufHeight &&
            cp.col >= 0 && cp.col < this.props.framebufWidth) {
          const cell = this.props.framebuf[cp.row][cp.col];
          if (this.props.charset === 'c128vdc') {
            // VDC: RvsPen toggles only the REVERSE attribute bit (see
            // setRvsChar) -- preview the resulting state via reverseHighlight
            // instead of XORing the raw code, which doesn't correspond to
            // actual VDC hardware behavior at all (that's PETSCII's
            // software reverse-char swap, not a hardware attribute toggle).
            screencodeHighlight = effectiveGlyph(cell);
            colorHighlight = resolveEffectivePixel(cell, this.effectivePixelOptions()).color;
            reverseHighlight = (effectiveAttr(cell) & VDC_ATTR_REVERSE) === 0;
            underlineHighlight = (effectiveAttr(cell) & VDC_ATTR_UNDERLINE) !== 0;
          } else {
            // Non-VDC fonts: show the XOR'd screencode preview, keeping the
            // cell's existing color -- this is the real PETSCII glyph swap.
            screencodeHighlight = cell.code ^ 0x80;
            colorHighlight = cell.color;
          }
        } else {
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
      } else if (selectedTool === Tool.LinesDraw) {
        highlightCharPos = false;
        screencodeHighlight = undefined;
        colorHighlight = undefined;
        // Compute preview line from last point to hover position
        const points = this.props.lineDrawPoints;
        if (this.props.lineDrawActive && points.length > 0) {
          const last = points[points.length - 1];
          const lastSub = this.lineDrawSubPixels[this.lineDrawSubPixels.length - 1] || { subCol: 0, subRow: 0 };
          const hoverPos = this.state.charPos;
          let previewPixels: LinePixel[];
          if (this.props.lineDrawChunkyMode) {
            previewPixels = drawChunkyLine(
              last.col, last.row, hoverPos.col, hoverPos.row,
              lastSub.subCol, lastSub.subRow,
              this.lineDrawHoverSubCol, this.lineDrawHoverSubRow
            );
          } else {
            previewPixels = drawCharLine(
              last.col, last.row, hoverPos.col, hoverPos.row,
              this.props.curScreencode
            );
          }
          overlays = (
            <LinePreviewOverlay
              pixels={previewPixels}
              font={this.props.font}
              colorPalette={this.props.colorPalette}
              textColor={this.currentPaintColor()}
              framebufWidth={this.props.framebufWidth}
              framebufHeight={this.props.framebufHeight}
              borderOn={this.props.borderOn}
            />
          );
        } else {
          // Not yet active: show crosshair at hover
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
      } else {
        highlightCharPos = false;
        screencodeHighlight = undefined;
        colorHighlight = undefined;
      }
    }

    // ---- Link-Line shift mode preview ----
    // When the user has a link-line anchor set (shift was clicked on a paint
    // tool in Link Line mode), render a dashed line preview from the anchor
    // to the current hover position and hide the normal char preview so the
    // user sees exactly what the next shift+click will commit.
    const linkLineActive = this.linkLineAnchor !== null
      && this.props.shiftKey
      && this.props.shiftDrawingMode === 'linkLine'
      && this.isLinkLineTool(selectedTool, this.props.fadeDrawMode);
    if (linkLineActive && this.linkLineAnchor !== null) {
      const anchor = this.linkLineAnchor;
      const hover = this.state.charPos;
      // Tool-aware preview: each cell shows the code+colour the active tool
      // would commit there (see buildLinkLinePreviewPixels).
      const previewPixels = this.buildLinkLinePreviewPixels(anchor, hover);
      overlays = (
        <LinePreviewOverlay
          pixels={previewPixels}
          font={this.props.font}
          colorPalette={this.props.colorPalette}
          textColor={this.currentPaintColor()}
          framebufWidth={this.props.framebufWidth}
          framebufHeight={this.props.framebufHeight}
          borderOn={this.props.borderOn}
        />
      );
      highlightCharPos = false;
      screencodeHighlight = undefined;
      colorHighlight = undefined;
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
        // Fallback (Colorize/CharDraw leave screencodeHighlight/colorHighlight
        // undefined to mean "show the cell's own value") resolves via the
        // shared effective-pixel helper, not the raw fields -- a VDC cell's
        // glyph needs the ALTCHAR bank bias and its colour may live in the
        // attr byte instead of the legacy `.color` field.
        const fbEffective = resolveEffectivePixel(fbCell, this.effectivePixelOptions());
        const previewScreencode = screencodeHighlight !== undefined
          ? screencodeHighlight
          : fbEffective.glyph;
        const previewColor = colorHighlight !== undefined
          ? colorHighlight
          : fbEffective.color;
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
            reverse={reverseHighlight}
            underline={underlineHighlight}
          />
        );
      }
    }

    const pixelStretchX = this.props.isVic20 ? 2 : this.props.isVDC80 ? 0.5 : 1;
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
      // Pixel aspect ratio correction: VIC-20 pixels are 2x wide, VDC 80-col
      // pixels are 0.5x wide.  Apply a horizontal CSS stretch/compress.
      ...(pixelStretchX !== 1 ? {
        transform: `scaleX(${pixelStretchX})`,
        transformOrigin: '0 0',
      } : {}),
    };

    return (
      <div
        id="MainContainer"
        style={containerStyle}
        ref={this.ref}
        tabIndex={0}
        role="application"
        aria-label="PETSCII drawing canvas"
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
              // Remount the canvas whenever the active framebuf changes so we
              // never reuse the previous frame's cached font/backing store.
              key={this.props.framebufIndex ?? 'none'}
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
              isVdc={this.props.charset === 'c128vdc'}
              isTed={this.props.charset.startsWith('c16')}
              isTransparent={!this.props.showTransparency && this.props.charset !== 'c128vdc'}
              showVdcTransparentGlyph={this.props.showTransparency}
              vdcBlinkIntervalMs={this.props.vdcBlinkIntervalMs}
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
                      left: `${this.props.guideLayer.x + (this.props.guideLayerDragOffset?.dx ?? 0) + (this.props.borderOn ? 32 : 0)}px`,
                      top: `${this.props.guideLayer.y + (this.props.guideLayerDragOffset?.dy ?? 0) + (this.props.borderOn ? 32 : 0)}px`,
                      opacity: this.props.guideLayer.opacity,
                      // Counter-scale the pixel aspect ratio so the guide image
                      // keeps its natural aspect ratio on VDC 80-col (0.5×) and
                      // VIC-20 (2×) screens.
                      transform: `scale(${this.props.guideLayer.scale})${pixelStretchX !== 1 ? ` scaleX(${1 / pixelStretchX})` : ''}`,
                      transformOrigin: '0 0',
                      imageRendering: 'auto',
                      pointerEvents: 'none',
                      filter: [
                        this.props.guideLayer.grayscale ? 'grayscale(1)' : '',
                        this.props.guideLayer.brightness !== 100 ? `brightness(${this.props.guideLayer.brightness / 100})` : '',
                        this.props.guideLayer.contrast !== 100 ? `contrast(${this.props.guideLayer.contrast / 100})` : '',
                        this.props.guideLayer.hue !== 0 ? `hue-rotate(${this.props.guideLayer.hue}deg)` : '',
                        this.props.guideLayer.saturation !== 100 ? `saturate(${this.props.guideLayer.saturation / 100})` : '',
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
      framebuf.width,
      getSettingsCurrentTedColorPalette(state),
    );


    const framebufIndex = screensSelectors.getCurrentScreenFramebufIndex(state);
    const { font } = selectors.getCurrentFramebufFont(state);
    const columnMode = resolveColumnMode(framebuf);
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
      shiftDrawingMode: getSettingsShiftDrawingMode(state),
      altKey: state.toolbar.altKey,
      spacebarKey: state.toolbar.spacebarKey,
      ctrlKey: os==='darwin' ? state.toolbar.metaKey : state.toolbar.ctrlKey,
      rawCtrlKey: state.toolbar.ctrlKey,
      font,
      colorPalette:currentColourPalette,

      canvasGrid: state.toolbar.canvasGrid,
      isDirart: framebuf.charset==='dirart',
      isVic20: charset.substring(0, 3) === 'vic',
      isVDC80: columnMode === 80,
      guideLayer: framebuf.guideLayer,
      guideLayerVisible: state.toolbar.guideLayerVisible,
      fadeMode: state.toolbar.fadeMode,
      fadeStrength: state.toolbar.fadeStrength,
      fadeSource: state.toolbar.fadeSource,
      fadeStepStart: state.toolbar.fadeStepStart,
      fadeStepCount: state.toolbar.fadeStepCount,
      fadeStepChoice: state.toolbar.fadeStepChoice,
      fadeStepSort: state.toolbar.fadeStepSort,
      fadeLinearCounter: state.toolbar.fadeLinearCounter,
      fadeDrawMode: state.toolbar.fadeDrawMode,
      fadeCustomScreencodes: (() => {
        const src = state.toolbar.fadeSource;
        if (!src.startsWith('Custom:')) return undefined;
        const id = src.slice('Custom:'.length);
        const fadeGroup = getColorGroup(charset, framebuf.width);
        return state.settings.saved.customFadeSourcesByGroup?.[fadeGroup]?.find((cs: any) => cs.id === id)?.screencodes;
      })(),
      charset: framebuf.charset,
      boxDrawMode: state.toolbar.boxDrawMode,
      boxForceForeground: state.toolbar.boxForceForeground,
      boxPresets: selectors.getActiveBoxPresets(state),
      selectedBoxPresetIndex: state.toolbar.selectedBoxPresetIndex,
      textureDrawMode: state.toolbar.textureDrawMode,
      textureForceForeground: state.toolbar.textureForceForeground,
      texturePresets: selectors.getActiveTexturePresets(state),
      selectedTexturePresetIndex: state.toolbar.selectedTexturePresetIndex,
      scrollZoomSensitivity: getSettingsScrollZoomSensitivity(state),
      pinchZoomSensitivity: getSettingsPinchZoomSensitivity(state),
      lineDrawActive: state.toolbar.lineDrawActive,
      lineDrawChunkyMode: state.toolbar.lineDrawChunkyMode,
      lineDrawPoints: state.toolbar.lineDrawPoints,
      guideLayerDragOffset: state.toolbar.guideLayerDragOffset,
      showTransparency: getSettingsShowTransparency(state),
      vdcPaintFlags: charset === 'c128vdc' ? state.toolbar.vdcPaintFlags : 0,
      c16PaintBlink: charset.startsWith('c16') ? state.toolbar.c16PaintBlink : false,
      vdcBlinkIntervalMs: getSettingsVdcBlinkIntervalMs(state),
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
  shiftKey: boolean;
  brushActive: boolean;
  integerScale: boolean;
  containerSize: {width:number,height:number} | null;
  colorSortMode: ColorSortMode;
  showColorNumbers: boolean;
  guideLayerVisible: boolean;
  guideAutoConvert: boolean;
  font: Font;
  customFonts: Record<string, { name: string }>;
  boxDrawMode: boolean;
  textureDrawMode: TextureDrawMode;
  lineDrawActive: boolean;
  convertSettings: ConvertSettings;
  charPanelBgMode: 'document' | 'global';
  numFgColors: number;
  pixelStretchX: number;
}
// moved from EditorProps
//zoom: Zoom;
//zoomReady: boolean;

interface EditorDispatch {
  Toolbar: toolbar.PropsFromDispatch;
  Framebuffer: framebuf.PropsFromDispatch;
  Settings: settings.PropsFromDispatch;
  // Raw store dispatch, passed through unmodified by injectFramebufIndex
  // (see redux/utils.js). Used by onConvertToPetscii below to dispatch a
  // thunk that re-validates its own target screen at apply-time, instead of
  // relying on whatever framebufIndex happens to be current when the
  // (async) guide-layer conversion promise resolves.
  dispatch: (action: any) => any;
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

  // Save/restore per-charset fade settings and per-group foreground colour.
  componentDidUpdate(prevProps: EditorProps & EditorDispatch) {
    const charset = this.props.framebuf?.charset;
    const prevCharset = prevProps.framebuf?.charset;
    const width = this.props.framebuf?.width ?? 40;
    const prevWidth = prevProps.framebuf?.width ?? 40;

    // Fade settings are saved per-charset.
    if (charset !== prevCharset && charset && prevCharset) {
      this.props.Toolbar.switchFadeCharset(prevCharset, charset);
    }

    // Foreground colour is saved/restored per computer-type group.
    const prevGroup = getColorGroup(prevCharset ?? 'upper', prevWidth);
    const newGroup = getColorGroup(charset ?? 'upper', width);
    if (prevGroup !== newGroup) {
      this.props.Toolbar.switchForegroundGroup(prevGroup, newGroup);
      // Clamp selected box/texture preset indices to whatever is valid for
      // the new group's preset lists so previews never point past the end.
      this.props.Toolbar.clampSelectedPresetIndices(newGroup);
      // PET is single-color; auto-enable force foreground for boxes & textures
      if (newGroup === 'pet') {
        this.props.Toolbar.setBoxForceForeground(true);
        this.props.Toolbar.setTextureForceForeground(true);
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
      top: "146px",
      borderColor: "var(--editor-frame-border)",
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

    if (charsetPrefix === 'c16') {
      cr = Array.from({ length: 128 }, (_, i) => i);
      // cp is already tedPalette via paletteForCharset in connect
      tr = false;
    } else if (charsetPrefix === 'vic') {
      cr = this.props.vic20paletteRemap.slice(0, 8);
      cp = this.props.vic20colorPalette;
      tr = false;
    } else if (charsetPrefix === 'pet') {
      // PET is monochrome: the whole screen only has a single usable
      // phosphor color (slot 1 of the remap). There is no selectable
      // "background" color on real PET hardware, so only one swatch
      // is ever shown here.
      cr = this.props.petpaletteRemap.slice(1, 2);
      cp = this.props.petcolorPalette;
      tr = false;
    } else if (charset === 'c128vdc'
               || (charsetPrefix === 'c12' && this.props.framebuf!.width >= 80)) {
      // VDC mode uses a fixed RGBI palette with identity remap.  Both the
      // dedicated `c128vdc` charset and any legacy 80-col C128 screen take
      // this branch.  cp is already vdcPalette via paletteForCharset.
      cr = Array.from({ length: 16 }, (_, i) => i);
    }
    const scaleX = 2;
    const scaleY = 2;
    const fbContainerClass = classNames(
      styles.fbContainer,

      this.props.selectedTool === Tool.Text ? styles.text : null,
      ((this.props.selectedTool === Tool.Brush && !brushSelected && !spacebarKey)
        || (this.props.selectedTool === Tool.FindReplace && !brushSelected && !spacebarKey)
        || (this.props.selectedTool === Tool.Boxes && this.props.boxDrawMode && !brushSelected && !spacebarKey)
        || (this.props.selectedTool === Tool.Circles && !brushSelected && !spacebarKey)
        || (this.props.selectedTool === Tool.Textures && !brushSelected && !spacebarKey)
        || (this.props.selectedTool === Tool.LinesDraw && !spacebarKey))
        ? styles.select
        : null,
      (this.props.selectedTool === Tool.Brush || this.props.selectedTool === Tool.FindReplace || this.props.selectedTool === Tool.Lines || this.props.selectedTool === Tool.Boxes || this.props.selectedTool === Tool.Textures) && brushSelected && !spacebarKey
        ? styles.brushstamp
        : null,
      this.props.selectedTool === Tool.PanZoom || spacebarKey
        ? styles.panzoom
        : null
    );
    return (
      <div className={styles.editorLayoutContainer}>
        {/* Left column: canvas + status bar */}
        <div style={{ flex: 1, position: "relative", minWidth: 0, pointerEvents: "none", marginRight: "8px" }}>
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
            width: "310px",
            flexShrink: 0,
            paddingLeft: "0px",
            paddingRight: "8px",
            paddingTop: "10px",
            overflowY: "auto",
            overflowX: "hidden",
            boxSizing: "border-box",
          }}
        >
          <CollapsiblePanel
            title={`Colors (${getCharsetDisplayName(charset, this.props.framebuf?.width, this.props.customFonts)})`}
            headerControls={
              charsetPrefix === 'c16' ? null : (
              <>
                <div
                  title="Toggle color rows (1 or 2)"
                  onClick={() => {
                    this.setState({ colorRowMode: this.state.colorRowMode === 2 ? 1 : 2 } as any);
                  }}
                  style={{
                    fontSize: "10px",
                    fontWeight: "bold",
                    background: this.state.colorRowMode === 1 ? "var(--panel-btn-active-bg)" : "var(--panel-btn-bg)",
                    color: this.state.colorRowMode === 1 ? "var(--panel-btn-active-color)" : "var(--panel-btn-color)",
                    border: "1px solid var(--panel-btn-border)",
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
                    background: this.props.showColorNumbers ? "var(--panel-btn-active-bg)" : "var(--panel-btn-bg)",
                    color: this.props.showColorNumbers ? "var(--panel-btn-active-color)" : "var(--panel-btn-color)",
                    border: "1px solid var(--panel-btn-border)",
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
                    background: "var(--panel-btn-bg)",
                    color: "var(--panel-btn-color)",
                    border: "1px solid var(--panel-btn-border)",
                    padding: "1px 2px",
                    cursor: "pointer",
                  }}
                >
                  <option value="default">Default</option>
                  <option value="luma-light-dark">Light → Dark</option>
                  <option value="luma-dark-light">Dark → Light</option>
                </select>
              </>)
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
              shiftKey={this.props.shiftKey}
              colorSortMode={this.props.colorSortMode}
              showColorNumbers={this.props.showColorNumbers}
              charset={charset}
              framebufWidth={this.props.framebuf?.width}
            />
          </CollapsiblePanel>
          <CharSelect
            colorPalette={cp}
            textColor={this.props.textColor}
            canvasScale={{ scaleX, scaleY }}
            renderPanel={(charSelectContent: React.ReactNode, charSortDropdown: React.ReactNode) => (
              <CollapsiblePanel
                title="Characters"
                headerControls={
                  <>
                    <div
                      title={this.props.charPanelBgMode === 'document'
                        ? "Background: Document \u2013 character panel uses the document\u2019s background colour"
                        : "Background: Panel \u2013 character panel uses the panel\u2019s background"}
                      onClick={() => {
                        const next = this.props.charPanelBgMode === 'document' ? 'global' : 'document';
                        this.props.Settings.setCharPanelBgMode({ branch: 'editing', mode: next });
                        this.props.Settings.saveEdits();
                      }}
                      style={{
                        fontSize: "10px",
                        fontWeight: "bold",
                        background: this.props.charPanelBgMode === 'document' ? "var(--panel-btn-active-bg)" : "var(--panel-btn-bg)",
                        color: this.props.charPanelBgMode === 'document' ? "var(--panel-btn-active-color)" : "var(--panel-btn-color)",
                        border: "1px solid var(--panel-btn-border)",
                        padding: "1px 4px",
                        cursor: "pointer",
                        userSelect: "none",
                        lineHeight: "14px",
                      }}
                    >
                      {this.props.charPanelBgMode === 'document' ? 'B' : 'G'}
                    </div>
                    {charSortDropdown}
                  </>
                }
              >
                {charSelectContent}
              </CollapsiblePanel>
            )}
          />
          {this.props.selectedTool === Tool.LinesDraw && (
            <CollapsiblePanel title="Lines">
              <LineDrawPanel />
            </CollapsiblePanel>
          )}
          {this.props.selectedTool === Tool.Circles && (
            <CollapsiblePanel title="Circles">
              <LineDrawPanel />
            </CollapsiblePanel>
          )}
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
            <CollapsiblePanel title="Textures" headerControls={<TextureHeaderControls />}>
              <TexturePanel />
            </CollapsiblePanel>
          )}
          {this.props.selectedTool === Tool.FadeLighten && (
            <CollapsiblePanel title="Fade/Lighten" headerControls={<FadeHeaderControls />}>
              <ToolPanel selectedTool={this.props.selectedTool} />
            </CollapsiblePanel>
          )}
          {this.props.selectedTool === Tool.FindReplace && (
            <CollapsiblePanel title="Find and Replace">
              <FindReplacePanel />
            </CollapsiblePanel>
          )}
          {this.props.guideLayerVisible && this.props.framebuf && (
            <CollapsiblePanel
              title="Guide"
              headerControls={
                <GuideHeaderControls
                  autoConvert={this.props.guideAutoConvert}
                  onToggleAutoConvert={() => this.props.Toolbar.setGuideAutoConvert(!this.props.guideAutoConvert)}
                />
              }
            >
              <GuideLayerPanel
                guideLayer={this.props.framebuf.guideLayer}
                charset={this.props.framebuf.charset}
                framebufIndex={this.props.framebufIndex!}
                framebufWidth={this.props.framebuf.width}
                framebufHeight={this.props.framebuf.height}
                borderOn={this.props.framebuf.borderOn}
                font={this.props.font}
                colorPalette={this.props.colorPalette}
                backgroundColor={this.props.framebuf.backgroundColor}
                numFgColors={this.props.numFgColors}
                pixelStretchX={this.props.pixelStretchX}
                convertSettings={this.props.framebuf.guideLayer?.convertSettings ?? this.props.convertSettings}
                globalConvertSettings={this.props.convertSettings}
                autoConvert={this.props.guideAutoConvert}
                onSetGuideLayer={(gl) => {
                  this.props.Framebuffer.setGuideLayer(gl);
                }}
                onConvertToPetscii={(result: ConvertResult, target: { framebufIndex: number; width: number; height: number }) => {
                  // The conversion is async and may complete well after the
                  // user has switched to a different screen (or resized /
                  // deleted this one). Re-check the *target* screen's
                  // current state at apply-time inside a thunk, rather than
                  // trusting this.props (which always reflects whatever
                  // screen is active *now*) -- otherwise the result gets
                  // silently applied to the wrong screen.
                  this.props.dispatch((dispatch: any, getState: () => RootState) => {
                    const state = getState();
                    const targetFb = selectors.getFramebufByIndex(state, target.framebufIndex);
                    if (!targetFb || targetFb.width !== target.width || targetFb.height !== target.height) {
                      console.warn('Guide layer conversion result discarded: target screen changed while converting.');
                      return;
                    }
                    dispatch(Framebuffer.actions.setFields(
                      { framebuf: result.framebuf, backgroundColor: result.backgroundColor },
                      target.framebufIndex,
                    ));
                  });
                }}
                onToggleForceBackground={() => {
                  const gl = this.props.framebuf!.guideLayer;
                  const effective = gl?.convertSettings ?? this.props.convertSettings;
                  const updated: ConvertSettings = { ...effective, forceBackgroundColor: !effective.forceBackgroundColor };
                  this.props.Framebuffer.setGuideLayer({ ...(gl || DEFAULT_GUIDE_LAYER), convertSettings: updated });
                }}
                onSetConvertSettings={(cs: ConvertSettings) => {
                  const gl = this.props.framebuf!.guideLayer;
                  this.props.Framebuffer.setGuideLayer({ ...(gl || DEFAULT_GUIDE_LAYER), convertSettings: cs });
                }}
                onResetConvertSettings={() => {
                  const gl = this.props.framebuf!.guideLayer;
                  if (gl) {
                    const { convertSettings: _cs, ...rest } = gl;
                    this.props.Framebuffer.setGuideLayer(rest as any);
                  }
                }}
                onSetShortcutsActive={(flag: boolean) => this.props.Toolbar.setShortcutsActive(flag)}
                onSetGuideLayerDragOffset={(offset) => this.props.Toolbar.setGuideLayerDragOffset(offset)}
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
    const tedPalette = getSettingsCurrentTedColorPalette(state);
    const currentColourPalette = framebuf
      ? paletteForCharset(framebuf.charset, c64Palette, vic20Palette, petPalette, framebuf.width, tedPalette)
      : c64Palette;
    // Compute usable foreground colour count per platform:
    // C64/VDC: 16, VIC-20: 8 (hi-res), PET: 2 (mono), C16: 128 (TED)
    const numFgColors = (() => {
      if (!framebuf) return 16;
      const prefix = framebuf.charset.substring(0, 3);
      if (prefix === 'pet') return 2;
      if (prefix === 'vic') return 8;
      return currentColourPalette.length;
    })();
    const pixelStretchX = getPixelStretchX(framebuf);
    const { font } = selectors.getCurrentFramebufFont(state);
    const customFonts = selectors.getCustomFonts(state);
    return {
      framebuf,
      framebufIndex,
      customFonts,
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
      shiftKey: state.toolbar.shiftKey,
      brushActive: state.toolbar.brush !== null,
      colorSortMode: getSettingsColorSortMode(state),
      showColorNumbers: getSettingsShowColorNumbers(state),
      guideLayerVisible: state.toolbar.guideLayerVisible,
      guideAutoConvert: state.toolbar.guideAutoConvert,
      boxDrawMode: state.toolbar.boxDrawMode,
      textureDrawMode: state.toolbar.textureDrawMode,
      lineDrawActive: state.toolbar.lineDrawActive,
      convertSettings: getSettingsConvertSettings(state),
      charPanelBgMode: getSettingsCharPanelBgMode(state),
      numFgColors,
      pixelStretchX,
      font,
    };
  },
  (dispatch) => {
    return {
      Toolbar: Toolbar.bindDispatch(dispatch),
      Framebuffer: Framebuffer.bindDispatch(dispatch),
      Settings: bindActionCreators(settings.actions, dispatch),
      dispatch,
    };
  },
  framebufIndexMergeProps
)(Editor);
