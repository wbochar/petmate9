// Pet9scii-flavored entry point used by the Guide Layer panel.
//
// This file previously also carried a full synchronous implementation of
// the "Pet9scii" enhanced PETSCII algorithm (CIE L*a*b* perceptual color
// distance, SSIM-inspired tile matching, multiple dithering modes,
// two-pass candidate filtering), but nothing called it --
// convertGuideLayerPetmate9 below has always just delegated to the
// worker-pool dispatcher (see petsciiConvertDispatcher.ts ->
// src/utils/converters/convertCore.ts, executed in
// src/workers/petsciiConvertWorker.ts), which carries its own
// (non-dead) implementation of the same algorithm. That dead code has
// been removed; only the live wrapper remains.

import { ConvertParams, ConvertResult } from './petsciiConverter';
import { Petmate9Settings } from '../redux/types';

/**
 * Delegates all heavy computation to the worker-pool dispatcher.
 * The main thread only handles image rendering (Canvas/CSS filters)
 * and progress callbacks.
 */
export function convertGuideLayerPetmate9(
  params: ConvertParams,
  settings: Petmate9Settings
): Promise<ConvertResult> {
  const { dispatchConversion } = require('./petsciiConvertDispatcher');
  return dispatchConversion({
    ...params,
    converter: 'petmate9' as const,
    petmate9Settings: settings,
  });
}
