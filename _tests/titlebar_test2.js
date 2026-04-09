const { app, BrowserWindow, nativeTheme } = require('electron');
const { execSync } = require('child_process');
const path = require('path');

app.setName('titlebar-test2');

// Do NOT set nativeTheme before window creation - test if default works
app.whenReady().then(() => {
  console.log('Before anything - shouldUseDarkColors:', nativeTheme.shouldUseDarkColors, 'themeSource:', nativeTheme.themeSource);

  const w = new BrowserWindow({ width: 400, height: 300, show: false, backgroundColor: '#ffffff' });
  w.loadURL('data:text/html,<body style="background:white"><h1>Titlebar test</h1></body>');

  w.once('ready-to-show', () => {
    // Set theme to light AFTER window is ready but BEFORE showing
    nativeTheme.themeSource = 'light';
    console.log('After set light - shouldUseDarkColors:', nativeTheme.shouldUseDarkColors);

    const hwndBuf = w.getNativeWindowHandle();
    const hwnd = hwndBuf.length === 8
      ? Number(hwndBuf.readBigUInt64LE())
      : hwndBuf.readUInt32LE();
    console.log('HWND:', hwnd);

    // Call DWM with both attribute 19 and 20
    const scriptPath = path.join(__dirname, 'set_light_titlebar.ps1');
    try {
      const out = execSync(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" -Hwnd ${hwnd} -Dark 0`,
        { encoding: 'utf-8' }
      );
      console.log('DWM result:', out.trim());
    } catch (e) {
      console.error('Error:', e.stderr || e.message);
    }

    // Now show the window
    w.show();
    console.log('Window shown. Check titlebar. Press Ctrl+C to quit.');
  });
});
