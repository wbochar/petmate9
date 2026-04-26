// Shared platform / export-eligibility helpers.
//
// These helpers are intentionally dependency-free (just take a framebuf-like
// object) so they can be imported from the menu handler, redux thunks, and
// exporter modules without introducing circular imports.

export interface FrameLike {
  charset: string;
  width: number;
  height: number;
}

// C64 family charsets.  All of these render on a real C64 and are therefore
// candidates for Ultimate features.  Note that the actual PRG/push routines
// currently only support `upper` / `lower`; those routines still enforce the
// stricter requirement themselves.
const C64_CHARSETS = new Set<string>([
  'upper',
  'lower',
  'dirart',
  'cbaseUpper',
  'cbaseLower',
]);

export function isC64Frame(fb: FrameLike | null | undefined): boolean {
  if (!fb) return false;
  return C64_CHARSETS.has(fb.charset);
}

// Pretty-print the platform/charset for user-facing messages.
export function describeFramePlatform(fb: FrameLike | null | undefined): string {
  if (!fb) return 'none';
  const c = fb.charset;
  if (c === 'upper' || c === 'lower' || c === 'dirart') return `C64 (${c})`;
  if (c === 'cbaseUpper' || c === 'cbaseLower') return `C64 CBASE (${c})`;
  if (c === 'c128vdc') return 'C128 VDC';
  if (c.startsWith('c128')) return `C128 (${c})`;
  if (c.startsWith('c16')) return `C16/Plus4 (${c})`;
  if (c.startsWith('vic20')) return `VIC-20 (${c})`;
  if (c.startsWith('pet')) return `PET (${c})`;
  return c;
}

// D64 export (DirArt directory art) criteria:
//   - charset must be 'dirart'
//   - width must be 16 chars
//   - height must be between 1 and 144 rows inclusive
export const D64_MAX_HEIGHT = 144;
export const D64_REQUIRED_WIDTH = 16;

export function validateD64Framebuf(fb: FrameLike | null | undefined): string | null {
  if (!fb) return 'No frame selected.';
  const problems: string[] = [];
  if (fb.charset !== 'dirart') problems.push(`charset must be DirArt (current: ${fb.charset})`);
  if (fb.width !== D64_REQUIRED_WIDTH) problems.push(`width must be ${D64_REQUIRED_WIDTH} characters (current: ${fb.width})`);
  if (fb.height < 1 || fb.height > D64_MAX_HEIGHT) {
    problems.push(`height must be between 1 and ${D64_MAX_HEIGHT} lines (current: ${fb.height})`);
  }
  if (problems.length === 0) return null;
  return (
    `Export to D64 is only available for DirArt frames.\n` +
    `Requirements:\n` +
    `  • Character set: DirArt\n` +
    `  • Width: ${D64_REQUIRED_WIDTH} characters\n` +
    `  • Height: up to ${D64_MAX_HEIGHT} lines\n\n` +
    `This frame does not match:\n  - ${problems.join('\n  - ')}`
  );
}

export function ultimateOnlyC64Message(fb: FrameLike | null | undefined): string {
  return (
    `Ultimate features are available for C64 frames only.\n` +
    `Current frame platform: ${describeFramePlatform(fb)}.\n\n` +
    `Create or switch to a C64 frame (upper/lower/DirArt charset) and try again.`
  );
}

// Player export target options (see ExportModal PrgPlayerExportForm radio set).
export type PlayerComputer =
  | 'c64' | 'c128' | 'c128vdc'
  | 'c16' | 'vic20'
  | 'pet4032' | 'pet8032';

// Map the current frame's charset (and dimensions where relevant) to the
// Petmate Player "Computer" radio value.  Called when the PRG Player export
// dialog opens so the default target matches the frame being exported.
export function charsetToPlayerComputer(fb: FrameLike | null | undefined): PlayerComputer {
  if (!fb) return 'c64';
  const c = fb.charset;
  if (c === 'upper' || c === 'lower' || c === 'dirart' ||
      c === 'cbaseUpper' || c === 'cbaseLower') {
    return 'c64';
  }
  // The dedicated 80-col VDC charset always exports through the VDC
  // player.  Legacy `c128Upper`/`c128Lower` frames still pick the VDC
  // target when their width hits 80 cols, for back-compat with files
  // saved before the c128vdc charset existed.
  if (c === 'c128vdc') return 'c128vdc';
  if (c === 'c128Upper' || c === 'c128Lower') {
    return fb.width >= 80 ? 'c128vdc' : 'c128';
  }
  if (c === 'c16Upper' || c === 'c16Lower') return 'c16';
  if (c === 'vic20Upper' || c === 'vic20Lower') return 'vic20';
  if (c === 'petGfx' || c === 'petBiz') {
    return fb.width >= 80 ? 'pet8032' : 'pet4032';
  }
  // Unknown charset (e.g. custom font) — assume C64.
  return 'c64';
}
