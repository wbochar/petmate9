import React from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import { Toolbar } from '../redux/toolbar';
import * as selectors from '../redux/selectors';
import {
  getSettingsCurrentColorPalette,
  getSettingsCurrentVic20ColorPalette,
  getSettingsCurrentPetColorPalette,
  getSettingsCurrentTedColorPalette,
} from '../redux/settingsSelectors';
import { RootState, Pixel, Font, Rgb } from '../redux/types';
import { vdcPalette } from '../utils/palette';

const CELL = 8;
const RGB_BLACK: Rgb = { r: 0, g: 0, b: 0 };

const btnStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 'bold',
  background: 'var(--panel-btn-bg)',
  color: 'var(--panel-btn-color)',
  border: '1px solid var(--panel-btn-border)',
  padding: '2px 6px',
  cursor: 'pointer',
  userSelect: 'none',
  lineHeight: '14px',
};

const activeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'var(--panel-btn-active-bg)',
  color: 'var(--panel-btn-active-color)',
};

const smallBtnStyle: React.CSSProperties = {
  ...btnStyle,
  padding: '0px',
  width: '16px',
  height: '16px',
  minWidth: '16px',
  boxSizing: 'border-box',
  textAlign: 'center',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '13px',
  fontWeight: 900,
  lineHeight: '16px',
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  padding: '4px 0',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  flexWrap: 'wrap',
};

const labelStyle: React.CSSProperties = {
  fontSize: '10px',
  color: 'var(--subtle-text-color)',
  userSelect: 'none',
  minWidth: '14px',
};

const previewContainerStyle: React.CSSProperties = {
  border: '1px solid var(--panel-btn-border)',
  background: 'var(--panel-btn-bg)',
  minHeight: '20px',
  padding: '2px',
  overflow: 'auto',
};

function safePalette(palette: Rgb[] | undefined, idx: number | undefined): Rgb {
  if (!palette) return RGB_BLACK;
  const i = idx ?? 0;
  return palette[i] ?? palette[0] ?? RGB_BLACK;
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  code: number,
  x: number,
  y: number,
  font: Font,
  fg: Rgb,
  bg: Rgb,
) {
  const boffs = code * 8;
  const img = ctx.createImageData(CELL, CELL);
  const d = img.data;
  let di = 0;
  for (let row = 0; row < 8; row++) {
    const p = font?.bits?.[boffs + row] ?? 0;
    for (let i = 0; i < 8; i++) {
      const on = (128 >> i) & p;
      d[di] = on ? fg.r : bg.r;
      d[di + 1] = on ? fg.g : bg.g;
      d[di + 2] = on ? fg.b : bg.b;
      d[di + 3] = 255;
      di += 4;
    }
  }
  ctx.putImageData(img, x * CELL, y * CELL);
}

interface PatternPreviewProps {
  pattern: Pixel[][] | null;
  cols: number;
  rows: number;
  font: Font;
  colorPalette: Rgb[];
  backgroundColor: number;
}

class PatternPreview extends React.PureComponent<PatternPreviewProps> {
  canvasRef = React.createRef<HTMLCanvasElement>();

  componentDidMount() {
    this.drawPreview();
  }

  componentDidUpdate() {
    this.drawPreview();
  }

  drawPreview() {
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { pattern, cols, rows, font, colorPalette, backgroundColor } = this.props;
    const bg = safePalette(colorPalette, backgroundColor);
    const width = cols * CELL;
    const height = rows * CELL;

    ctx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`;
    ctx.fillRect(0, 0, width, height);

    if (!pattern) return;

    for (let r = 0; r < Math.min(rows, pattern.length); r++) {
      for (let c = 0; c < Math.min(cols, pattern[r].length); c++) {
        const px = pattern[r][c];
        const fg = safePalette(colorPalette, px.color);
        drawCell(ctx, px.code, c, r, font, fg, bg);
      }
    }
  }

  render() {
    const { pattern, cols, rows } = this.props;

    if (!pattern) {
      return (
        <div style={{ ...previewContainerStyle, fontSize: '9px', color: 'var(--subtle-text-color)' }}>
          (empty)
        </div>
      );
    }

    const width = cols * CELL;
    const height = rows * CELL;
    const scale = Math.max(1, Math.min(3, Math.floor(120 / Math.max(width, height))));

    return (
      <div style={previewContainerStyle}>
        <canvas
          ref={this.canvasRef}
          width={width}
          height={height}
          style={{
            width: width * scale,
            height: height * scale,
            imageRendering: 'pixelated',
            display: 'block',
          }}
        />
      </div>
    );
  }
}

const toolbarRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '3px',
};

const toolbarLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 'bold',
  color: 'var(--panel-btn-color)',
  minWidth: '42px',
  paddingLeft: '4px',
  paddingRight: '4px',
  flexShrink: 0,
};

const dimLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  color: 'var(--subtle-text-color)',
  userSelect: 'none',
};

const dimValueStyle: React.CSSProperties = {
  fontSize: '10px',
  minWidth: '14px',
  textAlign: 'center',
};

const toggleBtnStyle: React.CSSProperties = {
  ...btnStyle,
  padding: '1px 5px',
  fontSize: '9px',
  flex: 1,
  textAlign: 'center',
};

const toggleActiveBtnStyle: React.CSSProperties = {
  ...toggleBtnStyle,
  background: 'var(--panel-btn-active-bg)',
  color: 'var(--panel-btn-active-color)',
};

interface FindReplacePanelProps {
  findReplaceWidth: number;
  findReplaceHeight: number;
  findReplaceReplaceWidth: number;
  findReplaceReplaceHeight: number;
  findReplaceFind: Pixel[][] | null;
  findReplaceReplace: Pixel[][] | null;
  findReplaceReplaceWhat: 'both' | 'chars' | 'color';
  findReplaceAllFrames: boolean;
  findReplaceMode: 'first' | 'all';
  hasBrush: boolean;
  font: Font;
  colorPalette: Rgb[];
  backgroundColor: number;
  Toolbar: {
    setFindReplaceWidth: (w: number) => void;
    setFindReplaceHeight: (h: number) => void;
    setFindReplaceReplaceWidth: (w: number) => void;
    setFindReplaceReplaceHeight: (h: number) => void;
    setFindReplaceReplaceWhat: (what: 'both' | 'chars' | 'color') => void;
    setFindReplaceAllFrames: (flag: boolean) => void;
    setFindReplaceMode: (mode: 'first' | 'all') => void;
    findReplacePasteFind: () => void;
    findReplacePasteReplace: () => void;
    findReplaceExecute: () => void;
  };
}

class FindReplacePanel extends React.PureComponent<FindReplacePanelProps> {
  render() {
    const {
      findReplaceWidth: w,
      findReplaceHeight: h,
      findReplaceReplaceWidth: rw,
      findReplaceReplaceHeight: rh,
      findReplaceFind: find,
      findReplaceReplace: replace,
      findReplaceReplaceWhat: replaceWhat,
      findReplaceAllFrames: allFrames,
      findReplaceMode: mode,
      hasBrush,
      font,
      colorPalette,
      backgroundColor,
      Toolbar: T,
    } = this.props;

    const canPaste = hasBrush;
    const canReplace = find !== null && replace !== null;

    return (
      <div style={{ padding: '4px 0' }}>
        {/* ---- Find ---- */}
        <div style={sectionStyle}>
          <div style={toolbarRowStyle}>
            <span style={toolbarLabelStyle}>Find</span>
            <span style={dimLabelStyle}>H:</span>
            <div style={smallBtnStyle} onClick={() => T.setFindReplaceHeight(h - 1)}>-</div>
            <span style={dimValueStyle}>{h}</span>
            <div style={smallBtnStyle} onClick={() => T.setFindReplaceHeight(h + 1)}>+</div>
            <span style={{ ...dimLabelStyle, marginLeft: '4px' }}>W:</span>
            <div style={smallBtnStyle} onClick={() => T.setFindReplaceWidth(w - 1)}>-</div>
            <span style={dimValueStyle}>{w}</span>
            <div style={smallBtnStyle} onClick={() => T.setFindReplaceWidth(w + 1)}>+</div>
            <div
              style={{ ...(canPaste ? btnStyle : { ...btnStyle, opacity: 0.4 }), marginLeft: 'auto' }}
              onClick={canPaste ? () => T.findReplacePasteFind() : undefined}
              title="Paste current brush selection as Find pattern"
            >
              PASTE
            </div>
          </div>
          <PatternPreview
            pattern={find}
            cols={w}
            rows={h}
            font={font}
            colorPalette={colorPalette}
            backgroundColor={backgroundColor}
          />
        </div>

        {/* ---- Replace ---- */}
        <div style={sectionStyle}>
          <div style={toolbarRowStyle}>
            <span style={toolbarLabelStyle}>Replace</span>
            <span style={dimLabelStyle}>H:</span>
            <div style={smallBtnStyle} onClick={() => T.setFindReplaceReplaceHeight(rh - 1)}>-</div>
            <span style={dimValueStyle}>{rh}</span>
            <div style={smallBtnStyle} onClick={() => T.setFindReplaceReplaceHeight(rh + 1)}>+</div>
            <span style={{ ...dimLabelStyle, marginLeft: '4px' }}>W:</span>
            <div style={smallBtnStyle} onClick={() => T.setFindReplaceReplaceWidth(rw - 1)}>-</div>
            <span style={dimValueStyle}>{rw}</span>
            <div style={smallBtnStyle} onClick={() => T.setFindReplaceReplaceWidth(rw + 1)}>+</div>
            <div
              style={{ ...(canPaste ? btnStyle : { ...btnStyle, opacity: 0.4 }), marginLeft: 'auto' }}
              onClick={canPaste ? () => T.findReplacePasteReplace() : undefined}
              title="Paste current brush selection as Replace pattern"
            >
              PASTE
            </div>
          </div>
          <PatternPreview
            pattern={replace}
            cols={rw}
            rows={rh}
            font={font}
            colorPalette={colorPalette}
            backgroundColor={backgroundColor}
          />
        </div>

        {/* ---- Options: single cycle-through buttons on one row ---- */}
        <div style={{ display: 'flex', gap: '3px', padding: '4px 0', borderTop: '1px solid var(--panel-btn-border)', paddingTop: '6px' }}>
          <div
            style={{ ...toggleBtnStyle, background: 'var(--panel-btn-active-bg)', color: 'var(--panel-btn-active-color)' }}
            onClick={() => {
              const cycle: Array<'both'|'chars'|'color'> = ['both','chars','color'];
              T.setFindReplaceReplaceWhat(cycle[(cycle.indexOf(replaceWhat) + 1) % 3]);
            }}
            title={replaceWhat === 'both' ? 'Replace BOTH chars+colors (click to cycle)' : replaceWhat === 'chars' ? 'Replace CHARS only (click to cycle)' : 'Replace COLORS only (click to cycle)'}
          >{replaceWhat === 'both' ? 'BOTH' : replaceWhat === 'chars' ? 'CHARS' : 'COLOR'}</div>
          <div
            style={{ ...toggleBtnStyle, background: 'var(--panel-btn-active-bg)', color: 'var(--panel-btn-active-color)' }}
            onClick={() => T.setFindReplaceAllFrames(!allFrames)}
            title={allFrames ? 'ALL FRAMES (click to toggle)' : 'CURRENT frame (click to toggle)'}
          >{allFrames ? 'ALL FRAMES' : 'CURRENT'}</div>
          <div
            style={{ ...toggleBtnStyle, background: 'var(--panel-btn-active-bg)', color: 'var(--panel-btn-active-color)' }}
            onClick={() => T.setFindReplaceMode(mode === 'first' ? 'all' : 'first')}
            title={mode === 'first' ? 'FIRST occurrence (click to toggle)' : 'EVERY occurrence (click to toggle)'}
          >{mode === 'first' ? 'FIRST' : 'EVERY'}</div>
        </div>

        {/* ---- Execute ---- */}
        <div style={{ paddingTop: '6px' }}>
          <div
            style={{
              ...btnStyle,
              textAlign: 'center',
              padding: '4px 8px',
              fontSize: '11px',
              ...(canReplace ? {} : { opacity: 0.4 }),
            }}
            onClick={canReplace ? () => T.findReplaceExecute() : undefined}
            title={canReplace ? 'Execute Find and Replace' : 'Paste Find and Replace patterns first'}
          >
            REPLACE
          </div>
        </div>
      </div>
    );
  }
}

const mapStateToProps = (state: RootState) => {
  const framebuf = selectors.getCurrentFramebuf(state);
  const { font, charset } = selectors.getCurrentFramebufFont(state);
  const prefix = charset.substring(0, 3);
  const width = framebuf?.width ?? 40;
  let colorPalette: Rgb[];
  if (prefix === 'c16') colorPalette = getSettingsCurrentTedColorPalette(state);
  else if (prefix === 'vic') colorPalette = getSettingsCurrentVic20ColorPalette(state);
  else if (prefix === 'pet') colorPalette = getSettingsCurrentPetColorPalette(state);
  else if (prefix === 'c12' && width >= 80) colorPalette = vdcPalette;
  else colorPalette = getSettingsCurrentColorPalette(state);

  return {
    findReplaceWidth: state.toolbar.findReplaceWidth,
    findReplaceHeight: state.toolbar.findReplaceHeight,
    findReplaceReplaceWidth: state.toolbar.findReplaceReplaceWidth,
    findReplaceReplaceHeight: state.toolbar.findReplaceReplaceHeight,
    findReplaceFind: state.toolbar.findReplaceFind,
    findReplaceReplace: state.toolbar.findReplaceReplace,
    findReplaceReplaceWhat: state.toolbar.findReplaceReplaceWhat,
    findReplaceAllFrames: state.toolbar.findReplaceAllFrames,
    findReplaceMode: state.toolbar.findReplaceMode,
    hasBrush: state.toolbar.brush !== null,
    font,
    colorPalette,
    backgroundColor: framebuf?.backgroundColor ?? 0,
  };
};

const mapDispatchToProps = (dispatch: any) => ({
  Toolbar: bindActionCreators({
    setFindReplaceWidth: Toolbar.actions.setFindReplaceWidth,
    setFindReplaceHeight: Toolbar.actions.setFindReplaceHeight,
    setFindReplaceReplaceWidth: Toolbar.actions.setFindReplaceReplaceWidth,
    setFindReplaceReplaceHeight: Toolbar.actions.setFindReplaceReplaceHeight,
    setFindReplaceReplaceWhat: Toolbar.actions.setFindReplaceReplaceWhat,
    setFindReplaceAllFrames: Toolbar.actions.setFindReplaceAllFrames,
    setFindReplaceMode: Toolbar.actions.setFindReplaceMode,
    findReplacePasteFind: Toolbar.actions.findReplacePasteFind,
    findReplacePasteReplace: Toolbar.actions.findReplacePasteReplace,
    findReplaceExecute: Toolbar.actions.findReplaceExecute,
  }, dispatch),
});

export default connect(mapStateToProps, mapDispatchToProps)(FindReplacePanel);
