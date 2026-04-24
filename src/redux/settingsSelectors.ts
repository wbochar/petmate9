
import { RootState, Settings, PaletteName, vic20PaletteName, petPaletteName, tedPaletteName } from './types'
import { colorPalettes, vic20ColorPalettes, petColorPalettes } from '../utils'
import { tedColorPalettes } from '../utils/palette'

export function getSettings(state: RootState): Settings {
  return state.settings['saved']
}

export const getSettingsEditing = (state: RootState) => {
  return state.settings['editing']
}


export const getSettingsPaletteRemap = (state: RootState) => {
  const idx = state.toolbar.selectedPaletteRemap
  const palettes = getSettings(state).palettes
  if (idx >= palettes.length) {
    throw new Error(`trying to use an undefined palette idx=${idx}`);
  }
  return palettes[idx]
}
export const getSettingsVic20PaletteRemap = (state: RootState) => {
  const idx = state.toolbar.selectedPaletteRemap
  const vic20palettes = getSettings(state).palettes
  if (idx >= vic20palettes.length) {
    throw new Error(`trying to use an undefined palette idx=${idx}`);
  }
  return vic20palettes[idx]
}



export const getSettingsPetPaletteRemap = (state: RootState) => {
  const idx = state.toolbar.selectedPaletteRemap
  const petpalettes = getSettings(state).palettes
  if (idx >= petpalettes.length) {
    throw new Error(`trying to use an undefined palette idx=${idx}`);
  }
  return petpalettes[idx]
}


export const getSettingsColorPaletteByName = (_state: RootState, name: PaletteName) => {
  return colorPalettes[name];
}
export const getSettingsVic20ColorPaletteByName = (_state: RootState, name: vic20PaletteName) => {
  return vic20ColorPalettes[name];
}
export const getSettingsPetColorPaletteByName = (_state: RootState, name: petPaletteName) => {
  return petColorPalettes[name];
}

export const getSettingsCurrentColorPalette = (state: RootState) => {
  const settings = getSettings(state)
  return getSettingsColorPaletteByName(state, settings.selectedColorPalette)
}
export const getSettingsCurrentVic20ColorPalette = (state: RootState) => {
  const settings = getSettings(state)
  return getSettingsVic20ColorPaletteByName(state, settings.selectedVic20ColorPalette)
}

export const getSettingsCurrentPetColorPalette = (state: RootState) => {
  const settings = getSettings(state)
  return getSettingsPetColorPaletteByName(state, settings.selectedPetColorPalette)
}

export const getSettingsTedColorPaletteByName = (_state: RootState, name: tedPaletteName) => {
  return tedColorPalettes[name];
}

export const getSettingsCurrentTedColorPalette = (state: RootState) => {
  const settings = getSettings(state)
  return getSettingsTedColorPaletteByName(state, settings.selectedTedColorPalette)
}


export const getSettingsIntegerScale = (state: RootState) => {
  const settings = getSettings(state)
  return settings.integerScale
}

export const getSettingsUltimateAddress = (state: RootState) => {
  const settings = getSettings(state)
  return settings.ultimateAddress
}


export const getSettingsEditingCurrentColorPalette = (state: RootState) => {
  const settings = getSettingsEditing(state)
  return getSettingsColorPaletteByName(state, settings.selectedColorPalette)
}

export const getSettingsColorSortMode = (state: RootState) => {
  return getSettings(state).colorSortMode
}

export const getSettingsShowColorNumbers = (state: RootState) => {
  return getSettings(state).showColorNumbers
}

export const getSettingsThemeMode = (state: RootState) => {
  return getSettings(state).themeMode
}

export const getSettingsShiftDrawingMode = (state: RootState) => {
  return getSettings(state).shiftDrawingMode
}

export const getSettingsScrollZoomSensitivity = (state: RootState) => {
  return getSettings(state).scrollZoomSensitivity
}

export const getSettingsPinchZoomSensitivity = (state: RootState) => {
  return getSettings(state).pinchZoomSensitivity
}
export const getSettingsDefaultZoomLevel = (state: RootState) => {
  return getSettings(state).defaultZoomLevel
}
export const getSettingsDefaultBorderOn = (state: RootState) => {
  return getSettings(state).defaultBorderOn
}

export const getSettingsConvertSettings = (state: RootState) => {
  return getSettings(state).convertSettings
}

export const getSettingsCharPanelBgMode = (state: RootState) => {
  return getSettings(state).charPanelBgMode
}

export const getSettingsCustomFadeSources = (state: RootState) => {
  return getSettings(state).customFadeSources
}
