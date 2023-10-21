
import {
  ResizeSettings as RSettings,
  ResizeSaved,
} from './types'
import { ActionsUnion, DispatchPropsFromActions, createAction } from './typeUtils'


const SAVE_HEIGHT = 'SAVE_HEIGHT'
const SAVE_WIDTH = 'SAVE_WIDTH'
const GET_WIDTH = 'GET_WIDTH'

const initialState: RSettings = {
 width:66,
 height:66,
 dir: {row:0,col:0}

}




const actionCreators = {
  saveHeight:(height:number) => createAction(SAVE_HEIGHT, height),
  saveWidth:(width:number) => createAction(SAVE_WIDTH, width),
  getWidth:() => createAction(GET_WIDTH)
};

type Actions = ActionsUnion<typeof actionCreators>

export const actions = {
  ...actionCreators,

};

export type PropsFromDispatch = DispatchPropsFromActions<typeof actions>;

export function reducer(
  state: ResizeSaved<RSettings> = {
    width: initialState ,   // final state for rest of UI and persistence
    height: initialState,
    dir: initialState,
  },
  action: Actions
): ResizeSaved<RSettings> {
  switch (action.type) {
    case SAVE_WIDTH:
      console.log("state.width",state.width);
      return {
        ...state,
        width: state.width
      }
    case SAVE_HEIGHT:
      return {
        ...state,
        height: state.width
      }
    default:
      return state;
  }
}

