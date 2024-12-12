
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
  RootState,
  SettingsJson
} from './types'
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

//const CONFIG_FILE_VERSION = 1

const initialState: RSettings = {
  palettes: fp.mkArray(4, () => fp.mkArray(16, i => i)),
  vic20palettes: fp.mkArray(2, () => fp.mkArray(16, i => i)),
  petpalettes: fp.mkArray(3, () => fp.mkArray(16, i => i)),
  selectedColorPalette: 'petmate',
  selectedVic20ColorPalette: 'vic20ntsc',
  selectedPetColorPalette: 'petwhite',
  integerScale: false,
  ultimateAddress: 'http://192.168.1.29',
}

function saveSettings(settings: RSettings) {
  let settingsFile = path.join(electron.remote.app.getPath('userData'), 'Settings')
  const j = JSON.stringify(settings)
  fs.writeFileSync(settingsFile, j, 'utf-8')
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
  return {
    palettes: json.palettes === undefined ? init.palettes : json.palettes,
    vic20palettes: json.vic20palettes === undefined ? init.vic20palettes : json.vic20palettes,
    petpalettes: json.petpalettes === undefined ? init.petpalettes : json.petpalettes,
    selectedColorPalette: json.selectedColorPalette === undefined ? init.selectedColorPalette : json.selectedColorPalette,
    selectedVic20ColorPalette: json.selectedVic20ColorPalette === undefined ? init.selectedVic20ColorPalette : json.selectedVic20ColorPalette,
    selectedPetColorPalette: json.selectedPetColorPalette === undefined ? init.selectedPetColorPalette : json.selectedPetColorPalette,
    ultimateAddress: json.ultimateAddress === undefined ? init.ultimateAddress : json.ultimateAddress,
    integerScale: fp.maybeDefault(json.integerScale, false)
  }
}

function saveEdits (): ThunkAction<void, RootState, undefined, Action> {
  return (dispatch, _getState) => {
    dispatch(actions.saveEditsAction());
    dispatch((_dispatch, getState) => {
      const state = getState().settings
      saveSettings(state.saved)
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
  setUltimateAddress: (data: SetUltimateAddressArgs) => createAction(SET_ULTIMATE_ADDRESS, data)

};

type Actions = ActionsUnion<typeof actionCreators>

export const actions = {
  ...actionCreators,
  saveEdits,
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
          palettes: fp.arraySet(state[VIC20branch].palettes, action.data.idx, action.data.palette)
        });
        case SET_PET_PALETTE:
          const PETbranch: EditBranch = action.data.branch;
          return updateBranch(state, action.data.branch, {
            palettes: fp.arraySet(state[PETbranch].palettes, action.data.idx, action.data.palette)
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
    default:
      return state;
  }
}
