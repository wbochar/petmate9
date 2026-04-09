const { app, BrowserWindow, nativeTheme } = require('electron');

app.setName('titlebar-test');

app.whenReady().then(() => {
  nativeTheme.themeSource = 'light';
  console.log('themeSource:', nativeTheme.themeSource);
  console.log('shouldUseDarkColors:', nativeTheme.shouldUseDarkColors);

  const w = new BrowserWindow({ width: 400, height: 300, show: true });
  w.loadURL('data:text/html,<body style="background:white"><h1>Light mode titlebar test</h1></body>');

  console.log('Window created. Check if titlebar is LIGHT or DARK.');
  console.log('Press Ctrl+C to quit after checking.');
});
