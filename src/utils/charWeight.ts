import { Font } from '../redux/types';

// ROM characters are screencodes 0–255.  Codes 256+ are extras appended
// to the bottom row of the char-select grid and should be excluded from
// weight-based sorting and fade/lighten stepping.
const ROM_CHAR_COUNT = 256;

// Count the number of "on" pixels (set bits) in a character's 8×8 bitmap.
export function countCharPixels(fontBits: number[], screencode: number): number {
  const boffs = screencode * 8;
  let count = 0;
  for (let y = 0; y < 8; y++) {
    let byte = fontBits[boffs + y];
    // Brian Kernighan's bit-counting trick
    while (byte) {
      byte &= byte - 1;
      count++;
    }
  }
  return count;
}

// Return ROM-only screencodes sorted by pixel weight (ascending: lightest first).
function buildROMWeightSorted(font: Font): number[] {
  // Collect unique ROM screencodes that appear in the charOrder.
  const seen = new Set<number>();
  const codes: number[] = [];
  for (const c of font.charOrder) {
    if (c < ROM_CHAR_COUNT && !seen.has(c)) {
      seen.add(c);
      codes.push(c);
    }
  }
  const bits = font.bits;
  codes.sort((a, b) => countCharPixels(bits, a) - countCharPixels(bits, b));
  return codes;
}

// Build a charOrder array sorted heavy-first or light-first.
// Only ROM characters (0–255) are sorted; the extra codes (256+) are
// appended at the end in their original order.
export function buildWeightCharOrder(font: Font, mode: 'heavy' | 'light'): number[] {
  const sorted = buildROMWeightSorted(font);
  if (mode === 'heavy') {
    sorted.reverse();
  }
  // Append the non-ROM extras unchanged
  const extras = font.charOrder.filter(c => c >= ROM_CHAR_COUNT);
  return [...sorted, ...extras];
}

// Given a screencode, find the character that is `strength` steps
// lighter or darker in the weight-sorted list.
// Only ROM characters participate; if the screencode is an extra it is
// returned unchanged.
export function getNextByWeight(
  font: Font,
  screencode: number,
  direction: 'lighter' | 'darker',
  strength: number,
): number {
  if (screencode >= ROM_CHAR_COUNT) return screencode;

  const sorted = buildROMWeightSorted(font); // ascending (lightest first)
  const idx = sorted.indexOf(screencode);
  if (idx === -1) return screencode;

  let targetIdx: number;
  if (direction === 'lighter') {
    // Move towards index 0 (fewer pixels)
    targetIdx = Math.max(0, idx - strength);
  } else {
    // Move towards end (more pixels)
    targetIdx = Math.min(sorted.length - 1, idx + strength);
  }
  return sorted[targetIdx];
}
