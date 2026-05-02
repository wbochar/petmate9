import {
  bucketLastContactedAt,
  classifyUltimateModeFromProbes,
  classifyUltimateMachineType,
  looksLikeCpm,
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

describe('looksLikeCpm', () => {
  it('recognizes the CP/M zero-page jump signature', () => {
    const zp = Uint8Array.from([0xC3, 0x00, 0x00, 0x00, 0x00, 0xC3, 0x00, 0xC0]);
    expect(looksLikeCpm(zp)).toBe(true);
  });

  it('returns false for short/non-matching zero-page samples', () => {
    expect(looksLikeCpm(Uint8Array.from([0xC3, 0x00, 0x00]))).toBe(false);
    expect(looksLikeCpm(Uint8Array.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]))).toBe(false);
  });
});

describe('classifyUltimateModeFromProbes', () => {
  it('forces c64 mode when GO64 BASIC pointers are present', () => {
    const r = classifyUltimateModeFromProbes(
      0xFF,
      0xFC,
      0x0A,
      Uint8Array.from([0x99, 0x00, 0x00, 0xAA, 0xB1, 0x91, 0xB3, 0x22]),
      Uint8Array.from([0x01, 0x08, 0x03, 0x08]),
      'c128',
      0,
    );
    expect(r.mode).toBe('c64');
    expect(r.machineType).toBe('c64');
  });

  it('classifies 80-column c128 mode as c128vdc', () => {
    const r = classifyUltimateModeFromProbes(
      0xF8,
      0xFC,
      0x80,
      Uint8Array.from([0x99, 0x99, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      Uint8Array.from([0x00, 0x00, 0x01, 0x1C]),
      'c128',
      0,
    );
    expect(r.mode).toBe('c128vdc');
    expect(r.machineType).toBe('c128');
    expect(r.is80Col).toBe(true);
  });

  it('classifies CP/M signatures as cpm mode while retaining c128 machine type', () => {
    const r = classifyUltimateModeFromProbes(
      0xF8,
      0xFC,
      0x80,
      Uint8Array.from([0xC3, 0x00, 0x00, 0x00, 0x00, 0xC3, 0x00, 0xC0]),
      Uint8Array.from([0x00, 0x00, 0x01, 0x1C]),
      'c128',
      0,
    );
    expect(r.mode).toBe('cpm');
    expect(r.machineType).toBe('c128');
    expect(r.cpmSignature).toBe(true);
  });

  it('classifies standard 40-column c128 mode as c128', () => {
    const r = classifyUltimateModeFromProbes(
      0xF8,
      0xFC,
      0x00,
      Uint8Array.from([0x99, 0x99, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      Uint8Array.from([0x00, 0x00, 0x01, 0x1C]),
      'c128',
      0,
    );
    expect(r.mode).toBe('c128');
    expect(r.machineType).toBe('c128');
    expect(r.is80Col).toBe(false);
    expect(r.cpmSignature).toBe(false);
  });
});
