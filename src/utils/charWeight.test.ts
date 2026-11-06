import { Font, VDC_TRANSPARENT_SCREENCODE } from '../redux/types';
import { buildWeightCharOrder, getNextByWeightFiltered } from './charWeight';
import { computeWeightDistribution } from './charWeightConfig';

function makeVdcFont(): Font {
  const bits = new Array(512 * 8).fill(0);
  const charOrder = [
    ...Array.from({ length: 512 }, (_, i) => i),
    VDC_TRANSPARENT_SCREENCODE,
    ...Array.from({ length: 15 }, () => 32),
  ];

  const byteByWeight = [0x00, 0x80, 0xc0, 0xe0, 0xf0, 0xf8, 0xfc, 0xfe, 0xff];
  const setWeight = (screencode: number, weight: number) => {
    bits[screencode * 8] = byteByWeight[weight];
  };

  // upper bank
  setWeight(0, 1);
  setWeight(1, 2);
  // lower bank
  setWeight(256, 3);
  setWeight(257, 0);

  return { bits, charOrder };
}

function makeClassicFontWithAddonRow(): Font {
  const bits = new Array(256 * 8).fill(0);
  const charOrder = Array.from({ length: 272 }, (_, i) => i);

  // Distinct weights in ROM area
  bits[0 * 8] = 0xff; // heavy
  bits[1 * 8] = 0x00; // light
  bits[2 * 8] = 0x80; // medium

  return { bits, charOrder };
}
describe('charWeight C128 VDC dual-bank behavior', () => {
  it('heavy ordering integrates lower bank ROM chars instead of appending them', () => {
    const font = makeVdcFont();
    const order = buildWeightCharOrder(font, 'heavy');
    // lower-bank heavy char participates in sorted ROM range
    expect(order.indexOf(256)).toBeLessThan(order.indexOf(1));
    expect(order.indexOf(256)).toBeLessThan(order.indexOf(0));
    // full addon row remains appended after ROM range
    expect(order).toHaveLength(528);
    expect(order.slice(512)).toEqual([
      VDC_TRANSPARENT_SCREENCODE,
      ...Array.from({ length: 15 }, () => 32),
    ]);
  });

  it('light ordering keeps the full VDC addon row at the end', () => {
    const font = makeVdcFont();
    const order = buildWeightCharOrder(font, 'light');
    expect(order).toHaveLength(528);
    expect(order.slice(512)).toEqual([
      VDC_TRANSPARENT_SCREENCODE,
      ...Array.from({ length: 15 }, () => 32),
    ]);
  });

  it('fade stepping works with lower-bank source codes', () => {
    const font = makeVdcFont();
    // 257 is very light; darken should step to a heavier lower-bank glyph
    const darker = getNextByWeightFiltered(
      font,
      257,
      'darker',
      3,
      'AllCharacters',
      'upper',
      0,
      'first',
      1,
      'pingpong',
      'default',
    );
    expect(darker).toBe(256);
  });

  it('weight distribution includes both VDC banks', () => {
    const font = makeVdcFont();
    const steps = computeWeightDistribution(font.bits, 'AllCharacters', 'upper');
    const heavy = steps.find(s => s.pixelCount === 3);
    expect(heavy?.screencodes).toContain(256);
    const light = steps.find(s => s.pixelCount === 0);
    expect(light?.screencodes).toContain(257);
  });
});

describe('charWeight addon-row behavior for non-VDC charsets', () => {
  it('keeps 16-char addon row appended at the end for Heavy/Light sorting', () => {
    const font = makeClassicFontWithAddonRow();
    const heavy = buildWeightCharOrder(font, 'heavy');
    const light = buildWeightCharOrder(font, 'light');
    const addon = Array.from({ length: 16 }, (_, i) => 256 + i);

    expect(heavy.slice(-16)).toEqual(addon);
    expect(light.slice(-16)).toEqual(addon);
    expect(heavy.indexOf(256)).toBe(256);
    expect(light.indexOf(256)).toBe(256);
  });
});

// Regression test for C2 (Group C master task list): getNextByWeightFiltered
// previously rebuilt the whole category weight-level table (scanning every
// allowed screencode's 8x8 bitmap and re-counting set bits) on *every* call,
// even though that table depends only on (font, category, caseMode,
// customScreencodes) -- not on the per-call screencode/direction/linearCounter
// arguments. Editor.tsx's Fade/Lighten hover preview, drag-paint, and
// (worst case) its box-select live-preview loop all call this once per cell
// with the *same* (font, category, caseMode) throughout one operation, so
// this was an O(cells x glyphs) hot path for what's actually a single fixed
// computation per settings change.
describe('getNextByWeightFiltered weight-level caching (C2)', () => {
  // Wrap a fontBits array in a Proxy that counts numeric-index reads, so we
  // can observe whether the expensive per-glyph bit-counting pass actually
  // re-ran without needing to export the internal (memoized) builder.
  function makeCountingBits(bits: number[]): { bits: number[]; getAccessCount: () => number } {
    let accessCount = 0;
    const proxied = new Proxy(bits, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          accessCount++;
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    return { bits: proxied as unknown as number[], getAccessCount: () => accessCount };
  }

  it('does not re-scan glyph bitmaps on repeated calls with the same font/category/caseMode', () => {
    const base = makeClassicFontWithAddonRow();
    const { bits, getAccessCount } = makeCountingBits(base.bits);
    const font: Font = { bits, charOrder: base.charOrder };

    getNextByWeightFiltered(font, 0, 'lighter', 1, 'AllCharacters', 'upper', 0);
    const accessesAfterFirstCall = getAccessCount();
    expect(accessesAfterFirstCall).toBeGreaterThan(0);

    // Same (font, category, caseMode, customScreencodes) -- only the
    // screencode/direction/linearCounter differ. Must hit the cache: no
    // additional glyph-bit accesses.
    for (let i = 0; i < 10; i++) {
      getNextByWeightFiltered(font, 1, 'darker', 1, 'AllCharacters', 'upper', i);
    }
    expect(getAccessCount()).toBe(accessesAfterFirstCall);

    // A genuinely different category must invalidate the cache and trigger
    // a fresh scan.
    getNextByWeightFiltered(font, 0, 'lighter', 1, 'AlphaNumeric', 'upper', 0);
    expect(getAccessCount()).toBeGreaterThan(accessesAfterFirstCall);
  });
});
