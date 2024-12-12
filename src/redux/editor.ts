import { Action, Dispatch, bindActionCreators } from 'redux'

import {
  Brush,
  BrushType,
  Coord2,
  Framebuf,
  Pixel,
  DEFAULT_FB_HEIGHT,
  DEFAULT_FB_WIDTH
} from './types'

import * as fp from '../utils/fp'
import { makeScreenName } from './utils'
import { ActionsUnion, updateField } from './typeUtils'
import { Toolbar } from './toolbar'


export const CHARSET_UPPER = 'upper'
export const CHARSET_LOWER = 'lower'
export const CHARSET_DIRART = 'dirart'
export const CHARSET_CBASE_UPPER = 'cbaseUpper'
export const CHARSET_CBASE_LOWER = 'cbaseLower'

export const CHARSET_C16_UPPER = 'c16Upper'
export const CHARSET_C16_LOWER = 'c16Lower'
export const CHARSET_C128_UPPER = 'c128Upper'
export const CHARSET_C128_LOWER = 'c128Lower'
export const CHARSET_VIC20_UPPER = 'vic20Upper'
export const CHARSET_VIC20_LOWER = 'vic20Lower'

export const CHARSET_PET_UPPER = 'petGfx'
export const CHARSET_PET_LOWER = 'petBiz'


export const DEFAULT_BACKGROUND_COLOR = 6
export const DEFAULT_BORDER_COLOR = 14
export const DEFAULT_BORDER_ON = true
export const DEFAULT_ZOOM = { zoomLevel: 2, alignment: 'left' }
export const DEFAULT_ZOOMREADY = false


export interface FbActionWithData<T extends string, D> extends Action<T> {
  data: D;
  undoId: number | null;
  framebufIndex: number | null;
}


// Fb actions are handled specially as these actions are always tagged
// with a framebufIndex and an undoId.
export function createFbAction<T extends string>(type: T, framebufIndex: number | null, undoId: number | null): FbActionWithData<T, undefined>
export function createFbAction<T extends string, D>(type: T, framebufIndex: number | null, undoId: number | null, data: D): FbActionWithData<T, D>
export function createFbAction<T extends string, D>(type: T, framebufIndex: number | null, undoId: number | null, data?: D) {
  return data === undefined ?
    { type, framebufIndex, undoId } :
    { type, data, framebufIndex, undoId };
}




type SetCharParams = Coord2 & { screencode?: number, color?: number };
type SetBrushParams = Coord2 & { brushType: number, brush: Brush, brushColor: number };
type ImportFileParams = any // TODO ts

const SET_PIXEL = 'Framebuffer/SET_PIXEL'
const SET_BRUSH = 'Framebuffer/SET_BRUSH'
const SET_FIELDS = 'Framebuffer/SET_FIELDS'
const IMPORT_FILE = 'Framebuffer/IMPORT_FILE'
const CLEAR_CANVAS = 'Framebuffer/CLEAR_CANVAS'
const RESIZE_CANVAS = 'Framebuffer/RESIZE_CANVAS'
const COPY_FRAMEBUF = 'Framebuffer/COPY_FRAMEBUF'
const SHIFT_HORIZONTAL = 'Framebuffer/SHIFT_HORIZONTAL'
const SHIFT_VERTICAL = 'Framebuffer/SHIFT_VERTICAL'
const CONVERT_TO_MONO = 'Framebuffer/CONVERT_TO_MONO'
const STRIP_8 = 'Framebuffer/STRIP_8'

const SET_BACKGROUND_COLOR = 'Framebuffer/SET_BACKGROUND_COLOR'
const SET_BORDER_COLOR = 'Framebuffer/SET_BORDER_COLOR'
const SET_BORDER_ON = 'Framebuffer/SET_BORDER_ON'
const SET_CHARSET = 'Framebuffer/SET_CHARSET'
const SET_NAME = 'Framebuffer/SET_NAME'
const SET_DIMS = 'Framebuffer/SET_DIMS'
const SET_ZOOM = 'Framebuffer/SET_ZOOM'
const SET_ZOOMREADY = 'Framebuffer/SET_ZOOMREADY'
const SWAP_COLORS = 'Framebuffer/SWAP_COLORS'
const SWAP_CHARS = 'Framebuffer/SWAP_CHARS'
const TOGGLE_BORDER = 'Framebuffer/TOGGLE_BORDER'


const actionCreators = {
  setPixel: (data: SetCharParams, undoId: number | null, framebufIndex: number | null) => createFbAction(SET_PIXEL, framebufIndex, undoId, data),
  setBrush: (data: SetBrushParams, undoId: number | null, framebufIndex: number) => createFbAction(SET_BRUSH, framebufIndex, undoId, data),
  importFile: (data: ImportFileParams, framebufIndex: number) => createFbAction(IMPORT_FILE, framebufIndex, null, data),
  clearCanvas: (framebufIndex: number) => createFbAction(CLEAR_CANVAS, framebufIndex, null),
  convertToMono: (framebufIndex: number) => createFbAction(CONVERT_TO_MONO, framebufIndex, null),
  strip8: (framebufIndex: number) => createFbAction(STRIP_8, framebufIndex, null),
  copyFramebuf: (data: Framebuf, framebufIndex: number) => createFbAction(COPY_FRAMEBUF, framebufIndex, null, data),
  setFields: (data: any, framebufIndex: number) => createFbAction(SET_FIELDS, framebufIndex, null, data),
  shiftHorizontal: (data: -1 | 1, framebufIndex: number) => createFbAction(SHIFT_HORIZONTAL, framebufIndex, null, data),
  shiftVertical: (data: -1 | 1, framebufIndex: number) => createFbAction(SHIFT_VERTICAL, framebufIndex, null, data),

  setBackgroundColor: (data: number, framebufIndex: number) => createFbAction(SET_BACKGROUND_COLOR, framebufIndex, null, data),
  setBorderColor: (data: number, framebufIndex: number) => createFbAction(SET_BORDER_COLOR, framebufIndex, null, data),
  setBorderOn: (data: boolean, framebufIndex: number) => createFbAction(SET_BORDER_ON, framebufIndex, null, data),


  setCharset: (data: string, framebufIndex: number) => createFbAction(SET_CHARSET, framebufIndex, null, data),
  setName: (data: string | undefined, framebufIndex: number) => createFbAction(SET_NAME, framebufIndex, null, data),

  setDims: (data: { width: number, height: number }, framebufIndex: number) => createFbAction(SET_DIMS, framebufIndex, null, data),
  setZoom: (data: { zoomLevel: number, alignment: string }, framebufIndex: number) => createFbAction(SET_ZOOM, framebufIndex, null, data),
  setZoomReady: (data: boolean, framebufIndex: number) => createFbAction(SET_ZOOMREADY, framebufIndex, null, data),
  resizeCanvas: (data: { rWidth: number, rHeight: number, rDir: Coord2, isCrop: boolean }, framebufIndex: number) => createFbAction(RESIZE_CANVAS, framebufIndex, null, data),
  swapColors: (colors: { srcColor: number, destColor: number }, framebufIndex: number) => createFbAction(SWAP_COLORS, framebufIndex, null, colors),
  swapChars: (chars: { srcChar: number, destChar: number }, framebufIndex: number) => createFbAction(SWAP_CHARS, framebufIndex, null, chars),

};

export const actions = actionCreators;

// Map action dispatch functions to something that can be used
// in React components.  This drops the last framebufIndex from the
// type as it's implicitly plugged in by the connect() merge props
// option.
type MapReturnToVoidFB<T> =
  T extends (framebufIndex: number) => any ? () => void :
  T extends (a0: infer U, framebufIndex: number) => any ? (a0: U) => void :
  T extends (a0: infer U, a1: infer V, framebufIndex: number) => any ? (a0: U, a1: V) => void :
  T extends (a0: infer U, a1: infer V, a2: infer S, framebufIndex: number) => any ? (a0: U, a1: V, a2: S) => void : T;

type DispatchPropsFromActionsFB<T> = {
  [P in keyof T]: MapReturnToVoidFB<T[P]>;
}

export type PropsFromDispatch = DispatchPropsFromActionsFB<typeof actions>;

export type Actions = ActionsUnion<typeof actionCreators>;

export class Framebuffer {

  static actions = actions;

  static reducer = fbReducer

  static bindDispatch(dispatch: Dispatch) {
    return bindActionCreators(Framebuffer.actions, dispatch)
  }
}

function setChar(fbState: Framebuf, { row, col, screencode, color }: SetCharParams): Pixel[][] {
  const { framebuf, width, height } = fbState
  if (row < 0 || row >= height ||
    col < 0 || col >= width) {
    return framebuf
  }
  return framebuf.map((pixelRow, idx) => {
    if (row === idx) {
      return pixelRow.map((pix, x) => {
        if (col === x) {
          if (screencode === undefined) {
            return { ...pix, color: color! }
          }
          if (color === undefined) {
            return { ...pix, code: screencode }
          }
          return { code: screencode, color }
        }
        return pix
      })
    }
    return pixelRow
  })
}

function setBrush(framebuf: Pixel[][], { row, col, brush, brushType, brushColor }: SetBrushParams): Pixel[][] {
  const { min, max } = brush.brushRegion



  return framebuf.map((pixelRow, y) => {
    const yo = y - row
    if (yo >= min.row && yo <= max.row) {
      return pixelRow.map((pix, x) => {
        const xo = x - col
        if (xo >= min.col && xo <= max.col) {
          const bpix = brush.framebuf[yo - min.row][xo - min.col]
          const fpix = framebuf[y][x]

          let code = bpix.code;
          let color = bpix.color;

          if (brushType == BrushType.Raw) {
            //return all data and paste transparency info as well
            return {
              code: code,
              color: color
            }
          }
          else {
            //default paste char and colors
            if (brushType == BrushType.CharsOnly) {
              //paste char info only
              color = fpix.color;
            }
            else if (brushType == BrushType.ColorsOnly) {
              //paste color data only
              code = fpix.code;
            }
            else if (brushType == BrushType.ColorStamp) {
              //paste color mono color stamp (currently selected color)
              color = brushColor;
            }
            if (bpix.code !== 256) {
              return {
                code: code,
                color: color
              }
            }


          }

        }
        return pix
      })
    }
    return pixelRow
  })
}

function rotateArr<T>(arr: T[], dir: -1 | 1) {
  if (dir === -1) {
    return [...arr.slice(1, arr.length), arr[0]];
  }
  return [arr[arr.length - 1], ...arr.slice(0, arr.length - 1)];

}

function shiftHorizontal(framebuf: Pixel[][], dir: -1 | 1) {
  return framebuf.map((row) => rotateArr(row, dir))
}

function shiftVertical(framebuf: Pixel[][], dir: -1 | 1) {
  return rotateArr(framebuf, dir);
}

function emptyFramebuf(width: number, height: number): Pixel[][] {
  return Array(height).fill(Array(width).fill({ code: 32, color: 14 }))
}

function mapPixels(fb: Framebuf, mapFn: (fb: Framebuf) => Pixel[][]) {
  const mappedFn = mapFn(fb);
  return {
    ...fb,
    framebuf: mappedFn,
    width: mappedFn[0].length,
    height: mappedFn.length,
  }
}

function convertFrameBufToMono(framebuf: Pixel[][]) {
  // return framebuf.map((row) => rotateArr(row, dir))

  return framebuf.map((row) => row.map((cell) => cell.code == cell.code ? { code: cell.code, color: 1 } : cell))
}

function frameBufStrip8(framebuf: Pixel[][]) {
  // return framebuf.map((row) => rotateArr(row, dir))

  return framebuf.map((row) => row.map((cell) => cell.color >= 7 ? { code: cell.code, color: 1 } : cell))
}



function swapFrameBufColors(framebuf: Pixel[][], colors: { srcColor: number, destColor: number }) {
  // return framebuf.map((row) => rotateArr(row, dir))
  const { srcColor, destColor } = colors;
  return framebuf.map((row) => row.map((cell) => cell.color == srcColor ? { code: cell.code, color: destColor } : cell))
}

function swapFrameBufChars(framebuf: Pixel[][], chars: { srcChar: number, destChar: number }) {
  // return framebuf.map((row) => rotateArr(row, dir))
  const { srcChar, destChar } = chars;
  return framebuf.map((row) => row.map((cell) => cell.code == srcChar ? { code: destChar, color: cell.color } : cell))
}


function resizeFrameBuf(framebuf: Pixel[][], data: { rWidth: number, rHeight: number, rDir: Coord2, isCrop: boolean }) {
  // return framebuf.map((row) => rotateArr(row, dir))
  const { rWidth, rHeight, rDir, isCrop } = data;

  const sWidth = framebuf[0].length;
  const sHeight = framebuf.length;
  const exChar = { code: 32, color: 14 };

  // Array(height).fill(Array(width).fill({code: 32, color:14}))
  if (rWidth > sWidth) {
    //expand width
    if (rHeight > sHeight) {
      //expand width/height
      return [...framebuf, ...Array(rHeight - sHeight).fill(Array(sWidth).fill(exChar))].map((row) => [...row, ...Array(rWidth - sWidth).fill(exChar)]);

    }
    else {
      //expand width and crop height
      return framebuf.slice(0, rHeight).map((row) => [...row, ...Array(rWidth - sWidth).fill(exChar)]);
    }
  }
  else {
    if (isCrop) {
      //crop width
      if (rHeight > sHeight) {
        // crop width and expand height
        return [...framebuf, ...Array(rHeight - sHeight).fill(Array(sWidth).fill(exChar))].map((row) => row.slice(0, rWidth));
      }
      else {
        //crop width and crop height
        return framebuf.slice(0, rHeight).map((row) => row.slice(0, rWidth));
      }
    }
    else {
      //Width Crop is now a wrap around

      console.log('framebuf.flat():', framebuf.flat())
      console.log('framebuf.slice(0, rHeight).map((row) => row.slice(0, rWidth))', framebuf.slice(0, rHeight).map((row) => row.slice(0, rWidth)))

      return framebuf.slice(0, rHeight).map((row) => row.slice(0, rWidth));






    }

  }
}


export function fbReducer(state: Framebuf = {
  framebuf: emptyFramebuf(DEFAULT_FB_WIDTH, DEFAULT_FB_HEIGHT),
  width: DEFAULT_FB_WIDTH,
  height: DEFAULT_FB_HEIGHT,
  zoom: DEFAULT_ZOOM,
  backgroundColor: DEFAULT_BACKGROUND_COLOR,
  borderColor: DEFAULT_BORDER_COLOR,
  borderOn: DEFAULT_BORDER_ON,
  charset: CHARSET_UPPER,
  name: undefined,
  zoomReady: DEFAULT_ZOOMREADY,


}, action: Actions): Framebuf {
  switch (action.type) {
    case SET_PIXEL:
      return mapPixels(state, fb => setChar(fb, action.data));
    case SET_BRUSH:
      return mapPixels(state, fb => setBrush(fb.framebuf, action.data));
    case CLEAR_CANVAS:
      return mapPixels(state, _fb => emptyFramebuf(state.width, state.height));
    case CONVERT_TO_MONO:
        return mapPixels(state, _fb =>
          convertFrameBufToMono(_fb.framebuf)

        );

        case STRIP_8:
          return mapPixels(state, _fb =>
            frameBufStrip8(_fb.framebuf)

          );
    case RESIZE_CANVAS:
      return mapPixels(state, fb => {
        return resizeFrameBuf(fb.framebuf, action.data)
      });
    case SWAP_COLORS:
      return mapPixels(state, fb => {
        return swapFrameBufColors(fb.framebuf, action.data)
      });
      case SWAP_CHARS:
        return mapPixels(state, fb => {
          return swapFrameBufChars(fb.framebuf, action.data)
        });


    case SHIFT_HORIZONTAL:
      return mapPixels(state, fb => shiftHorizontal(fb.framebuf, action.data));
    case SHIFT_VERTICAL:
      return mapPixels(state, fb => shiftVertical(fb.framebuf, action.data));
    case SET_FIELDS:
      return {
        ...state,
        ...action.data
      }
    case COPY_FRAMEBUF:
      return {
        ...state,
        ...action.data
      }
    case IMPORT_FILE:
      const c = action.data
      const name = fp.maybeDefault(c.name, makeScreenName(action.framebufIndex))
      return {
        framebuf: c.framebuf,
        width: c.width,
        height: c.height,
        backgroundColor: c.backgroundColor,
        borderColor: c.borderColor,
        borderOn: c.borderOn,
        charset: c.charset,
        zoom: c.zoom,
        zoomReady: false,
        name
      }
    case SET_BACKGROUND_COLOR:
      return updateField(state, 'backgroundColor', action.data);
    case SET_BORDER_COLOR:
      return updateField(state, 'borderColor', action.data);
    case SET_BORDER_ON:
      return updateField(state, 'borderOn', action.data);
    case SET_CHARSET:
      switch(action.data.substring(0,3))

{
  case "pet":

    return {
      ...state,
      borderColor: 0,
      backgroundColor: 0,
      charset:action.data,

  }
  break;
  case "vic":
    return {
      ...state,
      borderColor: 3,
      backgroundColor: 1,
      charset:action.data,

  }
  break;

  default:
    return {
      ...state,
      borderColor: 14,
      backgroundColor: 6,
      charset:action.data,

  }
    break;

}



      case SET_NAME:
      return updateField(state, 'name', action.data);
    case SET_DIMS: {
      const { width, height } = action.data;
      return {
        ...state,
        width: action.data.width,
        height: action.data.height,
        framebuf: emptyFramebuf(width, height)
      }
    }
    case SET_ZOOM:

      const { zoomLevel, alignment } = action.data;

      const updatedzoom = { zoomLevel, alignment }
      return updateField(state, 'zoom', updatedzoom);

    case SET_ZOOMREADY:
      return updateField(state, 'zoomReady', action.data);

    default:
      return state;
  }
}
