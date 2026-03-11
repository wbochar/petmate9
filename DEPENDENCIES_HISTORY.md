# Dependency Version History

## Pre-Upgrade Snapshot (2026-03-10)

Package version: 0.9.6b

### Dependencies (production)
- @fortawesome/fontawesome-svg-core: ^6.5.1
- @fortawesome/free-brands-svg-icons: ^5.5.0
- @fortawesome/free-solid-svg-icons: ^6.5.1
- @fortawesome/react-fontawesome: ^0.2.0
- c64jasm: ^0.8.1
- classnames: ^2.2.6
- electron-devtools-installer: ^3.1.1
- fast-memoize: ^2.5.1
- gifenc: ^1.0.3
- pngjs: ^3.3.3
- react: ^16.8.1
- react-dev-utils: ^6.1.1
- react-dom: ^16.8.1
- react-redux: ^5.1.1
- redux: ^4.0.1
- redux-logger: ^3.0.6
- redux-thunk: ^2.3.0
- redux-undo: 1.0.0-beta9-9-7

### Dependencies (dev)
- @types/classnames: ^2.2.6
- @types/pngjs: ^3.3.2
- @types/react: ^16.8.1
- @types/react-dom: ^16.8.0
- @types/react-redux: ^6.0.10
- @types/resize-observer-browser: ^0.1.5
- concurrently: ^3.6.0
- cross-env: ^5.2.0
- electron: ^12.0.2
- electron-builder: 23.6.0
- react-scripts: 3.4.1
- sharp: 0.32.1
- typescript: ^3.1.6
- version-bump-prompt: ^4.2.1
- wait-on: ^3.2.0

### Build toolchain
- Node: 16.20.2 (for dev/start)
- Node: stable/latest (for dist builds)
- react-scripts (CRA) 3.4.1

### Notes
- The README warns that dependency upgrades are extremely fragile due to extinct npm packages.
- electron-builder version varies by platform: 23.6.0 for macOS, 22.10.5 for PC (per README).
- redux-undo uses a beta version pinned to an exact version.
- react-scripts (CRA) is deprecated upstream.

## Post-Upgrade Snapshot (2026-03-10)

### Key version changes
- react: 16 → 18 (createRoot API migration)
- react-dom: 16 → 18
- react-redux: 5 → 8 (connect() still works)
- react-scripts: 3.4.1 → 5.0.1 (webpack 5, via craco)
- electron: 12 → 28 (migrated to @electron/remote)
- typescript: 3 → 5
- electron-builder: 23 → 25
- redux-undo: beta → 1.1.0 stable
- @fortawesome/free-brands-svg-icons: 5 → 6
- concurrently: 3 → 9
- cross-env: 5 → 7
- sharp: 0.32 → 0.33
- wait-on: 3 → 8

### New dependencies added
- @electron/remote: ^2.1.2 (replaces built-in electron.remote removed in Electron 14)
- @craco/craco: ^7.1.0 (webpack 5 config overrides for Electron compatibility)
- invariant: ^2.2.4 (required by vendored react-sortable-hoc)

### Removed dependencies
- react-dev-utils (no longer directly needed, bundled by CRA 5)

### Code changes required by upgrades
- ReactDOM.render() → createRoot().render() (React 18)
- StatelessComponent → FunctionComponent (React 18 types)
- Added children?: React.ReactNode to component props (React 18 types)
- electron.remote → @electron/remote with main process initialization
- Build scripts use craco instead of react-scripts directly
- craco.config.js added for webpack 5 Node.js built-in fallbacks

### Kept at older versions (intentional)
- pngjs: 3.x (7.x has breaking API changes)
- electron-devtools-installer: 3.x (4.x has different API)
