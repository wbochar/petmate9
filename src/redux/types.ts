
import { StateWithHistory } from 'redux-undo'
import { Action } from 'redux'
import { ThunkAction } from 'redux-thunk'
import { FileFormat } from './typesExport';
import { Matrix3x3 } from '../utils/matrix';

export const DEFAULT_FB_WIDTH = 40;
export const DEFAULT_FB_HEIGHT = 25;

export interface Coord2 {
  row: number;
  col: number;
};

export interface Pixel {
  code: number;
  color: number;
};

export interface Font {
  bits: number[];
  charOrder: number[];
};

export interface GuideLayer {
  enabled: boolean;
  imageData: string | null;  // base64-encoded data URL
  x: number;                 // pixel offset X
  y: number;                 // pixel offset Y
  opacity: number;           // 0.0 – 1.0
  scale: number;             // multiplier, 1.0 = native size
  cropToCanvas: boolean;     // clip image to canvas bounds
  locked: boolean;           // prevent accidental repositioning
  grayscale: boolean;        // non-destructive grayscale toggle
  brightness: number;        // 0–200, 100 = normal
  contrast: number;          // 0–200, 100 = normal
  hue: number;               // −180–180, 0 = no shift
  saturation: number;        // 0–200, 100 = normal
  convertSettings?: ConvertSettings;  // per-frame override; absent = use global default
};

export const DEFAULT_GUIDE_LAYER: GuideLayer = {
  enabled: true,
  imageData: null,
  x: 0,
  y: 0,
  opacity: 0.5,
  scale: 1.0,
  cropToCanvas: true,
  locked: false,
  grayscale: false,
  brightness: 100,
  contrast: 100,
  hue: 0,
  saturation: 100,
};

export interface Framebuf {
  readonly framebuf: Pixel[][];
  readonly width: number;
  readonly height: number;
  readonly backgroundColor: number;
  readonly borderColor: number;
  readonly borderOn: boolean;
  readonly charset: string;
  readonly name?: string;
  readonly zoom: {zoomLevel:number,alignment:string};
  readonly zoomReady: boolean;
  readonly guideLayer?: GuideLayer;
};

// This is the basically the same as the redux Framebuf except
// that it's been amended with some extra fields with selectors
// when an export is initiated.
export interface FramebufWithFont extends Framebuf {
  font: Font;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export type Zoom = {zoomLevel:number,alignment:string};

export type RgbPalette = Rgb[];

export type Angle360 = 0 | 90 | 180 | 270;

export interface Transform {
  mirror: number; // TODO ts
  rotate: Angle360;
}

export interface BrushRegion {
  min: Coord2;
  max: Coord2;
}

export interface Brush {
  framebuf: Pixel[][];
  brushRegion: BrushRegion;
}

// Sentinel screencode value used to represent a transparent (empty) pixel
export const TRANSPARENT_SCREENCODE = 256;

export type PaletteName = 'petmate' | 'colodore' | 'pepto' | 'vice' ;
export type vic20PaletteName = 'vic20ntsc' | 'vic20pal';
export type petPaletteName = 'petwhite' | 'petgreen' | 'petamber';
export type tedPaletteName = 'tedPAL' | 'tedNTSC';

export type EditBranch = 'saved' | 'editing';

export type ResizeBranch = 'width' | 'height' | 'dir';


export type EditSaved<T> = {
  [k in EditBranch]: T;
};

export type ResizeSaved<T> = {
  [k in ResizeBranch]: T;
};
export const DEFAULT_TEXTURE_OPTIONS: boolean[] = [false, false, false, false, false, false];

export interface TexturePreset {
  name: string;
  chars: number[];   // array of screencodes
  colors: number[];  // array of color indices
  options?: boolean[];  // [V/H, Inv, Col, (unused), Diag, (unused)]
  random?: boolean;     // randomly shuffle chars when tiling
  brushWidth?: number;  // preset-scoped output width, default 8
  brushHeight?: number; // preset-scoped output height, default 8
}

export interface LinePreset {
  name: string;
  chars: number[];  // array of 16 screencodes
}

export interface BoxSide {
  chars: number[];   // 1-4 screencodes
  colors: number[];  // 1-4 color indices (parallel to chars)
  mirror: boolean;
  stretch: boolean;
  repeat: boolean;
  startEnd: 'start' | 'end' | 'all' | 'none';
}

export interface BoxPreset {
  name: string;
  corners: number[];       // [TL, TR, BL, BR] screencodes
  cornerColors: number[];  // [TL, TR, BL, BR] color indices
  top: BoxSide;
  bottom: BoxSide;
  left: BoxSide;
  right: BoxSide;
  fill: number;       // interior fill screencode (256 = transparent)
  fillColor: number;  // fill color index
}

export enum  BrushType {
  CharsColors = 0,
  CharsOnly = 1,
  ColorsOnly = 2,
  ColorStamp = 3,
  Raw = 4

}

export type ColorSortMode = 'default' | 'luma-light-dark' | 'luma-dark-light';
export type ThemeMode = 'system' | 'dark' | 'light';
export type UltimateMachineType = 'c64' | 'c128' | 'unknown' | null;
/** Behavior of SHIFT+click/drag while a paint tool is active:
 *  - axisLock:  current behavior; shift constrains drag to a single axis
 *  - linkLine:  LineDraw-style; shift+click sets an anchor and subsequent
 *               shift+clicks paint straight lines between consecutive clicks
 *               until SHIFT is released. */
export type ShiftDrawingMode = 'axisLock' | 'linkLine';

export type ConversionToolName = 'petsciiator' | 'img2petscii' | 'petmate9';
export type Img2PetsciiMatcherMode = 'slow' | 'fast';
export type Petmate9DitherMode = 'floyd-steinberg' | 'bayer4x4' | 'bayer2x2' | 'none';

export interface PetsciiatorSettings {
  dithering: boolean;
}

export interface Img2PetsciiSettings {
  matcherMode: Img2PetsciiMatcherMode;
  monoMode: boolean;
  monoThreshold: number; // 0–255
}

export interface Petmate9Settings {
  ditherMode: Petmate9DitherMode;
  ssimWeight: number; // 0–100, blends SSIM vs Lab color distance
  useLuminance?: boolean; // match by luminance only instead of full Lab color
}

export interface ConvertSettings {
  selectedTool: ConversionToolName;
  forceBackgroundColor: boolean;
  colorMask?: boolean[]; // per-color-index toggle; absent/undefined = all enabled
  petsciiator: PetsciiatorSettings;
  img2petscii: Img2PetsciiSettings;
  petmate9: Petmate9Settings;
}

export interface EmulatorPaths {
  c64: string;
  c128: string;
  pet4032: string;
  pet8032: string;
  vic20: string;
  c16: string;
}

export interface Settings {
  palettes: number[][];
  vic20palettes: number[][];
  petpalettes: number[][];
  selectedColorPalette: PaletteName;
  selectedVic20ColorPalette: vic20PaletteName;
  selectedPetColorPalette: petPaletteName;
  selectedTedColorPalette: tedPaletteName;
  ultimateAddress: string;
  ultimatePresets: string[];
  integerScale: boolean;
  colorSortMode: ColorSortMode;
  showColorNumbers: boolean;
  themeMode: ThemeMode;
  /** SHIFT+click behavior while a paint tool is active. Defaults to 'axisLock'. */
  shiftDrawingMode: ShiftDrawingMode;
  emulatorPaths: EmulatorPaths;
  linePresets: LinePreset[];
  /** Box presets grouped by platform colour group (c64/vic20/pet/c128vdc/c16). */
  boxPresetsByGroup: Record<string, BoxPreset[]>;
  scrollZoomSensitivity: number;  // 1–10, default 5
  pinchZoomSensitivity: number;   // 1–10, default 5
  defaultZoomLevel: number;       // 1–8, default 2
  defaultBorderOn: boolean;       // default border for newly created screens
  convertSettings: ConvertSettings;
  charPanelBgMode: 'document' | 'global';
  customFadeSources: CustomFadeSource[];
  fadeSourceToggles: Record<string, FadePresetToggles>;
  /** Texture presets grouped by platform colour group (c64/vic20/pet/c128vdc/c16). */
  texturePresetsByGroup: Record<string, TexturePreset[]>;
};


export interface Screens {
  current: number;
  list: number[];
};


export enum Tool {
  Draw = 0,
  Colorize = 1,
  CharDraw = 2,
  Brush = 3,
  Text = 4,
  PanZoom = 5,
  FloodFill = 6,
  Textures = 7,
  Lines = 8,
  Boxes = 9,
  FadeLighten = 10,
  RvsPen = 11,
  LinesDraw = 12,
  Circles = 13
};

// Per screen UI state
export interface FramebufUIState {
  canvasTransform: Matrix3x3;
  canvasFit: 'fitWidth' | 'fitWidthHeight' | 'fitHeight' | 'nofit';
  scrollX?: number;  // horizontal scroll offset, persisted in workspace
  scrollY?: number;  // vertical scroll offset, persisted in workspace
};

export interface CustomFadeSource {
  id: string;
  name: string;
  screencodes: number[];
}

export type FadeMode = 'lighten' | 'darken';
export type FadeSource = 'AllCharacters' | 'AlphaNumeric' | 'AlphaNumExtended' | 'PETSCII' | 'Blocks'
  | 'HorizontalLines' | 'VerticalLines' | 'DiagonalLines' | 'BoxesBlocks' | 'Symbols'
  | string; // custom source IDs use 'Custom:<id>' format
export type FadeStepStart = 'first' | 'last' | 'middle';
export type FadeStepChoice = 'pingpong' | 'rampUp' | 'rampDown' | 'random' | 'direction';
export type FadeStepSort = 'default' | 'random';

/** Fade/Lighten settings saved and restored per charset. */
export interface FadeCharsetSettings {
  fadeMode: FadeMode;
  fadeStrength: number;
  fadeSource: FadeSource;
  fadeStepStart: FadeStepStart;
  fadeStepCount: number;
  fadeStepChoice: FadeStepChoice;
  fadeStepSort: FadeStepSort;
}

/** Fade/Lighten toggle settings persisted per source preset. */
export interface FadePresetToggles {
  fadeShowSource: boolean;
  fadeStepStart: FadeStepStart;
  fadeStepCount: number;
  fadeStepChoice: FadeStepChoice;
  fadeStepSort: FadeStepSort;
}

export interface Toolbar {
  brush: Brush | null;
  brushRegion: BrushRegion | null;
  brushTransform: Transform;
  selectedChar: Coord2;
  charTransform: Transform;
  undoId: number;
  textColor: number;
  textCursorPos: Coord2|null;
  selectedTool: Tool;
  fadeMode: FadeMode;
  fadeStrength: number;
  fadeSource: FadeSource;
  fadeStepStart: FadeStepStart;
  fadeStepCount: number; // 1 | 2 | 4
  fadeStepChoice: FadeStepChoice;
  fadeStepSort: FadeStepSort;
  fadeShowSource: boolean;
  fadeEditMode: boolean;
  fadeLinearCounter: number;
  fadeSettingsByCharset: Record<string, FadeCharsetSettings>;
  textColorByGroup: Record<string, number>;
  activeColorGroup: string;
  workspaceFilename: string|null;
  altKey: boolean;
  ctrlKey: boolean;
  tabKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  capslockKey: boolean;
  spacebarKey: boolean;
  showSettings: boolean;
  showResizeSettings: boolean;
  resizeWidth: number;
  resizeHeight: number;
  resizeCrop: boolean;
  showProgressModal: boolean;
  progressTitle: string;
  progressValue: number;
  textCapsLock: boolean;
  showCustomFonts: boolean;
  showExport: { show: boolean, fmt?: FileFormat}; // fmt undefined only when show=false
  showImport: { show: boolean, fmt?: FileFormat}; // fmt undefined only when show=false
  showImportSeqAdv: { show: boolean };
  selectedPaletteRemap: number;
  canvasGrid: boolean;
  shortcutsActive: boolean;
  guideLayerVisible: boolean;
  ultimateOnline: boolean;
  ultimateMachineType: UltimateMachineType;
  ultimateLastContactedAt: string | null;

  linePresets: LinePreset[];
  selectedLinePresetIndex: number;

  /** Box presets grouped by platform colour group (c64/vic20/pet/c128vdc/c16). */
  boxPresetsByGroup: Record<string, BoxPreset[]>;
  /** Selected preset index within the currently-active group's list. */
  selectedBoxPresetIndex: number;

  /** Texture presets grouped by platform colour group (c64/vic20/pet/c128vdc/c16). */
  texturePresetsByGroup: Record<string, TexturePreset[]>;
  /** Selected preset index within the currently-active group's list. */
  selectedTexturePresetIndex: number;
  textureRandomColor: boolean;
  textureOptions: boolean[];
  texturePatternType: string;
  textureSeed: number;
  textureScale: number;
  textureOutputMode: 'brush' | 'fill' | 'none';
  textureForceForeground: boolean;
  textureBrushWidth: number;
  textureBrushHeight: number;
  textureDrawMode: boolean;
  fadeDrawMode: boolean;
  boxDrawMode: boolean;
  boxForceForeground: boolean;
  guideLayerDragOffset: { dx: number; dy: number } | null;

  lineDrawChunkyMode: boolean;
  lineDrawPoints: Coord2[];
  lineDrawActive: boolean;

  newScreenSize: { width: number, height: number };

  framebufUIState: {[framebufIndex: number]: FramebufUIState};
}

export type UndoableFramebuf = StateWithHistory<Framebuf>;

export type LastSavedState = {
  screenList: Screens['list'];
  framebufs: Framebuf[];
};



export interface RootState {
  settings: {
    saved: Settings;
    editing: Settings;
  };

  toolbar: Toolbar;
  screens: Screens;
  customFonts: { [name: string]: {font: Font, name: string} };
  framebufList: UndoableFramebuf[];
  lastSavedSnapshot: LastSavedState;
};

export type RootStateThunk = ThunkAction<void, RootState, undefined, Action>;

export interface SettingsJson {
  version?: number;
  palettes?: number[][];
  vic20palettes?: number[][];
  petpalettes?: number[][];
  selectedColorPalette?: PaletteName;
  selectedVic20ColorPalette?: vic20PaletteName;
  selectedPetColorPalette?: petPaletteName;
  selectedTedColorPalette?: tedPaletteName;
  ultimateAddress?: string;
  ultimatePresets?: string[];
  integerScale?: boolean;
  colorSortMode?: ColorSortMode;
  showColorNumbers?: boolean;
  themeMode?: ThemeMode;
  shiftDrawingMode?: ShiftDrawingMode;
  emulatorPaths?: Partial<EmulatorPaths>;
  linePresets?: LinePreset[];
  /** Legacy (pre-grouped) flat list of box presets — migrated on load. */
  boxPresets?: BoxPreset[];
  /** Box presets grouped by platform colour group. */
  boxPresetsByGroup?: Record<string, BoxPreset[]>;
  scrollZoomSensitivity?: number;
  pinchZoomSensitivity?: number;
  defaultZoomLevel?: number;
  defaultBorderOn?: boolean;
  convertSettings?: ConvertSettings;
  charPanelBgMode?: 'document' | 'global';
  customFadeSources?: CustomFadeSource[];
  fadeSourceToggles?: Record<string, FadePresetToggles>;
  /** Legacy (pre-grouped) flat list of texture presets — migrated on load. */
  texturePresets?: TexturePreset[];
  /** Texture presets grouped by platform colour group. */
  texturePresetsByGroup?: Record<string, TexturePreset[]>;
}

// Interface describing the custom fonts chunks in
// .petmate workspace version === 2
export type WsCustomFontsV2 = {
  [id: string]: {
    name: string,
    font: {
      bits: number[],
      charOrder: number[]
    }
  }
};

export * from './typesExport'
