
import { bindActionCreators, Dispatch } from 'redux'

import { Framebuffer, snapZoom, stepZoom } from './editor'
import * as Screens from './screens'
import { Toolbar as IToolbar, Transform, RootStateThunk, Coord2, Pixel, BrushRegion, Font, Brush, Tool, Angle360, FramebufUIState, DEFAULT_FB_WIDTH, DEFAULT_FB_HEIGHT, LinePreset, BoxPreset, BoxSide, FadeMode, FadeSource, FadeStepStart, FadeStepChoice, FadeStepSort, FadeCharsetSettings, FadePresetToggles, CustomFadeSource, TexturePreset, UltimateDetectedMode, UltimateMachineType, PresetDialogState, TextureDrawMode } from './types'

import * as selectors from './selectors'
import * as screensSelectors from '../redux/screensSelectors'
import {
  getSettingsPaletteRemap,
  getSettingsVic20PaletteRemap,
  getSettingsPetPaletteRemap,
  getSettingsColorSortMode,
  getSettingsCurrentColorPalette,
  getSettingsCurrentTedColorPalette,
  getSettingsCurrentVic20ColorPalette,
  getSettingsCurrentPetColorPalette,
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
import { TRANSPARENT_SCREENCODE, VDC_TRANSPARENT_SCREENCODE } from "../redux/types";
import { DEFAULT_COLORS_BY_GROUP, getColorGroup, selectPaletteForFramebuf, sortPaletteByLuma, vdcPalette } from '../utils/palette';
import { resolveEffectivePixel, EffectivePixelOptions } from '../utils/effectivePixel';
import { effectiveAttr, withColor, VDC_ATTR_ALTCHAR } from '../utils/vdcAttr';

/** Platform colour-group keys used to bucket Box / Texture presets.
 *  Each platform with separate upper/lower ROMs gets two entries;
 *  c128vdc is a single-charset mode and stays unsplit. */
export type PresetGroup =
  | 'c64'
  | 'c64l'
  | 'vic20'
  | 'vic20l'
  | 'pet'
  | 'petl'
  | 'c128vdc'
  | 'c16'
  | 'c16l';
function getPresetGroups(): PresetGroup[] {
  return ['c64', 'c64l', 'vic20', 'vic20l', 'pet', 'petl', 'c128vdc', 'c16', 'c16l'];
}
export const PRESET_GROUPS: readonly PresetGroup[] = getPresetGroups();

/** Map each lower group to its upper counterpart.  Used by the
 *  build/normalize helpers to seed lower groups from upper presets
 *  when no dedicated lower presets exist yet. */
const LOWER_TO_UPPER: Record<string, string> = {
  c64l: 'c64',
  vic20l: 'vic20',
  petl: 'pet',
  c16l: 'c16',
};

// Local alias to avoid repeating the import-type syntax further down.
type RootStateT = import('./types').RootState;

/** Resolve the preset group for the currently active framebuf. Defaults to
 *  `c64` when no framebuf is active. */
function getActivePresetGroup(state: RootStateT): string {
  const fb = selectors.getCurrentFramebuf(state);
  if (!fb) return 'c64';
  return getColorGroup(fb.charset, fb.width);
}

/** True whenever a modal/dialog is open (Export, Import, Import Seq Adv,
 *  Settings, Resize Settings, Custom Fonts, or the Preset dialog). Shared
 *  by the `keyDown` thunk (to suppress tool/color-slot shortcuts) and by
 *  `App.tsx`'s raw DOM keydown listener (to stop intercepting Tab/Space
 *  for C64-keyboard mimicry while a dialog has focus). */
export function isModalOpen(state: RootStateT): boolean {
  return (
    state.toolbar.showExport.show ||
    state.toolbar.showImport.show ||
    state.toolbar.showImportSeqAdv.show ||
    state.toolbar.showSettings ||
    state.toolbar.showResizeSettings ||
    state.toolbar.showCustomFonts ||
    state.toolbar.presetDialog.show
  );
}

/** Build a fresh grouped preset map seeded from a single flat list (legacy
 *  migration) or from the built-in defaults when `seed` is undefined.
 *  Uses shallow copies so per-group edits never mutate another group.
 *  Lower groups are seeded with a copy of their upper counterpart. */
export function buildGroupedBoxPresets(
  seed?: BoxPreset[] | null,
): Record<string, BoxPreset[]> {
  const src = (seed && seed.length > 0) ? seed : (defaultBoxPresets ?? []);
  const out: Record<string, BoxPreset[]> = {};
  for (const g of getPresetGroups()) out[g] = src.map(p => ({ ...p }));
  return out;
}

export function buildGroupedTexturePresets(
  seed?: TexturePreset[] | null,
): Record<string, TexturePreset[]> {
  const src = (seed && seed.length > 0) ? seed : (defaultTexturePresets ?? []);
  const out: Record<string, TexturePreset[]> = {};
  for (const g of getPresetGroups()) {
    out[g] = src.map(p => ({
      ...p,
      chars: [...p.chars],
      colors: [...p.colors],
      options: p.options ? [...p.options] : undefined,
      brushWidth: Math.max(1, Math.min(255, p.brushWidth ?? 8)),
      brushHeight: Math.max(1, Math.min(255, p.brushHeight ?? 8)),
    }));
  }
  return out;
}

/** Ensure every group has an entry; any missing groups fall back to
 *  their upper counterpart (for lower groups) or to the flat defaults.
 *  Used when loading Settings that only define a subset of the groups. */
export function normalizeGroupedBoxPresets(
  map: Record<string, BoxPreset[]> | undefined | null,
): Record<string, BoxPreset[]> {
  const out: Record<string, BoxPreset[]> = {};
  for (const g of getPresetGroups()) {
    const list = map?.[g];
    if (list && list.length > 0) {
      out[g] = list;
    } else {
      // Lower groups inherit from their upper counterpart when missing;
      // upper groups (and c128vdc) fall back to the flat defaults.
      const upper = LOWER_TO_UPPER[g];
      const fallback = upper ? (out[upper] ?? map?.[upper]) : undefined;
      out[g] = (fallback && fallback.length > 0)
        ? fallback.map(p => ({ ...p }))
        : defaultBoxPresets.map(p => ({ ...p }));
    }
  }
  return out;
}

export function normalizeGroupedTexturePresets(
  map: Record<string, TexturePreset[]> | undefined | null,
): Record<string, TexturePreset[]> {
  const clonePreset = (p: TexturePreset) => ({
    ...p,
    chars: [...p.chars],
    colors: [...p.colors],
    options: p.options ? [...p.options] : undefined,
    brushWidth: Math.max(1, Math.min(255, p.brushWidth ?? 8)),
    brushHeight: Math.max(1, Math.min(255, p.brushHeight ?? 8)),
  });
  const out: Record<string, TexturePreset[]> = {};
  for (const g of getPresetGroups()) {
    const list = map?.[g];
    if (list && list.length > 0) {
      out[g] = list.map(clonePreset);
    } else {
      const upper = LOWER_TO_UPPER[g];
      const fallback = upper ? (out[upper] ?? map?.[upper]) : undefined;
      out[g] = (fallback && fallback.length > 0)
        ? fallback.map(clonePreset)
        : defaultTexturePresets.map(clonePreset);
    }
  }
  return out;
}

import { electron } from '../utils/electronImports'
import { matchesAccelerator, KeyModifiers } from '../keybindings/matchAccelerator'
import { getKeybindingAction, getDefaultAccelerator } from '../keybindings/registry'
import { findReplaceActionCreators, findReplaceThunks, findReplaceReducer } from './toolbarSlices/findReplaceSlice'
import { defaultLinePresets as defaultLinePresetsSlice, lineDrawActionCreators, lineDrawReducer } from './toolbarSlices/lineDrawSlice'
// As of L13 (single-source-of-truth consolidation), boxPresetSlice.ts/
// texturePresetSlice.ts/lineDrawSlice.ts only own toolbar-local UI state
// (selected index, draw-mode toggles) -- the actual preset LIST data lives
// in state.settings.saved/editing.* (see redux/settings.ts), and the
// group-aware CRUD thunks panels call are defined directly below in
// Toolbar.actions, delegating into settings.ts via a lazy require (same
// pattern as switchFadeSource/saveFadeToggles). `buildGroupedBoxPresets`/
// `defaultBoxPresets`/`normalizeGroupedBoxPresets` (and texture/line
// equivalents) stay defined in this file since settings.ts's own
// `initialState`/`fromJson` call them eagerly during toolbar.ts's
// long-standing circular require with settings.ts.
import { boxPresetActionCreators, boxPresetReducer } from './toolbarSlices/boxPresetSlice'
import { texturePresetActionCreators, texturePresetReducer } from './toolbarSlices/texturePresetSlice'
import { fadeActionCreators, fadeReducer } from './toolbarSlices/fadeSlice'
import { colorPaletteActionCreators, colorPaletteReducer } from './toolbarSlices/colorPaletteSlice'
import { keybindingsUiStateActionCreators, keybindingsUiStateReducer } from './toolbarSlices/keybindingsUiStateSlice'
// Plain re-assignment (not a bare `export { defaultLinePresets }` re-export
// declaration) so this compiles to a straightforward, eagerly-evaluated
// `exports.defaultLinePresets = ...` at this exact textual position --
// toolbar.ts is pulled into a long-standing circular require chain
// (toolbar -> screens -> selectors -> utils -> importers -> workspace ->
// root -> settings -> toolbar), and settings.ts reads this export while
// toolbar.ts is still mid-initialization. A getter-based re-export looks
// equivalent in isolation but behaves differently under that circular
// resolution and broke settings.ts's read (see the Group L / L1-L7 commit
// that introduced this slice for details).
export const defaultLinePresets = defaultLinePresetsSlice;


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

/** Legacy flat default box presets — used to seed every group on first load
 *  and to back-fill missing groups when migrating older Settings JSON. */
export var defaultBoxPresets: BoxPreset[] = [
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

/** Legacy flat default texture presets — used to seed every group on first load
 *  and to back-fill missing groups when migrating older Settings JSON. */
export var defaultTexturePresets: TexturePreset[] = [
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

function getDefaultCustomFadeSources(): CustomFadeSource[] {
  return [
    { id: 'hline-b2t', name: 'H LINE B2T', screencodes: [32, 98, 100, 111, 121, 160, 227, 247, 248] },
    { id: 'hline-t2b', name: 'H LINE T2B', screencodes: [32, 99, 119, 120, 224, 226, 228, 239, 249] },
    { id: 'vline-l2r', name: 'V LINE L2R', screencodes: [32, 97, 101, 116, 117, 160, 231, 234, 246] },
    { id: 'vline-r2l', name: 'V LINE R2L', screencodes: [32, 103, 106, 118, 160, 225, 229, 244, 245] },
    { id: 'blocky',    name: 'BLOCKY',     screencodes: [32, 92, 102, 104, 108, 123, 124, 126, 127, 160, 204, 207, 208, 220, 230, 232, 236, 250, 251, 252, 254, 255] },
  ];
}
function getDefaultFadeSourceToggles(): Record<string, FadePresetToggles> {
  return {
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
}
export const defaultCustomFadeSources: CustomFadeSource[] = getDefaultCustomFadeSources();
export const defaultFadeSourceToggles: Record<string, FadePresetToggles> = getDefaultFadeSourceToggles();

/** Build a grouped customFadeSources map, seeding every group from the flat seed.
 *  Uses JSON round-trip to guarantee zero shared references between groups. */
export function buildGroupedFadeSources(
  seed?: CustomFadeSource[] | null,
): Record<string, CustomFadeSource[]> {
  const src = (seed && seed.length > 0) ? seed : getDefaultCustomFadeSources();
  const ensureIds = (list: CustomFadeSource[]) => list.map(cs =>
    cs.id ? cs : { ...cs, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }
  );
  const canonical = ensureIds(src);
  const out: Record<string, CustomFadeSource[]> = {};
  for (const g of getPresetGroups()) out[g] = JSON.parse(JSON.stringify(canonical));
  return out;
}

export function normalizeGroupedFadeSources(
  map: Record<string, CustomFadeSource[]> | undefined | null,
): Record<string, CustomFadeSource[]> {
  const out: Record<string, CustomFadeSource[]> = {};
  for (const g of getPresetGroups()) {
    const list = map?.[g];
    if (list && list.length > 0) {
      out[g] = JSON.parse(JSON.stringify(list));
    } else {
      const upper = LOWER_TO_UPPER[g];
      const fallback = upper ? (out[upper] ?? map?.[upper]) : undefined;
      out[g] = (fallback && fallback.length > 0)
        ? JSON.parse(JSON.stringify(fallback))
        : JSON.parse(JSON.stringify(getDefaultCustomFadeSources()));
    }
  }
  return out;
}

/** Build a grouped fadeSourceToggles map.
 *  Uses JSON round-trip to guarantee zero shared references between groups. */
export function buildGroupedFadeToggles(
  seed?: Record<string, FadePresetToggles> | null,
): Record<string, Record<string, FadePresetToggles>> {
  const src = (seed && Object.keys(seed).length > 0) ? seed : getDefaultFadeSourceToggles();
  const out: Record<string, Record<string, FadePresetToggles>> = {};
  for (const g of getPresetGroups()) out[g] = JSON.parse(JSON.stringify(src));
  return out;
}

export function normalizeGroupedFadeToggles(
  map: Record<string, Record<string, FadePresetToggles>> | undefined | null,
): Record<string, Record<string, FadePresetToggles>> {
  const out: Record<string, Record<string, FadePresetToggles>> = {};
  for (const g of getPresetGroups()) {
    const entry = map?.[g];
    if (entry && Object.keys(entry).length > 0) {
      out[g] = JSON.parse(JSON.stringify(entry));
    } else {
      const upper = LOWER_TO_UPPER[g];
      const fallback = upper ? (out[upper] ?? map?.[upper]) : undefined;
      out[g] = (fallback && Object.keys(fallback).length > 0)
        ? JSON.parse(JSON.stringify(fallback))
        : JSON.parse(JSON.stringify(getDefaultFadeSourceToggles()));
    }
  }
  return out;
}


// defaultLinePresets moved to toolbarSlices/lineDrawSlice.ts (re-exported above).

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
const INVERT_CHAR = 'Toolbar/INVERT_CHAR'
const INVERT_SINGLE_CHAR = 'Toolbar/INVERT_SINGLE_CHAR'
const INC_UNDO_ID = 'Toolbar/INC_UNDO_ID'
const SET_FRAMEBUF_UI_STATE = 'Toolbar/SET_FRAMEBUF_UI_STATE'
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
  // ---- Color / palette-remap: see toolbarSlices/colorPaletteSlice.ts ----
  ...colorPaletteActionCreators,
  invertCharAction: (font: Font) => createAction(INVERT_CHAR, font),
  invertSingleCharAction: (font: Font, code: number) => createAction(INVERT_SINGLE_CHAR, { font, code }),
  invertBrushAction: (brush: Brush) => createAction(INVERT_BRUSH, brush),
  // ---- Keybindings UI-state: see toolbarSlices/keybindingsUiStateSlice.ts ----
  ...keybindingsUiStateActionCreators,
  captureBrush,
  mirrorBrush: (axis: number) => createAction(MIRROR_BRUSH, axis),
  rotateBrush: (dir: number) => createAction(ROTATE_BRUSH, dir),
  mirrorChar: (axis: number) => createAction(MIRROR_CHAR, axis),
  rotateChar: (dir: number) => createAction(ROTATE_CHAR, dir),
  pasteText: () => createAction(PASTE_TEXT),
  setZoom: (level: number, alignment: string) => createAction(SET_ZOOM, { level, alignment }),
  setAllZoom: (level: number, alignment: string) => createAction(SET_ZOOM, { level, alignment }),
  setFramebufUIState: (framebufIndex: number, uiState?: FramebufUIState) => createAction(SET_FRAMEBUF_UI_STATE, { framebufIndex, uiState }),
  setTextCursorPos: (pos: Coord2 | null) => createAction('Toolbar/SET_TEXT_CURSOR_POS', pos),
  setSelectedTool: (t: Tool) => createAction('Toolbar/SET_SELECTED_TOOL', t),
  setBrushRegion: (br: BrushRegion) => createAction('Toolbar/SET_BRUSH_REGION', br),
  setBrush: (b: Brush) => createAction('Toolbar/SET_BRUSH', b),
  setWorkspaceFilename: (fname: string | null) => createAction('Toolbar/SET_WORKSPACE_FILENAME', fname),
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
  setPresetDialog: (dialog: PresetDialogState) => createAction('Toolbar/SET_PRESET_DIALOG', dialog),
  setCanvasGrid: (flag: boolean) => createAction('Toolbar/SET_CANVAS_GRID', flag),
  setNewScreenSize: (dims: { width: number, height: number }) => createAction('Toolbar/SET_NEW_SCREEN_SIZE', dims),
  setUltimateStatus: (status: {
    ultimateOnline: boolean,
    ultimateMachineType: UltimateMachineType,
    ultimateMode: UltimateDetectedMode,
    ultimateLastContactedAt: string | null
  }) => createAction('Toolbar/SET_ULTIMATE_STATUS', status),
  swapColors: (colors: { srcColor: number, destColor: number }) => createAction('Toolbar/SWAP_COLORS', colors),
  swapChars: (chars: { srcChar: number, destChar: number }) => createAction('Toolbar/SWAP_CHARS', chars),
  setTextCapsLock: (flag: boolean) => createAction(SET_TEXT_CAPS_LOCK, flag),
  /** VDC-only: toggle alternate ROM bank for Text tool typing. */
  setTextVdcAltCharset: (flag: boolean) => createAction('Toolbar/SET_TEXT_VDC_ALT_CHARSET', flag),
  setGuideLayerVisible: (flag: boolean) => createAction('Toolbar/SET_GUIDE_LAYER_VISIBLE', flag),
  setGuideAutoConvert: (flag: boolean) => createAction('Toolbar/SET_GUIDE_AUTO_CONVERT', flag),
  // ---- Line Draw: see toolbarSlices/lineDrawSlice.ts ----
  ...lineDrawActionCreators,
  // ---- Fade: see toolbarSlices/fadeSlice.ts ----
  ...fadeActionCreators,
  // ---- Box preset: see toolbarSlices/boxPresetSlice.ts ----
  ...boxPresetActionCreators,
  // ---- Texture preset / settings: see toolbarSlices/texturePresetSlice.ts ----
  ...texturePresetActionCreators,
  setGuideLayerDragOffset: (offset: { dx: number; dy: number } | null) => createAction('Toolbar/SET_GUIDE_LAYER_DRAG_OFFSET', offset),
  // ---- Find and Replace: see toolbarSlices/findReplaceSlice.ts ----
  ...findReplaceActionCreators,
  /** Set the VDC paint-attribute flag mask (REVERSE/UNDERLINE/BLINK).
   *  Only the high nibble (bits 4–7) is meaningful; lower bits are masked
   *  out by the reducer.  No-op on non-VDC frames — the painter only
   *  reads this field when the current charset is `c128vdc`. */
  setVdcPaintFlags: (flags: number) => createAction('Toolbar/SET_VDC_PAINT_FLAGS', flags & 0xf0),
  /** Set the TED/C16 paint blink toggle. */
  setC16PaintBlink: (flag: boolean) => createAction('Toolbar/SET_C16_PAINT_BLINK', flag),
};

export type Actions = ActionsUnion<typeof actionCreators>;

export type PropsFromDispatch = DispatchPropsFromActions<typeof Toolbar.actions>;

export class Toolbar {

  static MIRROR_X = 1
  static MIRROR_Y = 2

  static actions = {
    ...actionCreators,

    keyDown: (k: string | undefined): RootStateThunk => {
      if (typeof k !== 'string' || k.length === 0) {
        return (_dispatch, _getState) => {};
      }
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
          presetDialog,

        } = state.toolbar
        const noMods = !shiftKey && !metaKey && !ctrlKey && !tabKey && !altKey
        const metaOrCtrl = metaKey || ctrlKey

        // Resolve the pressed key + modifiers against a remappable `kind:
        // 'tool'` action's current keybinding (user override, or the
        // registry's platform default when unset). `tabKey` is not part of
        // the Electron accelerator model and is handled separately below
        // only for the legacy Alt/Tab digit synonym on color slots 0-7.
        const keybindings = state.settings.saved.keybindings
        const mods: KeyModifiers = { shiftKey, ctrlKey, altKey, metaKey }
        const matches = (actionId: string): boolean => {
          const action = getKeybindingAction(actionId)
          if (!action) return false
          const accelerator = keybindings[actionId] ?? getDefaultAccelerator(action)
          return matchesAccelerator(accelerator, key, mods)
        }
        // Legacy quirk: Alt+<digit> color-slot shortcuts (0-7) have always
        // also fired on Tab+<digit>. Only honor that synonym while the
        // action is still at its default binding -- once a user remaps a
        // slot away from Alt+<digit>, Tab+<digit> no longer implicitly
        // triggers it.
        const matchesAltOrTabDigit = (actionId: string, digit: string): boolean => {
          if (matches(actionId)) return true
          if (!tabKey || key !== digit) return false
          const action = getKeybindingAction(actionId)
          if (!action) return false
          const current = keybindings[actionId]
          return !current || current === getDefaultAccelerator(action)
        }

        const inModal = isModalOpen(state);

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
            if (presetDialog.show) {
              dispatch(Toolbar.actions.setPresetDialog({ show: false }));
            }
          }
          return;
        }



        let width = 1;
        let height = 1;
        let charset = '';
        const framebufIndex = screensSelectors.getCurrentScreenFramebufIndex(state)
        if (framebufIndex !== null) {
          const fb = selectors.getFramebufByIndex(state, framebufIndex)!;
          width = fb.width;
          height = fb.height;
          charset = fb.charset;
        }
        const inTextInput = selectedTool === Tool.Text && state.toolbar.textCursorPos !== null
        // These shortcuts should work regardless of what drawing tool is selected.
        if (noMods) {
          if (!inTextInput) {
            if (matches('tool.prevScreen')) {
              dispatch(Toolbar.actions.nextScreenWithColor(-1))
              return
            } else if (matches('tool.nextScreen')) {
              dispatch(Toolbar.actions.nextScreenWithColor(+1))
              return
            } else if (matches('tool.colorPrev')) {
              dispatch(Toolbar.actions.nextColor(-1))
              return
            } else if (matches('tool.colorNext')) {
              dispatch(Toolbar.actions.nextColor(+1))
              return
            } else if (matches('tool.selectDraw')) {
              dispatch(Toolbar.actions.setSelectedTool(Tool.Draw))
              return
            } else if (matches('tool.selectColorize')) {
              dispatch(Toolbar.actions.setSelectedTool(Tool.Colorize))
              return
            } else if (matches('tool.selectCharDraw')) {
              dispatch(Toolbar.actions.setSelectedTool(Tool.CharDraw))
              return
            } else if (matches('tool.selectRvsPen')) {
              dispatch(Toolbar.actions.setSelectedTool(Tool.RvsPen))
              return
            } else if (matches('tool.selectBrush')) {
              dispatch(Toolbar.actions.setSelectedTool(Tool.Brush))
              return
            } else if (matches('tool.selectText')) {
              dispatch(Toolbar.actions.setSelectedTool(Tool.Text))
              return
            } else if (matches('tool.selectPanZoom')) {
              dispatch(Toolbar.actions.setSelectedTool(Tool.PanZoom))
              return
            } else if (matches('tool.toggleGuideLayer')) {
              return dispatch((dispatch: any, getState: any) => {
                const { guideLayerVisible } = getState().toolbar
                dispatch(Toolbar.actions.setGuideLayerVisible(!guideLayerVisible))
              })
            }
          }
        }



        if (altKey || tabKey) {
          if (matchesAltOrTabDigit('tool.colorSlot0', '1')) {
            dispatch(Toolbar.actions.setColor(0))
            return
          } else if (matchesAltOrTabDigit('tool.colorSlot1', '2')) {
            dispatch(Toolbar.actions.setColor(1))
            return
          } else if (matchesAltOrTabDigit('tool.colorSlot2', '3')) {
            dispatch(Toolbar.actions.setColor(2))
            return
          } else if (matchesAltOrTabDigit('tool.colorSlot3', '4')) {
            dispatch(Toolbar.actions.setColor(3))
            return
          } else if (matchesAltOrTabDigit('tool.colorSlot4', '5')) {
            dispatch(Toolbar.actions.setColor(4))
            return
          } else if (matchesAltOrTabDigit('tool.colorSlot5', '6')) {
            dispatch(Toolbar.actions.setColor(5))
            return
          } else if (matchesAltOrTabDigit('tool.colorSlot6', '7')) {
            dispatch(Toolbar.actions.setColor(6))
            return
          } else if (matchesAltOrTabDigit('tool.colorSlot7', '8')) {
            dispatch(Toolbar.actions.setColor(7))
            return

          }

        }



        if (ctrlKey) {
          if (matches('tool.colorSlot8')) {
            dispatch(Toolbar.actions.setColor(8))
            return
          }
          else if (matches('tool.colorSlot9')) {
            dispatch(Toolbar.actions.setColor(9))
            return
          } else if (matches('tool.colorSlot10')) {
            dispatch(Toolbar.actions.setColor(10))
            return
          } else if (matches('tool.colorSlot11')) {
            dispatch(Toolbar.actions.setColor(11))
            return
          } else if (matches('tool.colorSlot12')) {
            dispatch(Toolbar.actions.setColor(12))
            return
          } else if (matches('tool.colorSlot13')) {
            dispatch(Toolbar.actions.setColor(13))
            return
          } else if (matches('tool.colorSlot14')) {
            dispatch(Toolbar.actions.setColor(14))
            return
          } else if (matches('tool.colorSlot15')) {
            dispatch(Toolbar.actions.setColor(15))
            return
          }

          if (matches('tool.selectAll')) {
            dispatch(Toolbar.actions.selectAll());
            dispatch(Toolbar.actions.setSelectedTool(Tool.Brush))
          }
          if (matches('tool.pasteFrameOrText')) {
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
          if (matches('tool.copyFrameAsPng')) {
            dispatch(Toolbar.actions.copyCurrentFrameAsPNG())
          }
          else if (matches('tool.copyFrame')) {
            dispatch(Toolbar.actions.copyCurrentFrame())
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
        if (selectedTool === Tool.Lines || selectedTool === Tool.Boxes || selectedTool === Tool.Circles) {
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
        if (selectedTool === Tool.FindReplace) {
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

          // Backtick toggles between primary (0–255) and alternate (256–511)
          // ROM bank for Text tool typing.  VDC screens only.
          if (key === '`' && charset === 'c128vdc') {
            dispatch(Toolbar.actions.setTextVdcAltCharset(!state.toolbar.textVdcAltCharset))
            return
          }

          if (state.toolbar.textCursorPos !== null && !metaOrCtrl) {
            // Don't match shortcuts if we're in "text tool" mode.
            const { textCursorPos, textColor } = state.toolbar
            let c = convertAsciiToScreencode(shiftKey ? key.toUpperCase() : key)

            if (c !== null)
              c = c + (Number(state.toolbar.textCapsLock) * 128)
            // VDC alt-charset: shift into the alternate ROM bank (256–511).
            if (c !== null && charset === 'c128vdc' && state.toolbar.textVdcAltCharset)
              c = c + 256

            // VDC/TED extended attributes for the text tool:
            const isVdcText = charset === 'c128vdc';
            const isTedText = charset.startsWith('c16');
            const vdcTextExtras: { attrFlags?: number } = isVdcText
              ? { attrFlags: state.toolbar.vdcPaintFlags }
              : {};
            const paintColor = isTedText
              ? ((textColor & 0x7f) | (state.toolbar.c16PaintBlink ? 0x80 : 0))
              : textColor;

            if (framebufIndex !== null) {
              if (c !== null) {
                dispatch(Framebuffer.actions.setPixel({
                  ...textCursorPos,
                  ...vdcTextExtras,
                  screencode: c,
                  color: paintColor,
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
                  ...vdcTextExtras,
                  screencode: 0x20, // space
                  color: paintColor,
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
          } else if (matches('tool.charPickerLeft')) {
            dispatch(Toolbar.actions.nextCharcode({ row: 0, col: -1 }))
          } else if (matches('tool.charPickerRight')) {
            dispatch(Toolbar.actions.nextCharcode({ row: 0, col: +1 }))
          } else if (matches('tool.charPickerDown')) {
            dispatch(Toolbar.actions.nextCharcode({ row: +1, col: 0 }))
          } else if (matches('tool.charPickerUp')) {
            dispatch(Toolbar.actions.nextCharcode({ row: -1, col: 0 }))
          }

          else if (matches('tool.mirrorVertical') || matches('tool.mirrorHorizontal')) {
            let mirror = Toolbar.MIRROR_Y
            if (matches('tool.mirrorHorizontal')) {
              mirror = Toolbar.MIRROR_X
            }
            if (selectedTool === Tool.Brush) {
              dispatch(Toolbar.actions.mirrorBrush(mirror))
            } else if (selectedTool === Tool.Draw || selectedTool === Tool.CharDraw || selectedTool === Tool.RvsPen) {
              dispatch(Toolbar.actions.mirrorChar(mirror))
            }
          }

          else if (matches('tool.invertChar')) {
            dispatch(Toolbar.actions.invertChar())
          } else if (matches('tool.rotate')) {
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

    keyUp: (key: string | undefined): RootStateThunk => {
      if (typeof key !== 'string' || key.length === 0) {
        return (_dispatch, _getState) => {};
      }
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
        const group = getActivePresetGroup(state);
        const oldSource = state.toolbar.fadeSource;
        const groupToggles = state.settings.saved.fadeSourceTogglesByGroup?.[group] ?? {};
        // Save current toggles for old source
        const currentToggles: FadePresetToggles = {
          fadeShowSource: state.toolbar.fadeShowSource,
          fadeStepStart: state.toolbar.fadeStepStart,
          fadeStepCount: state.toolbar.fadeStepCount,
          fadeStepChoice: state.toolbar.fadeStepChoice,
          fadeStepSort: state.toolbar.fadeStepSort,
        };
        const updated = {
          ...groupToggles,
          [oldSource]: currentToggles,
        };
        dispatch(settingsMod.actions.setFadeSourceTogglesForGroup(group, updated));
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
        const group = getActivePresetGroup(state);
        const groupToggles = state.settings.saved.fadeSourceTogglesByGroup?.[group] ?? {};
        const source = state.toolbar.fadeSource;
        const toggles: FadePresetToggles = {
          fadeShowSource: state.toolbar.fadeShowSource,
          fadeStepStart: state.toolbar.fadeStepStart,
          fadeStepCount: state.toolbar.fadeStepCount,
          fadeStepChoice: state.toolbar.fadeStepChoice,
          fadeStepSort: state.toolbar.fadeStepSort,
        };
        dispatch(settingsMod.actions.setFadeSourceTogglesForGroup(group, {
          ...groupToggles,
          [source]: toggles,
        }));
        dispatch(settingsMod.actions.saveEdits());
      };
    },

    // ---- Box/Texture/Line preset CRUD (L13 single-source-of-truth). ----
    // The actual preset LIST data lives only in
    // state.settings.saved/editing.{boxPresetsByGroup,texturePresetsByGroup,
    // linePresets} now -- these thunks delegate into redux/settings.ts's
    // group-aware CRUD thunks via a lazy require('./settings') (same
    // circular-require workaround as switchFadeSource/saveFadeToggles
    // above), and only manage the toolbar-local `selectedBoxPresetIndex`/
    // `selectedTexturePresetIndex`/`selectedLinePresetIndex` UI state
    // (which stays in toolbar state, never persisted) to preserve the
    // exact auto-select/clamp behavior the old in-toolbar reducer cases had.

    /** Explicitly set one group's box preset list (used by PresetDialog's
     *  import/clear flows, which may target a non-active group). */
    setBoxPresetsForGroup: (group: string, presets: BoxPreset[]): RootStateThunk => (dispatch, getState) => {
      const settingsMod = require('./settings') as typeof import('./settings');
      dispatch(settingsMod.actions.setBoxPresetsForGroup(group, presets));
      const newIdx = Math.min(getState().toolbar.selectedBoxPresetIndex, Math.max(0, presets.length - 1));
      dispatch(actionCreators.setSelectedBoxPresetIndex(Math.max(0, newIdx)));
    },
    /** Replace the active group's box preset list. */
    setBoxPresets: (presets: BoxPreset[]): RootStateThunk => (dispatch, getState) => {
      const group = getActivePresetGroup(getState());
      dispatch(Toolbar.actions.setBoxPresetsForGroup(group, presets));
    },
    /** Append a preset to the active group and select it. */
    addBoxPreset: (preset: BoxPreset): RootStateThunk => (dispatch, getState) => {
      const settingsMod = require('./settings') as typeof import('./settings');
      const group = getActivePresetGroup(getState());
      dispatch(settingsMod.actions.addBoxPresetForGroup(group, preset));
      const nextLen = (getState().settings.saved.boxPresetsByGroup[group] ?? []).length;
      dispatch(actionCreators.setSelectedBoxPresetIndex(Math.max(0, nextLen - 1)));
    },
    updateBoxPreset: (index: number, preset: BoxPreset): RootStateThunk => (dispatch, getState) => {
      const settingsMod = require('./settings') as typeof import('./settings');
      const group = getActivePresetGroup(getState());
      dispatch(settingsMod.actions.updateBoxPresetForGroup(group, index, preset));
    },
    removeBoxPreset: (index: number): RootStateThunk => (dispatch, getState) => {
      const settingsMod = require('./settings') as typeof import('./settings');
      const state = getState();
      const group = getActivePresetGroup(state);
      const prevLen = (state.settings.saved.boxPresetsByGroup[group] ?? []).length;
      dispatch(settingsMod.actions.removeBoxPresetForGroup(group, index));
      const filteredLen = Math.max(0, prevLen - 1);
      const newIdx = filteredLen === 0 ? 0 : Math.min(state.toolbar.selectedBoxPresetIndex, filteredLen - 1);
      dispatch(actionCreators.setSelectedBoxPresetIndex(Math.max(0, newIdx)));
    },

    /** Explicitly set one group's texture preset list (used by PresetDialog's
     *  import/clear flows, which may target a non-active group). */
    setTexturePresetsForGroup: (group: string, presets: TexturePreset[]): RootStateThunk => (dispatch, getState) => {
      const settingsMod = require('./settings') as typeof import('./settings');
      dispatch(settingsMod.actions.setTexturePresetsForGroup(group, presets));
      const newIdx = Math.min(getState().toolbar.selectedTexturePresetIndex, Math.max(0, presets.length - 1));
      dispatch(actionCreators.setSelectedTexturePresetIndex(Math.max(0, newIdx)));
    },
    setTexturePresets: (presets: TexturePreset[]): RootStateThunk => (dispatch, getState) => {
      const group = getActivePresetGroup(getState());
      dispatch(Toolbar.actions.setTexturePresetsForGroup(group, presets));
    },
    addTexturePreset: (preset: TexturePreset): RootStateThunk => (dispatch, getState) => {
      const settingsMod = require('./settings') as typeof import('./settings');
      const group = getActivePresetGroup(getState());
      dispatch(settingsMod.actions.addTexturePresetForGroup(group, preset));
      const nextLen = (getState().settings.saved.texturePresetsByGroup[group] ?? []).length;
      dispatch(actionCreators.setSelectedTexturePresetIndex(Math.max(0, nextLen - 1)));
    },
    updateTexturePreset: (index: number, preset: TexturePreset): RootStateThunk => (dispatch, getState) => {
      const settingsMod = require('./settings') as typeof import('./settings');
      const group = getActivePresetGroup(getState());
      dispatch(settingsMod.actions.updateTexturePresetForGroup(group, index, preset));
    },
    removeTexturePreset: (index: number): RootStateThunk => (dispatch, getState) => {
      const settingsMod = require('./settings') as typeof import('./settings');
      const state = getState();
      const group = getActivePresetGroup(state);
      const prevLen = (state.settings.saved.texturePresetsByGroup[group] ?? []).length;
      dispatch(settingsMod.actions.removeTexturePresetForGroup(group, index));
      const filteredLen = Math.max(0, prevLen - 1);
      const newIdx = filteredLen === 0 ? 0 : Math.min(state.toolbar.selectedTexturePresetIndex, filteredLen - 1);
      dispatch(actionCreators.setSelectedTexturePresetIndex(Math.max(0, newIdx)));
    },

    /** Line (separator) presets aren't grouped by platform, unlike box/texture. */
    setLinePresets: (presets: LinePreset[]): RootStateThunk => (dispatch, _getState) => {
      const settingsMod = require('./settings') as typeof import('./settings');
      dispatch(settingsMod.actions.persistLinePresets(presets));
    },
    addLinePreset: (preset: LinePreset): RootStateThunk => (dispatch, getState) => {
      const settingsMod = require('./settings') as typeof import('./settings');
      dispatch(settingsMod.actions.addLinePreset(preset));
      const nextLen = getState().settings.saved.linePresets.length;
      dispatch(actionCreators.setSelectedLinePresetIndex(Math.max(0, nextLen - 1)));
    },
    updateLinePreset: (index: number, preset: LinePreset): RootStateThunk => (dispatch, _getState) => {
      const settingsMod = require('./settings') as typeof import('./settings');
      dispatch(settingsMod.actions.updateLinePreset(index, preset));
    },
    removeLinePreset: (index: number): RootStateThunk => (dispatch, getState) => {
      const settingsMod = require('./settings') as typeof import('./settings');
      const prevLen = getState().settings.saved.linePresets.length;
      dispatch(settingsMod.actions.removeLinePreset(index));
      const filteredLen = Math.max(0, prevLen - 1);
      const newIdx = filteredLen === 0 ? 0 : Math.min(getState().toolbar.selectedLinePresetIndex, filteredLen - 1);
      dispatch(actionCreators.setSelectedLinePresetIndex(Math.max(0, newIdx)));
    },

    /** Clamp the selected Box/Texture indices to whatever is valid for the
     *  given group -- a thunk (not a reducer case) since it needs to read
     *  settings.saved.boxPresetsByGroup/texturePresetsByGroup, which a
     *  reducer can't do now that preset lists live outside toolbar state. */
    clampSelectedPresetIndices: (group: string): RootStateThunk => (dispatch, getState) => {
      const state = getState();
      const boxLen = state.settings.saved.boxPresetsByGroup[group]?.length ?? 0;
      const texLen = state.settings.saved.texturePresetsByGroup[group]?.length ?? 0;
      const clampedBox = boxLen === 0 ? 0 : Math.min(state.toolbar.selectedBoxPresetIndex, boxLen - 1);
      const clampedTex = texLen === 0 ? 0 : Math.min(state.toolbar.selectedTexturePresetIndex, texLen - 1);
      dispatch(actionCreators.setSelectedBoxPresetIndex(Math.max(0, clampedBox)));
      dispatch(actionCreators.setSelectedTexturePresetIndex(Math.max(0, clampedTex)));
    },

    /** Advance the Texture panel's pencil button through its 4-state cycle:
     *  none (select) -> box (drag-fill) -> bucket (flood-fill) -> replace
     *  (replace-all) -> back to none. Single dispatch so the UI only needs
     *  one onClick handler. */
    cycleTextureDrawMode: (): RootStateThunk => (dispatch, getState) => {
      const order: TextureDrawMode[] = ['none', 'box', 'bucket', 'replace'];
      const current = getState().toolbar.textureDrawMode;
      const nextIdx = (order.indexOf(current) + 1) % order.length;
      dispatch(actionCreators.setTextureDrawMode(order[nextIdx]));
    },

    /** `undoId`, when provided, groups repeated fills together into a single
     *  undo-history entry (see redux-undo's `groupBy` in framebufList.ts).
     *  Without it, every re-apply (e.g. from the Texture panel's auto-apply
     *  effect firing on each option/scale/color tweak while Fill mode is
     *  active) would push its own separate, ungrouped entry and flood the
     *  undo stack. Callers that want that grouping should pass a stable id
     *  for the duration of the "session" (see TexturePanel.tsx). */
    fillTexture: (grid: Pixel[][], undoId: number | null = null): RootStateThunk => {
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
        // Tile the grid across the full framebuffer
        const tiledFb: Pixel[][] = [];
        for (let r = 0; r < height; r++) {
          const row: Pixel[] = [];
          for (let c = 0; c < width; c++) {
            row.push(grid[r % gridH][c % gridW]);
          }
          tiledFb.push(row);
        }
        // Use copyFramebuf for clean undo snapshot
        dispatch(Framebuffer.actions.copyFramebuf({
          ...fb,
          framebuf: tiledFb,
        }, framebufIndex, undoId));
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
    makeDirartSafe: (): RootStateThunk => {
      return dispatchForCurrentFramebuf((dispatch, framebufIndex) => {
        dispatch(Framebuffer.actions.makeDirartSafe(framebufIndex))
      });
    },
    swapColors: (colors: { srcColor: number, destColor: number }): RootStateThunk => {
      return dispatchForCurrentFramebuf((dispatch, framebufIndex) => {
        dispatch(Framebuffer.actions.swapColors(colors, framebufIndex))
      });
    },
    /** Paint every cell in the current framebuf with `color` while leaving
     *  screencodes untouched.  Backs the color picker's ctrl+shift click. */
    setAllColors: (color: number): RootStateThunk => {
      return dispatchForCurrentFramebuf((dispatch, framebufIndex) => {
        dispatch(Framebuffer.actions.setAllColors(color, framebufIndex))
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
        const charset = fb?.charset || 'c64';
        const prefix = charset.substring(0, 3);
        const isTED = prefix === 'c16';
        const isVDC80 = charset === 'c128vdc' || (prefix === 'c12' && (fb?.width ?? 40) >= 80);
        // Mirror nextColor's platform-aware remap selection -- previously
        // this always used the C64 remap, so Alt+digit color-slot shortcuts
        // picked the wrong colors on VIC-20/PET screens whenever the user
        // had customized those platforms' color remaps in Preferences.
        // VIC-20 exposes 8 usable foreground colors (matches numFgColors in
        // Editor.tsx); PET exposes 2 (background + the single phosphor
        // foreground) -- slice(0, 2), NOT slice(1, 2), so slot 0 (background)
        // and slot 1 (foreground) are both in range. Slicing to just index 1
        // previously made PET's remap only 1 entry long, so SET_COLOR's
        // remap[slot] lookup (and ctrlClick's eyedrop sampling, which calls
        // setColor(pix.color) with pix.color possibly 0 or 1) produced
        // `undefined` for any slot/color other than 1.
        let remap: number[];
        if (isTED) {
          remap = Array.from({ length: 128 }, (_, i) => i);
        } else if (prefix === 'vic') {
          remap = getSettingsVic20PaletteRemap(state).slice(0, 8);
        } else if (prefix === 'pet') {
          remap = getSettingsPetPaletteRemap(state).slice(0, 2);
        } else if (isVDC80) {
          remap = Array.from({ length: 16 }, (_, i) => i);
        } else {
          remap = getSettingsPaletteRemap(state);
        }
        dispatch(actionCreators.setColorAction(slot, remap));
      }
    },


    nextColor: (dir: number): RootStateThunk => {
      return (dispatch, getState) => {
        const state = getState()
        const fb = selectors.getCurrentFramebuf(state);
        const charset = fb?.charset || 'c64';
        const prefix = charset.substring(0, 3);
        const isTED = prefix === 'c16';
        const isVDC80 = charset === 'c128vdc' || (prefix === 'c12' && (fb?.width ?? 40) >= 80);

        let remap: number[];
        if (isTED) {
          remap = Array.from({ length: 128 }, (_, i) => i);
        } else if (prefix === 'vic') {
          remap = getSettingsVic20PaletteRemap(state).slice(0, 8);
        } else if (prefix === 'pet') {
          // See setColor's comment above: PET has 2 usable colors (slots 0-1).
          remap = getSettingsPetPaletteRemap(state).slice(0, 2);
        } else if (isVDC80) {
          remap = Array.from({ length: 16 }, (_, i) => i);
        } else {
          remap = getSettingsPaletteRemap(state);
        }

        if (!isTED) {
          const sortMode = getSettingsColorSortMode(state);
          const colorPalette = prefix === 'vic'
            ? getSettingsCurrentVic20ColorPalette(state)
            : prefix === 'pet'
              ? getSettingsCurrentPetColorPalette(state)
              : isVDC80
                ? vdcPalette
                : getSettingsCurrentColorPalette(state);
          remap = sortPaletteByLuma(remap, colorPalette, sortMode);
        }
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
        const fb = selectors.getCurrentFramebuf(state);
        const isVdc = fb?.charset === 'c128vdc';
        const isTed = fb?.charset?.startsWith('c16') === true;
        if (isTed) {
          dispatch(Toolbar.actions.setTextColor(pix.color & 0x7f));
          dispatch(Toolbar.actions.setC16PaintBlink((pix.color & 0x80) !== 0));
        } else {
          dispatch(Toolbar.actions.setTextColor(pix.color));
        }
        // VDC: alt-click on a cell with the ALT attribute bit set should
        // select the upper-bank picker slot (256–511), not the lower one.
        // Non-VDC charsets carry no `attr`, so the original behaviour is
        // preserved byte-for-byte.
        let effectiveCode = pix.code;
        const isTransparentPick = isVdc
          ? (
            pix.transparent === true ||
            pix.code === VDC_TRANSPARENT_SCREENCODE
          )
          : (
            pix.transparent === true ||
            pix.code === TRANSPARENT_SCREENCODE ||
            pix.code === VDC_TRANSPARENT_SCREENCODE
          );
        if (isTransparentPick) {
          effectiveCode = isVdc ? VDC_TRANSPARENT_SCREENCODE : TRANSPARENT_SCREENCODE;
        } else if (isVdc) {
          const attr = (typeof pix.attr === 'number' ? pix.attr : pix.color) & 0xff;
          if ((attr & 0x80) !== 0) {
            effectiveCode = (pix.code & 0xff) + 256;
          }
          // Pick up REVERSE/UNDERLINE/BLINK flag bits (4–6) so the
          // character-panel R/U/B toggles match the sampled cell.
          dispatch(Toolbar.actions.setVdcPaintFlags(attr & 0x70));
        }
        dispatch(Toolbar.actions.setScreencode(effectiveCode))
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
        // setBorderOn addresses a framebuf by index directly, so this can
        // operate on every screen's framebuf id without touching the
        // current-screen selection at all (previously this passed each
        // framebuf id to setCurrentScreenIndex, which expects a *screen
        // list* index -- those only happen to coincide before any
        // reorder/delete, after which this would select the wrong tab).
        screensSelectors.getScreens(state).forEach((framebufId) => {
          dispatch(Framebuffer.actions.setBorderOn(borderOn, framebufId))
        })
      }
    },
    setAllBorderFlip: (): RootStateThunk => {
      return (dispatch, getState) => {
        const state = getState()
        screensSelectors.getScreens(state).forEach((framebufId) => {
          dispatch(Framebuffer.actions.setBorderOn(!state.framebufList[framebufId].present.borderOn, framebufId))
        })
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
        const JSONData = getJSON(copyFrameWithFont, state.customFonts);
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
        const exportPalette = selectPaletteForFramebuf(currentFrame, {
          c64: getSettingsCurrentColorPalette(state),
          c16: getSettingsCurrentTedColorPalette(state),
          vic20: getSettingsCurrentVic20ColorPalette(state),
          pet: getSettingsCurrentPetColorPalette(state),
        });

        electron.clipboard.writeBuffer(
          "image/png",
          Buffer.from(getPNG(copyFrameWithFont, exportPalette),"base64")
        );

      }
        }

    },

    pasteFrame: (): RootStateThunk => {
      return (dispatch, getState) => {
        const state = getState()
        const currentFrameIndex = screensSelectors.getCurrentScreenFramebufIndex(state)
        if (currentFrameIndex === null) return;
        // Shared with the tab context menu's Paste (FramebufferTabs.tsx) --
        // see pasteFramebufferFromClipboard in redux/screens.ts for the
        // clipboard parsing/validation/custom-font-restore logic.
        dispatch(Screens.actions.pasteFramebufferFromClipboard(currentFrameIndex));
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
        // setZoom (the thunk above) operates on whichever screen is
        // "current", so each screen must briefly become current in turn.
        // Iterate by *screen-list index* (0..length-1), not by the
        // framebuf id stored at each slot -- setCurrentScreenIndex expects
        // a screen index, and passing a framebuf id instead would select
        // the wrong tab (or go out of range) after any reorder/delete.
        const currentScreenIndex = screensSelectors.getCurrentScreenIndex(state)
        const numScreens = screensSelectors.getScreens(state).length
        for (let screenIndex = 0; screenIndex < numScreens; screenIndex++) {
          dispatch(Screens.actions.setCurrentScreenIndex(screenIndex))
          dispatch(Toolbar.actions.setZoom(level, 'left'))
        }
        dispatch(Screens.actions.setCurrentScreenIndex(currentScreenIndex))
      }
    },

    // ---- Find and Replace thunks: see toolbarSlices/findReplaceSlice.ts ----
    ...findReplaceThunks,

    pasteText: (): RootStateThunk => {
      return (dispatch, getState) => {
        const state = getState()
        let width = 1;
        let height = 1;
        let pasteCharset = '';
        const framebufIndex = screensSelectors.getCurrentScreenFramebufIndex(state)
        if (framebufIndex !== null) {
          const fb = selectors.getFramebufByIndex(state, framebufIndex)!;
          width = fb.width;
          height = fb.height;
          pasteCharset = fb.charset;
        }


        if (state.toolbar.textCursorPos !== null) {
          const { textCursorPos, textColor, undoId } = state.toolbar
          const clip = "" + electron.clipboard.readText().toString()

          // VDC/TED extended attributes for pasted text -- mirrors the
          // single-char keyDown text-tool path above. Without this, pasted
          // text always wrote plain `textColor` with no VDC attribute byte
          // and no TED blink bit, silently dropping REVERSE/UNDERLINE/BLINK
          // flags (and the TED blink toggle) that typed text already honors.
          const isVdcText = pasteCharset === 'c128vdc';
          const isTedText = pasteCharset.startsWith('c16');
          const vdcTextExtras: { attrFlags?: number } = isVdcText
            ? { attrFlags: state.toolbar.vdcPaintFlags }
            : {};
          const paintColor = isTedText
            ? ((textColor & 0x7f) | (state.toolbar.c16PaintBlink ? 0x80 : 0))
            : textColor;

          if (clip !== null) {
            if (electron.clipboard.availableFormats().includes("text/plain")) {
              if (state.toolbar.selectedTool === Tool.Text) {

                let coords = { col: 0, row: 0 }
                let enters = 0;
                let charcount = 0;
                const clipChars = [...clip];
                // Treat \n (10), \r (13), and \r\n pairs all as a single line
                // break. Clipboard text from macOS/Linux uses bare \n, so
                // previously only \r (Windows/legacy Mac) advanced the row --
                // \n fell through to convertAsciiToScreencode (which returns
                // null for it), silently dropping the break and collapsing
                // multi-line paste onto one row.
                for (let i = 0; i < clipChars.length; i++) {
                  const char = clipChars[i];
                  const code = asc2int(char);
                  if (code === 10 || code === 13) {
                    // Consume the paired \n in a \r\n sequence so it doesn't
                    // trigger a second, blank line break.
                    if (code === 13 && clipChars[i + 1] !== undefined && asc2int(clipChars[i + 1]) === 10) {
                      i++;
                    }
                    enters++;
                    charcount = 0;
                    continue;
                  }
                  coords = { col: textCursorPos.col + charcount, row: textCursorPos.row + enters }
                  let c = convertAsciiToScreencode(state.toolbar.shiftKey ? char.toUpperCase() : char)
                  // Apply CapsLock + VDC alt-charset offsets for pasted text
                  if (c !== null)
                    c = c + (Number(state.toolbar.textCapsLock) * 128)
                  if (c !== null && pasteCharset === 'c128vdc' && state.toolbar.textVdcAltCharset)
                    c = c + 256
                  if (c !== null) {
                    // Share a single undoId across every pasted character
                    // (mirrors the drag-paint pattern in Editor.tsx, where
                    // every setPixel during one drag shares state.toolbar's
                    // current undoId) so the whole paste groups into one
                    // undo-history entry instead of one per character --
                    // previously each call passed `null`, and groupByUndoId
                    // in framebufList.ts never merges null-grouped actions
                    // with each other, so pasting N characters pushed N
                    // separate undo steps.
                    dispatch(Framebuffer.actions.setPixel({
                      ...coords,
                      ...vdcTextExtras,
                      screencode: c,
                      color: paintColor,
                    }, undoId, framebufIndex));
                    charcount++;
                  }
                }
                const newCursorPos = moveTextCursor(
                  textCursorPos,
                  { col: charcount, row: enters },
                  width, height
                )
                dispatch(Toolbar.actions.setTextCursorPos(newCursorPos))
                // Close out this paste's undo group so the *next* edit
                // (whatever it is) starts a fresh group rather than being
                // merged into the pasted text's undo entry.
                dispatch(Toolbar.actions.incUndoId())

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
    textVdcAltCharset: false,
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
    presetDialog: { show: false },
    selectedPaletteRemap: 0,
    canvasGrid: false,
    shortcutsActive: true,
    guideLayerVisible: false,
    guideAutoConvert: false,
    ultimateOnline: false,
    ultimateMachineType: null as UltimateMachineType,
    ultimateMode: null as UltimateDetectedMode,
    ultimateLastContactedAt: null as (string | null),
    selectedLinePresetIndex: 0,
    selectedBoxPresetIndex: 0,
    selectedTexturePresetIndex: 0,
    textureRandomColor: false,
    textureOptions: [false, false, false, false, false, false],
    texturePatternType: 'manual',
    textureSeed: 1,
    textureScale: 1,
    textureOutputMode: 'none' as 'brush' | 'fill' | 'none',
    textureForceForeground: false,
    textureBrushWidth: 8,
    textureBrushHeight: 8,
    textureDrawMode: 'none' as TextureDrawMode,
    fadeDrawMode: false,
    boxDrawMode: true,
    boxForceForeground: false,
    guideLayerDragOffset: null as { dx: number; dy: number } | null,
    lineDrawChunkyMode: false,
    lineDrawPoints: [] as Coord2[],
    lineDrawActive: false,
    findReplaceWidth: 1,
    findReplaceHeight: 1,
    findReplaceReplaceWidth: 1,
    findReplaceReplaceHeight: 1,
    findReplaceFind: null as (Pixel[][] | null),
    findReplaceReplace: null as (Pixel[][] | null),
    findReplaceReplaceWhat: 'both' as 'both' | 'chars' | 'color',
    findReplaceAllFrames: false,
    findReplaceMode: 'first' as 'first' | 'all',
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
    vdcPaintFlags: 0,
    c16PaintBlink: false,
  }, action: Actions) {
    // Domain slices composed in as a reducer pipeline (Group L / L1-L7):
    // each handles only its own action types and returns `state` unchanged
    // for everything else, so applying them in sequence before this
    // switch's own (not-yet-extracted) cases is safe regardless of order.
    state = findReplaceReducer(state, action);
    state = lineDrawReducer(state, action);
    state = boxPresetReducer(state, action);
    state = texturePresetReducer(state, action);
    state = fadeReducer(state, action);
    state = colorPaletteReducer(state, action);
    state = keybindingsUiStateReducer(state, action);
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
      // ---- Color / palette-remap reducer cases: see
      // toolbarSlices/colorPaletteSlice.ts (dispatched into via
      // colorPaletteReducer above) ----
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
      // ---- Keybindings UI-state reducer cases: see
      // toolbarSlices/keybindingsUiStateSlice.ts (dispatched into via
      // keybindingsUiStateReducer above) ----
      case 'Toolbar/SET_TEXT_CURSOR_POS':
        return updateField(state, 'textCursorPos', action.data);
      case 'Toolbar/SET_SELECTED_TOOL': {
        let newState = updateField(state, 'selectedTool', action.data);
        // Reset line draw session when switching away from LinesDraw
        if (state.selectedTool === Tool.LinesDraw && action.data !== Tool.LinesDraw) {
          newState = { ...newState, lineDrawActive: false, lineDrawPoints: [] };
        }
        // Clear brush when switching away from Select — Select, Textures, and FindReplace keep the brush
        if (state.brush !== null && action.data !== Tool.Brush && action.data !== Tool.Textures && action.data !== Tool.FindReplace) {
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
      case 'Toolbar/SET_PRESET_DIALOG':
        return updateField(state, 'presetDialog', action.data);
      case 'Toolbar/SET_CANVAS_GRID':
        return updateField(state, 'canvasGrid', action.data);
      case 'Toolbar/SET_ULTIMATE_STATUS':
        return {
          ...state,
          ultimateOnline: action.data.ultimateOnline,
          ultimateMachineType: action.data.ultimateMachineType,
          ultimateMode: action.data.ultimateMode,
          ultimateLastContactedAt: action.data.ultimateLastContactedAt,
        };
      case 'Toolbar/SET_GUIDE_LAYER_VISIBLE':
        return updateField(state, 'guideLayerVisible', action.data);
      case 'Toolbar/SET_GUIDE_AUTO_CONVERT':
        return updateField(state, 'guideAutoConvert', action.data);
      case 'Toolbar/SET_NEW_SCREEN_SIZE':
        return updateField(state, 'newScreenSize', action.data);
      case SET_TEXT_CAPS_LOCK:
        return updateField(state, 'textCapsLock', action.data);
      case 'Toolbar/SET_TEXT_VDC_ALT_CHARSET':
        return updateField(state, 'textVdcAltCharset', !!action.data);
      // ---- Line Draw reducer cases: see toolbarSlices/lineDrawSlice.ts
      // (dispatched into via lineDrawReducer above) ----
      // ---- Fade reducer cases: see toolbarSlices/fadeSlice.ts
      // (dispatched into via fadeReducer above) ----
      // ---- Box preset reducer cases: see toolbarSlices/boxPresetSlice.ts
      // (dispatched into via boxPresetReducer above) ----
      // ---- Texture preset / settings reducer cases: see
      // toolbarSlices/texturePresetSlice.ts (dispatched into via
      // texturePresetReducer above) ----
      // ---- CLAMP_SELECTED_PRESET_INDICES is now a thunk (needs to read
      // settings.saved.boxPresetsByGroup/texturePresetsByGroup, which a
      // reducer can't do) -- see Toolbar.actions.clampSelectedPresetIndices.
      case 'Toolbar/SET_GUIDE_LAYER_DRAG_OFFSET':
        return updateField(state, 'guideLayerDragOffset', action.data);
      // ---- Line Draw session reducer cases: see
      // toolbarSlices/lineDrawSlice.ts ----
      case 'Toolbar/SET_VDC_PAINT_FLAGS':
        return updateField(state, 'vdcPaintFlags', (action.data & 0xf0) & 0xff);
      case 'Toolbar/SET_C16_PAINT_BLINK':
        return updateField(state, 'c16PaintBlink', !!action.data);
      // ---- Find and Replace reducer cases: see
      // toolbarSlices/findReplaceSlice.ts (dispatched into via
      // findReplaceReducer above) ----

      default:
        return state;
    }
  }

  static bindDispatch(dispatch: Dispatch) {
    return bindActionCreators(Toolbar.actions, dispatch)
  }
}
