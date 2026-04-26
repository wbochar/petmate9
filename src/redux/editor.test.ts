import {
  fbReducer,
  actions,
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_ON,
  DEFAULT_ZOOM,
  CHARSET_UPPER,
  CHARSET_LOWER,
  CHARSET_C128_VDC,
} from './editor';
import { Framebuf, DEFAULT_FB_WIDTH, DEFAULT_FB_HEIGHT, BrushType, TRANSPARENT_SCREENCODE } from './types';
import { VDC_ATTR_ALTCHAR } from '../utils/vdcAttr';

// Helper: get the default state from the reducer
function defaultState(): Framebuf {
  return fbReducer(undefined, { type: '@@INIT' } as any);
}

describe('fbReducer default state', () => {
  it('has the correct default dimensions', () => {
    const state = defaultState();
    expect(state.width).toBe(DEFAULT_FB_WIDTH);
    expect(state.height).toBe(DEFAULT_FB_HEIGHT);
  });

  it('has the correct default colors and charset', () => {
    const state = defaultState();
    expect(state.backgroundColor).toBe(DEFAULT_BACKGROUND_COLOR);
    expect(state.borderColor).toBe(DEFAULT_BORDER_COLOR);
    expect(state.borderOn).toBe(DEFAULT_BORDER_ON);
    expect(state.charset).toBe(CHARSET_UPPER);
  });

  it('creates a framebuf filled with space (code 32) and color 14', () => {
    const state = defaultState();
    expect(state.framebuf.length).toBe(DEFAULT_FB_HEIGHT);
    expect(state.framebuf[0].length).toBe(DEFAULT_FB_WIDTH);
    expect(state.framebuf[0][0]).toEqual({ code: 32, color: 14 });
  });

  it('creates distinct row arrays (no shared references)', () => {
    const state = defaultState();
    // Mutating one row should not affect another
    expect(state.framebuf[0]).not.toBe(state.framebuf[1]);
  });
});

describe('SET_PIXEL', () => {
  it('sets a pixel at the given row/col', () => {
    const state = defaultState();
    const next = fbReducer(state, actions.setPixel({ row: 2, col: 3, screencode: 65, color: 1 }, null, 0));
    expect(next.framebuf[2][3]).toEqual({ code: 65, color: 1 });
  });

  it('does not mutate other pixels', () => {
    const state = defaultState();
    const next = fbReducer(state, actions.setPixel({ row: 0, col: 0, screencode: 1, color: 2 }, null, 0));
    expect(next.framebuf[0][1]).toEqual({ code: 32, color: 14 });
  });

  it('ignores out-of-bounds coordinates', () => {
    const state = defaultState();
    const next = fbReducer(state, actions.setPixel({ row: -1, col: 0, screencode: 1, color: 1 }, null, 0));
    expect(next.framebuf).toBe(state.framebuf);
  });

  it('sets only color when screencode is undefined', () => {
    const state = defaultState();
    const next = fbReducer(state, actions.setPixel({ row: 0, col: 0, color: 5 }, null, 0));
    expect(next.framebuf[0][0]).toEqual({ code: 32, color: 5 });
  });

  it('sets only screencode when color is undefined', () => {
    const state = defaultState();
    const next = fbReducer(state, actions.setPixel({ row: 0, col: 0, screencode: 100 }, null, 0));
    expect(next.framebuf[0][0]).toEqual({ code: 100, color: 14 });
  });
});

describe('CLEAR_CANVAS', () => {
  it('resets all pixels to the default space/color', () => {
    let state = defaultState();
    state = fbReducer(state, actions.setPixel({ row: 0, col: 0, screencode: 65, color: 1 }, null, 0));
    const cleared = fbReducer(state, actions.clearCanvas(0));
    expect(cleared.framebuf[0][0]).toEqual({ code: 32, color: 14 });
    expect(cleared.width).toBe(DEFAULT_FB_WIDTH);
    expect(cleared.height).toBe(DEFAULT_FB_HEIGHT);
  });
});

describe('SET_BACKGROUND_COLOR', () => {
  it('updates the background color', () => {
    const state = defaultState();
    const next = fbReducer(state, actions.setBackgroundColor(3, 0));
    expect(next.backgroundColor).toBe(3);
  });
});

describe('SET_BORDER_COLOR', () => {
  it('updates the border color', () => {
    const state = defaultState();
    const next = fbReducer(state, actions.setBorderColor(7, 0));
    expect(next.borderColor).toBe(7);
  });
});

describe('SET_BORDER_ON', () => {
  it('toggles the border on/off', () => {
    const state = defaultState();
    const next = fbReducer(state, actions.setBorderOn(false, 0));
    expect(next.borderOn).toBe(false);
  });
});

describe('SET_CHARSET', () => {
  it('sets charset and adjusts colors for C64 charsets', () => {
    const state = defaultState();
    const next = fbReducer(state, actions.setCharset(CHARSET_LOWER, 0));
    expect(next.charset).toBe(CHARSET_LOWER);
    expect(next.borderColor).toBe(14);
    expect(next.backgroundColor).toBe(6);
  });

  it('sets VIC-20 default colors for vic charsets', () => {
    const state = defaultState();
    const next = fbReducer(state, actions.setCharset('vic20Upper', 0));
    expect(next.charset).toBe('vic20Upper');
    expect(next.borderColor).toBe(3);
    expect(next.backgroundColor).toBe(1);
  });

  it('sets PET default colors for pet charsets', () => {
    const state = defaultState();
    const next = fbReducer(state, actions.setCharset('petGfx', 0));
    expect(next.charset).toBe('petGfx');
    expect(next.borderColor).toBe(0);
    expect(next.backgroundColor).toBe(0);
  });
});

describe('SET_DIMS', () => {
  it('resizes the framebuffer and clears it', () => {
    const state = defaultState();
    const next = fbReducer(state, actions.setDims({ width: 20, height: 10 }, 0));
    expect(next.width).toBe(20);
    expect(next.height).toBe(10);
    expect(next.framebuf.length).toBe(10);
    expect(next.framebuf[0].length).toBe(20);
  });
});

describe('SET_NAME', () => {
  it('sets the screen name', () => {
    const state = defaultState();
    const next = fbReducer(state, actions.setName('my_screen', 0));
    expect(next.name).toBe('my_screen');
  });
});

describe('SHIFT_HORIZONTAL', () => {
  it('shifts all rows left by one', () => {
    let state = defaultState();
    // Set a recognizable pixel at (0, 0)
    state = fbReducer(state, actions.setPixel({ row: 0, col: 0, screencode: 1, color: 1 }, null, 0));
    const shifted = fbReducer(state, actions.shiftHorizontal(-1, 0));
    // pixel should have moved from col 0 to the last column (wrapped)
    expect(shifted.framebuf[0][DEFAULT_FB_WIDTH - 1]).toEqual({ code: 1, color: 1 });
    expect(shifted.framebuf[0][0]).toEqual({ code: 32, color: 14 });
  });

  it('shifts all rows right by one', () => {
    let state = defaultState();
    state = fbReducer(state, actions.setPixel({ row: 0, col: 0, screencode: 1, color: 1 }, null, 0));
    const shifted = fbReducer(state, actions.shiftHorizontal(1, 0));
    expect(shifted.framebuf[0][1]).toEqual({ code: 1, color: 1 });
  });
});

describe('SHIFT_VERTICAL', () => {
  it('shifts all columns up by one', () => {
    let state = defaultState();
    state = fbReducer(state, actions.setPixel({ row: 0, col: 0, screencode: 1, color: 1 }, null, 0));
    const shifted = fbReducer(state, actions.shiftVertical(-1, 0));
    expect(shifted.framebuf[DEFAULT_FB_HEIGHT - 1][0]).toEqual({ code: 1, color: 1 });
    expect(shifted.framebuf[0][0]).toEqual({ code: 32, color: 14 });
  });
});

describe('CONVERT_TO_MONO', () => {
  it('sets all pixel colors to 1', () => {
    let state = defaultState();
    state = fbReducer(state, actions.setPixel({ row: 0, col: 0, screencode: 65, color: 7 }, null, 0));
    const mono = fbReducer(state, actions.convertToMono(0));
    expect(mono.framebuf[0][0]).toEqual({ code: 65, color: 1 });
    expect(mono.framebuf[1][1]).toEqual({ code: 32, color: 1 });
  });
});

describe('SWAP_COLORS', () => {
  it('swaps all pixels of one color to another', () => {
    let state = defaultState();
    // Default color is 14; set one pixel to color 5
    state = fbReducer(state, actions.setPixel({ row: 0, col: 0, screencode: 65, color: 5 }, null, 0));
    const swapped = fbReducer(state, actions.swapColors({ srcColor: 5, destColor: 9 }, 0));
    expect(swapped.framebuf[0][0].color).toBe(9);
    // Other pixels (color 14) should be unchanged
    expect(swapped.framebuf[1][0].color).toBe(14);
  });
});

describe('SWAP_CHARS', () => {
  it('swaps all pixels of one char code to another', () => {
    let state = defaultState();
    state = fbReducer(state, actions.setPixel({ row: 0, col: 0, screencode: 65, color: 1 }, null, 0));
    const swapped = fbReducer(state, actions.swapChars({ srcChar: 65, destChar: 90 }, 0));
    expect(swapped.framebuf[0][0].code).toBe(90);
  });
});

describe('SET_ZOOM', () => {
  it('updates the zoom level and alignment', () => {
    const state = defaultState();
    const next = fbReducer(state, actions.setZoom({ zoomLevel: 4, alignment: 'center' }, 0));
    expect(next.zoom).toEqual({ zoomLevel: 4, alignment: 'center' });
  });
});

describe('SET_PIXEL on c128vdc', () => {
  function vdcState(): Framebuf {
    let s = fbReducer(undefined, { type: '@@INIT' } as any);
    return fbReducer(s, actions.setCharset(CHARSET_C128_VDC, 0));
  }

  it('stores screencodes 0–255 with ALT cleared', () => {
    const next = fbReducer(vdcState(), actions.setPixel({ row: 0, col: 0, screencode: 65, color: 5 }, null, 0));
    expect(next.framebuf[0][0].code).toBe(65);
    expect(next.framebuf[0][0].attr! & VDC_ATTR_ALTCHAR).toBe(0);
    expect(next.framebuf[0][0].attr! & 0x0f).toBe(5);
    expect(next.framebuf[0][0].transparent).toBe(false);
  });

  it('stores screencodes 256–511 as code & 0xff with ALT set', () => {
    const next = fbReducer(vdcState(), actions.setPixel({ row: 1, col: 1, screencode: 65 + 256, color: 5 }, null, 0));
    expect(next.framebuf[1][1].code).toBe(65);
    expect(next.framebuf[1][1].attr! & VDC_ATTR_ALTCHAR).toBe(VDC_ATTR_ALTCHAR);
  });

  it('translates the legacy TRANSPARENT_SCREENCODE sentinel into transparent: true', () => {
    const next = fbReducer(vdcState(), actions.setPixel({ row: 2, col: 2, screencode: TRANSPARENT_SCREENCODE, color: 5 }, null, 0));
    expect(next.framebuf[2][2].transparent).toBe(true);
    expect(next.framebuf[2][2].code).toBe(0x20);
    expect(next.framebuf[2][2].attr! & VDC_ATTR_ALTCHAR).toBe(0);
  });

  it('keeps colour and attr nibble in sync when only colour is set', () => {
    let s = vdcState();
    s = fbReducer(s, actions.setPixel({ row: 0, col: 0, screencode: 65 + 256, color: 5 }, null, 0));
    s = fbReducer(s, actions.setPixel({ row: 0, col: 0, color: 9 }, null, 0));
    expect(s.framebuf[0][0].color).toBe(9);
    expect(s.framebuf[0][0].attr! & 0x0f).toBe(9);
    // Flag bits stay put.
    expect(s.framebuf[0][0].attr! & VDC_ATTR_ALTCHAR).toBe(VDC_ATTR_ALTCHAR);
  });
});

describe('SET_BRUSH', () => {
  it('paints a brush onto the framebuffer (chars and colors)', () => {
    const state = defaultState();
    const brush = {
      framebuf: [[{ code: 65, color: 1 }, { code: 66, color: 2 }]],
      brushRegion: { min: { row: 0, col: 0 }, max: { row: 0, col: 1 } },
    };
    const next = fbReducer(state, actions.setBrush({
      row: 0, col: 0,
      brush,
      brushType: BrushType.CharsColors,
      brushColor: 0,
    }, null, 0));
    expect(next.framebuf[0][0]).toEqual({ code: 65, color: 1 });
    expect(next.framebuf[0][1]).toEqual({ code: 66, color: 2 });
  });

  it('skips transparent pixels', () => {
    const state = defaultState();
    const brush = {
      framebuf: [[{ code: TRANSPARENT_SCREENCODE, color: 1 }]],
      brushRegion: { min: { row: 0, col: 0 }, max: { row: 0, col: 0 } },
    };
    const next = fbReducer(state, actions.setBrush({
      row: 0, col: 0,
      brush,
      brushType: BrushType.CharsColors,
      brushColor: 0,
    }, null, 0));
    // Should remain the default pixel since the brush pixel was transparent
    expect(next.framebuf[0][0]).toEqual({ code: 32, color: 14 });
  });
});
