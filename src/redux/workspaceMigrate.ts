// Pure workspace-migration helpers.  Kept dependency-free of electron/redux
// so they can be unit-tested under jsdom without bringing the whole desktop
// runtime along for the ride.

import { snapZoom, DEFAULT_ZOOM } from './editor';
import { VDC_ATTR_ALTCHAR } from '../utils/vdcAttr';

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
 * Migrate a legacy 80-column C128 framebuf saved with `c128Upper` or
 * `c128Lower` charset over to the new dedicated `c128vdc` charset.  Every
 * existing cell keeps its glyph; cells that came from `c128Lower` get the
 * VDC alt-charset attribute bit set so the rendered output stays the same.
 */
export function migrateLegacyVdcFramebuf(fb: any): any {
  if (!fb || typeof fb !== 'object') return fb;
  const charset = fb.charset;
  const width: number = typeof fb.width === 'number' ? fb.width : 0;
  if (width < 80) return fb;
  if (charset !== 'c128Upper' && charset !== 'c128Lower') return fb;
  const wasLower = charset === 'c128Lower';
  const framebuf = Array.isArray(fb.framebuf) ? fb.framebuf.map((row: any) => {
    if (!Array.isArray(row)) return row;
    return row.map((cell: any) => {
      if (!cell || typeof cell !== 'object') return cell;
      const baseAttr = (typeof cell.attr === 'number' ? cell.attr : (cell.color & 0x0f)) | 0;
      const attr = wasLower ? (baseAttr | VDC_ATTR_ALTCHAR) : baseAttr;
      return { ...cell, attr: attr & 0xff };
    });
  }) : fb.framebuf;
  return { ...fb, charset: 'c128vdc', columnMode: 80, framebuf };
}

/**
 * Normalize a Petmate workspace JSON to the shape the current loader expects.
 * Today it only:
 *  1. rewrites bogus sentinel `zoom.zoomLevel` values on each framebuf, and
 *  2. upgrades legacy 80-col c128Upper/c128Lower framebufs to c128vdc.
 *
 * Running this on an already-current workspace is a no-op.
 */
export function migrateWorkspace(workspace: any): any {
  if (!workspace || !Array.isArray(workspace.framebufs)) {
    return workspace;
  }
  const framebufs = workspace.framebufs.map((fb: any) => {
    if (!fb) return fb;
    const migrated = migrateLegacyVdcFramebuf(fb);
    const normalizedColumnMode = migrated.charset === 'c128vdc'
      ? 80
      : migrated.columnMode;
    return { ...migrated, columnMode: normalizedColumnMode, zoom: sanitizeZoom(migrated.zoom) };
  });
  return { ...workspace, framebufs };
}

export interface WorkspaceValidationResult {
  valid: boolean;
  /** Human-readable reason the workspace was rejected. Only set when `valid` is false. */
  reason?: string;
}

/**
 * Sanity-check a single framebuf's shape -- the parts `copyFramebuf`/
 * `importFile`/rendering code all assume hold without checking themselves
 * (positive integer width/height, and a `framebuf` 2D array whose
 * dimensions actually match them). Shared by `validateWorkspace` (one
 * framebuf per screen) and the clipboard copy/paste protocol (see
 * `utils/clipboardFramebuffer.ts`), so a malformed value can't crash or
 * silently corrupt either load path.
 *
 * `label` is prefixed onto the rejection reason, e.g. "Workspace file's
 * screen 2" or "Pasted clipboard data".
 */
export function validateFramebufShape(fb: any, label: string): WorkspaceValidationResult {
  if (!fb || typeof fb !== 'object') {
    return { valid: false, reason: `${label} has no framebuffer data.` };
  }
  const width = fb.width;
  const height = fb.height;
  if (typeof width !== 'number' || !Number.isInteger(width) || width <= 0) {
    return { valid: false, reason: `${label} has an invalid width.` };
  }
  if (typeof height !== 'number' || !Number.isInteger(height) || height <= 0) {
    return { valid: false, reason: `${label} has an invalid height.` };
  }
  if (!Array.isArray(fb.framebuf) || fb.framebuf.length !== height) {
    return { valid: false, reason: `${label} pixel data doesn't match its declared height.` };
  }
  for (const row of fb.framebuf) {
    if (!Array.isArray(row) || row.length !== width) {
      return { valid: false, reason: `${label} pixel data doesn't match its declared width.` };
    }
  }
  return { valid: true };
}

/**
 * Sanity-check a workspace JSON payload *before* any part of it is used to
 * replace the current document.
 *
 * `workspace.load()` previously dispatched `Root.actions.resetState()`
 * first and only discovered a malformed file afterward -- when iterating
 * `screens`/`framebufs` threw partway through -- which destroyed whatever
 * document the user had open before the error was ever surfaced. Call this
 * first (after `migrateWorkspace`) and bail out on failure instead of
 * resetting anything.
 *
 * This is a shape/consistency check, not a deep per-pixel validator -- it
 * exists to guarantee `workspace.load()`'s iteration over
 * `screens`/`framebufs` can't throw partway through, not to reject every
 * possible malformed value.
 */
export function validateWorkspace(workspace: any): WorkspaceValidationResult {
  if (!workspace || typeof workspace !== 'object') {
    return { valid: false, reason: 'Workspace file is not a valid JSON object.' };
  }
  if (!Array.isArray(workspace.screens)) {
    return { valid: false, reason: 'Workspace file is missing its "screens" list.' };
  }
  if (!Array.isArray(workspace.framebufs)) {
    return { valid: false, reason: 'Workspace file is missing its "framebufs" list.' };
  }
  if (workspace.screens.length === 0) {
    return { valid: false, reason: 'Workspace file has no screens.' };
  }
  for (const fbIdx of workspace.screens) {
    if (typeof fbIdx !== 'number' || !Number.isInteger(fbIdx) || fbIdx < 0 || fbIdx >= workspace.framebufs.length) {
      return { valid: false, reason: `Workspace file references an invalid screen index (${fbIdx}).` };
    }
    const fb = workspace.framebufs[fbIdx];
    const result = validateFramebufShape(fb, `Workspace file's screen ${fbIdx}`);
    if (!result.valid) {
      return result;
    }
  }
  return { valid: true };
}
