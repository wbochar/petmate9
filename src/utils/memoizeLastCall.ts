// ─────────────────────────────────────────────────────────────────────────
// Reference-equality "last-call" memoization.
//
// A few places in this codebase (see `src/redux/selectors.ts` and
// `ImportModal.tsx`'s PNG-conversion cache) use `fast-memoize` to cache
// functions called with large/complex object arguments (font bit arrays,
// full brush pixel grids, transform objects, decoded images). `fast-memoize`
// JSON-serializes all arguments into a cache key and retains every distinct
// entry forever for the life of the module — which, for an open-ended value
// space like "every brush the user has ever selected in this session",
// amounts to a slow, unbounded memory leak. See review-0926.md, cross-
// cutting theme #5.
//
// This helper is the replacement: it remembers only the single most recent
// call, and treats arguments as "unchanged" when each one is `===` to the
// corresponding argument from the previous call (the same technique used by
// `reselect`/`memoize-one`). That's a much better fit for the typical usage
// here — a selector-style function called repeatedly, every render, with
// the same Redux-state object references until something actually changes
// (Redux updates state immutably, so a changed value always gets a new
// object reference). It needs no serialization and uses O(1) bounded
// memory, instead of growing without bound for every distinct value ever
// seen in a session.
//
// Only suitable for pure functions — the result must depend solely on the
// arguments — and only useful when "same reference as last time" is a
// meaningful proxy for "same value as last time", which holds for the
// Redux-selector-style call sites this is intended to replace.
// ─────────────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

function sameArgs(a: any[] | null, b: any[]): boolean {
  if (a === null || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Wrap a pure function so that calling it again with the same (by `===`)
 * arguments as the previous call returns the cached result instead of
 * recomputing. Any argument that differs by reference invalidates the
 * cache and triggers a fresh call. Only the most recent call is
 * remembered — this is not a general-purpose multi-entry cache.
 */
export function memoizeLastCall<Args extends any[], R>(
  fn: (...args: Args) => R
): (...args: Args) => R {
  let hasCached = false;
  let lastArgs: Args | null = null;
  let lastResult: R;

  return (...args: Args): R => {
    if (hasCached && sameArgs(lastArgs, args)) {
      return lastResult;
    }
    lastResult = fn(...args);
    lastArgs = args;
    hasCached = true;
    return lastResult;
  };
}
