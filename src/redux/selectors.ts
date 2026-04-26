// @ts-ignore
import memoize  from 'fast-memoize'
import {
  charScreencodeFromRowCol,
  rowColFromScreencode,
  c64DataUpper,
  c64DataLower,
  dirartData,
  charOrderUpper,
  charOrderLower,
  cbaseDataUpper,
  cbaseDataLower,
c16DataUpper,
c16DataLower,

c128DataLower,
c128DataUpper,
petDataBiz,
petDataGFX,
vic20DataLower,
vic20DataUpper,
c128DataVdc,
charOrderC128Vdc,
} from '../utils'

import { RootState, Font, Framebuf, Coord2, Transform, Brush, FramebufUIState, BoxPreset, TexturePreset } from './types'
import { mirrorBrush, findTransformedChar } from './brush'
import { CHARSET_UPPER, CHARSET_LOWER, CHARSET_DIRART, CHARSET_CBASE_LOWER, CHARSET_CBASE_UPPER, CHARSET_C128_LOWER,CHARSET_C128_UPPER,CHARSET_C128_VDC,CHARSET_C16_LOWER,CHARSET_C16_UPPER,CHARSET_PET_LOWER,CHARSET_PET_UPPER,CHARSET_VIC20_LOWER,CHARSET_VIC20_UPPER } from './editor'
import { getColorGroup } from '../utils/palette'

import { getCurrentScreenFramebufIndex } from './screensSelectors'
import { CustomFonts } from './customFonts'

export const getFramebufByIndex = (state: RootState, idx: number | null) => {
  if (idx !== null && idx < state.framebufList.length) {
    return state.framebufList[idx].present
  }
  return null;
}




export const getCurrentFramebuf = (state: RootState) => {
  return getFramebufByIndex(state, getCurrentScreenFramebufIndex(state))
}

// ROM_FONT_MAP is initialized lazily (on first call) rather than at module
// load time. This avoids a temporal dead zone ReferenceError that occurs when
// selectors.ts is first required in a circular-import chain before ../utils
// has finished its own initialization.
let _ROM_FONT_MAP: Record<string, Font> | undefined;
let _ROM_CHARSET_NAMES: Set<string> | undefined;

function initROMFontData(): void {
  if (_ROM_FONT_MAP !== undefined) return;
  _ROM_FONT_MAP = {
    [CHARSET_UPPER]:       { bits: c64DataUpper,   charOrder: charOrderUpper },
    [CHARSET_LOWER]:       { bits: c64DataLower,   charOrder: charOrderLower },
    [CHARSET_DIRART]:      { bits: dirartData,     charOrder: charOrderUpper },
    [CHARSET_CBASE_UPPER]: { bits: cbaseDataUpper, charOrder: charOrderUpper },
    [CHARSET_CBASE_LOWER]: { bits: cbaseDataLower, charOrder: charOrderLower },
    [CHARSET_C16_UPPER]:   { bits: c16DataUpper,   charOrder: charOrderUpper },
    [CHARSET_C16_LOWER]:   { bits: c16DataLower,   charOrder: charOrderLower },
    [CHARSET_C128_UPPER]:  { bits: c128DataUpper,  charOrder: charOrderUpper },
    [CHARSET_C128_LOWER]:  { bits: c128DataLower,  charOrder: charOrderLower },
    [CHARSET_C128_VDC]:    { bits: c128DataVdc,    charOrder: charOrderC128Vdc },
    [CHARSET_VIC20_UPPER]: { bits: vic20DataUpper, charOrder: charOrderUpper },
    [CHARSET_VIC20_LOWER]: { bits: vic20DataLower, charOrder: charOrderLower },
    [CHARSET_PET_UPPER]:   { bits: petDataGFX,     charOrder: charOrderUpper },
    [CHARSET_PET_LOWER]:   { bits: petDataBiz,     charOrder: charOrderLower },
  };
  _ROM_CHARSET_NAMES = new Set(Object.keys(_ROM_FONT_MAP));
}

export const getROMFontBits = (charset: string): Font => {
  initROMFontData();
  const font = _ROM_FONT_MAP![charset];
  if (!font) {
    throw new Error(`unknown charset ${charset}`);
  }
  return font;
}

// getFontBits returns a new object every time it's called.  This causes
// serious cache invalidates in rendering the canvas (since it thinks the font
// changed).  So memoize the returned object from getFontBits in case it's
// called with the same value.
const getROMFontBitsMemoized = memoize(getROMFontBits)

export const getFramebufFont = (state: RootState, framebuf: Framebuf): { charset: string, font: Font } => {
  initROMFontData();
  if (_ROM_CHARSET_NAMES!.has(framebuf.charset)) {
    return {
      charset: framebuf.charset,
      font: getROMFontBitsMemoized(framebuf.charset)
    };
  }
  return {
    charset: framebuf.charset,
    font: state.customFonts[framebuf.charset].font
  };
}

export const getCurrentFramebufFont = (state: RootState) => {
  const fb = getCurrentFramebuf(state)
  if (!fb) {
    return {
      charset: CHARSET_UPPER,
      font: getROMFontBits(CHARSET_UPPER)
    };
  }
  return getFramebufFont(state, fb);
}

export function getCustomFonts (state: RootState): CustomFonts {
  return state.customFonts;
}

const rowColFromScreencodeMemoized_ = (f: Font, sc: number) => rowColFromScreencode(f, sc)
const rowColFromScreencodeMemoized = memoize(rowColFromScreencodeMemoized_)

const computeScreencodeWithTransform = (rowcol: Coord2, font: Font, transform: Transform) => {
  const sc = charScreencodeFromRowCol(font, rowcol)
  return findTransformedChar(font, sc!, transform)
}
const computeScreencodeWithTransformMemoized = memoize(computeScreencodeWithTransform)
export const getScreencodeWithTransform = (rowcol: Coord2, font: Font, transform: Transform) => {
  return computeScreencodeWithTransformMemoized(rowcol, font, transform)
}

export const getCharRowColWithTransform = (rowcol: Coord2, font: Font, transform: Transform) => {
  const char = getScreencodeWithTransform(rowcol, font, transform)
  return rowColFromScreencodeMemoized(font, char)
}

const transformBrushMemoized = memoize(mirrorBrush)
export const transformBrush = (brush: Brush | null, transform: Transform, font: Font): Brush | null => {
  if (brush === null) return null;
  return transformBrushMemoized(brush, transform, font)
}

export const getFramebufUIState = (state: RootState, framebufIndex: number|null): FramebufUIState|undefined => {
  if (framebufIndex === null) {
    return undefined;
  }
  return state.toolbar.framebufUIState[framebufIndex];
}

/** Resolve the platform colour group for the currently active framebuf.
 *  Falls back to `c64` when there is no active framebuf. */
export function getActivePresetGroup(state: RootState): string {
  const fb = getCurrentFramebuf(state);
  if (!fb) return 'c64';
  return getColorGroup(fb.charset, fb.width);
}

/** Return the Box preset list for the currently active framebuf's group. */
export function getActiveBoxPresets(state: RootState): BoxPreset[] {
  const group = getActivePresetGroup(state);
  return state.toolbar.boxPresetsByGroup[group] ?? [];
}

/** Return the Texture preset list for the currently active framebuf's group. */
export function getActiveTexturePresets(state: RootState): TexturePreset[] {
  const group = getActivePresetGroup(state);
  return state.toolbar.texturePresetsByGroup[group] ?? [];
}

// Are there any unsaved changes in the workspace?
export function anyUnsavedChanges (state: RootState): boolean {
  if (state.lastSavedSnapshot.screenList !== state.screens.list) {
    return true;
  }
  const lastSavedFbs = state.lastSavedSnapshot.framebufs;
  for (let i = 0; i < lastSavedFbs.length; i++) {
    if (lastSavedFbs[i] !== state.framebufList[i].present) {
      return true;
    }
  }
  return false;
}

// Are there any unsaved changes in a particular framebuf?
export function anyUnsavedChangesInFramebuf (state: RootState, fbIndex: number): boolean {
  const lastSavedFbs = state.lastSavedSnapshot.framebufs;
  if (fbIndex < lastSavedFbs.length) {
    return lastSavedFbs[fbIndex] !== state.framebufList[fbIndex].present
  }
  // FB didn't exist on last save, so interpret it as changed.
  // This sort of gives false positives for newly added screens
  // that haven't been touched yet but didn't exist on last save.
  return true;
}
