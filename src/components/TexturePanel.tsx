import React, { useCallback, useRef, useEffect, useState } from 'react';
import { connect } from 'react-redux';

import { Toolbar } from '../redux/toolbar';
import * as selectors from '../redux/selectors';
import {
  getSettingsCurrentColorPalette,
  getSettingsCurrentVic20ColorPalette,
  getSettingsCurrentPetColorPalette,
} from '../redux/settingsSelectors';
import {
  RootState,
  Font,
  Rgb,
  Pixel,
  TexturePreset,
  TRANSPARENT_SCREENCODE,
} from '../redux/types';
import { generatePattern, PatternType, PatternDirection } from '../utils/patternGen';
import { caseModeFromCharset } from '../utils/charWeightConfig';

// ---- Style constants (matching dark UI theme) ----

const btnStyle: React.CSSProperties = {
  fontSize: '10px', fontWeight: 'bold', background: 'var(--panel-btn-bg)', color: 'var(--panel-btn-color)',
  border: '1px solid var(--panel-btn-border)', padding: '1px 5px', cursor: 'pointer',
  userSelect: 'none', lineHeight: '14px',
};
const activeBtnStyle: React.CSSProperties = { ...btnStyle, background: 'var(--panel-btn-active-bg)', color: 'var(--panel-btn-active-color)' };

const CELL = 8;
const STRIP_W = 16;
const PREVIEW_SIZE = 16; // 16x16 grid

// ---- Helpers ----

function drawCell(
  ctx: CanvasRenderingContext2D, code: number, x: number, y: number,
  font: Font, fg: Rgb, bg: Rgb,
) {
  const boffs = code * 8;
  const img = ctx.createImageData(CELL, CELL);
  const d = img.data;
  let di = 0;
  for (let row = 0; row < 8; row++) {
    const p = font.bits[boffs + row];
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

// ---- Small toggle button (reused for OP toggles and R/C/X) ----

function SmallToggle({ label, active, onClick, title, width }: {
  label: string; active: boolean; onClick: () => void; title?: string; width?: number;
}) {
  return (
    <div onClick={onClick} title={title} style={{
      width: width ?? 18, height: 16, fontSize: '9px', fontWeight: 'bold',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      border: '1px solid var(--panel-btn-border)', cursor: 'pointer', userSelect: 'none', flexShrink: 0,
      background: active ? 'var(--panel-toggle-on-bg)' : 'var(--panel-toggle-off-bg)', color: active ? 'var(--panel-toggle-on-color)' : 'var(--panel-label-color)',
    }}>{label}</div>
  );
}

function SmallBtn({ label, onClick, title, width }: {
  label: string; onClick: () => void; title?: string; width?: number;
}) {
  return (
    <div onClick={onClick} title={title} style={{
      width: width ?? 18, height: 16, fontSize: '9px', fontWeight: 'bold',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      border: '1px solid var(--panel-btn-border)', cursor: 'pointer', userSelect: 'none', flexShrink: 0,
      background: 'var(--panel-btn-bg)', color: 'var(--panel-label-color)',
    }}>{label}</div>
  );
}

// ---- 16×1 Texture Entry Canvas ----

function TextureEntryCanvas({ chars, colors, font, colorPalette, backgroundColor, selectedCell, onCellClick }: {
  chars: number[]; colors: number[]; font: Font; colorPalette: Rgb[];
  backgroundColor: number; selectedCell: number | null;
  onCellClick: (col: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const CANVAS_W = STRIP_W * CELL;
  const CANVAS_H = CELL;

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const bg = colorPalette[backgroundColor];
    for (let col = 0; col < STRIP_W; col++) {
      const code = chars[col] ?? 0x20;
      const fg = colorPalette[colors[col] ?? 14];
      drawCell(ctx, code, col, 0, font, fg, bg);
    }
    // Selection highlight
    if (selectedCell != null && selectedCell >= 0 && selectedCell < STRIP_W) {
      ctx.strokeStyle = 'rgba(128,255,128,0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(selectedCell * CELL + 0.5, 0.5, CELL - 1, CELL - 1);
    }
  }, [chars, colors, font, colorPalette, backgroundColor, selectedCell]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * STRIP_W);
    if (col >= 0 && col < STRIP_W) onCellClick(col);
  }, [onCellClick]);

  return (
    <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
      onClick={handleClick}
      style={{ width: '100%', imageRendering: 'pixelated', cursor: 'pointer', border: '1px solid #555' }}
    />
  );
}

// ---- 16×16 Texture Preview Canvas (supports 1D strip OR full 2D grid) ----

function TexturePreviewCanvas({ chars, colors, grid, font, colorPalette, backgroundColor, scale = 1 }: {
  chars?: number[]; colors?: number[]; grid?: Pixel[][]; font: Font; colorPalette: Rgb[];
  backgroundColor: number; scale?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const PX_W = PREVIEW_SIZE * CELL;
  const PX_H = PREVIEW_SIZE * CELL;

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const bg = colorPalette[backgroundColor];
    for (let row = 0; row < PREVIEW_SIZE; row++) {
      for (let col = 0; col < PREVIEW_SIZE; col++) {
        if (grid) {
          const px = grid[row]?.[col] ?? { code: 0x20, color: 14 };
          drawCell(ctx, px.code, col, row, font, colorPalette[px.color] ?? bg, bg);
        } else {
          const code = chars?.[col] ?? 0x20;
          const fg = colorPalette[colors?.[col] ?? 14];
          drawCell(ctx, code, col, row, font, fg, bg);
        }
      }
    }
  }, [chars, colors, grid, font, colorPalette, backgroundColor]);

  return (
    <canvas ref={canvasRef} width={PX_W} height={PX_H} style={{
      width: PX_W * scale, height: PX_H * scale, imageRendering: 'pixelated', display: 'block',
    }} />
  );
}

// ========== Pattern Type Dropdown (exported for CollapsiblePanel header) ==========

function TexturePatternTypeDropdownInner({ texturePatternType, Toolbar: tb }: {
  texturePatternType: string;
  Toolbar: ReturnType<typeof Toolbar.bindDispatch>;
}) {
  return (
    <select
      value={texturePatternType}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => { tb.setTexturePatternType(e.target.value); }}
      style={{ fontSize: '10px', background: 'var(--panel-btn-bg)', color: 'var(--panel-btn-color)', border: '1px solid var(--panel-btn-border)', padding: '1px 2px', cursor: 'pointer' }}
    >
      {PATTERN_TYPES.map(pt => (
        <option key={pt.value} value={pt.value}>{pt.label}</option>
      ))}
    </select>
  );
}

export const TexturePatternTypeDropdown = connect(
  (state: RootState) => ({
    texturePatternType: state.toolbar.texturePatternType,
  }),
  (dispatch: any) => ({ Toolbar: Toolbar.bindDispatch(dispatch) })
)(TexturePatternTypeDropdownInner);

// ========== Main TexturePanel ==========

const PATTERN_TYPES: { value: string; label: string }[] = [
  { value: 'manual',   label: 'Manual' },
  { value: 'gradient', label: 'Gradient' },
  { value: 'dither',   label: 'Dither' },
  { value: 'noise',    label: 'Noise' },
  { value: 'stripes',  label: 'Stripes' },
  { value: 'checker',  label: 'Checker' },
];

const OP_LABELS: Record<string, string[]> = {
  manual:   ['V/H', 'Inv', 'Col', '---', 'Diag'],
  gradient: ['V/H', 'Inv', 'Col', 'Blk', 'Diag'],
  dither:   ['V/H', 'Inv', 'Col', 'Blk', 'Diag'],
  noise:    ['V/H', 'Inv', 'Col', 'Blk', '---'],
  stripes:  ['V/H', 'Inv', 'Col', 'Blk', 'Diag'],
  checker:  ['---', 'Inv', 'Col', 'Blk', '---'],
};

const OP_TIPS: Record<string, string[]> = {
  manual:   ['Vertical (off=Horizontal)', 'Reverse strip order', 'Alternate fg/bg colors per cell', '(unused)', 'Diagonal offset per row'],
  gradient: ['Vertical (off=Horizontal)', 'Invert gradient', 'Color gradient', 'Blocks only', 'Diagonal'],
  dither:   ['Vertical blend', 'Invert', 'Color gradient', 'Blocks only', 'Diagonal blend'],
  noise:    ['(unused)', 'Invert', 'Color gradient', 'Blocks only', '(unused)'],
  stripes:  ['Vertical', 'Invert', 'Color gradient', 'Blocks only', 'Diagonal'],
  checker:  ['(unused)', 'Invert', 'Color gradient', 'Blocks only', '(unused)'],
};

interface TexturePanelStateProps {
  textureOptions: boolean[];
  texturePatternType: string;
  textureSeed: number;
  textureScale: number;
  textureOutputMode: 'brush' | 'fill' | 'none';
  charset: string;
  font: Font;
  colorPalette: Rgb[];
  textColor: number;
  backgroundColor: number;
  framebufWidth: number;
  framebufHeight: number;
  curScreencode: number;
}

interface TexturePanelDispatchProps {
  Toolbar: ReturnType<typeof Toolbar.bindDispatch>;
}

type TexturePanelProps = TexturePanelStateProps & TexturePanelDispatchProps;

function TexturePanel({
  textureOptions,
  texturePatternType, textureSeed, textureScale, textureOutputMode, charset,
  font, colorPalette, textColor, backgroundColor, framebufWidth, framebufHeight,
  curScreencode,
  Toolbar: tb,
}: TexturePanelProps) {
  const [generatedGrid, setGeneratedGrid] = useState<Pixel[][] | null>(null);

  // Manual mode: variable-length char/color strip (default: 1 blank space)
  const [editChars, setEditChars] = useState<number[]>([0x20]);
  const [editColors, setEditColors] = useState<number[]>([14]);
  const [selectedCell, setSelectedCell] = useState<number | null>(null);

  const isManual = texturePatternType === 'manual';

  // Manual cell click: place current char+color
  const handleCellClick = useCallback((col: number) => {
    if (col >= editChars.length) return;
    setSelectedCell(col);
    setEditChars(prev => { const n = [...prev]; n[col] = curScreencode; return n; });
    setEditColors(prev => { const n = [...prev]; n[col] = textColor; return n; });
  }, [curScreencode, textColor, editChars.length]);

  // Manual mode: add/remove character from strip
  const handleManualAdd = useCallback(() => {
    if (editChars.length >= 16) return;
    setEditChars(prev => [...prev, 0x20]);
    setEditColors(prev => [...prev, 14]);
  }, [editChars.length]);

  const handleManualRemove = useCallback(() => {
    if (editChars.length <= 1) return;
    setEditChars(prev => prev.slice(0, -1));
    setEditColors(prev => prev.slice(0, -1));
    setSelectedCell(prev => prev !== null && prev >= editChars.length - 1 ? null : prev);
  }, [editChars.length]);

  // Auto-generate pattern whenever any setting changes
  useEffect(() => {
    if (isManual) {
      const vertical = textureOptions[0];
      const invert = textureOptions[1];
      const colorGrad = textureOptions[2];
      const diagonal = textureOptions[4];

      // Build expanded strip: repeat base chars × textureScale
      let baseChars = [...editChars];
      let baseColors = [...editColors];
      if (invert) {
        baseChars.reverse();
        baseColors.reverse();
      }
      // Scale: repeat each character textureScale times
      let chars: number[] = [];
      let colors: number[] = [];
      for (let i = 0; i < baseChars.length; i++) {
        for (let s = 0; s < textureScale; s++) {
          chars.push(baseChars[i]);
          colors.push(baseColors[i]);
        }
      }
      const stripLen = chars.length || 1;

      // Build 16×16 grid by tiling the expanded strip
      const grid: Pixel[][] = [];
      for (let row = 0; row < 16; row++) {
        const rowPixels: Pixel[] = [];
        for (let col = 0; col < 16; col++) {
          let idx: number;
          if (vertical) {
            idx = diagonal ? (row + col) % stripLen : row % stripLen;
          } else {
            idx = diagonal ? (col + row) % stripLen : col % stripLen;
          }
          const code = chars[idx] ?? 0x20;
          let color = colors[idx] ?? 14;
          if (colorGrad) {
            color = idx % 2 === 0 ? textColor : backgroundColor;
          }
          rowPixels.push({ code, color });
        }
        grid.push(rowPixels);
      }

      // Apply Max transparency to manual mode too
      const useMaxTransparency = textureOptions[5];
      if (useMaxTransparency) {
        for (let r = 0; r < grid.length; r++) {
          for (let c = 0; c < grid[r].length; c++) {
            const code = grid[r][c].code;
            if (code === 0x20 || code === 0xA0) {
              grid[r][c] = { ...grid[r][c], code: TRANSPARENT_SCREENCODE };
            }
          }
        }
      }
      setGeneratedGrid(grid);
      return;
    }

    const vertical = textureOptions[0];
    const invert = textureOptions[1];
    const colorGrad = textureOptions[2];
    const blocksOnly = textureOptions[3];
    const diagonal = textureOptions[4];

    let direction: PatternDirection = 'horizontal';
    if (diagonal) direction = 'diagonal';
    else if (vertical) direction = 'vertical';

    const grid = generatePattern(font, {
      type: texturePatternType as PatternType,
      color: textColor,
      bgColor: backgroundColor,
      category: blocksOnly ? 'Blocks' : 'AllCharacters',
      caseMode: caseModeFromCharset(charset),
      seed: textureSeed,
      direction,
      scale: textureScale,
      invert,
      colorGradient: colorGrad,
    });

    // OP5 (index 5) "Max": replace space ($20) and solid block ($A0) with transparency
    const useMaxTransparency = textureOptions[5];
    if (useMaxTransparency) {
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
          const code = grid[r][c].code;
          if (code === 0x20 || code === 0xA0) {
            grid[r][c] = { ...grid[r][c], code: TRANSPARENT_SCREENCODE };
          }
        }
      }
    }

    setGeneratedGrid(grid);
  }, [isManual, editChars, editColors, textureOptions, font, texturePatternType, textColor, backgroundColor, charset, textureSeed, textureScale, editChars.length]);

  // Auto-apply output whenever the grid or output mode changes
  useEffect(() => {
    if (!generatedGrid) return;
    if (textureOutputMode === 'brush') {
      tb.setBrush({
        framebuf: generatedGrid,
        brushRegion: { min: { row: 0, col: 0 }, max: { row: 15, col: 15 } },
      });
    } else if (textureOutputMode === 'fill') {
      tb.fillTexture(generatedGrid);
    }
  }, [generatedGrid, textureOutputMode, tb]);

  // Toggle an option flag
  const handleToggleOption = useCallback((idx: number) => {
    const next = [...textureOptions];
    next[idx] = !next[idx];
    tb.setTextureOptions(next);
  }, [tb, textureOptions]);

  // Toggle output mode (Brush / Fill are exclusive toggles, clicking active one turns it off)
  const handleSetOutputMode = useCallback((mode: 'brush' | 'fill') => {
    tb.setTextureOutputMode(textureOutputMode === mode ? 'none' : mode);
  }, [tb, textureOutputMode]);

  const opLabels = OP_LABELS[texturePatternType] ?? OP_LABELS.gradient;
  const opTips = OP_TIPS[texturePatternType] ?? OP_TIPS.gradient;

  return (
    <div style={{ padding: '0px 2px', display: 'flex', flexDirection: 'column', gap: '1px' }}>
      {/* Manual mode: 16-cell entry row; Generator modes: Seed slider */}
      {isManual ? (
        <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
          <SmallBtn label="−" onClick={handleManualRemove} title="Remove last character" width={16} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <TextureEntryCanvas
              chars={[...editChars, ...Array(Math.max(0, 16 - editChars.length)).fill(0x20)]}
              colors={[...editColors, ...Array(Math.max(0, 16 - editColors.length)).fill(14)]}
              font={font} colorPalette={colorPalette} backgroundColor={backgroundColor}
              selectedCell={selectedCell} onCellClick={handleCellClick}
            />
          </div>
          <SmallBtn label="+" onClick={handleManualAdd} title="Add a character" width={16} />
          <span style={{ fontSize: '8px', color: 'var(--panel-label-color)', width: '16px', textAlign: 'center', flexShrink: 0 }}>{editChars.length}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '1px 0' }}>
          <span style={{ fontSize: '9px', color: 'var(--panel-label-color)', flexShrink: 0 }}>Seed</span>
          <input type="range" min={1} max={99} value={textureSeed}
            onChange={(e) => tb.setTextureSeed(Number(e.target.value))}
            style={{ flex: 1, minWidth: 0, cursor: 'pointer', height: '10px' }}
          />
          <span style={{ fontSize: '9px', color: 'var(--panel-btn-color)', width: '16px', textAlign: 'right', flexShrink: 0 }}>{textureSeed}</span>
        </div>
      )}
      {/* Scale slider */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '1px 0' }}>
        <span style={{ fontSize: '9px', color: 'var(--panel-label-color)', flexShrink: 0 }}>Scale</span>
        <input type="range" min={1} max={8} value={textureScale}
          onChange={(e) => tb.setTextureScale(Number(e.target.value))}
          style={{ flex: 1, minWidth: 0, cursor: 'pointer', height: '10px' }}
        />
        <span style={{ fontSize: '9px', color: 'var(--panel-btn-color)', width: '10px', textAlign: 'right', flexShrink: 0 }}>{textureScale}</span>
      </div>

      {/* Controls row: OP toggles + $40 toggle + Make Brush */}
      <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap' }}>
        {textureOptions.slice(0, 5).map((active, i) => (
          <SmallToggle key={i} label={opLabels[i]} active={active}
            onClick={() => handleToggleOption(i)} title={opTips[i]} width={28} />
        ))}
        <SmallToggle label="Max" active={textureOptions[5] ?? false}
          onClick={() => handleToggleOption(5)} title="Replace $20 (space) and $A0 (solid) with transparency" width={28} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '2px' }}>
          <SmallToggle label="Brush" active={textureOutputMode === 'brush'}
            onClick={() => handleSetOutputMode('brush')} title="Auto-set as 16×16 brush" width={36} />
          <SmallToggle label="Fill" active={textureOutputMode === 'fill'}
            onClick={() => handleSetOutputMode('fill')} title="Auto-fill entire canvas with tiled pattern" width={28} />
        </div>
      </div>

      {/* 16×16 preview */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid var(--panel-preview-border)', background: 'var(--panel-preview-bg)', borderRadius: '2px',
        padding: '2px', overflow: 'hidden',
      }}>
        <TexturePreviewCanvas
          grid={generatedGrid ?? undefined}
          font={font} colorPalette={colorPalette} backgroundColor={backgroundColor}
        />
      </div>
    </div>
  );
}

export default connect(
  (state: RootState) => {
    const framebuf = selectors.getCurrentFramebuf(state);
    const { font, charset } = selectors.getCurrentFramebufFont(state);
    const prefix = charset.substring(0, 3);
    let colorPalette: Rgb[];
    if (prefix === 'vic') colorPalette = getSettingsCurrentVic20ColorPalette(state);
    else if (prefix === 'pet') colorPalette = getSettingsCurrentPetColorPalette(state);
    else colorPalette = getSettingsCurrentColorPalette(state);
    const selected = state.toolbar.selectedChar;
    const charTransform = state.toolbar.charTransform;
    return {
      textureOptions: state.toolbar.textureOptions,
      texturePatternType: state.toolbar.texturePatternType,
      textureSeed: state.toolbar.textureSeed,
      textureScale: state.toolbar.textureScale,
      textureOutputMode: state.toolbar.textureOutputMode,
      charset,
      font, colorPalette,
      textColor: state.toolbar.textColor,
      backgroundColor: framebuf?.backgroundColor ?? 0,
      framebufWidth: framebuf?.width ?? 40,
      framebufHeight: framebuf?.height ?? 25,
      curScreencode: selectors.getScreencodeWithTransform(selected, font, charTransform),
    };
  },
  (dispatch: any) => ({
    Toolbar: Toolbar.bindDispatch(dispatch),
  })
)(TexturePanel);
