
import { Action, Dispatch } from 'redux'
import { ThunkAction } from 'redux-thunk';

import * as selectors from './selectors'
import {
  getScreens,
  getCurrentScreenIndex,
  getCurrentScreenFramebufIndex
} from './screensSelectors'

import {
  Framebuffer,
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_BORDER_COLOR,
  CHARSET_DIRART,
  CHARSET_C128_UPPER,
  CHARSET_C128_VDC,
  CHARSET_C16_UPPER,
  CHARSET_PET_UPPER,
  CHARSET_VIC20_UPPER,
  CHARSET_UPPER,

} from './editor'

import { Toolbar } from './toolbar';
import * as customFontsRedux from './customFonts';

import {
  RootState,
  Screens,
  DEFAULT_FB_WIDTH,
  Framebuf,
} from './types'
import { ActionsUnion, createAction, DispatchPropsFromActions } from './typeUtils'

import { makeScreenName, makeDirArtName } from './utils'
import { arrayMove } from '../external/react-sortable-hoc'
import * as fp from '../utils/fp'
import { promptProceedWithUnsavedChangesInFramebuf } from '../utils';
import { getColorGroup } from '../utils/palette';
import { electron } from '../utils/electronImports';
import { parseClipboardFramebufferPayload } from '../utils/clipboardFramebuffer';

/** Switch the global foreground-colour group (and PET's force-foreground
 *  flags) to match a newly created screen's charset/width, and clamp the
 *  selected Box/Texture preset indices for that group. Mirrors the logic
 *  in Editor.tsx's componentDidUpdate, but is dispatched directly here so
 *  the correct default colour (see DEFAULT_COLORS_BY_GROUP) is selected
 *  deterministically as part of screen creation itself -- previously this
 *  only ever happened as an indirect side effect of the Editor component
 *  noticing the new framebuf's charset after the fact, which left the
 *  color picker showing the previous group's (possibly out-of-range)
 *  color selected instead of the new platform's default. */
function switchColorGroupForNewScreen(
  dispatch: Dispatch,
  prevGroup: string,
  charset: string,
  width: number
) {
  const newGroup = getColorGroup(charset, width);
  if (prevGroup === newGroup) {
    return;
  }
  dispatch(Toolbar.actions.switchForegroundGroup(prevGroup, newGroup));
  dispatch(Toolbar.actions.clampSelectedPresetIndices(newGroup));
  if (newGroup === 'pet') {
    dispatch(Toolbar.actions.setBoxForceForeground(true));
    dispatch(Toolbar.actions.setTextureForceForeground(true));
  }
}

export const ADD_SCREEN_AND_FRAMEBUF = 'ADD_SCREEN_AND_FRAMEBUF'
// Atomically removes a screen tab AND its backing framebuffer (handled at
// the top-level reducer in src/reducers/index.ts, mirroring
// ADD_SCREEN_AND_FRAMEBUF), remapping every other index-based reference
// (screens.list entries, toolbar.framebufUIState keys) that pointed past
// the removed framebuf's slot. Without this, REMOVE_FRAMEBUF was never
// dispatched at all and every deleted screen's framebuffer (and undo
// history) leaked for the rest of the session.
export const REMOVE_SCREEN_AND_FRAMEBUF = 'REMOVE_SCREEN_AND_FRAMEBUF'

const ADD_SCREEN = 'ADD_SCREEN'
const REMOVE_SCREEN = 'REMOVE_SCREEN'
const SET_CURRENT_SCREEN_INDEX = 'SET_CURRENT_SCREEN_INDEX'
const SET_SCREEN_ORDER = 'SET_SCREEN_ORDER'
const NEXT_SCREEN = 'NEXT_SCREEN'
const ADD_DIRART = 'ADD_DIRART'
const MOVE_SCREEN = 'MOVE_SCREEN'

interface AddScreenArgs {
  framebufId: number;
  insertAfterIndex: number;
};

const actionCreators = {
  addScreen: (framebufId: number, insertAfterIndex: number) => createAction(ADD_SCREEN, { framebufId, insertAfterIndex } as AddScreenArgs),
  addScreenAndFramebuf: (insertAfterIndex?: number) => createAction(ADD_SCREEN_AND_FRAMEBUF, insertAfterIndex),
  /** Low-level primitive: removes only the screen-list entry at `index`,
   *  with no framebuffer cleanup or `current` adjustment. Kept for unit
   *  testing the screens-slice reducer in isolation -- the real removal
   *  flow (see `removeScreen` thunk below) dispatches the top-level
   *  `removeScreenAndFramebuf` action instead so the framebuffer and any
   *  index-dependent state are kept in sync. */
  removeScreenAction: (index: number) => createAction(REMOVE_SCREEN, index),
  removeScreenAndFramebuf: (screenIndex: number) => createAction(REMOVE_SCREEN_AND_FRAMEBUF, screenIndex),
  moveScreen: (dir: number) => createAction(MOVE_SCREEN, dir),
  setCurrentScreenIndex: (index: number) => createAction(SET_CURRENT_SCREEN_INDEX, index),
  setScreenOrder: (screens: number[]) => createAction(SET_SCREEN_ORDER, screens),
  nextScreen: (dir: number) => createAction(NEXT_SCREEN, dir),
  addDirArt: (framebufId: number, insertAfterIndex: number) => createAction(ADD_DIRART, { framebufId, insertAfterIndex } as AddScreenArgs)
};

function removeScreen(index: number): ThunkAction<void, RootState, undefined, Action>  {
  return (dispatch, getState) => {
    const state = getState()
    const numScreens = getScreens(state).length
    if (numScreens <= 1) {
      // Don't allow deletion of the last framebuffer
      return;
    }
    // Resolve "current screen" BEFORE prompting -- previously this happened
    // after the prompt, so a -1 ("remove current") call looked up
    // state.screens.list[-1] (undefined) for the unsaved-changes check,
    // which always reported "changed" and forced a confirmation dialog
    // even when the current screen had no unsaved changes.
    if (index === -1) {
      index = getCurrentScreenIndex(state)
    }
    if (promptProceedWithUnsavedChangesInFramebuf(state, state.screens.list[index], {
      title: 'Remove',
      detail: 'Removing the screen cannot be undone.'
    })) {
      // Single atomic action: removes the screen tab, its framebuffer, and
      // remaps every other affected index. `current` is only adjusted when
      // removing the active tab (or a tab before it) -- removing some
      // other tab no longer forcibly switches the user away from what
      // they're currently editing.
      dispatch(actions.removeScreenAndFramebuf(index));
    }
  }
}


function moveScreen(dir: number): ThunkAction<void, RootState, undefined, Action>  {
  return (dispatch, getState) => {


    const state = getState()
    const lastIdx = getScreens(state).length-1

    const idx = getCurrentScreenIndex(state)
    var screens = getScreens(state);
    const destIdx =  idx + dir

    if(destIdx>=0 && destIdx<=lastIdx)
     dispatch(actions.setScreenOrder( arrayMove(screens, idx, destIdx)))




  }
}

export function addScreenPlusFramebuf(sourceFramebufIndex: number, fb: Framebuf): ThunkAction<void, RootState, undefined, Action>  {

  return (dispatch, getState) => {
    const state = getState()
    // Always insert the pasted screen right after whichever screen is
    // currently active (consistent whether paste was triggered via
    // keyboard shortcut or a specific tab's context menu). `sourceFramebufIndex`
    // is a *framebuf* id (identifying where the pasted UI state -- zoom/pan --
    // should be copied from), not a screen-list index: it must not be reused
    // as the insertion index below. Previously this function discarded the
    // caller-supplied value entirely and then mistakenly reused the
    // current *screen* index as if it were a framebuf id when looking up
    // the UI state to copy, which only happened to look right before any
    // screen reorder/delete.
    const insertAfterIndex = getCurrentScreenIndex(state)
    dispatch(actionCreators.addScreenAndFramebuf(insertAfterIndex));
    dispatch((dispatch, getState) => {
      const state = getState()
      const newScreenIdx = getCurrentScreenIndex(state)
      const newFramebufIdx = getScreens(state)[newScreenIdx]


      dispatch(Framebuffer.actions.copyFramebuf({
        ...fb,
      }, newFramebufIdx));
      dispatch(Toolbar.actions.setFramebufUIState(newFramebufIdx, selectors.getFramebufUIState(state, sourceFramebufIndex)));
    })
  }
}


/**
 * Shared implementation for both paste entry points (Ctrl+V via
 * `toolbar.ts`'s `pasteFrame`, and the tab context menu's Paste via
 * `FramebufferTabs.tsx`'s `handlePasteTab`).
 *
 * Centralizing this here -- rather than each call site independently
 * JSON.parse-ing and dispatching -- fixes two issues that previously only
 * affected whichever call site happened to be touched: the pasted data's
 * shape was never validated beyond "JSON.parse didn't throw" (a malformed
 * `framebufs` payload could corrupt the new screen or crash downstream
 * rendering), and any custom font embedded alongside the copy (see
 * `charsets` in `utils/exporters/json.ts`'s `getJSON`) was silently
 * discarded instead of being restored -- so pasting a framebuf that uses a
 * custom font (e.g. copied from a different session/window where that
 * font's id no longer resolves) fell back to the default ROM font.
 */
function pasteFramebufferFromClipboard(sourceFramebufIndex: number): ThunkAction<void, RootState, undefined, Action> {
  return (dispatch, getState) => {
    if (!electron.clipboard.has('petmate/framebuffer')) {
      return;
    }
    const raw = Buffer.from(
      electron.clipboard.readBuffer('petmate/framebuffer')
    ).toString();
    const result = parseClipboardFramebufferPayload(raw);
    if (!result.ok) {
      console.error(result.reason);
      alert(`Failed to paste: ${result.reason}`);
      return;
    }
    const { framebuf, charsets } = result.data;
    const existingFonts = getState().customFonts;
    Object.entries(charsets).forEach(([id, cf]) => {
      // Don't clobber a font already registered under this id (e.g. pasting
      // back into the same document the copy came from).
      if (existingFonts[id] || !cf || !Array.isArray(cf.bits)) {
        return;
      }
      // Older copies (made before charOrder was embedded -- see
      // buildCustomFontData in utils/exporters/json.ts) won't have a
      // charOrder; fall back to the identity ordering rather than dropping
      // the font entirely.
      const charOrder = Array.isArray(cf.charOrder)
        ? cf.charOrder
        : Array.from({ length: 256 }, (_, i) => i);
      dispatch(customFontsRedux.actions.addCustomFont(id, cf.name ?? id, { bits: cf.bits, charOrder }));
    });
    dispatch(addScreenPlusFramebuf(sourceFramebufIndex, framebuf));
  };
}

function cloneScreen(index: number): ThunkAction<void, RootState, undefined, Action>  {
  return (dispatch, getState) => {
    const state = getState()
    if(index===-1)
    {
      index = getCurrentScreenIndex(state)
    }
    const fbidx = getScreens(state)[index]
    const framebuf = selectors.getFramebufByIndex(state, fbidx);
    if (framebuf === null) {
      return;
    }
    dispatch(actionCreators.addScreenAndFramebuf(index));
    dispatch((dispatch, getState) => {
      const state = getState()
      const newScreenIdx = getCurrentScreenIndex(state)
      const newFramebufIdx = getScreens(state)[newScreenIdx]
      dispatch(Framebuffer.actions.copyFramebuf({
        ...framebuf,
        name: makeScreenName(newFramebufIdx)
      }, newFramebufIdx));
      dispatch(Toolbar.actions.setFramebufUIState(newFramebufIdx, selectors.getFramebufUIState(state, fbidx)));
    })
  }
}

function newScreen(): ThunkAction<void, RootState, undefined, Action> {
  return (dispatch, getState) => {
    const state = getState()
    const defaultZoomLevel = Math.max(1, Math.min(8, state.settings.saved.defaultZoomLevel ?? 2));
    const defaultBorderOn = state.settings.saved.defaultBorderOn ?? true;
    let colors = {
      backgroundColor: DEFAULT_BACKGROUND_COLOR,
      borderColor: DEFAULT_BORDER_COLOR
    }
    const framebuf = selectors.getCurrentFramebuf(state);
    if (framebuf !== null) {
      colors = {
        backgroundColor: DEFAULT_BACKGROUND_COLOR,
        borderColor: DEFAULT_BORDER_COLOR
      }
    }
    const zoom = {zoomLevel:0,alignment:'left'}

    switchColorGroupForNewScreen(dispatch, state.toolbar.activeColorGroup, CHARSET_UPPER, DEFAULT_FB_WIDTH);
    dispatch(actions.addScreenAndFramebuf());
    dispatch(Toolbar.actions.setZoom(100 + defaultZoomLevel, 'left'))
    dispatch((dispatch, getState) => {
      const state = getState()
      const newFramebufIdx = getCurrentScreenFramebufIndex(state)
      if (newFramebufIdx === null) {
        return;
      }
      dispatch(Framebuffer.actions.setFields({
        ...colors,
        // `zoom` must be assigned to the Framebuf's nested `zoom` field
        // (see Framebuf.zoom: {zoomLevel, alignment} in redux/types.ts),
        // not spread -- spreading it here wrote stray top-level
        // `zoomLevel`/`alignment` properties onto the Framebuf object
        // instead (properties the type doesn't even declare), leaving the
        // *actual* `zoom` field untouched. This happened to be masked by
        // the Toolbar.actions.setZoom() dispatches immediately before and
        // after this call separately setting the real field correctly, but
        // relying on that is fragile and the stray properties serve no
        // purpose. Compare newDirArt/newScreenX below, which already do
        // this correctly.
        zoom,
        borderOn: defaultBorderOn,
        name: 'c64_'+makeScreenName(newFramebufIdx)
      }, newFramebufIdx))
      dispatch(Toolbar.actions.setZoom(100 + defaultZoomLevel, 'left'))
    })
  }
}

function newDirArt(): ThunkAction<void, RootState, undefined, Action> {
  return (dispatch, getState) => {
    const state = getState()
    let colors = {
      backgroundColor: DEFAULT_BACKGROUND_COLOR,
      borderColor: DEFAULT_BORDER_COLOR
    }
    const framebuf = selectors.getCurrentFramebuf(state);
    if (framebuf !== null) {
      colors = {
        backgroundColor: framebuf.backgroundColor,
        borderColor: framebuf.borderColor
      }
    }
    switchColorGroupForNewScreen(dispatch, state.toolbar.activeColorGroup, CHARSET_DIRART, 16);
    dispatch(actions.addScreenAndFramebuf());
    dispatch((dispatch, getState) => {
      const state = getState()
      const newFramebufIdx = getCurrentScreenFramebufIndex(state)
      if (newFramebufIdx === null) {
        return;
      }
      dispatch(Framebuffer.actions.setFields({
        ...colors,
        zoom: {zoomLevel:8,alignment:'left'},
        name: makeDirArtName(newFramebufIdx)
      }, newFramebufIdx))

      dispatch(Framebuffer.actions.setCharset(CHARSET_DIRART
      , newFramebufIdx))

      dispatch(Framebuffer.actions.setBorderOn(false,newFramebufIdx))



      dispatch(Framebuffer.actions.setDims({
        width:16,height:32,

      }, newFramebufIdx))

      dispatch(Toolbar.actions.setZoom(102, 'left'))

    })
  }
}


function newScreenX(screenType:string,dimensions:string, border:boolean): ThunkAction<void, RootState, undefined, Action> {
  return (dispatch, getState) => {
    const state = getState()
    const defaultZoomLevel = Math.max(1, Math.min(8, state.settings.saved.defaultZoomLevel ?? 2));
    const defaultBorderOn = state.settings.saved.defaultBorderOn ?? border;
    let colors = {
      backgroundColor: DEFAULT_BACKGROUND_COLOR,
      borderColor: DEFAULT_BORDER_COLOR
    }
    let CHARSET = CHARSET_UPPER;
    switch (screenType) {
      case 'pet':
        colors = {
          backgroundColor: 0,
          borderColor: 0
        };
        CHARSET = CHARSET_PET_UPPER;
        break;
      case 'c16':
        // TED color bytes: (lum << 4) | hue
        colors.backgroundColor = 0x71;  // white at lum 7
        colors.borderColor = 0x6B;      // pink at lum 6
        CHARSET = CHARSET_C16_UPPER;
        break;
      case 'vic20':
        colors = {
          backgroundColor: 1,
          borderColor: 3

        };
        CHARSET = CHARSET_VIC20_UPPER;
        break;
      case 'c128':
          colors.backgroundColor = 11;
          colors.borderColor = 13;
          CHARSET = CHARSET_C128_UPPER;
          break;
      case 'c128vdc':
          // VDC RGBI palette: 0=black, 14=light gray, 15=white.
          // The c128vdc charset carries both ROM halves at once and
          // exposes the alt-set / blink / underline / reverse
          // attribute bits per cell — see src/utils/vdcAttr.ts.
          colors.backgroundColor = 0;
          colors.borderColor = 0;   // Locked to black (VDC has no VIC-style border)
          CHARSET = CHARSET_C128_VDC;
          break;

          case 'dirart':
            CHARSET = CHARSET_DIRART;
            break;

      }


    const width=Number(dimensions.split('x')[0]);
    const height=Number(dimensions.split('x')[1]);
    const columnMode: 40 | 80 = (
      screenType === 'c128vdc' ||
      (screenType === 'pet' && width === 80 && height === 25)
    ) ? 80 : 40;
    const borderOnForScreen = (screenType === 'c128vdc' || screenType === 'dirart') ? false : defaultBorderOn;

    switchColorGroupForNewScreen(dispatch, state.toolbar.activeColorGroup, CHARSET, width);
    dispatch(actions.addScreenAndFramebuf());
    dispatch((dispatch, getState) => {
      const state = getState()
      const newFramebufIdx = getCurrentScreenFramebufIndex(state)
      if (newFramebufIdx === null) {
        return;
      }
      dispatch(Framebuffer.actions.setFields({

        charset: CHARSET,
        columnMode,
        backgroundColor:colors.backgroundColor,
        borderColor:colors.borderColor,
        borderOn:borderOnForScreen,
        zoom: {zoomLevel:10,alignment:'left'},
        name: screenType+"_"+ makeScreenName(newFramebufIdx)
      }, newFramebufIdx))

      dispatch(Framebuffer.actions.setDims({width,height}, newFramebufIdx))
      dispatch(Toolbar.actions.setZoom(100 + defaultZoomLevel, 'left'))
      if (screenType === 'vic20' && width === 22 && height === 23) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const container = document.getElementById('MainContainer');
            if (!container) return;
            container.scrollLeft = Math.max(0, (container.scrollWidth - container.clientWidth) / 2);
          });
        });
      }
    })
  }
}


export const actions = {
  ...actionCreators,
  removeScreen,
  moveScreen,
  cloneScreen,
  newScreen,
  newDirArt,
  newScreenX,
  addScreenPlusFramebuf,
  pasteFramebufferFromClipboard,

}



export type Actions = ActionsUnion<typeof actionCreators>;
export type PropsFromDispatch = DispatchPropsFromActions<typeof actions>;

export function reducer(state: Screens = {current: 0, list: []}, action: Actions): Screens {
  switch (action.type) {
    case ADD_SCREEN:
      const insertAfter = action.data.insertAfterIndex
      return {
        ...state,
        list: fp.arrayInsertAt(state.list, insertAfter + 1, action.data.framebufId)
      }
    case REMOVE_SCREEN:
      return {
        ...state,
        list: fp.arrayRemoveAt(state.list, action.data)
      }
    case SET_CURRENT_SCREEN_INDEX:
      return {
        ...state,
        current: action.data
      }
    case SET_SCREEN_ORDER: {
      const newScreenIdx = action.data
      const newCurrentScreen = newScreenIdx.indexOf(state.list[state.current])
      return {
        ...state,
        list: newScreenIdx,
        current: newCurrentScreen
      }
    }
    case NEXT_SCREEN:
      return {
        ...state,
        current: Math.min(state.list.length - 1, Math.max(0, state.current + action.data))
      }

    case ADD_DIRART:
      const insertdAfter = action.data.insertAfterIndex
      return {
        ...state,
        list: fp.arrayInsertAt(state.list, insertdAfter+1, action.data.framebufId)
      }
  default:
    return state
  }
}
