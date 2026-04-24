import React, { useCallback, useRef, useState } from 'react';
import { GuideLayer, DEFAULT_GUIDE_LAYER, Font, Rgb, Pixel, ConvertSettings, ConversionToolName, Img2PetsciiMatcherMode, Petmate9DitherMode } from '../redux/types';
import { electron } from '../utils/electronImports';
import { fs } from '../utils/electronImports';
import styles from './GuideLayerPanel.module.css';
import classnames from 'classnames';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFolderOpen,
  faTrashAlt,
  faExpand,
  faLock,
  faLockOpen,
  faCrop,
  faEye,
  faEyeSlash,
  faCaretUp,
  faCaretDown,
  faCaretLeft,
  faCaretRight,
  faBolt,
  faAdjust,
  faPalette,
} from '@fortawesome/free-solid-svg-icons';
import { convertGuideLayerToPetscii, ConvertParams, ConvertResult } from '../utils/petsciiConverter';
import { convertGuideLayerImg2Petscii } from '../utils/petsciiConverterImg2Petscii';
import { convertGuideLayerPetmate9 } from '../utils/petsciiConverterPetmate9';
import Tooltip from './Tooltip';

const path = electron.remote.require('path');

interface GuideLayerPanelProps {
  guideLayer: GuideLayer | undefined;
  framebufWidth: number;
  framebufHeight: number;
  borderOn: boolean;
  font: Font;
  colorPalette: Rgb[];
  backgroundColor: number;
  numFgColors: number;
  pixelStretchX: number;
  convertSettings: ConvertSettings;
  globalConvertSettings: ConvertSettings;
  onSetGuideLayer: (gl: GuideLayer | undefined) => void;
  onConvertToPetscii: (result: ConvertResult) => void;
  onToggleForceBackground: () => void;
  onSetConvertSettings: (cs: ConvertSettings) => void;
  onResetConvertSettings: () => void;
  onSetShortcutsActive: (flag: boolean) => void;
  onSetGuideLayerDragOffset: (offset: { dx: number; dy: number } | null) => void;
}

function GuideLayerPanel(props: GuideLayerPanelProps) {
  const { guideLayer, framebufWidth, framebufHeight, borderOn, font, colorPalette, backgroundColor, numFgColors, pixelStretchX, convertSettings, globalConvertSettings, onSetGuideLayer, onConvertToPetscii, onToggleForceBackground, onSetConvertSettings, onResetConvertSettings, onSetShortcutsActive, onSetGuideLayerDragOffset } = props;
  const hasPerFrameSettings = guideLayer?.convertSettings !== undefined;
  const gl = guideLayer || DEFAULT_GUIDE_LAYER;
  const [imageCollapsed, setImageCollapsed] = useState(false);
  const [convertCollapsed, setConvertCollapsed] = useState(false);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Local state for deferred text inputs (commit on blur/Enter)
  const [localOpacity, setLocalOpacity] = useState(String(Math.round(gl.opacity * 100)));
  const [localScale, setLocalScale] = useState(String(Math.round(gl.scale * 100)));
  const [localBrightness, setLocalBrightness] = useState(String(gl.brightness));
  const [localContrast, setLocalContrast] = useState(String(gl.contrast));
  const [localHue, setLocalHue] = useState(String(gl.hue));
  const [localSaturation, setLocalSaturation] = useState(String(gl.saturation));
  const [localX, setLocalX] = useState(String(gl.x));
  const [localY, setLocalY] = useState(String(gl.y));

  // Sync local state when guide layer changes externally (e.g. slider or compass)
  React.useEffect(() => { setLocalOpacity(String(Math.round(gl.opacity * 100))); }, [gl.opacity]);
  React.useEffect(() => { setLocalScale(String(Math.round(gl.scale * 100))); }, [gl.scale]);
  React.useEffect(() => { setLocalBrightness(String(gl.brightness)); }, [gl.brightness]);
  React.useEffect(() => { setLocalContrast(String(gl.contrast)); }, [gl.contrast]);
  React.useEffect(() => { setLocalHue(String(gl.hue)); }, [gl.hue]);
  React.useEffect(() => { setLocalSaturation(String(gl.saturation)); }, [gl.saturation]);
  React.useEffect(() => { setLocalX(String(gl.x)); }, [gl.x]);
  React.useEffect(() => { setLocalY(String(gl.y)); }, [gl.y]);

  const inputFocus = useCallback(() => onSetShortcutsActive(false), [onSetShortcutsActive]);
  const inputBlur = useCallback(() => onSetShortcutsActive(true), [onSetShortcutsActive]);

  const update = useCallback((fields: Partial<GuideLayer>) => {
    onSetGuideLayer({ ...gl, ...fields });
  }, [gl, onSetGuideLayer]);

  const handleLoadImage = useCallback(() => {
    const result = electron.remote.dialog.showOpenDialogSync(
      electron.remote.getCurrentWindow(),
      {
        title: 'Load Guide Image',
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }
        ],
        properties: ['openFile']
      }
    );
    if (result && result.length > 0) {
      const filePath = result[0];
      const ext = path.extname(filePath).toLowerCase().replace('.', '');
      const mimeMap: { [k: string]: string } = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        bmp: 'image/bmp',
        webp: 'image/webp',
      };
      const mime = mimeMap[ext] || 'image/png';
      const buf = fs.readFileSync(filePath);
      const base64 = Buffer.from(buf).toString('base64');
      const dataUrl = `data:${mime};base64,${base64}`;
      update({ imageData: dataUrl, enabled: true });
    }
  }, [update]);

  const handleClearImage = useCallback(() => {
    update({ imageData: null });
  }, [update]);

  const handleFitToCanvas = useCallback(() => {
    if (!gl.imageData) return;
    const img = new Image();
    img.onload = () => {
      const canvasW = framebufWidth * 8 + (borderOn ? 64 : 0);
      const canvasH = framebufHeight * 8 + (borderOn ? 64 : 0);
      const scaleX = canvasW / img.naturalWidth;
      const scaleY = canvasH / img.naturalHeight;
      const fitScale = Math.min(scaleX, scaleY);
      update({ scale: Math.round(fitScale * 100) / 100, x: 0, y: 0 });
    };
    img.src = gl.imageData;
  }, [gl.imageData, framebufWidth, framebufHeight, borderOn, update]);

  const handleDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: gl.x, origY: gl.y };
  }, [gl.x, gl.y]);

  // During drag, set a live offset in toolbar state (not undo-tracked)
  // so the Editor can move the guide image in real-time.
  const handleDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = Math.round(e.clientX - dragRef.current.startX);
    const dy = Math.round(e.clientY - dragRef.current.startY);
    setLocalX(String(dragRef.current.origX + dx));
    setLocalY(String(dragRef.current.origY + dy));
    onSetGuideLayerDragOffset({ dx, dy });
  }, [onSetGuideLayerDragOffset]);

  // Dispatch final position as a single undo entry and clear the drag offset
  const handleDragEnd = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = Math.round(e.clientX - dragRef.current.startX);
    const dy = Math.round(e.clientY - dragRef.current.startY);
    onSetGuideLayerDragOffset(null);
    update({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
    dragRef.current = null;
  }, [update, onSetGuideLayerDragOffset]);

  const handleConvertToPetscii = useCallback(() => {
    if (!gl.imageData || converting) return;
    setConverting(true);
    setProgress(0);
    const params: ConvertParams = {
      imageData: gl.imageData,
      x: gl.x,
      y: gl.y,
      scale: gl.scale,
      framebufWidth,
      framebufHeight,
      font,
      colorPalette,
      backgroundColor,
      grayscale: gl.grayscale,
      brightness: gl.brightness,
      contrast: gl.contrast,
      hue: gl.hue,
      saturation: gl.saturation,
      onProgress: setProgress,
      forceBackgroundColor: convertSettings.forceBackgroundColor,
      numFgColors,
      pixelStretchX,
      colorMask: convertSettings.colorMask,
    };
    const promise = convertSettings.selectedTool === 'petmate9'
      ? convertGuideLayerPetmate9(params, convertSettings.petmate9)
      : convertSettings.selectedTool === 'img2petscii'
        ? convertGuideLayerImg2Petscii(params, convertSettings.img2petscii)
        : convertGuideLayerToPetscii(params, convertSettings.petsciiator);
    promise.then((result) => {
      onConvertToPetscii(result);
      setConverting(false);
      setProgress(0);
    }).catch(() => {
      setConverting(false);
      setProgress(0);
    });
  }, [gl, framebufWidth, framebufHeight, font, colorPalette, backgroundColor, numFgColors, pixelStretchX, convertSettings, converting, onConvertToPetscii]);

  const fullMask = useCallback(() => Array(numFgColors).fill(true), [numFgColors]);
  const normalizeMask = useCallback((mask: boolean[]) => mask.every(Boolean) ? undefined : mask, []);
  const getWorkingMask = useCallback(() => {
    return convertSettings.colorMask ? [...convertSettings.colorMask] : fullMask();
  }, [convertSettings.colorMask, fullMask]);
  const toggleGroupMask = useCallback((indices: number[]) => {
    const mask = getWorkingMask();
    const valid = indices.filter((idx) => idx >= 0 && idx < mask.length);
    const allEnabled = valid.length > 0 && valid.every((idx) => mask[idx] !== false);
    for (const idx of valid) {
      mask[idx] = !allEnabled;
    }
    onSetConvertSettings({ ...convertSettings, colorMask: normalizeMask(mask) });
  }, [convertSettings, getWorkingMask, normalizeMask, onSetConvertSettings]);

  return (
    <div className={styles.container}>
      {/* Icon toolbar row: enable | load clear fit | lock crop */}
      <div className={styles.iconBar}>
        <Tooltip text={gl.enabled ? 'Hide guide' : 'Show guide'}>
          <div
            className={classnames(styles.iconBtn, gl.enabled && styles.iconBtnActive)}
            style={{ marginLeft: '2px' }}
            onClick={() => update({ enabled: !gl.enabled })}
          >
            <FontAwesomeIcon icon={gl.enabled ? faEye : faEyeSlash} />
          </div>
        </Tooltip>
        <div className={styles.sep} />
        <Tooltip text="Load image">
          <div className={styles.iconBtn} onClick={handleLoadImage}>
            <FontAwesomeIcon icon={faFolderOpen} />
          </div>
        </Tooltip>
        <Tooltip text="Clear image">
          <div className={styles.iconBtn} onClick={handleClearImage}>
            <FontAwesomeIcon icon={faTrashAlt} />
          </div>
        </Tooltip>
        <Tooltip text="Fit to canvas">
          <div className={styles.iconBtn} onClick={handleFitToCanvas}>
            <FontAwesomeIcon icon={faExpand} />
          </div>
        </Tooltip>
        <div className={styles.sep} />
        <Tooltip text={gl.locked ? 'Unlock position' : 'Lock position'}>
          <div
            className={classnames(styles.iconBtn, gl.locked && styles.iconBtnActive)}
            onClick={() => update({ locked: !gl.locked })}
          >
            <FontAwesomeIcon icon={gl.locked ? faLock : faLockOpen} />
          </div>
        </Tooltip>
        <Tooltip text={gl.cropToCanvas ? 'Crop: on' : 'Crop: off'}>
          <div
            className={classnames(styles.iconBtn, gl.cropToCanvas && styles.iconBtnActive)}
            onClick={() => update({ cropToCanvas: !gl.cropToCanvas })}
          >
            <FontAwesomeIcon icon={faCrop} />
          </div>
        </Tooltip>
        <Tooltip text={gl.grayscale ? 'Grayscale: on' : 'Grayscale: off'}>
          <div
            className={classnames(styles.iconBtn, gl.grayscale && styles.iconBtnActive)}
            onClick={() => update({ grayscale: !gl.grayscale })}
          >
            <FontAwesomeIcon icon={faAdjust} />
          </div>
        </Tooltip>
        <Tooltip text="Reset adjustments">
          <div
            className={styles.iconBtn}
            onClick={() => update({
              grayscale: DEFAULT_GUIDE_LAYER.grayscale,
              brightness: DEFAULT_GUIDE_LAYER.brightness,
              contrast: DEFAULT_GUIDE_LAYER.contrast,
              hue: DEFAULT_GUIDE_LAYER.hue,
              saturation: DEFAULT_GUIDE_LAYER.saturation,
              opacity: DEFAULT_GUIDE_LAYER.opacity,
              scale: DEFAULT_GUIDE_LAYER.scale,
            })}
          >
            <span style={{ fontSize: '10px', fontWeight: 'bold' }}>R</span>
          </div>
        </Tooltip>
        <div className={styles.sep} />
        <Tooltip text={convertSettings.forceBackgroundColor ? 'Force background: on' : 'Force background: off'}>
          <div
            className={classnames(styles.iconBtn, convertSettings.forceBackgroundColor && styles.iconBtnActive)}
            onClick={onToggleForceBackground}
          >
            <FontAwesomeIcon icon={faPalette} />
          </div>
        </Tooltip>
        <Tooltip text="Convert to PETSCII">
          <div
            className={classnames(styles.iconBtn, converting && styles.iconBtnActive)}
            onClick={handleConvertToPetscii}
          >
            <FontAwesomeIcon icon={faBolt} />
          </div>
        </Tooltip>
      </div>

      {/* Progress bar during conversion */}
      {converting && (
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}

      {/* ── Image section (collapsible) ── */}
      <div className={styles.sectionHeader} onClick={() => setImageCollapsed(!imageCollapsed)}>
        <span className={classnames(styles.sectionArrow, !imageCollapsed && styles.sectionArrowExpanded)}>&#9664;</span>
        <span className={styles.sectionLabel}>Image</span>
      </div>
      {!imageCollapsed && <>
      {/* Compass + controls side by side */}
      <div className={styles.bottom}>
        {/* Compass d-pad */}
        <div className={styles.compass}>
          <div className={styles.compassRow}>
            <div className={styles.compassSpacer} />
            <div className={styles.compassBtn} onClick={() => update({ y: gl.y - 1 })}>
              <FontAwesomeIcon icon={faCaretUp} />
            </div>
            <div className={styles.compassSpacer} />
          </div>
          <div className={styles.compassRow}>
            <div className={styles.compassBtn} onClick={() => update({ x: gl.x - 1 })}>
              <FontAwesomeIcon icon={faCaretLeft} />
            </div>
            <div
              className={styles.compassDot}
              onPointerDown={handleDragStart}
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragEnd}
            />
            <div className={styles.compassBtn} onClick={() => update({ x: gl.x + 1 })}>
              <FontAwesomeIcon icon={faCaretRight} />
            </div>
          </div>
          <div className={styles.compassRow}>
            <div className={styles.compassSpacer} />
            <div className={styles.compassBtn} onClick={() => update({ y: gl.y + 1 })}>
              <FontAwesomeIcon icon={faCaretDown} />
            </div>
            <div className={styles.compassSpacer} />
          </div>
        </div>

        {/* Sliders */}
        <div className={styles.sliders}>
          <div className={styles.sliderRow}>
            <span className={styles.lbl}>Opacity</span>
          <div className={styles.stepBtn} onClick={() => update({ opacity: Math.max(0, (Math.round(gl.opacity * 100) - 1)) / 100 })}>
              <FontAwesomeIcon icon={faCaretLeft} />
            </div>
            <input className={styles.slider} type="range" min={0} max={100}
              value={Math.round(gl.opacity * 100)}
              onChange={(e) => update({ opacity: parseInt(e.target.value) / 100 })} />
            <div className={styles.stepBtn} onClick={() => update({ opacity: Math.min(100, (Math.round(gl.opacity * 100) + 1)) / 100 })}>
              <FontAwesomeIcon icon={faCaretRight} />
            </div>
            <input className={styles.valIn} type="number" min={0} max={100}
              value={localOpacity}
              onFocus={(e) => { e.target.select(); inputFocus(); }}
              onBlur={(e) => { update({ opacity: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) / 100 }); inputBlur(); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              onChange={(e) => setLocalOpacity(e.target.value)} />
          </div>
          <div className={styles.sliderRow}>
            <span className={styles.lbl}>Scale</span>
            <div className={styles.stepBtn} onClick={() => update({ scale: Math.max(1, (Math.round(gl.scale * 100) - 1)) / 100 })}>
              <FontAwesomeIcon icon={faCaretLeft} />
            </div>
            <input className={styles.slider} type="range" min={1} max={400}
              value={Math.round(gl.scale * 100)}
              onChange={(e) => update({ scale: parseInt(e.target.value) / 100 })} />
            <div className={styles.stepBtn} onClick={() => update({ scale: Math.min(400, (Math.round(gl.scale * 100) + 1)) / 100 })}>
              <FontAwesomeIcon icon={faCaretRight} />
            </div>
            <input className={styles.valIn} type="number" min={1} max={400}
              value={localScale}
              onFocus={(e) => { e.target.select(); inputFocus(); }}
              onBlur={(e) => { update({ scale: Math.min(400, Math.max(1, parseInt(e.target.value) || 1)) / 100 }); inputBlur(); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              onChange={(e) => setLocalScale(e.target.value)} />
          </div>
          <div className={styles.sliderRow}>
            <span className={styles.lbl}>Brightness</span>
            <div className={styles.stepBtn} onClick={() => update({ brightness: Math.max(0, gl.brightness - 1) })}>
              <FontAwesomeIcon icon={faCaretLeft} />
            </div>
            <input className={styles.slider} type="range" min={0} max={200}
              value={gl.brightness}
              onChange={(e) => update({ brightness: parseInt(e.target.value) })} />
            <div className={styles.stepBtn} onClick={() => update({ brightness: Math.min(200, gl.brightness + 1) })}>
              <FontAwesomeIcon icon={faCaretRight} />
            </div>
            <input className={styles.valIn} type="number" min={0} max={200}
              value={localBrightness}
              onFocus={(e) => { e.target.select(); inputFocus(); }}
              onBlur={(e) => { update({ brightness: Math.min(200, Math.max(0, parseInt(e.target.value) || 0)) }); inputBlur(); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              onChange={(e) => setLocalBrightness(e.target.value)} />
          </div>
          <div className={styles.sliderRow}>
            <span className={styles.lbl}>Contrast</span>
            <div className={styles.stepBtn} onClick={() => update({ contrast: Math.max(0, gl.contrast - 1) })}>
              <FontAwesomeIcon icon={faCaretLeft} />
            </div>
            <input className={styles.slider} type="range" min={0} max={200}
              value={gl.contrast}
              onChange={(e) => update({ contrast: parseInt(e.target.value) })} />
            <div className={styles.stepBtn} onClick={() => update({ contrast: Math.min(200, gl.contrast + 1) })}>
              <FontAwesomeIcon icon={faCaretRight} />
            </div>
            <input className={styles.valIn} type="number" min={0} max={200}
              value={localContrast}
              onFocus={(e) => { e.target.select(); inputFocus(); }}
              onBlur={(e) => { update({ contrast: Math.min(200, Math.max(0, parseInt(e.target.value) || 0)) }); inputBlur(); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              onChange={(e) => setLocalContrast(e.target.value)} />
          </div>
          <div className={styles.sliderRow}>
            <span className={styles.lbl}>Hue</span>
            <div className={styles.stepBtn} onClick={() => update({ hue: Math.max(-180, gl.hue - 1) })}>
              <FontAwesomeIcon icon={faCaretLeft} />
            </div>
            <input className={styles.slider} type="range" min={-180} max={180}
              value={gl.hue}
              onChange={(e) => update({ hue: parseInt(e.target.value) })} />
            <div className={styles.stepBtn} onClick={() => update({ hue: Math.min(180, gl.hue + 1) })}>
              <FontAwesomeIcon icon={faCaretRight} />
            </div>
            <input className={styles.valIn} type="number" min={-180} max={180}
              value={localHue}
              onFocus={(e) => { e.target.select(); inputFocus(); }}
              onBlur={(e) => { update({ hue: Math.min(180, Math.max(-180, parseInt(e.target.value) || 0)) }); inputBlur(); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              onChange={(e) => setLocalHue(e.target.value)} />
          </div>
          <div className={styles.sliderRow}>
            <span className={styles.lbl}>Saturation</span>
            <div className={styles.stepBtn} onClick={() => update({ saturation: Math.max(0, gl.saturation - 1) })}>
              <FontAwesomeIcon icon={faCaretLeft} />
            </div>
            <input className={styles.slider} type="range" min={0} max={200}
              value={gl.saturation}
              onChange={(e) => update({ saturation: parseInt(e.target.value) })} />
            <div className={styles.stepBtn} onClick={() => update({ saturation: Math.min(200, gl.saturation + 1) })}>
              <FontAwesomeIcon icon={faCaretRight} />
            </div>
            <input className={styles.valIn} type="number" min={0} max={200}
              value={localSaturation}
              onFocus={(e) => { e.target.select(); inputFocus(); }}
              onBlur={(e) => { update({ saturation: Math.min(200, Math.max(0, parseInt(e.target.value) || 0)) }); inputBlur(); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              onChange={(e) => setLocalSaturation(e.target.value)} />
          </div>
        </div>
      </div>

      {/* X/Y inputs row */}
      <div className={styles.xyRow}>
        <span className={styles.xyLbl}>X</span>
        <input className={styles.xyIn} type="number" value={localX}
          onFocus={(e) => { e.target.select(); inputFocus(); }}
          onBlur={(e) => { update({ x: parseInt(e.target.value) || 0 }); inputBlur(); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          onChange={(e) => setLocalX(e.target.value)} />
        <span className={styles.xyLbl}>Y</span>
        <input className={styles.xyIn} type="number" value={localY}
          onFocus={(e) => { e.target.select(); inputFocus(); }}
          onBlur={(e) => { update({ y: parseInt(e.target.value) || 0 }); inputBlur(); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          onChange={(e) => setLocalY(e.target.value)} />
      </div>
      </>}

      {/* ── Conversion section (collapsible) ── */}
      <div className={styles.convertSection}>
        <div className={styles.sectionHeader} onClick={() => setConvertCollapsed(!convertCollapsed)}>
          <span className={classnames(styles.sectionArrow, !convertCollapsed && styles.sectionArrowExpanded)}>&#9664;</span>
          <span className={styles.sectionLabel}>Conversion</span>
          <div className={styles.convertHeaderControls} onClick={(e) => e.stopPropagation()}>
            {hasPerFrameSettings && (
              <Tooltip text="Reset to global defaults">
                <div className={styles.iconBtn} style={{ width: 'auto', padding: '0 4px', fontSize: '9px' }} onClick={onResetConvertSettings}>
                  Global
                </div>
              </Tooltip>
            )}
            {!hasPerFrameSettings && (
              <span className={styles.convertHint}>(global)</span>
            )}
          </div>
        </div>

        {!convertCollapsed && <>
        <div className={styles.convertRow}>
          <span className={styles.convertFieldLbl}>Tool</span>
          <select
            className={styles.convertSelect}
            value={convertSettings.selectedTool}
            onFocus={inputFocus}
            onBlur={inputBlur}
            onChange={(e) => onSetConvertSettings({ ...convertSettings, selectedTool: e.target.value as ConversionToolName })}
          >
            <option value="petsciiator">Petsciiator</option>
            <option value="img2petscii">img2petscii</option>
            <option value="petmate9">Pet9scii</option>
          </select>
        </div>

        {convertSettings.selectedTool === 'petsciiator' && (
          <label className={styles.convertCheck}>
            <input type="checkbox" checked={convertSettings.petsciiator.dithering}
              onChange={(e) => onSetConvertSettings({ ...convertSettings, petsciiator: { ...convertSettings.petsciiator, dithering: e.target.checked } })} />
            Dithering
          </label>
        )}

        {convertSettings.selectedTool === 'img2petscii' && (
          <>
            <div className={styles.convertRow}>
              <span className={styles.convertFieldLbl}>Matcher</span>
              <select
                className={styles.convertSelect}
                value={convertSettings.img2petscii.matcherMode}
                onFocus={inputFocus}
                onBlur={inputBlur}
                onChange={(e) => onSetConvertSettings({ ...convertSettings, img2petscii: { ...convertSettings.img2petscii, matcherMode: e.target.value as Img2PetsciiMatcherMode } })}
              >
                <option value="slow">Slow (best)</option>
                <option value="fast">Fast</option>
              </select>
            </div>
            <label className={styles.convertCheck}>
              <input type="checkbox" checked={convertSettings.img2petscii.monoMode}
                onChange={(e) => onSetConvertSettings({ ...convertSettings, img2petscii: { ...convertSettings.img2petscii, monoMode: e.target.checked } })} />
              Mono
            </label>
            {convertSettings.img2petscii.monoMode && (
              <div className={styles.convertRow}>
                <span className={styles.convertFieldLbl}>Threshold</span>
                <input className={styles.slider} type="range" min={0} max={255} step={1}
                  value={convertSettings.img2petscii.monoThreshold}
                  onChange={(e) => onSetConvertSettings({ ...convertSettings, img2petscii: { ...convertSettings.img2petscii, monoThreshold: Number(e.target.value) } })} />
                <span className={styles.convertUnit}>{convertSettings.img2petscii.monoThreshold}</span>
              </div>
            )}
          </>
        )}

        {convertSettings.selectedTool === 'petmate9' && (
          <>
            <div className={styles.convertRow}>
              <span className={styles.convertFieldLbl}>Dither</span>
              <select
                className={styles.convertSelect}
                value={convertSettings.petmate9.ditherMode}
                onFocus={inputFocus}
                onBlur={inputBlur}
                onChange={(e) => onSetConvertSettings({ ...convertSettings, petmate9: { ...convertSettings.petmate9, ditherMode: e.target.value as Petmate9DitherMode } })}
              >
                <option value="floyd-steinberg">Floyd-Steinberg</option>
                <option value="bayer4x4">Bayer 4×4</option>
                <option value="bayer2x2">Bayer 2×2</option>
                <option value="none">None</option>
              </select>
            </div>
            <div className={styles.convertRow}>
              <span className={styles.convertFieldLbl}>SSIM</span>
              <input className={styles.slider} type="range" min={0} max={100} step={1}
                value={convertSettings.petmate9.ssimWeight}
                onChange={(e) => onSetConvertSettings({ ...convertSettings, petmate9: { ...convertSettings.petmate9, ssimWeight: Number(e.target.value) } })} />
              <span className={styles.convertUnit}>{convertSettings.petmate9.ssimWeight}%</span>
            </div>
            <label className={styles.convertCheck}>
              <input type="checkbox" checked={convertSettings.petmate9.useLuminance ?? false}
                onChange={(e) => onSetConvertSettings({ ...convertSettings, petmate9: { ...convertSettings.petmate9, useLuminance: e.target.checked } })} />
              Luminance matching
            </label>
          </>
        )}

        {/* Palette filter */}
        <div className={styles.paletteFilterSection}>
          <div className={styles.convertRow}>
            <span className={styles.convertFieldLbl}>Colors</span>
            <div className={styles.paletteFilterBtns}>
              <div className={styles.filterBtn}
                onClick={() => onSetConvertSettings({ ...convertSettings, colorMask: undefined })}>
                All
              </div>
              <div className={styles.filterBtn}
                onClick={() => onSetConvertSettings({ ...convertSettings, colorMask: Array(numFgColors).fill(false) })}>
                None
              </div>
              <div className={styles.filterBtn}
                onClick={() => {
                  const cur = convertSettings.colorMask;
                  onSetConvertSettings({ ...convertSettings, colorMask: Array.from({ length: numFgColors }, (_, i) => cur ? !cur[i] : false) });
                }}>
                Inv
              </div>
              <div className={styles.filterBtnSep} />
              <div className={styles.filterBtn}
                onClick={() => {
                  toggleGroupMask([0, 1, 11, 12, 15]);
                }}>
                Grays
              </div>
              <div className={styles.filterBtn}
                onClick={() => {
                  toggleGroupMask([2, 7, 8, 9, 10]);
                }}>
                Warm
              </div>
              <div className={styles.filterBtn}
                onClick={() => {
                  toggleGroupMask([3, 6, 14]);
                }}>
                Blues
              </div>
            </div>
          </div>
          <div className={styles.paletteChips}>
            {Array.from({ length: numFgColors }, (_, i) => {
              const c = colorPalette[i];
              if (!c) return null;
              const enabled = !convertSettings.colorMask || convertSettings.colorMask[i] !== false;
              return (
                <div
                  key={i}
                  className={classnames(styles.paletteChip, enabled ? styles.paletteChipSelected : styles.paletteChipDisabled)}
                  style={{ backgroundColor: `rgb(${c.r},${c.g},${c.b})` }}
                  title={`Color ${i}${enabled ? '' : ' (disabled)'}`}
                  onClick={() => {
                    const mask = getWorkingMask();
                    mask[i] = !mask[i];
                    onSetConvertSettings({ ...convertSettings, colorMask: normalizeMask(mask) });
                  }}
                />
              );
            })}
          </div>
        </div>
        </>}
      </div>
    </div>
  );
}

export default GuideLayerPanel;
