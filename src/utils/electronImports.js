
// See: https://github.com/electron/electron/issues/7300

const electron = window.require('electron');
const app = window.require('electron/main')
const fs = window.require('fs');
const path = window.require('path');
const buffer = window.require('buffer');



export { electron, fs, path, buffer, app};
