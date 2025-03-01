
import { Action } from 'redux'
import { ActionCreators } from 'redux-undo';
import { ThunkAction } from 'redux-thunk';

import * as fp from '../utils/fp'

import * as rscreens from './screens';
import * as rcustomFonts from './customFonts';
import { Framebuffer } from './editor';
import { Framebuf, RootState, WsCustomFontsV2 } from './types';
import * as Root from './root';
import * as screensSelectors from './screensSelectors';

import { Toolbar } from './toolbar';
interface WorkspaceJson {
  version: number;
  customFonts?: WsCustomFontsV2;
  screens: number[];
  framebufs: Framebuf[];
};

export function framebufFromJson(c: any): Framebuf {
  return {
    width: c.width,
    height: c.height,
    backgroundColor: c.backgroundColor,
    borderColor: c.borderColor,
    borderOn: c.borderOn  ?? false,
    framebuf: c.framebuf,
    charset: fp.maybeDefault(c.charset, 'upper'),
    name: fp.maybeDefault(c.name, undefined),
    zoom:  c.zoom === null ? {zoomLevel:3,alignment:'left'} : c.zoom,
    zoomReady: c.zoomReady,
  }
}
export function framebufFromJsonD64(c: any): Framebuf {
  return {
    width: c.width,
    height: c.height,
    backgroundColor: c.backgroundColor,
    borderColor: c.borderColor,
    borderOn: c.borderOn === false,
    framebuf: c.framebuf,
    charset: fp.maybeDefault(c.charset, 'dirart'),
    name: fp.maybeDefault(c.name, undefined),
    zoom:  c.zoom === null ? {zoomLevel:3,alignment:'center'} : c.zoom,
    zoomReady: c.zoomReady,
  }
}


export function load(workspace: WorkspaceJson): ThunkAction<void, RootState, undefined, Action> {
  return (dispatch, _getState) => {
    dispatch(Root.actions.resetState())
    console.log("workspace load")
    const { screens, framebufs } = workspace;

    if (workspace.version >= 2 && workspace.customFonts) {
      const cfonts = workspace.customFonts;
      Object.entries(cfonts).forEach(([id, cf]) => {
        dispatch(rcustomFonts.actions.addCustomFont(id, cf.name, cf.font));
      });
    }

    console.log("workspace",screens)

    screens.forEach((fbIdx, screenIdx) => {
      if (fbIdx !== screenIdx) {
        console.warn('fbidx should be screenIdx, this should be ensured by workspace save code')
      }
      dispatch(rscreens.actions.newScreen())

      dispatch(Framebuffer.actions.importFile(
        framebufFromJson(framebufs[fbIdx]),
        fbIdx
      ))

      dispatch({
        ...ActionCreators.clearHistory(),
        framebufIndex: fbIdx
      })
    })
    dispatch(rscreens.actions.setCurrentScreenIndex(0))
    dispatch(Root.actions.updateLastSavedSnapshot());
  }
}

// Typed wrapper until selectors are typed
function getCurrentScreenIndex(state: RootState): number {
  return screensSelectors.getCurrentScreenIndex(state);
}

export function importFramebufs(framebufs: Framebuf[], append: boolean): ThunkAction<void, RootState, undefined, Action> {
  if (!append) {
    throw new Error('only appending is supported');
  }
  return (dispatch, _getState) => {
    let firstNewScreenIdx = -1;
    framebufs.forEach((framebuf) => {
      dispatch(rscreens.actions.newScreen())
      dispatch((dispatch, getState) => {
        const state = getState()
        const newScreenIdx = getCurrentScreenIndex(state);
        if (firstNewScreenIdx === -1) {
          firstNewScreenIdx = newScreenIdx
        }
        const newFramebufIdx = screensSelectors.getScreens(state)[newScreenIdx]
        dispatch(Framebuffer.actions.importFile(framebuf, newFramebufIdx))
        dispatch(Toolbar.actions.setZoom(3,'left'))
      })
    })
    dispatch(rscreens.actions.setCurrentScreenIndex(firstNewScreenIdx))

  };
}
