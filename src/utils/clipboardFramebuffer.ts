import { validateFramebufShape } from '../redux/workspaceMigrate';

/** Shape of the `charsets` blob embedded by `getJSON` (see
 *  utils/exporters/json.ts) for any non-built-in charset the copied
 *  framebuf uses. */
export type ClipboardCharsets = {
  [charset: string]: { name?: string; bits?: number[]; charOrder?: number[] };
};

export interface ParsedClipboardFramebuffer {
  /** The raw (unvalidated-further) single `FramebufWithFont`-shaped object
   *  copied via handleCopyTab/copyCurrentFrame. Shape has already been
   *  checked by `validateFramebufShape` by the time this is returned. */
  framebuf: any;
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
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, reason: 'Clipboard contents are not valid Petmate frame data.' };
  }
  const framebuf = parsed?.framebufs;
  const shape = validateFramebufShape(framebuf, 'Pasted clipboard data');
  if (!shape.valid) {
    return { ok: false, reason: shape.reason! };
  }
  const rawCharsets = parsed?.charsets;
  const charsets: ClipboardCharsets =
    rawCharsets && typeof rawCharsets === 'object' ? rawCharsets : {};
  return { ok: true, data: { framebuf, charsets } };
}
