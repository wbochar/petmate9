import { migrateWorkspace } from './workspaceMigrate';
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
    expect(out.framebufs[0].framebuf[0][0].attr).toBeUndefined();
  });

  it('preserves an already-set attr byte when migrating a c128Lower frame', () => {
    const ws = {
      version: 4,
      screens: [0],
      framebufs: [mkFb(80, 25, 'c128Lower', { code: 65, color: 15, attr: 0x05 })],
    };
    const out = migrateWorkspace(ws);
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
