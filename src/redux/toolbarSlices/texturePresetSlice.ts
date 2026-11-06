// Texture preset / texture-settings domain slice, extracted from
// redux/toolbar.ts (Group L / L1-L7). Pure code-organization split -- see
// findReplaceSlice.ts's header comment for the composition pattern this
// and every other slice follows.

// As of L13 (single-source-of-truth consolidation), the actual texture
// preset LIST data (`texturePresetsByGroup`) no longer lives in toolbar
// state at all -- it lives only in
// state.settings.saved/editing.texturePresetsByGroup (see redux/settings.ts's
// group-aware CRUD thunks). This slice now only owns the toolbar-local,
// non-persisted UI state: which preset is selected, and the Texture
// panel's various draw/output-mode toggles. The group-aware CRUD thunks
// panels actually call (setTexturePresetsForGroup/addTexturePreset/etc)
// live in toolbar.ts itself, since they need dispatch/getState to
// delegate into settings.ts.
import { TextureDrawMode } from '../types';
import { createAction, updateField } from '../typeUtils';

export const texturePresetActionCreators = {
  setSelectedTexturePresetIndex: (index: number) => createAction('Toolbar/SET_SELECTED_TEXTURE_PRESET_INDEX', index),
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

/** Handles only the texture-preset-UI/-settings action types, returning
 *  `state` unchanged for everything else -- composed into Toolbar.reducer's
 *  pipeline in toolbar.ts. See findReplaceReducer's doc comment for why
 *  `action` is loosely typed here. */
export function texturePresetReducer<State extends {
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
}>(state: State, action: { type: string; data?: any }): State {
  switch (action.type) {
    case 'Toolbar/SET_SELECTED_TEXTURE_PRESET_INDEX':
      return updateField(state, 'selectedTexturePresetIndex', action.data);
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
