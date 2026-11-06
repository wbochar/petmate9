/**
 * A small, typed registry for panel-local undo/redo stacks (e.g. the
 * Texture panel's strip-editing undo stack), replacing the
 * `(window as any).__texturePopUndo`/etc. ambient-global pattern.
 *
 * Panels with their own local undo/redo (independent from the main
 * canvas's redux-undo history) register their handlers under a stable
 * `scope` key when mounted, and unregister on unmount. The main-process
 * menu's Undo/Redo handler (see src/index.ts) looks up the handlers for
 * whichever scope is relevant to the current tool (gated by
 * `state.toolbar.selectedTool`, same as before) and invokes them.
 *
 * This is a direct, behavior-preserving replacement for the window-global
 * pattern -- it does not change *when* handlers are registered (still tied
 * to component mount/unmount) or *which* scope is consulted (still decided
 * by the caller, e.g. by checking the active tool). It only removes the
 * untyped, ambient-global antipattern and gives callers a real compile-time
 * contract instead of `window as any`.
 */

export interface ScopedUndoHandlers {
  /** Attempt to undo one step. Returns true if a step was undone. */
  undo: () => boolean;
  /** Attempt to redo one step. Returns true if a step was redone. */
  redo: () => boolean;
  /** Clear the undo stack (e.g. so it doesn't interleave with a sibling
   *  history after falling through to it). */
  clearUndo?: () => void;
  /** Clear the redo stack. */
  clearRedo?: () => void;
}

/** Scope key for the Texture panel's strip-editing local undo stack
 *  (TexturePanel.tsx), consulted by src/index.ts's menu Undo/Redo handler
 *  while Tool.Textures is the active tool. */
export const TEXTURE_UNDO_SCOPE = 'texture';

const registry = new Map<string, ScopedUndoHandlers>();

/** Register (or replace) the undo/redo handlers for `scope`. */
export function registerUndoHandlers(scope: string, handlers: ScopedUndoHandlers): void {
  registry.set(scope, handlers);
}

/** Remove `scope`'s handlers (e.g. on unmount). No-op if not registered. */
export function unregisterUndoHandlers(scope: string): void {
  registry.delete(scope);
}

/** Returns true if `scope` currently has registered handlers. */
export function hasUndoHandlers(scope: string): boolean {
  return registry.has(scope);
}

/** Attempt to undo one step for `scope`. Returns false if `scope` has no
 *  registered handlers, or if its stack was already empty. */
export function tryUndo(scope: string): boolean {
  return registry.get(scope)?.undo() ?? false;
}

/** Attempt to redo one step for `scope`. Returns false if `scope` has no
 *  registered handlers, or if its stack was already empty. */
export function tryRedo(scope: string): boolean {
  return registry.get(scope)?.redo() ?? false;
}

/** Clear `scope`'s undo stack, if it has registered handlers and supports it. */
export function tryClearUndo(scope: string): void {
  registry.get(scope)?.clearUndo?.();
}

/** Clear `scope`'s redo stack, if it has registered handlers and supports it. */
export function tryClearRedo(scope: string): void {
  registry.get(scope)?.clearRedo?.();
}
