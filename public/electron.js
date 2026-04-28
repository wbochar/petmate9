
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

// Ensure userData path is consistent between dev and production builds
app.setName('petmate9');

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

const createWindow = () => {
    const isDark = nativeTheme.shouldUseDarkColors;
    mainWindow = new BrowserWindow({
        backgroundColor: isDark ? '#191919' : '#ebebeb',
        show: false,
        webPreferences: {
            webSecurity: false,
            nodeIntegration: true,
            contextIsolation: false,
        },
        frame:true,
    useContentSize: true,
    width: 1164,
    height: 702,
    });

    // Set minimum size to match the actual window size (content + frame).
    // minWidth/minHeight don't respect useContentSize, so we read the
    // real window dimensions after creation and lock them in.
    const [initW, initH] = mainWindow.getSize();
    mainWindow.setMinimumSize(initW, initH);

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
    // Inject theme-color meta tag before the page renders so the titlebar
    // picks up the correct light/dark color from the very first paint.
    mainWindow.webContents.on('dom-ready', () => {
        const isDark = nativeTheme.shouldUseDarkColors;
        const color = isDark ? '#191919' : '#ebebeb';
        mainWindow.webContents.executeJavaScript(
            `(function(){var m=document.createElement('meta');m.name='theme-color';m.id='theme-color-meta';m.content='${color}';document.head.appendChild(m);})()`
        ).catch(() => {});
    });

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

// Read the theme from the renderer's Settings file (single source of truth).
// Falls back to 'dark' if the file doesn't exist or is unreadable.
function getThemeFromSettings() {
  try {
    const settingsFile = path.join(app.getPath('userData'), 'Settings');
    const fs = require('fs');
    if (fs.existsSync(settingsFile)) {
      const data = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
      if (data.themeMode === 'dark' || data.themeMode === 'light' || data.themeMode === 'system') {
        return data.themeMode;
      }
    }
  } catch (e) {
    console.error('Failed to read theme from Settings:', e.message);
  }
  return 'dark';
}

function getShowTransparencyFromSettings() {
  try {
    const settingsFile = path.join(app.getPath('userData'), 'Settings');
    const fs = require('fs');
    if (fs.existsSync(settingsFile)) {
      const data = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
      if (typeof data.showTransparency === 'boolean') {
        return data.showTransparency;
      }
    }
  } catch (e) {
    console.error('Failed to read showTransparency from Settings:', e.message);
  }
  return true;
}

app.on('ready', () => {
    // Apply persisted theme preference from the Settings file
    nativeTheme.themeSource = getThemeFromSettings();

    createWindow();

    const initialRecentFiles = recentFiles.getRecentFiles();
    menuBuilder = new MenuBuilder(
      mainWindow,
      initialRecentFiles,
      nativeTheme.themeSource,
      getShowTransparencyFromSettings(),
    );
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
          // Newer Electron versions moved extension APIs onto session.extensions.
          // Use the new path when available, falling back to the deprecated one.
          const session = mainWindow.webContents.session;
          const loader = (session.extensions && typeof session.extensions.loadExtension === 'function')
            ? session.extensions.loadExtension.bind(session.extensions)
            : session.loadExtension.bind(session);
          await loader(extPath, { allowFileAccess: true });
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

// Notify renderer when the OS theme changes (relevant for 'system' mode)
nativeTheme.on('updated', () => {
  if (mainWindow) {
    mainWindow.webContents.send('native-theme-updated', nativeTheme.shouldUseDarkColors);
  }
});

// Theme IPC handlers
ipcMain.handle('get-theme-source', () => {
  return nativeTheme.themeSource;
});

ipcMain.handle('set-theme-source', (_event, source) => {
  if (source === 'dark' || source === 'light' || source === 'system') {
    nativeTheme.themeSource = source;
    // Theme is persisted by the renderer's Settings save — no separate file needed.
    if (menuBuilder) {
      menuBuilder.setThemeSource(source);
      menuBuilder.rebuildMenu();
    }
    // Update background color to match theme (affects window chrome on Windows)
    if (mainWindow) {
      const resolvedDark = source === 'dark' || (source === 'system' && nativeTheme.shouldUseDarkColors);
      mainWindow.setBackgroundColor(resolvedDark ? '#191919' : '#ebebeb');
    }
  }
  return nativeTheme.themeSource;
});

ipcMain.handle('set-show-transparency-menu', (_event, show) => {
  if (typeof show === 'boolean' && menuBuilder) {
    menuBuilder.setShowTransparency(show);
    menuBuilder.rebuildMenu();
  }
  if (menuBuilder) {
    return menuBuilder.getShowTransparency();
  }
  return typeof show === 'boolean' ? show : true;
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
