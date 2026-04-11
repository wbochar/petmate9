
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
  Pixel,
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
    const currentFilename = state.toolbar.workspaceFilename;
    dialogSaveAsWorkspace(
      screens,
      getFramebufByIndex,
      customFontMap,
      (filename: string) => dispatch(Toolbar.actions.setWorkspaceFilename(filename)),
      () => dispatch(actionCreators.updateLastSavedSnapshot()),
      currentFilename
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


  openImportFile: (type: FileFormat, filename: string): RootStateThunk => {
    return (dispatch, _getState) => {
      try {
        xImportFile(filename, type, (framebufs: Framebuf[]) => {
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
      dialogImportFile(type, (framebufs: Framebuf[]) => {
        if (type.ext === "prg") {
          dispatch(Toolbar.actions.setProgressTitle('Importing CBASE file...'))
          dispatch(Toolbar.actions.setShowProgressModal(true))
          setTimeout(() => {
            dispatch(importFramebufs(framebufs, true));
            setTimeout(() => {
              dispatch(Toolbar.actions.setShowProgressModal(false))
            }, 100)
          }, 100)
        } else {
          dispatch(importFramebufs(framebufs, true));
        }
      })
    }
  },

  fileExportAs: (fmt: FileFormat): RootStateThunk => {
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
        return { ...framebuf, font }
      })
      const ultimateAddress = getSettingsUltimateAddress(state)

      const currentFrameBuf = selectors.getCurrentFramebuf(state);
      let palette = getSettingsCurrentColorPalette(state);
      if (currentFrameBuf !== null) {
        if (currentFrameBuf.charset.startsWith("pet")) {
          palette = getSettingsCurrentPetColorPalette(state)
        } else if (currentFrameBuf.charset.startsWith("vic20")) {
          palette = getSettingsCurrentVic20ColorPalette(state)
        }
      }

      const amendedFormatOptions: FileFormat = {
        ...fmt,
        commonExportParams: { selectedFramebufIndex: remappedFbIndex }
      }
      const exportedFile = dialogExportFile(amendedFormatOptions, framebufs, state.customFonts, palette, ultimateAddress);

      // If this was a player export with launchAfterExport, launch the emulator
      if (exportedFile && fmt.name === 'prgPlayer' && (fmt as any).launchAfterExport) {
        const { launchEmulator } = require('../utils/exporters/player');
        const emulatorPaths = state.settings.saved.emulatorPaths;
        const computer = (fmt as any).exportOptions?.computer;
        if (computer && emulatorPaths) {
          launchEmulator(computer, exportedFile, emulatorPaths);
        }
      }
    }
  },
  importFromUltimate: (): RootStateThunk => {
    return (dispatch, getState) => {
      const state = getState();
      const ultimateAddress = getSettingsUltimateAddress(state);
      if (!ultimateAddress) {
        alert('Ultimate address is not configured. Set it in Preferences.');
        return;
      }

      const http = window.require('http');

      // Helper: perform an HTTP request and return the raw response Buffer.
      function httpRequest(
        method: string,
        urlStr: string,
      ): Promise<Buffer> {
        return new Promise((resolve, reject) => {
          const url = new URL(urlStr);
          const opts = {
            hostname: url.hostname,
            port: url.port || 80,
            path: url.pathname + url.search,
            method,
          };
          const req = http.request(opts, (res: any) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
            res.on('end', () => resolve(Buffer.concat(chunks)));
          });
          req.on('error', (err: any) => reject(err));
          req.end();
        });
      }

      function readMem(address: number, length: number): Promise<Buffer> {
        return httpRequest(
          'GET',
          `${ultimateAddress}/v1/machine:readmem?address=${address.toString(16).toUpperCase()}&length=${length}`
        );
      }

      async function doImport() {
        try {
          // Pause the machine
          await httpRequest('PUT', `${ultimateAddress}/v1/machine:pause`);

          // Read screen RAM ($0400, 1000 bytes), color RAM ($D800, 1000 bytes),
          // border+background ($D020, 2 bytes), VIC memory setup ($D018, 1 byte)
          const [screenBuf, colorBuf, borderBgBuf, d018Buf] = await Promise.all([
            readMem(0x0400, 1000),
            readMem(0xD800, 1000),
            readMem(0xD020, 2),
            readMem(0xD018, 1),
          ]);

          // Resume the machine as soon as we have the data
          await httpRequest('PUT', `${ultimateAddress}/v1/machine:resume`);

          const borderColor = borderBgBuf[0] & 0x0F;
          const backgroundColor = borderBgBuf[1] & 0x0F;

          // Detect charset from $D018 bits 1-3
          const charMemSelector = (d018Buf[0] >> 1) & 0x07;
          // Selector 2 ($14/$15) = upper, selector 3 ($17) = lower
          const charset = charMemSelector === 3 ? 'lower' : 'upper';

          // Build 40x25 Pixel[][] from screen + color data
          const width = 40;
          const height = 25;
          const framebuf: Pixel[][] = [];
          for (let y = 0; y < height; y++) {
            const row: Pixel[] = [];
            for (let x = 0; x < width; x++) {
              const idx = y * width + x;
              row.push({
                code: screenBuf[idx],
                color: colorBuf[idx] & 0x0F,
              });
            }
            framebuf.push(row);
          }

          const fb: Framebuf = {
            framebuf,
            width,
            height,
            backgroundColor,
            borderColor,
            borderOn: true,
            charset,
            name: undefined,
            zoom: { zoomLevel: 3, alignment: 'left' },
            zoomReady: false,
          };

          dispatch(importFramebufs([fb], true));
        } catch (err: any) {
          alert(`Ultimate import failed: ${err.message}`);
        }
      }

      doImport();
    };
  },

  resetState: (): RootStateThunk => {
    return (dispatch, _getState) => {
      dispatch(actionCreators.resetStateAction());
      loadSettings((j: SettingsJson) => dispatch(settings.actions.load(j)))
    }
  },

  undo: ():  RootStateThunk => {
    return (dispatch, getState) => {
      const state = getState()
      const framebufIndex = screensSelectors.getCurrentScreenFramebufIndex(state)
      // Preserve borderOn since it's excluded from undo history
      const borderOn = framebufIndex !== null
        ? state.framebufList[framebufIndex]?.present?.borderOn
        : undefined;
      dispatch({
        ...ActionCreators.undo(),
        framebufIndex
      })
      if (borderOn !== undefined && framebufIndex !== null) {
        dispatch(Framebuffer.actions.setBorderOn(borderOn, framebufIndex))
      }
    }
  },
  redo: (): RootStateThunk => {
    return (dispatch, getState) => {
      const state = getState()
      const framebufIndex = screensSelectors.getCurrentScreenFramebufIndex(state)
      const borderOn = framebufIndex !== null
        ? state.framebufList[framebufIndex]?.present?.borderOn
        : undefined;
      dispatch({
        ...ActionCreators.redo(),
        framebufIndex
      })
      if (borderOn !== undefined && framebufIndex !== null) {
        dispatch(Framebuffer.actions.setBorderOn(borderOn, framebufIndex))
      }
    }
  }
}
