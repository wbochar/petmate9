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
  getSettingsCurrentTedColorPalette,
} from '../redux/settingsSelectors';
import { getActiveTexturePresets, getActivePresetGroup } from '../redux/selectors';
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
import { vdcPalette } from '../utils/palette';
import { buildTexturesExportPixels, getExportFrameSpec } from '../utils/presetExport';

// ---- Style constants (matching dark UI theme) ----

const btnStyle: React.CSSProperties = {
  fontSize: '10px', fontWeight: 'bold', background: 'var(--panel-btn-bg)', color: 'var(--panel-btn-color)',
  border: '1px solid var(--panel-btn-border)', padding: '2px 6px', cursor: 'pointer',
  userSelect: 'none', lineHeight: '14px',
};
const activeBtnStyle: React.CSSProperties = { ...btnStyle, background: 'var(--panel-btn-active-bg)', color: 'var(--panel-btn-active-color)' };

const CELL = 8;
const STRIP_W = 16;
const STRIP_COLS = 8;
const STRIP_ROWS = 2;
const CANVAS_W = STRIP_COLS * CELL; // 64
const CANVAS_H = STRIP_ROWS * CELL; // 16
const PREVIEW_SIZE = 16;

// ---- Helpers ----

/** Fallback black used when a palette lookup returns undefined (can happen
 *  when a preset's colour index points outside the active platform's
 *  palette size, e.g. a C64 preset referenced by a PET screen). */
const RGB_BLACK: Rgb = { r: 0, g: 0, b: 0 };

/** Safe palette lookup — clamp out-of-range color indices to 0, and fall
 *  back to black if even palette[0] is missing. */
function safePalette(palette: Rgb[] | undefined, idx: number | undefined): Rgb {
  if (!palette) return RGB_BLACK;
  const i = idx ?? 0;
  return palette[i] ?? palette[0] ?? RGB_BLACK;
}

function drawCell(
  ctx: CanvasRenderingContext2D, code: number, x: number, y: number,
  font: Font, fg: Rgb | undefined, bg: Rgb | undefined,
) {
  const safeFg = fg ?? RGB_BLACK;
  const safeBg = bg ?? RGB_BLACK;
  const boffs = code * 8;
  const img = ctx.createImageData(CELL, CELL);
  const d = img.data;
  let di = 0;
  for (let row = 0; row < 8; row++) {
    const p = font?.bits?.[boffs + row] ?? 0;
    for (let i = 0; i < 8; i++) {
      const on = (128 >> i) & p;
      d[di] = on ? safeFg.r : safeBg.r;
      d[di + 1] = on ? safeFg.g : safeBg.g;
      d[di + 2] = on ? safeFg.b : safeBg.b;
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
  const bg = safePalette(colorPalette, backgroundColor);
  ctx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  for (let idx = 0; idx < STRIP_W; idx++) {
    const col = idx % STRIP_COLS;
    const row = Math.floor(idx / STRIP_COLS);
    const code = chars[idx] ?? 0x20;
    const fg = safePalette(colorPalette, colors[idx] ?? 14);
    drawCell(ctx, code, col, row, font, fg, bg);
  }

  // Mark unused slots with a visible dashed border per cell
  if (charCount != null && charCount < STRIP_W) {
    // Dim unused area
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    for (let idx = charCount; idx < STRIP_W; idx++) {
      const col = idx % STRIP_COLS;
      const row = Math.floor(idx / STRIP_COLS);
      ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
    }
    // Draw a dashed border around each unused cell so it's visible on any BG
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.6)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    for (let idx = charCount; idx < STRIP_W; idx++) {
      const col = idx % STRIP_COLS;
      const row = Math.floor(idx / STRIP_COLS);
      ctx.strokeRect(col * CELL + 0.5, row * CELL + 0.5, CELL - 1, CELL - 1);
    }
    ctx.setLineDash([]);
  }

  if (selectedCell != null && selectedCell >= 0 && selectedCell < STRIP_W) {
    const selectedCol = selectedCell % STRIP_COLS;
    const selectedRow = Math.floor(selectedCell / STRIP_COLS);
    ctx.strokeStyle = 'rgba(128,255,128,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(selectedCol * CELL + 1, selectedRow * CELL + 1, CELL - 2, CELL - 2);
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

function TextureThumb({ chars, colors, font, colorPalette, backgroundColor, selected = false, forceForeground = false, textColor = 14 }: {
  chars: number[]; colors: number[]; font: Font; colorPalette: Rgb[];
  backgroundColor: number; selected?: boolean; forceForeground?: boolean; textColor?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const effectiveColors = forceForeground ? colors.map(() => textColor) : colors;
    drawCharStripWithColors(ctx, chars, effectiveColors, font, colorPalette, backgroundColor);
  }, [chars, colors, font, colorPalette, backgroundColor, forceForeground, textColor]);

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

function TextureMiniCanvas({ chars, colors, font, colorPalette, textColor, backgroundColor, selectedCell, curScreencode, onCellClick, charCount, forceForeground = false }: {
  chars: number[]; colors: number[]; font: Font; colorPalette: Rgb[];
  textColor: number; backgroundColor: number; selectedCell: number | null;
  curScreencode: number; onCellClick: (col: number) => void; charCount: number; forceForeground?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);

  // Draw the base strip
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const effectiveColors = forceForeground ? colors.map(() => textColor) : colors;
    drawCharStripWithColors(ctx, chars, effectiveColors, font, colorPalette, backgroundColor, selectedCell, charCount);
  }, [chars, colors, font, colorPalette, backgroundColor, selectedCell, charCount, forceForeground, textColor]);

  // Draw hover preview on overlay
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d')!;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (hoverCol === null || hoverCol < 0 || hoverCol >= STRIP_W) return;

    const bg = safePalette(colorPalette, backgroundColor);
    const fg = safePalette(colorPalette, textColor);
    const boffs = curScreencode * 8;
    const img = ctx.createImageData(CELL, CELL);
    const d = img.data;
    let di = 0;
    for (let y = 0; y < 8; y++) {
      const p = font?.bits?.[boffs + y] ?? 0;
      for (let i = 0; i < 8; i++) {
        const on = (128 >> i) & p;
        d[di + 0] = on ? fg.r : bg.r;
        d[di + 1] = on ? fg.g : bg.g;
        d[di + 2] = on ? fg.b : bg.b;
        d[di + 3] = 180;
        di += 4;
      }
    }
    const hoverX = (hoverCol % STRIP_COLS) * CELL;
    const hoverY = Math.floor(hoverCol / STRIP_COLS) * CELL;
    ctx.putImageData(img, hoverX, hoverY);
    // Draw small corner marks instead of a full border to avoid obscuring the character
    const cx = hoverX;
    const cy = hoverY;
    const m = 2; // corner mark length in pixels
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // top-left
    ctx.moveTo(cx + 0.5, cy + m + 0.5); ctx.lineTo(cx + 0.5, cy + 0.5); ctx.lineTo(cx + m + 0.5, cy + 0.5);
    // top-right
    ctx.moveTo(cx + CELL - m - 0.5, cy + 0.5); ctx.lineTo(cx + CELL - 0.5, cy + 0.5); ctx.lineTo(cx + CELL - 0.5, cy + m + 0.5);
    // bottom-left
    ctx.moveTo(cx + 0.5, cy + CELL - m - 0.5); ctx.lineTo(cx + 0.5, cy + CELL - 0.5); ctx.lineTo(cx + m + 0.5, cy + CELL - 0.5);
    // bottom-right
    ctx.moveTo(cx + CELL - m - 0.5, cy + CELL - 0.5); ctx.lineTo(cx + CELL - 0.5, cy + CELL - 0.5); ctx.lineTo(cx + CELL - 0.5, cy + CELL - m - 0.5);
    ctx.stroke();
  }, [hoverCol, curScreencode, font, colorPalette, textColor, backgroundColor, charCount]);

  const colFromEvent = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = canvasRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const col = Math.floor((x / rect.width) * STRIP_COLS);
      const row = Math.floor((y / rect.height) * STRIP_ROWS);
      const idx = row * STRIP_COLS + col;
      return idx >= 0 && idx < STRIP_W ? idx : null;
    },
    []
  );

  return (
    <div
      style={{ position: 'relative', width: '100%', cursor: 'pointer', border: '2px solid #555' }}
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

function TexturePreviewCanvas({ grid, font, colorPalette, backgroundColor, forceForeground = false, textColor = 14, onClick }: {
  grid?: Pixel[][]; font: Font; colorPalette: Rgb[]; backgroundColor: number; forceForeground?: boolean; textColor?: number;
  onClick?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const PX = PREVIEW_SIZE * CELL;

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const bg = safePalette(colorPalette, backgroundColor);
    for (let row = 0; row < PREVIEW_SIZE; row++) {
      for (let col = 0; col < PREVIEW_SIZE; col++) {
        const px = grid?.[row]?.[col] ?? { code: 0x20, color: 14 };
        const cellFg = forceForeground ? safePalette(colorPalette, textColor) : (safePalette(colorPalette, px.color));
        drawCell(ctx, px.code, col, row, font, cellFg, bg);
      }
    }
  }, [grid, font, colorPalette, backgroundColor, forceForeground, textColor]);

  return (
    <canvas ref={canvasRef} width={PX} height={PX} onClick={onClick} style={{
      width: PX, height: PX, imageRendering: 'pixelated', display: 'block',
      cursor: onClick ? 'pointer' : undefined,
    }} />
  );
}

// ---- Scrollable preset list ----

const ROW_H = 34;
const VISIBLE_SLOTS = 4;

function TexturePresetList({ presets, selectedIndex, font, colorPalette, backgroundColor, onSelect, onMove, onDuplicate, onDelete, onFocusName, listRef: externalListRef, forceForeground = false, textColor = 14 }: {
  presets: TexturePreset[]; selectedIndex: number; font: Font; colorPalette: Rgb[];
  backgroundColor: number; onSelect: (i: number) => void; onMove?: (from: number, to: number) => void;
  onDuplicate?: (index: number) => void; onDelete?: (index: number) => void;
  onFocusName?: () => void; listRef?: React.RefObject<HTMLDivElement>; forceForeground?: boolean; textColor?: number;
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
                forceForeground={forceForeground}
                textColor={textColor}
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
  const [editBrushWidth, setEditBrushWidth] = useState<number>(Math.max(1, Math.min(255, preset?.brushWidth ?? 8)));
  const [editBrushHeight, setEditBrushHeight] = useState<number>(Math.max(1, Math.min(255, preset?.brushHeight ?? 8)));
  const [selectedCell, setSelectedCell] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [generatedGrid, setGeneratedGrid] = useState<Pixel[][] | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const presetListRef = useRef<HTMLDivElement>(null);

  // Local undo/redo stack for strip edits (shared via ref so global keyDown can access)
  type EditSnapshot = { chars: number[]; colors: number[] };
  const undoStackRef = useRef<EditSnapshot[]>([]);
  const redoStackRef = useRef<EditSnapshot[]>([]);
  const pushUndo = useCallback(() => {
    undoStackRef.current.push({ chars: [...editChars], colors: [...editColors] });
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    redoStackRef.current = []; // clear redo on new edit
  }, [editChars, editColors]);
  // We need refs to current chars/colors so the undo/redo callbacks
  // can read fresh values without re-creating on every edit.
  const editCharsRef = useRef(editChars);
  const editColorsRef = useRef(editColors);
  editCharsRef.current = editChars;
  editColorsRef.current = editColors;

  const popUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return false;
    const snap = undoStackRef.current.pop()!;
    redoStackRef.current.push({ chars: [...editCharsRef.current], colors: [...editColorsRef.current] });
    setEditChars(snap.chars);
    setEditColors(snap.colors);
    setDirty(true);
    return true;
  }, []);
  const popRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return false;
    const snap = redoStackRef.current.pop()!;
    undoStackRef.current.push({ chars: [...editCharsRef.current], colors: [...editColorsRef.current] });
    setEditChars(snap.chars);
    setEditColors(snap.colors);
    setDirty(true);
    return true;
  }, []);

  const clearUndoStack = useCallback(() => { undoStackRef.current = []; }, []);
  const clearRedoStack = useCallback(() => { redoStackRef.current = []; }, []);

  // Expose undo/redo on stable globals so the menu handler can call them
  useEffect(() => {
    (window as any).__texturePopUndo = popUndo;
    (window as any).__texturePopRedo = popRedo;
    (window as any).__textureClearUndo = clearUndoStack;
    (window as any).__textureClearRedo = clearRedoStack;
    return () => {
      delete (window as any).__texturePopUndo;
      delete (window as any).__texturePopRedo;
      delete (window as any).__textureClearUndo;
      delete (window as any).__textureClearRedo;
    };
  }, [popUndo, popRedo, clearUndoStack, clearRedoStack]);

  // Sync local state when selected preset changes
  useEffect(() => {
    if (preset) {
      setEditName(preset.name);
      setEditChars([...preset.chars]);
      setEditColors([...preset.colors]);
      setEditOptions(preset.options ? [...preset.options] : [...DEFAULT_TEXTURE_OPTIONS]);
      setEditRandom(preset.random ?? false);
      setEditBrushWidth(Math.max(1, Math.min(255, preset.brushWidth ?? 8)));
      setEditBrushHeight(Math.max(1, Math.min(255, preset.brushHeight ?? 8)));
      setSelectedCell(null);
      setDirty(false);
      undoStackRef.current = [];
      redoStackRef.current = [];
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

  // Build a grid from a char/color strip + current options.
  // w/h default to PREVIEW_SIZE (16) for the preview; brush/fill output uses preset brush dimensions.
  const buildGrid = useCallback((chars: number[], colors: number[], w: number = PREVIEW_SIZE, h: number = PREVIEW_SIZE): Pixel[][] => {
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
    for (let row = 0; row < h; row++) {
      const rowPixels: Pixel[] = [];
      for (let col = 0; col < w; col++) {
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

  // Auto-apply output whenever grid, output mode, brush dims, or force-fg changes.
  // The brush/fill output uses the user's W×H dimensions, not the fixed 16×16 preview.
  useEffect(() => {
    if (!generatedGrid) return;
    if (textureOutputMode === 'brush') {
      const brushGrid = buildGrid(editChars, editColors, editBrushWidth, editBrushHeight);
      const output = applyForceFg(brushGrid);
      tb.setBrush({
        framebuf: output,
        brushRegion: { min: { row: 0, col: 0 }, max: { row: editBrushHeight - 1, col: editBrushWidth - 1 } },
      });
    } else if (textureOutputMode === 'fill') {
      const fillGrid = buildGrid(editChars, editColors, editBrushWidth, editBrushHeight);
      tb.fillTexture(applyForceFg(fillGrid));
    }
  }, [generatedGrid, textureOutputMode, textureForceForeground, editBrushWidth, editBrushHeight, textColor, tb, applyForceFg, buildGrid, editChars, editColors]);

  // ---- Cell editing ----

  const handleCellClick = useCallback((col: number) => {
    pushUndo();
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
  }, [curScreencode, textColor, editChars.length, pushUndo]);

  const handleAdd = useCallback(() => {
    if (editChars.length >= STRIP_W) return;
    pushUndo();
    setEditChars(prev => [...prev, 0x20]);
    setEditColors(prev => [...prev, 14]);
    setDirty(true);
  }, [editChars.length, pushUndo]);

  const handleRemove = useCallback(() => {
    if (editChars.length <= 1) return;
    pushUndo();
    setEditChars(prev => prev.slice(0, -1));
    setEditColors(prev => prev.slice(0, -1));
    setSelectedCell(prev => prev !== null && prev >= editChars.length - 1 ? null : prev);
    setDirty(true);
  }, [editChars.length, pushUndo]);

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
      brushWidth: Math.max(1, Math.min(255, src.brushWidth ?? 8)),
      brushHeight: Math.max(1, Math.min(255, src.brushHeight ?? 8)),
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
      brushWidth: editBrushWidth, brushHeight: editBrushHeight,
    });
    setDirty(false);
    // Refocus the preset list after saving
    setTimeout(focusPresetList, 0);
  }, [tb, selectedTexturePresetIndex, preset, editName, editChars, editColors, editOptions, editRandom, editBrushWidth, editBrushHeight, focusPresetList]);

  // ---- Options / output toggles ----

  const handleToggleOption = useCallback((idx: number) => {
    setEditOptions(prev => {
      const n = [...prev]; n[idx] = !n[idx];
      if (preset) {
        tb.updateTexturePreset(selectedTexturePresetIndex, {
          ...preset, name: editName, chars: [...editChars], colors: [...editColors], options: n, random: editRandom,
          brushWidth: editBrushWidth, brushHeight: editBrushHeight,
        });
      }
      return n;
    });
  }, [preset, tb, selectedTexturePresetIndex, editName, editChars, editColors, editRandom, editBrushWidth, editBrushHeight]);

  const handleToggleRandom = useCallback(() => {
    setEditRandom(prev => {
      const n = !prev;
      if (preset) {
        tb.updateTexturePreset(selectedTexturePresetIndex, {
          ...preset, name: editName, chars: [...editChars], colors: [...editColors], options: [...editOptions], random: n,
          brushWidth: editBrushWidth, brushHeight: editBrushHeight,
        });
      }
      return n;
    });
  }, [preset, tb, selectedTexturePresetIndex, editName, editChars, editColors, editOptions, editBrushWidth, editBrushHeight]);

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
            forceForeground={textureForceForeground}
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '9px', color: 'var(--panel-label-color)' }}>
        <span>H:</span>
        <SmallBtn label="-" onClick={() => { setEditBrushHeight(h => { const n = Math.max(1, h - 1); setDirty(true); return n; }); }} title="Decrease texture brush height" width={16} />
        <div style={{ minWidth: '20px', textAlign: 'center', border: '1px solid var(--panel-btn-border)', background: 'var(--panel-btn-bg)', color: 'var(--panel-btn-color)', lineHeight: '14px', height: '16px' }}>{editBrushHeight}</div>
        <SmallBtn label="+" onClick={() => { setEditBrushHeight(h => { const n = Math.min(255, h + 1); setDirty(true); return n; }); }} title="Increase texture brush height" width={16} />
        <span style={{ marginLeft: '6px' }}>W:</span>
        <SmallBtn label="-" onClick={() => { setEditBrushWidth(w => { const n = Math.max(1, w - 1); setDirty(true); return n; }); }} title="Decrease texture brush width" width={16} />
        <div style={{ minWidth: '20px', textAlign: 'center', border: '1px solid var(--panel-btn-border)', background: 'var(--panel-btn-bg)', color: 'var(--panel-btn-color)', lineHeight: '14px', height: '16px' }}>{editBrushWidth}</div>
        <SmallBtn label="+" onClick={() => { setEditBrushWidth(w => { const n = Math.min(255, w + 1); setDirty(true); return n; }); }} title="Increase texture brush width" width={16} />
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
          pushUndo();
          const count = Math.min(row.length, STRIP_W);
          setEditChars(row.slice(0, count).map(p => p.code));
          setEditColors(row.slice(0, count).map(p => p.color));
          setSelectedCell(null);
          setDirty(true);
        }} title="Paste first row of current brush into texture charset (max 16)" width={34} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '2px' }}>
          <SmallToggle label="Brush" active={textureOutputMode === 'brush'}
            onClick={() => handleSetOutputMode('brush')} title={`Auto-set as ${editBrushWidth}×${editBrushHeight} brush`} width={36} />
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
            forceForeground={textureForceForeground}
            textColor={textColor}
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
            forceForeground={textureForceForeground} textColor={textColor}
            onClick={() => setGeneratedGrid(buildGrid(editChars, editColors))}
          />
        </div>
      </div>
    </div>
  );
}

// ========== Header controls (for CollapsiblePanel header) ==========

function TextureHeaderControlsInner({
  texturePresets, selectedTexturePresetIndex, textColor, backgroundColor,
  textureForceForeground, textureDrawMode, textureOutputMode,
  framebuf: currentFramebuf, activeGroup,
  Toolbar: toolbarActions, dispatch,
}: {
  texturePresets: TexturePreset[]; selectedTexturePresetIndex: number;
  textColor: number; backgroundColor: number;
  textureForceForeground: boolean;
  textureDrawMode: boolean;
  textureOutputMode: 'brush' | 'fill' | 'none';
  framebuf: FramebufType | null;
  activeGroup: string;
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
    const brushWidth = Math.max(1, Math.min(255, preset?.brushWidth ?? 8));
    const brushHeight = Math.max(1, Math.min(255, preset?.brushHeight ?? 8));
    toolbarActions.addTexturePreset({ name, chars, colors, options, random, brushWidth, brushHeight });
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
    // Disable fill mode before creating the export screen so the
    // auto-apply effect doesn't overwrite the exported data.
    if (textureOutputMode === 'fill') {
      toolbarActions.setTextureOutputMode('none');
    }
    // Platform-matched host frame so the exported screen renders with the
    // correct ROM font + palette for the preset group.
    const spec = getExportFrameSpec(activeGroup);
    const isC64 = activeGroup === 'c64';
    // Non-C64 exports clamp cell colours to spec.textColor so PET (mono) and
    // TED/VIC/VDC frames don't end up with black-on-black cells.
    const exportFg = isC64 ? textColor : spec.textColor;
    // Pad pixel rows out to spec.width so wide host frames (80-col VDC)
    // don't leave undefined cells past the canonical 24 export columns.
    const fbPixels = buildTexturesExportPixels(texturePresets, activeGroup, exportFg, spec.width, !isC64);
    const frameBg = isC64 ? backgroundColor : spec.backgroundColor;
    dispatch(Screens.actions.addScreenAndFramebuf());
    dispatch((innerDispatch: any, getState: any) => {
      const state = getState();
      const newIdx = screensSelectors.getCurrentScreenFramebufIndex(state);
      if (newIdx === null) return;
      innerDispatch(Framebuffer.actions.setFields({ backgroundColor: frameBg, borderColor: frameBg, borderOn: false, name: 'Textures_' + newIdx }, newIdx));
      innerDispatch(Framebuffer.actions.setCharset(spec.charset, newIdx));
      innerDispatch(Framebuffer.actions.setDims({ width: spec.width, height: fbPixels.length }, newIdx));
      innerDispatch(Framebuffer.actions.setFields({ framebuf: fbPixels }, newIdx));
      innerDispatch(Toolbar.actions.setZoom(102, 'left'));
    });
  }, [texturePresets, textColor, backgroundColor, textureOutputMode, toolbarActions, activeGroup, dispatch]);

  const handleImport = useCallback(() => {
    if (!currentFramebuf) return;
    if (!currentFramebuf.name?.startsWith('Textures_')) return;
    const fbW = currentFramebuf.width;
    const BLANK = 0x20;
    const imported: TexturePreset[] = [];
    const KNOWN_GROUPS = new Set(['c64', 'vic20', 'pet', 'c128vdc', 'c16']);
    let importedGroup: string | null = null;
    /** Attempt to decode the platform group key embedded in an options row at
     *  cols 10..15. Returns null when no known group is present (e.g. legacy
     *  exports that didn't write one). */
    const decodeGroupKey = (codes: number[]): string | null => {
      if (codes.length < 16) return null;
      let gk = '';
      for (let i = 10; i < 16; i++) {
        const c = codes[i];
        if (c >= 0x20 && c < 0x7F) gk += String.fromCharCode(c);
      }
      gk = gk.trim();
      return KNOWN_GROUPS.has(gk) ? gk : null;
    };
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
        let brushWidth = 8;
        let brushHeight = 8;
        if (r + 1 < currentFramebuf.height) {
          const nextRow = currentFramebuf.framebuf[r + 1];
          const nextCodes = nextRow.slice(0, fbW).map((p: Pixel) => p.code);
          if (nextCodes[6] === OPTS_MARKER) {
            options = [nextCodes[0] === 1, nextCodes[1] === 1, nextCodes[2] === 1, nextCodes[3] === 1, nextCodes[4] === 1, nextCodes[5] === 1];
            random = nextCodes[7] === 1;
            brushWidth = Math.max(1, Math.min(255, nextCodes[8] || 8));
            brushHeight = Math.max(1, Math.min(255, nextCodes[9] || 8));
            if (importedGroup === null) importedGroup = decodeGroupKey(nextCodes);
            r++;
          }
        }
        imported.push({ name: name || `Texture ${imported.length + 1}`, chars, colors, options, random, brushWidth, brushHeight });
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
        let brushWidth = 8;
        let brushHeight = 8;
        if (r + 1 < currentFramebuf.height) {
          const nextRow = currentFramebuf.framebuf[r + 1];
          const nextCodes = nextRow.slice(0, fbW).map((p: Pixel) => p.code);
          if (nextCodes[6] === OPTS_MARKER) {
            options = [nextCodes[0] === 1, nextCodes[1] === 1, nextCodes[2] === 1, nextCodes[3] === 1, nextCodes[4] === 1, nextCodes[5] === 1];
            random = nextCodes[7] === 1;
            brushWidth = Math.max(1, Math.min(255, nextCodes[8] || 8));
            brushHeight = Math.max(1, Math.min(255, nextCodes[9] || 8));
          }
        }
        imported.push({ name, chars, colors, options, random, brushWidth, brushHeight });
        r++;
      }
    }
    if (imported.length > 0) {
      const targetGroup = importedGroup ?? activeGroup;
      const mergeMode = window.confirm(
        'Texture preset bulk load:\nOK = merge with current presets.\nCancel = replace current presets (duplicates removed).'
      );
      const existing = targetGroup === activeGroup ? texturePresets : [];
      const dedupe = (items: TexturePreset[]) => {
        const seen = new Set<string>();
        const out: TexturePreset[] = [];
        for (const item of items) {
          const key = JSON.stringify(item);
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(item);
        }
        return out;
      };
      const next = dedupe(mergeMode ? [...existing, ...imported] : imported);
      dispatch(Toolbar.actions.setTexturePresetsForGroup(targetGroup, next));
      if (targetGroup === activeGroup) {
        toolbarActions.setSelectedTexturePresetIndex(0);
      }
    }
  }, [currentFramebuf, toolbarActions, activeGroup, dispatch, texturePresets]);


  return (
    <>
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
      texturePresets: getActiveTexturePresets(state),
      selectedTexturePresetIndex: state.toolbar.selectedTexturePresetIndex,
      textColor: state.toolbar.textColor,
      backgroundColor: framebuf?.backgroundColor ?? 0,
      textureForceForeground: state.toolbar.textureForceForeground,
      textureDrawMode: state.toolbar.textureDrawMode,
      textureOutputMode: state.toolbar.textureOutputMode,
      framebuf,
      activeGroup: getActivePresetGroup(state),
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
    const width = framebuf?.width ?? 40;
    let colorPalette: Rgb[];
    if (prefix === 'c16') colorPalette = getSettingsCurrentTedColorPalette(state);
    else if (prefix === 'vic') colorPalette = getSettingsCurrentVic20ColorPalette(state);
    else if (prefix === 'pet') colorPalette = getSettingsCurrentPetColorPalette(state);
    else if (prefix === 'c12' && width >= 80) colorPalette = vdcPalette;
    else colorPalette = getSettingsCurrentColorPalette(state);
    const selected = state.toolbar.selectedChar;
    const charTransform = state.toolbar.charTransform;
    return {
      texturePresets: getActiveTexturePresets(state),
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
