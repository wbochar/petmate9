
import { Action } from 'redux'
import { ActionCreators } from 'redux-undo';
import { ThunkAction } from 'redux-thunk';

import * as fp from '../utils/fp'

import * as rscreens from './screens';
import * as rcustomFonts from './customFonts';
import { Framebuffer, snapZoom, DEFAULT_ZOOM } from './editor';
import { Framebuf, RootState, WsCustomFontsV2 } from './types';
import * as Root from './root';
import * as screensSelectors from './screensSelectors';

import { Toolbar } from './toolbar';
interface WorkspaceJson {
  version: number;
  customFonts?: WsCustomFontsV2;
  screens: number[];
  framebufs: Framebuf[];
};

// ── Legacy-file sanitization ───────────────────────────────────────────────
// Older Petmate versions used `zoomLevel > 100` as a *sentinel* meaning
// "after import, set the canvas scale to (level - 100)" — the value was
// never meant to be a literal canvas scale factor. Some v3 files did end up
// persisting that sentinel to disk, which the new v4 loader would otherwise
// treat as `scale(102)` when building framebufUIState.canvasTransform.
// These helpers undo the sentinel and snap the value to a valid zoom level.
export function sanitizeZoomLevel(raw: unknown): number {
  if (typeof raw !== 'number' || !isFinite(raw)) {
    return DEFAULT_ZOOM.zoomLevel;
  }
  const normalized = raw > 100 ? raw - 100 : raw;
  return snapZoom(normalized);
}

export function sanitizeZoom(
  z: any,
  defaultAlignment: string = 'left',
): { zoomLevel: number; alignment: string } {
  const alignment =
    z && typeof z.alignment === 'string' ? z.alignment : defaultAlignment;
  return { zoomLevel: sanitizeZoomLevel(z?.zoomLevel), alignment };
}

/**
 * Normalize a Petmate workspace JSON to the shape the current loader expects.
 *
 * This is the single place where legacy-format compatibility lives. Today it
 * only rewrites bogus sentinel `zoom.zoomLevel` values on each framebuf, but
 * new migrations (e.g., defaulting missing fields introduced in later
 * workspace versions) belong here too.
 *
 * Running this on an already-current workspace is a no-op.
 */
export function migrateWorkspace(workspace: any): any {
  if (!workspace || !Array.isArray(workspace.framebufs)) {
    return workspace;
  }
  const framebufs = workspace.framebufs.map((fb: any) => {
    if (!fb) return fb;
    return { ...fb, zoom: sanitizeZoom(fb.zoom) };
  });
  return { ...workspace, framebufs };
}

export function framebufFromJson(c: any): Framebuf {
  const fb: Framebuf = {
    width: c.width,
    height: c.height,
    backgroundColor: c.backgroundColor,
    borderColor: c.borderColor,
    borderOn: c.borderOn  ?? false,
    framebuf: c.framebuf,
    charset: fp.maybeDefault(c.charset, 'upper'),
    name: fp.maybeDefault(c.name, undefined),
    zoom: sanitizeZoom(c.zoom, 'left'),
    zoomReady: c.zoomReady,
  };
  if (c.guideLayer) {
    (fb as any).guideLayer = c.guideLayer;
  }
  return fb;
}
export function framebufFromJsonD64(c: any): Framebuf {
  return {
    width: c.width,
    height: c.height,
    backgroundColor: c.backgroundColor,
    borderColor: c.borderColor,
    borderOn: c.borderOn ?? false,
    framebuf: c.framebuf,
    charset: fp.maybeDefault(c.charset, 'dirart'),
    name: fp.maybeDefault(c.name, undefined),
    zoom: sanitizeZoom(c.zoom, 'center'),
    zoomReady: c.zoomReady,
  }
}


export function load(workspaceInput: WorkspaceJson): ThunkAction<void, RootState, undefined, Action> {
  return (dispatch, _getState) => {
    dispatch(Root.actions.resetState())
    // Run legacy-format migration once up-front so the rest of load() can
    // assume a sanitized workspace (e.g., no sentinel zoom levels in
    // framebufs[*].zoom.zoomLevel).
    const workspace = migrateWorkspace(workspaceInput) as WorkspaceJson;
    const { screens, framebufs } = workspace;
    // Reconstitute guide images from shared pool (version >= 4)
    const guideImages: string[] = (workspace as any).guideImages || [];

    if (workspace.version >= 2 && workspace.customFonts) {
      const cfonts = workspace.customFonts;
      Object.entries(cfonts).forEach(([id, cf]) => {
        dispatch(rcustomFonts.actions.addCustomFont(id, cf.name, cf.font));
      });
    }

    // Restore per-frame UI state (zoom transform + scroll) if present
    const savedUIStates: any[] = (workspace as any).framebufUIStates || [];

    screens.forEach((fbIdx, screenIdx) => {
      if (fbIdx !== screenIdx) {
        console.warn('fbidx should be screenIdx, this should be ensured by workspace save code')
      }
      dispatch(rscreens.actions.newScreen())

      const fbJson = framebufs[fbIdx] as any;
      // Restore imageData from guideImages pool if stored by index
      if (fbJson.guideLayer && fbJson.guideLayer.guideImageIndex !== undefined && guideImages.length > 0) {
        const idx = fbJson.guideLayer.guideImageIndex;
        const { guideImageIndex, ...glRest } = fbJson.guideLayer;
        fbJson.guideLayer = { ...glRest, imageData: guideImages[idx] || null };
      }

      dispatch(Framebuffer.actions.importFile(
        framebufFromJson(fbJson),
        fbIdx
      ))

      // Reconstruct framebufUIState from saved data or from the zoom field
      const savedUI = savedUIStates[screenIdx];
      if (savedUI && savedUI.canvasTransform) {
        dispatch(Toolbar.actions.setFramebufUIState(fbIdx, savedUI));
      } else {
        // Fall back: build transform from saved zoom level
        const fb = framebufFromJson(fbJson);
        const zoomLevel = fb.zoom?.zoomLevel ?? 2;
        const { scale } = require('../utils/matrix');
        dispatch(Toolbar.actions.setFramebufUIState(fbIdx, {
          canvasTransform: scale(zoomLevel),
          canvasFit: 'nofit' as const,
          scrollX: 0,
          scrollY: 0,
        }));
      }

      dispatch({
        ...ActionCreators.clearHistory(),
        framebufIndex: fbIdx
      })
    })
    dispatch(rscreens.actions.setCurrentScreenIndex(0))
    dispatch(Root.actions.updateLastSavedSnapshot());
  }
}

// Typed wrapper until selectors are typed
function getCurrentScreenIndex(state: RootState): number {
  return screensSelectors.getCurrentScreenIndex(state);
}

export function importFramebufs(framebufs: Framebuf[], append: boolean): ThunkAction<void, RootState, undefined, Action> {
  if (!append) {
    throw new Error('only appending is supported');
  }
  return (dispatch, _getState) => {
    let firstNewScreenIdx = -1;
    framebufs.forEach((framebuf) => {
      dispatch(rscreens.actions.newScreen())
      dispatch((dispatch, getState) => {
        const state = getState()
        const newScreenIdx = getCurrentScreenIndex(state);
        if (firstNewScreenIdx === -1) {
          firstNewScreenIdx = newScreenIdx
        }
        const newFramebufIdx = screensSelectors.getScreens(state)[newScreenIdx]
        dispatch(Framebuffer.actions.importFile(framebuf, newFramebufIdx))
        dispatch(Toolbar.actions.setZoom(102,'left'))
      })
    })
    dispatch(rscreens.actions.setCurrentScreenIndex(firstNewScreenIdx))

  };
}
