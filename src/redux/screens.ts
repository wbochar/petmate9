
import { Action } from 'redux'
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
} from './editor'

import { Toolbar } from './toolbar';

import {
  RootState,
  Screens
} from './types'
import { ActionsUnion, createAction, DispatchPropsFromActions } from './typeUtils'

import { makeScreenName, makeDirArtName } from './utils'
import { arrayMove } from '../external/react-sortable-hoc'
import * as fp from '../utils/fp'
import { promptProceedWithUnsavedChangesInFramebuf } from '../utils';

export const ADD_SCREEN_AND_FRAMEBUF = 'ADD_SCREEN_AND_FRAMEBUF'

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
  removeScreenAction: (index: number) => createAction(REMOVE_SCREEN, index),
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
    if (promptProceedWithUnsavedChangesInFramebuf(state, state.screens.list[index], {
      title: 'Remove',
      detail: 'Removing the screen cannot be undone.'
    })) {
      if(index==-1)
        index = getCurrentScreenIndex(state)
      dispatch(actions.setCurrentScreenIndex(index === numScreens - 1 ? numScreens - 2 : index))
      dispatch(actions.removeScreenAction(index));
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





function cloneScreen(index: number): ThunkAction<void, RootState, undefined, Action>  {
  return (dispatch, getState) => {
    const state = getState()
    if(index==-1)
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
    dispatch(actions.addScreenAndFramebuf());
    dispatch((dispatch, getState) => {
      const state = getState()
      const newFramebufIdx = getCurrentScreenFramebufIndex(state)
      if (newFramebufIdx === null) {
        return;
      }
      dispatch(Framebuffer.actions.setFields({
        ...colors,
        name: makeScreenName(newFramebufIdx)
      }, newFramebufIdx))
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
    dispatch(actions.addScreenAndFramebuf());
    dispatch((dispatch, getState) => {
      const state = getState()
      const newFramebufIdx = getCurrentScreenFramebufIndex(state)
      if (newFramebufIdx === null) {
        return;
      }
      dispatch(Framebuffer.actions.setFields({
        ...colors,
        name: makeDirArtName(newFramebufIdx)
      }, newFramebufIdx))

      dispatch(Framebuffer.actions.setCharset(CHARSET_DIRART
      , newFramebufIdx))

      dispatch(Framebuffer.actions.setBorderOn(false,newFramebufIdx))


      dispatch(Framebuffer.actions.setDims({
        width:16,height:32,

      }, newFramebufIdx))
    })
  }
}

export const actions = {
  ...actionCreators,
  removeScreen,
  moveScreen,
  cloneScreen,
  newScreen,
  newDirArt

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
