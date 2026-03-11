import { mkArray, arraySet, arrayInsertAt, arrayRemoveAt, maybeDefault, maybe } from './fp';

describe('mkArray', () => {
  it('creates an array of the given length initialized by the callback', () => {
    const result = mkArray(5, (i) => i * 2);
    expect(result).toEqual([0, 2, 4, 6, 8]);
  });

  it('returns an empty array when n is 0', () => {
    expect(mkArray(0, () => 'x')).toEqual([]);
  });

  it('works with object values', () => {
    const result = mkArray(3, (i) => ({ id: i }));
    expect(result).toEqual([{ id: 0 }, { id: 1 }, { id: 2 }]);
  });
});

describe('arraySet', () => {
  it('returns a new array with the value replaced at the given index', () => {
    const arr = [10, 20, 30];
    const result = arraySet(arr, 1, 99);
    expect(result).toEqual([10, 99, 30]);
  });

  it('does not mutate the original array', () => {
    const arr = [1, 2, 3];
    arraySet(arr, 0, 100);
    expect(arr).toEqual([1, 2, 3]);
  });

  it('replaces the first element', () => {
    expect(arraySet([1, 2, 3], 0, 42)).toEqual([42, 2, 3]);
  });

  it('replaces the last element', () => {
    expect(arraySet([1, 2, 3], 2, 42)).toEqual([1, 2, 42]);
  });
});

describe('arrayInsertAt', () => {
  it('inserts a value at the specified index', () => {
    expect(arrayInsertAt([1, 2, 3], 1, 99)).toEqual([1, 99, 2, 3]);
  });

  it('inserts at the beginning', () => {
    expect(arrayInsertAt([1, 2], 0, 0)).toEqual([0, 1, 2]);
  });

  it('inserts at the end', () => {
    expect(arrayInsertAt([1, 2], 2, 3)).toEqual([1, 2, 3]);
  });
});

describe('arrayRemoveAt', () => {
  it('removes the element at the specified index', () => {
    expect(arrayRemoveAt([1, 2, 3], 1)).toEqual([1, 3]);
  });

  it('removes the first element', () => {
    expect(arrayRemoveAt([1, 2, 3], 0)).toEqual([2, 3]);
  });

  it('removes the last element', () => {
    expect(arrayRemoveAt([1, 2, 3], 2)).toEqual([1, 2]);
  });

  it('does not mutate the original array', () => {
    const arr = [1, 2, 3];
    arrayRemoveAt(arr, 1);
    expect(arr).toEqual([1, 2, 3]);
  });
});

describe('maybeDefault', () => {
  it('returns the value when it is defined and non-null', () => {
    expect(maybeDefault(42, 0)).toBe(42);
    expect(maybeDefault('hello', 'default')).toBe('hello');
  });

  it('returns the default when the value is undefined', () => {
    expect(maybeDefault(undefined, 99)).toBe(99);
  });

  it('returns the default when the value is null', () => {
    expect(maybeDefault(null, 99)).toBe(99);
  });

  it('returns falsy values that are not null/undefined', () => {
    expect(maybeDefault(0, 99)).toBe(0);
    expect(maybeDefault('', 'default')).toBe('');
    expect(maybeDefault(false, true)).toBe(false);
  });
});

describe('maybe', () => {
  it('applies the function when the value is defined', () => {
    expect(maybe(5, 0, (v) => v * 10)).toBe(50);
  });

  it('returns the default when the value is undefined', () => {
    expect(maybe(undefined, 0, (v) => v * 10)).toBe(0);
  });

  it('returns the default when the value is null', () => {
    expect(maybe(null, 'none', (v) => v.toString())).toBe('none');
  });
});
