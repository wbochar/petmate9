import { Action, Dispatch, bindActionCreators } from 'redux'

import {
  Brush,
  BrushType,
  Coord2,
  Framebuf,
  GuideLayer,
  Pixel,
  TRANSPARENT_SCREENCODE,
  DEFAULT_FB_HEIGHT,
  DEFAULT_FB_WIDTH
} from './types'

import * as fp from '../utils/fp'
import { makeScreenName } from './utils'
import { ActionsUnion, updateField } from './typeUtils'



export const CHARSET_UPPER = 'upper'
export const CHARSET_LOWER = 'lower'
export const CHARSET_DIRART = 'dirart'
export const CHARSET_CBASE_UPPER = 'cbaseUpper'
export const CHARSET_CBASE_LOWER = 'cbaseLower'

export const CHARSET_C16_UPPER = 'c16Upper'
export const CHARSET_C16_LOWER = 'c16Lower'
export const CHARSET_C128_UPPER = 'c128Upper'
export const CHARSET_C128_LOWER = 'c128Lower'
/**
 * 80-column C128 VDC charset (8563/8568).  Unlike the 40-column C128
 * variants this one carries both upper- and lower-case ROM halves at the
 * same time — cells select between them via the alt-charset bit of the
 * VDC attribute byte.  See `src/utils/vdcAttr.ts` for the bit layout.
 */
export const CHARSET_C128_VDC = 'c128vdc'
export const CHARSET_VIC20_UPPER = 'vic20Upper'
export const CHARSET_VIC20_LOWER = 'vic20Lower'

export const CHARSET_PET_UPPER = 'petGfx'
export const CHARSET_PET_LOWER = 'petBiz'


export const DEFAULT_BACKGROUND_COLOR = 6
export const DEFAULT_BORDER_COLOR = 14
export const DEFAULT_BORDER_ON = true
export const DEFAULT_ZOOM = { zoomLevel: 2, alignment: 'left' }
export const DEFAULT_ZOOMREADY = false
// Sentinel zoom level used after import to trigger an initial zoom-to-fit.
// toolbar.ts setZoom treats any level > 100 as (level - 100) and resets position.
export const ZOOM_DEFAULT_AFTER_IMPORT = 102

// Valid zoom levels: 1/8 steps below 1x, integer steps at 1x and above.
// Every level satisfies zoom*8 % 8 == 0 so characters render pixel-perfect.
export const VALID_ZOOM_LEVELS = [
  0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875,
  1, 2, 3, 4, 5, 6, 7, 8
];

/** Snap an arbitrary zoom value to the nearest valid level. */
export function snapZoom(level: number): number {
  let closest = VALID_ZOOM_LEVELS[0];
  let minDist = Math.abs(level - closest);
  for (const z of VALID_ZOOM_LEVELS) {
    const dist = Math.abs(level - z);
    if (dist < minDist) {
      minDist = dist;
      closest = z;
    }
  }
  return closest;
}

/** Step to the next (+1) or previous (-1) valid zoom level from current. */
export function stepZoom(current: number, direction: 1 | -1): number {
  const snapped = snapZoom(current);
  const idx = VALID_ZOOM_LEVELS.indexOf(snapped);
  const newIdx = Math.max(0, Math.min(VALID_ZOOM_LEVELS.length - 1, idx + direction));
  return VALID_ZOOM_LEVELS[newIdx];
}


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




type SetCharParams = Coord2 & {
  screencode?: number,
  color?: number,
  /** VDC-only paint-attribute flag bits (high nibble) ORed into the cell's
   *  attr byte.  Ignored on non-VDC framebufs. */
  attrFlags?: number,
};
type SetBrushParams = Coord2 & { brushType: number, brush: Brush, brushColor: number };
type ImportFileParams = any // TODO ts

const SET_PIXEL = 'Framebuffer/SET_PIXEL'
const SET_PIXELS = 'Framebuffer/SET_PIXELS'
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
export const SET_BORDER_ON = 'Framebuffer/SET_BORDER_ON'
const SET_CHARSET = 'Framebuffer/SET_CHARSET'
const SET_NAME = 'Framebuffer/SET_NAME'
const SET_DIMS = 'Framebuffer/SET_DIMS'
export const SET_ZOOM = 'Framebuffer/SET_ZOOM'
export const SET_ZOOMREADY = 'Framebuffer/SET_ZOOMREADY'
const SWAP_COLORS = 'Framebuffer/SWAP_COLORS'
const SWAP_CHARS = 'Framebuffer/SWAP_CHARS'
const SET_ALL_COLORS = 'Framebuffer/SET_ALL_COLORS'
const SET_GUIDE_LAYER = 'Framebuffer/SET_GUIDE_LAYER'
/** XOR `mask` into the VDC attr byte of a single cell. No-op on non-VDC frames. */
const TOGGLE_VDC_ATTR = 'Framebuffer/TOGGLE_VDC_ATTR'
//const TOGGLE_BORDER = 'Framebuffer/TOGGLE_BORDER'


const actionCreators = {
  setPixel: (data: SetCharParams, undoId: number | null, framebufIndex: number | null) => createFbAction(SET_PIXEL, framebufIndex, undoId, data),
  setPixels: (data: SetCharParams[], undoId: number | null, framebufIndex: number | null) => createFbAction(SET_PIXELS, framebufIndex, undoId, data),
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
  /** Overwrite the colour of every cell in the framebuf with `data`.
   *  Used by the color picker's ctrl+shift click "paint all" action. */
  setAllColors: (data: number, framebufIndex: number) => createFbAction(SET_ALL_COLORS, framebufIndex, null, data),
  setGuideLayer: (data: GuideLayer | undefined, framebufIndex: number) => createFbAction(SET_GUIDE_LAYER, framebufIndex, null, data),
  /** Toggle (XOR) one or more VDC attribute bits on a single cell.  No-op
   *  for non-VDC framebufs.  Only the high-nibble flag bits should be
   *  passed; colour bits are always derived from `pixel.color`. */
  toggleVdcAttr: (
    data: { row: number; col: number; mask: number },
    undoId: number | null,
    framebufIndex: number | null,
  ) => createFbAction(TOGGLE_VDC_ATTR, framebufIndex, undoId, data),

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

/** Translate a (screencode, color) pair into a VDC-aware partial pixel.
 *  - screencode TRANSPARENT_SCREENCODE / 256 → explicit `transparent: true`
 *    (the cell keeps its glyph at SPACE so legacy renderers stay sane).
 *  - screencode 256–511 → stored as `code = sc & 0xff` plus the ALT bit
 *    in `attr`, so VDC's full 512-glyph space addresses cleanly.
 *  - colour updates always update both `color` and the low nibble of `attr`
 *    so the two views of foreground colour stay in sync.
 */
function applyVdcSet(
  prev: Pixel,
  screencode: number | undefined,
  color: number | undefined,
  attrFlags?: number,
): Pixel {
  const next: Pixel = { ...prev };
  if (screencode !== undefined) {
    if (screencode === TRANSPARENT_SCREENCODE) {
      next.transparent = true;
      next.code = 0x20;
      // Drop the ALT bit so the picker doesn't latch onto a stale half.
      const baseAttr = (typeof next.attr === 'number') ? next.attr : (next.color & 0x0f);
      next.attr = (baseAttr & 0x7f) & 0xff;
    } else {
      next.transparent = false;
      next.code = screencode & 0xff;
      const baseAttr = (typeof next.attr === 'number') ? next.attr : (next.color & 0x0f);
      const altBit = screencode >= 256 ? 0x80 : 0x00;
      next.attr = (((baseAttr & 0x7f) | altBit) & 0xff);
    }
  }
  if (color !== undefined) {
    next.color = color;
    const baseAttr = (typeof next.attr === 'number') ? next.attr : 0;
    next.attr = (((baseAttr & 0xf0) | (color & 0x0f)) & 0xff);
  }
  // Layer the toolbar's paint-attribute flags (RVS / UND / BLI) on top.
  // Mask to the high nibble so the colour low nibble cannot be clobbered,
  // and so that ALT (0x80) is *replaced* only when the caller explicitly
  // included it via the screencode branch above.  We *clear* the bits the
  // caller chose to manage and then OR their values in, so toggling a
  // toolbar flag off actually turns the bit off on subsequent paints.
  if (attrFlags !== undefined) {
    const userMask = (attrFlags & 0x70) & 0xff; // RVS|UND|BLI; ALT stays driven by screencode
    const cleared = ((next.attr ?? 0) & ~0x70) & 0xff;
    next.attr = (cleared | userMask) & 0xff;
  }
  return next;
}

function setChar(fbState: Framebuf, { row, col, screencode, color, attrFlags }: SetCharParams): Pixel[][] {
  const { framebuf, width, height, charset } = fbState
  if (row < 0 || row >= height ||
    col < 0 || col >= width) {
    return framebuf
  }
  const isVdc = charset === 'c128vdc';
  return framebuf.map((pixelRow, idx) => {
    if (row === idx) {
      return pixelRow.map((pix, x) => {
        if (col === x) {
          if (isVdc) return applyVdcSet(pix, screencode, color, attrFlags);
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

/** Apply a per-cell attribute toggle (`attr ^= mask`).  Used by the VDC
 *  RvsPen tool and the upcoming paint-attr toolbar to flip REVERSE /
 *  UNDERLINE / BLINK / ALTCHAR bits without rewriting the screencode. */
function toggleVdcAttrCell(
  fbState: Framebuf,
  { row, col, mask }: { row: number; col: number; mask: number },
): Pixel[][] {
  const { framebuf, width, height, charset } = fbState;
  if (charset !== 'c128vdc') return framebuf;
  if (row < 0 || row >= height || col < 0 || col >= width) return framebuf;
  return framebuf.map((pixelRow, y) => {
    if (y !== row) return pixelRow;
    return pixelRow.map((pix, x) => {
      if (x !== col) return pix;
      const baseAttr = (typeof pix.attr === 'number') ? pix.attr : (pix.color & 0x0f);
      return { ...pix, attr: ((baseAttr ^ mask) & 0xff) };
    });
  });
}

function setChars(fbState: Framebuf, pixels: SetCharParams[]): Pixel[][] {
  const { framebuf, width, height, charset } = fbState
  // Build a lookup map keyed by "row,col" for O(1) access per cell,
  // and a set of affected rows to skip unchanged rows entirely.
  const changeMap = new Map<string, SetCharParams>()
  const affectedRows = new Set<number>()
  for (const p of pixels) {
    if (p.row >= 0 && p.row < height && p.col >= 0 && p.col < width) {
      changeMap.set(`${p.row},${p.col}`, p)
      affectedRows.add(p.row)
    }
  }
  const isVdc = charset === 'c128vdc';
  return framebuf.map((pixelRow, y) => {
    if (!affectedRows.has(y)) return pixelRow
    return pixelRow.map((pix, x) => {
      const change = changeMap.get(`${y},${x}`)
      if (!change) return pix
      if (isVdc) return applyVdcSet(pix, change.screencode, change.color, change.attrFlags);
      if (change.screencode === undefined) {
        return { ...pix, color: change.color! }
      }
      if (change.color === undefined) {
        return { ...pix, code: change.screencode }
      }
      return { code: change.screencode, color: change.color }
    })
  })
}

function setBrush(framebuf: Pixel[][], { row, col, brush, brushType, brushColor }: SetBrushParams, charset?: string): Pixel[][] {
  const { min, max } = brush.brushRegion
  const isVdc = charset === 'c128vdc';

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

          if (brushType === BrushType.Raw) {
            //return all data and paste transparency info as well.
            // On VDC, propagate attr/transparent so attribute bits aren't
            // lost; on every other platform the result is identical to
            // the previous { code, color } shape.
            if (isVdc) {
              return {
                ...bpix,
                code,
                color,
              }
            }
            return { code, color }
          }
          else {
            //default paste char and colors
            if (brushType === BrushType.CharsOnly) {
              //paste char info only
              color = fpix.color;
            }
            else if (brushType === BrushType.ColorsOnly) {
              //paste color data only
              code = fpix.code;
            }
            else if (brushType === BrushType.ColorStamp) {
              //paste color mono color stamp (currently selected color)
              color = brushColor;
            }
            const bpixTransparent =
              bpix.transparent === true || bpix.code === TRANSPARENT_SCREENCODE;
            if (!bpixTransparent) {
              if (isVdc) {
                // VDC: keep the brush cell's attr (with low nibble synced
                // to the resolved colour) and drop transparency.  Falls
                // back to (color & 0x0f) when the brush came from a
                // non-VDC source.
                const baseAttr = (typeof bpix.attr === 'number')
                  ? (bpix.attr & 0xf0) | (color & 0x0f)
                  : (color & 0x0f);
                return {
                  code,
                  color,
                  attr: baseAttr & 0xff,
                  transparent: false,
                };
              }
              return { code, color };
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

function emptyFramebuf(width: number, height: number, defaultColor: number = 14): Pixel[][] {
  // Use Array.from to ensure every row and every cell is a distinct object,
  // avoiding the shared-reference pitfall of Array.fill().
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ code: 32, color: defaultColor }))
  )
}

/** Return the appropriate default foreground color for a charset. */
function defaultColorForCharset(charset: string): number {
  if (charset.startsWith('c16')) return 0x00;  // TED black (Plus/4 default text)
  return 14;  // C64 light blue
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

// VDC pixels carry an `attr` byte whose low nibble mirrors the colour.
// Whenever a bulk reducer rewrites colour we update both halves so the
// renderer / exporter stay in sync; non-VDC cells (no `attr`) are left
// alone, preserving their original `{ code, color }` shape exactly.
function syncAttrColor(cell: Pixel, color: number): Pixel {
  if (typeof cell.attr === 'number') {
    return {
      ...cell,
      color,
      attr: ((cell.attr & 0xf0) | (color & 0x0f)) & 0xff,
    };
  }
  return { ...cell, color };
}

function convertFrameBufToMono(framebuf: Pixel[][]) {
  // Sets every cell's color to 1 (monochrome/white), preserving character codes
  // (and any VDC attr/transparent fields).
  return framebuf.map((row) => row.map((cell) => syncAttrColor(cell, 1)))
}

function frameBufStrip8(framebuf: Pixel[][]) {
  // Clamps colors to the lower 8-color range (strips colors 8–15 back to 1).
  return framebuf.map((row) => row.map((cell) => cell.color >= 7 ? syncAttrColor(cell, 1) : cell))
}



function swapFrameBufColors(framebuf: Pixel[][], colors: { srcColor: number, destColor: number }) {
  const { srcColor, destColor } = colors;
  return framebuf.map((row) => row.map((cell) => cell.color === srcColor ? syncAttrColor(cell, destColor) : cell))
}

function swapFrameBufChars(framebuf: Pixel[][], chars: { srcChar: number, destChar: number }) {
  const { srcChar, destChar } = chars;
  return framebuf.map((row) => row.map((cell) => cell.code === srcChar ? { ...cell, code: destChar } : cell))
}

/** Replace every cell's colour with `color` while preserving the codes. */
function setAllFrameBufColors(framebuf: Pixel[][], color: number) {
  return framebuf.map((row) => row.map((cell) => syncAttrColor(cell, color)))
}


function resizeFrameBuf(framebuf: Pixel[][], data: { rWidth: number, rHeight: number, rDir: Coord2, isCrop: boolean }, charset: string = 'upper') {
  const { rWidth, rHeight, isCrop } = data;

  const sWidth = framebuf[0].length;
  const sHeight = framebuf.length;
  const exChar = { code: 32, color: defaultColorForCharset(charset) };

  const emptyRow = (w: number) => Array.from({ length: w }, () => ({ ...exChar }));

  if (rWidth > sWidth) {
    if (rHeight > sHeight) {
      // Expand both width and height
      const expanded = [...framebuf, ...Array.from({ length: rHeight - sHeight }, () => emptyRow(sWidth))];
      return expanded.map((row) => [...row, ...emptyRow(rWidth - sWidth)]);
    } else {
      // Expand width, crop height
      return framebuf.slice(0, rHeight).map((row) => [...row, ...emptyRow(rWidth - sWidth)]);
    }
  } else {
    if (isCrop) {
      if (rHeight > sHeight) {
        // Crop width, expand height
        const expanded = [...framebuf, ...Array.from({ length: rHeight - sHeight }, () => emptyRow(sWidth))];
        return expanded.map((row) => row.slice(0, rWidth));
      } else {
        // Crop both
        return framebuf.slice(0, rHeight).map((row) => row.slice(0, rWidth));
      }
    }
    else {
      // Width is same or smaller; crop to new dimensions.
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
    case SET_PIXELS:
      return mapPixels(state, fb => setChars(fb, action.data));
    case SET_BRUSH:
      return mapPixels(state, fb => setBrush(fb.framebuf, action.data, fb.charset));
    case TOGGLE_VDC_ATTR:
      return mapPixels(state, fb => toggleVdcAttrCell(fb, action.data));
    case CLEAR_CANVAS:
      return mapPixels(state, _fb => emptyFramebuf(state.width, state.height, defaultColorForCharset(state.charset)));
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
        return resizeFrameBuf(fb.framebuf, action.data, state.charset)
      });
    case SWAP_COLORS:
      return mapPixels(state, fb => {
        return swapFrameBufColors(fb.framebuf, action.data)
      });
    case SWAP_CHARS:
      return mapPixels(state, fb => {
        return swapFrameBufChars(fb.framebuf, action.data)
      });
    case SET_ALL_COLORS:
      return mapPixels(state, fb => {
        return setAllFrameBufColors(fb.framebuf, action.data)
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
        zoom: c.zoom ?? { zoomLevel: ZOOM_DEFAULT_AFTER_IMPORT, alignment: 'left' },
        zoomReady: false,
        name,
        ...(c.guideLayer ? { guideLayer: c.guideLayer } : {})
      }
    case SET_BACKGROUND_COLOR:
      return updateField(state, 'backgroundColor', action.data);
    case SET_BORDER_COLOR:
      return updateField(state, 'borderColor', action.data);
    case SET_BORDER_ON:
      return updateField(state, 'borderOn', action.data);
    case SET_CHARSET:
      switch (action.data.substring(0, 3)) {
        case "pet":

          return {
            ...state,
            borderColor: 0,
            backgroundColor: 0,
            charset: action.data,

          }

        case "vic":
          return {
            ...state,
            borderColor: 3,
            backgroundColor: 1,
            charset: action.data,

          }

        case "c16":
          // TED color bytes: (lum << 4) | hue
          // Match Plus/4 boot screen: pink border, white background
          return {
            ...state,
            borderColor: 0x6B,
            backgroundColor: 0x71,
            charset: action.data,
          }

        default:
          return {
            ...state,
            borderColor: 14,
            backgroundColor: 6,
            charset: action.data,

          }


      }



    case SET_NAME:
      return updateField(state, 'name', action.data);
    case SET_DIMS: {
      const { width, height } = action.data;
      return {
        ...state,
        width: action.data.width,
        height: action.data.height,
        framebuf: emptyFramebuf(width, height, defaultColorForCharset(state.charset))
      }
    }
    case SET_ZOOM: {
      const { zoomLevel, alignment } = action.data;
      return updateField(state, 'zoom', { zoomLevel, alignment });
    }

    case SET_ZOOMREADY:
      return updateField(state, 'zoomReady', action.data);

    case SET_GUIDE_LAYER:
      return {
        ...state,
        guideLayer: action.data
      };

    default:
      return state;
  }
}
