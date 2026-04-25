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
import { getColorGroup } from './utils/palette';
import {
  isC64Frame,
  ultimateOnlyC64Message,
  validateD64Framebuf
} from './utils/platformChecks';

import configureStore from './store/configureStore';

// TODO prod builds
import { electron, fs } from './utils/electronImports';
import { BoxPreset, BoxSide, DEFAULT_TEXTURE_OPTIONS, FileFormat, LinePreset, RootState, TexturePreset, ThemeMode, Tool, UltimateMachineType } from './redux/types';


const store = configureStore();

// Set platform attribute for platform-specific CSS
document.documentElement.setAttribute('data-platform', electron.remote.process.platform);

const filename = electron.ipcRenderer.sendSync('get-open-args');
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
    store.dispatch(Toolbar.actions.setZoom(102, 'left'))
    store.dispatch(ReduxRoot.actions.updateLastSavedSnapshot());
  }, 100)


}
// Render the application


const container = document.getElementById('root')!;
const root = createRoot(container);
root.render(React.createElement(Root, { store }, null));
const ULTIMATE_STATUS_POLL_MS = 3000;
let ultimateStatusPollTimer: ReturnType<typeof setTimeout> | null = null;
let ultimateStatusPollInFlight = false;
let prevUltimateAddress = store.getState().settings.saved.ultimateAddress || '';

function ultimateStatusHttpGet(urlStr: string): Promise<Buffer> {
  const http = window.require('http');
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const opts: any = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: 'GET',
    };
    const req = http.request(opts, (res: any) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', (err: any) => reject(err));
    req.end();
  });
}

function ultimateStatusReadMem(baseUrl: string, address: number, length: number): Promise<Buffer> {
  return ultimateStatusHttpGet(
    `${baseUrl}/v1/machine:readmem?address=${address.toString(16).toUpperCase()}&length=${length}`
  );
}

function classifyUltimateMachineType(
  d02f: number,
  d030: number,
  prevMachineType: UltimateMachineType
): UltimateMachineType {
  const d02fReg = d02f & 0xFF;
  const d030Reg = d030 & 0xFF;

  // On a C64, VIC-IIe extension registers are unmapped and commonly read as $FF.
  // On a C128 these registers are real and the low control bits can vary.
  // If we ever already confirmed C128, keep that classification on a transient
  // all-$FF sample so the badge does not disappear or flip unexpectedly.
  if (d02fReg === 0xFF && d030Reg === 0xFF) {
    return prevMachineType === 'c128' ? 'c128' : 'c64';
  }

  const d02fLooksVicIIe = (d02fReg & 0xF8) === 0xF8;
  const d030LooksVicIIe = (d030Reg & 0xFC) === 0xFC;
  if (d02fLooksVicIIe && d030LooksVicIIe) return 'c128';

  // Default to C64 so connectivity still surfaces as a usable ULT/64 badge.
  return 'c64';
}

function setUltimateStatusIfChanged(
  ultimateOnline: boolean,
  ultimateMachineType: UltimateMachineType,
  ultimateLastContactedAt: string | null
) {
  const prev = store.getState().toolbar;
  if (
    prev.ultimateOnline === ultimateOnline &&
    prev.ultimateMachineType === ultimateMachineType &&
    prev.ultimateLastContactedAt === ultimateLastContactedAt
  ) {
    return;
  }
  store.dispatch(Toolbar.actions.setUltimateStatus({
    ultimateOnline,
    ultimateMachineType,
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

async function pollUltimateStatusOnce() {
  if (ultimateStatusPollInFlight) {
    return;
  }
  ultimateStatusPollInFlight = true;
  try {
    const ultimateAddress = (store.getState().settings.saved.ultimateAddress || '').trim();
    const prevLastContactedAt = store.getState().toolbar.ultimateLastContactedAt;
    if (ultimateAddress === '') {
      setUltimateStatusIfChanged(false, null, prevLastContactedAt);
      return;
    }
    try {
      const regs = await ultimateStatusReadMem(ultimateAddress, 0xD02F, 2);
      if (regs.length < 2) {
        throw new Error('short read');
      }
      const machineType = classifyUltimateMachineType(
        regs[0],
        regs[1],
        store.getState().toolbar.ultimateMachineType
      );
      setUltimateStatusIfChanged(true, machineType, new Date().toISOString());
    } catch {
      setUltimateStatusIfChanged(false, null, prevLastContactedAt);
    }
  } finally {
    ultimateStatusPollInFlight = false;
    scheduleUltimateStatusPoll();
  }
}

loadSettings((j) => {
  store.dispatch(settings.actions.load(j))
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
  triggerUltimateStatusPollNow()
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

store.subscribe(() => {
  const nextUltimateAddress = store.getState().settings.saved.ultimateAddress || '';
  if (nextUltimateAddress !== prevUltimateAddress) {
    prevUltimateAddress = nextUltimateAddress;
    triggerUltimateStatusPollNow();
  }
});

scheduleUltimateStatusPoll(1000);

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
  // For C64 we use the user's selected foreground + preset colours; for
  // other platforms we clamp every cell to the group's valid fg slot so
  // PET (mono) and TED/VIC/VDC frames render something visible.
  const exportFg = isC64 ? state.toolbar.textColor : spec.textColor;
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
  const currentFb = selectors.getCurrentFramebuf(state);
  const backgroundColor = group === 'c64'
    ? (currentFb?.backgroundColor ?? spec.backgroundColor)
    : spec.backgroundColor;
  store.dispatch(Screens.actions.addScreenAndFramebuf() as any);
  store.dispatch(((innerDispatch: any, getState: any) => {
    const s = getState();
    const newIdx = screensSelectors.getCurrentScreenFramebufIndex(s);
    if (newIdx === null) return;
    const screenName = `${namePrefix}${newIdx}`;
    innerDispatch(Framebuffer.actions.setFields(
      { backgroundColor, borderColor: backgroundColor, borderOn: false, name: screenName },
      newIdx,
    ));
    innerDispatch(Framebuffer.actions.setCharset(spec.charset, newIdx));
    innerDispatch(Framebuffer.actions.setDims({ width: spec.width, height: fbPixels.length }, newIdx));
    innerDispatch(Framebuffer.actions.setFields({ framebuf: fbPixels }, newIdx));
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
    const textColor = state.toolbar.textColor;
    const currentFb = selectors.getCurrentFramebuf(state);
    const backgroundColor = currentFb?.backgroundColor ?? 0;
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
      innerDispatch(Framebuffer.actions.setFields({
        backgroundColor,
        borderColor: backgroundColor,
        borderOn: false,
        name: `Lines_${newIdx}`
      }, newIdx));
      innerDispatch(Framebuffer.actions.setCharset('dirart', newIdx));
      innerDispatch(Framebuffer.actions.setDims({ width: 16, height: totalRows }, newIdx));
      innerDispatch(Framebuffer.actions.setFields({ framebuf: fbPixels }, newIdx));
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
  const dedupeBy = <T,>(list: T[], keyFn: (item: T) => string): T[] => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const item of list) {
      const key = keyFn(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  };
  const modeMerge = window.confirm(
    'Bulk import presets mode:\nOK = merge imported presets with current presets.\nCancel = replace current presets with imported presets (duplicates removed).'
  );
  const state = store.getState();
  const boxByGroup: Record<string, BoxPreset[]> = {};
  const textureByGroup: Record<string, TexturePreset[]> = {};
  let linePresets: LinePreset[] = [];
  for (const entry of state.framebufList) {
    const fb = entry.present;
    if (!fb || !fb.name) continue;
    if (fb.name.startsWith('Boxes_')) {
      const res = importBoxPresetsFromFramebuf(fb);
      if (!res) continue;
      const group = res.group ?? getColorGroup(fb.charset, fb.width);
      boxByGroup[group] = [...(boxByGroup[group] ?? []), ...res.presets];
    } else if (fb.name.startsWith('Textures_')) {
      const res = importTexturePresetsFromFramebuf(fb);
      if (!res) continue;
      const group = res.group ?? getColorGroup(fb.charset, fb.width);
      textureByGroup[group] = [...(textureByGroup[group] ?? []), ...res.presets];
    } else if (fb.name.startsWith('Lines_')) {
      const res = importLinePresetsFromFramebuf(fb);
      if (!res) continue;
      linePresets = [...linePresets, ...res.presets];
    }
  }

  const importedAnything =
    Object.keys(boxByGroup).length > 0 ||
    Object.keys(textureByGroup).length > 0 ||
    linePresets.length > 0;
  if (!importedAnything) return;

  for (const [group, presets] of Object.entries(boxByGroup)) {
    const existing = state.toolbar.boxPresetsByGroup[group] ?? [];
    const next = modeMerge
      ? dedupeBy([...existing, ...presets], (p) => JSON.stringify(p))
      : dedupeBy(presets, (p) => JSON.stringify(p));
    store.dispatch(Toolbar.actions.setBoxPresetsForGroup(group, next));
  }
  for (const [group, presets] of Object.entries(textureByGroup)) {
    const existing = state.toolbar.texturePresetsByGroup[group] ?? [];
    const next = modeMerge
      ? dedupeBy([...existing, ...presets], (p) => JSON.stringify(p))
      : dedupeBy(presets, (p) => JSON.stringify(p));
    store.dispatch(Toolbar.actions.setTexturePresetsForGroup(group, next));
  }
  if (linePresets.length > 0) {
    const existing = state.toolbar.linePresets ?? [];
    const importedDeduped = dedupeBy(linePresets, (p) => JSON.stringify(p.chars));
    const merged = modeMerge
      ? dedupeBy([...existing, ...importedDeduped], (p) => JSON.stringify(p.chars))
      : importedDeduped;
    const renamed = merged.map((p, i) => ({ ...p, name: `Line ${i + 1}` }));
    store.dispatch(Toolbar.actions.setLinePresets(renamed));
    store.dispatch(Toolbar.actions.setSelectedLinePresetIndex(0));
  }

  // Reset selection to the first preset of each tool whose active-group
  // list just changed so the UI never points past the end of the new list.
  const activeGroup = selectors.getActivePresetGroup(store.getState());
  if (boxByGroup[activeGroup]) {
    store.dispatch(Toolbar.actions.setSelectedBoxPresetIndex(0));
  }
  if (textureByGroup[activeGroup]) {
    store.dispatch(Toolbar.actions.setSelectedTexturePresetIndex(0));
  }
}

function clearPresetFolder(kind: 'boxes' | 'textures' | 'lines') {
  if (kind === 'lines') {
    const blank: LinePreset = { name: 'Line 1', chars: Array(16).fill(0x20) };
    store.dispatch(Toolbar.actions.setLinePresets([blank]));
    store.dispatch(Toolbar.actions.setSelectedLinePresetIndex(0));
    return;
  }
  if (kind === 'boxes') {
    const side: BoxSide = {
      chars: [0x20],
      colors: [14],
      mirror: false,
      stretch: false,
      repeat: true,
      startEnd: 'none',
    };
    const blank: BoxPreset = {
      name: 'Box 1',
      corners: [0x20, 0x20, 0x20, 0x20],
      cornerColors: [14, 14, 14, 14],
      top: { ...side },
      bottom: { ...side },
      left: { ...side },
      right: { ...side },
      fill: 256,
      fillColor: 14,
    };
    const group = selectors.getActivePresetGroup(store.getState());
    store.dispatch(Toolbar.actions.setBoxPresetsForGroup(group, [blank]));
    store.dispatch(Toolbar.actions.setSelectedBoxPresetIndex(0));
    return;
  }
  const blank: TexturePreset = {
    name: 'Texture 1',
    chars: [0x20],
    colors: [14],
    options: [...DEFAULT_TEXTURE_OPTIONS],
    random: false,
    brushWidth: 8,
    brushHeight: 8,
  } as TexturePreset;
  const group = selectors.getActivePresetGroup(store.getState());
  store.dispatch(Toolbar.actions.setTexturePresetsForGroup(group, [blank]));
  store.dispatch(Toolbar.actions.setSelectedTexturePresetIndex(0));
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
      if (!isC64Frame(fb)) {
        alert(ultimateOnlyC64Message(fb));
        return;
      }
      dispatchExport(formats.ultFile)
      //store.dispatch(Toolbar.actions.sendUltimate())
      console.log("POST c64 Binary to Ultimate IP")
      return;
    }
    case 'import-ultimate':
      store.dispatch(ReduxRoot.actions.importFromUltimate())
      return;
    case 'push-ultimate': {
      const fb = selectors.getCurrentFramebuf(store.getState());
      if (!isC64Frame(fb)) {
        alert(ultimateOnlyC64Message(fb));
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
