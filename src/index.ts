import React from 'react';
import ReactDOM from 'react-dom';
import Root from './containers/Root';
import './app.global.css';

import { formats, loadSettings, promptProceedWithUnsavedChanges } from './utils';
import * as Screens from './redux/screens';
import * as settings  from './redux/settings';
import { Toolbar } from './redux/toolbar';
import * as ReduxRoot from './redux/root';

import configureStore from './store/configureStore';

// TODO prod builds
import { electron } from './utils/electronImports';
import { FileFormat, RootState, Tool } from './redux/types';

const store = configureStore();

const filename = electron.ipcRenderer.sendSync('get-open-args');
if (filename) {
  // Load a .petmate file that the user clicked on Explorer (Windows only path).
  store.dispatch(ReduxRoot.actions.openWorkspace(filename));
} else {
  // Create one screen/framebuffer so that we have a canvas to draw on
  store.dispatch(Screens.actions.newScreen());
  store.dispatch(ReduxRoot.actions.updateLastSavedSnapshot());
 electron.ipcRenderer.send('set-title', `Petmate 9 (0.9.5) - *New File* `)
}
// Render the application
ReactDOM.render(
  React.createElement(Root, { store }, null),
  document.getElementById('root')
);

loadSettings((j) => store.dispatch(settings.actions.load(j)))

function dispatchExport(fmt: FileFormat) {
  // Either open an export options modal or go to export directly if the
  // output format doesn't need any configuration.
  if (formats[fmt.ext].exportOptions) {
    store.dispatch(Toolbar.actions.setShowExport({show:true, fmt}))
  } else {
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
  store.dispatch(ReduxRoot.actions.openWorkspace(filename));
});

// Listen to commands from the main process
electron.ipcRenderer.on('menu', (_event: Event, message: string) => {
  switch (message) {
    case 'undo':
      store.dispatch(ReduxRoot.actions.undo())
      return
    case 'redo':
      store.dispatch(ReduxRoot.actions.redo())
      return
    case 'new':
      store.dispatch((dispatch: any, getState: () => RootState) => {
        if (promptProceedWithUnsavedChanges(getState(), {
          title: 'Reset',
          detail: 'This will empty your workspace.  This cannot be undone.'
        })) {
          dispatch(ReduxRoot.actions.resetState())
          dispatch(Screens.actions.newScreen())
          dispatch(ReduxRoot.actions.updateLastSavedSnapshot());
          electron.ipcRenderer.send('set-title', `Petmate 9 (0.9.5) - *New File* `)
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
      dispatchExport(formats.png)
      return
    case 'export-seq':
      dispatchExport(formats.seq)
      return
    case 'export-marq-c':
      dispatchExport(formats.c)
      return
    case 'export-asm':
      dispatchExport(formats.asm)
      return
    case 'export-basic':
      dispatchExport(formats.bas)
      return
    case 'export-prg':
      dispatchExport(formats.prg)
      return
    case 'export-gif':
      dispatchExport(formats.gif)
      return
    case 'export-json':
      dispatchExport(formats.json)
      return
    case 'export-pet':
      dispatchExport(formats.pet)
      return

    case 'export-d64':
      dispatchExport(formats.d64)
      return
    case 'import-d64':
      store.dispatch(ReduxRoot.actions.fileImportAppend(formats.d64))
      return
    case 'import-marq-c':
      store.dispatch(ReduxRoot.actions.fileImportAppend(formats.c))
      return
    case 'import-png':
      store.dispatch(Toolbar.actions.setShowImport({show: true, fmt: formats.png}));
      return
    case 'import-seq':
      store.dispatch(ReduxRoot.actions.fileImportAppend(formats.seq));
      return
    case 'preferences':
      store.dispatch(Toolbar.actions.setShowSettings(true))
      return
    case 'new-screen':
      store.dispatch(Screens.actions.newScreen())
      return;
    case 'new-dirart':
      store.dispatch(Screens.actions.newDirArt())
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
      case 'clear-screen':
        store.dispatch(Toolbar.actions.clearCanvas())

      return;
      case 'zoom-in-center':
        store.dispatch(Toolbar.actions.setZoom(.5,'center'))
      return;
      case 'zoom-out-center':
        store.dispatch(Toolbar.actions.setZoom(-.5,'center'))
      return;
      case 'zoom-in-left':
        store.dispatch(Toolbar.actions.setZoom(.5,'left'))
      return;
      case 'zoom-out-left':
        store.dispatch(Toolbar.actions.setZoom(-.5,'left'))
      return;
      case 'align-frames-topleft2x':
        store.dispatch(Toolbar.actions.setAllZoom(101,'left'))
      return;
      case 'align-frames-center2x':
        store.dispatch(Toolbar.actions.setAllZoom(101,'center'))
      return;
      case 'zoom-2x-center':
        store.dispatch(Toolbar.actions.setZoom(101,'center'))
      return;
      case 'zoom-2x-left':
        store.dispatch(Toolbar.actions.setZoom(101,'left'))
      return;
      case 'shift-frame-left':
        store.dispatch(Screens.actions.moveScreen(-1))
        store.dispatch(Toolbar.actions.clearModKeyState());
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
      case 'toggle-light-dark':
        //fix
        // Need to switch CSS here
      return;
    default:
      console.warn('unknown message from main process', message)
  }

})
