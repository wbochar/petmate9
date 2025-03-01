
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

export type Brush = any;

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
export enum  BrushType {
  CharsColors = 0,
  CharsOnly = 1,
  ColorsOnly = 2,
  ColorStamp = 3,
  Raw = 4

}

export interface Settings {
  palettes: number[][];
  vic20palettes: number[][];
  petpalettes: number[][];
  selectedColorPalette: PaletteName;
  selectedVic20ColorPalette: vic20PaletteName;
  selectedPetColorPalette: petPaletteName;
ultimateAddress: string;
  integerScale: boolean;
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
  FloodFill = 6
};

// Per screen UI state
export interface FramebufUIState {
  canvasTransform: Matrix3x3;
  canvasFit: 'fitWidth' | 'fitWidthHeight' | 'fitHeight' | 'nofit';
};

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
  progressTitle:string;
  progressValue:number;
  showCustomFonts: boolean;
  showExport: { show: boolean, fmt?: FileFormat}; // fmt undefined only when show=false
  showImport: { show: boolean, fmt?: FileFormat}; // fmt undefined only when show=false
  selectedPaletteRemap: number;
  canvasGrid: boolean;
  shortcutsActive: boolean;


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
