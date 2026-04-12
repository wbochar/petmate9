import React, { useCallback, useRef, useEffect, useState } from 'react';
import { connect } from 'react-redux';

import { Toolbar } from '../redux/toolbar';
import { Framebuffer, CHARSET_UPPER } from '../redux/editor';
import * as Screens from '../redux/screens';
import * as selectors from '../redux/selectors';
import * as screensSelectors from '../redux/screensSelectors';
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
  Brush,
  TexturePreset,
  Framebuf as FramebufType,
  TRANSPARENT_SCREENCODE,
  DEFAULT_TEXTURE_OPTIONS,
} from '../redux/types';

// ---- Style constants (matching dark UI theme) ----

const btnStyle: React.CSSProperties = {
  fontSize: '10px', fontWeight: 'bold', background: 'var(--panel-btn-bg)', color: 'var(--panel-btn-color)',
  border: '1px solid var(--panel-btn-border)', padding: '2px 6px', cursor: 'pointer',
  userSelect: 'none', lineHeight: '14px',
};
const activeBtnStyle: React.CSSProperties = { ...btnStyle, background: 'var(--panel-btn-active-bg)', color: 'var(--panel-btn-active-color)' };

const CELL = 8;
const STRIP_W = 10;
const CANVAS_W = STRIP_W * CELL; // 80
const CANVAS_H = CELL;           // 8
const PREVIEW_SIZE = 16;

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

/** Draw a character strip with per-cell colours. charCount dims unused slots. */
function drawCharStripWithColors(
  ctx: CanvasRenderingContext2D,
  chars: number[],
  colors: number[],
  font: Font,
  colorPalette: Rgb[],
  backgroundColor: number,
  selectedCell?: number | null,
  charCount?: number,
) {
  const bg = colorPalette[backgroundColor];
  ctx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  for (let col = 0; col < STRIP_W; col++) {
    const code = chars[col] ?? 0x20;
    const fg = colorPalette[colors[col] ?? 14];
    drawCell(ctx, code, col, 0, font, fg, bg);
  }

  // Mark unused slots with a visible dashed border per cell
  if (charCount != null && charCount < STRIP_W) {
    // Dim unused area
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(charCount * CELL, 0, (STRIP_W - charCount) * CELL, CANVAS_H);
    // Draw a dashed border around each unused cell so it's visible on any BG
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.6)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    for (let col = charCount; col < STRIP_W; col++) {
      ctx.strokeRect(col * CELL + 0.5, 0.5, CELL - 1, CELL - 1);
    }
    ctx.setLineDash([]);
  }

  if (selectedCell != null && selectedCell >= 0 && selectedCell < STRIP_W) {
    ctx.strokeStyle = 'rgba(128,255,128,0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(selectedCell * CELL + 0.5, 0.5, CELL - 1, CELL - 1);
  }
}

// ---- Small toggle button ----

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

// ---- Read-only thumbnail for preset list rows ----

const THUMB_SCALE = 1.5;

function TextureThumb({ chars, colors, font, colorPalette, backgroundColor, selected = false }: {
  chars: number[]; colors: number[]; font: Font; colorPalette: Rgb[];
  backgroundColor: number; selected?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    drawCharStripWithColors(ctx, chars, colors, font, colorPalette, backgroundColor);
  }, [chars, colors, font, colorPalette, backgroundColor]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      style={{
        width: CANVAS_W * THUMB_SCALE,
        height: CANVAS_H * THUMB_SCALE,
        imageRendering: 'pixelated',
        display: 'block',
        border: selected ? '1px solid #fff' : '1px solid transparent',
        boxSizing: 'border-box',
      }}
    />
  );
}

// ---- Editable 16x1 canvas with hover preview (for edit mode) ----

function TextureMiniCanvas({ chars, colors, font, colorPalette, textColor, backgroundColor, selectedCell, curScreencode, onCellClick, charCount }: {
  chars: number[]; colors: number[]; font: Font; colorPalette: Rgb[];
  textColor: number; backgroundColor: number; selectedCell: number | null;
  curScreencode: number; onCellClick: (col: number) => void; charCount: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);

  // Draw the base strip
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    drawCharStripWithColors(ctx, chars, colors, font, colorPalette, backgroundColor, selectedCell, charCount);
  }, [chars, colors, font, colorPalette, backgroundColor, selectedCell, charCount]);

  // Draw hover preview on overlay
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d')!;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (hoverCol === null || hoverCol < 0 || hoverCol >= STRIP_W) return;

    const bg = colorPalette[backgroundColor];
    const fg = colorPalette[textColor];
    const boffs = curScreencode * 8;
    const img = ctx.createImageData(CELL, CELL);
    const d = img.data;
    let di = 0;
    for (let y = 0; y < 8; y++) {
      const p = font.bits[boffs + y];
      for (let i = 0; i < 8; i++) {
        const on = (128 >> i) & p;
        d[di + 0] = on ? fg.r : bg.r;
        d[di + 1] = on ? fg.g : bg.g;
        d[di + 2] = on ? fg.b : bg.b;
        d[di + 3] = 180;
        di += 4;
      }
    }
    ctx.putImageData(img, hoverCol * CELL, 0);
    // Draw small corner marks instead of a full border to avoid obscuring the character
    const cx = hoverCol * CELL;
    const m = 2; // corner mark length in pixels
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // top-left
    ctx.moveTo(cx + 0.5, m + 0.5); ctx.lineTo(cx + 0.5, 0.5); ctx.lineTo(cx + m + 0.5, 0.5);
    // top-right
    ctx.moveTo(cx + CELL - m - 0.5, 0.5); ctx.lineTo(cx + CELL - 0.5, 0.5); ctx.lineTo(cx + CELL - 0.5, m + 0.5);
    // bottom-left
    ctx.moveTo(cx + 0.5, CELL - m - 0.5); ctx.lineTo(cx + 0.5, CELL - 0.5); ctx.lineTo(cx + m + 0.5, CELL - 0.5);
    // bottom-right
    ctx.moveTo(cx + CELL - m - 0.5, CELL - 0.5); ctx.lineTo(cx + CELL - 0.5, CELL - 0.5); ctx.lineTo(cx + CELL - 0.5, CELL - m - 0.5);
    ctx.stroke();
  }, [hoverCol, curScreencode, font, colorPalette, textColor, backgroundColor, charCount]);

  const colFromEvent = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = canvasRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const col = Math.floor((x / rect.width) * STRIP_W);
      return col >= 0 && col < STRIP_W ? col : null;
    },
    []
  );

  return (
    <div
      style={{ position: 'relative', width: '100%', cursor: 'pointer', border: '1px solid #555' }}
      onMouseMove={(e) => setHoverCol(colFromEvent(e))}
      onMouseLeave={() => setHoverCol(null)}
      onClick={(e) => { const col = colFromEvent(e); if (col !== null) onCellClick(col); }}
    >
      <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
        style={{ width: '100%', imageRendering: 'pixelated', display: 'block' }}
      />
      <canvas ref={overlayRef} width={CANVAS_W} height={CANVAS_H}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', imageRendering: 'pixelated', pointerEvents: 'none' }}
      />
    </div>
  );
}

// ---- 16x16 Preview Canvas ----

function TexturePreviewCanvas({ grid, font, colorPalette, backgroundColor }: {
  grid?: Pixel[][]; font: Font; colorPalette: Rgb[]; backgroundColor: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const PX = PREVIEW_SIZE * CELL;

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const bg = colorPalette[backgroundColor];
    for (let row = 0; row < PREVIEW_SIZE; row++) {
      for (let col = 0; col < PREVIEW_SIZE; col++) {
        const px = grid?.[row]?.[col] ?? { code: 0x20, color: 14 };
        drawCell(ctx, px.code, col, row, font, colorPalette[px.color] ?? bg, bg);
      }
    }
  }, [grid, font, colorPalette, backgroundColor]);

  return (
    <canvas ref={canvasRef} width={PX} height={PX} style={{
      width: PX, height: PX, imageRendering: 'pixelated', display: 'block',
    }} />
  );
}

// ---- Scrollable preset list ----

const ROW_H = 34;
const VISIBLE_SLOTS = 4;

function TexturePresetList({ presets, selectedIndex, font, colorPalette, backgroundColor, onSelect, onMove, onDuplicate, onDelete, onFocusName, listRef: externalListRef }: {
  presets: TexturePreset[]; selectedIndex: number; font: Font; colorPalette: Rgb[];
  backgroundColor: number; onSelect: (i: number) => void; onMove?: (from: number, to: number) => void;
  onDuplicate?: (index: number) => void; onDelete?: (index: number) => void;
  onFocusName?: () => void; listRef?: React.RefObject<HTMLDivElement>;
}) {
  const internalRef = useRef<HTMLDivElement>(null);
  const listRef = externalListRef ?? internalRef;

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      if (e.ctrlKey && onMove) {
        const target = selectedIndex + dir;
        if (target >= 0 && target < presets.length) {
          onMove(selectedIndex, target);
        }
      } else {
        const next = Math.max(0, Math.min(presets.length - 1, selectedIndex + dir));
        onSelect(next);
      }
    } else if (e.key === 'Insert' && onDuplicate) {
      e.preventDefault();
      onDuplicate(selectedIndex);
    } else if (e.key === 'Delete' && onDelete) {
      e.preventDefault();
      onDelete(selectedIndex);
    } else if (e.key === 'n' && onFocusName) {
      e.preventDefault();
      onFocusName();
    }
  }, [selectedIndex, presets.length, onSelect, onMove, onDuplicate, onDelete, onFocusName]);

  return (
    <div
      ref={listRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        maxHeight: ROW_H * VISIBLE_SLOTS,
        overflowY: 'auto',
        border: '1px solid var(--panel-btn-border)',
        background: 'var(--panel-list-bg)',
        outline: 'none',
      }}
    >
      {presets.map((p, i) => {
        const isSelected = i === selectedIndex;
        const padChars = [...p.chars.slice(0, STRIP_W), ...Array(Math.max(0, STRIP_W - p.chars.length)).fill(0x20)];
        const padColors = [...p.colors.slice(0, STRIP_W), ...Array(Math.max(0, STRIP_W - p.colors.length)).fill(14)];
        return (
          <div
            key={i}
            onClick={() => onSelect(i)}
            title={p.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 2px',
              minHeight: ROW_H,
              boxSizing: 'border-box',
              cursor: 'pointer',
              background: isSelected ? 'var(--panel-list-item-selected)' : 'transparent',
              borderBottom: '1px solid var(--panel-list-border)',
            }}
            onMouseEnter={(e) => {
              if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--panel-list-item-hover)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = isSelected ? 'var(--panel-list-item-selected)' : 'transparent';
            }}
          >
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <div style={{
                fontSize: '9px', color: 'var(--panel-label-color)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {p.name}
              </div>
              <TextureThumb
                chars={padChars}
                colors={padColors}
                font={font}
                colorPalette={colorPalette}
                backgroundColor={backgroundColor}
                selected={isSelected}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Option labels / tips (manual mode) ----

const OP_LABELS = ['V/H', 'Inv', 'Col', 'Diag'];
const OP_INDICES = [0, 1, 2, 4]; // indices into textureOptions
const OP_TIPS = [
  'Vertical (off=Horizontal)',
  'Reverse strip order',
  'Alternate fg/bg colors per cell',
  'Diagonal offset per row',
];

// ========== Main TexturePanel ==========

interface TexturePanelStateProps {
  texturePresets: TexturePreset[];
  selectedTexturePresetIndex: number;
  textureScale: number;
  textureOutputMode: 'brush' | 'fill' | 'none';
  textureForceForeground: boolean;
  font: Font;
  colorPalette: Rgb[];
  textColor: number;
  backgroundColor: number;
  curScreencode: number;
  currentBrush: Brush | null;
}

interface TexturePanelDispatchProps {
  Toolbar: ReturnType<typeof Toolbar.bindDispatch>;
}

type TexturePanelProps = TexturePanelStateProps & TexturePanelDispatchProps;

function TexturePanel({
  texturePresets, selectedTexturePresetIndex,
  textureScale, textureOutputMode, textureForceForeground,
  font, colorPalette, textColor, backgroundColor,
  curScreencode, currentBrush,
  Toolbar: tb,
}: TexturePanelProps) {
  const preset = texturePresets[selectedTexturePresetIndex];

  // Local editing state - working copy of the selected preset
  const [editName, setEditName] = useState<string>(preset?.name ?? '');
  const [editChars, setEditChars] = useState<number[]>(preset ? [...preset.chars] : [0x20]);
  const [editColors, setEditColors] = useState<number[]>(preset ? [...preset.colors] : [14]);
  const [editOptions, setEditOptions] = useState<boolean[]>(preset?.options ? [...preset.options] : [...DEFAULT_TEXTURE_OPTIONS]);
  const [editRandom, setEditRandom] = useState<boolean>(preset?.random ?? false);
  const [selectedCell, setSelectedCell] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [generatedGrid, setGeneratedGrid] = useState<Pixel[][] | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const presetListRef = useRef<HTMLDivElement>(null);

  // Sync local state when selected preset changes
  useEffect(() => {
    if (preset) {
      setEditName(preset.name);
      setEditChars([...preset.chars]);
      setEditColors([...preset.colors]);
      setEditOptions(preset.options ? [...preset.options] : [...DEFAULT_TEXTURE_OPTIONS]);
      setEditRandom(preset.random ?? false);
      setSelectedCell(null);
      setDirty(false);
    }
  }, [selectedTexturePresetIndex, preset]);

  // Turn off fill mode when switching tabs to prevent auto-filling the new screen
  const prevBgRef = useRef(backgroundColor);
  useEffect(() => {
    if (prevBgRef.current !== backgroundColor) {
      prevBgRef.current = backgroundColor;
      if (textureOutputMode === 'fill') {
        tb.setTextureOutputMode('none');
      }
    }
  }, [backgroundColor, textureOutputMode, tb]);

  // Build 16x16 grid from a char/color strip + current options
  const buildGrid = useCallback((chars: number[], colors: number[]): Pixel[][] => {
    const vertical = editOptions[0];
    const invert = editOptions[1];
    const colorGrad = editOptions[2];
    const diagonal = editOptions[4];

    let baseChars = [...chars];
    let baseColors = [...colors];
    if (invert) { baseChars.reverse(); baseColors.reverse(); }

    // Scale: repeat each character textureScale times
    const scaledChars: number[] = [];
    const scaledColors: number[] = [];
    for (let i = 0; i < baseChars.length; i++) {
      for (let s = 0; s < textureScale; s++) {
        scaledChars.push(baseChars[i]);
        scaledColors.push(baseColors[i]);
      }
    }
    const stripLen = scaledChars.length || 1;

    const grid: Pixel[][] = [];
    for (let row = 0; row < 16; row++) {
      const rowPixels: Pixel[] = [];
      for (let col = 0; col < 16; col++) {
        let idx: number;
        if (editRandom) {
          idx = Math.floor(Math.random() * stripLen);
        } else if (vertical) {
          idx = diagonal ? (row + col) % stripLen : row % stripLen;
        } else {
          idx = diagonal ? (col + row) % stripLen : col % stripLen;
        }
        const code = scaledChars[idx] ?? 0x20;
        let color = scaledColors[idx] ?? 14;
        if (colorGrad) {
          color = idx % 2 === 0 ? textColor : backgroundColor;
        }
        rowPixels.push({ code, color });
      }
      grid.push(rowPixels);
    }

    // Max transparency: replace space / solid-block with transparent
    if (editOptions[5]) {
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
          const code = grid[r][c].code;
          if (code === 0x20 || code === 0xA0) {
            grid[r][c] = { ...grid[r][c], code: TRANSPARENT_SCREENCODE };
          }
        }
      }
    }
    return grid;
  }, [editOptions, editRandom, textureScale, textColor, backgroundColor]);

  // Regenerate grid whenever editing state or options change
  useEffect(() => {
    setGeneratedGrid(buildGrid(editChars, editColors));
  }, [editChars, editColors, buildGrid]);

  // Apply force-foreground override if enabled
  const applyForceFg = useCallback((grid: Pixel[][]): Pixel[][] => {
    if (!textureForceForeground) return grid;
    return grid.map(row => row.map(p => ({ ...p, color: textColor })));
  }, [textureForceForeground, textColor]);

  // Auto-apply output whenever grid, output mode, or force-fg changes
  useEffect(() => {
    if (!generatedGrid) return;
    const output = applyForceFg(generatedGrid);
    if (textureOutputMode === 'brush') {
      tb.setBrush({
        framebuf: output,
        brushRegion: { min: { row: 0, col: 0 }, max: { row: 15, col: 15 } },
      });
    } else if (textureOutputMode === 'fill') {
      tb.fillTexture(output);
    }
  }, [generatedGrid, textureOutputMode, textureForceForeground, textColor, tb, applyForceFg]);

  // ---- Cell editing ----

  const handleCellClick = useCallback((col: number) => {
    if (col >= editChars.length) {
      // Click in unused space: add a new slot with the currently selected character
      if (editChars.length < STRIP_W) {
        setEditChars(prev => [...prev, curScreencode]);
        setEditColors(prev => [...prev, textColor]);
        setSelectedCell(editChars.length);
        setDirty(true);
      }
      return;
    }
    setSelectedCell(col);
    setEditChars(prev => { const n = [...prev]; n[col] = curScreencode; return n; });
    setEditColors(prev => { const n = [...prev]; n[col] = textColor; return n; });
    setDirty(true);
  }, [curScreencode, textColor, editChars.length]);

  const handleAdd = useCallback(() => {
    if (editChars.length >= STRIP_W) return;
    setEditChars(prev => [...prev, 0x20]);
    setEditColors(prev => [...prev, 14]);
    setDirty(true);
  }, [editChars.length]);

  const handleRemove = useCallback(() => {
    if (editChars.length <= 1) return;
    setEditChars(prev => prev.slice(0, -1));
    setEditColors(prev => prev.slice(0, -1));
    setSelectedCell(prev => prev !== null && prev >= editChars.length - 1 ? null : prev);
    setDirty(true);
  }, [editChars.length]);

  // ---- Preset selection ----

  const handlePresetSelect = useCallback((index: number) => {
    tb.setSelectedTexturePresetIndex(index);
  }, [tb]);

  const handlePresetMove = useCallback((from: number, to: number) => {
    const moved = [...texturePresets];
    const [item] = moved.splice(from, 1);
    moved.splice(to, 0, item);
    tb.setTexturePresets(moved);
    tb.setSelectedTexturePresetIndex(to);
  }, [tb, texturePresets]);

  const handlePresetDuplicate = useCallback((index: number) => {
    const src = texturePresets[index];
    if (!src) return;
    const dupe: TexturePreset = {
      name: src.name + ' copy',
      chars: [...src.chars],
      colors: [...src.colors],
      options: src.options ? [...src.options] : [...DEFAULT_TEXTURE_OPTIONS],
      random: src.random ?? false,
    };
    const updated = [...texturePresets];
    updated.splice(index + 1, 0, dupe);
    tb.setTexturePresets(updated);
    tb.setSelectedTexturePresetIndex(index + 1);
  }, [tb, texturePresets]);

  const handlePresetDelete = useCallback((index: number) => {
    if (texturePresets.length <= 1) return;
    tb.removeTexturePreset(index);
  }, [tb, texturePresets.length]);

  // ---- Save ----

  const focusPresetList = useCallback(() => {
    presetListRef.current?.focus();
  }, []);

  const handleSave = useCallback(() => {
    if (!preset) return;
    tb.updateTexturePreset(selectedTexturePresetIndex, {
      ...preset, name: editName, chars: [...editChars], colors: [...editColors], options: [...editOptions], random: editRandom,
    });
    setDirty(false);
    // Refocus the preset list after saving
    setTimeout(focusPresetList, 0);
  }, [tb, selectedTexturePresetIndex, preset, editName, editChars, editColors, editOptions, editRandom, focusPresetList]);

  // ---- Options / output toggles ----

  const handleToggleOption = useCallback((idx: number) => {
    setEditOptions(prev => {
      const n = [...prev]; n[idx] = !n[idx];
      if (preset) {
        tb.updateTexturePreset(selectedTexturePresetIndex, {
          ...preset, name: editName, chars: [...editChars], colors: [...editColors], options: n, random: editRandom,
        });
      }
      return n;
    });
  }, [preset, tb, selectedTexturePresetIndex, editName, editChars, editColors, editRandom]);

  const handleToggleRandom = useCallback(() => {
    setEditRandom(prev => {
      const n = !prev;
      if (preset) {
        tb.updateTexturePreset(selectedTexturePresetIndex, {
          ...preset, name: editName, chars: [...editChars], colors: [...editColors], options: [...editOptions], random: n,
        });
      }
      return n;
    });
  }, [preset, tb, selectedTexturePresetIndex, editName, editChars, editColors, editOptions]);

  const handleSetOutputMode = useCallback((mode: 'brush' | 'fill') => {
    tb.setTextureOutputMode(textureOutputMode === mode ? 'none' : mode);
  }, [tb, textureOutputMode]);

  const inputFocus = useCallback(() => tb.setShortcutsActive(false), [tb]);
  const inputBlur = useCallback(() => {
    tb.setShortcutsActive(true);
    // Refocus the preset list when leaving the name input
    setTimeout(focusPresetList, 0);
  }, [tb, focusPresetList]);

  const handleFocusName = useCallback(() => {
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, []);

  if (!preset && texturePresets.length === 0) return null;

  return (
    <div style={{ padding: '2px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {/* Editor: name + strip (always visible) */}
      <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
        <input
          ref={nameInputRef}
          type="text"
          value={editName}
          onChange={(e) => { setEditName(e.target.value); setDirty(true); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); handleSave(); } }}
          onFocus={inputFocus}
          onBlur={inputBlur}
          style={{
            fontSize: '10px', background: 'var(--panel-btn-bg)', color: 'var(--panel-btn-color)',
            border: '1px solid var(--panel-btn-border)', padding: '2px 4px', flex: 1, minWidth: 0,
            boxSizing: 'border-box',
          }}
        />
        <div
          style={dirty ? activeBtnStyle : { ...btnStyle, opacity: 0.4, cursor: 'default' }}
          onClick={dirty ? handleSave : undefined}
          title="Save edits to preset"
        >
          Save
        </div>
      </div>
      <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
        <SmallBtn label={'\u2212'} onClick={handleRemove} title="Remove last character" width={16} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <TextureMiniCanvas
            chars={[...editChars, ...Array(Math.max(0, STRIP_W - editChars.length)).fill(0x20)]}
            colors={[...editColors, ...Array(Math.max(0, STRIP_W - editColors.length)).fill(14)]}
            font={font}
            colorPalette={colorPalette}
            textColor={textColor}
            backgroundColor={backgroundColor}
            selectedCell={selectedCell}
            curScreencode={curScreencode}
            onCellClick={handleCellClick}
            charCount={editChars.length}
          />
        </div>
        <span style={{ marginLeft: '2px' }}><SmallBtn label="+" onClick={handleAdd} title="Add a character" width={16} /></span>
        <span style={{ fontSize: '8px', color: 'var(--panel-label-color)', width: '16px', textAlign: 'center', flexShrink: 0 }}>{editChars.length}</span>
      </div>

      {/* Scale slider */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '1px 0' }}>
        <span style={{ fontSize: '9px', color: 'var(--panel-label-color)', flexShrink: 0 }}>Scale</span>
        <input type="range" min={1} max={8} value={textureScale}
          onChange={(e) => tb.setTextureScale(Number(e.target.value))}
          style={{ flex: 1, minWidth: 0, cursor: 'pointer', height: '10px' }}
        />
        <span style={{ fontSize: '9px', color: 'var(--panel-btn-color)', width: '10px', textAlign: 'right', flexShrink: 0 }}>{textureScale}</span>
      </div>
      {/* Toggles + output */}
      <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap' }}>
        {OP_LABELS.map((label, i) => (
          <SmallToggle key={i} label={label} active={editOptions[OP_INDICES[i]] ?? false}
            onClick={() => handleToggleOption(OP_INDICES[i])} title={OP_TIPS[i]} width={28} />
        ))}
        <SmallToggle label="RND" active={editRandom}
          onClick={handleToggleRandom} title="Random: randomly pick chars when tiling" width={28} />
        <SmallBtn label="Paste" onClick={() => {
          if (!currentBrush) return;
          const row = currentBrush.framebuf[0];
          if (!row || row.length === 0) return;
          const count = Math.min(row.length, STRIP_W);
          setEditChars(row.slice(0, count).map(p => p.code));
          setEditColors(row.slice(0, count).map(p => p.color));
          setSelectedCell(null);
          setDirty(true);
        }} title="Paste first row of current brush into texture charset (max 10)" width={34} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '2px' }}>
          <SmallToggle label="Brush" active={textureOutputMode === 'brush'}
            onClick={() => handleSetOutputMode('brush')} title="Auto-set as 16x16 brush" width={36} />
          <SmallToggle label="Fill" active={textureOutputMode === 'fill'}
            onClick={() => handleSetOutputMode('fill')} title="Auto-fill entire canvas with tiled pattern" width={28} />
        </div>
      </div>

      {/* Bottom: preset list (left) + preview (right) */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <TexturePresetList
            presets={texturePresets}
            selectedIndex={selectedTexturePresetIndex}
            font={font}
            colorPalette={colorPalette}
            backgroundColor={backgroundColor}
            onSelect={handlePresetSelect}
            onMove={handlePresetMove}
            onDuplicate={handlePresetDuplicate}
            onDelete={handlePresetDelete}
            onFocusName={handleFocusName}
            listRef={presetListRef}
          />
        </div>
        {/* 16x16 preview */}
        <div style={{
          flexShrink: 0, alignSelf: 'flex-start',
          border: '1px solid var(--panel-preview-border)', background: 'var(--panel-preview-bg)', borderRadius: '2px',
          padding: '2px', overflow: 'hidden',
        }}>
          <TexturePreviewCanvas
            grid={generatedGrid ?? undefined}
            font={font} colorPalette={colorPalette} backgroundColor={backgroundColor}
          />
        </div>
      </div>
    </div>
  );
}

// ========== Header controls (for CollapsiblePanel header) ==========

function TextureHeaderControlsInner({
  texturePresets, selectedTexturePresetIndex, textColor, backgroundColor,
  textureForceForeground, textureDrawMode, framebuf: currentFramebuf,
  Toolbar: toolbarActions, dispatch,
}: {
  texturePresets: TexturePreset[]; selectedTexturePresetIndex: number;
  textColor: number; backgroundColor: number;
  textureForceForeground: boolean;
  textureDrawMode: boolean;
  framebuf: FramebufType | null;
  Toolbar: ReturnType<typeof Toolbar.bindDispatch>;
  dispatch: any;
}) {
  const preset = texturePresets[selectedTexturePresetIndex];

  const handleAdd = useCallback(() => {
    const name = `Texture ${texturePresets.length + 1}`;
    const chars = preset ? [...preset.chars].slice(0, STRIP_W) : Array(STRIP_W).fill(0x20);
    const colors = preset ? [...preset.colors].slice(0, STRIP_W) : Array(STRIP_W).fill(14);
    const options = preset?.options ? [...preset.options] : [...DEFAULT_TEXTURE_OPTIONS];
    const random = preset?.random ?? false;
    toolbarActions.addTexturePreset({ name, chars, colors, options, random });
  }, [toolbarActions, texturePresets.length, preset]);

  const handleDelete = useCallback(() => {
    if (texturePresets.length <= 1) return;
    toolbarActions.removeTexturePreset(selectedTexturePresetIndex);
  }, [toolbarActions, selectedTexturePresetIndex, texturePresets.length]);

  const OPTS_MARKER = 0xBB; // marker in cell index 6 to identify an options row
  const NAME_MARKER = 0xBC; // marker at end of name row
  const CHARS_TERMINATOR = 0xBD; // placed after the last real char in the chars row
  const EXPORT_W = 24; // screen width for export (max name length)

  // Encode a name string to PETSCII screencodes (A-Z → 1-26, 0-9 → $30-$39, space → $20)
  const encodeName = (name: string): number[] => {
    const row = Array(EXPORT_W).fill(0x20);
    for (let i = 0; i < Math.min(name.length, EXPORT_W - 1); i++) {
      const ch = name.charCodeAt(i);
      if (ch >= 65 && ch <= 90) row[i] = ch - 64;        // A-Z
      else if (ch >= 97 && ch <= 122) row[i] = ch - 96;  // a-z
      else if (ch >= 48 && ch <= 57) row[i] = ch - 48 + 0x30; // 0-9
      else row[i] = 0x20;
    }
    row[EXPORT_W - 1] = NAME_MARKER; // marker at last cell
    return row;
  };

  // Decode PETSCII screencodes back to a name string
  const decodeName = (codes: number[]): string => {
    let name = '';
    const len = Math.min(codes.length, EXPORT_W - 1); // exclude marker cell
    for (let i = 0; i < len; i++) {
      const c = codes[i];
      if (c >= 1 && c <= 26) name += String.fromCharCode(c + 64);
      else if (c >= 0x30 && c <= 0x39) name += String.fromCharCode(c - 0x30 + 48);
      else if (c === 0x20) name += ' ';
      else name += '?';
    }
    return name.trimEnd();
  };

  const handleExport = useCallback(() => {
    const BLANK = 0x20;
    const extraRows = 10;
    const rowsPerPreset = 3; // name, chars, options
    const totalRows = texturePresets.length * rowsPerPreset + extraRows;
    const fbPixels: Pixel[][] = [];
    for (const p of texturePresets) {
      // Row 1: name encoded as PETSCII screencodes, marker at last cell
      const nameRow = encodeName(p.name).map(code => ({ code, color: textColor } as Pixel));
      fbPixels.push(nameRow);
      // Row 2: chars with per-cell colors + terminator after last char
      const chars = p.chars.slice(0, STRIP_W);
      const colors = p.colors.slice(0, STRIP_W);
      const charLen = chars.length;
      const charRow: Pixel[] = [];
      for (let c = 0; c < EXPORT_W; c++) {
        if (c < charLen) charRow.push({ code: chars[c] ?? BLANK, color: colors[c] ?? textColor });
        else if (c === charLen) charRow.push({ code: CHARS_TERMINATOR, color: 0 });
        else charRow.push({ code: BLANK, color: textColor });
      }
      fbPixels.push(charRow);
      // Row 3: options encoded as screencodes [opt0..opt5, 0xBB marker, random, ...blank]
      const opts = p.options ?? DEFAULT_TEXTURE_OPTIONS;
      const optsRow: Pixel[] = [];
      for (let c = 0; c < EXPORT_W; c++) {
        if (c < 6) optsRow.push({ code: opts[c] ? 1 : 0, color: 0 });
        else if (c === 6) optsRow.push({ code: OPTS_MARKER, color: 0 });
        else if (c === 7) optsRow.push({ code: p.random ? 1 : 0, color: 0 });
        else optsRow.push({ code: BLANK, color: textColor });
      }
      fbPixels.push(optsRow);
    }
    for (let i = 0; i < extraRows; i++) fbPixels.push(Array(EXPORT_W).fill({ code: BLANK, color: textColor }));
    dispatch(Screens.actions.addScreenAndFramebuf());
    dispatch((innerDispatch: any, getState: any) => {
      const state = getState();
      const newIdx = screensSelectors.getCurrentScreenFramebufIndex(state);
      if (newIdx === null) return;
      innerDispatch(Framebuffer.actions.setFields({ backgroundColor, borderColor: backgroundColor, borderOn: false, name: 'Textures_' + newIdx }, newIdx));
      innerDispatch(Framebuffer.actions.setCharset(CHARSET_UPPER, newIdx));
      innerDispatch(Framebuffer.actions.setDims({ width: EXPORT_W, height: totalRows }, newIdx));
      innerDispatch(Framebuffer.actions.setFields({ framebuf: fbPixels }, newIdx));
      innerDispatch(Toolbar.actions.setZoom(102, 'left'));
    });
  }, [texturePresets, textColor, backgroundColor, dispatch]);

  const handleImport = useCallback(() => {
    if (!currentFramebuf) return;
    if (!currentFramebuf.name?.startsWith('Textures_')) return;
    const fbW = currentFramebuf.width;
    const BLANK = 0x20;
    const imported: TexturePreset[] = [];
    let r = 0;
    while (r < currentFramebuf.height) {
      const row = currentFramebuf.framebuf[r];
      const codes = row.slice(0, fbW).map((p: Pixel) => p.code);
      if (codes.every((c: number) => c === BLANK)) { r++; continue; }

      // Check if this is a name row (marker 0xBC at last cell of a 24-wide row, or at index 23)
      let name = `Texture ${imported.length + 1}`;
      if (fbW >= EXPORT_W && codes[EXPORT_W - 1] === NAME_MARKER) {
        name = decodeName(codes);
        r++;
        if (r >= currentFramebuf.height) break;
        // Next row should be the chars row — read up to terminator
        const charRowRaw = currentFramebuf.framebuf[r];
        const rawCodes = charRowRaw.slice(0, STRIP_W).map((p: Pixel) => p.code);
        const rawColors = charRowRaw.slice(0, STRIP_W).map((p: Pixel) => p.color);
        let charLen = rawCodes.indexOf(CHARS_TERMINATOR);
        if (charLen < 0) charLen = rawCodes.length; // no terminator = take all
        const chars = rawCodes.slice(0, charLen);
        const colors = rawColors.slice(0, charLen);
        // Check for options row after chars
        let options = [...DEFAULT_TEXTURE_OPTIONS];
        let random = false;
        if (r + 1 < currentFramebuf.height) {
          const nextRow = currentFramebuf.framebuf[r + 1];
          const nextCodes = nextRow.slice(0, fbW).map((p: Pixel) => p.code);
          if (nextCodes[6] === OPTS_MARKER) {
            options = [nextCodes[0] === 1, nextCodes[1] === 1, nextCodes[2] === 1, nextCodes[3] === 1, nextCodes[4] === 1, nextCodes[5] === 1];
            random = nextCodes[7] === 1;
            r++;
          }
        }
        imported.push({ name: name || `Texture ${imported.length + 1}`, chars, colors, options, random });
        r++;
      } else {
        // Legacy format: no name row, just chars (+optional options)
        const rawCodes2 = row.slice(0, STRIP_W).map((p: Pixel) => p.code);
        const rawColors2 = row.slice(0, STRIP_W).map((p: Pixel) => p.color);
        let charLen2 = rawCodes2.indexOf(CHARS_TERMINATOR);
        if (charLen2 < 0) charLen2 = rawCodes2.length;
        const chars = rawCodes2.slice(0, charLen2);
        const colors = rawColors2.slice(0, charLen2);
        let options = [...DEFAULT_TEXTURE_OPTIONS];
        let random = false;
        if (r + 1 < currentFramebuf.height) {
          const nextRow = currentFramebuf.framebuf[r + 1];
          const nextCodes = nextRow.slice(0, fbW).map((p: Pixel) => p.code);
          if (nextCodes[6] === OPTS_MARKER) {
            options = [nextCodes[0] === 1, nextCodes[1] === 1, nextCodes[2] === 1, nextCodes[3] === 1, nextCodes[4] === 1, nextCodes[5] === 1];
            random = nextCodes[7] === 1;
            r++;
          }
        }
        imported.push({ name, chars, colors, options, random });
        r++;
      }
    }
    if (imported.length > 0) {
      toolbarActions.setTexturePresets(imported);
      toolbarActions.setSelectedTexturePresetIndex(0);
    }
  }, [currentFramebuf, toolbarActions]);

  const inputFocus = useCallback(() => toolbarActions.setShortcutsActive(false), [toolbarActions]);
  const inputBlur = useCallback(() => toolbarActions.setShortcutsActive(true), [toolbarActions]);
  const [texW, setTexW] = useState('16');
  const [texH, setTexH] = useState('16');

  return (
    <>
      <input type="text" value={texW}
        onFocus={(e) => { (e.target as HTMLInputElement).select(); inputFocus(); }}
        onBlur={(e) => { setTexW(String(Math.max(1, Number(e.target.value) || 16))); inputBlur(); }}
        onChange={(e) => setTexW(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } e.stopPropagation(); }}
        onKeyUp={(e) => e.stopPropagation()}
        style={{ width: '24px', fontSize: '9px', background: 'var(--panel-input-bg)', color: 'var(--panel-input-color)',
          border: '1px solid var(--panel-btn-border)', padding: '1px 1px', textAlign: 'center' as const, marginRight: 0 }}
        title="Texture width" /><span style={{ fontSize: '7px', color: 'var(--panel-toggle-off-color)', margin: '0' }}>{"\u00D7"}</span><input type="text" value={texH}
        onFocus={(e) => { (e.target as HTMLInputElement).select(); inputFocus(); }}
        onBlur={(e) => { setTexH(String(Math.max(1, Number(e.target.value) || 16))); inputBlur(); }}
        onChange={(e) => setTexH(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } e.stopPropagation(); }}
        onKeyUp={(e) => e.stopPropagation()}
        style={{ width: '24px', fontSize: '9px', background: 'var(--panel-input-bg)', color: 'var(--panel-input-color)',
          border: '1px solid var(--panel-btn-border)', padding: '1px 1px', textAlign: 'center' as const, marginLeft: 0 }}
        title="Texture height" />
      <div style={{...btnStyle, background: textureDrawMode ? '#454' : 'var(--panel-btn-bg)', color: textureDrawMode ? '#fff' : 'var(--panel-btn-color)'}} onClick={() => {
        const next = !textureDrawMode;
        toolbarActions.setTextureDrawMode(next);
        if (next) toolbarActions.resetBrush();
      }} title={textureDrawMode ? 'Draw mode ON: drag on canvas to fill a texture region' : 'Draw mode OFF: use brush/fill output'}>{"\u270E"}</div>
      <div style={{...btnStyle,
        background: textureForceForeground ? 'var(--panel-toggle-on-bg)' : 'var(--panel-btn-bg)',
        color: textureForceForeground ? 'var(--panel-toggle-on-color)' : 'var(--panel-btn-color)',
      }} onClick={() => toolbarActions.setTextureForceForeground(!textureForceForeground)}
        title={textureForceForeground ? 'Force foreground ON: all colors use current foreground' : 'Force foreground OFF: use preset colors'}
      >F</div>
      <div style={btnStyle} onClick={handleAdd} title="Duplicate preset">{'\u29C9'}</div>
      <div style={btnStyle} onClick={handleExport} title="Export presets to new screen">{'\u2B61'}</div>
      <div style={btnStyle} onClick={handleImport} title="Import presets from current screen">{'\u2B63'}</div>
      <div
        style={texturePresets.length > 1 ? btnStyle : { ...btnStyle, opacity: 0.3, cursor: 'default' }}
        onClick={handleDelete}
        title="Delete preset"
      >
        {'\uD83D\uDDD1'}
      </div>
    </>
  );
}

export const TextureHeaderControls = connect(
  (state: RootState) => {
    const framebuf = selectors.getCurrentFramebuf(state);
    return {
      texturePresets: state.toolbar.texturePresets,
      selectedTexturePresetIndex: state.toolbar.selectedTexturePresetIndex,
      textColor: state.toolbar.textColor,
      backgroundColor: framebuf?.backgroundColor ?? 0,
      textureForceForeground: state.toolbar.textureForceForeground,
      textureDrawMode: state.toolbar.textureDrawMode,
      framebuf,
    };
  },
  (dispatch: any) => ({
    Toolbar: Toolbar.bindDispatch(dispatch),
    dispatch,
  })
)(TextureHeaderControlsInner);

// ========== Connect main panel ==========

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
      texturePresets: state.toolbar.texturePresets,
      selectedTexturePresetIndex: state.toolbar.selectedTexturePresetIndex,
      textureScale: state.toolbar.textureScale,
      textureOutputMode: state.toolbar.textureOutputMode,
      textureForceForeground: state.toolbar.textureForceForeground,
      font, colorPalette,
      textColor: state.toolbar.textColor,
      backgroundColor: framebuf?.backgroundColor ?? 0,
      curScreencode: selectors.getScreencodeWithTransform(selected, font, charTransform),
      currentBrush: state.toolbar.brush,
    };
  },
  (dispatch: any) => ({
    Toolbar: Toolbar.bindDispatch(dispatch),
  })
)(TexturePanel);
