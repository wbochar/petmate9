// Box preset domain slice, extracted from redux/toolbar.ts (Group L /
// L1-L7). Pure code-organization split -- see findReplaceSlice.ts's header
// comment for the composition pattern this and every other slice follows.

// As of L13 (single-source-of-truth consolidation), the actual box preset
// LIST data (`boxPresetsByGroup`) no longer lives in toolbar state at all
// -- it lives only in state.settings.saved/editing.boxPresetsByGroup (see
// redux/settings.ts's group-aware CRUD thunks). This slice now only owns
// the toolbar-local, non-persisted UI state: which preset is selected,
// and the Boxes panel's draw-mode/force-foreground toggles. The group-aware
// CRUD thunks panels actually call (setBoxPresetsForGroup/addBoxPreset/
// etc) live in toolbar.ts itself, since they need dispatch/getState to
// delegate into settings.ts.
import { createAction, updateField } from '../typeUtils';

export const boxPresetActionCreators = {
  setSelectedBoxPresetIndex: (index: number) => createAction('Toolbar/SET_SELECTED_BOX_PRESET_INDEX', index),
  setBoxDrawMode: (flag: boolean) => createAction('Toolbar/SET_BOX_DRAW_MODE', flag),
  setBoxForceForeground: (flag: boolean) => createAction('Toolbar/SET_BOX_FORCE_FOREGROUND', flag),
};

/** Handles only the box-preset UI-state action types, returning `state`
 *  unchanged for everything else -- composed into Toolbar.reducer's
 *  pipeline in toolbar.ts. See findReplaceReducer's doc comment for why
 *  `action` is loosely typed here. */
export function boxPresetReducer<State extends {
  selectedBoxPresetIndex: number;
  boxDrawMode: boolean;
  boxForceForeground: boolean;
}>(state: State, action: { type: string; data?: any }): State {
  switch (action.type) {
    case 'Toolbar/SET_SELECTED_BOX_PRESET_INDEX':
      return updateField(state, 'selectedBoxPresetIndex', action.data);
    case 'Toolbar/SET_BOX_DRAW_MODE':
      return updateField(state, 'boxDrawMode', action.data);
    case 'Toolbar/SET_BOX_FORCE_FOREGROUND':
      return updateField(state, 'boxForceForeground', action.data);
    default:
      return state;
  }
}
