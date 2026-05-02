import { UltimateMachineType } from '../redux/types';

// After this many consecutive ambiguous ($FF/$FF) reads we drop any sticky
// "c128" classification.  Prevents a single bad sample from pinning the
// badge on the wrong machine indefinitely.
export const MACHINE_AMBIGUOUS_GRACE = 3;

export interface ClassifyResult {
  machineType: UltimateMachineType;
  consecutiveAmbiguous: number;
}
export type UltimateDetectedMode = 'c64' | 'c128' | 'c128vdc' | 'cpm';
export interface ClassifyModeResult extends ClassifyResult {
  mode: UltimateDetectedMode;
  cpmSignature: boolean;
  is80Col: boolean;
}

/**
 * Classify the Ultimate target machine from a 2-byte read of the VIC-IIe
 * extension registers ($D02F/$D030).
 *
 * - On a real C64 these registers are unmapped and commonly read as $FF.
 * - On a C128 the registers are real and the upper bits stay set, with low
 *   control bits varying.
 * - When the read is fully ambiguous ($FF/$FF) we keep a previously-confirmed
 *   "c128" classification across `graceLimit` consecutive samples to avoid
 *   flicker, but fall back to "c64" once the grace window expires.
 *
 * The function is pure: callers thread the consecutive-ambiguous counter
 * through via the input/output instead of relying on hidden module state,
 * which keeps this trivially unit-testable.
 */
export function classifyUltimateMachineType(
  d02f: number,
  d030: number,
  prevMachineType: UltimateMachineType,
  consecutiveAmbiguous: number,
  graceLimit: number = MACHINE_AMBIGUOUS_GRACE,
): ClassifyResult {
  const d02fReg = d02f & 0xFF;
  const d030Reg = d030 & 0xFF;

  if (d02fReg === 0xFF && d030Reg === 0xFF) {
    const next = consecutiveAmbiguous + 1;
    if (next <= graceLimit && prevMachineType === 'c128') {
      return { machineType: 'c128', consecutiveAmbiguous: next };
    }
    return { machineType: 'c64', consecutiveAmbiguous: next };
  }

  const d02fLooksVicIIe = (d02fReg & 0xF8) === 0xF8;
  const d030LooksVicIIe = (d030Reg & 0xFC) === 0xFC;
  if (d02fLooksVicIIe && d030LooksVicIIe) {
    return { machineType: 'c128', consecutiveAmbiguous: 0 };
  }
  return { machineType: 'c64', consecutiveAmbiguous: 0 };
}

function u16(lo: number, hi: number): number {
  return ((hi & 0xFF) << 8) | (lo & 0xFF);
}

export function looksLikeCpm(zp0000_0007: ArrayLike<number> | null | undefined): boolean {
  if (!zp0000_0007 || zp0000_0007.length < 8) return false;
  const jumpAt0000 = (zp0000_0007[0] & 0xFF) === 0xC3; // JP nn
  const jumpAt0005 = (zp0000_0007[5] & 0xFF) === 0xC3; // BDOS vector: JP nn
  const bdosVectorHi = zp0000_0007[7] & 0xFF;
  return jumpAt0000 && jumpAt0005 && bdosVectorHi >= 0xC0;
}

export function classifyUltimateModeFromProbes(
  d02f: number,
  d030: number,
  d7: number,
  zp0000_0007: ArrayLike<number> | null | undefined,
  basicPtrs002B_002E: ArrayLike<number>,
  prevMachineType: UltimateMachineType,
  consecutiveAmbiguous: number,
  graceLimit: number = MACHINE_AMBIGUOUS_GRACE,
): ClassifyModeResult {
  const machine = classifyUltimateMachineType(
    d02f,
    d030,
    prevMachineType,
    consecutiveAmbiguous,
    graceLimit,
  );
  const c64BasicPtr = basicPtrs002B_002E.length >= 2
    ? u16(basicPtrs002B_002E[0], basicPtrs002B_002E[1])
    : 0x0000;
  const c128BasicPtr = basicPtrs002B_002E.length >= 4
    ? u16(basicPtrs002B_002E[2], basicPtrs002B_002E[3])
    : 0x0000;
  // In GO64 mode on C128, BASIC pointers are typically:
  //   $002B/$002C = $0801
  //   $002D/$002E = $0803
  // This is a strong C64-mode signature and avoids false C128 positives
  // from ambiguous VIC-IIe extension reads.
  const c64ModeByBasicPtrs = c64BasicPtr === 0x0801 && c128BasicPtr === 0x0803;
  const cpm = looksLikeCpm(zp0000_0007);
  const is80Col = ((d7 & 0xFF) & 0x80) !== 0;

  let mode: UltimateDetectedMode = 'c64';
  if (c64ModeByBasicPtrs || machine.machineType === 'c64') {
    mode = 'c64';
  } else if (cpm) {
    mode = 'cpm';
  } else {
    mode = is80Col ? 'c128vdc' : 'c128';
  }

  return {
    machineType: mode === 'c64' ? 'c64' : 'c128',
    consecutiveAmbiguous: machine.consecutiveAmbiguous,
    mode,
    cpmSignature: cpm,
    is80Col,
  };
}

/**
 * Bucket "last contacted" timestamps to the nearest minute so a healthy,
 * online connection only triggers one redux dispatch per minute instead of
 * one per poll.
 */
export function bucketLastContactedAt(now: Date): string {
  const ms = Math.floor(now.getTime() / 60000) * 60000;
  return new Date(ms).toISOString();
}
