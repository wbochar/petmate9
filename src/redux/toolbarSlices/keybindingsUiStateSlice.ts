// Keybindings UI-state domain slice, extracted from redux/toolbar.ts
// (Group L / L1-L7). Pure code-organization split -- see
// findReplaceSlice.ts's header comment for the composition pattern this
// and every other slice follows.
//
// Scope is deliberately narrow: just the modifier-key tracking fields
// (altKey/ctrlKey/tabKey/metaKey/shiftKey/capslockKey/spacebarKey) and
// shortcutsActive, which are simple, independently-updated flags. The
// `keyDown`/`keyUp` thunks that read and dispatch these stay centralized
// in toolbar.ts since they also dispatch across every other domain
// (tools, colors, presets, etc.) and don't belong to any single slice.
//
// Nothing here is read eagerly by settings.ts's module-level
// `initialState` construction, so no circular-require workaround is
// needed for a plain bare-import here (see boxPresetSlice.ts's header
// comment for the contrasting case that does need one).
import { Action } from 'redux';
import { createAction, updateField } from '../typeUtils';

const CLEAR_MOD_KEY_STATE = 'Toolbar/CLEAR_MOD_KEY_STATE';

export const keybindingsUiStateActionCreators = {
  clearModKeyState: () => createAction(CLEAR_MOD_KEY_STATE),
  setAltKey: (flag: boolean) => createAction('Toolbar/SET_ALT_KEY', flag),
  setCtrlKey: (flag: boolean) => createAction('Toolbar/SET_CTRL_KEY', flag),
  setTabKey: (flag: boolean) => createAction('Toolbar/SET_TAB_KEY', flag),
  setMetaKey: (flag: boolean) => createAction('Toolbar/SET_META_KEY', flag),
  setShiftKey: (flag: boolean) => createAction('Toolbar/SET_SHIFT_KEY', flag),
  setCAPSLockKey: (flag: boolean) => createAction('Toolbar/SET_CAPSLOCK_KEY', flag),
  setSpacebarKey: (flag: boolean) => createAction('Toolbar/SET_SPACEBAR_KEY', flag),
  setShortcutsActive: (flag: boolean) => createAction('Toolbar/SET_SHORTCUTS_ACTIVE', flag),
};

/** Handles only the modifier-key/shortcuts-active action types, returning
 *  `state` unchanged for everything else -- composed into
 *  Toolbar.reducer's pipeline in toolbar.ts. See findReplaceReducer's doc
 *  comment for why `action` is loosely typed here. */
export function keybindingsUiStateReducer<State extends {
  altKey: boolean;
  ctrlKey: boolean;
  tabKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  capslockKey: boolean;
  spacebarKey: boolean;
  shortcutsActive: boolean;
}>(state: State, action: Action<string> & { data?: any }): State {
  switch (action.type) {
    case CLEAR_MOD_KEY_STATE:
      return {
        ...state,
        altKey: false,
        ctrlKey: false,
        tabKey: false,
        metaKey: false,
        shiftKey: false,
        capslockKey: false,
      }
    case 'Toolbar/SET_ALT_KEY':
      return updateField(state, 'altKey', action.data);
    case 'Toolbar/SET_CTRL_KEY':
      return updateField(state, 'ctrlKey', action.data);
    case 'Toolbar/SET_TAB_KEY':
      return updateField(state, 'tabKey', action.data);
    case 'Toolbar/SET_META_KEY':
      return updateField(state, 'metaKey', action.data);
    case 'Toolbar/SET_SHIFT_KEY':
      return updateField(state, 'shiftKey', action.data);
    case 'Toolbar/SET_CAPSLOCK_KEY':
      return updateField(state, 'capslockKey', action.data);
    case 'Toolbar/SET_SPACEBAR_KEY':
      return updateField(state, 'spacebarKey', action.data);
    case 'Toolbar/SET_SHORTCUTS_ACTIVE':
      return updateField(state, 'shortcutsActive', action.data);
    default:
      return state;
  }
}
