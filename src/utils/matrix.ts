export type Vec3 = [number, number, number];

function copyVec3(v: Vec3): Vec3 {
  return [...v] as Vec3;
}

export interface Matrix3x3 {
  v: [Vec3, Vec3, Vec3];
}

export function c(a: Matrix3x3, col: number): Vec3 {
  return [a.v[0][col], a.v[1][col], a.v[2][col]];
}

export function r(a: Matrix3x3, row: number): Vec3 {
  return [a.v[row][0], a.v[row][1], a.v[row][2]];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
}

export function multVect3(a: Matrix3x3, v: Vec3) {
  return [dot(r(a, 0), v), dot(r(a, 1), v), dot(r(a, 2), v)];
}

export function copy(m: Matrix3x3): Matrix3x3 {
  return {
    v: [copyVec3(m.v[0]), copyVec3(m.v[1]), copyVec3(m.v[2])]
  }
}

export function ident(): Matrix3x3 {
  return {
    v: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ]
  }
}


// NOTE: currently unused within src (no callers as of this writing); the
// det-near-zero guard below is purely defensive so that if/when this is
// wired up, a singular matrix returns the identity instead of a matrix full
// of Infinity/NaN entries.
export function invert(a: Matrix3x3): Matrix3x3 {
  const res = ident();
  function m(r: number, c: number): number {
    return a.v[r][c];
  }
  function setminv(r: number, c: number, v: number): void {
    res.v[r][c] = v;
  }

  const det = m(0, 0) * (m(1, 1) * m(2, 2) - m(2, 1) * m(1, 2)) -
              m(0, 1) * (m(1, 0) * m(2, 2) - m(1, 2) * m(2, 0)) +
              m(0, 2) * (m(1, 0) * m(2, 1) - m(1, 1) * m(2, 0));

  // A fixed absolute cutoff wrongly flags small-but-nonsingular matrices as
  // singular -- e.g. these matrices are 2D affine transforms in homogeneous
  // form, so the bottom row is always [0, 0, 1]; a uniform scale(1e-6) has
  // det=1e-12 (1e-6 * 1e-6 * 1), far below a 1e-10 absolute threshold, yet
  // is perfectly invertible. A single global maxAbs^3 bound doesn't help
  // here either, since that fixed trailing "1" keeps maxAbs >= 1 regardless
  // of how small the actual scale factors are. Instead use a per-row bound
  // (a simple form of Hadamard's determinant inequality: |det| is at most
  // the product of each row's magnitude) so rows of very different scale
  // are each weighed on their own terms.
  let refMagnitude = 1;
  for (let row = 0; row < 3; row++) {
    refMagnitude *= Math.max(Math.abs(m(row, 0)), Math.abs(m(row, 1)), Math.abs(m(row, 2)));
  }
  const epsilon = 1e-10 * Math.max(1e-10, refMagnitude);
  if (Math.abs(det) < epsilon) {
    return ident();
  }

  const invdet = 1 / det;

  setminv(0, 0, (m(1, 1) * m(2, 2) - m(2, 1) * m(1, 2)) * invdet);
  setminv(0, 1, (m(0, 2) * m(2, 1) - m(0, 1) * m(2, 2)) * invdet);
  setminv(0, 2, (m(0, 1) * m(1, 2) - m(0, 2) * m(1, 1)) * invdet);
  setminv(1, 0, (m(1, 2) * m(2, 0) - m(1, 0) * m(2, 2)) * invdet);
  setminv(1, 1, (m(0, 0) * m(2, 2) - m(0, 2) * m(2, 0)) * invdet);
  setminv(1, 2, (m(1, 0) * m(0, 2) - m(0, 0) * m(1, 2)) * invdet);
  setminv(2, 0, (m(1, 0) * m(2, 1) - m(2, 0) * m(1, 1)) * invdet);
  setminv(2, 1, (m(2, 0) * m(0, 1) - m(0, 0) * m(2, 1)) * invdet);
  setminv(2, 2, (m(0, 0) * m(1, 1) - m(1, 0) * m(0, 1)) * invdet);
  return res;
}

export function mult(a: Matrix3x3, b: Matrix3x3): Matrix3x3 {
  return {
    v: [
      [dot(r(a,0), c(b,0)),  dot(r(a,0), c(b,1)), dot(r(a,0), c(b,2))],
      [dot(r(a,1), c(b,0)),  dot(r(a,1), c(b,1)), dot(r(a,1), c(b,2))],
      [dot(r(a,2), c(b,0)),  dot(r(a,2), c(b,1)), dot(r(a,2), c(b,2))]
    ]
  }
}

export function toCss(a: Matrix3x3) {
  const v = a.v;
  return `matrix(${v[0][0]}, ${v[1][0]}, ${v[0][1]}, ${v[1][1]}, ${v[0][2]}, ${v[1][2]})`;
}

export function scale(s: number): Matrix3x3 {
  const m = ident();
  m.v[0][0] = s;
  m.v[1][1] = s;
  return m;
}

export function translate(x: number, y: number): Matrix3x3 {
  const m = ident();
  m.v[0][2] = x;
  m.v[1][2] = y;
  return m;
}
