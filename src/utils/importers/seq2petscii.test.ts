jest.mock('../electronImports', () => ({
  electron: {
    remote: {
      app: {
        getAppPath: () => process.cwd(),
      },
    },
  },
  fs: require('fs'),
  path: require('path'),
  app: {
    getPath: () => require('os').tmpdir(),
  },
  buffer: require('buffer'),
}));

jest.mock('../../redux/workspace', () => ({
  framebufFromJson: (c: any) => c,
}));

import fs from 'fs';
import os from 'os';
import path from 'path';

import { saveSEQ } from '../exporters/seq';
import { loadSeq, loadSeqAdvanced, SeqAdvOptions } from './seq2petscii';
import { VDC_ATTR_BLINK, VDC_ATTR_REVERSE, VDC_ATTR_UNDERLINE } from '../vdcAttr';

function tempSeqPath(prefix: string) {
  return path.join(
    os.tmpdir(),
    `petmate9-${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.seq`
  );
}

function writeSeq(bytes: number[]) {
  const file = tempSeqPath('seq-test');
  fs.writeFileSync(file, Buffer.from(bytes));
  return file;
}

function decodeVdcSeq(bytes: number[], overrides: Partial<SeqAdvOptions> = {}) {
  const filename = writeSeq(bytes);
  const options: SeqAdvOptions = {
    width: 1,
    minHeight: 1,
    crCodes: new Set<number>([0x0d]),
    honorCls: true,
    stripBlanks: false,
    charset: 'c128vdc',
    backgroundColor: 6,
    borderColor: 14,
    ...overrides,
  };
  const fb = loadSeqAdvanced(filename, options);
  fs.unlinkSync(filename);
  return fb as any;
}

describe('VDC SEQ export/import', () => {
  it('base loadSeq uses c128vdc-specific 80-column layout', () => {
    const filename = writeSeq([0x05, ...Array.from({ length: 81 }, () => 0x41)]);
    const fb = loadSeq(filename, 'c128vdc') as any;
    fs.unlinkSync(filename);

    expect(fb).toBeDefined();
    expect(fb.width).toBe(80);
    expect(fb.height).toBe(2);
    expect(fb.framebuf[0][79].code).toBe(0x01);
    expect(fb.framebuf[1][0].code).toBe(0x01);
  });
  it('exports VDC code 0x01 using mapped printable byte 0x41 (not control byte 0x01)', () => {
    const filename = tempSeqPath('vdc-export');
    const fb: any = {
      width: 1,
      height: 1,
      charset: 'c128vdc',
      framebuf: [[{ code: 0x01, color: 1, attr: 0x01 }]],
    };
    const fmt: any = {
      exportOptions: {
        insCR: false,
        insClear: false,
        stripBlanks: false,
        insCharset: false,
      },
    };

    saveSEQ(filename, fb, fmt);
    const bytes = Array.from(fs.readFileSync(filename));
    fs.unlinkSync(filename);

    expect(bytes).toEqual([0x05, 0x41]);
    expect(bytes).not.toContain(0x01);
  });

  it('imports mapped printable byte 0x41 back to VDC screencode 0x01', () => {
    const fb = decodeVdcSeq([0x05, 0x41]);
    expect(fb).toBeDefined();
    expect(fb.framebuf[0][0].code).toBe(0x01);
    expect(fb.framebuf[0][0].color).toBe(0x01);
    expect(fb.framebuf[0][0].attr).toBe(0x01);
  });
  it('exports VDC underline/blink transitions using ESC sequences', () => {
    const filename = tempSeqPath('vdc-export-esc');
    const fb: any = {
      width: 2,
      height: 1,
      charset: 'c128vdc',
      framebuf: [[
        { code: 0x01, color: 1, attr: 0x01 | VDC_ATTR_UNDERLINE | VDC_ATTR_BLINK },
        { code: 0x02, color: 1, attr: 0x01 },
      ]],
    };
    const fmt: any = {
      exportOptions: {
        insCR: false,
        insClear: false,
        stripBlanks: false,
        insCharset: false,
      },
    };

    saveSEQ(filename, fb, fmt);
    const bytes = Array.from(fs.readFileSync(filename));
    fs.unlinkSync(filename);

    expect(bytes).toEqual([0x05, 0x1b, 0x49, 0x1b, 0x4f, 0x41, 0x1b, 0x4a, 0x1b, 0x50, 0x42]);
  });

  it('imports VDC ESC I/J/O/P underline and blink controls', () => {
    const fb = decodeVdcSeq(
      [0x05, 0x1b, 0x49, 0x1b, 0x4f, 0x41, 0x1b, 0x4a, 0x1b, 0x50, 0x42],
      { width: 2, minHeight: 1 }
    );
    expect(fb).toBeDefined();
    expect(fb.framebuf[0][0].code).toBe(0x01);
    expect(fb.framebuf[0][1].code).toBe(0x02);
    expect(fb.framebuf[0][0].attr).toBe(0x01 | VDC_ATTR_UNDERLINE | VDC_ATTR_BLINK);
    expect(fb.framebuf[0][1].attr).toBe(0x01);
  });

  it('keeps reverse, underline, and blink active across CR in VDC mode using ESC controls', () => {
    const fb = decodeVdcSeq(
      [0x05, 0x12, 0x1b, 0x49, 0x1b, 0x4f, 0x41, 0x0d, 0x41],
      { width: 2, minHeight: 2, crCodes: new Set<number>([0x0d]) }
    );
    const expectedAttr = 0x01 | VDC_ATTR_REVERSE | VDC_ATTR_UNDERLINE | VDC_ATTR_BLINK;

    expect(fb).toBeDefined();
    expect(fb.framebuf[0][0].code).toBe(0x01);
    expect(fb.framebuf[1][0].code).toBe(0x01);
    expect(fb.framebuf[0][0].attr).toBe(expectedAttr);
    expect(fb.framebuf[1][0].attr).toBe(expectedAttr);
  });

  it('keeps reverse, underline, and blink active across CR in VDC mode', () => {
    const fb = decodeVdcSeq(
      [0x05, 0x12, 0x02, 0x0f, 0x41, 0x0d, 0x41],
      { width: 2, minHeight: 2, crCodes: new Set<number>([0x0d]) }
    );
    const expectedAttr = 0x01 | VDC_ATTR_REVERSE | VDC_ATTR_UNDERLINE | VDC_ATTR_BLINK;

    expect(fb).toBeDefined();
    expect(fb.framebuf[0][0].code).toBe(0x01);
    expect(fb.framebuf[1][0].code).toBe(0x01);
    expect(fb.framebuf[0][0].attr).toBe(expectedAttr);
    expect(fb.framebuf[1][0].attr).toBe(expectedAttr);
  });

  it('round-trips bundled C128 VDC color bars with >127 screencodes', () => {
    const workspacePath = path.resolve(__dirname, '../../../assets/colorbars_workspace.petmate');
    const workspaceDoc = JSON.parse(fs.readFileSync(workspacePath, 'utf8'));
    const source = workspaceDoc.framebufs.find((fb: any) => fb?.name === 'C128 VDC 80x25');

    expect(source).toBeDefined();
    expect(source.charset).toBe('c128vdc');
    expect(source.width).toBe(80);
    expect(source.height).toBe(25);

    let highCodeCount = 0;
    for (let y = 0; y < source.height; y++) {
      for (let x = 0; x < source.width; x++) {
        if ((source.framebuf[y][x].code & 0xff) > 0x7f) {
          highCodeCount++;
        }
      }
    }
    expect(highCodeCount).toBeGreaterThan(0);

    const filename = tempSeqPath('vdc-colorbars-roundtrip');
    const fmt: any = {
      exportOptions: {
        insCR: false,
        insClear: true,
        stripBlanks: false,
        insCharset: false,
      },
    };

    try {
      saveSEQ(filename, source as any, fmt);

      const imported = loadSeqAdvanced(filename, {
        width: 80,
        minHeight: 25,
        crCodes: new Set<number>([0x0d, 0x8d]),
        honorCls: true,
        stripBlanks: false,
        charset: 'c128vdc',
        backgroundColor: source.backgroundColor,
        borderColor: source.borderColor,
      }) as any;

      expect(imported).toBeDefined();
      expect(imported.width).toBe(80);
      expect(imported.height).toBe(25);

      let mismatches = 0;
      for (let y = 0; y < source.height; y++) {
        for (let x = 0; x < source.width; x++) {
          const srcCell = source.framebuf[y][x];
          const dstCell = imported.framebuf[y][x];
          const srcCode = srcCell.code & 0xff;
          const dstCode = dstCell.code & 0xff;
          const srcColor = srcCell.color & 0x0f;
          const dstColor = dstCell.color & 0x0f;
          const srcAttr = (srcCell.attr ?? srcColor) & 0xff;
          const dstAttr = (dstCell.attr ?? dstColor) & 0xff;
          if (srcCode !== dstCode || srcColor !== dstColor || srcAttr !== dstAttr) {
            mismatches++;
          }
        }
      }

      expect(mismatches).toBe(0);
    } finally {
      if (fs.existsSync(filename)) {
        fs.unlinkSync(filename);
      }
    }
  });
});

describe('C16 TED full-color SEQ export', () => {
  it('uses canonical color bit 7 as TED blink bit', () => {
    const filename = tempSeqPath('c16-tedfull-canonical');
    const fb: any = {
      width: 1,
      height: 1,
      charset: 'c16Upper',
      framebuf: [[{ code: 0x20, color: 0x95 }]],
    };
    const fmt: any = {
      exportOptions: {
        insCR: false,
        insClear: false,
        stripBlanks: false,
        insCharset: false,
        tedColorMode: 'tedFull',
      },
    };

    saveSEQ(filename, fb, fmt);
    const bytes = Array.from(fs.readFileSync(filename));
    fs.unlinkSync(filename);

    expect(bytes).toEqual([0x16, 0x95, 0x20]);
  });

  it('falls back to legacy attr blink bit when canonical color blink is unset', () => {
    const filename = tempSeqPath('c16-tedfull-legacy-attr');
    const fb: any = {
      width: 1,
      height: 1,
      charset: 'c16Upper',
      framebuf: [[{ code: 0x20, color: 0x15, attr: 0x80 }]],
    };
    const fmt: any = {
      exportOptions: {
        insCR: false,
        insClear: false,
        stripBlanks: false,
        insCharset: false,
        tedColorMode: 'tedFull',
      },
    };

    saveSEQ(filename, fb, fmt);
    const bytes = Array.from(fs.readFileSync(filename));
    fs.unlinkSync(filename);

    expect(bytes).toEqual([0x16, 0x95, 0x20]);
  });
});
