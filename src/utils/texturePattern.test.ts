import {
  buildTexturePattern,
  sampleTexturePattern,
  TEXTURE_OPTION_VERTICAL,
  TEXTURE_OPTION_INVERT,
  TEXTURE_OPTION_COLOR_GRADIENT,
  TEXTURE_OPTION_DIAGONAL,
  TEXTURE_OPTION_MAX_TRANSPARENCY,
} from './texturePattern';
import { TRANSPARENT_SCREENCODE } from '../redux/types';

function noOptions(): boolean[] {
  return [false, false, false, false, false, false];
}

describe('buildTexturePattern (tiling)', () => {
  it('tiles a 1-character strip horizontally by default', () => {
    const grid = buildTexturePattern([65], [1], 3, 2, {
      options: noOptions(), textColor: 1, backgroundColor: 0,
    });
    expect(grid).toHaveLength(2);
    for (const row of grid) {
      expect(row.map(p => p.code)).toEqual([65, 65, 65]);
      expect(row.map(p => p.color)).toEqual([1, 1, 1]);
    }
  });

  it('cycles a multi-character strip across columns (horizontal mode)', () => {
    const grid = buildTexturePattern([1, 2, 3], [0, 0, 0], 4, 1, {
      options: noOptions(), textColor: 1, backgroundColor: 0,
    });
    expect(grid[0].map(p => p.code)).toEqual([1, 2, 3, 1]);
  });

  it('cycles a multi-character strip down rows when vertical option is set', () => {
    const options = noOptions();
    options[TEXTURE_OPTION_VERTICAL] = true;
    const grid = buildTexturePattern([1, 2, 3], [0, 0, 0], 1, 4, {
      options, textColor: 1, backgroundColor: 0,
    });
    expect(grid.map(row => row[0].code)).toEqual([1, 2, 3, 1]);
  });

  it('applies a diagonal offset per row', () => {
    const options = noOptions();
    options[TEXTURE_OPTION_DIAGONAL] = true;
    const grid = buildTexturePattern([1, 2, 3], [0, 0, 0], 3, 2, {
      options, textColor: 1, backgroundColor: 0,
    });
    expect(grid[0].map(p => p.code)).toEqual([1, 2, 3]);
    expect(grid[1].map(p => p.code)).toEqual([2, 3, 1]);
  });

  it('reverses the strip order when invert is set', () => {
    const options = noOptions();
    options[TEXTURE_OPTION_INVERT] = true;
    const grid = buildTexturePattern([1, 2, 3], [0, 0, 0], 3, 1, {
      options, textColor: 1, backgroundColor: 0,
    });
    expect(grid[0].map(p => p.code)).toEqual([3, 2, 1]);
  });
});

describe('buildTexturePattern (mirror)', () => {
  it('palindromes a multi-char strip before tiling', () => {
    // [1,2,3] -> mirrored -> [1,2,3,2,1]
    const grid = buildTexturePattern([1, 2, 3], [0, 0, 0], 5, 1, {
      options: noOptions(), mirror: true, textColor: 1, backgroundColor: 0,
    });
    expect(grid[0].map(p => p.code)).toEqual([1, 2, 3, 2, 1]);
  });

  it('does not alter a single-character strip', () => {
    const grid = buildTexturePattern([7], [0], 3, 1, {
      options: noOptions(), mirror: true, textColor: 1, backgroundColor: 0,
    });
    expect(grid[0].map(p => p.code)).toEqual([7, 7, 7]);
  });
});

describe('buildTexturePattern (scale)', () => {
  it('repeats each character `scale` times before tiling', () => {
    const grid = buildTexturePattern([1, 2], [0, 0], 4, 1, {
      options: noOptions(), scale: 2, textColor: 1, backgroundColor: 0,
    });
    // strip becomes [1,1,2,2]
    expect(grid[0].map(p => p.code)).toEqual([1, 1, 2, 2]);
  });

  it('defaults to scale 1 when omitted', () => {
    const grid = buildTexturePattern([1, 2], [0, 0], 4, 1, {
      options: noOptions(), textColor: 1, backgroundColor: 0,
    });
    expect(grid[0].map(p => p.code)).toEqual([1, 2, 1, 2]);
  });
});

describe('buildTexturePattern (color gradient)', () => {
  it('alternates foreground/background colour by strip index when enabled', () => {
    const options = noOptions();
    options[TEXTURE_OPTION_COLOR_GRADIENT] = true;
    const grid = buildTexturePattern([1, 2], [5, 5], 4, 1, {
      options, textColor: 9, backgroundColor: 3,
    });
    expect(grid[0].map(p => p.color)).toEqual([9, 3, 9, 3]);
  });
});

describe('buildTexturePattern (max transparency)', () => {
  it('replaces space and shifted-space codes with the transparent sentinel', () => {
    const options = noOptions();
    options[TEXTURE_OPTION_MAX_TRANSPARENCY] = true;
    const grid = buildTexturePattern([0x20, 0xA0, 65], [0, 0, 0], 3, 1, {
      options, textColor: 1, backgroundColor: 0,
    });
    expect(grid[0].map(p => p.code)).toEqual([TRANSPARENT_SCREENCODE, TRANSPARENT_SCREENCODE, 65]);
  });

  it('leaves other codes untouched when disabled', () => {
    const grid = buildTexturePattern([0x20, 0xA0, 65], [0, 0, 0], 3, 1, {
      options: noOptions(), textColor: 1, backgroundColor: 0,
    });
    expect(grid[0].map(p => p.code)).toEqual([0x20, 0xA0, 65]);
  });
});

describe('buildTexturePattern (random)', () => {
  it('always produces an index within the strip bounds', () => {
    const grid = buildTexturePattern([1, 2, 3], [0, 0, 0], 10, 10, {
      options: noOptions(), random: true, textColor: 1, backgroundColor: 0,
    });
    for (const row of grid) {
      for (const px of row) {
        expect([1, 2, 3]).toContain(px.code);
      }
    }
  });
});

// Regression tests for K2 (Group K master task list): Editor.tsx's
// box/bucket/replace texture tiler (sampleTexturePixel) previously
// reimplemented its own, simpler per-cell sampler that ignored a preset's
// mirror/scale/max-transparency options entirely -- so the same preset
// rendered differently on canvas depending on which texture draw mode was
// active versus the panel's own preview. sampleTexturePattern is the
// single source of truth both now use; it must agree with
// buildTexturePattern cell-for-cell.
describe('sampleTexturePattern agrees with buildTexturePattern per cell', () => {
  it('matches every cell of a grid built with mirror + scale + max-transparency', () => {
    const options = noOptions();
    options[TEXTURE_OPTION_DIAGONAL] = true;
    options[TEXTURE_OPTION_MAX_TRANSPARENCY] = true;
    const opts = { options, mirror: true, scale: 2, textColor: 9, backgroundColor: 3 };
    const chars = [0x20, 1, 0xA0];
    const colors = [5, 6, 7];
    const width = 6, height = 4;
    const grid = buildTexturePattern(chars, colors, width, height, opts);
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        expect(sampleTexturePattern(chars, colors, row, col, opts)).toEqual(grid[row][col]);
      }
    }
  });

  it('honors mirror when sampling a single cell (not just when building a full grid)', () => {
    // [1,2,3] mirrored -> [1,2,3,2,1]; column 3 (0-indexed) should be "2".
    const opts = { options: noOptions(), mirror: true, textColor: 1, backgroundColor: 0 };
    const px = sampleTexturePattern([1, 2, 3], [0, 0, 0], 0, 3, opts);
    expect(px.code).toBe(2);
  });

  it('honors max-transparency when sampling a single cell', () => {
    const options = noOptions();
    options[TEXTURE_OPTION_MAX_TRANSPARENCY] = true;
    const opts = { options, textColor: 1, backgroundColor: 0 };
    const px = sampleTexturePattern([0x20], [5], 0, 0, opts);
    expect(px.code).toBe(TRANSPARENT_SCREENCODE);
    expect(px.color).toBe(5);
  });

  it('uses the supplied deterministic randomValue01 instead of Math.random when random is set', () => {
    const opts = { options: noOptions(), random: true, textColor: 1, backgroundColor: 0 };
    // Force index 1 ([1,2,3] -> code 2) regardless of (row, col).
    const px = sampleTexturePattern([1, 2, 3], [0, 0, 0], 5, 5, opts, () => 0.5);
    expect(px.code).toBe(2);
    // Same seed -> same result, called repeatedly (deterministic across a session).
    const px2 = sampleTexturePattern([1, 2, 3], [0, 0, 0], 5, 5, opts, () => 0.5);
    expect(px2.code).toBe(2);
  });
});
