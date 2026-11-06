// Texture preset / texture-settings domain slice, extracted from
// redux/toolbar.ts (Group L / L1-L7). Pure code-organization split -- see
// findReplaceSlice.ts's header comment for the composition pattern this
// and every other slice follows, and boxPresetSlice.ts's header comment
// for why `defaultTexturePresets`, `buildGroupedTexturePresets` and
// `normalizeGroupedTexturePresets` deliberately stay defined in toolbar.ts
// (settings.ts calls `buildGroupedTexturePresets()` eagerly at its own
// module-load time, during toolbar.ts's long-standing circular require
// with settings.ts). `normalizeGroupedTexturePresets` is imported back
// from toolbar.ts below -- safe because `texturePresetReducer` is only
// ever invoked later by Redux's dispatch machinery, never eagerly.
//
// Does NOT handle `Toolbar/CLAMP_SELECTED_PRESET_INDICES`, which touches
// both box and texture state together and stays in toolbar.ts itself.
import { Action } from 'redux';
import { TexturePreset, TextureDrawMode } from '../types';
import { createAction, updateField } from '../typeUtils';
import { normalizeGroupedTexturePresets } from '../toolbar';

export const texturePresetActionCreators = {
  // ---- Grouped Texture preset reducer actions (payload carries the group key). ----
  setTexturePresetsForGroup: (group: string, presets: TexturePreset[]) => createAction('Toolbar/SET_TEXTURE_PRESETS', { group, presets }),
  setAllTexturePresetsByGroup: (map: Record<string, TexturePreset[]>) => createAction('Toolbar/SET_ALL_TEXTURE_PRESETS_BY_GROUP', map),
  setSelectedTexturePresetIndex: (index: number) => createAction('Toolbar/SET_SELECTED_TEXTURE_PRESET_INDEX', index),
  addTexturePresetForGroup: (group: string, preset: TexturePreset) => createAction('Toolbar/ADD_TEXTURE_PRESET', { group, preset }),
  updateTexturePresetForGroup: (group: string, index: number, preset: TexturePreset) => createAction('Toolbar/UPDATE_TEXTURE_PRESET', { group, index, preset }),
  removeTexturePresetForGroup: (group: string, index: number) => createAction('Toolbar/REMOVE_TEXTURE_PRESET', { group, index }),
  setTextureRandomColor: (flag: boolean) => createAction('Toolbar/SET_TEXTURE_RANDOM_COLOR', flag),
  setTextureOptions: (options: boolean[]) => createAction('Toolbar/SET_TEXTURE_OPTIONS', options),
  setTexturePatternType: (t: string) => createAction('Toolbar/SET_TEXTURE_PATTERN_TYPE', t),
  setTextureSeed: (seed: number) => createAction('Toolbar/SET_TEXTURE_SEED', seed),
  setTextureScale: (scale: number) => createAction('Toolbar/SET_TEXTURE_SCALE', scale),
  setTextureOutputMode: (mode: 'brush' | 'fill' | 'none') => createAction('Toolbar/SET_TEXTURE_OUTPUT_MODE', mode),
  setTextureForceForeground: (flag: boolean) => createAction('Toolbar/SET_TEXTURE_FORCE_FOREGROUND', flag),
  setTextureBrushWidth: (w: number) => createAction('Toolbar/SET_TEXTURE_BRUSH_WIDTH', w),
  setTextureBrushHeight: (h: number) => createAction('Toolbar/SET_TEXTURE_BRUSH_HEIGHT', h),
  setTextureDrawMode: (mode: TextureDrawMode) => createAction('Toolbar/SET_TEXTURE_DRAW_MODE', mode),
};

/** Handles only the texture-preset/-settings action types, returning
 *  `state` unchanged for everything else -- composed into Toolbar.reducer's
 *  pipeline in toolbar.ts. See findReplaceReducer's doc comment for why
 *  `action` is loosely typed here. */
export function texturePresetReducer<State extends {
  texturePresetsByGroup: Record<string, TexturePreset[]>;
  selectedTexturePresetIndex: number;
  textureRandomColor: boolean;
  textureOptions: boolean[];
  texturePatternType: string;
  textureSeed: number;
  textureScale: number;
  textureOutputMode: 'brush' | 'fill' | 'none';
  textureForceForeground: boolean;
  textureBrushWidth: number;
  textureBrushHeight: number;
  textureDrawMode: TextureDrawMode;
}>(state: State, action: Action<string> & { data?: any }): State {
  switch (action.type) {
    case 'Toolbar/SET_TEXTURE_PRESETS': {
      const { group, presets } = action.data;
      const nextMap = { ...state.texturePresetsByGroup, [group]: presets };
      const newIdx = Math.min(state.selectedTexturePresetIndex, Math.max(0, presets.length - 1));
      return { ...state, texturePresetsByGroup: nextMap, selectedTexturePresetIndex: Math.max(0, newIdx) };
    }
    case 'Toolbar/SET_ALL_TEXTURE_PRESETS_BY_GROUP': {
      return { ...state, texturePresetsByGroup: normalizeGroupedTexturePresets(action.data) };
    }
    case 'Toolbar/SET_SELECTED_TEXTURE_PRESET_INDEX':
      return updateField(state, 'selectedTexturePresetIndex', action.data);
    case 'Toolbar/ADD_TEXTURE_PRESET': {
      const { group, preset } = action.data;
      const prev = state.texturePresetsByGroup[group] ?? [];
      const nextList = [...prev, preset];
      return {
        ...state,
        texturePresetsByGroup: { ...state.texturePresetsByGroup, [group]: nextList },
        selectedTexturePresetIndex: nextList.length - 1,
      };
    }
    case 'Toolbar/UPDATE_TEXTURE_PRESET': {
      const { group, index, preset } = action.data;
      const prev = state.texturePresetsByGroup[group] ?? [];
      const updated = prev.map((p: TexturePreset, i: number) => i === index ? preset : p);
      return { ...state, texturePresetsByGroup: { ...state.texturePresetsByGroup, [group]: updated } };
    }
    case 'Toolbar/REMOVE_TEXTURE_PRESET': {
      const { group, index } = action.data;
      const prev = state.texturePresetsByGroup[group] ?? [];
      const filtered = prev.filter((_: TexturePreset, i: number) => i !== index);
      const newIdx = Math.min(state.selectedTexturePresetIndex, filtered.length - 1);
      return {
        ...state,
        texturePresetsByGroup: { ...state.texturePresetsByGroup, [group]: filtered },
        selectedTexturePresetIndex: Math.max(0, newIdx),
      };
    }
    case 'Toolbar/SET_TEXTURE_RANDOM_COLOR':
      return updateField(state, 'textureRandomColor', action.data);
    case 'Toolbar/SET_TEXTURE_OPTIONS':
      return updateField(state, 'textureOptions', action.data);
    case 'Toolbar/SET_TEXTURE_PATTERN_TYPE':
      return updateField(state, 'texturePatternType', action.data);
    case 'Toolbar/SET_TEXTURE_SEED':
      return updateField(state, 'textureSeed', action.data);
    case 'Toolbar/SET_TEXTURE_SCALE':
      return updateField(state, 'textureScale', action.data);
    case 'Toolbar/SET_TEXTURE_OUTPUT_MODE':
      return updateField(state, 'textureOutputMode', action.data);
    case 'Toolbar/SET_TEXTURE_FORCE_FOREGROUND':
      return updateField(state, 'textureForceForeground', action.data);
    case 'Toolbar/SET_TEXTURE_BRUSH_WIDTH':
      return updateField(state, 'textureBrushWidth', action.data);
    case 'Toolbar/SET_TEXTURE_BRUSH_HEIGHT':
      return updateField(state, 'textureBrushHeight', action.data);
    case 'Toolbar/SET_TEXTURE_DRAW_MODE':
      return updateField(state, 'textureDrawMode', action.data);
    default:
      return state;
  }
}
