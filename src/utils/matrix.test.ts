import { ident, dot, r, c, copy, mult, scale, translate, invert, multVect3, toCss, Matrix3x3, Vec3 } from './matrix';

describe('ident', () => {
  it('returns a 3x3 identity matrix', () => {
    const id = ident();
    expect(id.v).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
  });
});

describe('r (row extraction)', () => {
  it('extracts a row from the matrix', () => {
    const m = ident();
    expect(r(m, 0)).toEqual([1, 0, 0]);
    expect(r(m, 1)).toEqual([0, 1, 0]);
    expect(r(m, 2)).toEqual([0, 0, 1]);
  });
});

describe('c (column extraction)', () => {
  it('extracts a column from the matrix', () => {
    const m: Matrix3x3 = {
      v: [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ],
    };
    expect(c(m, 0)).toEqual([1, 4, 7]);
    expect(c(m, 1)).toEqual([2, 5, 8]);
    expect(c(m, 2)).toEqual([3, 6, 9]);
  });
});

describe('dot', () => {
  it('computes the dot product of two vectors', () => {
    expect(dot([1, 0, 0], [0, 1, 0])).toBe(0);
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
    expect(dot([2, 2, 2], [3, 3, 3])).toBe(18);
  });
});

describe('copy', () => {
  it('creates an independent deep copy of the matrix', () => {
    const m = ident();
    const cp = copy(m);
    cp.v[0][0] = 99;
    expect(m.v[0][0]).toBe(1);
  });
});

describe('scale', () => {
  it('creates a uniform scale matrix', () => {
    const s = scale(3);
    expect(s.v).toEqual([
      [3, 0, 0],
      [0, 3, 0],
      [0, 0, 1],
    ]);
  });
});

describe('translate', () => {
  it('creates a translation matrix', () => {
    const t = translate(10, 20);
    expect(t.v).toEqual([
      [1, 0, 10],
      [0, 1, 20],
      [0, 0, 1],
    ]);
  });
});

describe('mult', () => {
  it('returns identity when multiplying two identity matrices', () => {
    const result = mult(ident(), ident());
    expect(result.v).toEqual(ident().v);
  });

  it('composes scale and translate correctly', () => {
    const s = scale(2);
    const t = translate(5, 10);
    // scale * translate: scales the translation
    const result = mult(s, t);
    expect(result.v[0][2]).toBe(10); // 2 * 5
    expect(result.v[1][2]).toBe(20); // 2 * 10
  });
});

describe('multVect3', () => {
  it('transforms a vector by the identity matrix unchanged', () => {
    const v: Vec3 = [3, 7, 1];
    expect(multVect3(ident(), v)).toEqual([3, 7, 1]);
  });

  it('applies a scale transformation to a vector', () => {
    const v: Vec3 = [2, 3, 1];
    const s = scale(4);
    expect(multVect3(s, v)).toEqual([8, 12, 1]);
  });
});

describe('invert', () => {
  it('produces an inverse that multiplies back to identity', () => {
    const m: Matrix3x3 = {
      v: [
        [2, 1, 0],
        [0, 3, 0],
        [0, 0, 1],
      ],
    };
    const inv = invert(m);
    const product = mult(m, inv);
    // Check each element is close to identity
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        expect(product.v[row][col]).toBeCloseTo(row === col ? 1 : 0);
      }
    }
  });

  it('inverts a scale matrix', () => {
    const s = scale(4);
    const inv = invert(s);
    expect(inv.v[0][0]).toBeCloseTo(0.25);
    expect(inv.v[1][1]).toBeCloseTo(0.25);
  });
});

describe('toCss', () => {
  it('produces the correct CSS matrix() string for an identity matrix', () => {
    expect(toCss(ident())).toBe('matrix(1, 0, 0, 1, 0, 0)');
  });

  it('produces the correct CSS matrix() string for a scale(2) matrix', () => {
    expect(toCss(scale(2))).toBe('matrix(2, 0, 0, 2, 0, 0)');
  });
});
