// Pure helpers for working with Ultimate REST API addresses + saved presets.
// Kept out of redux/* so they can be unit-tested without pulling in the full
// renderer-only chain (electron remote, child_process exporters, etc.).

/**
 * Trim, drop empties, and dedupe (preserving first-seen order) a list of
 * Ultimate address presets.  Non-string entries are skipped defensively.
 */
export function normalizeUltimatePresets(presets: string[]): string[] {
  const normalized: string[] = [];
  for (const raw of presets) {
    if (typeof raw !== 'string') continue;
    const val = raw.trim();
    if (val === '' || normalized.includes(val)) continue;
    normalized.push(val);
  }
  return normalized;
}

/**
 * Normalize a user-entered Ultimate address.
 *
 * The Ultimate REST API only speaks plain HTTP, so we silently rewrite
 * `https://` to `http://`.  Bare hostnames/IPs are prefixed with `http://`.
 * Returns '' if the trimmed input is empty.
 */
export function normalizeUltimateUrl(rawAddress: string): string {
  const trimmed = rawAddress.trim();
  if (trimmed === '') return '';
  if (/^https:\/\//i.test(trimmed)) {
    return `http://${trimmed.slice('https://'.length)}`;
  }
  if (/^http:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}
