
import { bindActionCreators, Dispatch } from 'redux'

import { Framebuffer, snapZoom, stepZoom } from './editor'
import * as Screens from './screens'
import { Toolbar as IToolbar, Transform, RootStateThunk, Coord2, Pixel, BrushRegion, Font, Brush, Tool, Angle360, FramebufUIState, DEFAULT_FB_WIDTH, DEFAULT_FB_HEIGHT, LinePreset, BoxPreset, BoxSide, FadeMode, FadeSource, FadeStepStart, FadeStepChoice, FadeStepSort, FadeCharsetSettings, FadePresetToggles, CustomFadeSource, TexturePreset } from './types'

import * as selectors from './selectors'
import * as screensSelectors from '../redux/screensSelectors'
import {
  getSettingsPaletteRemap
} from '../redux/settingsSelectors'
import * as utils from '../utils'
import * as brush from './brush'
import { ActionsUnion, createAction, updateField, DispatchPropsFromActions } from './typeUtils'
import { FileFormat } from './typesExport';
import * as matrix from '../utils/matrix';
import { getJSON, getPNG } from "../utils/exporters";

import {
  FramebufWithFont
} from "../redux/types";
import { TRANSPARENT_SCREENCODE } from "../redux/types";

import { getSettingsCurrentColorPalette } from "../redux/settingsSelectors";
import { DEFAULT_COLORS_BY_GROUP, getColorGroup } from '../utils/palette';

import { electron } from '../utils/electronImports'


const defaultFramebufUIState: FramebufUIState = {
  canvasTransform: matrix.ident(),
  canvasFit: 'nofit'
};

const emptyTransform: Transform = {
  mirror: 0,
  rotate: 0
}

function rotate(transform: Transform, dir: number): Transform {

  let currentRotation = transform.rotate
  let newRotation = currentRotation - 90 * dir

  if (newRotation < 0)
    newRotation = 270;
  if (newRotation > 270)
    newRotation = 0;


  return {
    ...transform,
    rotate: ((newRotation) % 360) as Angle360
  }
}

function mirror(transform: Transform, mirror: number) {
  return {
    ...transform,
    mirror: transform.mirror ^ mirror
  }
}

function dispatchForCurrentFramebuf(
  f: (dispatch: Dispatch, framebufIndex: number) => void
): RootStateThunk {
  return (dispatch, getState) => {
    const state = getState();
    const framebufIndex = screensSelectors.getCurrentScreenFramebufIndex(state);
    if (framebufIndex === null) {
      return;
    }
    f(dispatch, framebufIndex);
  }
}

const initialBrushValue = {
  brush: null as (Brush | null),
  brushRegion: null as (BrushRegion | null),
  brushTransform: emptyTransform
}

const DEFAULT_COLOR = 14; // light blue

const defaultSide = (chars: number[]): BoxSide => ({
  chars, colors: chars.map(() => DEFAULT_COLOR),
  mirror: false, stretch: false, repeat: true, startEnd: 'none',
});

const defaultBoxPresets: BoxPreset[] = [
  {
    name: 'ROUNDED',
    corners: [0x55, 0x49, 0x4A, 0x4B], cornerColors: [DEFAULT_COLOR, DEFAULT_COLOR, DEFAULT_COLOR, DEFAULT_COLOR],
    top: defaultSide([0x43]), bottom: defaultSide([0x43]),
    left: defaultSide([0x42]), right: defaultSide([0x42]),
    fill: 256, fillColor: DEFAULT_COLOR,
  },
  {
    name: 'SQUAREANDBROKEN',
    corners: [0x70, 0x6E, 0x6D, 0x7D], cornerColors: [DEFAULT_COLOR, DEFAULT_COLOR, DEFAULT_COLOR, DEFAULT_COLOR],
    top: { chars: [0x2D, 0x43, 0x2D], colors: [DEFAULT_COLOR, DEFAULT_COLOR, DEFAULT_COLOR], mirror: false, stretch: false, repeat: true, startEnd: 'none' },
    bottom: { chars: [0x43, 0x2D, 0x43], colors: [DEFAULT_COLOR, DEFAULT_COLOR, DEFAULT_COLOR], mirror: false, stretch: false, repeat: true, startEnd: 'none' },
    left: { chars: [0x21, 0x42, 0x42, 0x3A], colors: [DEFAULT_COLOR, DEFAULT_COLOR, DEFAULT_COLOR, DEFAULT_COLOR], mirror: false, stretch: false, repeat: true, startEnd: 'none' },
    right: { chars: [0x42, 0x21, 0x3A, 0x42], colors: [DEFAULT_COLOR, DEFAULT_COLOR, DEFAULT_COLOR, DEFAULT_COLOR], mirror: false, stretch: false, repeat: true, startEnd: 'none' },
    fill: 256, fillColor: DEFAULT_COLOR,
  },
  {
    name: 'OUTSIDESQUARE',
    corners: [0x4F, 0x50, 0x4C, 0x7A], cornerColors: [DEFAULT_COLOR, DEFAULT_COLOR, DEFAULT_COLOR, DEFAULT_COLOR],
    top: { chars: [0x63, 0x77, 0x63], colors: [DEFAULT_COLOR, DEFAULT_COLOR, DEFAULT_COLOR], mirror: false, stretch: false, repeat: true, startEnd: 'none' },
    bottom: { chars: [0x6F, 0x64, 0x6F], colors: [DEFAULT_COLOR, DEFAULT_COLOR, DEFAULT_COLOR], mirror: false, stretch: false, repeat: true, startEnd: 'none' },
    left: { chars: [0x74, 0x75], colors: [DEFAULT_COLOR, DEFAULT_COLOR], mirror: false, stretch: false, repeat: true, startEnd: 'none' },
    right: { chars: [0x6A, 0x76], colors: [DEFAULT_COLOR, DEFAULT_COLOR], mirror: false, stretch: false, repeat: true, startEnd: 'none' },
    fill: 256, fillColor: DEFAULT_COLOR,
  },
  {
    name: 'POINTYARC',
    corners: [0xEC, 0xFB, 0xFC, 0xFE], cornerColors: [DEFAULT_COLOR, DEFAULT_COLOR, DEFAULT_COLOR, DEFAULT_COLOR],
    top: { chars: [0x43, 0x46], colors: [DEFAULT_COLOR, DEFAULT_COLOR], mirror: true, stretch: true, repeat: false, startEnd: 'none' },
    bottom: { chars: [0x46, 0x43], colors: [DEFAULT_COLOR, DEFAULT_COLOR], mirror: true, stretch: true, repeat: false, startEnd: 'none' },
    left: { chars: [0x47, 0x42], colors: [DEFAULT_COLOR, DEFAULT_COLOR], mirror: true, stretch: true, repeat: true, startEnd: 'none' },
    right: { chars: [0x5D, 0x47], colors: [DEFAULT_COLOR, DEFAULT_COLOR], mirror: true, stretch: true, repeat: false, startEnd: 'none' },
    fill: 256, fillColor: DEFAULT_COLOR,
  },
];

const DEFAULT_TEXTURE_COLOR = 14;

const defaultTexturePresets: TexturePreset[] = [
  { name: 'MONO DITHER', chars: [0xE6, 0x66], colors: [14, 14], options: [true, false, false, false, false, false], random: false },
  { name: '10 PRINT', chars: [0x4E, 0x4D], colors: [14, 14], options: [false, false, false, false, true, false], random: true },
  { name: 'BLOCK DISINTEGRATE', chars: [0x7B, 0x7E, 0x7C, 0x6C, 0x20, 0x2E, 0xD0, 0x2E], colors: [1, 11, 12, 15, 1, 1, 11, 11], options: [false, false, false, false, true, false], random: true },
  { name: 'BUBBLE DOTS', chars: [0xE6, 0x66], colors: [14, 14], options: [false, false, false, false, true, false], random: false },
  { name: 'BRA HOOKS', chars: [0x55, 0x66, 0x49, 0xE6], colors: [14, 14, 14, 14], options: [false, false, false, false, true, false], random: false },
  { name: 'CHEESE GRATER', chars: [0xE8, 0x68, 0x68, 0xE6], colors: [14, 14, 14, 14], options: [false, false, false, false, true, false], random: false },
  { name: 'PEACOCK', chars: [0xE6, 0x66, 0x4B, 0x66], colors: [14, 14, 14, 14], options: [false, false, false, false, true, false], random: false },
  { name: 'TRIANGLE BANDS', chars: [0x70, 0x7D, 0xEC, 0xFE, 0xF0, 0xFD, 0xEC, 0xFE], colors: [14, 14, 14, 14, 14, 14, 14, 14], options: [false, false, false, false, true, false], random: false },
  { name: 'TWISTS', chars: [0x55, 0x44, 0x40, 0x4B], colors: [14, 14, 14, 14], options: [false, false, false, false, true, false], random: false },
  { name: 'BRAIDS', chars: [0x55, 0x5B, 0x5B, 0x4B], colors: [14, 14, 14, 14], options: [false, false, false, false, true, false], random: false },
  { name: 'BRICK LANE', chars: [0xF1, 0xF2, 0xF1, 0xF2], colors: [14, 14, 14, 14], options: [false, false, false, false, true, false], random: false },
  { name: 'STATIC COMPRESSOR', chars: [0x68, 0x5C, 0x66, 0xE8, 0xDC, 0xE6, 0x7F, 0xFF], colors: [14, 14, 14, 14, 14, 14, 14, 14], options: [false, false, false, false, true, false], random: true },
  { name: 'EASTER BUNNY', chars: [0x7E, 0xEC, 0x7E, 0x7E, 0xEC, 0x7E, 0xEC, 0x7E], colors: [14, 14, 14, 14, 14, 14, 14, 14], options: [false, false, false, false, true, false], random: false },
  { name: 'GRAPH BRAIDS', chars: [0xCB, 0xD5, 0xDB, 0xDB, 0xDB, 0xDB, 0xCB, 0xD5], colors: [14, 14, 14, 14, 14, 14, 14, 14], options: [false, false, false, false, true, false], random: false },
  { name: 'TRUCK TREDS NE', chars: [0xEC, 0xFB, 0xFE, 0xFB, 0xEC, 0xFB, 0xFE, 0xFB], colors: [14, 14, 14, 14, 14, 14, 14, 14], options: [false, false, false, false, true, false], random: false },
  { name: 'TRUCK TREDS SW', chars: [0xEC, 0xFC, 0xFE, 0xE6], colors: [14, 14, 14, 14], options: [false, false, false, false, true, false], random: false },
  { name: 'TEARS IN RAIN', chars: [0x20, 0x2E, 0x21, 0x3A, 0x5D, 0x3A, 0x5D, 0x21, 0x42, 0x42], colors: [14, 14, 14, 14, 14, 14, 14, 14, 14, 14], options: [true, false, false, false, false, false], random: true },
  { name: 'BULLFROG MAZE', chars: [0xFB, 0xFB, 0xE2, 0xE1, 0xE1, 0xE1, 0xE1, 0xE1], colors: [14, 14, 14, 14, 14, 14, 14, 14], options: [true, false, false, false, false, false], random: true },
  { name: 'SQUARE WICKER', chars: [0xC0, 0xEE, 0xC2], colors: [14, 14, 14], options: [true, false, false, false, false, false], random: true },
  { name: 'BORG X1', chars: [0xEC, 0x7E, 0xFA, 0x4F], colors: [14, 14, 14, 14], options: [true, false, false, false, true, false], random: true },
  { name: 'BORG X2', chars: [0xEC, 0x7E, 0xFA, 0x4F], colors: [14, 14, 14, 14], options: [true, false, false, false, true, false], random: true },
  { name: 'DEFRAG', chars: [0xE6, 0xE6, 0xFA, 0x4F], colors: [14, 14, 14, 14], options: [true, false, false, false, true, false], random: true },
  { name: 'BOING', chars: [0xE6, 0x5B, 0x66, 0x7D], colors: [14, 14, 14, 14], options: [false, false, false, false, true, false], random: false },
  { name: 'DNA REPLICATION', chars: [0xE6, 0x56, 0x66, 0x56], colors: [14, 14, 14, 14], options: [false, false, false, false, true, false], random: true },
  { name: 'WAVES', chars: [0x66, 0x6E, 0x66, 0x6E], colors: [14, 14, 14, 14], options: [false, false, false, false, true, false], random: false },
  { name: 'TADPOLES', chars: [0xE6, 0x66, 0xDC, 0xDC], colors: [14, 14, 14, 14], options: [false, false, false, false, true, false], random: false },
  { name: 'FRENCH HORNS', chars: [0xE6, 0x5B, 0x66, 0x73], colors: [14, 14, 14, 14], options: [false, false, false, false, true, false], random: false },
  { name: 'MAHJONG', chars: [0xE6, 0xD6, 0x66, 0x73], colors: [14, 14, 14, 14], options: [false, false, false, false, true, false], random: false },
  { name: 'CHICKEN BONES', chars: [0xE6, 0x4D, 0xE6, 0x4E], colors: [14, 14, 14, 14], options: [false, false, false, false, true, false], random: false },
  { name: 'BX CABLE', chars: [0xE6, 0xC9, 0xE6, 0xFA], colors: [14, 14, 14, 14], options: [false, false, false, false, true, false], random: false },
  { name: 'DEVIL HORNS', chars: [0xE6, 0x9E, 0x66, 0x9E], colors: [14, 14, 14, 14], options: [false, false, false, false, true, false], random: false },
  { name: 'NO IDEA', chars: [0xEB, 0x68, 0x7D, 0x7D, 0x66, 0x68, 0x56, 0xFA], colors: [14, 14, 14, 14, 14, 14, 14, 14], options: [false, false, false, false, true, false], random: false },
  { name: 'MOD TRACKER', chars: [0xEB, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22], colors: [14, 14, 14, 14, 14, 14, 14, 14], options: [false, false, false, false, false, false], random: false },
  { name: 'WISHBONES', chars: [0xE6, 0x42, 0xE6, 0x43], colors: [14, 14, 14, 14], options: [false, false, false, false, true, false], random: false },
  { name: 'OOOOOOO', chars: [0xE6, 0xD6, 0xE6, 0xD6], colors: [14, 14, 14, 14], options: [false, false, false, false, true, false], random: false },
  { name: 'TEXTURE UNKNOWN', chars: [0xE6, 0xD6, 0x66, 0xD6, 0xE6, 0x4E, 0x66, 0x56], colors: [14, 14, 14, 14, 14, 14, 14, 14], options: [false, false, false, false, true, false], random: false },
];

const defaultCustomFadeSources: CustomFadeSource[] = [
  { id: 'hline-b2t', name: 'H LINE B2T', screencodes: [32, 98, 100, 111, 121, 160, 227, 247, 248] },
  { id: 'hline-t2b', name: 'H LINE T2B', screencodes: [32, 99, 119, 120, 224, 226, 228, 239, 249] },
  { id: 'vline-l2r', name: 'V LINE L2R', screencodes: [32, 97, 101, 116, 117, 160, 231, 234, 246] },
  { id: 'vline-r2l', name: 'V LINE R2L', screencodes: [32, 103, 106, 118, 160, 225, 229, 244, 245] },
  { id: 'blocky',    name: 'BLOCKY',     screencodes: [32, 92, 102, 104, 108, 123, 124, 126, 127, 160, 204, 207, 208, 220, 230, 232, 236, 250, 251, 252, 254, 255] },
];

const defaultFadeSourceToggles: Record<string, FadePresetToggles> = {
  'AllCharacters':    { fadeShowSource: true, fadeStepStart: 'first', fadeStepCount: 1, fadeStepChoice: 'pingpong', fadeStepSort: 'default' },
  'AlphaNumeric':     { fadeShowSource: true, fadeStepStart: 'first', fadeStepCount: 1, fadeStepChoice: 'pingpong', fadeStepSort: 'default' },
  'AlphaNumExtended': { fadeShowSource: true, fadeStepStart: 'first', fadeStepCount: 1, fadeStepChoice: 'pingpong', fadeStepSort: 'default' },
  'PETSCII':          { fadeShowSource: true, fadeStepStart: 'first', fadeStepCount: 1, fadeStepChoice: 'pingpong', fadeStepSort: 'default' },
  'Custom:hline-b2t': { fadeShowSource: true, fadeStepStart: 'first', fadeStepCount: 1, fadeStepChoice: 'pingpong', fadeStepSort: 'default' },
  'Custom:hline-t2b': { fadeShowSource: true, fadeStepStart: 'first', fadeStepCount: 1, fadeStepChoice: 'pingpong', fadeStepSort: 'default' },
  'Custom:vline-l2r': { fadeShowSource: true, fadeStepStart: 'first', fadeStepCount: 1, fadeStepChoice: 'pingpong', fadeStepSort: 'default' },
  'Custom:vline-r2l': { fadeShowSource: true, fadeStepStart: 'first', fadeStepCount: 1, fadeStepChoice: 'pingpong', fadeStepSort: 'default' },
  'Custom:blocky':    { fadeShowSource: true, fadeStepStart: 'first', fadeStepCount: 0, fadeStepChoice: 'pingpong', fadeStepSort: 'random' },
};

export { defaultBoxPresets, defaultTexturePresets, defaultCustomFadeSources, defaultFadeSourceToggles };

export const defaultLinePresets: LinePreset[] = [
  { name: 'Line 1',  chars: [0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40] },
  { name: 'Line 2',  chars: [0x70,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x6e] },
  { name: 'Line 3',  chars: [0x6d,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x7d] },
  { name: 'Line 4',  chars: [0x55,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x49] },
  { name: 'Line 5',  chars: [0x4a,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x4b] },
  { name: 'Line 6',  chars: [0x3d,0x40,0x3d,0x40,0x3d,0x40,0x3d,0x40,0x3d,0x40,0x3d,0x40,0x3d,0x40,0x3d,0x40] },
  { name: 'Line 7',  chars: [0x46,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x46] },
  { name: 'Line 8',  chars: [0x52,0x46,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x46,0x52] },
  { name: 'Line 9',  chars: [0x6b,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x73] },
  { name: 'Line 10', chars: [0x72,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x72] },
  { name: 'Line 11', chars: [0x40,0x2d,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x2d,0x40] },
  { name: 'Line 12', chars: [0x71,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x71] },
  { name: 'Line 13', chars: [0x7c,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x7e] },
  { name: 'Line 14', chars: [0x6c,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x7b] },
  { name: 'Line 15', chars: [0x79,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x79] },
  { name: 'Line 16', chars: [0x62,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x62] },
  { name: 'Line 17', chars: [0x3d,0x3d,0x2d,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x2d,0x3d,0x3d] },
  { name: 'Line 18', chars: [0x42,0x100,0x100,0x100,0x100,0x100,0x100,0x100,0x100,0x100,0x100,0x100,0x100,0x100,0x100,0x42] },
  { name: 'Line 19', chars: [0x43,0x44,0x45,0x45,0x45,0x45,0x44,0x43,0x43,0x44,0x45,0x45,0x45,0x45,0x44,0x43] },
];

function moveTextCursor(curPos: Coord2, dir: Coord2, width: number, height: number) {
  const idx = (curPos.row + dir.row) * width + (curPos.col + dir.col) + width * height
  const wrapped = idx % (width * height)
  return {
    row: Math.floor(wrapped / width),
    col: Math.floor(wrapped % width)
  }
}

function asc2int(asc: string) {
  return asc.charCodeAt(0)
}

function convertAsciiToScreencode(asc: string) {
  if (asc.length !== 1) {
    return null
  }
  if (asc >= 'a' && asc <= 'z') {
    return asc2int(asc) - asc2int('a') + 1
  }
  if (asc >= 'A' && asc <= 'Z') {
    return asc2int(asc) - asc2int('A') + 0x41
  }
  if (asc >= '0' && asc <= '9') {
    return asc2int(asc) - asc2int('0') + 0x30
  }
  const otherChars: { [index: string]: number } = {
    '@': 0,
    ' ': 0x20,
    '!': 0x21,
    '"': 0x22,
    '#': 0x23,
    '$': 0x24,
    '%': 0x25,
    '&': 0x26,
    '\'': 0x27,
    '(': 0x28,
    ')': 0x29,
    '*': 0x2a,
    '+': 0x2b,
    ',': 0x2c,
    '-': 0x2d,
    '.': 0x2e,
    '/': 0x2f,
    ':': 0x3a,
    ';': 0x3b,
    '<': 0x3c,
    '=': 0x3d,
    '>': 0x3e,
    '?': 0x3f
  }
  if (asc in otherChars) {
    return otherChars[asc]
  }
  return null
}

const SET_SELECTED_CHAR = 'Toolbar/SET_SELECTED_CHAR'
const RESET_BRUSH = 'Toolbar/RESET_BRUSH'
const CAPTURE_BRUSH = 'Toolbar/CAPTURE_BRUSH'
const MIRROR_BRUSH = 'Toolbar/MIRROR_BRUSH'
const ROTATE_BRUSH = 'Toolbar/ROTATE_BRUSH'
const MIRROR_CHAR = 'Toolbar/MIRROR_CHAR'
const ROTATE_CHAR = 'Toolbar/ROTATE_CHAR'
const NEXT_CHARCODE = 'Toolbar/NEXT_CHARCODE'
const NEXT_COLOR = 'Toolbar/NEXT_COLOR'
const INVERT_CHAR = 'Toolbar/INVERT_CHAR'
const INVERT_SINGLE_CHAR = 'Toolbar/INVERT_SINGLE_CHAR'
const CLEAR_MOD_KEY_STATE = 'Toolbar/CLEAR_MOD_KEY_STATE'
const INC_UNDO_ID = 'Toolbar/INC_UNDO_ID'
const SET_FRAMEBUF_UI_STATE = 'Toolbar/SET_FRAMEBUF_UI_STATE'
const SET_COLOR = 'Toolbar/SET_COLOR'
const PASTE_TEXT = 'Toolbar/PASTE_TEXT'
const SELECT_ALL = 'Toolbar/SELECT_ALL'
const INVERT_BRUSH = 'Toolbar/INVERT_BRUSH'
const BRUSH_TO_NEW = 'Toolbar/BRUSH_TO_NEW'
const SET_ZOOM = 'Toolbar/SET_ZOOM'
const SET_TEXT_CAPS_LOCK = 'Toolbar/SET_TEXT_CAPS_LOCK'

function captureBrush(framebuf: Pixel[][], brushRegion: BrushRegion) {
  const { min, max } = utils.sortRegion(brushRegion)
  const fbH = framebuf.length;
  const fbW = fbH > 0 ? framebuf[0].length : 0;
  // Clamp the region to the framebuffer bounds
  const cMinRow = Math.max(0, min.row);
  const cMinCol = Math.max(0, min.col);
  const cMaxRow = Math.min(fbH - 1, max.row);
  const cMaxCol = Math.min(fbW - 1, max.col);
  if (cMinRow > cMaxRow || cMinCol > cMaxCol) return createAction(RESET_BRUSH);
  const h = cMaxRow - cMinRow + 1
  const w = cMaxCol - cMinCol + 1
  const capfb = Array(h)
  for (var y = 0; y < h; y++) {
    capfb[y] = framebuf[y + cMinRow].slice(cMinCol, cMaxCol + 1)
  }
  return createAction(CAPTURE_BRUSH, {
    framebuf: capfb,
    brushRegion: {
      min: { row: 0, col: 0 },
      max: { row: h - 1, col: w - 1 }
    }
  })
}

const actionCreators = {
  incUndoId: () => createAction(INC_UNDO_ID),
  resetBrush: () => createAction(RESET_BRUSH),
  brushToNew: () => createAction(BRUSH_TO_NEW),
  selectAll: () => createAction(SELECT_ALL),
  setSelectedChar: (coord: Coord2) => createAction(SET_SELECTED_CHAR, coord),
  nextCharcodeAction: (dir: Coord2, font: Font) => createAction(NEXT_CHARCODE, { dir, font }),
  nextColorAction: (dir: number, paletteRemap: number[]) => createAction(NEXT_COLOR, { dir, paletteRemap }),
  setColorAction: (slot: number, paletteRemap: number[]) => createAction(SET_COLOR, { slot, paletteRemap }),
  invertCharAction: (font: Font) => createAction(INVERT_CHAR, font),
  invertSingleCharAction: (font: Font, code: number) => createAction(INVERT_SINGLE_CHAR, { font, code }),
  invertBrushAction: (brush: Brush) => createAction(INVERT_BRUSH, brush),
  clearModKeyState: () => createAction(CLEAR_MOD_KEY_STATE),
  captureBrush,
  mirrorBrush: (axis: number) => createAction(MIRROR_BRUSH, axis),
  rotateBrush: (dir: number) => createAction(ROTATE_BRUSH, dir),
  mirrorChar: (axis: number) => createAction(MIRROR_CHAR, axis),
  rotateChar: (dir: number) => createAction(ROTATE_CHAR, dir),
  pasteText: () => createAction(PASTE_TEXT),
  setZoom: (level: number, alignment: string) => createAction(SET_ZOOM, { level, alignment }),
  setAllZoom: (level: number, alignment: string) => createAction(SET_ZOOM, { level, alignment }),
  setFramebufUIState: (framebufIndex: number, uiState?: FramebufUIState) => createAction(SET_FRAMEBUF_UI_STATE, { framebufIndex, uiState }),
  setTextColor: (c: number) => createAction('Toolbar/SET_TEXT_COLOR', c),
  setTextCursorPos: (pos: Coord2 | null) => createAction('Toolbar/SET_TEXT_CURSOR_POS', pos),
  setSelectedTool: (t: Tool) => createAction('Toolbar/SET_SELECTED_TOOL', t),
  setBrushRegion: (br: BrushRegion) => createAction('Toolbar/SET_BRUSH_REGION', br),
  setBrush: (b: Brush) => createAction('Toolbar/SET_BRUSH', b),
  setWorkspaceFilename: (fname: string | null) => createAction('Toolbar/SET_WORKSPACE_FILENAME', fname),
  setAltKey: (flag: boolean) => createAction('Toolbar/SET_ALT_KEY', flag),
  setCtrlKey: (flag: boolean) => createAction('Toolbar/SET_CTRL_KEY', flag),
  setTabKey: (flag: boolean) => createAction('Toolbar/SET_TAB_KEY', flag),
  setMetaKey: (flag: boolean) => createAction('Toolbar/SET_META_KEY', flag),
  setShiftKey: (flag: boolean) => createAction('Toolbar/SET_SHIFT_KEY', flag),
  setCAPSLockKey: (flag: boolean) => createAction('Toolbar/SET_CAPSLOCK_KEY', flag),
  setSpacebarKey: (flag: boolean) => createAction('Toolbar/SET_SPACEBAR_KEY', flag),
  setShowSettings: (flag: boolean) => createAction('Toolbar/SET_SHOW_SETTINGS', flag),
  setShowResizeSettings: (flag: boolean) => createAction('Toolbar/SET_SHOW_RESIZESETTINGS', flag),
  setShowProgressModal: (flag: boolean) => createAction('Toolbar/SET_SHOW_PROGRESSMODAL', flag),
  setProgressTitle: (progressTitle: string) => createAction('Toolbar/SET_PROGRESSTITLE', progressTitle),
  setProgressValue: (progressValue: number) => createAction('Toolbar/SET_PROGRESSVALUE', progressValue),
  setResizeWidth: (width: number) => createAction('Toolbar/SET_RESIZEWIDTH', width),
  setResizeHeight: (height: number) => createAction('Toolbar/SET_RESIZEHEIGHT', height),
  setResizeCrop: (resizeCrop: boolean) => createAction('Toolbar/SET_RESIZECROP', resizeCrop),
  setShowCustomFonts: (flag: boolean) => createAction('Toolbar/SET_SHOW_CUSTOM_FONTS', flag),
  setShowExport: (show: { show: boolean, fmt?: FileFormat }) => createAction('Toolbar/SET_SHOW_EXPORT', show),
  setShowImport: (show: { show: boolean, fmt?: FileFormat }) => createAction('Toolbar/SET_SHOW_IMPORT', show),
  setShowImportSeqAdv: (show: { show: boolean }) => createAction('Toolbar/SET_SHOW_IMPORT_SEQ_ADV', show),
  setSelectedPaletteRemap: (remapIdx: number) => createAction('Toolbar/SET_SELECTED_PALETTE_REMAP', remapIdx),
  setCanvasGrid: (flag: boolean) => createAction('Toolbar/SET_CANVAS_GRID', flag),
  setShortcutsActive: (flag: boolean) => createAction('Toolbar/SET_SHORTCUTS_ACTIVE', flag),
  setNewScreenSize: (dims: { width: number, height: number }) => createAction('Toolbar/SET_NEW_SCREEN_SIZE', dims),
  swapColors: (colors: { srcColor: number, destColor: number }) => createAction('Toolbar/SWAP_COLORS', colors),
  swapChars: (chars: { srcChar: number, destChar: number }) => createAction('Toolbar/SWAP_CHARS', chars),
  setTextCapsLock: (flag: boolean) => createAction(SET_TEXT_CAPS_LOCK, flag),
  setGuideLayerVisible: (flag: boolean) => createAction('Toolbar/SET_GUIDE_LAYER_VISIBLE', flag),
  setLinePresets: (presets: LinePreset[]) => createAction('Toolbar/SET_LINE_PRESETS', presets),
  setSelectedLinePresetIndex: (index: number) => createAction('Toolbar/SET_SELECTED_LINE_PRESET_INDEX', index),
  addLinePreset: (preset: LinePreset) => createAction('Toolbar/ADD_LINE_PRESET', preset),
  updateLinePreset: (index: number, preset: LinePreset) => createAction('Toolbar/UPDATE_LINE_PRESET', { index, preset }),
  removeLinePreset: (index: number) => createAction('Toolbar/REMOVE_LINE_PRESET', index),
  setFadeMode: (mode: FadeMode) => createAction('Toolbar/SET_FADE_MODE', mode),
  setFadeStrength: (strength: number) => createAction('Toolbar/SET_FADE_STRENGTH', strength),
  setFadeSource: (source: FadeSource) => createAction('Toolbar/SET_FADE_SOURCE', source),
  setFadeStepStart: (start: FadeStepStart) => createAction('Toolbar/SET_FADE_STEP_START', start),
  setFadeStepCount: (count: number) => createAction('Toolbar/SET_FADE_STEP_COUNT', count),
  setFadeStepChoice: (choice: FadeStepChoice) => createAction('Toolbar/SET_FADE_STEP_CHOICE', choice),
  setFadeStepSort: (sort: FadeStepSort) => createAction('Toolbar/SET_FADE_STEP_SORT', sort),
  setFadeShowSource: (flag: boolean) => createAction('Toolbar/SET_FADE_SHOW_SOURCE', flag),
  setFadeEditMode: (flag: boolean) => createAction('Toolbar/SET_FADE_EDIT_MODE', flag),
  incFadeLinearCounter: () => createAction('Toolbar/INC_FADE_LINEAR_COUNTER'),
  switchFadeCharset: (prevCharset: string, nextCharset: string) => createAction('Toolbar/SWITCH_FADE_CHARSET', { prevCharset, nextCharset }),
  setBoxPresets: (presets: BoxPreset[]) => createAction('Toolbar/SET_BOX_PRESETS', presets),
  setSelectedBoxPresetIndex: (index: number) => createAction('Toolbar/SET_SELECTED_BOX_PRESET_INDEX', index),
  addBoxPreset: (preset: BoxPreset) => createAction('Toolbar/ADD_BOX_PRESET', preset),
  updateBoxPreset: (index: number, preset: BoxPreset) => createAction('Toolbar/UPDATE_BOX_PRESET', { index, preset }),
  removeBoxPreset: (index: number) => createAction('Toolbar/REMOVE_BOX_PRESET', index),
  setTexturePresets: (presets: TexturePreset[]) => createAction('Toolbar/SET_TEXTURE_PRESETS', presets),
  setSelectedTexturePresetIndex: (index: number) => createAction('Toolbar/SET_SELECTED_TEXTURE_PRESET_INDEX', index),
  addTexturePreset: (preset: TexturePreset) => createAction('Toolbar/ADD_TEXTURE_PRESET', preset),
  updateTexturePreset: (index: number, preset: TexturePreset) => createAction('Toolbar/UPDATE_TEXTURE_PRESET', { index, preset }),
  removeTexturePreset: (index: number) => createAction('Toolbar/REMOVE_TEXTURE_PRESET', index),
  setTextureRandomColor: (flag: boolean) => createAction('Toolbar/SET_TEXTURE_RANDOM_COLOR', flag),
  setTextureOptions: (options: boolean[]) => createAction('Toolbar/SET_TEXTURE_OPTIONS', options),
  setTexturePatternType: (t: string) => createAction('Toolbar/SET_TEXTURE_PATTERN_TYPE', t),
  setTextureSeed: (seed: number) => createAction('Toolbar/SET_TEXTURE_SEED', seed),
  setTextureScale: (scale: number) => createAction('Toolbar/SET_TEXTURE_SCALE', scale),
  setTextureOutputMode: (mode: 'brush' | 'fill' | 'none') => createAction('Toolbar/SET_TEXTURE_OUTPUT_MODE', mode),
  setTextureForceForeground: (flag: boolean) => createAction('Toolbar/SET_TEXTURE_FORCE_FOREGROUND', flag),
  setTextureBrushWidth: (w: number) => createAction('Toolbar/SET_TEXTURE_BRUSH_WIDTH', w),
  setTextureBrushHeight: (h: number) => createAction('Toolbar/SET_TEXTURE_BRUSH_HEIGHT', h),
  setTextureDrawMode: (flag: boolean) => createAction('Toolbar/SET_TEXTURE_DRAW_MODE', flag),
  setFadeDrawMode: (flag: boolean) => createAction('Toolbar/SET_FADE_DRAW_MODE', flag),
  setBoxDrawMode: (flag: boolean) => createAction('Toolbar/SET_BOX_DRAW_MODE', flag),
  setBoxForceForeground: (flag: boolean) => createAction('Toolbar/SET_BOX_FORCE_FOREGROUND', flag),
  setGuideLayerDragOffset: (offset: { dx: number; dy: number } | null) => createAction('Toolbar/SET_GUIDE_LAYER_DRAG_OFFSET', offset),
  setLineDrawChunkyMode: (flag: boolean) => createAction('Toolbar/SET_LINE_DRAW_CHUNKY_MODE', flag),
  setLineDrawPoints: (points: Coord2[]) => createAction('Toolbar/SET_LINE_DRAW_POINTS', points),
  setLineDrawActive: (flag: boolean) => createAction('Toolbar/SET_LINE_DRAW_ACTIVE', flag),
  switchForegroundGroup: (prevGroup: string, newGroup: string) => createAction('Toolbar/SWITCH_FOREGROUND_GROUP', { prevGroup, newGroup }),
};

export type Actions = ActionsUnion<typeof actionCreators>;

export type PropsFromDispatch = DispatchPropsFromActions<typeof Toolbar.actions>;

export class Toolbar {

  static MIRROR_X = 1
  static MIRROR_Y = 2

  static actions = {
    ...actionCreators,

    keyDown: (k: string): RootStateThunk => {
      // Lower-case single keys in case the caps-lock is on.
      // Doing this for single char keys only to keep the other
      // keys (like 'ArrowLeft') in their original values.
      const key = k.length === 1 ? k.toLowerCase() : k;

      return (dispatch, getState) => {
        const state = getState()
        if (!state.toolbar.shortcutsActive) {
          return
        }

        const {
          shiftKey,
          altKey,
          metaKey,
          ctrlKey,
          tabKey,
          selectedTool,
          showSettings,
          showCustomFonts,
          showResizeSettings,
          showExport,
          showImport,

        } = state.toolbar
        const noMods = !shiftKey && !metaKey && !ctrlKey && !tabKey && !altKey
        const metaOrCtrl = metaKey || ctrlKey

        const inModal =
          state.toolbar.showExport.show ||
          state.toolbar.showImport.show ||
          state.toolbar.showImportSeqAdv.show ||
          state.toolbar.showSettings ||
          state.toolbar.showResizeSettings ||
          state.toolbar.showCustomFonts;

        if (inModal) {
          // These shouldn't early exit this function since we check for other
          // conditions for Esc later.
          if (key === 'Escape') {
            if (showSettings) {
              dispatch(Toolbar.actions.setShowSettings(false));
            }
            if (showResizeSettings) {

              dispatch(Toolbar.actions.setShowResizeSettings(false));
            }
            if (showCustomFonts) {
              dispatch(Toolbar.actions.setShowCustomFonts(false));
            }
            if (showExport) {
              dispatch(Toolbar.actions.setShowExport({ show: false }));
            }
            if (showImport) {
              dispatch(Toolbar.actions.setShowImport({ show: false }));
            }
            if (state.toolbar.showImportSeqAdv.show) {
              dispatch(Toolbar.actions.setShowImportSeqAdv({ show: false }));
            }
          }
          return;
        }



        let width = 1;
        let height = 1;
        const framebufIndex = screensSelectors.getCurrentScreenFramebufIndex(state)
        if (framebufIndex !== null) {
          const { width: w, height: h } = selectors.getFramebufByIndex(state, framebufIndex)!;
          width = w;
          height = h;
        }
        const inTextInput = selectedTool === Tool.Text && state.toolbar.textCursorPos !== null
        // These shortcuts should work regardless of what drawing tool is selected.
        if (noMods) {
          if (!inTextInput) {
            if (!altKey && key === 'ArrowLeft') {
              dispatch(Toolbar.actions.nextScreenWithColor(-1))
              return
            } else if (!altKey && key === 'ArrowRight') {
              dispatch(Toolbar.actions.nextScreenWithColor(+1))
              return
            } else if (key === 'q') {
              dispatch(Toolbar.actions.nextColor(-1))
              return
            } else if (key === 'e') {
              dispatch(Toolbar.actions.nextColor(+1))
              return
            } else if (key === 'x') {
              dispatch(Toolbar.actions.setSelectedTool(Tool.Draw))
              return
            } else if (key === 'c') {
              dispatch(Toolbar.actions.setSelectedTool(Tool.Colorize))
              return
            } else if (key === '0') {
              dispatch(Toolbar.actions.setSelectedTool(Tool.CharDraw))
              return
            } else if (key === '9') {
              dispatch(Toolbar.actions.setSelectedTool(Tool.RvsPen))
              return
            } else if (key === 'b') {
              dispatch(Toolbar.actions.setSelectedTool(Tool.Brush))
              return
            } else if (key === 't') {
              dispatch(Toolbar.actions.setSelectedTool(Tool.Text))
              return
            } else if (key === 'z') {
              dispatch(Toolbar.actions.setSelectedTool(Tool.PanZoom))
              return
            } else if (key === 'g') {
              return dispatch((dispatch: any, getState: any) => {
                const { guideLayerVisible } = getState().toolbar
                dispatch(Toolbar.actions.setGuideLayerVisible(!guideLayerVisible))
              })
            }
          }
        }



        if (altKey || tabKey) {
          if ((altKey || tabKey) && key === '1') {
            dispatch(Toolbar.actions.setColor(0))
            return
          } else if ((altKey || tabKey) && key === '2') {
            dispatch(Toolbar.actions.setColor(1))
            return
          } else if ((altKey || tabKey) && key === '3') {
            dispatch(Toolbar.actions.setColor(2))
            return
          } else if ((altKey || tabKey) && key === '4') {
            dispatch(Toolbar.actions.setColor(3))
            return
          } else if ((altKey || tabKey) && key === '5') {
            dispatch(Toolbar.actions.setColor(4))
            return
          } else if ((altKey || tabKey) && key === '6') {
            dispatch(Toolbar.actions.setColor(5))
            return
          } else if ((altKey || tabKey) && key === '7') {
            dispatch(Toolbar.actions.setColor(6))
            return
          } else if ((altKey || tabKey) && key === '8') {
            dispatch(Toolbar.actions.setColor(7))
            return

          }

        }



        if (ctrlKey) {
          if (ctrlKey && key === '1') {
            dispatch(Toolbar.actions.setColor(8))
            return
          }
          else if (ctrlKey && key === '2') {
            dispatch(Toolbar.actions.setColor(9))
            return
          } else if (ctrlKey && key === '3') {
            dispatch(Toolbar.actions.setColor(10))
            return
          } else if (ctrlKey && key === '4') {
            dispatch(Toolbar.actions.setColor(11))
            return
          } else if (ctrlKey && key === '5') {
            dispatch(Toolbar.actions.setColor(12))
            return
          } else if (ctrlKey && key === '6') {
            dispatch(Toolbar.actions.setColor(13))
            return
          } else if (ctrlKey && key === '7') {
            dispatch(Toolbar.actions.setColor(14))
            return
          } else if (ctrlKey && key === '8') {
            dispatch(Toolbar.actions.setColor(15))
            return
          }

          if (key === 'a') {
            dispatch(Toolbar.actions.selectAll());
            dispatch(Toolbar.actions.setSelectedTool(Tool.Brush))
          }
          if (key === 'v') {
            //ipcRenderer.send('set-title', "x:"+electron.clipboard.readText())
            //const formats = electron.clipboard.availableFormats();

            if(inTextInput)
            {
              dispatch(Toolbar.actions.pasteText())
            }
            else{
              dispatch(Toolbar.actions.pasteFrame())

            }

          }
          if (key === 'c') {

            if(shiftKey)
            {
              dispatch(Toolbar.actions.copyCurrentFrameAsPNG())

            }
            else
            {
            dispatch(Toolbar.actions.copyCurrentFrame())
            }


          }
        }

        if (selectedTool === Tool.Brush) {
          if (key === 'Escape' && state.toolbar.brush === null) {
            dispatch(Toolbar.actions.setSelectedTool(Tool.Draw))
          }
        }

        if (selectedTool === Tool.FloodFill) {
          if (key === 'Escape') {
            dispatch(Toolbar.actions.setSelectedTool(Tool.Draw))
          }
        }
        if (selectedTool === Tool.Lines || selectedTool === Tool.Boxes) {
          if (key === 'Escape') {
            dispatch(Toolbar.actions.resetBrush())
            dispatch(Toolbar.actions.setSelectedTool(Tool.Draw))
          }
        }
        if (selectedTool === Tool.Textures) {
          if (key === 'Escape') {
            if (state.toolbar.brush !== null) {
              dispatch(Toolbar.actions.resetBrush())
            } else {
              dispatch(Toolbar.actions.setSelectedTool(Tool.Draw))
            }
          }
        }
        if (selectedTool === Tool.LinesDraw) {
          if (key === 'Escape') {
            if (state.toolbar.lineDrawActive) {
              dispatch(Toolbar.actions.setLineDrawActive(false))
              dispatch(Toolbar.actions.setLineDrawPoints([]))
            } else {
              dispatch(Toolbar.actions.setSelectedTool(Tool.Draw))
            }
          }
        }
        if (selectedTool === Tool.FadeLighten) {
          if (key === 'Escape') {
            dispatch(Toolbar.actions.setSelectedTool(Tool.Draw))
          }
        }
        if (selectedTool === Tool.RvsPen) {
          if (key === 'Escape') {
            dispatch(Toolbar.actions.setSelectedTool(Tool.Draw))
          }
        }
        if (selectedTool === Tool.Text) {
          if (key === 'Escape') {
            dispatch(Toolbar.actions.setTextCursorPos(null))
          }


          if (key === 'Escape' && state.toolbar.textCursorPos === null) {
            dispatch(Toolbar.actions.setSelectedTool(Tool.Draw))
          }


          if (key === 'CapsLock') {
            dispatch(Toolbar.actions.setTextCapsLock(!state.toolbar.textCapsLock))
            return
          }

          if (state.toolbar.textCursorPos !== null && !metaOrCtrl) {
            // Don't match shortcuts if we're in "text tool" mode.
            const { textCursorPos, textColor } = state.toolbar
            let c = convertAsciiToScreencode(shiftKey ? key.toUpperCase() : key)

            if (c !== null)
              c = c + (Number(state.toolbar.textCapsLock) * 128)

            if (framebufIndex !== null) {
              if (c !== null) {
                dispatch(Framebuffer.actions.setPixel({
                  ...textCursorPos,
                  screencode: c,
                  color: textColor,
                }, null, framebufIndex));
                const newCursorPos = moveTextCursor(
                  textCursorPos,
                  { col: 1, row: 0 },
                  width, height
                )
                dispatch(Toolbar.actions.setTextCursorPos(newCursorPos))
              }
              if (key === 'Backspace') {
                const newCursorPos = moveTextCursor(
                  textCursorPos,
                  { col: -1, row: 0 },
                  width, height
                )
                dispatch(Toolbar.actions.setTextCursorPos(newCursorPos));
                dispatch(Framebuffer.actions.setPixel({
                  ...newCursorPos,
                  screencode: 0x20, // space
                  color: textColor,
                }, null, framebufIndex));
              }
            }
            if (key === 'ArrowLeft' || key === 'ArrowRight') {
              dispatch(Toolbar.actions.setTextCursorPos(
                moveTextCursor(
                  textCursorPos,
                  { col: key === 'ArrowLeft' ? -1 : 1, row: 0 },
                  width, height
                )
              ))
            } else if (key === 'ArrowUp' || key === 'ArrowDown') {
              dispatch(Toolbar.actions.setTextCursorPos(
                moveTextCursor(
                  textCursorPos,
                  { row: key === 'ArrowUp' ? -1 : 1, col: 0 },
                  width, height
                )
              ))
            }
            else if (key === 'Enter') {
              dispatch(Toolbar.actions.setTextCursorPos(
                moveTextCursor(
                  textCursorPos,
                  { row: 1, col: -textCursorPos.col },
                  width, height
                )
              ))
            }
            else if (key === 'Home') {
              if (shiftKey) {
                dispatch(Toolbar.actions.clearCanvas())
              }
              dispatch(Toolbar.actions.setTextCursorPos(
                moveTextCursor(
                  textCursorPos,
                  { row: -textCursorPos.row, col: -textCursorPos.col },
                  width, height
                )
              ))

            }


          }
        } else if (noMods) {
          if (key === 'Escape') {
            if (selectedTool === Tool.Brush) {
              dispatch(Toolbar.actions.resetBrush())
            }
          } else if (key === 'a') {
            dispatch(Toolbar.actions.nextCharcode({ row: 0, col: -1 }))
          } else if (key === 'd') {
            dispatch(Toolbar.actions.nextCharcode({ row: 0, col: +1 }))
          } else if (key === 's') {
            dispatch(Toolbar.actions.nextCharcode({ row: +1, col: 0 }))
          } else if (key === 'w') {
            dispatch(Toolbar.actions.nextCharcode({ row: -1, col: 0 }))
          }

          else if (key === 'v' || key === 'h') {
            let mirror = Toolbar.MIRROR_Y
            if (key === 'h') {
              mirror = Toolbar.MIRROR_X
            }
            if (selectedTool === Tool.Brush) {
              dispatch(Toolbar.actions.mirrorBrush(mirror))
            } else if (selectedTool === Tool.Draw || selectedTool === Tool.CharDraw || selectedTool === Tool.RvsPen) {
              dispatch(Toolbar.actions.mirrorChar(mirror))
            }
          }

          else if (key === 'f') {
            dispatch(Toolbar.actions.invertChar())
          } else if (key === 'r') {
            if (selectedTool === Tool.Brush) {

              dispatch(Toolbar.actions.rotateBrush(-1))

            } else if (selectedTool === Tool.Draw || selectedTool === Tool.CharDraw || selectedTool === Tool.RvsPen) {
              dispatch(Toolbar.actions.rotateChar(-1))
            }
          }
        }

        if (key === 'Shift') {
          dispatch(Toolbar.actions.setShiftKey(true))
        } else if (key === 'Meta') {
          dispatch(Toolbar.actions.setMetaKey(true))
        } else if (key === 'Control') {
          dispatch(Toolbar.actions.setCtrlKey(true))
        } else if (key === 'Alt') {
          dispatch(Toolbar.actions.setAltKey(true))
        } else if (key === 'Tab') {
          dispatch(Toolbar.actions.setTabKey(true))
        }
        else if (key === ' ') {
          dispatch(Toolbar.actions.setSpacebarKey(true))
        }



      }
    },

    keyUp: (key: string): RootStateThunk => {
      return (dispatch, _getState) => {
        if (key === 'Shift') {
          dispatch(Toolbar.actions.setShiftKey(false))
        } else if (key === 'Meta') {
          dispatch(Toolbar.actions.setMetaKey(false))
        } else if (key === 'Control') {
          dispatch(Toolbar.actions.setCtrlKey(false))
        } else if (key === 'Tab') {
          dispatch(Toolbar.actions.setTabKey(false))
        } else if (key === 'Alt') {
          dispatch(Toolbar.actions.setAltKey(false))
        } else if (key === ' ') {
          dispatch(Toolbar.actions.setSpacebarKey(false))
        }
      }
    },

    /** Switch fade source, saving current toggle settings for the old source
     *  and loading persisted toggles for the new one. */
    switchFadeSource: (newSource: FadeSource): RootStateThunk => {
      return (dispatch, getState) => {
        // Lazy require to avoid circular dependency (settings imports toolbar defaults)
        const settingsMod = require('./settings') as typeof import('./settings');
        const state = getState();
        const oldSource = state.toolbar.fadeSource;
        // Save current toggles for old source
        const currentToggles: FadePresetToggles = {
          fadeShowSource: state.toolbar.fadeShowSource,
          fadeStepStart: state.toolbar.fadeStepStart,
          fadeStepCount: state.toolbar.fadeStepCount,
          fadeStepChoice: state.toolbar.fadeStepChoice,
          fadeStepSort: state.toolbar.fadeStepSort,
        };
        const updated = {
          ...state.settings.saved.fadeSourceToggles,
          [oldSource]: currentToggles,
        };
        dispatch(settingsMod.actions.setFadeSourceToggles(updated));
        // Switch source and close editor
        dispatch(actionCreators.setFadeSource(newSource));
        dispatch(actionCreators.setFadeEditMode(false));
        // Load toggles for new source
        const newToggles = updated[newSource];
        if (newToggles) {
          dispatch(actionCreators.setFadeShowSource(newToggles.fadeShowSource));
          dispatch(actionCreators.setFadeStepStart(newToggles.fadeStepStart));
          dispatch(actionCreators.setFadeStepCount(newToggles.fadeStepCount));
          dispatch(actionCreators.setFadeStepChoice(newToggles.fadeStepChoice));
          dispatch(actionCreators.setFadeStepSort(newToggles.fadeStepSort));
        }
        dispatch(settingsMod.actions.saveEdits());
      };
    },

    /** Persist the current fade toggle settings for the active source. */
    saveFadeToggles: (): RootStateThunk => {
      return (dispatch, getState) => {
        const settingsMod = require('./settings') as typeof import('./settings');
        const state = getState();
        const source = state.toolbar.fadeSource;
        const toggles: FadePresetToggles = {
          fadeShowSource: state.toolbar.fadeShowSource,
          fadeStepStart: state.toolbar.fadeStepStart,
          fadeStepCount: state.toolbar.fadeStepCount,
          fadeStepChoice: state.toolbar.fadeStepChoice,
          fadeStepSort: state.toolbar.fadeStepSort,
        };
        dispatch(settingsMod.actions.setFadeSourceToggles({
          ...state.settings.saved.fadeSourceToggles,
          [source]: toggles,
        }));
        dispatch(settingsMod.actions.saveEdits());
      };
    },

    fillTexture: (grid: Pixel[][]): RootStateThunk => {
      return (dispatch, getState) => {
        const state = getState();
        const framebufIndex = screensSelectors.getCurrentScreenFramebufIndex(state);
        if (framebufIndex === null) return;
        const fb = selectors.getFramebufByIndex(state, framebufIndex);
        if (!fb) return;
        const { width, height } = fb;
        const gridH = grid.length;
        const gridW = grid[0]?.length ?? 0;
        if (gridH === 0 || gridW === 0) return;
        // Tile the 16×16 grid across the full framebuffer
        const tiledFb: Pixel[][] = [];
        for (let r = 0; r < height; r++) {
          const row: Pixel[] = [];
          for (let c = 0; c < width; c++) {
            row.push(grid[r % gridH][c % gridW]);
          }
          tiledFb.push(row);
        }
        dispatch(Framebuffer.actions.setFields({ framebuf: tiledFb }, framebufIndex));
      };
    },

    clearCanvas: (): RootStateThunk => {
      return dispatchForCurrentFramebuf((dispatch, framebufIndex) => {
        dispatch(Framebuffer.actions.clearCanvas(framebufIndex))
      });
    },
    convertToMono: (): RootStateThunk => {
      return dispatchForCurrentFramebuf((dispatch, framebufIndex) => {
        dispatch(Framebuffer.actions.convertToMono(framebufIndex))
      });
    },
    strip8: (): RootStateThunk => {
      return dispatchForCurrentFramebuf((dispatch, framebufIndex) => {
        dispatch(Framebuffer.actions.strip8(framebufIndex))
      });
    },
    swapColors: (colors: { srcColor: number, destColor: number }): RootStateThunk => {
      return dispatchForCurrentFramebuf((dispatch, framebufIndex) => {
        dispatch(Framebuffer.actions.swapColors(colors, framebufIndex))
      });
    },
    swapChars: (chars: { srcChar: number, destChar: number }): RootStateThunk => {
      return dispatchForCurrentFramebuf((dispatch, framebufIndex) => {
        dispatch(Framebuffer.actions.swapChars(chars, framebufIndex))
      });
    },

    resizeCanvas: (width: number, height: number, dir: Coord2, isCrop: boolean): RootStateThunk => {
      return dispatchForCurrentFramebuf((dispatch, framebufIndex) => {
        dispatch(Framebuffer.actions.resizeCanvas({ rWidth: width, rHeight: height, rDir: dir, isCrop: isCrop }, framebufIndex,))
      });

    },

    resizeDims: (): RootStateThunk => {
      return (dispatch, getState) => {
        const state = getState()
        const framebufIndex = screensSelectors.getCurrentScreenFramebufIndex(state)
        if (framebufIndex !== null) {
          const { width, height } = selectors.getFramebufByIndex(state, framebufIndex)!;
          dispatch(actionCreators.setResizeWidth(width));
          dispatch(actionCreators.setResizeHeight(height));
        }
      }
    },


    nextCharcode: (dir: Coord2): RootStateThunk => {
      return (dispatch, getState) => {
        const { font } = selectors.getCurrentFramebufFont(getState());
        dispatch(actionCreators.nextCharcodeAction(dir, font));
      }
    },

    invertChar: (): RootStateThunk => {
      return (dispatch, getState) => {
        const { font } = selectors.getCurrentFramebufFont(getState());
        dispatch(actionCreators.invertCharAction(font));
      }
    },
    invertSingleChar: (code: number): RootStateThunk => {
      return (dispatch, getState) => {
        const { font } = selectors.getCurrentFramebufFont(getState());
        dispatch(actionCreators.invertSingleCharAction(font, code));
      }
    },

    invertBrush: (): RootStateThunk => {
      return (dispatch, getState) => {
        const srcBrush = getState().toolbar.brush
        if (srcBrush !== null) {
          const invertedFramebuf = srcBrush.framebuf.map((pixelRow) => {
            return pixelRow.map((pix) => {
              const newcode = pix.code < 128 ? pix.code + 128 : pix.code - 128
              return { ...pix, code: newcode }
            })
          });
          dispatch(actionCreators.invertBrushAction({ ...srcBrush, framebuf: invertedFramebuf }));
        }
      }
    },


    setColor: (slot: number): RootStateThunk => {
      return (dispatch, getState) => {
        const state = getState()
        const fb = selectors.getCurrentFramebuf(state);
        const isVDC80 = fb && fb.charset.startsWith('c128') && fb.width >= 80;
        const remap = isVDC80
          ? Array.from({ length: 16 }, (_, i) => i)
          : getSettingsPaletteRemap(state);
        dispatch(actionCreators.setColorAction(slot, remap));
      }
    },


    nextColor: (dir: number): RootStateThunk => {
      return (dispatch, getState) => {
        const state = getState()
        const fb = selectors.getCurrentFramebuf(state);
        const isVDC80 = fb && fb.charset.startsWith('c128') && fb.width >= 80;
        const remap = isVDC80
          ? Array.from({ length: 16 }, (_, i) => i)
          : getSettingsPaletteRemap(state);
        dispatch(actionCreators.nextColorAction(dir, remap));
      }
    },

    setScreencode: (code: number): RootStateThunk => {
      return (dispatch, getState) => {
        const state = getState();
        const { font } = selectors.getCurrentFramebufFont(state);
        const charPos = utils.rowColFromScreencode(font, code);
        dispatch(Toolbar.actions.setSelectedChar(charPos));
      }
    },

    nextScreenWithColor: (dir: number): RootStateThunk => {
      return (dispatch, getState) => {
        const state = getState();
        const screensList = screensSelectors.getScreens(state);
        const currentIdx = screensSelectors.getCurrentScreenIndex(state);
        const nextIdx = Math.min(screensList.length - 1, Math.max(0, currentIdx + dir));
        if (nextIdx !== currentIdx) {
          const curFb = selectors.getFramebufByIndex(state, screensList[currentIdx]);
          const nextFb = selectors.getFramebufByIndex(state, screensList[nextIdx]);
          if (curFb && nextFb) {
            const curGroup = getColorGroup(curFb.charset, curFb.width);
            const nextGroup = getColorGroup(nextFb.charset, nextFb.width);
            if (curGroup !== nextGroup) {
              dispatch(actionCreators.switchForegroundGroup(curGroup, nextGroup));
              if (nextGroup === 'pet') {
                dispatch(actionCreators.setBoxForceForeground(true));
                dispatch(actionCreators.setTextureForceForeground(true));
              }
            }
          }
        }
        dispatch(Screens.actions.nextScreen(dir));
      }
    },

    setCurrentColor: (color: number): RootStateThunk => {
      return (dispatch, _getState) => {
        dispatch(Toolbar.actions.setTextColor(color))
      }
    },

    setCurrentChar: (charPos: Coord2): RootStateThunk => {
      return (dispatch, _getState) => {
        dispatch(Toolbar.actions.setSelectedChar(charPos))
      }
    },

    setCurrentScreencodeAndColor: (pix: Pixel): RootStateThunk => {
      return (dispatch, getState) => {
        const state = getState()
        dispatch(Toolbar.actions.setTextColor(pix.color))
        dispatch(Toolbar.actions.setScreencode(pix.code))
        const tool = state.toolbar.selectedTool;
        // Don't switch away from tool-panel tools (Lines, Textures, Boxes, Fade/Lighten)
        if (tool === Tool.Brush || tool === Tool.Text) {
          dispatch(Toolbar.actions.setSelectedTool(Tool.Draw))
        }
      }
    },

    shiftHorizontal: (dir: -1 | 1): RootStateThunk => {
      return dispatchForCurrentFramebuf((dispatch, framebufIndex) => {
        dispatch(Framebuffer.actions.shiftHorizontal(dir, framebufIndex))
      });
    },

    shiftVertical: (dir: -1 | 1) => {
      return dispatchForCurrentFramebuf((dispatch, framebufIndex) => {
        dispatch(Framebuffer.actions.shiftVertical(dir, framebufIndex))
      });
    },

    setCurrentFramebufUIState: (uiState: FramebufUIState): RootStateThunk => {
      return dispatchForCurrentFramebuf((dispatch, framebufIndex) => {
        dispatch(Toolbar.actions.setFramebufUIState(framebufIndex, uiState));
      });
    },
    toggleBorder: (): RootStateThunk => {
      return (dispatch, getState) => {
        const state = getState()
        const framebufIndex = screensSelectors.getCurrentScreenFramebufIndex(state)

        if (framebufIndex !== null) {
          const { borderOn } = selectors.getFramebufByIndex(state, framebufIndex)!;
          dispatch(Framebuffer.actions.setBorderOn(!borderOn, framebufIndex!))
        }




      };
    },


    toggleGrid: (): RootStateThunk => {
      return (dispatch, getState) => {
//        const state = getState()


        const { canvasGrid } = getState().toolbar
        dispatch(Toolbar.actions.setCanvasGrid(!canvasGrid))
      }
    },
    selectAll: (): RootStateThunk => {
      return (dispatch, getState) => {
        const state = getState()

        let width = 1;
        let height = 1;
        const framebufIndex = screensSelectors.getCurrentScreenFramebufIndex(state)
        if (framebufIndex !== null) {
          const { width: w, height: h } = selectors.getFramebufByIndex(state, framebufIndex)!;
          width = w;
          height = h;

          const { framebuf } = selectors.getFramebufByIndex(state, framebufIndex)!;

          const selectAllBrushRegion = {
            min: { row: 0, col: 0 },
            max: { row: height - 1, col: width - 1 }
          }


          dispatch(Toolbar.actions.captureBrush(framebuf, selectAllBrushRegion))




        }
      }
    },


    brushToNew: (): RootStateThunk => {
      return (dispatch, getState) => {


        const state = getState()
        let colors = {
          backgroundColor: 0,
          borderColor: 0
        }
        const framebuf = selectors.getCurrentFramebuf(state);
        if (framebuf !== null) {
          colors = {
            backgroundColor: framebuf.backgroundColor,
            borderColor: framebuf.borderColor
          }
        }



        if (state.toolbar.brush !== null) {
          const brushFramebuf = state.toolbar.brush.framebuf
          dispatch(Screens.actions.addScreenAndFramebuf());
          dispatch((dispatch, getState) => {
            const state = getState()
            const newFramebufIdx = screensSelectors.getCurrentScreenFramebufIndex(state)
            if (newFramebufIdx === null) {
              return;
            }
            dispatch(Framebuffer.actions.setFields({
              ...colors,
              name: 'Clip_' + newFramebufIdx,
              borderOn: false,
            }, newFramebufIdx))

            dispatch(Framebuffer.actions.setDims({
              width: brushFramebuf[0].length, height: brushFramebuf.length,

            }, newFramebufIdx))

            dispatch(Framebuffer.actions.setFields({
              framebuf: brushFramebuf
            }, newFramebufIdx))

          })
        }

      }
    },

    setAllBorder: (borderOn: boolean): RootStateThunk => {
      return (dispatch, getState) => {
        const state = getState()
        const currentIndex = screensSelectors.getCurrentScreenFramebufIndex(state)!
        screensSelectors.getScreens(state).forEach((framebufId) => {
          dispatch(Screens.actions.setCurrentScreenIndex(framebufId))
          dispatch(Framebuffer.actions.setBorderOn(borderOn, framebufId))
        })
        dispatch(Screens.actions.setCurrentScreenIndex(currentIndex))
      }
    },
    setAllBorderFlip: (): RootStateThunk => {
      return (dispatch, getState) => {
        const state = getState()
        const currentIndex = screensSelectors.getCurrentScreenFramebufIndex(state)!
        screensSelectors.getScreens(state).forEach((framebufId) => {
          dispatch(Screens.actions.setCurrentScreenIndex(framebufId));
          dispatch(Framebuffer.actions.setBorderOn(!state.framebufList[framebufId].present.borderOn, framebufId))
        })
        dispatch(Screens.actions.setCurrentScreenIndex(currentIndex))
      }
    },

    copyCurrentFrame: (): RootStateThunk => {
      return (_dispatch, getState) => {
        const state = getState()
        const currentFrame = selectors.getCurrentFramebuf(state)
      if (currentFrame !== null) {
        const {font} = selectors.getCurrentFramebufFont(state)

        const copyFrameWithFont: FramebufWithFont = {
          ...currentFrame,
          font,
        };
        const JSONData = getJSON(copyFrameWithFont, {});
        electron.clipboard.writeBuffer(
          "petmate/framebuffer",
          Buffer.from(JSONData, "utf-8")
        );
      }
        }

    },

    copyCurrentFrameAsPNG: (): RootStateThunk => {
      return (_dispatch, getState) => {
        const state = getState()
        const currentFrame = selectors.getCurrentFramebuf(state)
      if (currentFrame !== null) {
        const {font} = selectors.getCurrentFramebufFont(state)

        const copyFrameWithFont: FramebufWithFont = {
          ...currentFrame,
          font,
        };

        electron.clipboard.writeBuffer(
          "image/png",
          Buffer.from(getPNG(copyFrameWithFont, getSettingsCurrentColorPalette(state)),"base64")
        );

      }
        }

    },

    pasteFrame: (): RootStateThunk => {
      return (dispatch, getState) => {
        const state = getState()
        if (electron.clipboard.has("petmate/framebuffer")) {
          const currentFrameIndex = screensSelectors.getCurrentScreenFramebufIndex(state)!
          const pastedFrameBuffer = JSON.parse(
            Buffer.from(
              electron.clipboard.readBuffer("petmate/framebuffer")
            ).toString()
          ).framebufs;
          dispatch(Screens.addScreenPlusFramebuf(currentFrameIndex, pastedFrameBuffer));
        }
      }
    },

    // TODO: Implement sending the current frame to the Ultimate cartridge via HTTP.
    // sendUltimate was removed as dead code (dispatches export via index.ts instead).

    // TODO: Implement opening the exported PRG in the default OS application.
    sendDefault: (): RootStateThunk => {
      return (_dispatch, _getState) => {
        // Not yet implemented.
      }
    },




    setZoom: (level: number, alignment: string = 'left'): RootStateThunk => {
      return (dispatch, getState) => {
        const state = getState()
        const framebufIndex = screensSelectors.getCurrentScreenFramebufIndex(state)
        if (framebufIndex === null) return;

        const framebufUIState = selectors.getFramebufUIState(state, framebufIndex);
        const currentScale = framebufUIState?.canvasTransform.v[0][0] ?? 1;

        let scaleLevel: number;
        if (level > 100) {
          // Absolute zoom (sentinel values: 101 = 1x, 102 = 2x, etc.).
          scaleLevel = snapZoom(level - 100);
        } else {
          // Relative step: sign of level determines direction.
          const direction: 1 | -1 = level > 0 ? 1 : -1;
          scaleLevel = stepZoom(currentScale, direction);
        }

        const xform = matrix.scale(scaleLevel);

        dispatch(Toolbar.actions.setCurrentFramebufUIState({
          ...framebufUIState,
          canvasFit: "nofit",
          canvasTransform: xform,
        }));

        dispatch(Framebuffer.actions.setZoom(
          { zoomLevel: scaleLevel, alignment: 'left' },
          framebufIndex
        ));

        // Scroll to keep the viewport center in the same position after zoom.
        requestAnimationFrame(() => {
          const el = document.getElementById("MainContainer");
          if (!el) return;
          const viewW = el.clientWidth;
          const viewH = el.clientHeight;
          // Center of viewport in old content coordinates
          const centerX = (el.scrollLeft + viewW / 2) / currentScale;
          const centerY = (el.scrollTop + viewH / 2) / currentScale;
          // New scroll to keep that center
          el.scrollLeft = Math.max(0, centerX * scaleLevel - viewW / 2);
          el.scrollTop = Math.max(0, centerY * scaleLevel - viewH / 2);
        });
      }
    },

    setAllZoom: (level: number, alignment: string = 'left'): RootStateThunk => {
      return (dispatch, getState) => {
        const state = getState()
        const currentIndex = screensSelectors.getCurrentScreenFramebufIndex(state)!
        screensSelectors.getScreens(state).forEach((framebufId) => {
          dispatch(Screens.actions.setCurrentScreenIndex(framebufId))
          dispatch(Toolbar.actions.setZoom(level, 'left'))
        })
        dispatch(Screens.actions.setCurrentScreenIndex(currentIndex))
      }
    },

    pasteText: (): RootStateThunk => {
      return (dispatch, getState) => {
        const state = getState()
        let width = 1;
        let height = 1;
        const framebufIndex = screensSelectors.getCurrentScreenFramebufIndex(state)
        if (framebufIndex !== null) {
          const { width: w, height: h } = selectors.getFramebufByIndex(state, framebufIndex)!;
          width = w;
          height = h;
        }


        if (state.toolbar.textCursorPos !== null) {
          const { textCursorPos, textColor } = state.toolbar
          const clip = "" + electron.clipboard.readText().toString()

          if (clip !== null) {
            if (electron.clipboard.availableFormats().includes("text/plain")) {
              if (state.toolbar.selectedTool === Tool.Text) {

                let coords = { col: 0, row: 0 }
                let enters = 0;
                let charcount = 0;
                [...clip].forEach(char => {
                  if (asc2int(char) === 13) {
                    enters++;
                    charcount = 0;
                  }
                  coords = { col: textCursorPos.col + charcount, row: textCursorPos.row + enters }
                  let c = convertAsciiToScreencode(state.toolbar.shiftKey ? char.toUpperCase() : char)
                  if (c !== null) {
                    dispatch(Framebuffer.actions.setPixel({
                      ...coords,
                      screencode: c,
                      color: textColor,
                    }, null, framebufIndex));
                    charcount++;
                  }
                });
                const newCursorPos = moveTextCursor(
                  textCursorPos,
                  { col: charcount, row: enters },
                  width, height
                )
                dispatch(Toolbar.actions.setTextCursorPos(newCursorPos))

              }

            }

          }
        }


      }
    },

  }

  static reducer(state: IToolbar = {
    ...initialBrushValue,
    selectedChar: { row: 8, col: 0 },
    charTransform: emptyTransform,
    undoId: 0,
    textColor: 14,
    textCursorPos: null as (Coord2 | null),
    selectedTool: Tool.Draw,
    brushRegion: null as (BrushRegion | null),
    brush: null as (Brush | null),
    workspaceFilename: null as (string | null),
    altKey: false,
    ctrlKey: false,
    tabKey: false,
    metaKey: false,
    shiftKey: false,
    spacebarKey: false,
    capslockKey: false,
    textCapsLock: false,
    showSettings: false,
    showResizeSettings: false,
    resizeWidth: 40,
    resizeHeight: 25,
    resizeCrop: true,
    showProgressModal: false,
    progressTitle: '',
    progressValue: 0,
    showCustomFonts: false,
    showExport: { show: false },
    showImport: { show: false },
    showImportSeqAdv: { show: false },
    selectedPaletteRemap: 0,
    canvasGrid: false,
    shortcutsActive: true,
    guideLayerVisible: false,
    linePresets: defaultLinePresets,
    selectedLinePresetIndex: 0,
    boxPresets: defaultBoxPresets,
    selectedBoxPresetIndex: 0,
    texturePresets: defaultTexturePresets,
    selectedTexturePresetIndex: 0,
    textureRandomColor: false,
    textureOptions: [false, false, false, false, false, false],
    texturePatternType: 'manual',
    textureSeed: 1,
    textureScale: 1,
    textureOutputMode: 'none' as 'brush' | 'fill' | 'none',
    textureForceForeground: false,
    textureBrushWidth: 16,
    textureBrushHeight: 16,
    textureDrawMode: false,
    fadeDrawMode: false,
    boxDrawMode: true,
    boxForceForeground: false,
    guideLayerDragOffset: null as { dx: number; dy: number } | null,
    lineDrawChunkyMode: false,
    lineDrawPoints: [] as Coord2[],
    lineDrawActive: false,
    newScreenSize: { width: DEFAULT_FB_WIDTH, height: DEFAULT_FB_HEIGHT },
    framebufUIState: {},
    fadeMode: 'darken' as FadeMode,
    fadeStrength: 1,
    fadeSource: 'AllCharacters' as FadeSource,
    fadeStepStart: 'first' as FadeStepStart,
    fadeStepCount: 1,
    fadeStepChoice: 'pingpong' as FadeStepChoice,
    fadeStepSort: 'default' as FadeStepSort,
    fadeShowSource: true,
    fadeEditMode: false,
    fadeLinearCounter: 0,
    fadeSettingsByCharset: {} as Record<string, FadeCharsetSettings>,
    textColorByGroup: { ...DEFAULT_COLORS_BY_GROUP } as Record<string, number>,
    activeColorGroup: 'c64',
  }, action: Actions) {
    switch (action.type) {
      case RESET_BRUSH:
        return {
          ...state,
          ...initialBrushValue
        }
      case CAPTURE_BRUSH:
        return {
          ...state,
          ...initialBrushValue,
          brush: action.data
        }

      case SET_SELECTED_CHAR:
        const rc = action.data
        return {
          ...state,
          selectedChar: rc,
          charTransform: emptyTransform
        }
      case NEXT_CHARCODE: {
        const { dir, font } = action.data
        const rc = selectors.getCharRowColWithTransform(state.selectedChar, font, state.charTransform)
        return {
          ...state,
          selectedChar: {
            row: Math.max(0, Math.min(15, rc.row + dir.row)),
            col: Math.max(0, Math.min(15, rc.col + dir.col)),
          },
          charTransform: emptyTransform
        }
      }
      case INVERT_CHAR: {
        const font = action.data
        const curScreencode = selectors.getScreencodeWithTransform(state.selectedChar, font, state.charTransform)
        const inverseRowCol = utils.rowColFromScreencode(font, brush.findInverseChar(font, curScreencode))
        return {
          ...state,
          selectedChar: inverseRowCol,
          charTransform: emptyTransform
        }
      }
      case INVERT_SINGLE_CHAR: {
        const { font, code } = action.data
        const curScreencode = code
        const inverseRowCol = utils.rowColFromScreencode(font, brush.findInverseChar(font, curScreencode))
        return {
          ...state,
          selectedChar: inverseRowCol,
          charTransform: emptyTransform
        }
      }
      case INVERT_BRUSH: {
        return {
          ...state,
          ...initialBrushValue,
          brush: action.data
        }

      }
      case NEXT_COLOR: {
        const remap = action.data.paletteRemap;
        const idx = remap.indexOf(state.textColor);
        const dir = action.data.dir;
        const nextIdx = Math.max(0, Math.min(15, idx + dir));
        return {
          ...state,
          textColor: remap[nextIdx]
        }
      }
      case SET_COLOR: {
        const remap = action.data.paletteRemap;
        const slot = action.data.slot;
        return {
          ...state,
          textColor: remap[slot]
        }
      }
      case INC_UNDO_ID:
        return {
          ...state,
          undoId: state.undoId + 1
        }
      case SET_FRAMEBUF_UI_STATE: {
        return {
          ...state,
          framebufUIState: {
            ...state.framebufUIState,
            [action.data.framebufIndex]: action.data.uiState || defaultFramebufUIState
          }
        }
      }
      case MIRROR_BRUSH:
        return {
          ...state,
          brushTransform: mirror(state.brushTransform, action.data)
        }
      case ROTATE_BRUSH:
        return {
          ...state,
          brushTransform: rotate(state.brushTransform, action.data)
        }
      case MIRROR_CHAR:
        return {
          ...state,
          charTransform: mirror(state.charTransform, action.data)
        }
      case ROTATE_CHAR:
        return {
          ...state,
          charTransform: rotate(state.charTransform, action.data)
        }
      case CLEAR_MOD_KEY_STATE:
        return {
          ...state,
          altKey: false,
          ctrlKey: false,
          tabKey: false,
          metaKey: false,
          shiftKey: false,
          capslockKey: false,
        }
      case 'Toolbar/SET_TEXT_COLOR':
        return updateField(state, 'textColor', action.data);
      case 'Toolbar/SET_TEXT_CURSOR_POS':
        return updateField(state, 'textCursorPos', action.data);
      case 'Toolbar/SET_SELECTED_TOOL': {
        let newState = updateField(state, 'selectedTool', action.data);
        // Reset line draw session when switching away from LinesDraw
        if (state.selectedTool === Tool.LinesDraw && action.data !== Tool.LinesDraw) {
          newState = { ...newState, lineDrawActive: false, lineDrawPoints: [] };
        }
        // Clear brush when switching away from Select — Select and Textures keep the brush
        if (state.brush !== null && action.data !== Tool.Brush && action.data !== Tool.Textures) {
          newState = { ...newState, ...initialBrushValue };
        }
        return newState;
      }
      case 'Toolbar/SET_BRUSH_REGION':
        return updateField(state, 'brushRegion', action.data);
      case 'Toolbar/SET_BRUSH':
        return updateField(state, 'brush', action.data);
      case 'Toolbar/SET_WORKSPACE_FILENAME':
        return updateField(state, 'workspaceFilename', action.data);
      case 'Toolbar/SET_ALT_KEY':
        return updateField(state, 'altKey', action.data);
      case 'Toolbar/SET_CTRL_KEY':
        return updateField(state, 'ctrlKey', action.data);
      case 'Toolbar/SET_TAB_KEY':
        return updateField(state, 'tabKey', action.data);
      case 'Toolbar/SET_META_KEY':
        return updateField(state, 'metaKey', action.data);
      case 'Toolbar/SET_SHIFT_KEY':
        return updateField(state, 'shiftKey', action.data);
      case 'Toolbar/SET_CAPSLOCK_KEY':
        return updateField(state, 'capslockKey', action.data);

      case 'Toolbar/SET_SPACEBAR_KEY':
        return updateField(state, 'spacebarKey', action.data);
      case 'Toolbar/SET_SHOW_SETTINGS':
        return updateField(state, 'showSettings', action.data);
      case 'Toolbar/SET_SHOW_PROGRESSMODAL':
        return updateField(state, 'showProgressModal', action.data);
      case 'Toolbar/SET_PROGRESSTITLE':
        return updateField(state, 'progressTitle', action.data);
      case 'Toolbar/SET_PROGRESSVALUE':
        return updateField(state, 'progressValue', action.data);
      case 'Toolbar/SET_SHOW_RESIZESETTINGS':
        return updateField(state, 'showResizeSettings', action.data);


      case 'Toolbar/SET_RESIZEWIDTH':
        return updateField(state, 'resizeWidth', action.data);
      case 'Toolbar/SET_RESIZEHEIGHT':
        return updateField(state, 'resizeHeight', action.data);
      case 'Toolbar/SET_RESIZECROP':
        return updateField(state, 'resizeCrop', action.data);
      case 'Toolbar/SET_SHOW_CUSTOM_FONTS':
        return updateField(state, 'showCustomFonts', action.data);
      case 'Toolbar/SET_SHOW_EXPORT':
        return updateField(state, 'showExport', action.data);
      case 'Toolbar/SET_SHOW_IMPORT':
        return updateField(state, 'showImport', action.data);
      case 'Toolbar/SET_SHOW_IMPORT_SEQ_ADV':
        return updateField(state, 'showImportSeqAdv', action.data);
      case 'Toolbar/SET_SELECTED_PALETTE_REMAP':
        return updateField(state, 'selectedPaletteRemap', action.data);
      case 'Toolbar/SET_CANVAS_GRID':
        return updateField(state, 'canvasGrid', action.data);
      case 'Toolbar/SET_SHORTCUTS_ACTIVE':
        return updateField(state, 'shortcutsActive', action.data);
      case 'Toolbar/SET_GUIDE_LAYER_VISIBLE':
        return updateField(state, 'guideLayerVisible', action.data);
      case 'Toolbar/SET_NEW_SCREEN_SIZE':
        return updateField(state, 'newScreenSize', action.data);
      case SET_TEXT_CAPS_LOCK:
        return updateField(state, 'textCapsLock', action.data);
      case 'Toolbar/SET_LINE_PRESETS':
        return updateField(state, 'linePresets', action.data);
      case 'Toolbar/SET_SELECTED_LINE_PRESET_INDEX':
        return updateField(state, 'selectedLinePresetIndex', action.data);
      case 'Toolbar/ADD_LINE_PRESET': {
        return { ...state, linePresets: [...state.linePresets, action.data], selectedLinePresetIndex: state.linePresets.length };
      }
      case 'Toolbar/UPDATE_LINE_PRESET': {
        const { index, preset } = action.data;
        const updated = state.linePresets.map((p, i) => i === index ? preset : p);
        return { ...state, linePresets: updated };
      }
      case 'Toolbar/REMOVE_LINE_PRESET': {
        const idx = action.data;
        const filtered = state.linePresets.filter((_, i) => i !== idx);
        const newIdx = Math.min(state.selectedLinePresetIndex, filtered.length - 1);
        return { ...state, linePresets: filtered, selectedLinePresetIndex: Math.max(0, newIdx) };
      }
      case 'Toolbar/SET_FADE_MODE':
        return updateField(state, 'fadeMode', action.data);
      case 'Toolbar/SET_FADE_STRENGTH':
        return updateField(state, 'fadeStrength', action.data);
      case 'Toolbar/SET_FADE_SOURCE':
        return updateField(state, 'fadeSource', action.data);
      case 'Toolbar/SET_FADE_STEP_START':
        return updateField(state, 'fadeStepStart', action.data);
      case 'Toolbar/SET_FADE_STEP_COUNT':
        return updateField(state, 'fadeStepCount', action.data);
      case 'Toolbar/SET_FADE_STEP_CHOICE':
        return updateField(state, 'fadeStepChoice', action.data);
      case 'Toolbar/SET_FADE_STEP_SORT':
        return updateField(state, 'fadeStepSort', action.data);
      case 'Toolbar/SET_FADE_SHOW_SOURCE':
        return updateField(state, 'fadeShowSource', action.data);
      case 'Toolbar/SET_FADE_EDIT_MODE':
        return updateField(state, 'fadeEditMode', action.data);
      case 'Toolbar/INC_FADE_LINEAR_COUNTER':
        return { ...state, fadeLinearCounter: state.fadeLinearCounter + 1 };
      case 'Toolbar/SWITCH_FADE_CHARSET': {
        const { prevCharset, nextCharset } = action.data;
        const current: FadeCharsetSettings = {
          fadeMode: state.fadeMode,
          fadeStrength: state.fadeStrength,
          fadeSource: state.fadeSource,
          fadeStepStart: state.fadeStepStart,
          fadeStepCount: state.fadeStepCount,
          fadeStepChoice: state.fadeStepChoice,
          fadeStepSort: state.fadeStepSort,
        };
        const next = state.fadeSettingsByCharset[nextCharset];
        return {
          ...state,
          fadeSettingsByCharset: { ...state.fadeSettingsByCharset, [prevCharset]: current },
          fadeLinearCounter: 0,
          fadeEditMode: false,
          ...(next ? {
            fadeMode: next.fadeMode,
            fadeStrength: next.fadeStrength,
            fadeSource: next.fadeSource,
            fadeStepStart: next.fadeStepStart,
            fadeStepCount: next.fadeStepCount,
            fadeStepChoice: next.fadeStepChoice,
            fadeStepSort: next.fadeStepSort,
          } : {}),
        };
      }
      case 'Toolbar/SET_BOX_PRESETS':
        return updateField(state, 'boxPresets', action.data);
      case 'Toolbar/SET_SELECTED_BOX_PRESET_INDEX':
        return updateField(state, 'selectedBoxPresetIndex', action.data);
      case 'Toolbar/ADD_BOX_PRESET': {
        return { ...state, boxPresets: [...state.boxPresets, action.data], selectedBoxPresetIndex: state.boxPresets.length };
      }
      case 'Toolbar/UPDATE_BOX_PRESET': {
        const { index, preset } = action.data;
        const updated = state.boxPresets.map((p, i) => i === index ? preset : p);
        return { ...state, boxPresets: updated };
      }
      case 'Toolbar/REMOVE_BOX_PRESET': {
        const idx = action.data;
        const filtered = state.boxPresets.filter((_, i) => i !== idx);
        const newIdx = Math.min(state.selectedBoxPresetIndex, filtered.length - 1);
        return { ...state, boxPresets: filtered, selectedBoxPresetIndex: Math.max(0, newIdx) };
      }
      case 'Toolbar/SET_TEXTURE_PRESETS':
        return updateField(state, 'texturePresets', action.data);
      case 'Toolbar/SET_SELECTED_TEXTURE_PRESET_INDEX':
        return updateField(state, 'selectedTexturePresetIndex', action.data);
      case 'Toolbar/ADD_TEXTURE_PRESET': {
        return { ...state, texturePresets: [...state.texturePresets, action.data], selectedTexturePresetIndex: state.texturePresets.length };
      }
      case 'Toolbar/UPDATE_TEXTURE_PRESET': {
        const { index, preset } = action.data;
        const updated = state.texturePresets.map((p, i) => i === index ? preset : p);
        return { ...state, texturePresets: updated };
      }
      case 'Toolbar/REMOVE_TEXTURE_PRESET': {
        const idx = action.data;
        const filtered = state.texturePresets.filter((_, i) => i !== idx);
        const newIdx = Math.min(state.selectedTexturePresetIndex, filtered.length - 1);
        return { ...state, texturePresets: filtered, selectedTexturePresetIndex: Math.max(0, newIdx) };
      }
      case 'Toolbar/SET_TEXTURE_RANDOM_COLOR':
        return updateField(state, 'textureRandomColor', action.data);
      case 'Toolbar/SET_TEXTURE_OPTIONS':
        return updateField(state, 'textureOptions', action.data);
      case 'Toolbar/SET_TEXTURE_PATTERN_TYPE':
        return updateField(state, 'texturePatternType', action.data);
      case 'Toolbar/SET_TEXTURE_SEED':
        return updateField(state, 'textureSeed', action.data);
      case 'Toolbar/SET_TEXTURE_SCALE':
        return updateField(state, 'textureScale', action.data);
      case 'Toolbar/SET_TEXTURE_OUTPUT_MODE':
        return updateField(state, 'textureOutputMode', action.data);
      case 'Toolbar/SET_TEXTURE_FORCE_FOREGROUND':
        return updateField(state, 'textureForceForeground', action.data);
      case 'Toolbar/SET_TEXTURE_BRUSH_WIDTH':
        return updateField(state, 'textureBrushWidth', action.data);
      case 'Toolbar/SET_TEXTURE_BRUSH_HEIGHT':
        return updateField(state, 'textureBrushHeight', action.data);
      case 'Toolbar/SET_TEXTURE_DRAW_MODE':
        return updateField(state, 'textureDrawMode', action.data);
      case 'Toolbar/SET_FADE_DRAW_MODE':
        return updateField(state, 'fadeDrawMode', action.data);
      case 'Toolbar/SET_BOX_DRAW_MODE':
        return updateField(state, 'boxDrawMode', action.data);
      case 'Toolbar/SET_BOX_FORCE_FOREGROUND':
        return updateField(state, 'boxForceForeground', action.data);
      case 'Toolbar/SET_GUIDE_LAYER_DRAG_OFFSET':
        return updateField(state, 'guideLayerDragOffset', action.data);
      case 'Toolbar/SET_LINE_DRAW_CHUNKY_MODE':
        return updateField(state, 'lineDrawChunkyMode', action.data);
      case 'Toolbar/SET_LINE_DRAW_POINTS':
        return updateField(state, 'lineDrawPoints', action.data);
      case 'Toolbar/SET_LINE_DRAW_ACTIVE':
        return updateField(state, 'lineDrawActive', action.data);
      case 'Toolbar/SWITCH_FOREGROUND_GROUP': {
        const { prevGroup, newGroup } = action.data;
        // Already in the target group — skip to avoid overwriting the
        // saved colour when componentDidUpdate re-dispatches.
        if (state.activeColorGroup === newGroup) return state;
        const updatedByGroup = {
          ...state.textColorByGroup,
          [prevGroup]: state.textColor,
        };
        const newColor = updatedByGroup[newGroup] ?? DEFAULT_COLORS_BY_GROUP[newGroup] ?? state.textColor;
        return {
          ...state,
          textColorByGroup: updatedByGroup,
          textColor: newColor,
          activeColorGroup: newGroup,
        };
      }

      default:
        return state;
    }
  }

  static bindDispatch(dispatch: Dispatch) {
    return bindActionCreators(Toolbar.actions, dispatch)
  }
}
