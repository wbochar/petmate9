
import { RootState, Settings, PaletteName, vic20PaletteName, petPaletteName } from './types'
import { colorPalettes, vic20ColorPalettes, petColorPalettes } from '../utils'

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
