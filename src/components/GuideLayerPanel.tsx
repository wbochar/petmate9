import React, { useCallback, useRef, useState } from 'react';
import { GuideLayer, DEFAULT_GUIDE_LAYER, Font, Rgb, Pixel } from '../redux/types';
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
  faExchangeAlt,
  faAdjust,
} from '@fortawesome/free-solid-svg-icons';
import { convertGuideLayerToPetscii, ConvertResult } from '../utils/petsciiConverter';
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
  onSetGuideLayer: (gl: GuideLayer | undefined) => void;
  onConvertToPetscii: (result: ConvertResult) => void;
}

function GuideLayerPanel(props: GuideLayerPanelProps) {
  const { guideLayer, framebufWidth, framebufHeight, borderOn, font, colorPalette, backgroundColor, onSetGuideLayer, onConvertToPetscii } = props;
  const gl = guideLayer || DEFAULT_GUIDE_LAYER;
  const [converting, setConverting] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

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

  const handleDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = Math.round(e.clientX - dragRef.current.startX);
    const dy = Math.round(e.clientY - dragRef.current.startY);
    update({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
  }, [update]);

  const handleDragEnd = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleGrayscale = useCallback(() => {
    if (!gl.imageData) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        const gray = Math.round(px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114);
        px[i] = gray;
        px[i + 1] = gray;
        px[i + 2] = gray;
      }
      ctx.putImageData(data, 0, 0);
      update({ imageData: canvas.toDataURL('image/png') });
    };
    img.src = gl.imageData;
  }, [gl.imageData, update]);

  const handleConvertToPetscii = useCallback(() => {
    if (!gl.imageData || converting) return;
    setConverting(true);
    convertGuideLayerToPetscii({
      imageData: gl.imageData,
      x: gl.x,
      y: gl.y,
      scale: gl.scale,
      framebufWidth,
      framebufHeight,
      font,
      colorPalette,
      backgroundColor,
    }).then((result) => {
      onConvertToPetscii(result);
      setConverting(false);
    }).catch(() => {
      setConverting(false);
    });
  }, [gl, framebufWidth, framebufHeight, font, colorPalette, backgroundColor, converting, onConvertToPetscii]);

  return (
    <div className={styles.container}>
      {/* Icon toolbar row: enable | load clear fit | lock crop */}
      <div className={styles.iconBar}>
        <Tooltip text={gl.enabled ? 'Hide guide' : 'Show guide'}>
          <div
            className={classnames(styles.iconBtn, gl.enabled && styles.iconBtnActive)}
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
        <Tooltip text="Convert to grayscale">
          <div className={styles.iconBtn} onClick={handleGrayscale}>
            <FontAwesomeIcon icon={faAdjust} />
          </div>
        </Tooltip>
        <div className={styles.sep} />
        <Tooltip text="Convert to PETSCII">
          <div
            className={classnames(styles.iconBtn, converting && styles.iconBtnActive)}
            onClick={handleConvertToPetscii}
          >
            <FontAwesomeIcon icon={faExchangeAlt} />
          </div>
        </Tooltip>
      </div>

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

        {/* X/Y + sliders stacked */}
        <div className={styles.sliders}>
          <div className={styles.sliderRow}>
            <span className={styles.lbl}>X</span>
            <input className={styles.xyIn} type="number" value={gl.x}
              onChange={(e) => update({ x: parseInt(e.target.value) || 0 })} />
            <span className={styles.lbl}>Y</span>
            <input className={styles.xyIn} type="number" value={gl.y}
              onChange={(e) => update({ y: parseInt(e.target.value) || 0 })} />
          </div>
          <div className={styles.sliderRow}>
            <Tooltip text="Opacity"><span className={styles.lbl}>Op</span></Tooltip>
            <input className={styles.slider} type="range" min={0} max={100}
              value={Math.round(gl.opacity * 100)}
              onChange={(e) => update({ opacity: parseInt(e.target.value) / 100 })} />
            <input className={styles.valIn} type="number" min={0} max={100}
              value={Math.round(gl.opacity * 100)}
              onChange={(e) => update({ opacity: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) / 100 })} />
          </div>
          <div className={styles.sliderRow}>
            <Tooltip text="Scale"><span className={styles.lbl}>Sc</span></Tooltip>
            <input className={styles.slider} type="range" min={10} max={400}
              value={Math.round(gl.scale * 100)}
              onChange={(e) => update({ scale: parseInt(e.target.value) / 100 })} />
            <input className={styles.valIn} type="number" min={10} max={400}
              value={Math.round(gl.scale * 100)}
              onChange={(e) => update({ scale: Math.min(400, Math.max(10, parseInt(e.target.value) || 10)) / 100 })} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default GuideLayerPanel;
