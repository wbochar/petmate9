import { Coord2, BrushRegion } from '../../redux/types';
import { drawCharLine, drawChunkyLine, drawCharCircle, drawChunkyCircle, LinePixel } from '../../utils/chunkyLine';
import * as utils from '../../utils';

type PixelChange = { row: number; col: number; screencode: number; color: number; attrFlags?: number };
type SubPixel = { subCol: number; subRow: number };

// Extracted from containers/Editor.tsx's FramebufferView (Group L /
// L8-L11b) as plain functions taking an explicit context object.
// FramebufferView's own lineDrawClick method and dragEnd's Circles branch
// forward `this` through to these -- pure code-motion, no behavior change.

/** The subset of FramebufferView's props/instance methods the Line Draw
 *  tool's click handler needs. */
export interface LineDrawContext {
  props: {
    lineDrawActive: boolean;
    lineDrawPoints: Coord2[];
    lineDrawChunkyMode: boolean;
    curScreencode: number;
    framebufWidth: number;
    framebufHeight: number;
    undoId: number | null;
    Framebuffer: {
      setPixels: (pixelChanges: PixelChange[], undoId: number | null) => void;
    };
    Toolbar: {
      setLineDrawPoints: (points: Coord2[]) => void;
      setLineDrawActive: (flag: boolean) => void;
      incUndoId: () => void;
    };
  };
  currentPaintColor(): number;
  vdcAttrPayload(): { attrFlags?: number };
  /** `lineDrawSubPixels` is a plain mutable instance field on
   *  FramebufferView (not redux state) -- these accessors let this module
   *  read/replace it without reaching into FramebufferView's internals
   *  directly. */
  getLineDrawSubPixels(): SubPixel[];
  setLineDrawSubPixels(subPixels: SubPixel[]): void;
}

/** Line Draw tool: click-based point placement (no dragging). The first
 *  click in a session sets the start point; every subsequent click draws a
 *  line from the last point to the new one using the current screencode,
 *  then extends the point list so the next click continues the chain. */
export function lineDrawClick(ctx: LineDrawContext, coord: Coord2, sub: SubPixel): void {
  if (!ctx.props.lineDrawActive) {
    // First click: set start point
    ctx.setLineDrawSubPixels([sub]);
    ctx.props.Toolbar.setLineDrawPoints([coord]);
    ctx.props.Toolbar.setLineDrawActive(true);
  } else {
    // Subsequent click: draw line from last point to current
    const points = ctx.props.lineDrawPoints;
    const lastPoint = points[points.length - 1];
    const subPixels = ctx.getLineDrawSubPixels();
    const lastSub = subPixels[subPixels.length - 1] || { subCol: 0, subRow: 0 };

    let linePixels: LinePixel[];
    if (ctx.props.lineDrawChunkyMode) {
      linePixels = drawChunkyLine(
        lastPoint.col, lastPoint.row, coord.col, coord.row,
        lastSub.subCol, lastSub.subRow, sub.subCol, sub.subRow
      );
    } else {
      linePixels = drawCharLine(
        lastPoint.col, lastPoint.row, coord.col, coord.row,
        ctx.props.curScreencode
      );
    }

    const pixelChanges = linePixels
      .filter(p => p.col >= 0 && p.col < ctx.props.framebufWidth && p.row >= 0 && p.row < ctx.props.framebufHeight)
      .map(p => ({ row: p.row, col: p.col, screencode: p.code, color: ctx.currentPaintColor(), ...ctx.vdcAttrPayload() }));
    if (pixelChanges.length > 0) {
      ctx.props.Framebuffer.setPixels(pixelChanges, ctx.props.undoId);
      ctx.props.Toolbar.incUndoId();
    }
    ctx.setLineDrawSubPixels([...subPixels, sub]);
    ctx.props.Toolbar.setLineDrawPoints([...points, coord]);
  }
}

/** The subset of FramebufferView's props/instance methods the Circles
 *  tool's drag-commit needs. */
export interface CircleDrawContext {
  props: {
    lineDrawChunkyMode: boolean;
    curScreencode: number;
    framebufWidth: number;
    framebufHeight: number;
    undoId: number | null;
    Framebuffer: {
      setPixels: (pixelChanges: PixelChange[], undoId: number | null) => void;
    };
    Toolbar: {
      resetBrush: () => void;
    };
  };
  currentPaintColor(): number;
  vdcAttrPayload(): { attrFlags?: number };
}

/** Circles tool: draw an ellipse fitted to the dragged bounding box
 *  (dragEnd commit). */
export function commitCircleDrag(ctx: CircleDrawContext, brushRegion: BrushRegion): void {
  const { min, max } = utils.sortRegion(brushRegion);
  let circlePixels: LinePixel[];
  if (ctx.props.lineDrawChunkyMode) {
    circlePixels = drawChunkyCircle(min.col, min.row, max.col, max.row);
  } else {
    circlePixels = drawCharCircle(min.col, min.row, max.col, max.row, ctx.props.curScreencode);
  }
  const pixelChanges = circlePixels
    .filter(p => p.col >= 0 && p.col < ctx.props.framebufWidth && p.row >= 0 && p.row < ctx.props.framebufHeight)
    .map(p => ({ row: p.row, col: p.col, screencode: p.code, color: ctx.currentPaintColor(), ...ctx.vdcAttrPayload() }));
  if (pixelChanges.length > 0) {
    ctx.props.Framebuffer.setPixels(pixelChanges, ctx.props.undoId);
  }
  ctx.props.Toolbar.resetBrush();
}
