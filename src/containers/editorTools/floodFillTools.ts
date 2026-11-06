import { Coord2, Pixel } from '../../redux/types';
import { effectivePixelsEqual, EffectivePixelOptions } from '../../utils/effectivePixel';

/** The subset of FramebufferView's props/instance methods the flood-fill /
 *  bucket-fill / replace-all algorithms below need. FramebufferView
 *  satisfies this interface structurally, so its own
 *  SetFloodFill/SetTextureFloodFill/SetTextureReplaceAll/
 *  validFloodCoordinates methods (see containers/Editor.tsx) just forward
 *  `this` straight through to these functions -- this is a pure code-motion
 *  extraction (Group L / L8-L11b), not a behavior change. */
export interface FloodFillContext {
  props: {
    framebuf: Pixel[][];
    framebufWidth: number;
    framebufHeight: number;
    curScreencode: number;
    ctrlKey: boolean;
    undoId: number | null;
    textureForceForeground: boolean;
    Framebuffer: {
      setPixels: (
        pixelChanges: { row: number; col: number; screencode: number; color: number; attrFlags?: number }[],
        undoId: number | null,
      ) => void;
    };
  };
  currentPaintColor(): number;
  vdcAttrPayload(): { attrFlags?: number };
  effectivePixelOptions(): EffectivePixelOptions;
  transparentScreencode(): number;
  validCoordinates(coords: Coord2): boolean;
  /** Sample the canvas-anchored texture pattern at canvas-absolute (row,
   *  col) -- see Editor.tsx's sampleTexturePixel, which this delegates to
   *  for both the bucket-fill and replace-all paths below. */
  sampleTexturePixel(row: number, col: number): Pixel | null;
}

/** Returns true if `coords` is in-bounds AND its cell matches `sourcePixel`
 *  under the active platform's effective-pixel rules (see
 *  utils/effectivePixel.ts) -- VDC ALTCHAR-only differences between two
 *  cells with the same raw code/color are NOT treated as a match. */
export function validFloodCoordinates(ctx: FloodFillContext, coords: Coord2, sourcePixel: Pixel): boolean {
  return (
    ctx.validCoordinates(coords) &&
    effectivePixelsEqual(ctx.props.framebuf[coords.row][coords.col], sourcePixel, ctx.effectivePixelOptions())
  );
}

/** Flood Fill tool: BFS over 4-connected neighbors matching the clicked
 *  cell's exact (code, color), batching every matched cell into one
 *  Framebuffer.setPixels call. Right-click erases (blank, or transparent
 *  with Ctrl held). */
export function setFloodFill(ctx: FloodFillContext, startLoc: Coord2, isRightClick: boolean): void {
  const { undoId } = ctx.props;

  if (!ctx.validCoordinates(startLoc)) {
    return;
  }

  // Compared via effectivePixelsEqual below (not raw code/color) so VDC
  // ALTCHAR-only differences aren't treated as a match -- two cells with
  // the same code and color but a different ALTCHAR bank render completely
  // differently.
  const sourcePixel = ctx.props.framebuf[startLoc.row][startLoc.col];
  const sourceCode = sourcePixel.code;
  const sourceColor = sourcePixel.color;

  const destColor = ctx.currentPaintColor();
  let destCode = ctx.props.curScreencode;

  if (isRightClick) {
    destCode = ctx.props.ctrlKey ? ctx.transparentScreencode() : 32;
  }

  // Early exit if source and dest are identical (nothing to fill)
  if (sourceCode === destCode && sourceColor === destColor) {
    return;
  }

  // BFS with a Set for O(1) visited lookups instead of Array.find()
  const visited = new Set<string>();
  const queue: Coord2[] = [startLoc];
  const startKey = `${startLoc.row},${startLoc.col}`;
  visited.add(startKey);

  const pixelChanges: { row: number; col: number; screencode: number; color: number; attrFlags?: number }[] = [];
  const vdcExtras = ctx.vdcAttrPayload();

  while (queue.length > 0) {
    const current = queue.pop()!;
    pixelChanges.push({
      row: current.row,
      col: current.col,
      color: destColor,
      screencode: destCode,
      ...vdcExtras,
    });

    const { row, col } = current;
    const neighbors: Coord2[] = [
      { col, row: row + 1 },
      { col, row: row - 1 },
      { col: col + 1, row },
      { col: col - 1, row },
    ];

    for (const neighbor of neighbors) {
      const key = `${neighbor.row},${neighbor.col}`;
      if (!visited.has(key) && validFloodCoordinates(ctx, neighbor, sourcePixel)) {
        visited.add(key);
        queue.push(neighbor);
      }
    }
  }

  // Apply all pixel changes in a single batch dispatch
  if (pixelChanges.length > 0) {
    ctx.props.Framebuffer.setPixels(pixelChanges, undoId);
  }
}

/** Bucket-fill (Texture tool): BFS flood-fill over 4-connected neighbors
 *  matching the clicked cell's exact (code, color), mirroring
 *  setFloodFill's algorithm, but each matched cell is painted from the
 *  canvas-anchored texture layer at that cell's own (row, col) instead of
 *  a single flat replacement code/color. */
export function setTextureFloodFill(ctx: FloodFillContext, startLoc: Coord2): void {
  const { undoId } = ctx.props;
  if (!ctx.validCoordinates(startLoc)) {
    return;
  }

  // Compared via effectivePixelsEqual (not raw code/color) so VDC
  // ALTCHAR-only differences aren't treated as a match -- see
  // validFloodCoordinates/setFloodFill above.
  const sourcePixel = ctx.props.framebuf[startLoc.row][startLoc.col];

  const visited = new Set<string>();
  const queue: Coord2[] = [startLoc];
  const startKey = `${startLoc.row},${startLoc.col}`;
  visited.add(startKey);

  const pixelChanges: { row: number; col: number; screencode: number; color: number; attrFlags?: number }[] = [];
  const vdcExtras = ctx.vdcAttrPayload();
  const forceFg = ctx.props.textureForceForeground;
  const fgColor = ctx.currentPaintColor();

  while (queue.length > 0) {
    const current = queue.pop()!;
    // Sampled lazily per visited cell instead of building a full
    // framebufWidth x framebufHeight texture grid up front -- this runs
    // once per cell entered while dragging, so a prebuilt whole-canvas grid
    // was reallocated on every single dragged-over cell even though a
    // flood-fill region is typically a small fraction of the canvas.
    const texPix = ctx.sampleTexturePixel(current.row, current.col);
    if (texPix) {
      pixelChanges.push({
        row: current.row,
        col: current.col,
        screencode: texPix.code,
        color: forceFg ? fgColor : texPix.color,
        ...vdcExtras,
      });
    }

    const { row, col } = current;
    const neighbors: Coord2[] = [
      { col, row: row + 1 },
      { col, row: row - 1 },
      { col: col + 1, row },
      { col: col - 1, row },
    ];

    for (const neighbor of neighbors) {
      const key = `${neighbor.row},${neighbor.col}`;
      if (!visited.has(key) && validFloodCoordinates(ctx, neighbor, sourcePixel)) {
        visited.add(key);
        queue.push(neighbor);
      }
    }
  }

  if (pixelChanges.length > 0) {
    ctx.props.Framebuffer.setPixels(pixelChanges, undoId);
  }
}

/** Replace-All (Texture tool): scans the WHOLE canvas (no connectivity
 *  requirement) for every cell matching the clicked cell's exact (code,
 *  color), painting each from the canvas-anchored texture layer at that
 *  cell's own (row, col). */
export function setTextureReplaceAll(ctx: FloodFillContext, startLoc: Coord2): void {
  const { undoId, framebuf, framebufWidth, framebufHeight } = ctx.props;
  if (!ctx.validCoordinates(startLoc)) {
    return;
  }

  // Compared via effectivePixelsEqual (not raw code/color) so VDC
  // ALTCHAR-only differences aren't treated as a match -- see
  // validFloodCoordinates/setFloodFill above.
  const sourcePixel = framebuf[startLoc.row][startLoc.col];
  const effectiveOpts = ctx.effectivePixelOptions();

  const pixelChanges: { row: number; col: number; screencode: number; color: number; attrFlags?: number }[] = [];
  const vdcExtras = ctx.vdcAttrPayload();
  const forceFg = ctx.props.textureForceForeground;
  const fgColor = ctx.currentPaintColor();

  for (let row = 0; row < framebufHeight; row++) {
    for (let col = 0; col < framebufWidth; col++) {
      const cell = framebuf[row][col];
      if (!effectivePixelsEqual(cell, sourcePixel, effectiveOpts)) continue;
      // Sampled only for cells that actually match, instead of building a
      // full canvas-sized texture grid (most of which would never be read).
      const texPix = ctx.sampleTexturePixel(row, col);
      if (!texPix) continue;
      pixelChanges.push({
        row,
        col,
        screencode: texPix.code,
        color: forceFg ? fgColor : texPix.color,
        ...vdcExtras,
      });
    }
  }

  if (pixelChanges.length > 0) {
    ctx.props.Framebuffer.setPixels(pixelChanges, undoId);
  }
}
