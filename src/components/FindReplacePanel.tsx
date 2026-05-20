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
import { RootState, Pixel, Font, Rgb, Brush } from '../redux/types';
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

const sourceRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
  gap: '6px',
  alignItems: 'stretch',
};

const sourcePanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  minWidth: 0,
};


const sourceCardStyle: React.CSSProperties = {
  position: 'relative',
  border: '1px solid var(--panel-btn-border)',
  background: 'var(--panel-btn-bg)',
  height: '116px',
  minHeight: '116px',
  boxSizing: 'border-box',
  overflow: 'hidden',
  cursor: 'pointer',
};

const sourceCardArmedStyle: React.CSSProperties = {
  borderColor: 'var(--panel-btn-active-bg)',
  boxShadow: 'inset 0 0 0 1px var(--panel-btn-active-bg)',
};

const sourceInnerStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '4px',
  boxSizing: 'border-box',
};

const sourceEmptyTextStyle: React.CSSProperties = {
  fontSize: '10px',
  color: 'var(--subtle-text-color)',
  textAlign: 'center',
  padding: '0 6px',
  userSelect: 'none',
};

const sourceArmedOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.28)',
  color: 'var(--panel-btn-active-color)',
  fontSize: '10px',
  fontWeight: 'bold',
  userSelect: 'none',
  pointerEvents: 'none',
};

const sourceClearStyle: React.CSSProperties = {
  position: 'absolute',
  top: '2px',
  right: '2px',
  width: '16px',
  height: '16px',
  lineHeight: '14px',
  textAlign: 'center',
  fontSize: '12px',
  fontWeight: 'bold',
  border: '1px solid var(--panel-btn-border)',
  background: 'var(--panel-btn-bg)',
  color: 'var(--panel-btn-color)',
  cursor: 'pointer',
  userSelect: 'none',
  zIndex: 3,
};

const sourceArrowStyle: React.CSSProperties = {
  alignSelf: 'center',
  color: 'var(--subtle-text-color)',
  fontSize: '12px',
  fontWeight: 'bold',
  userSelect: 'none',
  paddingTop: '18px',
};

const toggleBtnStyle: React.CSSProperties = {
  ...btnStyle,
  padding: '1px 5px',
  fontSize: '9px',
  flex: 1,
  textAlign: 'center',
};

interface PatternPreviewProps {
  pattern: Pixel[][];
  font: Font;
  colorPalette: Rgb[];
  backgroundColor: number;
}

function safePalette(palette: Rgb[] | undefined, idx: number | undefined): Rgb {
  if (!palette) return RGB_BLACK;
  const i = idx ?? 0;
  const normalized = palette.length >= 128 ? (i & 0x7f) : i;
  return palette[normalized] ?? palette[0] ?? RGB_BLACK;
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

    const { pattern, font, colorPalette, backgroundColor } = this.props;
    const rows = pattern.length;
    const cols = rows > 0 ? pattern[0].length : 0;
    if (rows === 0 || cols === 0) return;

    const bg = safePalette(colorPalette, backgroundColor);
    const width = cols * CELL;
    const height = rows * CELL;

    ctx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`;
    ctx.fillRect(0, 0, width, height);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const px = pattern[r][c];
        const fg = safePalette(colorPalette, px.color);
        drawCell(ctx, px.code, c, r, font, fg, bg);
      }
    }
  }

  render() {
    const { pattern } = this.props;
    const rows = pattern.length;
    const cols = rows > 0 ? pattern[0].length : 0;
    if (rows === 0 || cols === 0) return null;

    const width = cols * CELL;
    const height = rows * CELL;
    const fitSize = 96 * 0.8;
    const scale = Math.max(0.2, Math.min(3, fitSize / Math.max(width, height)));

    return (
      <canvas
        ref={this.canvasRef}
        width={width}
        height={height}
        style={{
          width: width * scale,
          height: height * scale,
          margin: '5%',
          imageRendering: 'pixelated',
          display: 'block',
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      />
    );
  }
}

type SourceTarget = 'find' | 'replace';

interface FindReplacePanelProps {
  findReplaceFind: Pixel[][] | null;
  findReplaceReplace: Pixel[][] | null;
  findReplaceReplaceWhat: 'both' | 'chars' | 'color';
  findReplaceAllFrames: boolean;
  findReplaceMode: 'first' | 'all';
  brush: Brush | null;
  font: Font;
  colorPalette: Rgb[];
  backgroundColor: number;
  Toolbar: {
    setFindReplaceWidth: (w: number) => void;
    setFindReplaceHeight: (h: number) => void;
    setFindReplaceReplaceWidth: (w: number) => void;
    setFindReplaceReplaceHeight: (h: number) => void;
    setFindReplaceFind: (pattern: Pixel[][] | null) => void;
    setFindReplaceReplace: (pattern: Pixel[][] | null) => void;
    setFindReplaceReplaceWhat: (what: 'both' | 'chars' | 'color') => void;
    setFindReplaceAllFrames: (flag: boolean) => void;
    setFindReplaceMode: (mode: 'first' | 'all') => void;
    resetBrush: () => void;
    findReplaceExecute: () => void;
  };
}

interface FindReplacePanelState {
  armedTarget: SourceTarget | null;
  hoveredTarget: SourceTarget | null;
}

class FindReplacePanel extends React.PureComponent<FindReplacePanelProps, FindReplacePanelState> {
  state: FindReplacePanelState = {
    armedTarget: null,
    hoveredTarget: null,
  };

  componentDidUpdate(prevProps: FindReplacePanelProps) {
    const { armedTarget } = this.state;
    const { brush } = this.props;
    if (!armedTarget || brush === null || brush === prevProps.brush) return;
    this.assignBrushToTarget(armedTarget, brush);
    this.setState({ armedTarget: null });
  }

  assignBrushToTarget = (target: SourceTarget, brush: Brush) => {
    const h = brush.framebuf.length;
    const w = h > 0 ? brush.framebuf[0].length : 0;
    if (h === 0 || w === 0) return;

    if (target === 'find') {
      this.props.Toolbar.setFindReplaceFind(brush.framebuf);
      this.props.Toolbar.setFindReplaceWidth(w);
      this.props.Toolbar.setFindReplaceHeight(h);
      this.props.Toolbar.resetBrush();
      return;
    }

    this.props.Toolbar.setFindReplaceReplace(brush.framebuf);
    this.props.Toolbar.setFindReplaceReplaceWidth(w);
    this.props.Toolbar.setFindReplaceReplaceHeight(h);
    this.props.Toolbar.resetBrush();
  };

  handleSourceClick = (target: SourceTarget) => {
    const currentPattern = target === 'find' ? this.props.findReplaceFind : this.props.findReplaceReplace;
    if (currentPattern !== null) {
      if (target === 'find') this.props.Toolbar.setFindReplaceFind(null);
      else this.props.Toolbar.setFindReplaceReplace(null);
      this.setState({ armedTarget: target });
      return;
    }
    if (this.props.brush !== null) {
      this.assignBrushToTarget(target, this.props.brush);
      this.setState({ armedTarget: null });
      return;
    }
    this.setState({ armedTarget: target });
  };

  handleSourceClear = (ev: React.MouseEvent<HTMLDivElement>, target: SourceTarget) => {
    ev.stopPropagation();
    if (target === 'find') this.props.Toolbar.setFindReplaceFind(null);
    else this.props.Toolbar.setFindReplaceReplace(null);
    if (this.state.armedTarget === target) this.setState({ armedTarget: null });
  };

  renderSource = (target: SourceTarget, pattern: Pixel[][] | null, emptyText: string) => {
    const isArmed = this.state.armedTarget === target;
    const isHovered = this.state.hoveredTarget === target;
    const showClear = pattern !== null && isHovered;

    return (
      <div style={sourcePanelStyle}>
        <div
          style={{ ...sourceCardStyle, ...(isArmed ? sourceCardArmedStyle : {}) }}
          onClick={() => this.handleSourceClick(target)}
          onMouseEnter={() => this.setState({ hoveredTarget: target })}
          onMouseLeave={() => this.setState((prev) => ({ hoveredTarget: prev.hoveredTarget === target ? null : prev.hoveredTarget }))}
        >
          <div style={sourceInnerStyle}>
            {pattern ? (
              <PatternPreview
                pattern={pattern}
                font={this.props.font}
                colorPalette={this.props.colorPalette}
                backgroundColor={this.props.backgroundColor}
              />
            ) : !isArmed ? (
              <div style={sourceEmptyTextStyle}>{emptyText}</div>
            ) : null}
          </div>
          {isArmed && <div style={sourceArmedOverlayStyle}>Select on canvas…</div>}
          {showClear && (
            <div style={sourceClearStyle} onClick={(ev) => this.handleSourceClear(ev, target)}>
              ×
            </div>
          )}
        </div>
      </div>
    );
  };

  render() {
    const {
      findReplaceFind: find,
      findReplaceReplace: replace,
      findReplaceReplaceWhat: replaceWhat,
      findReplaceAllFrames: allFrames,
      findReplaceMode: mode,
      Toolbar: T,
    } = this.props;

    const canReplace = find !== null && replace !== null;

    return (
      <div style={{ padding: '4px 6px' }}>
        <div style={sourceRowStyle}>
          {this.renderSource('find', find, 'Click to select source')}
          <div style={sourceArrowStyle}>→</div>
          {this.renderSource('replace', replace, 'Click to select a replacement')}
        </div>

        <div style={{ display: 'flex', gap: '3px', padding: '4px 0', borderTop: '1px solid var(--panel-btn-border)', marginTop: '6px', paddingTop: '6px' }}>
          <div
            style={{ ...toggleBtnStyle, background: 'var(--panel-btn-active-bg)', color: 'var(--panel-btn-active-color)' }}
            onClick={() => {
              const cycle: Array<'both' | 'chars' | 'color'> = ['both', 'chars', 'color'];
              T.setFindReplaceReplaceWhat(cycle[(cycle.indexOf(replaceWhat) + 1) % 3]);
            }}
            title={
              replaceWhat === 'both'
                ? 'Replace BOTH chars+colors (click to cycle)'
                : replaceWhat === 'chars'
                  ? 'Replace CHARS only (click to cycle)'
                  : 'Replace COLORS only (click to cycle)'
            }
          >
            {replaceWhat === 'both' ? 'BOTH' : replaceWhat === 'chars' ? 'CHARS' : 'COLOR'}
          </div>
          <div
            style={{ ...toggleBtnStyle, background: 'var(--panel-btn-active-bg)', color: 'var(--panel-btn-active-color)' }}
            onClick={() => T.setFindReplaceAllFrames(!allFrames)}
            title={allFrames ? 'ALL FRAMES (click to toggle)' : 'CURRENT frame (click to toggle)'}
          >
            {allFrames ? 'ALL FRAMES' : 'CURRENT'}
          </div>
          <div
            style={{ ...toggleBtnStyle, background: 'var(--panel-btn-active-bg)', color: 'var(--panel-btn-active-color)' }}
            onClick={() => T.setFindReplaceMode(mode === 'first' ? 'all' : 'first')}
            title={mode === 'first' ? 'FIRST occurrence (click to toggle)' : 'EVERY occurrence (click to toggle)'}
          >
            {mode === 'first' ? 'FIRST' : 'EVERY'}
          </div>
        </div>

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
    findReplaceFind: state.toolbar.findReplaceFind,
    findReplaceReplace: state.toolbar.findReplaceReplace,
    findReplaceReplaceWhat: state.toolbar.findReplaceReplaceWhat,
    findReplaceAllFrames: state.toolbar.findReplaceAllFrames,
    findReplaceMode: state.toolbar.findReplaceMode,
    brush: state.toolbar.brush,
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
    setFindReplaceFind: Toolbar.actions.setFindReplaceFind,
    setFindReplaceReplace: Toolbar.actions.setFindReplaceReplace,
    setFindReplaceReplaceWhat: Toolbar.actions.setFindReplaceReplaceWhat,
    setFindReplaceAllFrames: Toolbar.actions.setFindReplaceAllFrames,
    setFindReplaceMode: Toolbar.actions.setFindReplaceMode,
    resetBrush: Toolbar.actions.resetBrush,
    findReplaceExecute: Toolbar.actions.findReplaceExecute,
  }, dispatch),
});

export default connect(mapStateToProps, mapDispatchToProps)(FindReplacePanel);