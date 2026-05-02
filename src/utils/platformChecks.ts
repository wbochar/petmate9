// Shared platform / export-eligibility helpers.
//
// These helpers are intentionally dependency-free (just take a framebuf-like
// object) so they can be imported from the menu handler, redux thunks, and
// exporter modules without introducing circular imports.

export interface FrameLike {
  charset: string;
  width: number;
  height: number;
  columnMode?: 40 | 80;
}

/** Resolve effective 40/80 display mode for a frame.
 *  Rules:
 *  - c128vdc is always 80-column.
 *  - PET uses explicit `columnMode` when present, otherwise legacy width>=80.
 *  - Legacy c128Upper/c128Lower keep width>=80 behavior for back-compat.
 *  - Everything else defaults to 40-column.
 */
export function resolveColumnMode(
  fb: Pick<FrameLike, 'charset' | 'width' | 'columnMode'> | null | undefined,
): 40 | 80 {
  if (!fb) return 40;
  if (fb.charset === 'c128vdc') return 80;
  if (fb.charset.startsWith('pet')) {
    if (fb.columnMode === 80) return 80;
    if (fb.columnMode === 40) return 40;
    return fb.width >= 80 ? 80 : 40;
  }
  if (fb.charset.startsWith('c128')) return fb.width >= 80 ? 80 : 40;
  return 40;
}

export function canToggleColumnMode(charset: string): boolean {
  return charset.startsWith('pet');
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
const C128_SEND_CHARSETS = new Set<string>([
  'c128Upper',
  'c128Lower',
  'c128vdc',
]);
const ULTIMATE_PUSH_CHARSETS = new Set<string>([
  'upper',
  'lower',
  'c128Upper',
  'c128Lower',
]);

export function isC64Frame(fb: FrameLike | null | undefined): boolean {
  if (!fb) return false;
  return C64_CHARSETS.has(fb.charset);
}

export function isUltimateSendFrame(fb: FrameLike | null | undefined): boolean {
  if (!fb) return false;
  return isC64Frame(fb) || C128_SEND_CHARSETS.has(fb.charset);
}

export function isUltimatePushFrame(fb: FrameLike | null | undefined): boolean {
  if (!fb) return false;
  return ULTIMATE_PUSH_CHARSETS.has(fb.charset);
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

export function ultimatePushUnsupportedFrameMessage(fb: FrameLike | null | undefined): string {
  return (
    `Push to Ultimate currently supports standard C64/C128 40-column frames only.\n` +
    `Current frame platform: ${describeFramePlatform(fb)}.\n\n` +
    `Supported charsets: upper, lower, c128Upper, c128Lower (40x25).`
  );
}

export function ultimateSendUnsupportedFrameMessage(fb: FrameLike | null | undefined): string {
  return (
    `Send to Ultimate currently supports C64 and C128 frames only.\n` +
    `Current frame platform: ${describeFramePlatform(fb)}.\n\n` +
    `Supported: C64 (upper/lower/DirArt/CBASE), C128 40-column, and C128 VDC 80-column frames.`
  );
}

// Ultimate send target used by PRG send routines:
// - c128vdc mode must stay in c128vdc mode
// - c128 machine in 40-col mode stays c128
// - everything else defaults to c64
export type UltimateSendComputer = 'c64' | 'c128' | 'c128vdc';

export function selectUltimateSendComputer(
  machineType: 'c64' | 'c128' | null | undefined,
  mode: 'c64' | 'c128' | 'c128vdc' | 'cpm' | null | undefined,
): UltimateSendComputer {
  if (mode === 'c128vdc') return 'c128vdc';
  if (machineType === 'c128') return 'c128';
  return 'c64';
}

export function selectUltimateSendComputerForFrame(
  fb: FrameLike | null | undefined,
  machineType: 'c64' | 'c128' | null | undefined,
  mode: 'c64' | 'c128' | 'c128vdc' | 'cpm' | null | undefined,
): UltimateSendComputer {
  // C64-family frame sends should always target C64 so Ultimate can switch
  // into C64 mode via run_prg.
  if (isC64Frame(fb)) return 'c64';
  if (fb?.charset === 'c128vdc') return 'c128vdc';
  if (fb?.charset === 'c128Upper' || fb?.charset === 'c128Lower') {
    return fb.width >= 80 ? 'c128vdc' : 'c128';
  }
  return selectUltimateSendComputer(machineType, mode);
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
