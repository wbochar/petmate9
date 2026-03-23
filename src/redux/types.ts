
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

export type EditBranch = 'saved' | 'editing';

export type ResizeBranch = 'width' | 'height' | 'dir';


export type EditSaved<T> = {
  [k in EditBranch]: T;
};

export type ResizeSaved<T> = {
  [k in ResizeBranch]: T;
};
export interface TexturePreset {
  name: string;
  chars: number[];   // array of 16 screencodes
  colors: number[];  // array of 16 color indices
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

export interface Settings {
  palettes: number[][];
  vic20palettes: number[][];
  petpalettes: number[][];
  selectedColorPalette: PaletteName;
  selectedVic20ColorPalette: vic20PaletteName;
  selectedPetColorPalette: petPaletteName;
  ultimateAddress: string;
  integerScale: boolean;
  colorSortMode: ColorSortMode;
  showColorNumbers: boolean;
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
  FadeLighten = 10
};

// Per screen UI state
export interface FramebufUIState {
  canvasTransform: Matrix3x3;
  canvasFit: 'fitWidth' | 'fitWidthHeight' | 'fitHeight' | 'nofit';
};

export type FadeMode = 'lighten' | 'darken';

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

  linePresets: LinePreset[];
  selectedLinePresetIndex: number;

  boxPresets: BoxPreset[];
  selectedBoxPresetIndex: number;

  texturePresets: TexturePreset[];
  selectedTexturePresetIndex: number;
  textureRandomColor: boolean;
  textureOptions: boolean[];

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

export type SettingsJson = any;

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
