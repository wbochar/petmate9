import {
  Coord2, Pixel, Font, Rgb,
  FadeMode, FadeSource, FadeStepStart, FadeStepChoice, FadeStepSort,
} from '../../redux/types';
import { getNextByWeightFiltered } from '../../utils/charWeight';
import { caseModeFromCharset } from '../../utils/charWeightConfig';
import { getNextColorByLuma } from '../../utils/palette';
import { effectiveGlyph } from '../../utils/vdcAttr';

// Extracted from containers/Editor.tsx's FramebufferView (Group L /
// L8-L11b) as a plain function taking an explicit context object.
// FramebufferView's own fadeApply method forwards `this` through to this
// function -- pure code-motion, no behavior change.

/** The subset of FramebufferView's props/instance state the Fade/Lighten
 *  tool's per-cell drag-paint logic needs. */
export interface FadeApplyContext {
  props: {
    framebufWidth: number;
    framebufHeight: number;
    framebuf: Pixel[][];
    fadeMode: FadeMode;
    ctrlKey: boolean;
    charset: string;
    colorPalette: Rgb[];
    undoId: number | null;
    font: Font;
    fadeStrength: number;
    fadeSource: FadeSource;
    fadeLinearCounter: number;
    fadeStepStart: FadeStepStart;
    fadeStepCount: number;
    fadeStepChoice: FadeStepChoice;
    fadeStepSort: FadeStepSort;
    fadeCustomScreencodes?: number[];
    Framebuffer: {
      setPixel: (
        data: Coord2 & { screencode?: number; color?: number },
        undoId: number | null,
      ) => void;
    };
    Toolbar: {
      incFadeLinearCounter: () => void;
    };
  };
  /** True while the right mouse button is held -- inverts the fade
   *  direction (lighten <-> darken). Mirrors FramebufferView's `rightButton`
   *  instance field, which paintLineForCurrentTool also temporarily
   *  overrides for Link-Line fade strokes. */
  rightButton: boolean;
  /** Cells already faded during the current drag/line-paint gesture, to
   *  prevent double-stepping the same cell twice in one gesture. Cleared by
   *  the caller (dragStart/dragEnd/paintLineForCurrentTool) at the start of
   *  each new gesture. */
  fadeTouchedCells: Set<string>;
}

/** Fade/Lighten tool: step one cell's character (or, with Ctrl held, its
 *  color by luminance) one step in the fade direction. Right-click inverts
 *  the direction. No-op if the cell was already touched this gesture, or if
 *  stepping wouldn't actually change anything. */
export function fadeApply(ctx: FadeApplyContext, coord: Coord2): void {
  const { row, col } = coord;
  if (row < 0 || row >= ctx.props.framebufHeight ||
      col < 0 || col >= ctx.props.framebufWidth) {
    return;
  }
  // Skip cells already faded during this drag to prevent double-stepping
  const key = `${row},${col}`;
  if (ctx.fadeTouchedCells.has(key)) return;
  ctx.fadeTouchedCells.add(key);

  const cell = ctx.props.framebuf[row][col];
  // Right-click inverts the direction
  const baseDir = ctx.props.fadeMode === 'lighten' ? 'lighter' : 'darker';
  const direction: 'lighter' | 'darker' = ctx.rightButton
    ? (baseDir === 'lighter' ? 'darker' : 'lighter')
    : baseDir;

  // Ctrl+click: fade the color by luminance instead of the character
  if (ctx.props.ctrlKey) {
    const isTedColor = ctx.props.charset.startsWith('c16');
    // TED's palette is 128 entries (8 luminances x 16 hues), not 16 --
    // the previous numColors=16 default restricted luma-fading to only
    // luminance-0 entries, so fading almost any TED color (whose index
    // is >= 16) was a no-op.
    const numColors = ctx.props.charset.startsWith('vic20') ? 8
      : ctx.props.charset.startsWith('pet') ? 2
      : isTedColor ? 128
      : 16;
    // TED color bytes pack a blink flag into bit 7 (see
    // FramebufferView.currentPaintColor). Mask it off before using the byte
    // as a luma-sorted palette index -- otherwise a blinking cell's color
    // (>= 0x80) never matched any entry in `indices` and fading silently
    // did nothing -- then reapply it afterward so fading doesn't clear the
    // cell's blink state.
    const blinkBit = isTedColor ? (cell.color & 0x80) : 0;
    const baseColor = isTedColor ? (cell.color & 0x7f) : cell.color;
    const newBaseColor = getNextColorByLuma(
      ctx.props.colorPalette, baseColor, direction, numColors
    );
    const newColor = newBaseColor | blinkBit;
    if (newColor !== cell.color) {
      ctx.props.Framebuffer.setPixel(
        { ...coord, color: newColor },
        ctx.props.undoId
      );
    }
    return;
  }

  const caseMode = caseModeFromCharset(ctx.props.charset);
  const sourceCode = ctx.props.charset === 'c128vdc'
    ? effectiveGlyph(cell)
    : cell.code;
  const newCode = getNextByWeightFiltered(
    ctx.props.font, sourceCode, direction, ctx.props.fadeStrength,
    ctx.props.fadeSource as any, caseMode,
    ctx.props.fadeLinearCounter,
    ctx.props.fadeStepStart, ctx.props.fadeStepCount,
    ctx.props.fadeStepChoice, ctx.props.fadeStepSort,
    ctx.props.fadeCustomScreencodes,
  );
  if (newCode !== sourceCode) {
    ctx.props.Framebuffer.setPixel(
      { ...coord, screencode: newCode },
      ctx.props.undoId
    );
  }
  // Increment counter for traversal modes that need it
  if (ctx.props.fadeStepChoice !== 'random') {
    ctx.props.Toolbar.incFadeLinearCounter();
  }
}
