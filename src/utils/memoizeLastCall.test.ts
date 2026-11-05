import { memoizeLastCall } from './memoizeLastCall';

describe('memoizeLastCall', () => {
  it('returns the cached result when called again with the same argument references', () => {
    let calls = 0;
    const fn = memoizeLastCall((a: number[], b: number[]) => {
      calls++;
      return [...a, ...b];
    });
    const arg1 = [1, 2];
    const arg2 = [3, 4];
    const first = fn(arg1, arg2);
    const second = fn(arg1, arg2);
    expect(calls).toBe(1);
    expect(second).toBe(first);
  });

  it('recomputes when any argument reference changes', () => {
    let calls = 0;
    const fn = memoizeLastCall((a: number[]) => {
      calls++;
      return a.length;
    });
    fn([1, 2]);
    fn([1, 2]); // different array instance, same contents -> still a new reference
    expect(calls).toBe(2);
  });

  it('recomputes when a primitive argument value changes', () => {
    let calls = 0;
    const fn = memoizeLastCall((x: number) => {
      calls++;
      return x * 2;
    });
    expect(fn(2)).toBe(4);
    expect(fn(2)).toBe(4);
    expect(calls).toBe(1);
    expect(fn(3)).toBe(6);
    expect(calls).toBe(2);
  });

  it('recomputes when the number of arguments changes', () => {
    let calls = 0;
    const fn = memoizeLastCall((...args: number[]) => {
      calls++;
      return args.length;
    });
    fn(1, 2);
    fn(1, 2, 3);
    expect(calls).toBe(2);
  });

  it('only remembers the single most recent call (not a multi-entry cache)', () => {
    let calls = 0;
    const fn = memoizeLastCall((x: number) => {
      calls++;
      return x;
    });
    fn(1);
    fn(2);
    fn(1); // cache now holds (2), so this is a fresh call again
    expect(calls).toBe(3);
  });

  it('maintains independent cache state across multiple wrapped functions', () => {
    const fnA = memoizeLastCall((x: number) => x + 1);
    const fnB = memoizeLastCall((x: number) => x + 2);
    expect(fnA(1)).toBe(2);
    expect(fnB(1)).toBe(3);
  });
});
