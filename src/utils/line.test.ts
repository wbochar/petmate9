import { drawLine } from './line';

function collectPixels(x0: number, y0: number, x1: number, y1: number) {
  const pixels: [number, number][] = [];
  drawLine((x, y) => pixels.push([x, y]), x0, y0, x1, y1);
  return pixels;
}

describe('drawLine', () => {
  it('draws a single point when start equals end', () => {
    const pixels = collectPixels(5, 5, 5, 5);
    expect(pixels).toEqual([[5, 5]]);
  });

  it('draws a horizontal line left to right', () => {
    const pixels = collectPixels(0, 0, 3, 0);
    expect(pixels).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
  });

  it('draws a horizontal line right to left', () => {
    const pixels = collectPixels(3, 0, 0, 0);
    expect(pixels).toEqual([[3, 0], [2, 0], [1, 0], [0, 0]]);
  });

  it('draws a vertical line top to bottom', () => {
    const pixels = collectPixels(0, 0, 0, 3);
    expect(pixels).toEqual([[0, 0], [0, 1], [0, 2], [0, 3]]);
  });

  it('draws a vertical line bottom to top', () => {
    const pixels = collectPixels(0, 3, 0, 0);
    expect(pixels).toEqual([[0, 3], [0, 2], [0, 1], [0, 0]]);
  });

  it('draws a diagonal line', () => {
    const pixels = collectPixels(0, 0, 3, 3);
    expect(pixels).toEqual([[0, 0], [1, 1], [2, 2], [3, 3]]);
  });

  it('always starts and ends at the given coordinates', () => {
    const pixels = collectPixels(2, 1, 7, 4);
    expect(pixels[0]).toEqual([2, 1]);
    expect(pixels[pixels.length - 1]).toEqual([7, 4]);
  });
});
