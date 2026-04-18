#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, 'exports', 'hscroll_pingpong_capture_raw.txt');
const maxScrollArgIdx = process.argv.indexOf('--max-scroll');
const maxScroll = maxScrollArgIdx >= 0 && maxScrollArgIdx + 1 < process.argv.length
  ? parseInt(process.argv[maxScrollArgIdx + 1], 10)
  : 40;

if (!fs.existsSync(inputPath)) {
  console.error(`Capture file not found: ${inputPath}`);
  process.exit(1);
}

const text = fs.readFileSync(inputPath, 'utf8');
const re = /^f(\d+)\s+fine=(\d+)\s+col=\s*(\d+)\s+phase=(\d+)\s+disp=(\d)\s+work=\$([0-9A-F]{2})\s+d016=\$([0-9A-F]{2})\s+d018=\$([0-9A-F]{2})\s+n16=\$([0-9A-F]{2})\s+n18=\$([0-9A-F]{2})/gm;

const rows = [];
let m;
while ((m = re.exec(text)) !== null) {
  rows.push({
    frame: parseInt(m[1], 10),
    fine: parseInt(m[2], 10),
    col: parseInt(m[3], 10),
    phase: parseInt(m[4], 10),
    disp: parseInt(m[5], 10),
    work: parseInt(m[6], 16),
    d016: parseInt(m[7], 16),
    d018: parseInt(m[8], 16),
    nextD016: parseInt(m[9], 16),
    nextD018: parseInt(m[10], 16),
  });
}

if (rows.length === 0) {
  console.error(`No frame rows parsed from: ${inputPath}`);
  process.exit(1);
}

const issues = [];
const boundaries = [];
for (let i = 1; i < rows.length; i++) {
  const prev = rows[i - 1];
  const curr = rows[i];
  if (curr.col < 0 || curr.col > maxScroll) {
    issues.push(`f${curr.frame}: col out of range (${curr.col})`);
  }
  if ((curr.d016 & 0x07) !== curr.fine) {
    issues.push(`f${curr.frame}: d016 low bits ${(curr.d016 & 0x07)} != fine ${curr.fine}`);
  }
  if (curr.phase !== 0) {
    issues.push(`f${curr.frame}: coarse phase expected 0, got ${curr.phase}`);
  }
  const delta = curr.col - prev.col;
  if (delta !== 0) {
    if (Math.abs(delta) !== 1) {
      issues.push(`f${curr.frame}: invalid col delta ${prev.col}->${curr.col}`);
    }
    boundaries.push({
      frame: curr.frame,
      from: prev.col,
      to: curr.col,
      delta,
      fineFrom: prev.fine,
      fineTo: curr.fine,
    });
  }
}

const toMax = boundaries.filter(b => b.from === maxScroll - 1 && b.to === maxScroll);
const fromMax = boundaries.filter(b => b.from === maxScroll && b.to === maxScroll - 1);
const toMin = boundaries.filter(b => b.from === 1 && b.to === 0);
const fromMin = boundaries.filter(b => b.from === 0 && b.to === 1);

const turnaroundIssues = [];
if (toMax.length === 0) turnaroundIssues.push(`No transition ${maxScroll - 1}->${maxScroll} observed`);
if (fromMax.length === 0) turnaroundIssues.push(`No transition ${maxScroll}->${maxScroll - 1} observed`);
if (toMin.length === 0) turnaroundIssues.push('No transition 1->0 observed');
if (fromMin.length === 0) turnaroundIssues.push('No transition 0->1 observed');

const summary = {
  capture: inputPath,
  frames: rows.length,
  boundaries: boundaries.length,
  upTransitions: boundaries.filter(b => b.delta === 1).length,
  downTransitions: boundaries.filter(b => b.delta === -1).length,
  rightEdge: {
    toMaxCount: toMax.length,
    fromMaxCount: fromMax.length,
    toMaxSamples: toMax.slice(0, 3),
    fromMaxSamples: fromMax.slice(0, 3),
  },
  leftEdge: {
    toMinCount: toMin.length,
    fromMinCount: fromMin.length,
    toMinSamples: toMin.slice(0, 3),
    fromMinSamples: fromMin.slice(0, 3),
  },
  issueCount: issues.length + turnaroundIssues.length,
  issues: [...turnaroundIssues, ...issues.slice(0, 20)],
  pass: turnaroundIssues.length === 0 && issues.length === 0,
};

console.log(JSON.stringify(summary, null, 2));
