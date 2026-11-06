/// <reference types="react-scripts" />

// `redux-logger` ships no type definitions and no @types package is
// installed -- declare it as an untyped module instead of letting the
// configureStore.dev.ts import fail with "could not find a declaration
// file".
declare module 'redux-logger';

// The Redux DevTools browser extension injects this global when installed;
// it has no official type definitions. Typed loosely (not `typeof compose`)
// since the extension's actual signature takes an options object and
// returns a `compose`-compatible function -- see store/configureStore.dev.ts.
interface Window {
  __REDUX_DEVTOOLS_EXTENSION_COMPOSE__?: (options?: Record<string, unknown>) => typeof import('redux').compose;
}
