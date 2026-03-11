import React, { useCallback } from 'react';
import { GuideLayer, DEFAULT_GUIDE_LAYER } from '../redux/types';
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
} from '@fortawesome/free-solid-svg-icons';

const path = electron.remote.require('path');

interface GuideLayerPanelProps {
  guideLayer: GuideLayer | undefined;
  framebufWidth: number;
  framebufHeight: number;
  borderOn: boolean;
  onSetGuideLayer: (gl: GuideLayer | undefined) => void;
}

function GuideLayerPanel(props: GuideLayerPanelProps) {
  const { guideLayer, framebufWidth, framebufHeight, borderOn, onSetGuideLayer } = props;
  const gl = guideLayer || DEFAULT_GUIDE_LAYER;

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

  return (
    <div className={styles.container}>
      {/* Icon toolbar row: enable | load clear fit | lock crop */}
      <div className={styles.iconBar}>
        <div
          className={classnames(styles.iconBtn, gl.enabled && styles.iconBtnActive)}
          title={gl.enabled ? 'Hide guide' : 'Show guide'}
          onClick={() => update({ enabled: !gl.enabled })}
        >
          <FontAwesomeIcon icon={gl.enabled ? faEye : faEyeSlash} />
        </div>
        <div className={styles.sep} />
        <div className={styles.iconBtn} title="Load image" onClick={handleLoadImage}>
          <FontAwesomeIcon icon={faFolderOpen} />
        </div>
        <div className={styles.iconBtn} title="Clear image" onClick={handleClearImage}>
          <FontAwesomeIcon icon={faTrashAlt} />
        </div>
        <div className={styles.iconBtn} title="Fit to canvas" onClick={handleFitToCanvas}>
          <FontAwesomeIcon icon={faExpand} />
        </div>
        <div className={styles.sep} />
        <div
          className={classnames(styles.iconBtn, gl.locked && styles.iconBtnActive)}
          title={gl.locked ? 'Unlock position' : 'Lock position'}
          onClick={() => update({ locked: !gl.locked })}
        >
          <FontAwesomeIcon icon={gl.locked ? faLock : faLockOpen} />
        </div>
        <div
          className={classnames(styles.iconBtn, gl.cropToCanvas && styles.iconBtnActive)}
          title={gl.cropToCanvas ? 'Crop: on' : 'Crop: off'}
          onClick={() => update({ cropToCanvas: !gl.cropToCanvas })}
        >
          <FontAwesomeIcon icon={faCrop} />
        </div>
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
            <div className={styles.compassDot} />
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
            <span className={styles.lbl} title="Opacity">Op</span>
            <input className={styles.slider} type="range" min={0} max={100}
              value={Math.round(gl.opacity * 100)}
              onChange={(e) => update({ opacity: parseInt(e.target.value) / 100 })} />
            <input className={styles.valIn} type="number" min={0} max={100}
              value={Math.round(gl.opacity * 100)}
              onChange={(e) => update({ opacity: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) / 100 })} />
          </div>
          <div className={styles.sliderRow}>
            <span className={styles.lbl} title="Scale">Sc</span>
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
