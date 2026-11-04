const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { getLinuxOpenFilename, registerLinuxFileOpen } = require('../public/linuxFileOpen');
const pkg = require('../package.json');

const cwd = '/home/wbochar';
const parse = (args, isPackaged = true) =>
    getLinuxOpenFilename(args, { isPackaged, cwd });

test('packaging registers a dedicated Petmate MIME type', () => {
    assert.equal(pkg.build.fileAssociations.ext, 'petmate');
    assert.deepEqual(pkg.build.linux.mimeTypes, ['application/x-petmate']);
    // electron-builder's generated XML forces x-office-document and would
    // overwrite the custom definition at the same install path.
    assert.equal(pkg.build.fileAssociations.mimeType, undefined);
    assert.ok(pkg.build.deb.fpm.includes(
        'resources/linux/petmate9.xml=/usr/share/mime/packages/petmate9.xml'
    ));
});

test('the installed MIME definition uses Petmate for both icon lookups', () => {
    const mime = fs.readFileSync(path.join(__dirname, '../resources/linux/petmate9.xml'), 'utf8');
    assert.match(mime, /<mime-type type="application\/x-petmate">/);
    assert.match(mime, /<glob pattern="\*\.petmate"\s*\/>/);
    assert.match(mime, /<icon name="petmate9"\s*\/>/);
    assert.match(mime, /<generic-icon name="petmate9"\s*\/>/);
    assert.doesNotMatch(mime, /x-office-document|application-x-generic/);
});

test('opens a packaged document with spaces', () => {
    assert.equal(parse(['/opt/Petmate 9/petmate9', '/tmp/My art.petmate']), '/tmp/My art.petmate');
});

test('resolves relative and uppercase document names', () => {
    assert.equal(parse(['petmate9', 'Art.PETMATE']), path.join(cwd, 'Art.PETMATE'));
});

test('decodes a desktop file URI', () => {
    const filename = '/tmp/My art.petmate';
    assert.equal(parse(['petmate9', pathToFileURL(filename).href]), filename);
});

test('ignores Electron switches and unrelated files', () => {
    assert.equal(parse(['petmate9', '--inspect', '--log-file=bad.petmate', 'notes.txt']), null);
});

test('ignores nonlocal URLs and malformed file URIs', () => {
    assert.equal(parse(['petmate9', 'https://example.com/a.petmate', 'file://remote/a.petmate', 'file:///bad%zz.petmate']), null);
});

test('ignores the development entrypoint', () => {
    assert.equal(parse(['electron', '/tmp/app.petmate'], false), null);
    assert.equal(parse(['electron', '.', 'Art.petmate'], false), path.join(cwd, 'Art.petmate'));
});

test('returns no document for a normal launch', () => {
    assert.equal(parse(['petmate9']), null);
});

function createApp(lock = true) {
    const app = new EventEmitter();
    app.isPackaged = true;
    app.requestSingleInstanceLock = () => lock;
    app.quit = () => { app.didQuit = true; };
    return app;
}

test('secondary process exits without registering a handler', () => {
    const app = createApp(false);
    registerLinuxFileOpen(app, () => null, () => assert.fail('unexpected open'));
    assert.equal(app.didQuit, true);
    assert.equal(app.listenerCount('second-instance'), 0);
});

test('second instance opens its document in the existing window and restores focus', () => {
    const app = createApp();
    const calls = [];
    const window = {
        isDestroyed: () => false,
        isMinimized: () => true,
        restore: () => calls.push('restore'),
        show: () => calls.push('show'),
        focus: () => calls.push('focus'),
    };
    registerLinuxFileOpen(app, () => window, filename => calls.push(filename));
    app.emit('second-instance', {}, ['petmate9', 'Art.petmate'], '/tmp');
    assert.deepEqual(calls, ['/tmp/Art.petmate', 'restore', 'show', 'focus']);
});

test('second-instance file can be cached before the window exists', () => {
    const app = createApp();
    let opened;
    registerLinuxFileOpen(app, () => null, filename => { opened = filename; });
    app.emit('second-instance', {}, ['petmate9', '/tmp/Art.petmate'], cwd);
    assert.equal(opened, '/tmp/Art.petmate');
});

test('a second launch without a document only focuses the existing window', () => {
    const app = createApp();
    let focused = false;
    registerLinuxFileOpen(app, () => ({
        isDestroyed: () => false,
        isMinimized: () => false,
        show: () => {},
        focus: () => { focused = true; },
    }), () => assert.fail('unexpected open'));
    app.emit('second-instance', {}, ['petmate9'], cwd);
    assert.equal(focused, true);
});
