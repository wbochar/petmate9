
import { Action } from 'redux'
import { ThunkAction } from 'redux-thunk';

import { electron, path, fs } from '../utils/electronImports'

import {
  Settings as RSettings,
  EditSaved,
  EditBranch,
  PaletteName,
  vic20PaletteName,
  petPaletteName,
  tedPaletteName,
  ColorSortMode,
  ThemeMode,
  ShiftDrawingMode,
  EmulatorPaths,
  RootState,
  SettingsJson,
  LinePreset,
  BoxPreset,
  TexturePreset,
  ConvertSettings,
  CustomFadeSource,
  FadePresetToggles,
} from './types'
import {
  defaultLinePresets,
  defaultCustomFadeSources,
  defaultFadeSourceToggles,
  buildGroupedBoxPresets,
  buildGroupedTexturePresets,
  normalizeGroupedBoxPresets,
  normalizeGroupedTexturePresets,
} from './toolbar'
import { ActionsUnion, DispatchPropsFromActions, createAction } from './typeUtils'

import * as fp from '../utils/fp'

const LOAD = 'LOAD'
const SET_PALETTE = 'SET_PALETTE'
const SET_VIC20_PALETTE = 'SET_VIC20_PALETTE'
const SET_PET_PALETTE = 'SET_PET_PALETTE'
const SAVE_EDITS = 'SAVE_EDITS'
const CANCEL_EDITS = 'CANCEL_EDITS'
const SET_SELECTED_COLOR_PALETTE = 'SET_SELECTED_COLOR_PALETTE'
const SET_SELECTED_VIC20_COLOR_PALETTE = 'SET_SELECTED_VIC20_COLOR_PALETTE'
const SET_SELECTED_PET_COLOR_PALETTE = 'SET_SELECTED_PET_COLOR_PALETTE'
const SET_INTEGER_SCALE = 'SET_INTEGER_SCALE'
const SET_ULTIMATE_ADDRESS = 'SET_ULTIMATE_ADDRESS'
const SET_ULTIMATE_PRESETS = 'SET_ULTIMATE_PRESETS'
const SET_COLOR_SORT_MODE = 'SET_COLOR_SORT_MODE'
const SET_SHOW_COLOR_NUMBERS = 'SET_SHOW_COLOR_NUMBERS'
const SET_THEME_MODE = 'SET_THEME_MODE'
const SET_SHIFT_DRAWING_MODE = 'SET_SHIFT_DRAWING_MODE'
const SET_EMULATOR_PATH = 'SET_EMULATOR_PATH'
const SET_LINE_PRESETS_SETTING = 'SET_LINE_PRESETS_SETTING'
const SET_BOX_PRESETS_BY_GROUP_SETTING = 'SET_BOX_PRESETS_BY_GROUP_SETTING'
const SET_SCROLL_ZOOM_SENSITIVITY = 'SET_SCROLL_ZOOM_SENSITIVITY'
const SET_PINCH_ZOOM_SENSITIVITY = 'SET_PINCH_ZOOM_SENSITIVITY'
const SET_DEFAULT_ZOOM_LEVEL = 'SET_DEFAULT_ZOOM_LEVEL'
const SET_DEFAULT_BORDER_ON = 'SET_DEFAULT_BORDER_ON'
const SET_CONVERT_SETTINGS = 'SET_CONVERT_SETTINGS'
const SET_CHAR_PANEL_BG_MODE = 'SET_CHAR_PANEL_BG_MODE'
const SET_CUSTOM_FADE_SOURCES = 'SET_CUSTOM_FADE_SOURCES'
const SET_FADE_SOURCE_TOGGLES = 'SET_FADE_SOURCE_TOGGLES'
const SET_TEXTURE_PRESETS_BY_GROUP_SETTING = 'SET_TEXTURE_PRESETS_BY_GROUP_SETTING'
const MERGE_EXTERNAL = 'MERGE_EXTERNAL'

//const CONFIG_FILE_VERSION = 1

const WINDOWS_DEV_VICE_BIN = 'C:\\C64\\VICE\\bin';

function getDefaultEmulatorPaths(): EmulatorPaths {
  const empty: EmulatorPaths = {
    c64: '',
    c128: '',
    pet4032: '',
    pet8032: '',
    vic20: '',
    c16: '',
  };
  if (process.platform !== 'win32') {
    return empty;
  }
  if (electron.remote.app.isPackaged) {
    return empty;
  }
  return {
    c64: path.join(WINDOWS_DEV_VICE_BIN, 'x64sc.exe'),
    c128: path.join(WINDOWS_DEV_VICE_BIN, 'x128.exe'),
    pet4032: path.join(WINDOWS_DEV_VICE_BIN, 'xpet.exe'),
    pet8032: path.join(WINDOWS_DEV_VICE_BIN, 'xpet.exe'),
    vic20: path.join(WINDOWS_DEV_VICE_BIN, 'xvic.exe'),
    c16: path.join(WINDOWS_DEV_VICE_BIN, 'xplus4.exe'),
  };
}

const defaultEmulatorPaths: EmulatorPaths = getDefaultEmulatorPaths();

const defaultConvertSettings: ConvertSettings = {
  selectedTool: 'petmate9',
  forceBackgroundColor: false,
  petsciiator: {
    dithering: true,
  },
  img2petscii: {
    matcherMode: 'slow',
    monoMode: false,
    monoThreshold: 128,
  },
  petmate9: {
    ditherMode: 'floyd-steinberg',
    ssimWeight: 50,
  },
};

export { normalizeUltimatePresets, normalizeUltimateUrl } from '../utils/ultimateAddress';
import {
  normalizeUltimatePresets as _normalizeUltimatePresets,
  normalizeUltimateUrl as _normalizeUltimateUrl,
} from '../utils/ultimateAddress';

const defaultUltimateAddress = 'http://192.168.1.64';
const initialState: RSettings = {
  palettes: fp.mkArray(4, () => fp.mkArray(16, i => i)),
  vic20palettes: fp.mkArray(2, () => fp.mkArray(16, i => i)),
  petpalettes: fp.mkArray(3, () => fp.mkArray(16, i => i)),
  selectedColorPalette: 'petmate',
  selectedVic20ColorPalette: 'vic20ntsc',
  selectedPetColorPalette: 'petwhite',
  selectedTedColorPalette: 'tedPAL' as tedPaletteName,
  integerScale: false,
  ultimateAddress: defaultUltimateAddress,
  ultimatePresets: [defaultUltimateAddress],
  colorSortMode: 'default' as ColorSortMode,
  showColorNumbers: false,
  themeMode: 'system' as ThemeMode,
  shiftDrawingMode: 'axisLock' as ShiftDrawingMode,
  emulatorPaths: defaultEmulatorPaths,
  linePresets: defaultLinePresets,
  boxPresetsByGroup: buildGroupedBoxPresets(),
  scrollZoomSensitivity: 5,
  pinchZoomSensitivity: 5,
  defaultZoomLevel: 2,
  defaultBorderOn: true,
  convertSettings: defaultConvertSettings,
  charPanelBgMode: 'document' as 'document' | 'global',
  customFadeSources: defaultCustomFadeSources,
  fadeSourceToggles: defaultFadeSourceToggles,
  texturePresetsByGroup: buildGroupedTexturePresets(),
}

// --- Dirty key tracking for multi-instance safety ---
// Tracks which top-level Settings keys this instance has modified since the
// last disk write.  Kept outside Redux to avoid polluting the state tree.
const _dirtyKeys = new Set<string>();

function markDirty(...keys: (keyof RSettings)[]) {
  for (const k of keys) _dirtyKeys.add(k);
}

/** Clear dirty keys after a successful write. */
function clearDirty() {
  _dirtyKeys.clear();
}

/** Expose dirty keys for the file-watcher (Phase 3). */
export function getDirtyKeys(): ReadonlySet<string> {
  return _dirtyKeys;
}

/** Return the path to the Settings file on disk. */
export function getSettingsFilePath(): string {
  return path.join(electron.remote.app.getPath('userData'), 'Settings');
}

/**
 * Flag set before our own writes so the file-watcher can ignore them.
 * Exported via getter/setter so index.ts can read and clear it.
 */
let _ignoreNextFileChange = false;
export function getIgnoreNextFileChange(): boolean { return _ignoreNextFileChange; }
export function clearIgnoreNextFileChange(): void { _ignoreNextFileChange = false; }

/**
 * Read-merge-write: re-read the Settings file from disk, overlay only the
 * keys this instance has changed, and write the merged result back.
 * This prevents one instance from silently overwriting another instance's
 * changes to unrelated keys.
 */
function mergeAndSaveSettings(localState: RSettings) {
  const settingsFile = path.join(electron.remote.app.getPath('userData'), 'Settings');
  let diskState: Record<string, any> = {};
  try {
    if (fs.existsSync(settingsFile)) {
      diskState = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    }
  } catch (_e) {
    // If we can't read disk state, fall back to full overwrite
  }

  if (_dirtyKeys.size === 0) {
    // Nothing changed — full overwrite (legacy path, e.g. first save)
    _ignoreNextFileChange = true;
    fs.writeFileSync(settingsFile, JSON.stringify(localState), 'utf-8');
    return;
  }

  const merged: Record<string, any> = { ...diskState };
  for (const key of _dirtyKeys) {
    merged[key] = (localState as any)[key];
  }
  _ignoreNextFileChange = true;
  fs.writeFileSync(settingsFile, JSON.stringify(merged), 'utf-8');
  clearDirty();
}

/** Legacy full-overwrite save (used only by saveEdits which diffs all keys). */
function saveSettingsFull(settings: RSettings) {
  const settingsFile = path.join(electron.remote.app.getPath('userData'), 'Settings');
  _ignoreNextFileChange = true;
  fs.writeFileSync(settingsFile, JSON.stringify(settings), 'utf-8');
  clearDirty();
}

// Load settings from a JSON doc.  Handle version upgrades.
function fromJson(json: SettingsJson): RSettings {
  let version = undefined
  if (json.version === undefined || json.version === 1) {
    version = 1
  }
  if (version !== 1) {
    console.error('TODO upgrade settings format!')
  }
  const init = initialState
  // Apply scheme normalization at load time so legacy `https://` saves don't
  // silently disable the strict-http poller.  The Ultimate REST API only
  // speaks plain HTTP, so we rewrite `https://` to `http://` here as well.
  const rawLoadedAddress = json.ultimateAddress === undefined ? init.ultimateAddress : json.ultimateAddress;
  const loadedUltimateAddress = _normalizeUltimateUrl(rawLoadedAddress);
  const loadedUltimatePresetsRaw = Array.isArray(json.ultimatePresets)
    ? json.ultimatePresets.map((p) => typeof p === 'string' ? _normalizeUltimateUrl(p) : p)
    : [];
  let loadedUltimatePresets = _normalizeUltimatePresets(
    loadedUltimatePresetsRaw.length > 0
      ? loadedUltimatePresetsRaw
      : (loadedUltimateAddress !== '' ? [loadedUltimateAddress] : [])
  );
  if (loadedUltimateAddress !== '' && !loadedUltimatePresets.includes(loadedUltimateAddress)) {
    loadedUltimatePresets = [loadedUltimateAddress, ...loadedUltimatePresets];
  }
  return {
    palettes: json.palettes === undefined ? init.palettes : json.palettes,
    vic20palettes: json.vic20palettes === undefined ? init.vic20palettes : json.vic20palettes,
    petpalettes: json.petpalettes === undefined ? init.petpalettes : json.petpalettes,
    selectedColorPalette: json.selectedColorPalette === undefined ? init.selectedColorPalette : json.selectedColorPalette,
    selectedVic20ColorPalette: json.selectedVic20ColorPalette === undefined ? init.selectedVic20ColorPalette : json.selectedVic20ColorPalette,
    selectedPetColorPalette: json.selectedPetColorPalette === undefined ? init.selectedPetColorPalette : json.selectedPetColorPalette,
    selectedTedColorPalette: json.selectedTedColorPalette === undefined ? init.selectedTedColorPalette : json.selectedTedColorPalette,
    ultimateAddress: loadedUltimateAddress,
    ultimatePresets: loadedUltimatePresets,
    integerScale: fp.maybeDefault(json.integerScale, false),
    colorSortMode: json.colorSortMode === undefined ? init.colorSortMode : json.colorSortMode,
    showColorNumbers: json.showColorNumbers === undefined ? init.showColorNumbers : json.showColorNumbers,
    themeMode: json.themeMode === undefined ? init.themeMode : json.themeMode,
    shiftDrawingMode: json.shiftDrawingMode === undefined ? init.shiftDrawingMode : json.shiftDrawingMode,
    emulatorPaths: json.emulatorPaths === undefined ? init.emulatorPaths : { ...init.emulatorPaths, ...json.emulatorPaths },
    linePresets: json.linePresets === undefined ? init.linePresets : json.linePresets,
    // Boxes: prefer grouped map; migrate legacy flat `boxPresets` into every group if present.
    boxPresetsByGroup: json.boxPresetsByGroup !== undefined
      ? normalizeGroupedBoxPresets(json.boxPresetsByGroup)
      : (json.boxPresets !== undefined
          ? buildGroupedBoxPresets(json.boxPresets)
          : init.boxPresetsByGroup),
    scrollZoomSensitivity: json.scrollZoomSensitivity === undefined ? init.scrollZoomSensitivity : json.scrollZoomSensitivity,
    pinchZoomSensitivity: json.pinchZoomSensitivity === undefined ? init.pinchZoomSensitivity : json.pinchZoomSensitivity,
    defaultZoomLevel: json.defaultZoomLevel === undefined ? init.defaultZoomLevel : Math.max(1, Math.min(8, json.defaultZoomLevel)),
    defaultBorderOn: json.defaultBorderOn === undefined ? init.defaultBorderOn : json.defaultBorderOn,
    convertSettings: json.convertSettings === undefined ? init.convertSettings : { ...init.convertSettings, ...json.convertSettings },
    charPanelBgMode: json.charPanelBgMode === undefined ? init.charPanelBgMode : json.charPanelBgMode,
    customFadeSources: (json.customFadeSources ?? init.customFadeSources).map((cs: any) =>
      cs.id ? cs : { ...cs, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }
    ),
    fadeSourceToggles: json.fadeSourceToggles ?? init.fadeSourceToggles,
    // Textures: prefer grouped map; migrate legacy flat `texturePresets` into every group if present.
    texturePresetsByGroup: json.texturePresetsByGroup !== undefined
      ? normalizeGroupedTexturePresets(json.texturePresetsByGroup)
      : (json.texturePresets !== undefined
          ? buildGroupedTexturePresets(json.texturePresets)
          : init.texturePresetsByGroup),
  }
}

function saveEdits (): ThunkAction<void, RootState, undefined, Action> {
  return (dispatch, getState) => {
    // Diff editing vs saved to mark all changed keys dirty before saving
    const before = getState().settings.saved;
    const editing = getState().settings.editing;
    for (const key of Object.keys(editing) as (keyof RSettings)[]) {
      if (editing[key] !== before[key]) {
        markDirty(key);
      }
    }
    dispatch(actions.saveEditsAction());
    dispatch((_dispatch, getState2) => {
      const state = getState2().settings;
      // Settings dialog touches many keys — do a full read-merge-write
      mergeAndSaveSettings(state.saved);
    })
  }
}

interface BranchArgs {
  branch: EditBranch;
}

interface SetPaletteArgs extends BranchArgs {
  idx: number;
  palette: number[];
}
interface SetVic20PaletteArgs extends BranchArgs {
  idx: number;
  palette: number[];
}
interface SetPetPaletteArgs extends BranchArgs {
  idx: number;
  palette: number[];
}
interface SetSelectedColorPaletteNameArgs extends BranchArgs {
  name: PaletteName;
}
interface SetVic20SelectedColorPaletteNameArgs extends BranchArgs {
  name: vic20PaletteName;
}
interface SetPetSelectedColorPaletteNameArgs extends BranchArgs {
  name: petPaletteName;
}
interface SetIntegerScaleArgs extends BranchArgs {
  scale: boolean;
}
interface SetUltimateAddressArgs extends BranchArgs {
  address: string;
}
interface SetUltimatePresetsArgs extends BranchArgs {
  presets: string[];
}
interface SetColorSortModeArgs extends BranchArgs {
  mode: ColorSortMode;
}
interface SetShowColorNumbersArgs extends BranchArgs {
  show: boolean;
}
interface SetThemeModeArgs extends BranchArgs {
  mode: ThemeMode;
}
interface SetShiftDrawingModeArgs extends BranchArgs {
  mode: ShiftDrawingMode;
}
interface SetEmulatorPathArgs extends BranchArgs {
  platform: keyof EmulatorPaths;
  path: string;
}
interface SetZoomSensitivityArgs extends BranchArgs {
  value: number;
}
interface SetDefaultZoomLevelArgs extends BranchArgs {
  value: number;
}
interface SetDefaultBorderOnArgs extends BranchArgs {
  value: boolean;
}
interface SetConvertSettingsArgs extends BranchArgs {
  settings: Partial<ConvertSettings>;
}
interface SetCharPanelBgModeArgs extends BranchArgs {
  mode: 'document' | 'global';
}

const actionCreators = {
  load: (data: SettingsJson) => createAction(LOAD, fromJson(data)),
  saveEditsAction: () => createAction(SAVE_EDITS),
  cancelEdits: () => createAction(CANCEL_EDITS),
  setPalette: (data: SetPaletteArgs) => createAction(SET_PALETTE, data),
  setVic20Palette: (data: SetVic20PaletteArgs) => createAction(SET_VIC20_PALETTE, data),
  setPetPalette: (data: SetPetPaletteArgs) => createAction(SET_PET_PALETTE, data),
  setSelectedColorPaletteName: (data: SetSelectedColorPaletteNameArgs) => createAction(SET_SELECTED_COLOR_PALETTE, data),
  setVic20SelectedColorPaletteName: (data: SetVic20SelectedColorPaletteNameArgs) => createAction(SET_SELECTED_VIC20_COLOR_PALETTE, data),
  setPetSelectedColorPaletteName: (data: SetPetSelectedColorPaletteNameArgs) => createAction(SET_SELECTED_PET_COLOR_PALETTE, data),
  setIntegerScale: (data: SetIntegerScaleArgs) => createAction(SET_INTEGER_SCALE, data),
  setUltimateAddress: (data: SetUltimateAddressArgs) => createAction(SET_ULTIMATE_ADDRESS, data),
  setUltimatePresets: (data: SetUltimatePresetsArgs) => createAction(SET_ULTIMATE_PRESETS, data),
  setColorSortMode: (data: SetColorSortModeArgs) => createAction(SET_COLOR_SORT_MODE, data),
  setShowColorNumbers: (data: SetShowColorNumbersArgs) => createAction(SET_SHOW_COLOR_NUMBERS, data),
  setThemeMode: (data: SetThemeModeArgs) => createAction(SET_THEME_MODE, data),
  setShiftDrawingMode: (data: SetShiftDrawingModeArgs) => createAction(SET_SHIFT_DRAWING_MODE, data),
  setEmulatorPath: (data: SetEmulatorPathArgs) => createAction(SET_EMULATOR_PATH, data),
  setLinePresetsSettingAction: (presets: LinePreset[]) => createAction(SET_LINE_PRESETS_SETTING, presets),
  setBoxPresetsByGroupSettingAction: (map: Record<string, BoxPreset[]>) =>
    createAction(SET_BOX_PRESETS_BY_GROUP_SETTING, map),
  setScrollZoomSensitivity: (data: SetZoomSensitivityArgs) => createAction(SET_SCROLL_ZOOM_SENSITIVITY, data),
  setPinchZoomSensitivity: (data: SetZoomSensitivityArgs) => createAction(SET_PINCH_ZOOM_SENSITIVITY, data),
  setDefaultZoomLevel: (data: SetDefaultZoomLevelArgs) => createAction(SET_DEFAULT_ZOOM_LEVEL, data),
  setDefaultBorderOn: (data: SetDefaultBorderOnArgs) => createAction(SET_DEFAULT_BORDER_ON, data),
  setConvertSettings: (data: SetConvertSettingsArgs) => createAction(SET_CONVERT_SETTINGS, data),
  setCharPanelBgMode: (data: SetCharPanelBgModeArgs) => createAction(SET_CHAR_PANEL_BG_MODE, data),
  setCustomFadeSources: (sources: CustomFadeSource[]) => createAction(SET_CUSTOM_FADE_SOURCES, sources),
  setFadeSourceToggles: (toggles: Record<string, FadePresetToggles>) => createAction(SET_FADE_SOURCE_TOGGLES, toggles),
  setTexturePresetsByGroupSettingAction: (map: Record<string, TexturePreset[]>) =>
    createAction(SET_TEXTURE_PRESETS_BY_GROUP_SETTING, map),
  /** Merge externally-changed keys into both branches (file-watcher). */
  mergeExternal: (data: Partial<RSettings>) => createAction(MERGE_EXTERNAL, data),
};

type Actions = ActionsUnion<typeof actionCreators>

function persistLinePresets(presets: LinePreset[]): ThunkAction<void, RootState, undefined, Action> {
  return (dispatch, _getState) => {
    markDirty('linePresets');
    dispatch(actionCreators.setLinePresetsSettingAction(presets));
    dispatch((_dispatch, getState) => {
      mergeAndSaveSettings(getState().settings.saved);
    });
  };
}

function persistBoxPresetsByGroup(map: Record<string, BoxPreset[]>): ThunkAction<void, RootState, undefined, Action> {
  return (dispatch, _getState) => {
    markDirty('boxPresetsByGroup');
    dispatch(actionCreators.setBoxPresetsByGroupSettingAction(map));
    dispatch((_dispatch, getState) => {
      mergeAndSaveSettings(getState().settings.saved);
    });
  };
}

function persistTexturePresetsByGroup(map: Record<string, TexturePreset[]>): ThunkAction<void, RootState, undefined, Action> {
  return (dispatch, _getState) => {
    markDirty('texturePresetsByGroup');
    dispatch(actionCreators.setTexturePresetsByGroupSettingAction(map));
    dispatch((_dispatch, getState) => {
      mergeAndSaveSettings(getState().settings.saved);
    });
  };
}

// Apply a theme change immediately to both branches and persist,
// without going through the Settings dialog editing/save flow.
function applyThemeImmediate(mode: ThemeMode): ThunkAction<void, RootState, undefined, Action> {
  return (dispatch, getState) => {
    markDirty('themeMode');
    dispatch(actionCreators.setThemeMode({ branch: 'saved', mode }));
    dispatch(actionCreators.setThemeMode({ branch: 'editing', mode }));
    mergeAndSaveSettings(getState().settings.saved);
  };
}

// Expose defaults so the Preferences UI can offer per-tab reset
export const defaultSettings = initialState;

export const actions = {
  ...actionCreators,
  saveEdits,
  applyThemeImmediate,
  persistLinePresets,
  persistBoxPresetsByGroup,
  persistTexturePresetsByGroup,
};

export type PropsFromDispatch = DispatchPropsFromActions<typeof actions>;

function updateBranch(
  state:  EditSaved<RSettings>,
  branch: EditBranch,
  field:  Partial<RSettings>
): EditSaved<RSettings> {
  const s: RSettings = state[branch];
  return {
    ...state,
    [branch]: {
      ...s,
      ...field
    }
  }
}

export function reducer(
  state: EditSaved<RSettings> = {
    editing: initialState, // form state while editing
    saved: initialState    // final state for rest of UI and persistence
  },
  action: Actions
): EditSaved<RSettings> {
  switch (action.type) {
    case LOAD:
      let newSaved = action.data
      return {
        saved: newSaved,
        editing: newSaved
      }
    case SAVE_EDITS:
      return {
        ...state,
        saved: state.editing
      }
    case CANCEL_EDITS:
      return {
        ...state,
        editing: state.saved
      }
    case SET_PALETTE:
      const branch: EditBranch = action.data.branch;
      return updateBranch(state, action.data.branch, {
        palettes: fp.arraySet(state[branch].palettes, action.data.idx, action.data.palette)
      });

      case SET_VIC20_PALETTE:
        const VIC20branch: EditBranch = action.data.branch;
        return updateBranch(state, action.data.branch, {
          vic20palettes: fp.arraySet(state[VIC20branch].vic20palettes, action.data.idx, action.data.palette)
        });
        case SET_PET_PALETTE:
          const PETbranch: EditBranch = action.data.branch;
          return updateBranch(state, action.data.branch, {
            petpalettes: fp.arraySet(state[PETbranch].petpalettes, action.data.idx, action.data.palette)
          });


    case SET_INTEGER_SCALE: {
      return updateBranch(state, action.data.branch, {
        integerScale: action.data.scale
      });
    }



    case SET_ULTIMATE_ADDRESS: {
      return updateBranch(state, action.data.branch, {
        ultimateAddress: action.data.address
      });
    }
    case SET_ULTIMATE_PRESETS: {
      return updateBranch(state, action.data.branch, {
        ultimatePresets: _normalizeUltimatePresets(action.data.presets)
      });
    }

    case SET_SELECTED_COLOR_PALETTE: {
      return updateBranch(state, action.data.branch, {
        selectedColorPalette: action.data.name
      });
    }
    case SET_SELECTED_VIC20_COLOR_PALETTE: {

      return updateBranch(state, action.data.branch, {
        selectedVic20ColorPalette: action.data.name

      });
    }
      case SET_SELECTED_PET_COLOR_PALETTE: {
        return updateBranch(state, action.data.branch, {
          selectedPetColorPalette: action.data.name

        });


    }
    case SET_COLOR_SORT_MODE: {
      return updateBranch(state, action.data.branch, {
        colorSortMode: action.data.mode
      });
    }
    case SET_SHOW_COLOR_NUMBERS: {
      return updateBranch(state, action.data.branch, {
        showColorNumbers: action.data.show
      });
    }
    case SET_THEME_MODE: {
      return updateBranch(state, action.data.branch, {
        themeMode: action.data.mode
      });
    }
    case SET_SHIFT_DRAWING_MODE: {
      return updateBranch(state, action.data.branch, {
        shiftDrawingMode: action.data.mode
      });
    }
    case SET_EMULATOR_PATH: {
      const cur = state[action.data.branch].emulatorPaths;
      return updateBranch(state, action.data.branch, {
        emulatorPaths: { ...cur, [action.data.platform]: action.data.path }
      });
    }
    case SET_LINE_PRESETS_SETTING: {
      return {
        ...state,
        editing: { ...state.editing, linePresets: action.data },
        saved: { ...state.saved, linePresets: action.data },
      };
    }
    case SET_BOX_PRESETS_BY_GROUP_SETTING: {
      return {
        ...state,
        editing: { ...state.editing, boxPresetsByGroup: action.data },
        saved: { ...state.saved, boxPresetsByGroup: action.data },
      };
    }
    case SET_SCROLL_ZOOM_SENSITIVITY: {
      return updateBranch(state, action.data.branch, {
        scrollZoomSensitivity: action.data.value
      });
    }
    case SET_PINCH_ZOOM_SENSITIVITY: {
      return updateBranch(state, action.data.branch, {
        pinchZoomSensitivity: action.data.value
      });
    }
    case SET_DEFAULT_ZOOM_LEVEL: {
      return updateBranch(state, action.data.branch, {
        defaultZoomLevel: Math.max(1, Math.min(8, action.data.value))
      });
    }
    case SET_DEFAULT_BORDER_ON: {
      return updateBranch(state, action.data.branch, {
        defaultBorderOn: action.data.value
      });
    }
    case SET_CONVERT_SETTINGS: {
      const cur = state[action.data.branch].convertSettings;
      return updateBranch(state, action.data.branch, {
        convertSettings: { ...cur, ...action.data.settings }
      });
    }
    case SET_CHAR_PANEL_BG_MODE: {
      return updateBranch(state, action.data.branch, {
        charPanelBgMode: action.data.mode
      });
    }
    case SET_CUSTOM_FADE_SOURCES: {
      return {
        ...state,
        editing: { ...state.editing, customFadeSources: action.data },
        saved: { ...state.saved, customFadeSources: action.data },
      };
    }
    case SET_FADE_SOURCE_TOGGLES: {
      return {
        ...state,
        editing: { ...state.editing, fadeSourceToggles: action.data },
        saved: { ...state.saved, fadeSourceToggles: action.data },
      };
    }
    case SET_TEXTURE_PRESETS_BY_GROUP_SETTING: {
      return {
        ...state,
        editing: { ...state.editing, texturePresetsByGroup: action.data },
        saved: { ...state.saved, texturePresetsByGroup: action.data },
      };
    }
    case MERGE_EXTERNAL: {
      // Merge only the supplied keys from an external file change into
      // both branches so the UI picks them up.
      return {
        ...state,
        editing: { ...state.editing, ...action.data },
        saved: { ...state.saved, ...action.data },
      };
    }
    default:
      return state;
  }
}
