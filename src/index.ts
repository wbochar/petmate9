import React from 'react';
import { createRoot } from 'react-dom/client';
import Root from './containers/Root';
import './app.global.css';

import { formats, loadSettings, promptProceedWithUnsavedChanges } from './utils';
import * as Screens from './redux/screens';
import * as settings from './redux/settings';
import { Toolbar, PRESET_GROUPS } from './redux/toolbar';
import * as ReduxRoot from './redux/root';
import * as selectors from './redux/selectors';
import * as screensSelectors from './redux/screensSelectors';
import { Framebuffer } from './redux/editor';
import {
  buildBoxesExportPixels,
  buildTexturesExportPixels,
  getExportFrameSpec,
} from './utils/presetExport';
import {
  importBoxPresetsFromFramebuf,
  importLinePresetsFromFramebuf,
  importTexturePresetsFromFramebuf,
} from './utils/presetImport';
import { DEFAULT_COLORS_BY_GROUP, getColorGroup } from './utils/palette';
import {
  isUltimatePushFrame,
  isUltimateSendFrame,
  selectUltimateSendComputerForFrame,
  ultimatePushUnsupportedFrameMessage,
  ultimateSendUnsupportedFrameMessage,
  validateD64Framebuf
} from './utils/platformChecks';

import configureStore from './store/configureStore';

// TODO prod builds
import { electron, fs } from './utils/electronImports';
import { FileFormat, FileFormatUltPrg, RootState, ThemeMode, Tool, UltimateDetectedMode, UltimateMachineType } from './redux/types';
import {
  bucketLastContactedAt,
  classifyUltimateModeFromProbes,
} from './utils/ultimateStatus';


const store = configureStore();

// Set platform attribute for platform-specific CSS
document.documentElement.setAttribute('data-platform', electron.remote.process.platform);

const filename = electron.ipcRenderer.sendSync('get-open-args');
const startedWithScratchScreen = !filename;
if (filename) {
  // Load a .petmate file that the user clicked on Explorer (Windows only path).
  store.dispatch(ReduxRoot.actions.updateLastSavedSnapshot());
  store.dispatch(ReduxRoot.actions.openWorkspace(filename));

} else {
  // Create one screen/framebuffer so that we have a canvas to draw on
  //store.dispatch(ReduxRoot.actions.updateLastSavedSnapshot());
  const appVersion = electron.remote.app.getVersion();
  electron.ipcRenderer.send('set-title', `Petmate 9 (${appVersion}) - *New File* `)

  store.dispatch(Screens.actions.newScreenX("c64", "40x25", true));
  setTimeout(() => {
    store.dispatch(ReduxRoot.actions.updateLastSavedSnapshot());
  }, 100)


}
// Render the application


const container = document.getElementById('root')!;
const root = createRoot(container);
root.render(React.createElement(Root, { store }, null));

// --- Ultimate-status poller ----------------------------------------------
//
// We poll a configured Ultimate over its REST API every few seconds to update
// the toolbar badge.  The poller is designed to be self-healing:
//   * Each HTTP request has a hard socket timeout.
//   * A watchdog rejects the in-flight promise even if the timeout itself
//     never fires (defence in depth).
//   * `pollUltimateStatusOnce` always reschedules from `finally`, so a stuck
//     request can never wedge the loop.
//   * Polling does NOT begin until settings have been loaded — otherwise the
//     first poll would fire against the default IP (192.168.1.64) on every
//     fresh launch.
const ULTIMATE_STATUS_POLL_MS = 3000;
const ULTIMATE_STATUS_HTTP_TIMEOUT_MS = 2500;
const ULTIMATE_STATUS_WATCHDOG_MS = 4000;
let ultimateStatusPollTimer: ReturnType<typeof setTimeout> | null = null;
let ultimateStatusPollInFlight = false;
let ultimateStatusStarted = false;
let consecutiveAmbiguousMachineReads = 0;
let prevUltimateAddress = store.getState().settings.saved.ultimateAddress || '';
// `window.require` is only available inside the Electron renderer.  Cache the
// module once at module-load instead of looking it up on every poll.
const httpModule = window.require('http');

function ultimateStatusHttpGet(urlStr: string, timeoutMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(urlStr);
    } catch (e) {
      reject(e);
      return;
    }
    // Ultimate REST API only speaks plain HTTP.  We reject anything else here
    // rather than silently coercing the URL.
    if (url.protocol !== 'http:') {
      reject(new Error(`unsupported protocol: ${url.protocol}`));
      return;
    }
    const opts: any = {
      hostname: url.hostname,
      port: url.port || 80,
      path: (url.pathname || '/') + url.search,
      method: 'GET',
    };
    const req = httpModule.request(opts, (res: any) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', (err: any) => reject(err));
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`request timed out after ${timeoutMs}ms`));
    });
    req.on('error', (err: any) => reject(err));
    req.end();
  });
}

function ultimateStatusReadMem(baseUrl: string, address: number, length: number): Promise<Buffer> {
  return ultimateStatusHttpGet(
    `${baseUrl}/v1/machine:readmem?address=${address.toString(16).toUpperCase()}&length=${length}`,
    ULTIMATE_STATUS_HTTP_TIMEOUT_MS
  );
}

function setUltimateStatusIfChanged(
  ultimateOnline: boolean,
  ultimateMachineType: UltimateMachineType,
  ultimateMode: UltimateDetectedMode,
  ultimateLastContactedAt: string | null
) {
  const prev = store.getState().toolbar;
  if (
    prev.ultimateOnline === ultimateOnline &&
    prev.ultimateMachineType === ultimateMachineType &&
    prev.ultimateMode === ultimateMode &&
    prev.ultimateLastContactedAt === ultimateLastContactedAt
  ) {
    return;
  }
  store.dispatch(Toolbar.actions.setUltimateStatus({
    ultimateOnline,
    ultimateMachineType,
    ultimateMode,
    ultimateLastContactedAt
  }));
}

function scheduleUltimateStatusPoll(delayMS = ULTIMATE_STATUS_POLL_MS) {
  if (ultimateStatusPollTimer !== null) {
    clearTimeout(ultimateStatusPollTimer);
  }
  ultimateStatusPollTimer = setTimeout(() => {
    void pollUltimateStatusOnce();
  }, delayMS);
}

function triggerUltimateStatusPollNow() {
  if (ultimateStatusPollTimer !== null) {
    clearTimeout(ultimateStatusPollTimer);
    ultimateStatusPollTimer = null;
  }
  void pollUltimateStatusOnce();
}

function startUltimateStatusPolling() {
  if (ultimateStatusStarted) return;
  ultimateStatusStarted = true;
  triggerUltimateStatusPollNow();
}

async function pollUltimateStatusOnce() {
  if (ultimateStatusPollInFlight) {
    return;
  }
  ultimateStatusPollInFlight = true;
  try {
    const ultimateAddress = (store.getState().settings.saved.ultimateAddress || '').trim();
    const prevLastContactedAt = store.getState().toolbar.ultimateLastContactedAt;
    if (ultimateAddress === '') {
      setUltimateStatusIfChanged(false, null, null, prevLastContactedAt);
      return;
    }
    // Belt-and-suspenders: race the request against an outer watchdog so the
    // in-flight flag can never get stuck even if the underlying promise
    // somehow never settles.  We track the watchdog timer ID so we can
    // clearTimeout it once the race resolves — otherwise the timer would
    // linger as a zombie callback for ULTIMATE_STATUS_WATCHDOG_MS.
    let watchdogId: ReturnType<typeof setTimeout> | undefined;
    try {
      const sample = await Promise.race<{
        regs: Buffer,
        d7: Buffer,
        zp: Buffer,
        basicPtrs: Buffer
      }>([
        (async () => {
          // Keep probes intentionally small to avoid overloading Ultimate's
          // HTTP handler.  We read these sequentially for stability.
          const regs = await ultimateStatusReadMem(ultimateAddress, 0xD02F, 2);
          const d7 = await ultimateStatusReadMem(ultimateAddress, 0x00D7, 1);
          const zp = await ultimateStatusReadMem(ultimateAddress, 0x0000, 8);
          const basicPtrs = await ultimateStatusReadMem(ultimateAddress, 0x002B, 4);
          return { regs, d7, zp, basicPtrs };
        })(),
        new Promise<{
          regs: Buffer,
          d7: Buffer,
          zp: Buffer,
          basicPtrs: Buffer
        }>((_, reject) => {
          watchdogId = setTimeout(
            () => reject(new Error('watchdog timeout')),
            ULTIMATE_STATUS_WATCHDOG_MS,
          );
        }),
      ]);
      if (sample.regs.length < 2 || sample.d7.length < 1 || sample.zp.length < 8 || sample.basicPtrs.length < 4) {
        throw new Error('short read');
      }
      const result = classifyUltimateModeFromProbes(
        sample.regs[0],
        sample.regs[1],
        sample.d7[0],
        sample.zp,
        sample.basicPtrs,
        store.getState().toolbar.ultimateMachineType,
        consecutiveAmbiguousMachineReads,
      );
      consecutiveAmbiguousMachineReads = result.consecutiveAmbiguous;
      setUltimateStatusIfChanged(true, result.machineType, result.mode, bucketLastContactedAt(new Date()));
    } catch {
      setUltimateStatusIfChanged(false, null, null, prevLastContactedAt);
    } finally {
      if (watchdogId !== undefined) clearTimeout(watchdogId);
    }
  } finally {
    ultimateStatusPollInFlight = false;
    scheduleUltimateStatusPoll();
  }
}

loadSettings((j) => {
  store.dispatch(settings.actions.load(j))
  if (startedWithScratchScreen) {
    const defaultZoomLevel = Math.max(1, Math.min(8, store.getState().settings.saved.defaultZoomLevel ?? 2));
    store.dispatch(Toolbar.actions.setZoom(100 + defaultZoomLevel, 'left'));
  }
  // Restore saved separator presets into toolbar
  const savedPresets = store.getState().settings.saved.linePresets;
  if (savedPresets && savedPresets.length > 0) {
    store.dispatch(Toolbar.actions.setLinePresets(savedPresets));
  }
  // Restore saved grouped box preset map into toolbar
  const savedBoxByGroup = store.getState().settings.saved.boxPresetsByGroup;
  if (savedBoxByGroup) {
    store.dispatch(Toolbar.actions.setAllBoxPresetsByGroup(savedBoxByGroup));
  }
  // Restore saved grouped texture preset map into toolbar
  const savedTexByGroup = store.getState().settings.saved.texturePresetsByGroup;
  if (savedTexByGroup) {
    store.dispatch(Toolbar.actions.setAllTexturePresetsByGroup(savedTexByGroup));
  }
  applyTheme(store.getState().settings.saved.themeMode)
  electron.ipcRenderer.invoke('set-show-transparency-menu', store.getState().settings.saved.showTransparency)
  // Settings are loaded — keep the cached "last seen address" in sync with
  // the freshly-restored value before kicking off polling.  Without this,
  // the address-change subscriber below would treat the very first loaded
  // value as a change and fire an extra poll.
  prevUltimateAddress = store.getState().settings.saved.ultimateAddress || ''
  startUltimateStatusPolling()
})

function applyTheme(mode: ThemeMode) {
  let isDark: boolean;
  if (mode === 'system') {
    // Don't rely on CSS prefers-color-scheme (unreliable on macOS).
    // Query Electron's resolved theme and set data-theme explicitly.
    isDark = electron.remote.nativeTheme.shouldUseDarkColors;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  } else {
    isDark = mode === 'dark';
    document.documentElement.setAttribute('data-theme', mode);
  }
  // Update the theme-color meta tag so the active titlebar matches on Windows
  const meta = document.getElementById('theme-color-meta');
  if (meta) {
    meta.setAttribute('content', isDark ? '#191919' : '#ebebeb');
  }
}

// Re-apply theme whenever settings change, and sync to main process
let prevThemeMode: ThemeMode | undefined
store.subscribe(() => {
  const themeMode = store.getState().settings.saved.themeMode
  if (themeMode !== prevThemeMode) {
    prevThemeMode = themeMode
    applyTheme(themeMode)
    // Keep main process nativeTheme in sync
    electron.ipcRenderer.invoke('set-theme-source', themeMode)
  }
})

let prevShowTransparency: boolean | undefined
store.subscribe(() => {
  const showTransparency = store.getState().settings.saved.showTransparency
  if (showTransparency !== prevShowTransparency) {
    prevShowTransparency = showTransparency
    electron.ipcRenderer.invoke('set-show-transparency-menu', showTransparency)
  }
})

store.subscribe(() => {
  const nextUltimateAddress = store.getState().settings.saved.ultimateAddress || '';
  if (nextUltimateAddress !== prevUltimateAddress) {
    prevUltimateAddress = nextUltimateAddress;
    // Reset machine-type stickiness when pointing at a different host so the
    // first poll against the new host can't inherit the prior host's identity
    // through the ambiguous-read grace window.  Also clear the redux
    // ultimateMachineType so the badge doesn't briefly show a stale label.
    consecutiveAmbiguousMachineReads = 0;
    const tb = store.getState().toolbar;
    if (tb.ultimateOnline || tb.ultimateMachineType !== null) {
      store.dispatch(Toolbar.actions.setUltimateStatus({
        ultimateOnline: false,
        ultimateMachineType: null,
        ultimateMode: null,
        ultimateLastContactedAt: tb.ultimateLastContactedAt,
      }));
    }
    if (ultimateStatusStarted) {
      triggerUltimateStatusPollNow();
    }
  }
});

// When the OS theme changes (user toggles macOS/Windows appearance),
// re-evaluate the data-theme attribute if we're in 'system' mode.
electron.ipcRenderer.on('native-theme-updated', (_event: Event, shouldUseDark: boolean) => {
  const themeMode = store.getState().settings.saved.themeMode
  if (themeMode === 'system') {
    // Force re-apply: remove data-theme so the CSS media query takes effect,
    // but also set it explicitly for macOS reliability.
    document.documentElement.setAttribute('data-theme', shouldUseDark ? 'dark' : 'light')
  }
})

// --- Debounced auto-persist for preset data ---
// A single subscriber detects changes to line/box/texture presets and
// batches them into one disk write after a short delay.  This reduces
// I/O and shrinks the race window between multiple instances.
const PERSIST_DEBOUNCE_MS = 250;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPersist = { line: false, box: false, texture: false };
let prevLinePresets = store.getState().toolbar.linePresets;
let prevBoxPresetsByGroup = store.getState().toolbar.boxPresetsByGroup;
let prevTexturePresetsByGroup = store.getState().toolbar.texturePresetsByGroup;

function flushPendingPersist() {
  persistTimer = null;
  const state = store.getState().toolbar;
  if (pendingPersist.line) {
    store.dispatch(settings.actions.persistLinePresets(state.linePresets) as any);
  }
  if (pendingPersist.box) {
    store.dispatch(settings.actions.persistBoxPresetsByGroup(state.boxPresetsByGroup) as any);
  }
  if (pendingPersist.texture) {
    store.dispatch(settings.actions.persistTexturePresetsByGroup(state.texturePresetsByGroup) as any);
  }
  pendingPersist = { line: false, box: false, texture: false };
}

store.subscribe(() => {
  const tb = store.getState().toolbar;
  let changed = false;
  if (tb.linePresets !== prevLinePresets) {
    prevLinePresets = tb.linePresets;
    pendingPersist.line = true;
    changed = true;
  }
  if (tb.boxPresetsByGroup !== prevBoxPresetsByGroup) {
    prevBoxPresetsByGroup = tb.boxPresetsByGroup;
    pendingPersist.box = true;
    changed = true;
  }
  if (tb.texturePresetsByGroup !== prevTexturePresetsByGroup) {
    prevTexturePresetsByGroup = tb.texturePresetsByGroup;
    pendingPersist.texture = true;
    changed = true;
  }
  if (changed) {
    if (persistTimer !== null) clearTimeout(persistTimer);
    persistTimer = setTimeout(flushPendingPersist, PERSIST_DEBOUNCE_MS);
  }
})

// --- File-watcher: reload external Settings changes (Phase 3) ---
// Watch the Settings file for changes made by other instances.  When a
// change is detected that we didn't cause, re-read the file and merge
// non-dirty keys into our Redux state so the UI stays in sync.
const WATCH_DEBOUNCE_MS = 300;
let watchDebounce: ReturnType<typeof setTimeout> | null = null;

try {
  const settingsPath = settings.getSettingsFilePath();
  fs.watch(settingsPath, () => {
    // Skip changes caused by our own writes
    if (settings.getIgnoreNextFileChange()) {
      settings.clearIgnoreNextFileChange();
      return;
    }
    // Debounce: Windows may fire multiple events for a single write
    if (watchDebounce !== null) clearTimeout(watchDebounce);
    watchDebounce = setTimeout(() => {
      watchDebounce = null;
      try {
        const raw = fs.readFileSync(settingsPath, 'utf-8');
        const diskJson = JSON.parse(raw);
        const dirtyKeys = settings.getDirtyKeys();
        const currentSaved = store.getState().settings.saved;
        const patch: Record<string, any> = {};
        let hasChanges = false;
        for (const key of Object.keys(diskJson)) {
          // Only adopt keys we haven't locally modified
          if (!dirtyKeys.has(key) && JSON.stringify((currentSaved as any)[key]) !== JSON.stringify(diskJson[key])) {
            patch[key] = diskJson[key];
            hasChanges = true;
          }
        }
        if (!hasChanges) return;
        // Merge external changes into settings state
        store.dispatch(settings.actions.mergeExternal(patch) as any);
        // Sync toolbar preset state if those keys were externally updated
        if (patch.linePresets) {
          prevLinePresets = patch.linePresets;
          store.dispatch(Toolbar.actions.setLinePresets(patch.linePresets));
        }
        if (patch.boxPresetsByGroup) {
          prevBoxPresetsByGroup = patch.boxPresetsByGroup;
          store.dispatch(Toolbar.actions.setAllBoxPresetsByGroup(patch.boxPresetsByGroup));
        }
        if (patch.texturePresetsByGroup) {
          prevTexturePresetsByGroup = patch.texturePresetsByGroup;
          store.dispatch(Toolbar.actions.setAllTexturePresetsByGroup(patch.texturePresetsByGroup));
        }
        if (patch.themeMode) {
          applyTheme(patch.themeMode);
        }
      } catch (_e) {
        // File may be mid-write or deleted — ignore
      }
    }, WATCH_DEBOUNCE_MS);
  });
} catch (_e) {
  // fs.watch may fail if the file doesn't exist yet — that's OK
  console.warn('Could not watch Settings file for external changes');
}

/**
 * Shared helper for the Tools > Presets menu: create a new screen and fill
 * it with a preset-export framebuffer.  `kind` selects between the Boxes
 * and Textures encoders; `group` determines the platform key embedded in
 * the exported header so imports can round-trip into the correct bucket.
 */
function exportPresetsForGroup(kind: 'boxes' | 'textures', group: string) {
  const state = store.getState();
  // Use a platform-matched framebuffer spec so the exported screen uses the
  // correct ROM font (upper variant for the target group) and a background
  // that renders cleanly in that platform's palette.  For C64 exports we
  // preserve the active framebuf's bg when one exists; other platforms use
  // the neutral default from the spec.
  const spec = getExportFrameSpec(group);
  const isC64 = group === 'c64';
  const exportFg = spec.textColor;
  let fbPixels;
  let namePrefix: string;
  if (kind === 'boxes') {
    const presets = state.toolbar.boxPresetsByGroup[group] ?? [];
    if (presets.length === 0) return;
    // Pass spec.width so rows are padded to the host framebuffer width,
    // matching the dimensions we set with setDims() below.  Without this
    // the VDC 80-col frame leaves cells past col 24 undefined, which
    // crashes CharGrid during render.  forceForeground clamps cell colours
    // for non-C64 groups so PET mono (etc.) renders visibly.
    fbPixels = buildBoxesExportPixels(presets, group, exportFg, spec.width, !isC64);
    namePrefix = `Boxes_${group}_`;
  } else {
    const presets = state.toolbar.texturePresetsByGroup[group] ?? [];
    if (presets.length === 0) return;
    fbPixels = buildTexturesExportPixels(presets, group, exportFg, spec.width, !isC64);
    namePrefix = `Textures_${group}_`;
  }
  store.dispatch(Screens.actions.addScreenAndFramebuf() as any);
  store.dispatch(((innerDispatch: any, getState: any) => {
    const s = getState();
    const newIdx = screensSelectors.getCurrentScreenFramebufIndex(s);
    if (newIdx === null) return;
    const screenName = `${namePrefix}${newIdx}`;
    innerDispatch(Framebuffer.actions.setCharset(spec.charset, newIdx));
    innerDispatch(Framebuffer.actions.setDims({ width: spec.width, height: fbPixels.length }, newIdx));
    innerDispatch(Framebuffer.actions.setFields(
      {
        backgroundColor: spec.backgroundColor,
        borderColor: spec.borderColor,
        borderOn: false,
        name: screenName,
        framebuf: fbPixels,
      },
      newIdx,
    ));
    innerDispatch(Toolbar.actions.setZoom(102, 'left'));
  }) as any);
}

/** Export every platform group for the given tool (5 screens). */
function exportAllPresetsForTool(kind: 'boxes' | 'textures' | 'lines') {
  if (kind === 'lines') {
    const state = store.getState();
    const linePresets = state.toolbar.linePresets ?? [];
    if (linePresets.length === 0) return;
    const BLANK = 0x20;
    const extraRows = 10;
    const totalRows = linePresets.length + extraRows;
    const c64Spec = getExportFrameSpec('c64');
    const textColor = c64Spec.textColor;
    const fbPixels: any[] = [];
    for (let r = 0; r < totalRows; r++) {
      const row: any[] = [];
      for (let c = 0; c < 16; c++) {
        const code = r < linePresets.length ? (linePresets[r].chars[c] ?? BLANK) : BLANK;
        row.push({ code, color: textColor });
      }
      fbPixels.push(row);
    }
    store.dispatch(Screens.actions.addScreenAndFramebuf() as any);
    store.dispatch(((innerDispatch: any, getState: any) => {
      const s = getState();
      const newIdx = screensSelectors.getCurrentScreenFramebufIndex(s);
      if (newIdx === null) return;
      innerDispatch(Framebuffer.actions.setCharset('dirart', newIdx));
      innerDispatch(Framebuffer.actions.setDims({ width: 16, height: totalRows }, newIdx));
      innerDispatch(Framebuffer.actions.setFields({
        backgroundColor: c64Spec.backgroundColor,
        borderColor: c64Spec.borderColor,
        borderOn: false,
        name: `Lines_${newIdx}`,
        framebuf: fbPixels,
      }, newIdx));
      innerDispatch(Toolbar.actions.setZoom(102, 'left'));
    }) as any);
    return;
  }
  for (const group of PRESET_GROUPS) {
    exportPresetsForGroup(kind, group);
  }
}

/**
 * Scan every framebuf in the workspace and fold the Boxes_/Textures_/Lines_
 * preset exports it finds back into the grouped toolbar state.  Presets from
 * multiple frames targeting the same group are concatenated so users don't
 * silently lose data when more than one frame exists for a group.
 *
 * - Box/Texture frames route by the group key embedded in the export header;
 *   frames missing a group key fall back to the frame's own platform group
 *   (derived from charset+width).
 * - Line frames aren't grouped; imports from all Lines_ frames concatenate
 *   into a single separator preset list.
 */
function importAllPresets() {
  const isBoxPresetFrameName = (name: string | undefined) => {
    if (!name) return false;
    const normalized = name.toLowerCase();
    return normalized.startsWith('boxes_') || normalized.includes('_boxes_');
  };
  const isTexturePresetFrameName = (name: string | undefined) => {
    if (!name) return false;
    const normalized = name.toLowerCase();
    return normalized.startsWith('textures_') || normalized.includes('_textures_');
  };
  const isLinePresetFrameName = (name: string | undefined) => {
    if (!name) return false;
    const normalized = name.toLowerCase();
    return normalized.startsWith('lines_') || normalized.includes('_lines_');
  };
  const hasImportablePresets = () => {
    const state = store.getState();
    for (const entry of state.framebufList) {
      const fb = entry.present;
      if (!fb || !fb.name) continue;
      if (isBoxPresetFrameName(fb.name)) {
        const res = importBoxPresetsFromFramebuf(fb);
        if (res && res.presets.length > 0) return true;
      } else if (isTexturePresetFrameName(fb.name)) {
        const res = importTexturePresetsFromFramebuf(fb);
        if (res && res.presets.length > 0) return true;
      } else if (isLinePresetFrameName(fb.name)) {
        const res = importLinePresetsFromFramebuf(fb);
        if (res && res.presets.length > 0) return true;
      }
    }
    return false;
  };

  if (!hasImportablePresets()) return;
  store.dispatch(Toolbar.actions.setPresetDialog({
    show: true,
    type: 'import-all',
  }));
}

function clearPresetFolder(kind: 'boxes' | 'textures' | 'lines') {
  store.dispatch(Toolbar.actions.setPresetDialog({
    show: true,
    type: 'clear-presets',
    clearKind: kind,
  }));
}

function dispatchExport(fmt: FileFormat) {
  // Either open an export options modal or go to export directly if the
  // output format doesn't need any configuration.
  console.log("dispatchExport",fmt);
  if (formats[fmt.name].exportOptions) {
    console.log("setShowExport")
    store.dispatch(Toolbar.actions.setShowExport({ show: true, fmt }))
  } else {
    console.log(formats[fmt.name],formats[fmt.name].exportOptions)

    store.dispatch(ReduxRoot.actions.fileExportAs(fmt))
  }
}

electron.ipcRenderer.on('window-blur', (_event: Event, _message: any) => {
  store.dispatch(Toolbar.actions.setShortcutsActive(false))
  store.dispatch(Toolbar.actions.clearModKeyState())
});

electron.ipcRenderer.on('window-focus', (_event: Event, _message: any) => {
  store.dispatch(Toolbar.actions.setShortcutsActive(true));
  store.dispatch(Toolbar.actions.clearModKeyState());
});

window.addEventListener('focus', () => {
  store.dispatch(Toolbar.actions.setShortcutsActive(true))
  store.dispatch(Toolbar.actions.clearModKeyState())
})
window.addEventListener('blur', () => {
  store.dispatch(Toolbar.actions.setShortcutsActive(false))
  store.dispatch(Toolbar.actions.clearModKeyState())
})

electron.ipcRenderer.on('prompt-unsaved', () => {
  if (promptProceedWithUnsavedChanges(store.getState(), {
    title: 'Quit',
    detail: 'Your changes will be lost if you don\'t save them.'
  })) {
    // OK to close now, ask the main process to quit:
    electron.ipcRenderer.send('closed');
  }
});

electron.ipcRenderer.on('open-petmate-file', (_event: Event, filename: string) => {
  // Load a .petmate file that was sent to the main process via the open-file
  // event (macOS).  This can be either a double-click on a .petmate file in
  // Finder or drag&drop a .petmate file on the app icon in the task bar.
  electron.ipcRenderer.invoke('add-recent-file', filename);
  store.dispatch(ReduxRoot.actions.openWorkspace(filename));
});

// Listen to commands from the main process
electron.ipcRenderer.on('menu', (_event: Event, message: string, data?: any) => {
  switch (message) {
    case 'undo': {
      // If texture tool is active and has local undo, use that first
      const undoState = store.getState();
      if (undoState.toolbar.selectedTool === Tool.Textures) {
        const textureUndo = (window as any).__texturePopUndo;
        if (textureUndo && textureUndo()) return;
        // Fell through — clear texture redo so it doesn’t interleave with canvas redo
        const clearRedo = (window as any).__textureClearRedo;
        if (clearRedo) clearRedo();
      }
      store.dispatch(ReduxRoot.actions.undo())
      return
    }
    case 'redo': {
      const redoState = store.getState();
      if (redoState.toolbar.selectedTool === Tool.Textures) {
        const textureRedo = (window as any).__texturePopRedo;
        if (textureRedo && textureRedo()) return;
        // Fell through — clear texture undo so it doesn’t interleave with canvas undo
        const clearUndo = (window as any).__textureClearUndo;
        if (clearUndo) clearUndo();
      }
      store.dispatch(ReduxRoot.actions.redo())
      return
    }
    case 'new':
      store.dispatch((dispatch: any, getState: () => RootState) => {
        if (promptProceedWithUnsavedChanges(getState(), {
          title: 'Reset',
          detail: 'This will empty your workspace.  This cannot be undone.'
        })) {
          dispatch(ReduxRoot.actions.resetState())
          dispatch(Screens.actions.newScreen())
          dispatch(ReduxRoot.actions.updateLastSavedSnapshot());
          electron.ipcRenderer.send('set-title', `Petmate 9 (${electron.remote.app.getVersion()}) - *New File* `)


        }
      });
      return
    case 'open':
      store.dispatch(ReduxRoot.actions.fileOpenWorkspace())
      return
    case 'save-as':
      store.dispatch(ReduxRoot.actions.fileSaveAsWorkspace())
      return
    case 'save':
      store.dispatch(ReduxRoot.actions.fileSaveWorkspace())
      return
    case 'export-png':
      dispatchExport(formats.pngFile)
      return
    case 'export-seq':
      dispatchExport(formats.seqFile)
      return
    case 'export-cbase':
      dispatchExport(formats.cbaseFile)
      return
    case 'export-marq-c':
      dispatchExport(formats.cFile)
      return
    case 'export-asm':
      dispatchExport(formats.asmFile)
      return
    case 'export-prg-player':
      dispatchExport(formats.prgPlayer)
      return
    case 'export-basic':
      dispatchExport(formats.basFile)
      return
    case 'export-prg':
      dispatchExport(formats.prgFile)
      return
    case 'export-gif':
      dispatchExport(formats.gifFile)
      return
    case 'export-json':
      dispatchExport(formats.jsonFile)
      return
    case 'export-pet':
      dispatchExport(formats.petFile)
      return

    case 'export-d64': {
      const fb = selectors.getCurrentFramebuf(store.getState());
      const err = validateD64Framebuf(fb);
      if (err) {
        alert(err);
        return;
      }
      dispatchExport(formats.d64File)
      return
    }
    case 'import-d64':
      store.dispatch(ReduxRoot.actions.fileImportAppend(formats.d64File))
      return
    case 'import-marq-c':
      store.dispatch(ReduxRoot.actions.fileImportAppend(formats.cFile))
      return
    case 'import-png':
      store.dispatch(Toolbar.actions.setShowImport({ show: true, fmt: formats.pngFile }));
      return
    case 'import-seq':
      store.dispatch(ReduxRoot.actions.fileImportAppend(formats.seqFile));
      return
    case 'import-seq-adv':
      store.dispatch(Toolbar.actions.setShowImportSeqAdv({ show: true }));
      return
    case 'import-cbase':
      store.dispatch(ReduxRoot.actions.fileImportAppend(formats.cbaseFile));
      return
    case 'preferences':
      store.dispatch(Toolbar.actions.setShowSettings(true))
      return
    case 'new-screen':
      store.dispatch(Screens.actions.newScreen())
      return;
    case 'new-screen-c16':
      store.dispatch(Screens.actions.newScreenX('c16', '40x25', true))
      return;
    case 'new-screen-c128-40':
      store.dispatch(Screens.actions.newScreenX('c128', '40x25', true))
      return;
    case 'new-screen-c128-80':
      store.dispatch(Screens.actions.newScreenX('c128vdc', '80x25', true))
      return;
    case 'new-screen-vic20':
      store.dispatch(Screens.actions.newScreenX('vic20', '22x23', true))
      return;
    case 'new-screen-pet-40':
      store.dispatch(Screens.actions.newScreenX('pet', '40x25', true))
      return;
    case 'new-screen-pet-80':
      store.dispatch(Screens.actions.newScreenX('pet', '80x25', true))
      return;
    case 'new-dirart':
      store.dispatch(Screens.actions.newDirArt())
      return;
    case 'new-dirart-10':
      store.dispatch(Screens.actions.newScreenX('dirart', '16x10', false))
      return;
    case 'new-dirart-20':
      store.dispatch(Screens.actions.newScreenX('dirart', '16x20', false))
      return;
    case 'new-dirart-144':
      store.dispatch(Screens.actions.newScreenX('dirart', '16x144', false))
      return;
    case 'shift-screen-left':
      store.dispatch(Toolbar.actions.shiftHorizontal(-1))
      return;
    case 'shift-screen-right':
      store.dispatch(Toolbar.actions.shiftHorizontal(+1))
      return;
    case 'shift-screen-up':
      store.dispatch(Toolbar.actions.shiftVertical(-1))
      return;
    case 'shift-screen-down':
      store.dispatch(Toolbar.actions.shiftVertical(+1))
      return;
    case 'paste-text':
      store.dispatch(Toolbar.actions.pasteText())
      return;
    case 'toggle-border':
      store.dispatch(Toolbar.actions.toggleBorder())
      return;
    case 'toggle-grid':
      store.dispatch(Toolbar.actions.toggleGrid())

      return;
    case 'toggle-show-transparency': {
      const next = typeof data === 'boolean'
        ? data
        : !store.getState().settings.saved.showTransparency;
      store.dispatch(settings.actions.applyShowTransparencyImmediate(next) as any);
      return;
    }
    case 'crop-screen':
      store.dispatch(Toolbar.actions.resizeDims())
      store.dispatch(Toolbar.actions.setShowResizeSettings(true))
      return;
    case 'convert-mono':
      store.dispatch(Toolbar.actions.convertToMono())
      store.dispatch(Toolbar.actions.setColor(1))
      return;
      case 'convert-strip8':
        store.dispatch(Toolbar.actions.strip8())
        store.dispatch(Toolbar.actions.setColor(1))
        return;
    case 'clear-screen':
      store.dispatch(Toolbar.actions.clearCanvas())

      return;
    case 'zoom-in-left':
      store.dispatch(Toolbar.actions.setZoom(1, 'left'))
      return;
    case 'zoom-out-left':
      store.dispatch(Toolbar.actions.setZoom(-1, 'left'))
      return;
    case 'align-frames-2x':
      store.dispatch(Toolbar.actions.setAllZoom(102, 'left'))
      return;
    case 'zoom-2x-left':
      store.dispatch(Toolbar.actions.setZoom(102, 'left'))
      return;
    case 'zoom-1x-left':
      store.dispatch(Toolbar.actions.setZoom(101, 'left'))
      return;
    case 'shift-frame-left':
      store.dispatch(Screens.actions.moveScreen(-1))

      return;
    case 'shift-frame-right':
      store.dispatch(Screens.actions.moveScreen(1))

      return;
    case 'duplicate-frame':
      store.dispatch(Screens.actions.cloneScreen(-1))
      return;
    case 'remove-frame':
      store.dispatch(Screens.actions.removeScreen(-1))
      return;
    case 'custom-fonts':
      store.dispatch(Toolbar.actions.setShowCustomFonts(true))
      return;
    case 'selection-select-all':
      store.dispatch(Toolbar.actions.selectAll())
      store.dispatch(Toolbar.actions.setSelectedTool(Tool.Brush))
      return;
    case 'selection-paste-new':
      store.dispatch(Toolbar.actions.brushToNew())
      //Fix
      return;
    case 'copy-frame':
      store.dispatch(Toolbar.actions.copyCurrentFrame())
      console.log("Copy Current Frame to Clipboard")
      return;
    case 'copy-png':
      store.dispatch(Toolbar.actions.copyCurrentFrameAsPNG())
      console.log("Copy Current Frame to Clipboard as PNG")
      return;
    case 'paste-frame':
      store.dispatch(Toolbar.actions.pasteFrame())
      console.log("Paste After Current Frame")
      return;
    case 'send-ultimate': {
      const fb = selectors.getCurrentFramebuf(store.getState());
      if (!isUltimateSendFrame(fb)) {
        alert(ultimateSendUnsupportedFrameMessage(fb));
        return;
      }
      const toolbarState = store.getState().toolbar;
      const targetComputer = selectUltimateSendComputerForFrame(
        fb,
        toolbarState.ultimateMachineType,
        toolbarState.ultimateMode,
      );
      const baseUltFmt = formats.ultFile as FileFormatUltPrg;
      const ultFmt: FileFormatUltPrg = {
        ...baseUltFmt,
        exportOptions: { computer: targetComputer },
      };
      dispatchExport(ultFmt)
      //store.dispatch(Toolbar.actions.sendUltimate())
      console.log("POST c64 Binary to Ultimate IP")
      return;
    }
    case 'import-ultimate':
      store.dispatch(ReduxRoot.actions.importFromUltimate())
      return;
    case 'push-ultimate': {
      const fb = selectors.getCurrentFramebuf(store.getState());
      if (!isUltimatePushFrame(fb)) {
        alert(ultimatePushUnsupportedFrameMessage(fb));
        return;
      }
      store.dispatch(ReduxRoot.actions.pushToUltimate())
      return;
    }
    case 'import-charset-ultimate':
      store.dispatch(ReduxRoot.actions.importCharsetFromUltimate())
      return;
    case 'play-sid-ultimate':
      store.dispatch(ReduxRoot.actions.playSidOnUltimate())
      return;
    case 'reset-ultimate':
      store.dispatch(ReduxRoot.actions.resetUltimate())
      return;
    case 'send-test-pattern-ultimate':
      store.dispatch(ReduxRoot.actions.sendTestPatternToUltimate())
      return;
    case 'export-d64-ultimate': {
      const fb = selectors.getCurrentFramebuf(store.getState());
      const err = validateD64Framebuf(fb);
      if (err) {
        alert(err);
        return;
      }
      store.dispatch(ReduxRoot.actions.exportD64ToUltimate())
      return;
    }
    case 'send-default':
      store.dispatch(Toolbar.actions.sendDefault())
      console.log("Send c64 PRG to default Application")
      return;





    case 'selection-clear':
      store.dispatch(Toolbar.actions.resetBrush())
      return;
    case 'selection-rotate-left':
      store.dispatch(Toolbar.actions.rotateBrush(-1))
      return;
    case 'selection-rotate-right':
      store.dispatch(Toolbar.actions.rotateBrush(1))
      return;
    case 'selection-flip-h':
      store.dispatch(Toolbar.actions.mirrorBrush(-1))
      return;
    case 'selection-flip-v':
      store.dispatch(Toolbar.actions.mirrorBrush(1))
      return;
    case 'selection-invert':
      store.dispatch(Toolbar.actions.invertBrush())
      return;
    case 'open-recent-file':
      if (data) {
        electron.ipcRenderer.invoke('add-recent-file', data);
        store.dispatch(ReduxRoot.actions.openWorkspace(data));
      }
      return;
    case 'clear-recent-files':
      electron.ipcRenderer.invoke('clear-recent-files');
      return;
    case 'set-theme':
      if (data === 'dark' || data === 'light' || data === 'system') {
        store.dispatch(settings.actions.applyThemeImmediate(data) as any);
      }
      return;

    // ---- Tools > Presets export commands ----
    case 'export-presets-boxes-all':
      exportAllPresetsForTool('boxes');
      return;
    case 'export-presets-lines-all':
      exportAllPresetsForTool('lines');
      return;
    case 'export-presets-textures-all':
      exportAllPresetsForTool('textures');
      return;
    case 'export-presets-all':
      exportAllPresetsForTool('boxes');
      exportAllPresetsForTool('lines');
      exportAllPresetsForTool('textures');
      return;
    case 'clear-presets-boxes':
      clearPresetFolder('boxes');
      return;
    case 'clear-presets-lines':
      clearPresetFolder('lines');
      return;
    case 'clear-presets-textures':
      clearPresetFolder('textures');
      return;
    case 'import-all-presets':
      importAllPresets();
      return;

    default:
      // Per-platform preset export commands, e.g. export-presets-boxes-c64
      // or export-presets-textures-pet.  Falling through here avoids having
      // to enumerate every (tool, group) combination explicitly.
      if (typeof message === 'string' && message.startsWith('export-presets-')) {
        const parts = message.split('-');
        // ['export', 'presets', '<tool>', '<group...>']
        if (parts.length >= 4) {
          const tool = parts[2];
          const group = parts.slice(3).join('-');
          if ((tool === 'boxes' || tool === 'textures') && PRESET_GROUPS.includes(group as any)) {
            exportPresetsForGroup(tool, group);
            return;
          }
        }
      }
      console.warn('unknown message from main process', message)
  }

})
