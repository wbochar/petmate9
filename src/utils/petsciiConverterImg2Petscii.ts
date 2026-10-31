// img2petscii-flavored entry point used by the Guide Layer panel.
//
// This file previously also carried a full synchronous port of the
// img2petscii tile-matching algorithm by Michel de Bree
// (https://github.com/micheldebree/c64-tools/tree/main/img2petscii), but
// nothing called it -- convertGuideLayerImg2Petscii below has always just
// delegated to the worker-pool dispatcher (see petsciiConvertDispatcher.ts
// -> src/utils/converters/convertCore.ts, executed in
// src/workers/petsciiConvertWorker.ts), which carries its own
// (non-dead) implementation of the same algorithm. That dead code has
// been removed; only the live wrapper remains.

import { Img2PetsciiSettings } from '../redux/types';
import { ConvertParams, ConvertResult } from './petsciiConverter';

/**
 * Delegates all heavy computation to the worker-pool dispatcher.
 * The main thread only handles image rendering (Canvas/CSS filters)
 * and progress callbacks.
 */
export function convertGuideLayerImg2Petscii(
  params: ConvertParams,
  settings: Img2PetsciiSettings
): Promise<ConvertResult> {
  const { dispatchConversion } = require('./petsciiConvertDispatcher');
  return dispatchConversion({
    ...params,
    converter: 'img2petscii' as const,
    img2petsciiSettings: settings,
  });
}
