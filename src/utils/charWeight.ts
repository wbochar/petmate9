import { Font, FadeStepStart, FadeStepChoice, FadeStepSort } from '../redux/types';
import { CharCategory, CaseMode, buildCategorySet } from './charWeightConfig';
import { getCharDirection } from './charDirection';

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

// ---------------------------------------------------------------------------
// Category-filtered weight stepping
// ---------------------------------------------------------------------------

interface WeightLevel {
  pixelCount: number;
  screencodes: number[];
}

/**
 * Build weight levels (groups of screencodes sharing the same pixel count)
 * restricted to a character category.  Sorted ascending by pixel count.
 * If customScreencodes is provided (for custom source groups), use those
 * instead of computing from the category.
 */
function buildFilteredWeightLevels(
  font: Font,
  category: CharCategory,
  caseMode: CaseMode,
  customScreencodes?: number[],
): WeightLevel[] {
  let allowed: Set<number>;
  if (customScreencodes) {
    allowed = new Set(customScreencodes);
  } else {
    allowed = buildCategorySet(category, caseMode);
  }
  const groups: Record<number, number[]> = {};

  for (const sc of allowed) {
    if (sc >= ROM_CHAR_COUNT) continue;
    const px = countCharPixels(font.bits, sc);
    if (!groups[px]) groups[px] = [];
    groups[px].push(sc);
  }

  return Object.entries(groups)
    .map(([px, scs]) => ({ pixelCount: Number(px), screencodes: scs }))
    .sort((a, b) => a.pixelCount - b.pixelCount); // ascending
}

/** Compute a ping-pong index for Linear mode. */
function pingPongIndex(counter: number, size: number): number {
  if (size <= 1) return 0;
  const period = 2 * (size - 1);
  const pos = ((counter % period) + period) % period;
  return pos < size ? pos : period - pos;
}

/**
 * Category-aware fade/lighten stepping with pick modes.
 *
 * Returns the replacement screencode, or the original if the character
 * is not in the category or is a non-ROM extra.
 */
export function getNextByWeightFiltered(
  font: Font,
  screencode: number,
  direction: 'lighter' | 'darker',
  strength: number,
  category: CharCategory,
  caseMode: CaseMode,
  linearCounter: number,
  stepStart: FadeStepStart = 'first',
  stepCount: number = 1,
  stepChoice: FadeStepChoice = 'pingpong',
  stepSort: FadeStepSort = 'default',
  customScreencodes?: number[],
): number {
  if (screencode >= ROM_CHAR_COUNT) return screencode;

  const levels = buildFilteredWeightLevels(font, category, caseMode, customScreencodes);
  if (levels.length === 0) return screencode;

  // Find which weight level the current screencode belongs to.
  // If the character is not in the category, find the nearest level
  // by its pixel weight so the tool still applies.
  let curLevelIdx = -1;
  for (let i = 0; i < levels.length; i++) {
    if (levels[i].screencodes.includes(screencode)) {
      curLevelIdx = i;
      break;
    }
  }
  if (curLevelIdx === -1) {
    // Character not in category — match by pixel weight
    const px = countCharPixels(font.bits, screencode);
    let bestDist = Infinity;
    for (let i = 0; i < levels.length; i++) {
      const dist = Math.abs(levels[i].pixelCount - px);
      if (dist < bestDist) {
        bestDist = dist;
        curLevelIdx = i;
      }
    }
  }

  // Step to the target weight level
  let targetLevelIdx: number;
  if (direction === 'lighter') {
    targetLevelIdx = Math.max(0, curLevelIdx - strength);
  } else {
    targetLevelIdx = Math.min(levels.length - 1, curLevelIdx + strength);
  }

  let codes = [...levels[targetLevelIdx].screencodes];
  if (codes.length === 0) return screencode;

  // --- Step Sort ---
  if (stepSort === 'random') {
    // Fisher-Yates shuffle (non-seeded; each application gets a fresh order)
    for (let i = codes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [codes[i], codes[j]] = [codes[j], codes[i]];
    }
  }

  // --- Step Start ---
  let startIdx: number;
  switch (stepStart) {
    case 'last':   startIdx = codes.length - 1; break;
    case 'middle': startIdx = Math.floor(codes.length / 2); break;
    default:       startIdx = 0; break;
  }

  // --- Build the window of `stepCount` characters around startIdx ---
  // stepCount 0 = all characters in the level (no windowing)
  let window: number[];
  if (stepCount <= 0 || stepCount >= codes.length) {
    window = codes;
  } else {
    const winStart = Math.max(0, Math.min(codes.length - stepCount, startIdx - Math.floor(stepCount / 2)));
    window = codes.slice(winStart, winStart + stepCount);
  }

  // --- Step Choice (pick from the window) ---
  switch (stepChoice) {
    case 'random':
      return window[Math.floor(Math.random() * window.length)];

    case 'pingpong':
      return window[pingPongIndex(linearCounter, window.length)];

    case 'rampUp':
      return window[linearCounter % window.length];

    case 'rampDown':
      return window[(window.length - 1) - (linearCounter % window.length)];

    case 'direction': {
      // Find the next character with the same visual direction as the source.
      // Search the target level first, then scan outward in the stepping
      // direction so the tool always produces a same-direction character
      // at a different (heavier or lighter) weight when possible.
      const srcDir = getCharDirection(font.bits, screencode);
      const scanDir = direction === 'darker' ? 1 : -1;

      // Pass 1: scan from target level outward in the stepping direction
      for (let off = 0; off < levels.length; off++) {
        const idx = targetLevelIdx + off * scanDir;
        if (idx < 0 || idx >= levels.length) break;
        const candidates = levels[idx].screencodes.filter(
          sc => sc !== screencode && getCharDirection(font.bits, sc) === srcDir
        );
        if (candidates.length > 0) {
          return candidates[linearCounter % candidates.length];
        }
      }
      // No direction match found — leave the character unchanged
      return screencode;
    }
  }

  // Legacy fallback (shouldn't reach here)
  return codes[startIdx];
}

/**
 * Return the maximum number of weight-level steps available for a
 * given font + category combination.  Used to set the strength slider max.
 */
export function getMaxWeightSteps(
  font: Font,
  category: CharCategory,
  caseMode: CaseMode,
  customScreencodes?: number[],
): number {
  const levels = buildFilteredWeightLevels(font, category, caseMode, customScreencodes);
  return Math.max(1, levels.length - 1);
}
