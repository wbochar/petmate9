jest.mock('../electronImports', () => ({
  fs: require('fs'),
}));

import fs from 'fs';
import os from 'os';
import path from 'path';

import { saveSEQ } from './seq';
import { FramebufWithFont, Pixel } from '../../redux/types';

function tempSeqPath(prefix: string) {
  return path.join(
    os.tmpdir(),
    `petmate9-${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.seq`
  );
}

function makeVdcFramebuf(cells: Pixel[]): FramebufWithFont {
  return {
    width: cells.length,
    height: 1,
    backgroundColor: 0,
    borderColor: 0,
    borderOn: false,
    charset: 'c128vdc',
    name: 'test',
    framebuf: [cells],
    zoom: { zoomLevel: 2, alignment: 'left' },
    zoomReady: false,
    font: { bits: [], charOrder: [] },
  };
}

// review-0926 task B5: removeDupColours()/packColSequences() used to scan
// the raw byte stream for SEQ colour-control byte VALUES with no concept of
// multi-byte escape sequences. A VDC raw-character escape (ESC, 'V',
// <payload>) carries a free-form payload byte that can coincidentally equal
// a colour-control byte value (VDC screencode 0x90 is also the
// colour-control byte for black) -- the dedup pass would then splice out
// that payload byte as if it were a duplicate colour byte, corrupting the
// escape sequence.
describe('saveSEQ VDC escape sequences survive colour-dedup optimization (review-0926 task B5)', () => {
  it('does not corrupt a raw-character escape whose payload matches an earlier colour-control byte', () => {
    const filename = tempSeqPath('seq-vdc-escape');
    // Cell 0: code=1 (direct-writable SEQ byte 0x41), colour=0 (black ->
    // colour-control byte 0x90, emitted once up front).
    // Cell 1: code=0x90 -- NOT directly representable as a SEQ byte (see
    // canWriteVdcCodeAsDirectSeqByte), so it must go through the VDC
    // raw-character escape: [ESC(0x1b), 'V'(0x56), 0x90]. Same colour as
    // cell 0, so no new colour-control byte is emitted before it.
    const fb = makeVdcFramebuf([
      { code: 1, color: 0 },
      { code: 0x90, color: 0 },
    ]);

    saveSEQ(filename, fb, {
      name: 'seqFile', description: 'SEQ PETSCII File (.seq)', ext: 'seq',
      commonExportParams: { selectedFramebufIndex: 0 },
      exportOptions: { insCR: false, insClear: false, stripBlanks: true, insCharset: false, tedColorMode: 'quantize16' },
    });

    const bytes = Array.from(fs.readFileSync(filename));
    fs.unlinkSync(filename);

    // The escape sequence's 3 bytes must all survive intact, including the
    // 0x90 payload byte that collides in value with the earlier colour byte.
    expect(bytes).toEqual([0x90, 0x41, 0x1b, 0x56, 0x90]);
  });

  it('still removes genuinely redundant (non-escape) colour-control bytes', () => {
    const filename = tempSeqPath('seq-dup-colour');
    // Three cells, all colour=0 (black) and all directly-writable codes --
    // only one 0x90 colour-control byte should be emitted up front; it must
    // not be re-emitted or duplicated for the later cells.
    const fb = makeVdcFramebuf([
      { code: 1, color: 0 },
      { code: 2, color: 0 },
      { code: 3, color: 0 },
    ]);

    saveSEQ(filename, fb, {
      name: 'seqFile', description: 'SEQ PETSCII File (.seq)', ext: 'seq',
      commonExportParams: { selectedFramebufIndex: 0 },
      exportOptions: { insCR: false, insClear: false, stripBlanks: true, insCharset: false, tedColorMode: 'quantize16' },
    });

    const bytes = Array.from(fs.readFileSync(filename));
    fs.unlinkSync(filename);

    expect(bytes.filter(b => b === 0x90)).toHaveLength(1);
  });
});
