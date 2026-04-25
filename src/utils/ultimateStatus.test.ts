import {
  bucketLastContactedAt,
  classifyUltimateMachineType,
  MACHINE_AMBIGUOUS_GRACE,
} from './ultimateStatus';

describe('classifyUltimateMachineType', () => {
  it('classifies a clean C128 read', () => {
    // VIC-IIe extension registers: top bits set, low control bits varying.
    // $D02F = 0xF8 (key column scan, no extra keys), $D030 = 0xFC (slow
    // mode + test bit clear) — both look like c128.
    const r = classifyUltimateMachineType(0xF8, 0xFC, null, 0);
    expect(r.machineType).toBe('c128');
    expect(r.consecutiveAmbiguous).toBe(0);
  });

  it('classifies a clearly non-VIC-IIe read as c64', () => {
    // Random low bytes — nothing like c128 register layout.
    const r = classifyUltimateMachineType(0x00, 0x12, null, 0);
    expect(r.machineType).toBe('c64');
    expect(r.consecutiveAmbiguous).toBe(0);
  });

  it('keeps c128 sticky across the grace window on $FF/$FF reads', () => {
    let counter = 0;
    let prev: 'c128' | 'c64' = 'c128';
    for (let i = 1; i <= MACHINE_AMBIGUOUS_GRACE; i++) {
      const r = classifyUltimateMachineType(0xFF, 0xFF, prev, counter);
      expect(r.machineType).toBe('c128');
      expect(r.consecutiveAmbiguous).toBe(i);
      counter = r.consecutiveAmbiguous;
      prev = r.machineType;
    }
  });

  it('drops sticky c128 once the grace window expires', () => {
    const counter = MACHINE_AMBIGUOUS_GRACE; // already at the limit
    const r = classifyUltimateMachineType(0xFF, 0xFF, 'c128', counter);
    expect(r.machineType).toBe('c64');
    expect(r.consecutiveAmbiguous).toBe(MACHINE_AMBIGUOUS_GRACE + 1);
  });

  it('does not promote $FF/$FF to c128 when prev was c64', () => {
    const r = classifyUltimateMachineType(0xFF, 0xFF, 'c64', 0);
    expect(r.machineType).toBe('c64');
    expect(r.consecutiveAmbiguous).toBe(1);
  });

  it('resets the ambiguous counter on a non-ambiguous read', () => {
    const r = classifyUltimateMachineType(0x00, 0x12, 'c128', 5);
    expect(r.machineType).toBe('c64');
    expect(r.consecutiveAmbiguous).toBe(0);
  });

  it('respects a custom graceLimit override', () => {
    // graceLimit = 1: first ambiguous read sticks, second drops.
    const r1 = classifyUltimateMachineType(0xFF, 0xFF, 'c128', 0, 1);
    expect(r1.machineType).toBe('c128');
    expect(r1.consecutiveAmbiguous).toBe(1);

    const r2 = classifyUltimateMachineType(0xFF, 0xFF, 'c128', r1.consecutiveAmbiguous, 1);
    expect(r2.machineType).toBe('c64');
    expect(r2.consecutiveAmbiguous).toBe(2);
  });

  it('only masks to the low byte (0xFF) of each register', () => {
    // Anything outside the 0..0xFF range should still be treated as the
    // masked value.  0x1FF -> 0xFF.
    const r = classifyUltimateMachineType(0x1FF, 0x1FF, 'c128', 0);
    expect(r.machineType).toBe('c128');
    expect(r.consecutiveAmbiguous).toBe(1);
  });
});

describe('bucketLastContactedAt', () => {
  it('truncates to the start of the containing minute', () => {
    const now = new Date('2026-04-25T12:34:56.789Z');
    expect(bucketLastContactedAt(now)).toBe('2026-04-25T12:34:00.000Z');
  });

  it('returns the same bucket for two timestamps in the same minute', () => {
    const a = new Date('2026-04-25T12:34:00.001Z');
    const b = new Date('2026-04-25T12:34:59.999Z');
    expect(bucketLastContactedAt(a)).toBe(bucketLastContactedAt(b));
  });

  it('returns different buckets for adjacent minutes', () => {
    const a = new Date('2026-04-25T12:34:59.999Z');
    const b = new Date('2026-04-25T12:35:00.000Z');
    expect(bucketLastContactedAt(a)).not.toBe(bucketLastContactedAt(b));
  });
});
