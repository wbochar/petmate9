// Box preset domain slice, extracted from redux/toolbar.ts (Group L /
// L1-L7). Pure code-organization split -- see findReplaceSlice.ts's header
// comment for the composition pattern this and every other slice follows.

// IMPORTANT: `defaultBoxPresets`, `buildGroupedBoxPresets` and
// `normalizeGroupedBoxPresets` deliberately stay defined in toolbar.ts
// (not here), and `normalizeGroupedBoxPresets` is imported back from there
// below. toolbar.ts sits in a long-standing circular require chain
// (toolbar -> screens -> selectors -> utils -> importers -> workspace ->
// root -> settings -> toolbar), and settings.ts *calls*
// `buildGroupedBoxPresets()` eagerly at its own module top level. A
// function that is called (not just referenced) must be synchronously
// defined by the time that circular read happens, which only toolbar.ts's
// own hoisted `function` declarations reliably guarantee -- re-exporting
// it from a sibling module is timing-dependent on require order and was
// found to break under Jest. `boxPresetReducer` below, by contrast, is
// only ever invoked later by Redux's dispatch machinery (well after all
// modules have finished loading), so importing `normalizeGroupedBoxPresets`
// back from toolbar.ts here is safe despite the resulting two-file cycle.
import { Action } from 'redux';
import { BoxPreset } from '../types';
import { createAction, updateField } from '../typeUtils';
import { normalizeGroupedBoxPresets } from '../toolbar';

export const boxPresetActionCreators = {
  // ---- Grouped Box preset reducer actions (payload carries the group key). ----
  setBoxPresetsForGroup: (group: string, presets: BoxPreset[]) => createAction('Toolbar/SET_BOX_PRESETS', { group, presets }),
  setAllBoxPresetsByGroup: (map: Record<string, BoxPreset[]>) => createAction('Toolbar/SET_ALL_BOX_PRESETS_BY_GROUP', map),
  setSelectedBoxPresetIndex: (index: number) => createAction('Toolbar/SET_SELECTED_BOX_PRESET_INDEX', index),
  addBoxPresetForGroup: (group: string, preset: BoxPreset) => createAction('Toolbar/ADD_BOX_PRESET', { group, preset }),
  updateBoxPresetForGroup: (group: string, index: number, preset: BoxPreset) => createAction('Toolbar/UPDATE_BOX_PRESET', { group, index, preset }),
  removeBoxPresetForGroup: (group: string, index: number) => createAction('Toolbar/REMOVE_BOX_PRESET', { group, index }),
  setBoxDrawMode: (flag: boolean) => createAction('Toolbar/SET_BOX_DRAW_MODE', flag),
  setBoxForceForeground: (flag: boolean) => createAction('Toolbar/SET_BOX_FORCE_FOREGROUND', flag),
};

/** Handles only the box-preset action types, returning `state` unchanged
 *  for everything else -- composed into Toolbar.reducer's pipeline in
 *  toolbar.ts. See findReplaceReducer's doc comment for why `action` is
 *  loosely typed here. Does NOT handle CLAMP_SELECTED_PRESET_INDICES,
 *  which touches both box and texture state together and stays in
 *  toolbar.ts itself. */
export function boxPresetReducer<State extends {
  boxPresetsByGroup: Record<string, BoxPreset[]>;
  selectedBoxPresetIndex: number;
  boxDrawMode: boolean;
  boxForceForeground: boolean;
}>(state: State, action: Action<string> & { data?: any }): State {
  switch (action.type) {
    case 'Toolbar/SET_BOX_PRESETS': {
      const { group, presets } = action.data;
      const nextMap = { ...state.boxPresetsByGroup, [group]: presets };
      const newIdx = Math.min(state.selectedBoxPresetIndex, Math.max(0, presets.length - 1));
      return { ...state, boxPresetsByGroup: nextMap, selectedBoxPresetIndex: Math.max(0, newIdx) };
    }
    case 'Toolbar/SET_ALL_BOX_PRESETS_BY_GROUP': {
      return { ...state, boxPresetsByGroup: normalizeGroupedBoxPresets(action.data) };
    }
    case 'Toolbar/SET_SELECTED_BOX_PRESET_INDEX':
      return updateField(state, 'selectedBoxPresetIndex', action.data);
    case 'Toolbar/ADD_BOX_PRESET': {
      const { group, preset } = action.data;
      const prev = state.boxPresetsByGroup[group] ?? [];
      const nextList = [...prev, preset];
      return {
        ...state,
        boxPresetsByGroup: { ...state.boxPresetsByGroup, [group]: nextList },
        selectedBoxPresetIndex: nextList.length - 1,
      };
    }
    case 'Toolbar/UPDATE_BOX_PRESET': {
      const { group, index, preset } = action.data;
      const prev = state.boxPresetsByGroup[group] ?? [];
      const updated = prev.map((p: BoxPreset, i: number) => i === index ? preset : p);
      return { ...state, boxPresetsByGroup: { ...state.boxPresetsByGroup, [group]: updated } };
    }
    case 'Toolbar/REMOVE_BOX_PRESET': {
      const { group, index } = action.data;
      const prev = state.boxPresetsByGroup[group] ?? [];
      const filtered = prev.filter((_: BoxPreset, i: number) => i !== index);
      const newIdx = Math.min(state.selectedBoxPresetIndex, filtered.length - 1);
      return {
        ...state,
        boxPresetsByGroup: { ...state.boxPresetsByGroup, [group]: filtered },
        selectedBoxPresetIndex: Math.max(0, newIdx),
      };
    }
    case 'Toolbar/SET_BOX_DRAW_MODE':
      return updateField(state, 'boxDrawMode', action.data);
    case 'Toolbar/SET_BOX_FORCE_FOREGROUND':
      return updateField(state, 'boxForceForeground', action.data);
    default:
      return state;
  }
}
