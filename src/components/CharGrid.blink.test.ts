// Regression test for C1 (Group C master task list): the VDC/TED blink
// timer previously called the bare `this.draw()` (no arguments) on every
// tick, which made `prevProps === undefined` true inside `draw()` and
// *unconditionally* rebuilt the entire glyph cache (`CharsetCache`, which
// allocates an ImageData per color x glyph) every tick -- by default every
// ~400ms -- even though only the blink visibility phase changed, not the
// font/palette. This test drives the component directly (bypassing
// ReactDOM/JSX) with a fake canvas 2D context so it can assert on
// `createImageData` call counts across several blink ticks.

import CharGrid from './CharGrid';
import { VDC_ATTR_BLINK } from '../utils/vdcAttr';

function makeFakeCtx() {
  return {
    createImageData: jest.fn(() => ({ data: new Uint8ClampedArray(8 * 8 * 4) })),
    putImageData: jest.fn(),
    fillRect: jest.fn(),
    clearRect: jest.fn(),
    fillStyle: '',
  };
}

function makeFakeCanvas(ctx: any): HTMLCanvasElement {
  return {
    getContext: jest.fn(() => ctx),
    width: 8,
    height: 8,
  } as unknown as HTMLCanvasElement;
}

describe('CharGrid blink repaint vs. glyph-cache invalidation (C1)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not rebuild the glyph cache on every blink tick', () => {
    jest.useFakeTimers();
    const ctx = makeFakeCtx();
    const canvas = makeFakeCanvas(ctx);

    // 2-glyph font (16 bytes = 2 x 8 rows), 2-color palette.
    const font = { bits: Array(16).fill(0xff), charOrder: [0, 1] };
    const colorPalette = [{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }];
    const framebuf = [[{ code: 0, color: 1, attr: VDC_ATTR_BLINK }]];

    const props: any = {
      width: 1, height: 1, srcX: 0, srcY: 0,
      backgroundColor: '#000', borderColor: '#fff', grid: false,
      colorPalette, font, framebuf,
      borderWidth: 0, borderOn: false,
      isTransparent: false, isDirart: false,
      isVdc: true, isTed: false,
      showVdcTransparentGlyph: true,
      vdcBlinkIntervalMs: 50,
    };

    const instance: any = new (CharGrid as any)(props);
    instance.canvasRef = { current: canvas };

    instance.componentDidMount();

    const createCallsAfterMount = ctx.createImageData.mock.calls.length;
    // Glyph cache build: numColors(2) x totalGlyphs(2) = 4 ImageData allocations.
    expect(createCallsAfterMount).toBeGreaterThan(0);

    // Advance through several blink phase toggles.
    jest.advanceTimersByTime(50 * 8);

    // The glyph cache must NOT have been rebuilt by any of those ticks.
    expect(ctx.createImageData.mock.calls.length).toBe(createCallsAfterMount);
    // But a repaint did actually happen across ticks (putImageData called
    // again on "visible" phases), proving blink is still functioning.
    expect(ctx.putImageData.mock.calls.length).toBeGreaterThan(0);

    instance.componentWillUnmount();
  });

  it('still redraws every cell on each blink tick (forceRepaint bypasses the row-skip optimization)', () => {
    jest.useFakeTimers();
    const ctx = makeFakeCtx();
    const canvas = makeFakeCanvas(ctx);

    const font = { bits: Array(16).fill(0xff), charOrder: [0, 1] };
    const colorPalette = [{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }];
    const framebuf = [[{ code: 0, color: 1, attr: VDC_ATTR_BLINK }]];

    const props: any = {
      width: 1, height: 1, srcX: 0, srcY: 0,
      backgroundColor: '#000', borderColor: '#fff', grid: false,
      colorPalette, font, framebuf,
      borderWidth: 0, borderOn: false,
      isTransparent: false, isDirart: false,
      isVdc: true, isTed: false,
      showVdcTransparentGlyph: true,
      vdcBlinkIntervalMs: 50,
    };

    const instance: any = new (CharGrid as any)(props);
    instance.canvasRef = { current: canvas };
    instance.componentDidMount();

    const fillRectCallsAfterMount = ctx.fillRect.mock.calls.length;

    // First tick: blink phase flips to "off" -- the blink-off VDC path
    // draws via fillRect (not putImageData), so fillRect calls must
    // increase even though the framebuf itself never changed.
    jest.advanceTimersByTime(50);
    expect(ctx.fillRect.mock.calls.length).toBeGreaterThan(fillRectCallsAfterMount);

    instance.componentWillUnmount();
  });
});
