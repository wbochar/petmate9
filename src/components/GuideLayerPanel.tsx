import React, { useCallback, useRef, useState } from 'react';
import { GuideLayer, DEFAULT_GUIDE_LAYER, Font, Rgb, Pixel, ConvertSettings } from '../redux/types';
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
  convertSettings: ConvertSettings;
  onSetGuideLayer: (gl: GuideLayer | undefined) => void;
  onConvertToPetscii: (result: ConvertResult) => void;
  onToggleForceBackground: () => void;
  onSetShortcutsActive: (flag: boolean) => void;
  onSetGuideLayerDragOffset: (offset: { dx: number; dy: number } | null) => void;
}

function GuideLayerPanel(props: GuideLayerPanelProps) {
  const { guideLayer, framebufWidth, framebufHeight, borderOn, font, colorPalette, backgroundColor, convertSettings, onSetGuideLayer, onConvertToPetscii, onToggleForceBackground, onSetShortcutsActive, onSetGuideLayerDragOffset } = props;
  const gl = guideLayer || DEFAULT_GUIDE_LAYER;
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Local state for deferred text inputs (commit on blur/Enter)
  const [localOpacity, setLocalOpacity] = useState(String(Math.round(gl.opacity * 100)));
  const [localScale, setLocalScale] = useState(String(Math.round(gl.scale * 100)));
  const [localBrightness, setLocalBrightness] = useState(String(gl.brightness));
  const [localContrast, setLocalContrast] = useState(String(gl.contrast));
  const [localX, setLocalX] = useState(String(gl.x));
  const [localY, setLocalY] = useState(String(gl.y));

  // Sync local state when guide layer changes externally (e.g. slider or compass)
  React.useEffect(() => { setLocalOpacity(String(Math.round(gl.opacity * 100))); }, [gl.opacity]);
  React.useEffect(() => { setLocalScale(String(Math.round(gl.scale * 100))); }, [gl.scale]);
  React.useEffect(() => { setLocalBrightness(String(gl.brightness)); }, [gl.brightness]);
  React.useEffect(() => { setLocalContrast(String(gl.contrast)); }, [gl.contrast]);
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
      onProgress: setProgress,
      forceBackgroundColor: convertSettings.forceBackgroundColor,
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
  }, [gl, framebufWidth, framebufHeight, font, colorPalette, backgroundColor, convertSettings, converting, onConvertToPetscii]);

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
            <div className={styles.stepBtn} onClick={() => update({ scale: Math.max(10, (Math.round(gl.scale * 100) - 1)) / 100 })}>
              <FontAwesomeIcon icon={faCaretLeft} />
            </div>
            <input className={styles.slider} type="range" min={10} max={400}
              value={Math.round(gl.scale * 100)}
              onChange={(e) => update({ scale: parseInt(e.target.value) / 100 })} />
            <div className={styles.stepBtn} onClick={() => update({ scale: Math.min(400, (Math.round(gl.scale * 100) + 1)) / 100 })}>
              <FontAwesomeIcon icon={faCaretRight} />
            </div>
            <input className={styles.valIn} type="number" min={10} max={400}
              value={localScale}
              onFocus={(e) => { e.target.select(); inputFocus(); }}
              onBlur={(e) => { update({ scale: Math.min(400, Math.max(10, parseInt(e.target.value) || 10)) / 100 }); inputBlur(); }}
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
    </div>
  );
}

export default GuideLayerPanel;
