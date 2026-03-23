import { BoxPreset, BoxSide, Pixel } from '../redux/types';

/** A code+color pair used internally during side filling. */
interface Cell { code: number; color: number; }

/**
 * Fill an array of `length` cells using the side's chars/colors and toggle flags.
 *
 * Pipeline:
 * 1. Mirror (A): if on, build palindrome unit
 * 2. Fill to length using priority: startEnd > stretch > repeat/default
 */
export function fillSide(side: BoxSide, length: number): Cell[] {
  if (length <= 0) return [];
  if (side.chars.length === 0) return Array(length).fill({ code: 0x20, color: 0 });

  // Build base unit of code+color pairs
  let unit: Cell[] = side.chars.map((code, i) => ({ code, color: side.colors[i] ?? 0 }));
  if (side.mirror) {
    unit = [...unit, ...unit.slice().reverse()];
  }

  if (side.startEnd === 'start') {
    return applyStartFill(unit, length);
  } else if (side.startEnd === 'end') {
    return applyEndFill(unit, length);
  } else if (side.startEnd === 'all' || side.stretch) {
    return applyStretch(unit, length);
  } else {
    return applyRepeat(unit, length);
  }
}

function applyRepeat(unit: Cell[], length: number): Cell[] {
  const out: Cell[] = [];
  for (let i = 0; i < length; i++) out.push(unit[i % unit.length]);
  return out;
}

function applyStretch(unit: Cell[], length: number): Cell[] {
  const out: Cell[] = [];
  const n = unit.length;
  for (let i = 0; i < length; i++) {
    out.push(unit[Math.min(n - 1, Math.floor(i * n / length))]);
  }
  return out;
}

function applyStartFill(unit: Cell[], length: number): Cell[] {
  if (length <= unit.length) return unit.slice(unit.length - length);
  const fill = Array(length - unit.length).fill(unit[0]);
  return [...fill, ...unit];
}

function applyEndFill(unit: Cell[], length: number): Cell[] {
  if (length <= unit.length) return unit.slice(0, length);
  const fill = Array(length - unit.length).fill(unit[unit.length - 1]);
  return [...unit, ...fill];
}

/**
 * Generate a box as a 2D pixel grid with per-cell colors.
 */
export function generateBox(
  preset: BoxPreset,
  width: number,
  height: number,
): Pixel[][] {
  const w = Math.max(2, width);
  const h = Math.max(2, height);
  const innerW = w - 2;
  const innerH = h - 2;

  const [tl, tr, bl, br] = preset.corners;
  const [tlC, trC, blC, brC] = preset.cornerColors;
  const topFill = fillSide(preset.top, innerW);
  const bottomFill = fillSide(preset.bottom, innerW);
  const leftFill = fillSide(preset.left, innerH);
  const rightFill = fillSide(preset.right, innerH);

  const grid: Pixel[][] = [];

  // Top row
  grid.push([
    { code: tl, color: tlC },
    ...topFill.map(c => ({ code: c.code, color: c.color })),
    { code: tr, color: trC },
  ]);

  // Middle rows
  for (let r = 0; r < innerH; r++) {
    const row: Pixel[] = [{ code: leftFill[r].code, color: leftFill[r].color }];
    for (let c = 0; c < innerW; c++) {
      row.push({ code: preset.fill, color: preset.fillColor });
    }
    row.push({ code: rightFill[r].code, color: rightFill[r].color });
    grid.push(row);
  }

  // Bottom row
  grid.push([
    { code: bl, color: blC },
    ...bottomFill.map(c => ({ code: c.code, color: c.color })),
    { code: br, color: brC },
  ]);

  return grid;
}
