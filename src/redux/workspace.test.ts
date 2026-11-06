import { migrateWorkspace, validateWorkspace, validateFramebufShape } from './workspaceMigrate';
import { VDC_ATTR_ALTCHAR } from '../utils/vdcAttr';

function mkRow(width: number, base: { code: number; color: number; attr?: number }) {
  return Array.from({ length: width }, () => ({ ...base }));
}

function mkFb(width: number, height: number, charset: string, base: { code: number; color: number; attr?: number }) {
  return {
    width,
    height,
    charset,
    backgroundColor: 0,
    borderColor: 14,
    borderOn: false,
    name: 'test',
    zoom: { zoomLevel: 2, alignment: 'left' },
    framebuf: Array.from({ length: height }, () => mkRow(width, base)),
  };
}

describe('migrateWorkspace - c128 80-col VDC migration', () => {
  it('upgrades 80-col c128Upper frames to c128vdc without setting ALTCHAR', () => {
    const ws = {
      version: 4,
      screens: [0],
      framebufs: [mkFb(80, 25, 'c128Upper', { code: 65, color: 15 })],
    };
    const out = migrateWorkspace(ws);
    expect(out.framebufs[0].charset).toBe('c128vdc');
    expect(out.framebufs[0].columnMode).toBe(80);
    expect(out.framebufs[0].framebuf[0][0].attr & VDC_ATTR_ALTCHAR).toBe(0);
    expect(out.framebufs[0].framebuf[0][0].code).toBe(65);
  });

  it('upgrades 80-col c128Lower frames to c128vdc and sets ALTCHAR on every cell', () => {
    const ws = {
      version: 4,
      screens: [0],
      framebufs: [mkFb(80, 25, 'c128Lower', { code: 65, color: 15 })],
    };
    const out = migrateWorkspace(ws);
    expect(out.framebufs[0].charset).toBe('c128vdc');
    expect(out.framebufs[0].columnMode).toBe(80);
    const cell = out.framebufs[0].framebuf[0][0];
    expect(cell.attr & VDC_ATTR_ALTCHAR).toBe(VDC_ATTR_ALTCHAR);
    expect(cell.code).toBe(65);
  });

  it('leaves 40-col c128Upper frames alone', () => {
    const ws = {
      version: 4,
      screens: [0],
      framebufs: [mkFb(40, 25, 'c128Upper', { code: 65, color: 15 })],
    };
    const out = migrateWorkspace(ws);
    expect(out.framebufs[0].charset).toBe('c128Upper');
    expect(out.framebufs[0].columnMode).toBeUndefined();
    expect(out.framebufs[0].framebuf[0][0].attr).toBeUndefined();
  });

  it('preserves an already-set attr byte when migrating a c128Lower frame', () => {
    const ws = {
      version: 4,
      screens: [0],
      framebufs: [mkFb(80, 25, 'c128Lower', { code: 65, color: 15, attr: 0x05 })],
    };
    const out = migrateWorkspace(ws);
    expect(out.framebufs[0].columnMode).toBe(80);
    const cell = out.framebufs[0].framebuf[0][0];
    expect(cell.attr & 0x0f).toBe(0x05);
    expect(cell.attr & VDC_ATTR_ALTCHAR).toBe(VDC_ATTR_ALTCHAR);
  });

  it('is a no-op when there are no framebufs', () => {
    const ws = { version: 4, screens: [], framebufs: [] };
    const out = migrateWorkspace(ws);
    expect(out.framebufs).toEqual([]);
  });
});

describe('validateWorkspace', () => {
  it('accepts a well-formed workspace', () => {
    const ws = {
      version: 4,
      screens: [0],
      framebufs: [mkFb(4, 2, 'upper', { code: 1, color: 1 })],
    };
    expect(validateWorkspace(ws)).toEqual({ valid: true });
  });

  it('rejects a non-object', () => {
    expect(validateWorkspace(null).valid).toBe(false);
    expect(validateWorkspace(undefined).valid).toBe(false);
    expect(validateWorkspace('oops').valid).toBe(false);
  });

  it('rejects a workspace missing screens', () => {
    const result = validateWorkspace({ version: 4, framebufs: [] });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/screens/i);
  });

  it('rejects a workspace missing framebufs', () => {
    const result = validateWorkspace({ version: 4, screens: [0] });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/framebufs/i);
  });

  it('rejects a workspace with zero screens', () => {
    const result = validateWorkspace({ version: 4, screens: [], framebufs: [] });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/no screens/i);
  });

  it('rejects a screen index pointing outside the framebufs array', () => {
    const ws = { version: 4, screens: [5], framebufs: [mkFb(4, 2, 'upper', { code: 1, color: 1 })] };
    const result = validateWorkspace(ws);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/invalid screen index/i);
  });

  it('rejects a framebuf with a non-positive width/height', () => {
    const bad = { ...mkFb(4, 2, 'upper', { code: 1, color: 1 }), width: 0 };
    const result = validateWorkspace({ version: 4, screens: [0], framebufs: [bad] });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/width/i);
  });

  it('rejects a framebuf whose pixel data does not match its declared height', () => {
    const fb = mkFb(4, 2, 'upper', { code: 1, color: 1 });
    fb.framebuf = [fb.framebuf[0]]; // only 1 row, declared height is 2
    const result = validateWorkspace({ version: 4, screens: [0], framebufs: [fb] });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/height/i);
  });

  it('rejects a framebuf whose row length does not match its declared width', () => {
    const fb = mkFb(4, 2, 'upper', { code: 1, color: 1 });
    fb.framebuf[0] = fb.framebuf[0].slice(0, 2); // only 2 cols, declared width is 4
    const result = validateWorkspace({ version: 4, screens: [0], framebufs: [fb] });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/width/i);
  });
});

// validateFramebufShape is the per-framebuf primitive validateWorkspace uses
// internally; it's also reused directly by the clipboard copy/paste
// protocol (see utils/clipboardFramebuffer.ts, Group B task B7) to validate
// a single pasted framebuf outside of any workspace wrapper.
describe('validateFramebufShape', () => {
  it('accepts a well-formed framebuf', () => {
    const fb = mkFb(4, 2, 'upper', { code: 1, color: 1 });
    expect(validateFramebufShape(fb, 'Test data')).toEqual({ valid: true });
  });

  it('rejects null/undefined/non-object values', () => {
    expect(validateFramebufShape(null, 'Test data').valid).toBe(false);
    expect(validateFramebufShape(undefined, 'Test data').valid).toBe(false);
    expect(validateFramebufShape('oops', 'Test data').valid).toBe(false);
  });

  it('rejects a non-positive width or height', () => {
    const badWidth = { ...mkFb(4, 2, 'upper', { code: 1, color: 1 }), width: 0 };
    expect(validateFramebufShape(badWidth, 'Test data').reason).toMatch(/width/i);
    const badHeight = { ...mkFb(4, 2, 'upper', { code: 1, color: 1 }), height: -1 };
    expect(validateFramebufShape(badHeight, 'Test data').reason).toMatch(/height/i);
  });

  it('rejects pixel data that does not match declared height', () => {
    const fb = mkFb(4, 2, 'upper', { code: 1, color: 1 });
    fb.framebuf = [fb.framebuf[0]];
    expect(validateFramebufShape(fb, 'Test data').reason).toMatch(/height/i);
  });

  it('rejects pixel data whose row length does not match declared width', () => {
    const fb = mkFb(4, 2, 'upper', { code: 1, color: 1 });
    fb.framebuf[0] = fb.framebuf[0].slice(0, 2);
    expect(validateFramebufShape(fb, 'Test data').reason).toMatch(/width/i);
  });

  it('prefixes the rejection reason with the supplied label', () => {
    const result = validateFramebufShape(null, 'Pasted clipboard data');
    expect(result.reason).toMatch(/^Pasted clipboard data/);
  });
});
