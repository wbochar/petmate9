# macOS Build Notes

## Overview

This document covers macOS-specific build issues, fixes, and notarization requirements discovered when migrating the project back from Windows to macOS.

---

## Build Issues & Fixes

### Problem: `fsevents@1.2.13` Compilation Failure

**Error:**
```
../fsevents.cc:77:35: error: no member named 'GetIsolate' in 'v8::Object'
node-gyp failed to rebuild '/.../.../node_modules/fsevents'
```

**Root Cause:**

When `node_modules` were installed on Windows, `fsevents@1.2.13` was carried over as part of the dependency chain:

```
c64jasm@0.9.2 → chokidar@2.1.8 → fsevents@1.2.13
```

`fsevents` is a macOS-only native module. Version 1.x uses a V8 API (`exports->GetIsolate()`) that was removed in the V8 version bundled with Electron 40.x, causing a compilation error when `@electron/rebuild` tried to rebuild native modules during `npm run dist-macos`.

**Fix Applied:**

Added a `chokidar` override to `package.json` to force all packages to use `chokidar@3.x`, which depends on `fsevents@2.x`:

```json
"overrides": {
  "chokidar": "^3.6.0",
  ...
}
```

Then ran a clean install:

```bash
rm -rf node_modules
npm install
```

**Result:** `fsevents@1.2.13` was eliminated from the dependency tree entirely. The build completed successfully, producing:

- `dist/Petmate 9-0.9.7.dmg` (x64)
- `dist/Petmate 9-0.9.7-arm64.dmg` (arm64)

---

## Migration Checklist (Windows → macOS)

When moving the project from Windows to macOS, always do the following **before** running any build scripts:

1. Delete `node_modules` — Windows-built native modules are incompatible with macOS.
2. Run `npm install` fresh on the macOS machine.
3. Verify no `fsevents@1.x` is present: `npm ls fsevents`
4. Then run `npm run dist-macos`.

---

## Notarization

### Current Status

Notarization is currently **skipped**. The build logs show:

```
notarize options were unable to be generated
```

The app is signed with the Developer ID:
```
Developer ID Application: Wolfgang Bochar (53E78YQXMW)
```

However, without notarization, macOS Gatekeeper will block the app from running on other machines (quarantine warning or outright refusal).

### What Notarization Requires

To enable notarization, the following environment variables must be set before running `npm run dist-macos`:

| Variable | Description |
|---|---|
| `APPLE_ID` | Your Apple ID email address |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password generated at appleid.apple.com |
| `APPLE_TEAM_ID` | Your Apple Developer Team ID (e.g. `53E78YQXMW`) |

These should **never** be committed to source control. Use a `.env` file (gitignored) or a secrets manager.

### electron-builder Notarization Config

Add the following to the `mac` section of the `build` config in `package.json`:

```json
"mac": {
  "notarize": {
    "teamId": "53E78YQXMW"
  },
  ...
}
```

And set the environment variables at build time:

```bash
APPLE_ID=your@email.com \
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx \
npm run dist-macos
```

### Generating an App-Specific Password

1. Go to [appleid.apple.com](https://appleid.apple.com)
2. Sign in → Security → App-Specific Passwords
3. Click **+** and generate a password for "electron-builder"

---

## Build Script Reference

```bash
# macOS (x64 + arm64 DMGs, no code signing identity auto-discovery)
npm run dist-macos

# Windows (x64 NSIS installer)
npm run dist-win

# Linux (rpm, deb, apk, freebsd, pacman)
npm run dist-linux
```

The `dist-macos` script sets `CSC_IDENTITY_AUTO_DISCOVERY=false` to suppress keychain prompts when not doing a notarized build. Remove or change this flag if you want automatic code signing certificate discovery.

---

## Player Export: SID Data Ordering Fix

The single-frame `.player` exporter (`src/utils/exporters/player.ts`) previously appended SID binary data **after** the frame data at `* = $2000`. Since most SID files load at `$1000`, this caused a c64jasm assembly error on all platforms:

```
Cannot set program counter to a smaller value than current
(current: $27d2, trying to set $1000)
```

The fix places SID data (`* = sid_startAddress`) **before** the `* = $2000` frame data directive in the `singleFrameASM` template, matching the memory layout used by the test script (`_tests/run_player_test.js`) and the animation player.

Correct memory layout: code (`$0801`+) → SID (`$1000`) → frame data (`$2000`)

This applies to the C64 and C128 single-frame paths. The animation player (`saveAnimationPlayer`) was already correct.

---

## Dark / Light Mode Switching Fix

Theme switching worked on Windows but not macOS. Root cause: two disconnected theme systems.

1. **Main process** (View menu) set `nativeTheme.themeSource` → affects the CSS `prefers-color-scheme` media query.
2. **Renderer** (Settings UI) set a `data-theme` attribute on `<html>` → CSS responds directly.

They never communicated. On Windows, `nativeTheme.themeSource` reliably propagates to `prefers-color-scheme` in Chromium. On macOS this propagation is unreliable — Chromium tends to follow the actual system appearance.

**Fix:** Unified the two systems so they stay in sync.

- `menu.js` → `buildThemeMenuItems` now sends `sendMenuCommand('set-theme', source)` to the renderer.
- `electron.js` → Added `nativeTheme.on('updated')` listener that sends `native-theme-updated` IPC for system theme changes.
- `index.ts` → `applyTheme('system')` now queries `electron.remote.nativeTheme.shouldUseDarkColors` and sets `data-theme` explicitly instead of relying on the CSS media query. Store subscription syncs back to main via `set-theme-source` IPC. New `set-theme` menu command handled via `applyThemeImmediate`.
- `settings.ts` → Added `applyThemeImmediate` thunk to update both `editing` and `saved` branches immediately.

---

## macOS UI Layout Fixes

Several layout differences between Windows and macOS were addressed:

### Platform-conditional CSS

A `data-platform` attribute (`darwin`, `win32`, `linux`) is now set on `<html>` at startup (`index.ts`). This allows platform-specific CSS selectors:

```css
:global(:root[data-platform="darwin"]) .editor {
  margin-top: 0;
}
```

### Toolbar top gap

The toolbar had `padding-top` on `.leftmenubar` which wasn't reliably respected by the child `.toolbar` (due to `height: 100%`). Moved the spacing to `Toolbar.module.css` `.toolbar` with `padding-top: 16px` and `box-sizing: border-box`.

### Editor / right panel top gap

On macOS the native title bar sits differently than Windows, causing a visible gap above the editor and right-side panels. Fixed with:
- `.editor` in `App.module.css` → `margin-top: 0` on macOS via `data-platform` selector.
- Right panel column in `Editor.tsx` → `marginTop: os === 'darwin' ? '0' : '16px'`.

### Toolbar tooltip z-index

Tooltips were rendering behind the tab row. Fixed by adding `position: relative; z-index: 10` to `.leftmenubar` and bumping tooltip/colorpicker z-index from `1` to `100`.

---

## Preferences Dialog Tabs

The Preferences dialog was reorganized into three tabs:

- **Program** (default) — Theme selector, display options (color numbers on chips).
- **Colors** — C64, VIC-20, and PET color palette selectors (chips doubled to 12px).
- **Emulation** — Ultimate 64 address, plus 4 emulator binary path fields (C64, C128, PET 4032, VIC-20) with Browse buttons.

Emulator paths are persisted in the Settings file (`emulatorPaths` field) and survive restarts.

### Files changed
- `src/redux/types.ts` — Added `EmulatorPaths` interface.
- `src/redux/settings.ts` — Added `SET_EMULATOR_PATH` action, initial state, `fromJson` handling, reducer.
- `src/containers/Settings.tsx` — Converted to function component with `useState` for tabs.
- `src/containers/ModalCommon.module.css` — Added tab styles, browse-row styles, fixed `.textInput` overrides.
- `src/components/ColorPicker.tsx` — Added optional `chipSize` prop to `ColorBlock` and `ColorPalette`.
- `src/components/Modal.module.css` — Modal width bumped from 420px to 480px.
