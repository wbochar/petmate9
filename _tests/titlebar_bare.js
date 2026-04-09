// Absolutely bare Electron window - no theme manipulation at all
const { app, BrowserWindow, nativeTheme } = require('electron');

app.whenReady().then(() => {
  console.log('Default themeSource:', nativeTheme.themeSource);
  console.log('Default shouldUseDarkColors:', nativeTheme.shouldUseDarkColors);

  const w = new BrowserWindow({ width: 400, height: 200 });
  w.loadURL('data:text/html,<body><h2>Bare window - no theme config</h2></body>');

  console.log('Is titlebar LIGHT or DARK? Press Ctrl+C to quit.');
});
