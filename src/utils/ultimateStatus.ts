import { UltimateMachineType } from '../redux/types';

// After this many consecutive ambiguous ($FF/$FF) reads we drop any sticky
// "c128" classification.  Prevents a single bad sample from pinning the
// badge on the wrong machine indefinitely.
export const MACHINE_AMBIGUOUS_GRACE = 3;

export interface ClassifyResult {
  machineType: UltimateMachineType;
  consecutiveAmbiguous: number;
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

/**
 * Bucket "last contacted" timestamps to the nearest minute so a healthy,
 * online connection only triggers one redux dispatch per minute instead of
 * one per poll.
 */
export function bucketLastContactedAt(now: Date): string {
  const ms = Math.floor(now.getTime() / 60000) * 60000;
  return new Date(ms).toISOString();
}
