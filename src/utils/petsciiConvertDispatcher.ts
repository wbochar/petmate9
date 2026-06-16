// Worker-pool dispatcher for PETSCII conversion.
//
// Flow:
//   1. Main thread renders guide image onto an offscreen canvas (requires DOM).
//   2. Pixel data is transferred to a single "leader" worker that performs
//      dithering + background detection (sequential passes).
//   3. The dithered index buffer is distributed to N workers that split the
//      cell-matching phase by row range.
//   4. Results are aggregated and returned as a single ConvertResult.
//
// For small screens or when Workers are unavailable, a single-worker fast
// path keeps things simple.

import type { Rgb, Font, Pixel } from '../redux/types';
import type { ConvertParams, ConvertResult } from './petsciiConverter';
import type {
  ConvertWorkerRequest,
  ConvertWorkerResponse,
  ConvertWorkerProgress,
} from '../workers/petsciiConvertWorker';
import type { ConverterName, FontData } from './converters/convertCore';

// ---------------------------------------------------------------------------
// Worker pool
// ---------------------------------------------------------------------------

const MAX_WORKERS = 8;
let workerPool: Worker[] | null = null;

function getWorkerPool(): Worker[] {
  if (workerPool) return workerPool;
  const count = Math.min(navigator.hardwareConcurrency || 4, MAX_WORKERS);
  workerPool = [];
  for (let i = 0; i < count; i++) {
    workerPool.push(
      new Worker(new URL('../workers/petsciiConvertWorker.ts', import.meta.url))
    );
  }
  return workerPool;
}

let nextJobId = 1;

// ---------------------------------------------------------------------------
// Shared image rendering (main thread only — needs Canvas + Image)
// ---------------------------------------------------------------------------

interface RenderedImage {
  rgba: Uint8ClampedArray;
  pxW: number;
  pxH: number;
  drawW: number;
  drawH: number;
}

function renderGuideImage(params: ConvertParams): Promise<RenderedImage> {
  const { imageData, x, y, scale, framebufWidth, framebufHeight } = params;
  const pxW = framebufWidth * 8;
  const pxH = framebufHeight * 8;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = pxW;
      canvas.height = pxH;
      const ctx = canvas.getContext('2d')!;

      // Fill background
      const bg = params.colorPalette[params.backgroundColor];
      ctx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`;
      ctx.fillRect(0, 0, pxW, pxH);

      // CSS filters
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const filters: string[] = [];
      if (params.grayscale) filters.push('grayscale(1)');
      if (params.brightness !== 100) filters.push(`brightness(${params.brightness / 100})`);
      if (params.contrast !== 100) filters.push(`contrast(${params.contrast / 100})`);
      if (params.hue !== 0) filters.push(`hue-rotate(${params.hue}deg)`);
      if (params.saturation !== 100) filters.push(`saturate(${params.saturation / 100})`);
      if (filters.length > 0) ctx.filter = filters.join(' ');

      const psx = params.pixelStretchX ?? 1;
      const drawW = img.naturalWidth * scale / psx;
      const drawH = img.naturalHeight * scale;
      ctx.drawImage(img, x, y, drawW, drawH);
      ctx.filter = 'none';

      const imgPixels = ctx.getImageData(0, 0, pxW, pxH);
      resolve({ rgba: imgPixels.data, pxW, pxH, drawW, drawH });
    };
    img.onerror = () => reject(new Error('Failed to load guide image'));
    img.src = imageData;
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DispatchParams extends ConvertParams {
  converter: ConverterName;
  petsciiatorSettings?: { dithering: boolean };
  img2petsciiSettings?: { matcherMode: 'slow' | 'fast'; monoMode: boolean; monoThreshold: number };
  petmate9Settings?: { ditherMode: 'floyd-steinberg' | 'bayer4x4' | 'bayer2x2' | 'none'; ssimWeight: number; useLuminance?: boolean };
}

export async function dispatchConversion(params: DispatchParams): Promise<ConvertResult> {
  const rendered = await renderGuideImage(params);

  const pool = getWorkerPool();
  const numWorkers = pool.length;
  const totalRows = params.framebufHeight;
  const jobId = nextJobId++;

  const fontData: FontData = {
    bits: params.font.bits,
    charOrderLength: params.font.charOrder.length,
  };

  // Palette trimmed to foreground count
  const numFg = params.numFgColors ?? params.colorPalette.length;
  const palette: Rgb[] = params.colorPalette.slice(0, numFg);

  // --- Single-worker fast path (small screens or pool size 1) ---
  if (numWorkers <= 1 || totalRows <= 2) {
    return singleWorkerConvert(pool[0], jobId, params, rendered, fontData, palette, numFg, totalRows);
  }

  // --- Multi-worker path ---
  // Step 1: Leader worker does dithering + bg detection + its share of rows
  const rowsPerWorker = Math.ceil(totalRows / numWorkers);
  const leaderEnd = Math.min(rowsPerWorker, totalRows);

  return new Promise<ConvertResult>((resolve, reject) => {
    let totalRowsDone = 0;
    const allRows: Pixel[][][] = new Array(numWorkers);
    let resultsReceived = 0;
    let bgColor = params.backgroundColor;

    // Track whether we've dispatched sibling workers yet
    let siblingsDispatched = false;

    const onWorkerMessage = (workerIdx: number) => (e: MessageEvent<ConvertWorkerResponse | ConvertWorkerProgress>) => {
      const msg = e.data;
      if (msg.id !== jobId) return;

      if (msg.type === 'progress') {
        totalRowsDone++;
        params.onProgress?.(totalRowsDone / totalRows);
        return;
      }

      // Result
      const resp = msg as ConvertWorkerResponse;
      allRows[workerIdx] = resp.rows;
      bgColor = resp.backgroundColor;
      resultsReceived++;

      // If the leader just finished dithering, dispatch siblings
      if (workerIdx === 0 && !siblingsDispatched && resp.indexedBuffer) {
        siblingsDispatched = true;
        dispatchSiblings(
          pool, jobId, params, rendered, fontData, palette, numFg,
          totalRows, rowsPerWorker, leaderEnd,
          resp.indexedBuffer, resp.indexMap!, resp.bgIdx!, resp.allowedColorsArray,
          onWorkerMessage
        );
      }

      // All workers done?
      const expectedWorkers = Math.min(numWorkers, Math.ceil(totalRows / rowsPerWorker));
      if (resultsReceived >= expectedWorkers) {
        // Reassemble rows in order
        const framebuf: Pixel[][] = [];
        for (let w = 0; w < expectedWorkers; w++) {
          for (const row of allRows[w]) framebuf.push(row);
        }
        // Clean up listeners
        for (const w of pool) w.onmessage = null;
        resolve({ framebuf, backgroundColor: bgColor });
      }
    };

    // Attach listener to leader
    pool[0].onmessage = onWorkerMessage(0);

    // Dispatch leader (runs dither + its row range)
    const rgbaCopy = rendered.rgba.buffer.slice(0) as ArrayBuffer;
    const leaderReq: ConvertWorkerRequest = {
      type: 'convert',
      id: jobId,
      converter: params.converter,
      rgbaBuffer: rgbaCopy,
      pxW: rendered.pxW,
      pxH: rendered.pxH,
      framebufWidth: params.framebufWidth,
      framebufHeight: params.framebufHeight,
      font: fontData,
      palette,
      numFgColors: numFg,
      backgroundColor: params.backgroundColor,
      forceBackgroundColor: params.forceBackgroundColor,
      colorMask: params.colorMask,
      drawX: params.x, drawY: params.y, drawW: rendered.drawW, drawH: rendered.drawH,
      petsciiatorSettings: params.petsciiatorSettings,
      img2petsciiSettings: params.img2petsciiSettings,
      petmate9Settings: params.petmate9Settings,
      rowStart: 0,
      rowEnd: leaderEnd,
      runDither: true,
    };
    pool[0].postMessage(leaderReq, [leaderReq.rgbaBuffer]);

    // If only 1 chunk needed, siblings won't be dispatched; the leader alone resolves.
    if (leaderEnd >= totalRows) {
      siblingsDispatched = true;
    }
  });
}

function dispatchSiblings(
  pool: Worker[],
  jobId: number,
  params: DispatchParams,
  rendered: RenderedImage,
  fontData: FontData,
  palette: Rgb[],
  numFg: number,
  totalRows: number,
  rowsPerWorker: number,
  leaderEnd: number,
  indexedBuffer: ArrayBuffer,
  indexMap: number[],
  bgIdx: number,
  allowedColorsArray: number[] | undefined,
  onWorkerMessage: (idx: number) => (e: MessageEvent) => void
) {
  let workerIdx = 1;
  for (let start = leaderEnd; start < totalRows; start += rowsPerWorker) {
    if (workerIdx >= pool.length) break;
    const end = Math.min(start + rowsPerWorker, totalRows);

    pool[workerIdx].onmessage = onWorkerMessage(workerIdx);

    // Each sibling gets its own copy of the RGBA and indexed buffers
    const rgbaCopy = rendered.rgba.buffer.slice(0) as ArrayBuffer;
    const idxCopy = (indexedBuffer.slice ? indexedBuffer.slice(0) : new ArrayBuffer(0)) as ArrayBuffer;

    const req: ConvertWorkerRequest = {
      type: 'convert',
      id: jobId,
      converter: params.converter,
      rgbaBuffer: rgbaCopy,
      pxW: rendered.pxW,
      pxH: rendered.pxH,
      framebufWidth: params.framebufWidth,
      framebufHeight: params.framebufHeight,
      font: fontData,
      palette,
      numFgColors: numFg,
      backgroundColor: params.backgroundColor,
      forceBackgroundColor: params.forceBackgroundColor,
      colorMask: params.colorMask,
      drawX: params.x, drawY: params.y, drawW: rendered.drawW, drawH: rendered.drawH,
      petsciiatorSettings: params.petsciiatorSettings,
      img2petsciiSettings: params.img2petsciiSettings,
      petmate9Settings: params.petmate9Settings,
      rowStart: start,
      rowEnd: end,
      runDither: false,
      indexedBuffer: idxCopy,
      bgIdx,
      indexMap,
      allowedColorsArray,
    };
    pool[workerIdx].postMessage(req, [req.rgbaBuffer, req.indexedBuffer!]);
    workerIdx++;
  }
}

// ---------------------------------------------------------------------------
// Single-worker fast path
// ---------------------------------------------------------------------------

function singleWorkerConvert(
  worker: Worker,
  jobId: number,
  params: DispatchParams,
  rendered: RenderedImage,
  fontData: FontData,
  palette: Rgb[],
  numFg: number,
  totalRows: number
): Promise<ConvertResult> {
  return new Promise((resolve, _reject) => {
    worker.onmessage = (e: MessageEvent<ConvertWorkerResponse | ConvertWorkerProgress>) => {
      const msg = e.data;
      if (msg.id !== jobId) return;
      if (msg.type === 'progress') {
        params.onProgress?.((msg as ConvertWorkerProgress).rowsDone / totalRows);
        return;
      }
      worker.onmessage = null;
      const resp = msg as ConvertWorkerResponse;
      resolve({ framebuf: resp.rows, backgroundColor: resp.backgroundColor });
    };

    const rgbaCopy = rendered.rgba.buffer.slice(0) as ArrayBuffer;
    const req: ConvertWorkerRequest = {
      type: 'convert',
      id: jobId,
      converter: params.converter,
      rgbaBuffer: rgbaCopy,
      pxW: rendered.pxW,
      pxH: rendered.pxH,
      framebufWidth: params.framebufWidth,
      framebufHeight: params.framebufHeight,
      font: fontData,
      palette,
      numFgColors: numFg,
      backgroundColor: params.backgroundColor,
      forceBackgroundColor: params.forceBackgroundColor,
      colorMask: params.colorMask,
      drawX: params.x, drawY: params.y, drawW: rendered.drawW, drawH: rendered.drawH,
      petsciiatorSettings: params.petsciiatorSettings,
      img2petsciiSettings: params.img2petsciiSettings,
      petmate9Settings: params.petmate9Settings,
      rowStart: 0,
      rowEnd: totalRows,
      runDither: true,
    };
    worker.postMessage(req, [req.rgbaBuffer]);
  });
}
