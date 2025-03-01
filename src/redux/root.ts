
import { Action } from 'redux'
import { ThunkAction } from 'redux-thunk';
import { ActionCreators } from 'redux-undo';

import * as selectors from './selectors'
import {
  getSettingsCurrentColorPalette,
  getSettingsCurrentPetColorPalette,
  getSettingsCurrentVic20ColorPalette,
  getSettingsUltimateAddress
} from '../redux/settingsSelectors'

import {
  Framebuf,
  RootState,
  FileFormat,
  SettingsJson,
  RootStateThunk
} from './types'
import { ActionsUnion, createAction } from './typeUtils'
import { Framebuffer } from './editor'
import * as settings from './settings'
import * as workspace from './workspace'
import * as screensSelectors from '../redux/screensSelectors'
import { Toolbar } from './toolbar'
import {
  dialogLoadWorkspace,
  dialogSaveAsWorkspace,
  dialogExportFile,
  dialogImportFile,
  saveWorkspace,
  xImportFile,
  loadSettings,
  promptProceedWithUnsavedChanges,
  setWorkspaceFilenameWithTitle
} from '../utils'

import { importFramebufs } from './workspace'

import { fs } from '../utils/electronImports'

export const RESET_STATE = 'RESET_STATE'
export const LOAD_WORKSPACE = 'LOAD_WORKSPACE'
export const UPDATE_LAST_SAVED_SNAPSHOT = 'UPDATE_LAST_SAVED_SNAPSHOT'

function saveAsWorkspace(): ThunkAction<void, RootState, undefined, Action> {
  return (dispatch, getState) => {
    const state = getState();
    const screens = screensSelectors.getScreens(state);
    const getFramebufByIndex = (idx: number) => selectors.getFramebufByIndex(state, idx)!;
    const customFontMap = selectors.getCustomFonts(state);
    dialogSaveAsWorkspace(
      screens,
      getFramebufByIndex,
      customFontMap,
      (filename: string) => dispatch(Toolbar.actions.setWorkspaceFilename(filename)),
      () => dispatch(actionCreators.updateLastSavedSnapshot())
    );
  }
}

export const actionCreators = {
  loadWorkspace: (data: any) => createAction(LOAD_WORKSPACE, data),
  // Snapshot current framebuf and screens state for "ask for unsaved changed"
  // dialog when loading or resetting Petmate workspace.
  updateLastSavedSnapshot: () => createAction(UPDATE_LAST_SAVED_SNAPSHOT),
  resetStateAction: () => createAction(RESET_STATE)
};

export type Actions = ActionsUnion<typeof actionCreators>

export const actions = {
  ...actionCreators,

  // Load workspace but with specific file name and no dialogs
  openWorkspace: (filename: string): RootStateThunk => {
    return (dispatch, getState) => {
      if (promptProceedWithUnsavedChanges(getState(), {
        title: 'Continue',
        detail: 'Proceed with loading a Petmate workspace?  This cannot be undone.'
      })) {
        try {
          const content = fs.readFileSync(filename, 'utf-8')
          const c = JSON.parse(content);
          dispatch(workspace.load(c));
          //console.log("path", app.addRecentDocument(filename));




          setWorkspaceFilenameWithTitle(
            () => dispatch(Toolbar.actions.setWorkspaceFilename(filename)),
            filename
          );

        } catch(e) {
          console.error(e)
          alert(`Failed to load workspace '${filename}'!`)
        }
      }
    }
  },


  openImportFile: (type: FileFormat,filename: string): RootStateThunk => {
    return (dispatch, getState) => {

        try {
         // const content = fs.readFileSync(filename, 'utf-8')
        //  const c = JSON.parse(content);
          //dispatch(workspace.load(c));

         //const state = getState()
         //const framebufIndex = screensSelectors.getCurrentScreenFramebufIndex(state)
          xImportFile(filename,type, (framebufs: Framebuf[]) => {
            dispatch(importFramebufs(framebufs, true));
          })

        } catch(e) {
          console.error(e)
          alert(`Failed import '${filename}'!`)
        }

    }
  },
  // Same as openWorkspace but pop a dialog asking for the filename
  fileOpenWorkspace: (): RootStateThunk => {
    return (dispatch, _getState) => {
      dialogLoadWorkspace(dispatch);
    }
  },

  fileSaveAsWorkspace: saveAsWorkspace,

  fileSaveWorkspace: (): RootStateThunk => {
    return (dispatch, getState) => {
      const state = getState();
      const screens = screensSelectors.getScreens(state);
      const getFramebufByIndex = (idx: number) => selectors.getFramebufByIndex(state, idx)!;
      const customFonts = selectors.getCustomFonts(state);
      const filename = state.toolbar.workspaceFilename;


      if (filename === null) {
        return dispatch(saveAsWorkspace());
      }
      saveWorkspace(
        filename,
        screens,
        getFramebufByIndex,
        customFonts,
        () => dispatch(actionCreators.updateLastSavedSnapshot())
      );
    }
  },

  fileImport: (type: FileFormat): RootStateThunk => {
    return (dispatch, getState) => {
      const state = getState()
      const framebufIndex = screensSelectors.getCurrentScreenFramebufIndex(state)
      if (framebufIndex === null) {
        return;
      }
      dialogImportFile(type, (framebufs: Framebuf[]) => {
        dispatch(Framebuffer.actions.importFile(framebufs[0], framebufIndex))
      })
    }
  },

  importFramebufsAppend: (framebufs: Framebuf[]): RootStateThunk => {
    return (dispatch, _getState) => {
      dispatch(importFramebufs(framebufs, true));
    };
  },

  fileImportAppend: (type: FileFormat): RootStateThunk => {
    return (dispatch, _getState) => {

      console.log("Importing:"+type.name,type.ext);
      dialogImportFile(type, (framebufs: Framebuf[]) => {

        console.log("Importing:"+type.name,type.ext);

        if(type.ext==="prg")
        {
        dispatch(Toolbar.actions.setProgressTitle('Importing CBASE file...'))
        dispatch(Toolbar.actions.setShowProgressModal(true))


        setTimeout(function(){
        dispatch(importFramebufs(framebufs, true));
        setTimeout(function(){
          dispatch(Toolbar.actions.setShowProgressModal(false))

        },100)
      },100)
    }
    else
    {
      console.log("Not a PRG..");


      dispatch(importFramebufs(framebufs, true));


    }


      })
    }
  },

  fileExportAs: (fmt: FileFormat): RootStateThunk => {

    console.log("fileExportAs");
    return (_dispatch, getState) => {
      const state = getState()
      const screens = screensSelectors.getScreens(state)
      let remappedFbIndex = 0
      const selectedFramebufIndex = screensSelectors.getCurrentScreenFramebufIndex(state)
      const framebufs = screens.map((fbIdx, i) => {
        const framebuf = selectors.getFramebufByIndex(state, fbIdx)
        if (!framebuf) {
          throw new Error('invalid framebuf');
        }
        if (selectedFramebufIndex === fbIdx) {
          remappedFbIndex = i
        }
        const { font } = selectors.getFramebufFont(state, framebuf);
        return {
          ...framebuf,
          font
        }
      })
      const ultimateAddress = getSettingsUltimateAddress(state)
      console.log("ultimateAddress",ultimateAddress)


      var palette = getSettingsCurrentColorPalette(state)

      const currentFrameBuf = selectors.getCurrentFramebuf(state);

      if(currentFrameBuf!==null)
      {
        if(currentFrameBuf.charset.startsWith("pet"))
        {
          palette = getSettingsCurrentPetColorPalette(state)
        }else if(currentFrameBuf.charset.startsWith("vic20"))
        {
          palette = getSettingsCurrentVic20ColorPalette(state)

        }


      }







      const amendedFormatOptions: FileFormat = {
        ...fmt,
        commonExportParams: {
          selectedFramebufIndex: remappedFbIndex
        }
      }
      console.log("fileExportAs:dialogExportFile");
      dialogExportFile(amendedFormatOptions, framebufs, state.customFonts, palette, ultimateAddress);
    }
  },

  resetState: (): RootStateThunk => {
    return (dispatch, _getState) => {
      dispatch(actionCreators.resetStateAction());
      loadSettings((j: SettingsJson) => dispatch(settings.actions.load(j)))
    }
  },

  undo: ():  RootStateThunk => {
    return (dispatch, getState) => {
      const framebufIndex = screensSelectors.getCurrentScreenFramebufIndex(getState())
      dispatch({
        ...ActionCreators.undo(),
        framebufIndex
      })
    }
  },
  redo: (): RootStateThunk => {
    return (dispatch, getState) => {
      const framebufIndex = screensSelectors.getCurrentScreenFramebufIndex(getState())
      dispatch({
        ...ActionCreators.redo(),
        framebufIndex
      })
    }
  }
}
