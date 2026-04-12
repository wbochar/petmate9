
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
import * as customFontsRedux from './customFonts'

import { electron, fs } from '../utils/electronImports'

// ── Shared Ultimate HTTP helpers ──

function ultimateHttpRequest(
  method: string,
  urlStr: string,
  body?: Buffer,
): Promise<Buffer> {
  const http = window.require('http');
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const opts: any = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
    };
    if (body) {
      opts.headers = {
        'Content-Type': 'application/octet-stream',
        'Content-Length': body.length,
      };
    }
    const req = http.request(opts, (res: any) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', (err: any) => reject(err));
    if (body) req.write(body);
    req.end();
  });
}

function ultimateReadMem(baseUrl: string, address: number, length: number): Promise<Buffer> {
  return ultimateHttpRequest(
    'GET',
    `${baseUrl}/v1/machine:readmem?address=${address.toString(16).toUpperCase()}&length=${length}`
  );
}

function ultimateWriteMem(baseUrl: string, address: number, data: Buffer): Promise<Buffer> {
  return ultimateHttpRequest(
    'POST',
    `${baseUrl}/v1/machine:writemem?address=${address.toString(16).toUpperCase()}`,
    data
  );
}

function ultimateWriteMemSmall(baseUrl: string, address: number, bytes: number[]): Promise<Buffer> {
  const hexData = bytes.map(b => b.toString(16).padStart(2, '0')).join('');
  return ultimateHttpRequest(
    'PUT',
    `${baseUrl}/v1/machine:writemem?address=${address.toString(16).toUpperCase()}&data=${hexData}`
  );
}

function getUltimateAddressOrAlert(state: RootState): string | null {
  const addr = getSettingsUltimateAddress(state);
  if (!addr) {
    alert('Ultimate address is not configured. Set it in Preferences.');
    return null;
  }
  return addr;
}

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

      // If this was a D64 export with mountOnUltimate, upload and mount
      if (exportedFile && fmt.name === 'd64File' && (fmt as any).exportOptions?.mountOnUltimate) {
        const d64Data = fs.readFileSync(exportedFile);
        (async () => {
          try {
            // Upload to /temp/petmate.d64 on the Ultimate
            await ultimateHttpRequest(
              'POST',
              `${ultimateAddress}/v1/files/temp/petmate.d64`,
              Buffer.from(d64Data)
            );
            // Mount on drive A
            await ultimateHttpRequest(
              'PUT',
              `${ultimateAddress}/v1/drives/A:mount?image=/temp/petmate.d64&mode=readwrite&type=d64`
            );
          } catch (err: any) {
            alert(`Ultimate D64 mount failed: ${err.message}`);
          }
        })();
      }
    }
  },
  importFromUltimate: (): RootStateThunk => {
    return (dispatch, getState) => {
      const ua = getUltimateAddressOrAlert(getState());
      if (!ua) return;

      (async () => {
        try {
          await ultimateHttpRequest('PUT', `${ua}/v1/machine:pause`);
          const [screenBuf, colorBuf, borderBgBuf, d018Buf] = await Promise.all([
            ultimateReadMem(ua, 0x0400, 1000),
            ultimateReadMem(ua, 0xD800, 1000),
            ultimateReadMem(ua, 0xD020, 2),
            ultimateReadMem(ua, 0xD018, 1),
          ]);
          await ultimateHttpRequest('PUT', `${ua}/v1/machine:resume`);

          const borderColor = borderBgBuf[0] & 0x0F;
          const backgroundColor = borderBgBuf[1] & 0x0F;
          const charMemSelector = (d018Buf[0] >> 1) & 0x07;
          const charset = charMemSelector === 3 ? 'lower' : 'upper';

          const width = 40;
          const height = 25;
          const framebuf: Pixel[][] = [];
          for (let y = 0; y < height; y++) {
            const row: Pixel[] = [];
            for (let x = 0; x < width; x++) {
              const idx = y * width + x;
              row.push({ code: screenBuf[idx], color: colorBuf[idx] & 0x0F });
            }
            framebuf.push(row);
          }

          const fb: Framebuf = {
            framebuf, width, height, backgroundColor, borderColor,
            borderOn: true, charset, name: undefined,
            zoom: { zoomLevel: 3, alignment: 'left' }, zoomReady: false,
          };
          dispatch(importFramebufs([fb], true));
        } catch (err: any) {
          alert(`Ultimate import failed: ${err.message}`);
        }
      })();
    };
  },

  pushToUltimate: (): RootStateThunk => {
    return (_dispatch, getState) => {
      const state = getState();
      const ua = getUltimateAddressOrAlert(state);
      if (!ua) return;

      const currentFb = selectors.getCurrentFramebuf(state);
      if (!currentFb) return;
      const { width, height, framebuf, backgroundColor, borderColor, charset } = currentFb;

      if (width !== 40 || height !== 25) {
        alert('Push to Ultimate only supports 40x25 screens.');
        return;
      }
      if (charset !== 'upper' && charset !== 'lower') {
        alert('Push to Ultimate only supports standard C64 charsets.');
        return;
      }

      // Build screen RAM and color RAM buffers
      const screenBuf = Buffer.alloc(1000);
      const colorBuf = Buffer.alloc(1000);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          screenBuf[idx] = framebuf[y][x].code;
          colorBuf[idx] = framebuf[y][x].color;
        }
      }

      const d018Val = charset === 'lower' ? 0x17 : 0x15;

      (async () => {
        try {
          await ultimateHttpRequest('PUT', `${ua}/v1/machine:pause`);
          await Promise.all([
            ultimateWriteMem(ua, 0x0400, screenBuf),
            ultimateWriteMem(ua, 0xD800, colorBuf),
            ultimateWriteMemSmall(ua, 0xD020, [borderColor, backgroundColor]),
            ultimateWriteMemSmall(ua, 0xD018, [d018Val]),
          ]);
          await ultimateHttpRequest('PUT', `${ua}/v1/machine:resume`);
        } catch (err: any) {
          alert(`Ultimate push failed: ${err.message}`);
        }
      })();
    };
  },

  importCharsetFromUltimate: (): RootStateThunk => {
    return (dispatch, getState) => {
      const ua = getUltimateAddressOrAlert(getState());
      if (!ua) return;

      (async () => {
        try {
          await ultimateHttpRequest('PUT', `${ua}/v1/machine:pause`);
          const [d018Buf, dd00Buf] = await Promise.all([
            ultimateReadMem(ua, 0xD018, 1),
            ultimateReadMem(ua, 0xDD00, 1),
          ]);

          // VIC bank from CIA2 $DD00 bits 0-1
          const vicBank = (3 - (dd00Buf[0] & 0x03)) * 0x4000;
          // Character memory offset from $D018 bits 1-3
          const charOffset = ((d018Buf[0] >> 1) & 0x07) * 0x0800;
          const charAddr = vicBank + charOffset;

          const charData = await ultimateReadMem(ua, charAddr, 2048);
          await ultimateHttpRequest('PUT', `${ua}/v1/machine:resume`);

          // Build Font object
          const bits = Array(256 * 8).fill(0);
          for (let i = 0; i < charData.length && i < bits.length; i++) {
            bits[i] = charData[i];
          }
          const charOrder: number[] = [];
          for (let i = 0; i < 256; i++) charOrder.push(i);

          const fontId = `ult_${Date.now()}`;
          dispatch(customFontsRedux.actions.addCustomFont(fontId, `Ultimate $${charAddr.toString(16).toUpperCase()}`, { bits, charOrder }));
          alert(`Imported charset from $${charAddr.toString(16).toUpperCase()} as custom font.`);
        } catch (err: any) {
          alert(`Ultimate charset import failed: ${err.message}`);
        }
      })();
    };
  },

  playSidOnUltimate: (): RootStateThunk => {
    return (_dispatch, getState) => {
      const ua = getUltimateAddressOrAlert(getState());
      if (!ua) return;

      const { dialog } = electron.remote;
      const window = electron.remote.getCurrentWindow();
      const result = dialog.showOpenDialogSync(window, {
        properties: ['openFile'],
        filters: [{ name: 'SID files', extensions: ['sid'] }],
      });
      if (!result || result.length === 0) return;

      const sidData = fs.readFileSync(result[0]);

      (async () => {
        try {
          await ultimateHttpRequest('POST', `${ua}/v1/runners:sidplay`, Buffer.from(sidData));
        } catch (err: any) {
          alert(`Ultimate SID playback failed: ${err.message}`);
        }
      })();
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
