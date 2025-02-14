import React from 'react';
import ReactDOM from 'react-dom';
import Root from './containers/Root';
import './app.global.css';

import { formats, loadSettings, promptProceedWithUnsavedChanges } from './utils';
import * as Screens from './redux/screens';
import * as settings from './redux/settings';
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
  store.dispatch(ReduxRoot.actions.updateLastSavedSnapshot());
  electron.ipcRenderer.send('set-title', `Petmate 9 (0.9.6a) - *New File* `)
  store.dispatch(Screens.actions.newScreenX("c64", "40x25", true));
  setTimeout(() => {
    store.dispatch(Toolbar.actions.setZoom(102, 'left'))

  }, 100)


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
          electron.ipcRenderer.send('set-title', `Petmate 9 (0.9.6a) - *New File* `)


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
      store.dispatch(Screens.actions.newScreenX('c128', '80x25', true))
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
    case 'zoom-in-center':
      store.dispatch(Toolbar.actions.setZoom(.5, 'center'))
      return;
    case 'zoom-out-center':
      store.dispatch(Toolbar.actions.setZoom(-.5, 'center'))
      return;
    case 'zoom-in-left':
      store.dispatch(Toolbar.actions.setZoom(.5, 'left'))
      return;
    case 'zoom-out-left':
      store.dispatch(Toolbar.actions.setZoom(-.5, 'left'))
      return;
    case 'align-frames-topleft2x':
      store.dispatch(Toolbar.actions.setAllZoom(101, 'left'))
      return;
    case 'align-frames-center2x':
      store.dispatch(Toolbar.actions.setAllZoom(101, 'center'))
      return;
    case 'zoom-2x-center':
      store.dispatch(Toolbar.actions.setZoom(101, 'center'))
      return;
    case 'zoom-2x-left':
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
    case 'toggle-light-dark':
      //fix
      // Need to switch CSS here
      return;
    default:
      console.warn('unknown message from main process', message)
  }

})
