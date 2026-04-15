import React from 'react';
import { createRoot } from 'react-dom/client';
import Root from './containers/Root';
import './app.global.css';

import { formats, loadSettings, promptProceedWithUnsavedChanges } from './utils';
import * as Screens from './redux/screens';
import * as settings from './redux/settings';
import { Toolbar } from './redux/toolbar';
import * as ReduxRoot from './redux/root';

import configureStore from './store/configureStore';

// TODO prod builds
import { electron, fs } from './utils/electronImports';
import { FileFormat, RootState, ThemeMode, Tool } from './redux/types';


const store = configureStore();

// Set platform attribute for platform-specific CSS
document.documentElement.setAttribute('data-platform', electron.remote.process.platform);

const filename = electron.ipcRenderer.sendSync('get-open-args');
if (filename) {
  // Load a .petmate file that the user clicked on Explorer (Windows only path).
  store.dispatch(ReduxRoot.actions.updateLastSavedSnapshot());
  store.dispatch(ReduxRoot.actions.openWorkspace(filename));

} else {
  // Create one screen/framebuffer so that we have a canvas to draw on
  //store.dispatch(ReduxRoot.actions.updateLastSavedSnapshot());
  const appVersion = electron.remote.app.getVersion();
  electron.ipcRenderer.send('set-title', `Petmate 9 (${appVersion}) - *New File* `)

  store.dispatch(Screens.actions.newScreenX("c64", "40x25", true));
  setTimeout(() => {
    store.dispatch(Toolbar.actions.setZoom(102, 'left'))
    store.dispatch(ReduxRoot.actions.updateLastSavedSnapshot());
  }, 100)


}
// Render the application


const container = document.getElementById('root')!;
const root = createRoot(container);
root.render(React.createElement(Root, { store }, null));

loadSettings((j) => {
  store.dispatch(settings.actions.load(j))
  // Restore saved separator presets into toolbar
  const savedPresets = store.getState().settings.saved.linePresets;
  if (savedPresets && savedPresets.length > 0) {
    store.dispatch(Toolbar.actions.setLinePresets(savedPresets));
  }
  // Restore saved box presets into toolbar
  const savedBoxPresets = store.getState().settings.saved.boxPresets;
  if (savedBoxPresets && savedBoxPresets.length > 0) {
    store.dispatch(Toolbar.actions.setBoxPresets(savedBoxPresets));
  }
  // Restore saved texture presets into toolbar
  const savedTexturePresets = store.getState().settings.saved.texturePresets;
  if (savedTexturePresets && savedTexturePresets.length > 0) {
    store.dispatch(Toolbar.actions.setTexturePresets(savedTexturePresets));
  }
  applyTheme(store.getState().settings.saved.themeMode)
})

function applyTheme(mode: ThemeMode) {
  let isDark: boolean;
  if (mode === 'system') {
    // Don't rely on CSS prefers-color-scheme (unreliable on macOS).
    // Query Electron's resolved theme and set data-theme explicitly.
    isDark = electron.remote.nativeTheme.shouldUseDarkColors;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  } else {
    isDark = mode === 'dark';
    document.documentElement.setAttribute('data-theme', mode);
  }
  // Update the theme-color meta tag so the active titlebar matches on Windows
  const meta = document.getElementById('theme-color-meta');
  if (meta) {
    meta.setAttribute('content', isDark ? '#191919' : '#ebebeb');
  }
}

// Re-apply theme whenever settings change, and sync to main process
let prevThemeMode: ThemeMode | undefined
store.subscribe(() => {
  const themeMode = store.getState().settings.saved.themeMode
  if (themeMode !== prevThemeMode) {
    prevThemeMode = themeMode
    applyTheme(themeMode)
    // Keep main process nativeTheme in sync
    electron.ipcRenderer.invoke('set-theme-source', themeMode)
  }
})

// When the OS theme changes (user toggles macOS/Windows appearance),
// re-evaluate the data-theme attribute if we're in 'system' mode.
electron.ipcRenderer.on('native-theme-updated', (_event: Event, shouldUseDark: boolean) => {
  const themeMode = store.getState().settings.saved.themeMode
  if (themeMode === 'system') {
    // Force re-apply: remove data-theme so the CSS media query takes effect,
    // but also set it explicitly for macOS reliability.
    document.documentElement.setAttribute('data-theme', shouldUseDark ? 'dark' : 'light')
  }
})

// --- Debounced auto-persist for preset data ---
// A single subscriber detects changes to line/box/texture presets and
// batches them into one disk write after a short delay.  This reduces
// I/O and shrinks the race window between multiple instances.
const PERSIST_DEBOUNCE_MS = 250;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPersist = { line: false, box: false, texture: false };
let prevLinePresets = store.getState().toolbar.linePresets;
let prevBoxPresets = store.getState().toolbar.boxPresets;
let prevTexturePresets = store.getState().toolbar.texturePresets;

function flushPendingPersist() {
  persistTimer = null;
  const state = store.getState().toolbar;
  if (pendingPersist.line) {
    store.dispatch(settings.actions.persistLinePresets(state.linePresets) as any);
  }
  if (pendingPersist.box) {
    store.dispatch(settings.actions.persistBoxPresets(state.boxPresets) as any);
  }
  if (pendingPersist.texture) {
    store.dispatch(settings.actions.persistTexturePresets(state.texturePresets) as any);
  }
  pendingPersist = { line: false, box: false, texture: false };
}

store.subscribe(() => {
  const tb = store.getState().toolbar;
  let changed = false;
  if (tb.linePresets !== prevLinePresets) {
    prevLinePresets = tb.linePresets;
    pendingPersist.line = true;
    changed = true;
  }
  if (tb.boxPresets !== prevBoxPresets) {
    prevBoxPresets = tb.boxPresets;
    pendingPersist.box = true;
    changed = true;
  }
  if (tb.texturePresets !== prevTexturePresets) {
    prevTexturePresets = tb.texturePresets;
    pendingPersist.texture = true;
    changed = true;
  }
  if (changed) {
    if (persistTimer !== null) clearTimeout(persistTimer);
    persistTimer = setTimeout(flushPendingPersist, PERSIST_DEBOUNCE_MS);
  }
})

// --- File-watcher: reload external Settings changes (Phase 3) ---
// Watch the Settings file for changes made by other instances.  When a
// change is detected that we didn't cause, re-read the file and merge
// non-dirty keys into our Redux state so the UI stays in sync.
const WATCH_DEBOUNCE_MS = 300;
let watchDebounce: ReturnType<typeof setTimeout> | null = null;

try {
  const settingsPath = settings.getSettingsFilePath();
  fs.watch(settingsPath, () => {
    // Skip changes caused by our own writes
    if (settings.getIgnoreNextFileChange()) {
      settings.clearIgnoreNextFileChange();
      return;
    }
    // Debounce: Windows may fire multiple events for a single write
    if (watchDebounce !== null) clearTimeout(watchDebounce);
    watchDebounce = setTimeout(() => {
      watchDebounce = null;
      try {
        const raw = fs.readFileSync(settingsPath, 'utf-8');
        const diskJson = JSON.parse(raw);
        const dirtyKeys = settings.getDirtyKeys();
        const currentSaved = store.getState().settings.saved;
        const patch: Record<string, any> = {};
        let hasChanges = false;
        for (const key of Object.keys(diskJson)) {
          // Only adopt keys we haven't locally modified
          if (!dirtyKeys.has(key) && JSON.stringify((currentSaved as any)[key]) !== JSON.stringify(diskJson[key])) {
            patch[key] = diskJson[key];
            hasChanges = true;
          }
        }
        if (!hasChanges) return;
        // Merge external changes into settings state
        store.dispatch(settings.actions.mergeExternal(patch) as any);
        // Sync toolbar preset state if those keys were externally updated
        if (patch.linePresets) {
          prevLinePresets = patch.linePresets;
          store.dispatch(Toolbar.actions.setLinePresets(patch.linePresets));
        }
        if (patch.boxPresets) {
          prevBoxPresets = patch.boxPresets;
          store.dispatch(Toolbar.actions.setBoxPresets(patch.boxPresets));
        }
        if (patch.texturePresets) {
          prevTexturePresets = patch.texturePresets;
          store.dispatch(Toolbar.actions.setTexturePresets(patch.texturePresets));
        }
        if (patch.themeMode) {
          applyTheme(patch.themeMode);
        }
      } catch (_e) {
        // File may be mid-write or deleted — ignore
      }
    }, WATCH_DEBOUNCE_MS);
  });
} catch (_e) {
  // fs.watch may fail if the file doesn't exist yet — that's OK
  console.warn('Could not watch Settings file for external changes');
}

function dispatchExport(fmt: FileFormat) {
  // Either open an export options modal or go to export directly if the
  // output format doesn't need any configuration.
  console.log("dispatchExport",fmt);
  if (formats[fmt.name].exportOptions) {
    console.log("setShowExport")
    store.dispatch(Toolbar.actions.setShowExport({ show: true, fmt }))
  } else {
    console.log(formats[fmt.name],formats[fmt.name].exportOptions)

    store.dispatch(ReduxRoot.actions.fileExportAs(fmt))
  }
}

electron.ipcRenderer.on('window-blur', (_event: Event, _message: any) => {
  store.dispatch(Toolbar.actions.setShortcutsActive(false))
  store.dispatch(Toolbar.actions.clearModKeyState())
});

electron.ipcRenderer.on('window-focus', (_event: Event, _message: any) => {
  store.dispatch(Toolbar.actions.setShortcutsActive(true));
  store.dispatch(Toolbar.actions.clearModKeyState());
});

window.addEventListener('focus', () => {
  store.dispatch(Toolbar.actions.setShortcutsActive(true))
  store.dispatch(Toolbar.actions.clearModKeyState())
})
window.addEventListener('blur', () => {
  store.dispatch(Toolbar.actions.setShortcutsActive(false))
  store.dispatch(Toolbar.actions.clearModKeyState())
})

electron.ipcRenderer.on('prompt-unsaved', () => {
  if (promptProceedWithUnsavedChanges(store.getState(), {
    title: 'Quit',
    detail: 'Your changes will be lost if you don\'t save them.'
  })) {
    // OK to close now, ask the main process to quit:
    electron.ipcRenderer.send('closed');
  }
});

electron.ipcRenderer.on('open-petmate-file', (_event: Event, filename: string) => {
  // Load a .petmate file that was sent to the main process via the open-file
  // event (macOS).  This can be either a double-click on a .petmate file in
  // Finder or drag&drop a .petmate file on the app icon in the task bar.
  electron.ipcRenderer.invoke('add-recent-file', filename);
  store.dispatch(ReduxRoot.actions.openWorkspace(filename));
});

// Listen to commands from the main process
electron.ipcRenderer.on('menu', (_event: Event, message: string, data?: any) => {
  switch (message) {
    case 'undo': {
      // If texture tool is active and has local undo, use that first
      const undoState = store.getState();
      if (undoState.toolbar.selectedTool === Tool.Textures) {
        const textureUndo = (window as any).__texturePopUndo;
        if (textureUndo && textureUndo()) return;
        // Fell through — clear texture redo so it doesn’t interleave with canvas redo
        const clearRedo = (window as any).__textureClearRedo;
        if (clearRedo) clearRedo();
      }
      store.dispatch(ReduxRoot.actions.undo())
      return
    }
    case 'redo': {
      const redoState = store.getState();
      if (redoState.toolbar.selectedTool === Tool.Textures) {
        const textureRedo = (window as any).__texturePopRedo;
        if (textureRedo && textureRedo()) return;
        // Fell through — clear texture undo so it doesn’t interleave with canvas undo
        const clearUndo = (window as any).__textureClearUndo;
        if (clearUndo) clearUndo();
      }
      store.dispatch(ReduxRoot.actions.redo())
      return
    }
    case 'new':
      store.dispatch((dispatch: any, getState: () => RootState) => {
        if (promptProceedWithUnsavedChanges(getState(), {
          title: 'Reset',
          detail: 'This will empty your workspace.  This cannot be undone.'
        })) {
          dispatch(ReduxRoot.actions.resetState())
          dispatch(Screens.actions.newScreen())
          dispatch(ReduxRoot.actions.updateLastSavedSnapshot());
          electron.ipcRenderer.send('set-title', `Petmate 9 (${electron.remote.app.getVersion()}) - *New File* `)


        }
      });
      return
    case 'open':
      store.dispatch(ReduxRoot.actions.fileOpenWorkspace())
      return
    case 'save-as':
      store.dispatch(ReduxRoot.actions.fileSaveAsWorkspace())
      return
    case 'save':
      store.dispatch(ReduxRoot.actions.fileSaveWorkspace())
      return
    case 'export-png':
      dispatchExport(formats.pngFile)
      return
    case 'export-seq':
      dispatchExport(formats.seqFile)
      return
    case 'export-cbase':
      dispatchExport(formats.cbaseFile)
      return
    case 'export-marq-c':
      dispatchExport(formats.cFile)
      return
    case 'export-asm':
      dispatchExport(formats.asmFile)
      return
    case 'export-prg-player':
      dispatchExport(formats.prgPlayer)
      return
    case 'export-basic':
      dispatchExport(formats.basFile)
      return
    case 'export-prg':
      dispatchExport(formats.prgFile)
      return
    case 'export-gif':
      dispatchExport(formats.gifFile)
      return
    case 'export-json':
      dispatchExport(formats.jsonFile)
      return
    case 'export-pet':
      dispatchExport(formats.petFile)
      return

    case 'export-d64':
      dispatchExport(formats.d64File)
      return
    case 'import-d64':
      store.dispatch(ReduxRoot.actions.fileImportAppend(formats.d64File))
      return
    case 'import-marq-c':
      store.dispatch(ReduxRoot.actions.fileImportAppend(formats.cFile))
      return
    case 'import-png':
      store.dispatch(Toolbar.actions.setShowImport({ show: true, fmt: formats.pngFile }));
      return
    case 'import-seq':
      store.dispatch(ReduxRoot.actions.fileImportAppend(formats.seqFile));
      return
    case 'import-seq-adv':
      store.dispatch(Toolbar.actions.setShowImportSeqAdv({ show: true }));
      return
    case 'import-cbase':
      store.dispatch(ReduxRoot.actions.fileImportAppend(formats.cbaseFile));
      return
    case 'preferences':
      store.dispatch(Toolbar.actions.setShowSettings(true))
      return
    case 'new-screen':
      store.dispatch(Screens.actions.newScreen())
      return;
    case 'new-screen-c16':
      store.dispatch(Screens.actions.newScreenX('c16', '40x25', true))
      return;
    case 'new-screen-c128-40':
      store.dispatch(Screens.actions.newScreenX('c128', '40x25', true))
      return;
    case 'new-screen-c128-80':
      store.dispatch(Screens.actions.newScreenX('c128vdc', '80x25', true))
      return;
    case 'new-screen-vic20':
      store.dispatch(Screens.actions.newScreenX('vic20', '22x23', true))
      return;
    case 'new-screen-pet-40':
      store.dispatch(Screens.actions.newScreenX('pet', '40x25', true))
      return;
    case 'new-screen-pet-80':
      store.dispatch(Screens.actions.newScreenX('pet', '80x25', true))
      return;
    case 'new-dirart':
      store.dispatch(Screens.actions.newDirArt())
      return;
    case 'new-dirart-10':
      store.dispatch(Screens.actions.newScreenX('dirart', '16x10', false))
      return;
    case 'new-dirart-20':
      store.dispatch(Screens.actions.newScreenX('dirart', '16x20', false))
      return;
    case 'new-dirart-144':
      store.dispatch(Screens.actions.newScreenX('dirart', '16x144', false))
      return;
    case 'shift-screen-left':
      store.dispatch(Toolbar.actions.shiftHorizontal(-1))
      return;
    case 'shift-screen-right':
      store.dispatch(Toolbar.actions.shiftHorizontal(+1))
      return;
    case 'shift-screen-up':
      store.dispatch(Toolbar.actions.shiftVertical(-1))
      return;
    case 'shift-screen-down':
      store.dispatch(Toolbar.actions.shiftVertical(+1))
      return;
    case 'paste-text':
      store.dispatch(Toolbar.actions.pasteText())
      return;
    case 'toggle-border':
      store.dispatch(Toolbar.actions.toggleBorder())
      return;
    case 'toggle-grid':
      store.dispatch(Toolbar.actions.toggleGrid())

      return;
    case 'crop-screen':
      store.dispatch(Toolbar.actions.setShowResizeSettings(true))
      return;
    case 'convert-mono':
      store.dispatch(Toolbar.actions.convertToMono())
      store.dispatch(Toolbar.actions.setColor(1))
      return;
      case 'convert-strip8':
        store.dispatch(Toolbar.actions.strip8())
        store.dispatch(Toolbar.actions.setColor(1))
        return;
    case 'clear-screen':
      store.dispatch(Toolbar.actions.clearCanvas())

      return;
    case 'zoom-in-left':
      store.dispatch(Toolbar.actions.setZoom(1, 'left'))
      return;
    case 'zoom-out-left':
      store.dispatch(Toolbar.actions.setZoom(-1, 'left'))
      return;
    case 'align-frames-2x':
      store.dispatch(Toolbar.actions.setAllZoom(102, 'left'))
      return;
    case 'zoom-2x-left':
      store.dispatch(Toolbar.actions.setZoom(102, 'left'))
      return;
    case 'zoom-1x-left':
      store.dispatch(Toolbar.actions.setZoom(101, 'left'))
      return;
    case 'shift-frame-left':
      store.dispatch(Screens.actions.moveScreen(-1))

      return;
    case 'shift-frame-right':
      store.dispatch(Screens.actions.moveScreen(1))

      return;
    case 'duplicate-frame':
      store.dispatch(Screens.actions.cloneScreen(-1))
      return;
    case 'remove-frame':
      store.dispatch(Screens.actions.removeScreen(-1))
      return;
    case 'custom-fonts':
      store.dispatch(Toolbar.actions.setShowCustomFonts(true))
      return;
    case 'selection-select-all':
      store.dispatch(Toolbar.actions.selectAll())
      store.dispatch(Toolbar.actions.setSelectedTool(Tool.Brush))
      return;
    case 'selection-paste-new':
      store.dispatch(Toolbar.actions.brushToNew())
      //Fix
      return;
    case 'copy-frame':
      store.dispatch(Toolbar.actions.copyCurrentFrame())
      console.log("Copy Current Frame to Clipboard")
      return;
    case 'copy-png':
      store.dispatch(Toolbar.actions.copyCurrentFrameAsPNG())
      console.log("Copy Current Frame to Clipboard as PNG")
      return;
    case 'paste-frame':
      store.dispatch(Toolbar.actions.pasteFrame())
      console.log("Paste After Current Frame")
      return;
    case 'send-ultimate':

    dispatchExport(formats.ultFile)
      //store.dispatch(Toolbar.actions.sendUltimate())
      console.log("POST c64 Binary to Ultimate IP")
      return;
    case 'import-ultimate':
      store.dispatch(ReduxRoot.actions.importFromUltimate())
      return;
    case 'push-ultimate':
      store.dispatch(ReduxRoot.actions.pushToUltimate())
      return;
    case 'import-charset-ultimate':
      store.dispatch(ReduxRoot.actions.importCharsetFromUltimate())
      return;
    case 'play-sid-ultimate':
      store.dispatch(ReduxRoot.actions.playSidOnUltimate())
      return;
    case 'reset-ultimate':
      store.dispatch(ReduxRoot.actions.resetUltimate())
      return;
    case 'send-test-pattern-ultimate':
      store.dispatch(ReduxRoot.actions.sendTestPatternToUltimate())
      return;
    case 'export-d64-ultimate':
      store.dispatch(ReduxRoot.actions.exportD64ToUltimate())
      return;
    case 'send-default':
      store.dispatch(Toolbar.actions.sendDefault())
      console.log("Send c64 PRG to default Application")
      return;





    case 'selection-clear':
      store.dispatch(Toolbar.actions.resetBrush())
      return;
    case 'selection-rotate-left':
      store.dispatch(Toolbar.actions.rotateBrush(-1))
      return;
    case 'selection-rotate-right':
      store.dispatch(Toolbar.actions.rotateBrush(1))
      return;
    case 'selection-flip-h':
      store.dispatch(Toolbar.actions.mirrorBrush(-1))
      return;
    case 'selection-flip-v':
      store.dispatch(Toolbar.actions.mirrorBrush(1))
      return;
    case 'selection-invert':
      store.dispatch(Toolbar.actions.invertBrush())
      return;
    case 'open-recent-file':
      if (data) {
        electron.ipcRenderer.invoke('add-recent-file', data);
        store.dispatch(ReduxRoot.actions.openWorkspace(data));
      }
      return;
    case 'clear-recent-files':
      electron.ipcRenderer.invoke('clear-recent-files');
      return;
    case 'set-theme':
      if (data === 'dark' || data === 'light' || data === 'system') {
        store.dispatch(settings.actions.applyThemeImmediate(data) as any);
      }
      return;
    default:
      console.warn('unknown message from main process', message)
  }

})
