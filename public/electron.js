
const {
    app,
    systemPreferences,
    BrowserWindow,
    shell,
    ipcMain,
    nativeTheme,
} = require('electron');

const remoteMain = require('@electron/remote/main');
remoteMain.initialize();

app.disableHardwareAcceleration()

const MenuBuilder = require('./menu');
const recentFiles = require('./recentFiles');

if (process.platform == 'darwin') {
    systemPreferences.setUserDefault('NSDisabledDictationMenuItem', 'boolean', true)
    systemPreferences.setUserDefault('NSDisabledCharacterPaletteMenuItem', 'boolean', true)
}




const path = require('path');

let appClosing = false;
let mainWindow;
let menuBuilder;
nativeTheme.themeSource = 'dark';

const createWindow = () => {
    mainWindow = new BrowserWindow({
        backgroundColor: '#F7F7F7',
        show: false,
        webPreferences: {
            webSecurity: false,
            nodeIntegration: true,
            contextIsolation: false,
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
    mainWindow.setTitle(`Petmate 9 (${app.getVersion()}) - *New File* `)

    remoteMain.enable(mainWindow.webContents);

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
  // Track in recent files and rebuild menu
  recentFiles.addRecentFile(file);
  if (menuBuilder) {
    menuBuilder.setRecentFiles(recentFiles.getRecentFiles());
    menuBuilder.rebuildMenu();
  }
  // Send open command to main window
  if (mainWindow) {
    mainWindow.webContents.send('open-petmate-file', file);
  }
  event.preventDefault();
});

app.on('ready', () => {
    createWindow();

    const initialRecentFiles = recentFiles.getRecentFiles();
    menuBuilder = new MenuBuilder(mainWindow, initialRecentFiles);
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

app.whenReady().then(async () => {
  if (!app.isPackaged) {
    // electron-devtools-installer v3 is incompatible with Electron 28+
    // and causes a SIGKILL crash. Load React DevTools via the built-in API instead.
    try {
      const os = require('os');
      const fs = require('fs');
      const extDir = path.join(
        os.homedir(),
        'Library/Application Support/Google/Chrome/Default/Extensions/fmkadmapgofadopljbjfkapdkoienihi'
      );
      if (fs.existsSync(extDir)) {
        const versions = fs.readdirSync(extDir).sort();
        if (versions.length > 0) {
          const extPath = path.join(extDir, versions[versions.length - 1]);
          await mainWindow.webContents.session.loadExtension(extPath, { allowFileAccess: true });
          console.log('Loaded React Developer Tools from Chrome installation');
        }
      }
    } catch (err) {
      console.log('Could not load React DevTools:', err.message);
    }
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

// Recent files IPC handlers
ipcMain.handle('get-recent-files', () => {
  return recentFiles.getRecentFiles();
});

ipcMain.handle('add-recent-file', (_event, filePath) => {
  const updated = recentFiles.addRecentFile(filePath);
  if (menuBuilder) {
    menuBuilder.setRecentFiles(updated);
    menuBuilder.rebuildMenu();
  }
  return updated;
});

ipcMain.handle('clear-recent-files', () => {
  const updated = recentFiles.clearRecentFiles();
  if (menuBuilder) {
    menuBuilder.setRecentFiles(updated);
    menuBuilder.rebuildMenu();
  }
  return updated;
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
    // Track in recent files if opened via file association
    if (filename) {
      recentFiles.addRecentFile(filename);
      if (menuBuilder) {
        menuBuilder.setRecentFiles(recentFiles.getRecentFiles());
        menuBuilder.rebuildMenu();
      }
    }
    event.returnValue = filename;
  });
