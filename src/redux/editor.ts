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


export const CHARSET_UPPER = 'upper'
export const CHARSET_LOWER = 'lower'
export const CHARSET_DIRART = 'dirart'

export const DEFAULT_BACKGROUND_COLOR = 6
export const DEFAULT_BORDER_COLOR = 14
export const DEFAULT_BORDER_ON = true
export const DEFAULT_ZOOM = {zoomLevel:.5, alignment:'center'}
export const DEFAULT_ZOOMREADY = false


export interface FbActionWithData<T extends string, D> extends Action<T> {
  data: D;
  undoId: number | null;
  framebufIndex: number | null;
}

// Fb actions are handled specially as these actions are always tagged
// with a framebufIndex and an undoId.
export function createFbAction<T extends string>(type: T, framebufIndex: number|null, undoId: number|null): FbActionWithData<T, undefined>
export function createFbAction<T extends string, D>(type: T, framebufIndex: number|null, undoId: number|null, data: D): FbActionWithData<T, D>
export function createFbAction<T extends string, D>(type: T, framebufIndex: number|null, undoId: number|null, data?: D) {
  return data === undefined ?
    { type, framebufIndex, undoId } :
    { type, data, framebufIndex, undoId };
}

type SetCharParams = Coord2 & { screencode?: number, color?: number };
type SetBrushParams = Coord2 & { brushType:number, brush: Brush, brushColor: number };
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

const SET_BACKGROUND_COLOR = 'Framebuffer/SET_BACKGROUND_COLOR'
const SET_BORDER_COLOR = 'Framebuffer/SET_BORDER_COLOR'
const SET_BORDER_ON= 'Framebuffer/SET_BORDER_ON'
const SET_CHARSET = 'Framebuffer/SET_CHARSET'
const SET_NAME = 'Framebuffer/SET_NAME'
const SET_DIMS = 'Framebuffer/SET_DIMS'
const SET_ZOOM = 'Framebuffer/SET_ZOOM'
const SET_ZOOMREADY = 'Framebuffer/SET_ZOOMREADY'


const actionCreators = {
  setPixel: (data: SetCharParams, undoId: number|null, framebufIndex: number|null) => createFbAction(SET_PIXEL, framebufIndex, undoId, data),
  setBrush: (data: SetBrushParams, undoId: number|null, framebufIndex: number) => createFbAction(SET_BRUSH, framebufIndex, undoId, data),
  importFile: (data: ImportFileParams, framebufIndex: number) => createFbAction(IMPORT_FILE, framebufIndex, null, data),
  clearCanvas: (framebufIndex: number) => createFbAction(CLEAR_CANVAS, framebufIndex, null),
  copyFramebuf: (data: Framebuf, framebufIndex: number) => createFbAction(COPY_FRAMEBUF, framebufIndex, null, data),
  setFields: (data: any, framebufIndex: number) => createFbAction(SET_FIELDS, framebufIndex, null, data),
  shiftHorizontal: (data: -1|1, framebufIndex: number) => createFbAction(SHIFT_HORIZONTAL, framebufIndex, null, data),
  shiftVertical: (data: -1|1, framebufIndex: number) => createFbAction(SHIFT_VERTICAL, framebufIndex, null, data),

  setBackgroundColor: (data: number, framebufIndex: number) => createFbAction(SET_BACKGROUND_COLOR, framebufIndex, null, data),
  setBorderColor: (data: number, framebufIndex: number) => createFbAction(SET_BORDER_COLOR, framebufIndex, null, data),
  setBorderOn: (data: boolean, framebufIndex: number) => createFbAction(SET_BORDER_ON, framebufIndex, null, data),

  setCharset: (data: string, framebufIndex: number) => createFbAction(SET_CHARSET, framebufIndex, null, data),
  setName: (data: string|undefined, framebufIndex: number) => createFbAction(SET_NAME, framebufIndex, null, data),

  setDims: (data: { width: number, height: number }, framebufIndex: number) => createFbAction(SET_DIMS, framebufIndex, null, data),
  setZoom: (data: {zoomLevel:number,alignment: string}, framebufIndex: number) => createFbAction(SET_ZOOM, framebufIndex, null, data),
  setZoomReady: (data: boolean, framebufIndex: number) => createFbAction(SET_ZOOMREADY, framebufIndex, null, data),
  resizeCanvas: (data: {rWidth: number, rHeight:number,rDir: Coord2}, framebufIndex: number) => createFbAction(RESIZE_CANVAS, framebufIndex, null,data),

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

  static bindDispatch (dispatch: Dispatch) {
    return bindActionCreators(Framebuffer.actions, dispatch)
  }
}

function setChar(fbState: Framebuf, {row, col, screencode, color}: SetCharParams): Pixel[][] {
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
            return { ...pix, code:screencode }
          }
          return { code:screencode, color }
        }
        return pix
      })
    }
    return pixelRow
  })
}

function setBrush(framebuf: Pixel[][], {row, col, brush, brushType, brushColor }: SetBrushParams): Pixel[][] {
  const { min, max } = brush.brushRegion



  return framebuf.map((pixelRow, y) => {
    const yo = y - row
    if (yo >= min.row && yo <= max.row) {
      return pixelRow.map((pix, x) => {
        const xo = x - col
        if (xo  >= min.col && xo <= max.col) {
          const bpix = brush.framebuf[yo - min.row][xo - min.col]
          const fpix = framebuf[y][x]

          let code = bpix.code;
          let color = bpix.color;

          if(brushType == BrushType.Raw)
          {
            //return all data and paste transparency info as well
            return {
              code: code,
              color: color
            }
          }
          else
          {
            //default paste char and colors
            if(brushType == BrushType.CharsOnly)
            {
              //paste char info only
              color = fpix.color;
            }
            else if(brushType == BrushType.ColorsOnly)
            {
              //paste color data only
              code = fpix.code;
            }
            else if(brushType == BrushType.ColorStamp)
            {
              //paste color mono color stamp (currently selected color)
              color = brushColor;
            }
            if(bpix.code!==96)
            {
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
  return [arr[arr.length-1], ...arr.slice(0, arr.length-1)];

}

function shiftHorizontal(framebuf: Pixel[][], dir: -1 | 1) {
  return framebuf.map((row) => rotateArr(row, dir))
}

function shiftVertical(framebuf: Pixel[][], dir: -1 | 1) {
  return rotateArr(framebuf, dir);
}

function emptyFramebuf(width: number, height: number): Pixel[][] {
  return Array(height).fill(Array(width).fill({code: 32, color:14}))
}

function mapPixels(fb: Framebuf, mapFn: (fb: Framebuf) => Pixel[][]) {
  return {
    ...fb,
    framebuf: mapFn(fb),
    width:mapFn(fb)[0].length,
    height:mapFn(fb).length,
  }
}

function resizeFrameBuf(framebuf: Pixel[][], data:{rWidth:number,rHeight:number,rDir:Coord2}) {
 // return framebuf.map((row) => rotateArr(row, dir))
const {rWidth,rHeight,rDir} = data;

const sWidth = framebuf[0].length;
const sHeight = framebuf.length;
const exChar = {code: 32, color:14};

console.log(rWidth,sWidth,rHeight,sHeight);

// Array(height).fill(Array(width).fill({code: 32, color:14}))

if(rWidth>sWidth)
{
  //expand width
  if(rHeight>sHeight)
  {
    //expand width/height
    return  [...framebuf, ...Array(rHeight-sHeight).fill(Array(sWidth).fill(exChar))].map((row) => [...row,...Array(rWidth-sWidth).fill(exChar)]);

  }
  else
  {
    //expand width and crop height
    return framebuf.slice(0,rHeight).map((row) => [...row,...Array(rWidth-sWidth).fill(exChar)]);
  }
}
else
{
  //crop width
  if(rHeight>sHeight)
  {
    // crop width and expand height
    return [...framebuf, ...Array(rHeight-sHeight).fill(Array(sWidth).fill(exChar))].map((row) => row.slice(0,rWidth));

  }
  else
  {
    //crop width and crop height
    return framebuf.slice(0,rHeight).map((row) => row.slice(0,rWidth));
  }

}
 console.log("resizeFrameBuf:","sWidth:",framebuf[0].length,"rWidth:",rWidth,"sHeight:",framebuf.length,"rHeight",rHeight,rDir);






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
      case RESIZE_CANVAS:
        return mapPixels(state, fb => resizeFrameBuf(fb.framebuf, action.data));
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
      return updateField(state, 'charset', action.data);
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
        const currentzoom = state.zoom.zoomLevel;



        const { zoomLevel, alignment } = action.data;

        let zoom = currentzoom+zoomLevel;

        if(zoomLevel==0)
          zoom=1;

        if(zoom>=8.0)
        {
          zoom=8
        }
        if(zoom<.5)
        {
          zoom=.5
        }

        const updatedzoom = {zoomLevel:zoom, alignment:alignment}
        return updateField(state, 'zoom', updatedzoom);

        case SET_ZOOMREADY:
          return updateField(state, 'zoomReady', action.data);

        default:
        return state;
  }
}
