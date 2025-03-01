
const {
    app,
    systemPreferences,
    BrowserWindow,
    shell,
    ipcMain,
    nativeTheme,
} = require('electron');

app.disableHardwareAcceleration()

const MenuBuilder = require('./menu');

if (process.platform == 'darwin') {
    systemPreferences.setUserDefault('NSDisabledDictationMenuItem', 'boolean', true)
    systemPreferences.setUserDefault('NSDisabledCharacterPaletteMenuItem', 'boolean', true)
}




const path = require('path');

let appClosing = false;
let mainWindow;
nativeTheme.themeSource = 'dark';

createWindow = () => {
    mainWindow = new BrowserWindow({
        backgroundColor: '#F7F7F7',
        show: false,
        webPreferences: {
            webSecurity: false,
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        frame:true,
        width: 1182,
        height: 756,
        minWidth: 1182,
        minHeight: 756
    });

    mainWindow.on('page-title-updated', (event, message) => {
        event.preventDefault()
    })
    mainWindow.setTitle('Petmate 9 (0.9.6) BETA9 - *New File* ')

    mainWindow.loadURL(
        !app.isPackaged
            ? 'http://localhost:3000'
            : `file://${path.join(__dirname, '../build/index.html')}`,
    );

    // @TODO: Use 'ready-to-show' event
    //        https://github.com/electron/electron/blob/master/docs/api/browser-window.md#using-ready-to-show-event
    mainWindow.webContents.on('did-finish-load', () => {
        if (!mainWindow) {
            throw new Error('"mainWindow" is not defined');
        }
        mainWindow.show();
        mainWindow.focus();
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        ipcMain.on('open-external-window', (event, arg) => {
            shell.openExternal(arg);
        });
    });

    // Prevent main window close.  Ask renderer if it's OK to quit,
    // if it is, it will send back a 'closed' event where we will actually
    // quit Petmate.
    mainWindow.on('close', (e) => {
      if (!appClosing) {
        e.preventDefault();
        mainWindow.webContents.send('prompt-unsaved');
      }
    })
};

var openFilename = null;
// macOS "click to open" or drag file on app icon handler
app.on("open-file", (event, file) => {
  openFilename = file;
  // Send open command to main window
  if (mainWindow) {
    mainWindow.webContents.send('open-petmate-file', file);
  }
  event.preventDefault();
});

app.on('ready', () => {
    createWindow();

    const menuBuilder = new MenuBuilder(mainWindow);
    menuBuilder.buildMenu();


});

app.on('window-all-closed', () => {
    app.quit();
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

app.whenReady().then(() => {
  if (!app.isPackaged) {
    console.log('install Chrome extensions if not packaged');
    const {
        default: installExtension,
        REACT_DEVELOPER_TOOLS,
        REDUX_DEVTOOLS,
    } = require('electron-devtools-installer');

    installExtension(REACT_DEVELOPER_TOOLS)
        .then(name => { console.log(`Added Extension: ${name}`); })
        .catch(err => { console.log('An error occurred: ', err); });

    // TODO throws an error similar to https://github.com/nklayman/vue-cli-plugin-electron-builder/issues/776,
    // just disable it for now.
    // installExtension(REDUX_DEVTOOLS)
    //     .then(name => { console.log(`Added Extension: ${name}`); })
    //     .catch(err => { console.log('An error occurred: ', err); });
  }
});



// Handle browser window set window title requests
ipcMain.on('set-title', (event, arg) => {
    mainWindow.setTitle(arg)
})
app.on('browser-window-blur', () => {
    mainWindow.webContents.send('window-blur')
});
app.on('browser-window-focus', () => {
    mainWindow.webContents.send('window-focus')
});
ipcMain.on('load-page', (event, arg) => {
    mainWindow.loadURL(arg);
});
// See comments in mainWindow.on('close')
ipcMain.on('closed', (event, arg) => {
  appClosing = true;
  app.quit();
});
// Windows: handler for clicking a .petmate file in Explorer to open it in Petmate
ipcMain.on('get-open-args', function(event) {
    let filename = null;
    if (process.platform == 'win32' && process.argv.length >= 2) {
        // When running 'yarn start' to start Petmate in development mode,
        // the first argument is '.' -- ignore that.
        if (process.argv[1] !== '.') {
            filename = process.argv[1];
        }
    } else if (process.platform == 'darwin') {
        // Return a cached result of open-file event when the app is loading.
        // Later open-file's will be sent directly to the main window.
        filename = openFilename;
    }
    event.returnValue = filename;
  });
