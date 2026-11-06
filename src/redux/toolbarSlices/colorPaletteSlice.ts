// Color / palette-remap domain slice, extracted from redux/toolbar.ts
// (Group L / L1-L7). Pure code-organization split -- see
// findReplaceSlice.ts's header comment for the composition pattern this
// and every other slice follows.
//
// Nothing here is read eagerly by settings.ts's module-level
// `initialState` construction, so no circular-require workaround is
// needed for a plain bare-import here (see boxPresetSlice.ts's header
// comment for the contrasting case that does need one).
import { Action } from 'redux';
import { createAction, updateField } from '../typeUtils';
import { DEFAULT_COLORS_BY_GROUP } from '../../utils/palette';

const NEXT_COLOR = 'Toolbar/NEXT_COLOR';
const SET_COLOR = 'Toolbar/SET_COLOR';

export const colorPaletteActionCreators = {
  nextColorAction: (dir: number, paletteRemap: number[]) => createAction(NEXT_COLOR, { dir, paletteRemap }),
  setColorAction: (slot: number, paletteRemap: number[]) => createAction(SET_COLOR, { slot, paletteRemap }),
  setTextColor: (c: number) => createAction('Toolbar/SET_TEXT_COLOR', c),
  setSelectedPaletteRemap: (remapIdx: number) => createAction('Toolbar/SET_SELECTED_PALETTE_REMAP', remapIdx),
  switchForegroundGroup: (prevGroup: string, newGroup: string) => createAction('Toolbar/SWITCH_FOREGROUND_GROUP', { prevGroup, newGroup }),
};

/** Handles only the color/palette-remap action types, returning `state`
 *  unchanged for everything else -- composed into Toolbar.reducer's
 *  pipeline in toolbar.ts. See findReplaceReducer's doc comment for why
 *  `action` is loosely typed here. */
export function colorPaletteReducer<State extends {
  textColor: number;
  selectedPaletteRemap: number;
  textColorByGroup: Record<string, number>;
  activeColorGroup: string;
}>(state: State, action: Action<string> & { data?: any }): State {
  switch (action.type) {
    case NEXT_COLOR: {
      const remap = action.data.paletteRemap;
      const idx = remap.indexOf(state.textColor);
      const dir = action.data.dir;
      const nextIdx = Math.max(0, Math.min(remap.length - 1, idx + dir));
      return {
        ...state,
        textColor: remap[nextIdx]
      }
    }
    case SET_COLOR: {
      const remap = action.data.paletteRemap;
      const slot = action.data.slot;
      // Platform-specific remaps (VIC-20: 8 entries, PET: 2 entries) are
      // shorter than the 16 color-slot shortcuts (Alt+1..8/Ctrl+1..8), and
      // ctrlClick's eyedrop can also pass an arbitrary stored pixel color
      // as `slot`. Out-of-range slots have no corresponding color on that
      // platform, so leave textColor unchanged rather than setting it to
      // `undefined`.
      if (slot < 0 || slot >= remap.length) {
        return state;
      }
      return {
        ...state,
        textColor: remap[slot]
      }
    }
    case 'Toolbar/SET_TEXT_COLOR':
      return updateField(state, 'textColor', action.data);
    case 'Toolbar/SET_SELECTED_PALETTE_REMAP':
      return updateField(state, 'selectedPaletteRemap', action.data);
    case 'Toolbar/SWITCH_FOREGROUND_GROUP': {
      const { prevGroup, newGroup } = action.data;
      // Already in the target group — skip to avoid overwriting the
      // saved colour when componentDidUpdate re-dispatches.
      if (state.activeColorGroup === newGroup) return state;
      const updatedByGroup = {
        ...state.textColorByGroup,
        [prevGroup]: state.textColor,
      };
      const newColor = (updatedByGroup as Record<string, number | undefined>)[newGroup] ?? DEFAULT_COLORS_BY_GROUP[newGroup] ?? state.textColor;
      return {
        ...state,
        textColorByGroup: updatedByGroup,
        textColor: newColor,
        activeColorGroup: newGroup,
      };
    }
    default:
      return state;
  }
}
