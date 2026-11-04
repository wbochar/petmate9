const path = require('path');
const { fileURLToPath } = require('url');

function getLinuxOpenFilename(argv, { isPackaged, cwd }) {
    for (const argument of argv.slice(isPackaged ? 1 : 2)) {
        if (argument.startsWith('-')) continue;
        let filename = argument;
        if (argument.startsWith('file://')) {
            try {
                filename = fileURLToPath(argument);
            } catch (_) {
                continue;
            }
        } else if (argument.includes('://')) {
            continue;
        }
        if (path.extname(filename).toLowerCase() === '.petmate') {
            return path.resolve(cwd, filename);
        }
    }
    return null;
}

function registerLinuxFileOpen(app, getWindow, openFile) {
    if (!app.requestSingleInstanceLock()) {
        app.quit();
        return;
    }
    app.on('second-instance', (_event, argv, workingDirectory) => {
        const filename = getLinuxOpenFilename(argv, {
            isPackaged: app.isPackaged,
            cwd: workingDirectory,
        });
        if (filename) openFile(filename);
        const window = getWindow();
        if (window && !window.isDestroyed()) {
            if (window.isMinimized()) window.restore();
            window.show();
            window.focus();
        }
    });
}

module.exports = { getLinuxOpenFilename, registerLinuxFileOpen };
