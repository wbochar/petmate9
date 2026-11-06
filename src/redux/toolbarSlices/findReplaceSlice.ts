// Find & Replace domain slice, extracted from redux/toolbar.ts (Group L /
// L1-L7). This is a pure code-organization split: the action type strings,
// state field names, and logic are byte-for-byte identical to what used to
// live inline in toolbar.ts's single actionCreators object / Toolbar.actions
// / Toolbar.reducer switch. `Toolbar` (toolbar.ts) spreads
// `findReplaceActionCreators` and `findReplaceThunks` into its own
// `actions`, and folds `findReplaceReducer` into its `reducer` -- see
// toolbar.ts for the composition. The state shape (`RootState['toolbar']`)
// and the public `Toolbar.actions`/`Toolbar.reducer` surface are unchanged.

import { Action } from 'redux';
import { RootStateThunk, Pixel } from '../types';
import { createAction, updateField } from '../typeUtils';
import * as selectors from '../selectors';
import * as screensSelectors from '../screensSelectors';
import { Framebuffer } from '../editor';
import { effectiveAttr, withColor, VDC_ATTR_ALTCHAR } from '../../utils/vdcAttr';
import { resolveEffectivePixel, EffectivePixelOptions } from '../../utils/effectivePixel';

export const findReplaceActionCreators = {
  setFindReplaceWidth: (w: number) => createAction('Toolbar/SET_FIND_REPLACE_WIDTH', w),
  setFindReplaceHeight: (h: number) => createAction('Toolbar/SET_FIND_REPLACE_HEIGHT', h),
  setFindReplaceReplaceWidth: (w: number) => createAction('Toolbar/SET_FIND_REPLACE_REPLACE_WIDTH', w),
  setFindReplaceReplaceHeight: (h: number) => createAction('Toolbar/SET_FIND_REPLACE_REPLACE_HEIGHT', h),
  setFindReplaceFind: (pattern: Pixel[][] | null) => createAction('Toolbar/SET_FIND_REPLACE_FIND', pattern),
  setFindReplaceReplace: (pattern: Pixel[][] | null) => createAction('Toolbar/SET_FIND_REPLACE_REPLACE', pattern),
  setFindReplaceReplaceWhat: (what: 'both' | 'chars' | 'color') => createAction('Toolbar/SET_FIND_REPLACE_REPLACE_WHAT', what),
  setFindReplaceAllFrames: (flag: boolean) => createAction('Toolbar/SET_FIND_REPLACE_ALL_FRAMES', flag),
  setFindReplaceMode: (mode: 'first' | 'all') => createAction('Toolbar/SET_FIND_REPLACE_MODE', mode),
};

export const findReplaceThunks = {
  /** Paste the current brush selection into the Find pattern,
   *  auto-setting width and height. */
  findReplacePasteFind: (): RootStateThunk => {
    return (dispatch, getState) => {
      const state = getState();
      const b = state.toolbar.brush;
      if (b === null) return;
      const h = b.framebuf.length;
      const w = h > 0 ? b.framebuf[0].length : 0;
      if (h === 0 || w === 0) return;
      dispatch(findReplaceActionCreators.setFindReplaceFind(b.framebuf));
      dispatch(findReplaceActionCreators.setFindReplaceWidth(w));
      dispatch(findReplaceActionCreators.setFindReplaceHeight(h));
      // Auto-resize replace to match if it exists with different dims
      const rep = state.toolbar.findReplaceReplace;
      if (rep !== null) {
        const rh = rep.length;
        const rw = rh > 0 ? rep[0].length : 0;
        if (rh !== h || rw !== w) {
          dispatch(findReplaceActionCreators.setFindReplaceReplace(null));
        }
      }
    };
  },

  /** Paste the current brush selection into the Replace pattern.
   *  Uses the replace dimension fields (independent from find). */
  findReplacePasteReplace: (): RootStateThunk => {
    return (dispatch, getState) => {
      const state = getState();
      const b = state.toolbar.brush;
      if (b === null) return;
      const bh = b.framebuf.length;
      const bw = bh > 0 ? b.framebuf[0].length : 0;
      if (bh === 0 || bw === 0) return;
      dispatch(findReplaceActionCreators.setFindReplaceReplace(b.framebuf));
      dispatch(findReplaceActionCreators.setFindReplaceReplaceWidth(bw));
      dispatch(findReplaceActionCreators.setFindReplaceReplaceHeight(bh));
    };
  },

  /** Execute find and replace on the current frame (or all frames). */
  findReplaceExecute: (): RootStateThunk => {
    return (dispatch, getState) => {
      const state = getState();
      const { findReplaceFind: find, findReplaceReplace: replace,
              findReplaceReplaceWhat: replaceWhat,
              findReplaceAllFrames: allFrames,
              findReplaceMode: mode,
              findReplaceReplaceWidth: rw,
              findReplaceReplaceHeight: rh } = state.toolbar;
      if (!find || !replace) return;
      const fh = find.length;
      const fw = fh > 0 ? find[0].length : 0;
      if (fh === 0 || fw === 0) return;

      // Compares the glyph/colour "identity" relevant to the active
      // replaceWhat mode via the shared effective-pixel resolver, instead
      // of raw `.code`/`.color` fields. On VDC frames the ALTCHAR bit is
      // part of a glyph's actual visual identity (two cells with the same
      // `code` but different ALTCHAR banks render completely different
      // characters) and the colour nibble lives inside `.attr` once it's
      // present rather than in the legacy `.color` field -- raw-field
      // comparisons silently ignored both, matching cells that don't
      // actually look alike (or missing ones that do).
      const matchPattern = (fb: Pixel[][], startRow: number, startCol: number, opts: EffectivePixelOptions): boolean => {
        for (let r = 0; r < fh; r++) {
          for (let c = 0; c < fw; c++) {
            const cell = fb[startRow + r][startCol + c];
            const pat = find[r][c];
            if (replaceWhat !== 'color') {
              if (resolveEffectivePixel(cell, opts).glyph !== resolveEffectivePixel(pat, opts).glyph) return false;
            }
            if (replaceWhat !== 'chars') {
              if (resolveEffectivePixel(cell, opts).color !== resolveEffectivePixel(pat, opts).color) return false;
            }
          }
        }
        return true;
      };

      // Did applying a replace at (startRow, startCol) actually change any
      // cell within the replaced rectangle? Used to stop an 'all'-mode pass
      // early when find/replace patterns are equivalent under the active
      // replaceWhat mode (e.g. identical patterns) -- without this, such a
      // no-op replace would re-match at the same origin on every rescan and
      // only stop once MAX_ITERATIONS is exhausted.
      const regionChanged = (before: Pixel[][], after: Pixel[][], startRow: number, startCol: number): boolean => {
        for (let r = 0; r < rh; r++) {
          for (let c = 0; c < rw; c++) {
            const destR = startRow + r;
            const destC = startCol + c;
            if (destR >= before.length || destC >= before[destR].length) continue;
            const a = before[destR][destC];
            const b = after[destR][destC];
            if (a.code !== b.code || a.color !== b.color || a.attr !== b.attr || a.transparent !== b.transparent) {
              return true;
            }
          }
        }
        return false;
      };

      const applyReplace = (fb: Pixel[][], startRow: number, startCol: number, fbWidth: number, fbHeight: number, opts: EffectivePixelOptions): Pixel[][] => {
        const out = fb.map(row => [...row]);
        for (let r = 0; r < rh; r++) {
          for (let c = 0; c < rw; c++) {
            const destR = startRow + r;
            const destC = startCol + c;
            if (destR >= fbHeight || destC >= fbWidth) continue;
            const rp = (r < replace.length && c < replace[r].length)
              ? replace[r][c]
              : { code: 0x20, color: 14 };
            const dest = out[destR][destC];
            if (replaceWhat === 'chars') {
              if (opts.isVdc) {
                // A chars-only replace must also carry over the
                // replacement pattern's ALTCHAR bank -- otherwise a
                // pattern captured from the other character bank writes
                // the right `code` but the wrong glyph (same code,
                // different bank), while the destination's existing
                // colour/reverse/underline/blink must be preserved
                // rather than clobbered by the replacement pattern's.
                const destAttr = effectiveAttr(dest);
                const repAttr = effectiveAttr(rp);
                const nextAttr = (destAttr & ~VDC_ATTR_ALTCHAR) | (repAttr & VDC_ATTR_ALTCHAR);
                out[destR][destC] = { ...dest, code: rp.code & 0xff, attr: nextAttr };
              } else {
                out[destR][destC] = { ...dest, code: rp.code };
              }
            } else if (replaceWhat === 'color') {
              if (opts.isVdc) {
                // A color-only replace must update the VDC attribute
                // byte's colour nibble, not just the legacy `.color`
                // field: effectiveAttr/the renderer prefer `.attr` once
                // it's present, so leaving it untouched made a
                // "color only" replace a silent no-op on any cell that
                // already had an attr byte.
                const destAttr = effectiveAttr(dest);
                const repColor = resolveEffectivePixel(rp, opts).color;
                out[destR][destC] = { ...dest, color: repColor, attr: withColor(destAttr, repColor) };
              } else {
                out[destR][destC] = { ...dest, color: rp.color };
              }
            } else {
              out[destR][destC] = { ...rp };
            }
          }
        }
        return out;
      };

      const processFrame = (framebufIndex: number) => {
        const fb = selectors.getFramebufByIndex(getState(), framebufIndex);
        if (!fb) return;
        let buf = fb.framebuf;
        const maxH = fb.height - fh;
        const maxW = fb.width - fw;
        if (maxH < 0 || maxW < 0) return;
        // Resolved per-frame (not once for the whole operation): in
        // 'all frames' mode, different screens can use different
        // charsets, and glyph/colour identity rules differ by platform.
        const opts: EffectivePixelOptions = {
          isVdc: fb.charset === 'c128vdc',
          isTed: fb.charset.startsWith('c16'),
        };

        let replaced = false;
        const MAX_ITERATIONS = 10000; // safety cap
        let iterations = 0;

        // Scans for the first match and applies a replace there. Returns
        // `matched: false` when no occurrence was found at all, or
        // `{ matched: true, changed }` where `changed` indicates whether the
        // replace actually altered any cell (false e.g. when find/replace
        // are equivalent under the active replaceWhat mode).
        const doPass = (): { matched: boolean; changed: boolean } => {
          for (let r = 0; r <= maxH; r++) {
            for (let c = 0; c <= maxW; c++) {
              if (matchPattern(buf, r, c, opts)) {
                const next = applyReplace(buf, r, c, fb.width, fb.height, opts);
                const changed = regionChanged(buf, next, r, c);
                buf = next;
                return { matched: true, changed };
              }
            }
          }
          return { matched: false, changed: false };
        };

        if (mode === 'first') {
          replaced = doPass().matched;
        } else {
          // 'all' mode: replace first match, rescan from the top so any newly
          // formed matches (cascading replacements) are also caught, and
          // repeat until no more matches are found. Bounded by both
          // MAX_ITERATIONS and an early stop once a replace makes no actual
          // change (which would otherwise re-match at the same origin on
          // every subsequent rescan forever).
          while (iterations < MAX_ITERATIONS) {
            const { matched, changed } = doPass();
            if (!matched) break;
            replaced = true;
            iterations++;
            if (!changed) break;
          }
        }

        if (replaced) {
          dispatch(Framebuffer.actions.setFields({ framebuf: buf }, framebufIndex));
        }
      };

      if (allFrames) {
        const screens = screensSelectors.getScreens(state);
        for (const fbIdx of screens) {
          processFrame(fbIdx);
        }
      } else {
        const fbIdx = screensSelectors.getCurrentScreenFramebufIndex(state);
        if (fbIdx !== null) processFrame(fbIdx);
      }
    };
  },
};

/** Handles only the SET_FIND_REPLACE_* action types, returning `state`
 *  unchanged for everything else -- composed into Toolbar.reducer's
 *  pipeline in toolbar.ts. `action` is loosely typed (rather than the full
 *  cross-domain `Actions` union) to avoid a circular type import with
 *  toolbar.ts; the switch only ever reads `action.data` after narrowing on
 *  a literal `action.type`, matching the original inline cases exactly. */
export function findReplaceReducer<State extends {
  findReplaceWidth: number;
  findReplaceHeight: number;
  findReplaceReplaceWidth: number;
  findReplaceReplaceHeight: number;
  findReplaceFind: Pixel[][] | null;
  findReplaceReplace: Pixel[][] | null;
  findReplaceReplaceWhat: 'both' | 'chars' | 'color';
  findReplaceAllFrames: boolean;
  findReplaceMode: 'first' | 'all';
}>(state: State, action: Action<string> & { data?: any }): State {
  switch (action.type) {
    case 'Toolbar/SET_FIND_REPLACE_WIDTH':
      return updateField(state, 'findReplaceWidth', Math.max(1, action.data));
    case 'Toolbar/SET_FIND_REPLACE_HEIGHT':
      return updateField(state, 'findReplaceHeight', Math.max(1, action.data));
    case 'Toolbar/SET_FIND_REPLACE_REPLACE_WIDTH':
      return updateField(state, 'findReplaceReplaceWidth', Math.max(1, action.data));
    case 'Toolbar/SET_FIND_REPLACE_REPLACE_HEIGHT':
      return updateField(state, 'findReplaceReplaceHeight', Math.max(1, action.data));
    case 'Toolbar/SET_FIND_REPLACE_FIND':
      return updateField(state, 'findReplaceFind', action.data);
    case 'Toolbar/SET_FIND_REPLACE_REPLACE':
      return updateField(state, 'findReplaceReplace', action.data);
    case 'Toolbar/SET_FIND_REPLACE_REPLACE_WHAT':
      return updateField(state, 'findReplaceReplaceWhat', action.data);
    case 'Toolbar/SET_FIND_REPLACE_ALL_FRAMES':
      return updateField(state, 'findReplaceAllFrames', action.data);
    case 'Toolbar/SET_FIND_REPLACE_MODE':
      return updateField(state, 'findReplaceMode', action.data);
    default:
      return state;
  }
}
