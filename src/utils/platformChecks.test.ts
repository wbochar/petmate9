import {
  canToggleColumnMode,
  isUltimatePushFrame,
  isUltimateSendFrame,
  resolveColumnMode,
  selectUltimateSendComputer,
  selectUltimateSendComputerForFrame,
} from './platformChecks';

describe('selectUltimateSendComputer', () => {
  it('returns c128vdc when Ultimate mode is c128vdc', () => {
    expect(selectUltimateSendComputer('c128', 'c128vdc')).toBe('c128vdc');
  });

  it('returns c128 for c128 machine in non-vdc modes', () => {
    expect(selectUltimateSendComputer('c128', 'c128')).toBe('c128');
    expect(selectUltimateSendComputer('c128', 'cpm')).toBe('c128');
  });

  it('defaults to c64 when machine type is unknown or c64', () => {
    expect(selectUltimateSendComputer('c64', 'c64')).toBe('c64');
    expect(selectUltimateSendComputer(null, null)).toBe('c64');
  });
});

describe('resolveColumnMode', () => {
  it('always resolves c128vdc frames to 80 columns', () => {
    expect(resolveColumnMode({ charset: 'c128vdc', width: 40, columnMode: 40 })).toBe(80);
  });

  it('uses explicit PET columnMode over dimensions', () => {
    expect(resolveColumnMode({ charset: 'petGfx', width: 40, columnMode: 80 })).toBe(80);
    expect(resolveColumnMode({ charset: 'petBiz', width: 80, columnMode: 40 })).toBe(40);
  });

  it('falls back to PET width for legacy frames with no columnMode', () => {
    expect(resolveColumnMode({ charset: 'petGfx', width: 80 })).toBe(80);
    expect(resolveColumnMode({ charset: 'petGfx', width: 40 })).toBe(40);
  });

  it('keeps legacy c128 40/80 behavior width-based', () => {
    expect(resolveColumnMode({ charset: 'c128Upper', width: 80 })).toBe(80);
    expect(resolveColumnMode({ charset: 'c128Lower', width: 40 })).toBe(40);
  });

  it('defaults non-PET/non-C128 platforms to 40 columns', () => {
    expect(resolveColumnMode({ charset: 'upper', width: 80 })).toBe(40);
    expect(resolveColumnMode(null)).toBe(40);
  });
});

describe('canToggleColumnMode', () => {
  it('is true only for PET charsets', () => {
    expect(canToggleColumnMode('petGfx')).toBe(true);
    expect(canToggleColumnMode('petBiz')).toBe(true);
    expect(canToggleColumnMode('c128vdc')).toBe(false);
    expect(canToggleColumnMode('upper')).toBe(false);
  });
});

describe('isUltimatePushFrame', () => {
  it('accepts standard C64 and C128 40-column charsets', () => {
    expect(isUltimatePushFrame({ charset: 'upper', width: 40, height: 25 })).toBe(true);
    expect(isUltimatePushFrame({ charset: 'lower', width: 40, height: 25 })).toBe(true);
    expect(isUltimatePushFrame({ charset: 'c128Upper', width: 40, height: 25 })).toBe(true);
    expect(isUltimatePushFrame({ charset: 'c128Lower', width: 40, height: 25 })).toBe(true);
  });

  it('rejects unsupported push charsets', () => {
    expect(isUltimatePushFrame({ charset: 'c128vdc', width: 80, height: 25 })).toBe(false);
    expect(isUltimatePushFrame({ charset: 'dirart', width: 40, height: 25 })).toBe(false);
    expect(isUltimatePushFrame({ charset: 'petGfx', width: 40, height: 25 })).toBe(false);
    expect(isUltimatePushFrame(null)).toBe(false);
  });
});

describe('isUltimateSendFrame', () => {
  it('accepts C64 and C128 frame charsets', () => {
    expect(isUltimateSendFrame({ charset: 'upper', width: 40, height: 25 })).toBe(true);
    expect(isUltimateSendFrame({ charset: 'c128Lower', width: 40, height: 25 })).toBe(true);
    expect(isUltimateSendFrame({ charset: 'c128vdc', width: 80, height: 25 })).toBe(true);
  });

  it('rejects unsupported frame charsets', () => {
    expect(isUltimateSendFrame({ charset: 'petGfx', width: 40, height: 25 })).toBe(false);
    expect(isUltimateSendFrame(null)).toBe(false);
  });
});

describe('selectUltimateSendComputerForFrame', () => {
  it('prefers c128vdc for explicit vdc or legacy 80-column c128 frames', () => {
    expect(
      selectUltimateSendComputerForFrame(
        { charset: 'c128vdc', width: 80, height: 25 },
        'c64',
        'c64',
      )
    ).toBe('c128vdc');
    expect(
      selectUltimateSendComputerForFrame(
        { charset: 'c128Upper', width: 80, height: 25 },
        'c128',
        'c128',
      )
    ).toBe('c128vdc');
  });

  it('uses c128 for 40-column c128 frames', () => {
    expect(
      selectUltimateSendComputerForFrame(
        { charset: 'c128Lower', width: 40, height: 25 },
        'c64',
        'c64',
      )
    ).toBe('c128');
  });

  it('forces c64 for c64-family frames regardless of machine/mode', () => {
    expect(
      selectUltimateSendComputerForFrame(
        { charset: 'upper', width: 40, height: 25 },
        'c128',
        'c128',
      )
    ).toBe('c64');
    expect(
      selectUltimateSendComputerForFrame(
        { charset: 'upper', width: 40, height: 25 },
        'c64',
        'c64',
      )
    ).toBe('c64');
  });

  it('falls back to machine/mode detection for unknown frame types', () => {
    expect(
      selectUltimateSendComputerForFrame(
        { charset: 'customUnknown', width: 40, height: 25 },
        'c128',
        'c128',
      )
    ).toBe('c128');
  });
});
