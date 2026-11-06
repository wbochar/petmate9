import { validateFramebufShape } from '../redux/workspaceMigrate';
import { Framebuf } from '../redux/types';

/** Shape of the `charsets` blob embedded by `getJSON` (see
 * utils/exporters/json.ts) for any non-built-in charset the copied
 * framebuf uses. */
export type ClipboardCharsets = {
  [charset: string]: { name?: string; bits?: number[]; charOrder?: number[] };
};

export interface ParsedClipboardFramebuffer {
  /** The single `FramebufWithFont`-shaped object copied via
   *  handleCopyTab/copyCurrentFrame. Only width/height/pixel-array
   *  self-consistency has actually been checked (by `validateFramebufShape`)
   *  by the time this is returned -- the `Framebuf` type here records that
   *  trust decision at its one call site (below) rather than leaving `any`
   *  to silently propagate to every downstream consumer; it is NOT a proof
   *  that every optional field (e.g. `charset`) is present or well-formed. */
  framebuf: Framebuf;
  /** Any custom fonts embedded alongside it. Always an object, possibly
   *  empty, never undefined -- callers don't need to re-check its shape. */
  charsets: ClipboardCharsets;
}

export type ParseClipboardFramebufferResult =
  | { ok: true; data: ParsedClipboardFramebuffer }
  | { ok: false; reason: string };

/**
 * Parse + validate the `petmate/framebuffer` clipboard payload written by
 * `handleCopyTab`/`copyCurrentFrame` (see `utils/exporters/json.ts`'s
 * `getJSON`).
 *
 * This is centralized so both paste entry points -- the Ctrl+V shortcut
 * (`toolbar.ts`'s `pasteFrame`) and the tab context menu's Paste
 * (`FramebufferTabs.tsx`'s `handlePasteTab`) -- apply the same shape
 * validation instead of each independently (and, before this fix,
 * inconsistently) reimplementing it. Previously only `JSON.parse` failures
 * were caught; a syntactically-valid JSON payload with a missing/malformed
 * `framebufs` field (e.g. `{}`, or a `framebufs` object with the wrong
 * width/height vs. its pixel array) was passed straight through to
 * `Framebuffer.actions.copyFramebuf`, which assumes the shape is already
 * correct and would corrupt the new screen or throw deep in rendering
 * instead of failing with a clear message at paste time.
 */
export function parseClipboardFramebufferPayload(raw: string): ParseClipboardFramebufferResult {
  // `JSON.parse` returns `any` by default -- typing this `unknown` instead
  // forces every property read below through an explicit (narrow, local)
  // cast rather than letting an untyped value silently flow out of this
  // function into the rest of the app.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, reason: 'Clipboard contents are not valid Petmate frame data.' };
  }
  const parsedObj = (parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : {};
  const framebuf = parsedObj.framebufs;
  const shape = validateFramebufShape(framebuf, 'Pasted clipboard data');
  if (!shape.valid) {
    return { ok: false, reason: shape.reason! };
  }
  const rawCharsets = parsedObj.charsets;
  const charsets: ClipboardCharsets =
    rawCharsets && typeof rawCharsets === 'object' ? rawCharsets as ClipboardCharsets : {};
  // `validateFramebufShape` just confirmed `framebuf` has self-consistent
  // width/height/pixel-array dimensions -- this is the one explicit,
  // documented trust boundary where that checked-but-not-fully-typed value
  // becomes a `Framebuf` for the rest of the app (see the doc comment on
  // `ParsedClipboardFramebuffer.framebuf` above).
  return { ok: true, data: { framebuf: framebuf as Framebuf, charsets } };
}
