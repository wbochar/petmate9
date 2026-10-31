
import { combineReducers } from 'redux'
import * as toolbar from '../redux/toolbar'
import * as settings from '../redux/settings'
import * as screens from '../redux/screens'
import * as framebufList from '../redux/framebufList'
import * as customFonts from '../redux/customFonts';
import * as Root from '../redux/root'
import * as fp from '../utils/fp'

import { RootState, LastSavedState } from '../redux/types'

const rootReducer = combineReducers({
  framebufList: framebufList.reducer,
  toolbar: toolbar.Toolbar.reducer,
  screens: screens.reducer,
  settings: settings.reducer,
  customFonts: customFonts.reducer,
  lastSavedSnapshot: lastSavedSnapshotDummyReducer,

})

// This is because of the above combineReducers.  Every top-level
// field in rootReducer must have an accompanying reducer.  This is
// only used here for initializing this state branch to its init value.
function lastSavedSnapshotDummyReducer(state: LastSavedState = {
  screenList: [],
  framebufs: [],
  customFonts: {}
}, _action: any) {
  return state;
}

const rootReducerTop = (
  state: RootState,
  action: screens.Actions | Root.Actions | framebufList.Actions | toolbar.Actions
): RootState => {
  switch (action.type) {
    case Root.RESET_STATE:
      return rootReducer(undefined, action)
    case screens.ADD_SCREEN_AND_FRAMEBUF: {
      const newFramebufs =
        framebufList.reducer(state.framebufList, framebufList.actions.addFramebuf(state.toolbar.newScreenSize));
      const fbs = newFramebufs
      const fbidx = fbs.length-1
      let insertAfterIndex = action.data;
      if (insertAfterIndex === undefined) {
        insertAfterIndex = state.screens.list.length-1
      }
      const newScreens =
        screens.reducer(state.screens, screens.actions.addScreen(fbidx, insertAfterIndex))
      const newScreens2 =
        screens.reducer(newScreens, screens.actions.setCurrentScreenIndex(insertAfterIndex+1))
      const newToolbar =
        toolbar.Toolbar.reducer(state.toolbar, toolbar.Toolbar.actions.setFramebufUIState(fbidx, undefined));
      return {
        ...state,
        toolbar: newToolbar,
        framebufList: newFramebufs,
        screens: newScreens2
      }
    }
    case Root.UPDATE_LAST_SAVED_SNAPSHOT: {
      return {
        ...state,
        lastSavedSnapshot: {
          screenList: state.screens.list,
          framebufs: state.framebufList.map(fb => fb.present),
          customFonts: state.customFonts
        }
      }
    }
    case screens.REMOVE_SCREEN_AND_FRAMEBUF: {
      const screenIndex = action.data as number;
      const removedFbId = state.screens.list[screenIndex];
      if (removedFbId === undefined) {
        return state;
      }

      const listWithoutScreen = fp.arrayRemoveAt(state.screens.list, screenIndex);
      // Every remaining screen's framebuf id that sat after the removed
      // one shifts down by one once framebufList is spliced below.
      const remappedList = listWithoutScreen.map(id => id > removedFbId ? id - 1 : id);

      // Only move `current` off of the removed screen (or shift it left
      // when a screen before it was removed); leave it alone otherwise so
      // removing some other tab doesn't force the user off what they're
      // actively editing.
      let newCurrent = state.screens.current;
      if (screenIndex < state.screens.current) {
        newCurrent = state.screens.current - 1;
      } else if (screenIndex === state.screens.current) {
        newCurrent = Math.min(state.screens.current, remappedList.length - 1);
      }

      const newFramebufList = fp.arrayRemoveAt(state.framebufList, removedFbId);

      const newFramebufUIState: typeof state.toolbar.framebufUIState = {};
      for (const key of Object.keys(state.toolbar.framebufUIState)) {
        const id = Number(key);
        if (id === removedFbId) continue;
        newFramebufUIState[id > removedFbId ? id - 1 : id] = state.toolbar.framebufUIState[id];
      }

      // lastSavedSnapshot.framebufs is a positional (index-aligned) snapshot
      // of framebufList as of the last save -- see UPDATE_LAST_SAVED_SNAPSHOT
      // below. Without removing the same index here, every remaining
      // framebuf's position shifts down by one in framebufList but NOT in
      // the snapshot, so anyUnsavedChangesInFramebuf (which compares by raw
      // index) ends up diffing each shifted framebuf against its neighbor's
      // stale baseline instead of its own -- producing spurious per-screen
      // "unsaved changes" prompts for screens the user never touched, until
      // the next save realigns the two arrays.
      const newLastSavedFramebufs = removedFbId < state.lastSavedSnapshot.framebufs.length
        ? fp.arrayRemoveAt(state.lastSavedSnapshot.framebufs, removedFbId)
        : state.lastSavedSnapshot.framebufs;

      return {
        ...state,
        screens: { list: remappedList, current: newCurrent },
        framebufList: newFramebufList,
        toolbar: { ...state.toolbar, framebufUIState: newFramebufUIState },
        lastSavedSnapshot: { ...state.lastSavedSnapshot, framebufs: newLastSavedFramebufs },
      };
    }
  }
  return rootReducer(state, action)
}

export default rootReducerTop
