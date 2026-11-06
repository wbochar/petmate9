// Fade domain slice, extracted from redux/toolbar.ts (Group L / L1-L7).
// Pure code-organization split -- see findReplaceSlice.ts's header comment
// for the composition pattern this and every other slice follows.
//
// Unlike boxPresetSlice.ts/texturePresetSlice.ts, nothing here is read
// eagerly by settings.ts's module-level `initialState` construction (the
// grouped fade-sources/toggles builders -- buildGroupedFadeSources,
// normalizeGroupedFadeSources, buildGroupedFadeToggles,
// normalizeGroupedFadeToggles -- which ARE read that way, stay defined in
// toolbar.ts and are untouched by this slice), so no circular-require
// workaround is needed for a plain bare-import here.
import { Action } from 'redux';
import { FadeMode, FadeSource, FadeStepStart, FadeStepChoice, FadeStepSort, FadeCharsetSettings } from '../types';
import { createAction, updateField } from '../typeUtils';

export const fadeActionCreators = {
  setFadeMode: (mode: FadeMode) => createAction('Toolbar/SET_FADE_MODE', mode),
  setFadeStrength: (strength: number) => createAction('Toolbar/SET_FADE_STRENGTH', strength),
  setFadeSource: (source: FadeSource) => createAction('Toolbar/SET_FADE_SOURCE', source),
  setFadeStepStart: (start: FadeStepStart) => createAction('Toolbar/SET_FADE_STEP_START', start),
  setFadeStepCount: (count: number) => createAction('Toolbar/SET_FADE_STEP_COUNT', count),
  setFadeStepChoice: (choice: FadeStepChoice) => createAction('Toolbar/SET_FADE_STEP_CHOICE', choice),
  setFadeStepSort: (sort: FadeStepSort) => createAction('Toolbar/SET_FADE_STEP_SORT', sort),
  setFadeShowSource: (flag: boolean) => createAction('Toolbar/SET_FADE_SHOW_SOURCE', flag),
  setFadeEditMode: (flag: boolean) => createAction('Toolbar/SET_FADE_EDIT_MODE', flag),
  incFadeLinearCounter: () => createAction('Toolbar/INC_FADE_LINEAR_COUNTER'),
  switchFadeCharset: (prevCharset: string, nextCharset: string) => createAction('Toolbar/SWITCH_FADE_CHARSET', { prevCharset, nextCharset }),
  setFadeDrawMode: (flag: boolean) => createAction('Toolbar/SET_FADE_DRAW_MODE', flag),
};

/** Handles only the fade action types, returning `state` unchanged for
 *  everything else -- composed into Toolbar.reducer's pipeline in
 *  toolbar.ts. See findReplaceReducer's doc comment for why `action` is
 *  loosely typed here. */
export function fadeReducer<State extends {
  fadeMode: FadeMode;
  fadeStrength: number;
  fadeSource: FadeSource;
  fadeStepStart: FadeStepStart;
  fadeStepCount: number;
  fadeStepChoice: FadeStepChoice;
  fadeStepSort: FadeStepSort;
  fadeShowSource: boolean;
  fadeEditMode: boolean;
  fadeLinearCounter: number;
  fadeSettingsByCharset: Record<string, FadeCharsetSettings>;
  fadeDrawMode: boolean;
}>(state: State, action: Action<string> & { data?: any }): State {
  switch (action.type) {
    case 'Toolbar/SET_FADE_MODE':
      return updateField(state, 'fadeMode', action.data);
    case 'Toolbar/SET_FADE_STRENGTH':
      return updateField(state, 'fadeStrength', action.data);
    case 'Toolbar/SET_FADE_SOURCE':
      return updateField(state, 'fadeSource', action.data);
    case 'Toolbar/SET_FADE_STEP_START':
      return updateField(state, 'fadeStepStart', action.data);
    case 'Toolbar/SET_FADE_STEP_COUNT':
      return updateField(state, 'fadeStepCount', action.data);
    case 'Toolbar/SET_FADE_STEP_CHOICE':
      return updateField(state, 'fadeStepChoice', action.data);
    case 'Toolbar/SET_FADE_STEP_SORT':
      return updateField(state, 'fadeStepSort', action.data);
    case 'Toolbar/SET_FADE_SHOW_SOURCE':
      return updateField(state, 'fadeShowSource', action.data);
    case 'Toolbar/SET_FADE_EDIT_MODE':
      return updateField(state, 'fadeEditMode', action.data);
    case 'Toolbar/INC_FADE_LINEAR_COUNTER':
      return { ...state, fadeLinearCounter: state.fadeLinearCounter + 1 };
    case 'Toolbar/SWITCH_FADE_CHARSET': {
      const { prevCharset, nextCharset } = action.data;
      const current: FadeCharsetSettings = {
        fadeMode: state.fadeMode,
        fadeStrength: state.fadeStrength,
        fadeSource: state.fadeSource,
        fadeStepStart: state.fadeStepStart,
        fadeStepCount: state.fadeStepCount,
        fadeStepChoice: state.fadeStepChoice,
        fadeStepSort: state.fadeStepSort,
      };
      const next = state.fadeSettingsByCharset[nextCharset];
      return {
        ...state,
        fadeSettingsByCharset: { ...state.fadeSettingsByCharset, [prevCharset]: current },
        fadeLinearCounter: 0,
        fadeEditMode: false,
        ...(next ? {
          fadeMode: next.fadeMode,
          fadeStrength: next.fadeStrength,
          fadeSource: next.fadeSource,
          fadeStepStart: next.fadeStepStart,
          fadeStepCount: next.fadeStepCount,
          fadeStepChoice: next.fadeStepChoice,
          fadeStepSort: next.fadeStepSort,
        } : {}),
      };
    }
    case 'Toolbar/SET_FADE_DRAW_MODE':
      return updateField(state, 'fadeDrawMode', action.data);
    default:
      return state;
  }
}
