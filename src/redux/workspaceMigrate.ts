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
