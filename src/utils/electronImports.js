
// See: https://github.com/electron/electron/issues/7300

const electron = window.require('electron');
const remote = window.require('@electron/remote');

// Attach @electron/remote as electron.remote for backward compatibility
electron.remote = remote;

const app = remote.app;
const fs = window.require('fs');
const path = window.require('path');
const buffer = window.require('buffer');

export { electron, fs, path, buffer, app};
