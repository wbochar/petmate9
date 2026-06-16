// Web Worker for PETSCII image conversion.
// Runs entirely off the main thread — no DOM access.
//
// Message protocol:
//   Main → Worker:  ConvertWorkerRequest
//   Worker → Main:  ConvertWorkerResponse | ConvertWorkerProgress

import {
  type Rgb, type Pixel, type FontData,
  type PetsciiatorSettings, type Img2PetsciiSettings, type Petmate9Settings,
  type ConverterName,
  buildMaskedPalette, buildGrayIndices,
  getClosestColorIndex,
  nearestColorToPalette, ditherToPalette,
  detectBackground,
  petsciiatorMatchRows,
  img2petsciiMatchRows,
  petmate9MatchRows,
  applyMonoMode,
  applyDitherLab,
  buildLabPaletteFromRgb,
  buildImageLabMap,
  getClosestColorIndexLabFromRgb,
} from '../utils/converters/convertCore';

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

export interface ConvertWorkerRequest {
  type: 'convert';
  id: number;                    // Job ID for correlation
  converter: ConverterName;
  rgbaBuffer: ArrayBuffer;       // Transferred, not copied
  pxW: number;
  pxH: number;
  framebufWidth: number;
  framebufHeight: number;
  font: FontData;
  palette: Rgb[];
  numFgColors: number;
  backgroundColor: number;
  forceBackgroundColor: boolean;
  colorMask?: boolean[];
  // Image draw bounds for background auto-detection
  drawX: number; drawY: number; drawW: number; drawH: number;
  // Converter-specific settings
  petsciiatorSettings?: PetsciiatorSettings;
  img2petsciiSettings?: Img2PetsciiSettings;
  petmate9Settings?: Petmate9Settings;
  // Row range for this worker (multi-worker splitting)
  rowStart: number;
  rowEnd: number;
  // When true, this worker also performs dithering + bg detection for the
  // entire image before matching its row range.  Only one worker per job
  // should have this set.
  runDither: boolean;
  // Pre-dithered data (when runDither is false, provided by dispatcher)
  indexedBuffer?: ArrayBuffer;
  bgIdx?: number;
  indexMap?: number[];
  allowedColorsArray?: number[];  // Serialised Set<number>
}

export interface ConvertWorkerResponse {
  type: 'result';
  id: number;
  rows: Pixel[][];
  backgroundColor: number;
  rowStart: number;
  // If this worker ran the dither pass, share the result so the dispatcher
  // can forward it to sibling workers.
  indexedBuffer?: ArrayBuffer;
  indexMap?: number[];
  bgIdx?: number;
  allowedColorsArray?: number[];
}

export interface ConvertWorkerProgress {
  type: 'progress';
  id: number;
  rowsDone: number;
}

// ---------------------------------------------------------------------------
// Worker entry
// ---------------------------------------------------------------------------

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<ConvertWorkerRequest>) => {
  const req = e.data;
  const rgba = new Uint8ClampedArray(req.rgbaBuffer);

  const numFg = req.numFgColors;
  const workPalette = req.palette.slice(0, numFg);

  // ---- Dither + background detection (if this worker owns it) ----
  let indexed: Uint8Array;
  let bgIdx: number;
  let indexMap: number[];
  let allowedColors: Set<number> | undefined;

  if (req.runDither) {
    // Apply mono pre-processing if img2petscii mono mode
    if (req.converter === 'img2petscii' && req.img2petsciiSettings?.monoMode) {
      applyMonoMode(rgba, req.img2petsciiSettings.monoThreshold);
    }

    let preBgIdx = req.backgroundColor;
    if (preBgIdx >= numFg) {
      preBgIdx = req.converter === 'petmate9'
        ? getClosestColorIndexLabFromRgb(req.palette[preBgIdx].r, req.palette[preBgIdx].g, req.palette[preBgIdx].b, workPalette)
        : getClosestColorIndex(req.palette[preBgIdx].r, req.palette[preBgIdx].g, req.palette[preBgIdx].b, workPalette);
    }

    const masked = buildMaskedPalette(workPalette, req.colorMask, preBgIdx);
    indexMap = masked.indexMap;
    allowedColors = masked.allowedColors;

    if (req.converter === 'petmate9') {
      const paletteLab = buildLabPaletteFromRgb(masked.maskedPalette);
      indexed = applyDitherLab(rgba, req.pxW, req.pxH, paletteLab, masked.maskedPalette, req.petmate9Settings?.ditherMode ?? 'none');
    } else if (req.converter === 'petsciiator') {
      const useDither = req.petsciiatorSettings?.dithering ?? true;
      indexed = useDither
        ? ditherToPalette(rgba, req.pxW, req.pxH, masked.maskedPalette)
        : nearestColorToPalette(rgba, req.pxW, req.pxH, masked.maskedPalette);
    } else {
      // img2petscii: nearest-color quantisation (no FS dithering in the original)
      indexed = nearestColorToPalette(rgba, req.pxW, req.pxH, masked.maskedPalette);
    }

    bgIdx = masked.maskedBgIdx;
    if (!req.forceBackgroundColor) {
      const imgX0 = Math.max(0, Math.floor(req.drawX));
      const imgY0 = Math.max(0, Math.floor(req.drawY));
      const imgX1 = Math.min(req.pxW, Math.ceil(req.drawX + req.drawW));
      const imgY1 = Math.min(req.pxH, Math.ceil(req.drawY + req.drawH));
      bgIdx = detectBackground(indexed, indexMap, req.pxW, req.pxH, imgX0, imgY0, imgX1, imgY1, numFg);
    }
  } else {
    // Use pre-dithered data from dispatcher
    indexed = new Uint8Array(req.indexedBuffer!);
    bgIdx = req.bgIdx!;
    indexMap = req.indexMap!;
    allowedColors = req.allowedColorsArray ? new Set(req.allowedColorsArray) : undefined;
  }

  // ---- Cell matching ----
  const grayIndices = buildGrayIndices(workPalette, numFg);
  let rowsDone = 0;
  const onRowDone = () => {
    rowsDone++;
    // Post progress every row
    const msg: ConvertWorkerProgress = { type: 'progress', id: req.id, rowsDone };
    ctx.postMessage(msg);
  };

  let rows: Pixel[][];

  if (req.converter === 'petsciiator') {
    rows = petsciiatorMatchRows({
      rgba, indexed, indexMap, pxW: req.pxW,
      framebufWidth: req.framebufWidth, framebufHeight: req.framebufHeight,
      numFg, bgIdx, font: req.font, palette: workPalette,
      grayIndices, allowedColors,
      rowStart: req.rowStart, rowEnd: req.rowEnd, onRowDone,
    });
  } else if (req.converter === 'img2petscii') {
    rows = img2petsciiMatchRows({
      rgba, pxW: req.pxW,
      framebufWidth: req.framebufWidth, framebufHeight: req.framebufHeight,
      numFg, bgIdx, font: req.font, palette: workPalette,
      grayIndices, allowedColors,
      settings: req.img2petsciiSettings!,
      rowStart: req.rowStart, rowEnd: req.rowEnd, onRowDone,
    });
  } else {
    // petmate9 — pre-build image Lab map (Phase 2)
    const labMap = buildImageLabMap(rgba, req.pxW * req.pxH);
    rows = petmate9MatchRows({
      rgba, labMap, pxW: req.pxW,
      framebufWidth: req.framebufWidth, framebufHeight: req.framebufHeight,
      numFg, bgIdx, font: req.font, palette: workPalette,
      grayIndices, allowedColors,
      settings: req.petmate9Settings!,
      rowStart: req.rowStart, rowEnd: req.rowEnd, onRowDone,
    });
  }

  // ---- Post result ----
  const resp: ConvertWorkerResponse = {
    type: 'result', id: req.id, rows, backgroundColor: bgIdx,
    rowStart: req.rowStart,
  };

  // Share dither data with dispatcher if we ran the dither pass
  if (req.runDither) {
    resp.indexedBuffer = indexed.buffer as ArrayBuffer;
    resp.indexMap = indexMap;
    resp.bgIdx = bgIdx;
    resp.allowedColorsArray = allowedColors ? [...allowedColors] : undefined;
  }

  ctx.postMessage(resp);
};
