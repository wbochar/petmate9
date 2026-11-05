import { reducer, actions, UNDO_HISTORY_LIMIT } from './framebufList';
import { actions as fbActions } from './editor';
import { UndoableFramebuf } from './types';

function makeInitialState(): UndoableFramebuf[] {
  return reducer([], actions.addFramebuf({ width: 4, height: 2 }));
}

// Dispatch `count` distinct, unfiltered, ungrouped tracked edits against
// framebuf index 0 -- each with its own undoId so every one pushes a
// separate undo-history entry (mirrors how separate user actions, each
// with their own dragEnd()-sealed undoId, accumulate over a long session).
function applyNEdits(state: UndoableFramebuf[], count: number): UndoableFramebuf[] {
  let s = state;
  for (let i = 0; i < count; i++) {
    s = reducer(s, fbActions.setPixel({ row: 0, col: 0, screencode: i % 256, color: 1 }, i, 0));
  }
  return s;
}

describe('framebufList undo history limit (B9)', () => {
  it('does not yet cap history below the limit', () => {
    let state = makeInitialState();
    state = applyNEdits(state, UNDO_HISTORY_LIMIT - 1);
    expect(state[0].past.length).toBeLessThanOrEqual(UNDO_HISTORY_LIMIT);
    expect(state[0].past.length).toBeGreaterThan(0);
  });

  it('caps past history at UNDO_HISTORY_LIMIT when exceeded', () => {
    let state = makeInitialState();
    // Apply far more tracked edits than the limit.
    state = applyNEdits(state, UNDO_HISTORY_LIMIT + 50);
    expect(state[0].past.length).toBeLessThanOrEqual(UNDO_HISTORY_LIMIT);
  });

  it('drops the oldest entries first, keeping the most recent history', () => {
    let state = makeInitialState();
    state = applyNEdits(state, UNDO_HISTORY_LIMIT + 10);
    // The present should reflect the very last edit applied.
    expect(state[0].present.framebuf[0][0].code).toBe((UNDO_HISTORY_LIMIT + 10 - 1) % 256);
  });
});
