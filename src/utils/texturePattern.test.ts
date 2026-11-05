import {
  buildTexturePattern,
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
