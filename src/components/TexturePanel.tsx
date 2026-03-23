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
} from '../redux/types';

// ---- Style constants (matching dark UI theme) ----

const btnStyle: React.CSSProperties = {
  fontSize: '10px', fontWeight: 'bold', background: '#333', color: '#aaa',
  border: '1px solid #555', padding: '1px 5px', cursor: 'pointer',
  userSelect: 'none', lineHeight: '14px',
};
const activeBtnStyle: React.CSSProperties = { ...btnStyle, background: '#555', color: '#fff' };

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
      border: '1px solid #555', cursor: 'pointer', userSelect: 'none', flexShrink: 0,
      background: active ? '#446' : '#333', color: active ? '#adf' : '#888',
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
      border: '1px solid #555', cursor: 'pointer', userSelect: 'none', flexShrink: 0,
      background: '#333', color: '#888',
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

// ---- 16×16 Texture Preview Canvas ----

function TexturePreviewCanvas({ chars, colors, font, colorPalette, backgroundColor, scale = 1 }: {
  chars: number[]; colors: number[]; font: Font; colorPalette: Rgb[];
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
        const code = chars[col] ?? 0x20;
        const fg = colorPalette[colors[col] ?? 14];
        drawCell(ctx, code, col, row, font, fg, bg);
      }
    }
  }, [chars, colors, font, colorPalette, backgroundColor]);

  return (
    <canvas ref={canvasRef} width={PX_W} height={PX_H} style={{
      width: PX_W * scale, height: PX_H * scale, imageRendering: 'pixelated', display: 'block',
    }} />
  );
}

// ========== Preset Dropdown (exported for CollapsiblePanel header) ==========

function TexturePresetDropdownInner({ texturePresets, selectedTexturePresetIndex, Toolbar: tb }: {
  texturePresets: TexturePreset[]; selectedTexturePresetIndex: number;
  Toolbar: ReturnType<typeof Toolbar.bindDispatch>;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const current = texturePresets[selectedTexturePresetIndex];

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger */}
      <div onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        style={{ cursor: 'pointer', border: '1px solid #555', display: 'flex', alignItems: 'center', gap: '4px', padding: '0px 4px', background: '#333', height: '18px', boxSizing: 'border-box' }}>
        <span style={{ fontSize: '9px', color: '#ccc', whiteSpace: 'nowrap', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {current?.name ?? 'Preset'}
        </span>
        <span style={{ fontSize: '7px', color: '#aaa', lineHeight: 1 }}>▼</span>
      </div>
      {/* Popup list */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, zIndex: 100,
          background: '#2a2a2a', border: '1px solid #555', maxHeight: 160, overflowY: 'auto',
          boxShadow: '0 2px 8px rgba(0,0,0,0.5)', width: '120px',
        }}>
          {texturePresets.map((p, i) => (
            <div key={i}
              onClick={(e) => { e.stopPropagation(); tb.setSelectedTexturePresetIndex(i); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 6px',
                cursor: 'pointer', background: i === selectedTexturePresetIndex ? '#444' : 'transparent',
                borderBottom: '1px solid #333',
              }}
              onMouseEnter={(e) => { if (i !== selectedTexturePresetIndex) (e.currentTarget as HTMLDivElement).style.background = '#3a3a3a'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = i === selectedTexturePresetIndex ? '#444' : 'transparent'; }}
            >
              <span style={{ fontSize: '9px', color: '#ccc', whiteSpace: 'nowrap' }}>
                {p.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const TexturePresetDropdown = connect(
  (state: RootState) => ({
    texturePresets: state.toolbar.texturePresets,
    selectedTexturePresetIndex: state.toolbar.selectedTexturePresetIndex,
  }),
  (dispatch: any) => ({ Toolbar: Toolbar.bindDispatch(dispatch) })
)(TexturePresetDropdownInner);

// ========== Main TexturePanel ==========

interface TexturePanelStateProps {
  texturePresets: TexturePreset[];
  selectedTexturePresetIndex: number;
  textureRandomColor: boolean;
  textureOptions: boolean[];
  font: Font;
  colorPalette: Rgb[];
  textColor: number;
  backgroundColor: number;
  curScreencode: number;
}

interface TexturePanelDispatchProps {
  Toolbar: ReturnType<typeof Toolbar.bindDispatch>;
}

type TexturePanelProps = TexturePanelStateProps & TexturePanelDispatchProps;

function TexturePanel({
  texturePresets, selectedTexturePresetIndex, textureRandomColor, textureOptions,
  font, colorPalette, textColor, backgroundColor, curScreencode,
  Toolbar: tb,
}: TexturePanelProps) {
  const preset = texturePresets[selectedTexturePresetIndex];
  const [editChars, setEditChars] = useState<number[]>(preset ? [...preset.chars] : Array(16).fill(0x20));
  const [editColors, setEditColors] = useState<number[]>(preset ? [...preset.colors] : Array(16).fill(14));
  const [editName, setEditName] = useState(preset?.name ?? '');
  const [selectedCell, setSelectedCell] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  // Sync local state when selected preset changes
  useEffect(() => {
    if (preset) {
      setEditChars([...preset.chars]);
      setEditColors([...preset.colors]);
      setEditName(preset.name);
      setSelectedCell(null);
      setDirty(false);
    }
  }, [selectedTexturePresetIndex, preset]);

  const inputFocus = useCallback(() => tb.setShortcutsActive(false), [tb]);
  const inputBlur = useCallback(() => tb.setShortcutsActive(true), [tb]);

  // Cell click: place current char+color into texture entry
  const handleCellClick = useCallback((col: number) => {
    setSelectedCell(col);
    setEditChars(prev => { const n = [...prev]; n[col] = curScreencode; return n; });
    setEditColors(prev => { const n = [...prev]; n[col] = textColor; return n; });
    setDirty(true);
  }, [curScreencode, textColor]);

  // Random char: fill all 16 cells with random screencodes (0x00–0xFF)
  // If random color mode (C) is active, also randomize colors (0–15)
  const handleRandomChars = useCallback(() => {
    setEditChars(Array.from({ length: 16 }, () => Math.floor(Math.random() * 256)));
    if (textureRandomColor) {
      setEditColors(Array.from({ length: 16 }, () => Math.floor(Math.random() * 16)));
    }
    setDirty(true);
  }, [textureRandomColor]);

  // Toggle random color mode
  const handleToggleRandomColor = useCallback(() => {
    tb.setTextureRandomColor(!textureRandomColor);
  }, [tb, textureRandomColor]);

  // Clear: reset all cells to space/current color
  const handleClear = useCallback(() => {
    setEditChars(Array(16).fill(0x20));
    setEditColors(Array(16).fill(textColor));
    setSelectedCell(null);
    setDirty(true);
  }, [textColor]);

  // Save edits back to preset
  const handleSave = useCallback(() => {
    if (!preset) return;
    tb.updateTexturePreset(selectedTexturePresetIndex, {
      name: editName,
      chars: [...editChars],
      colors: [...editColors],
    });
    setDirty(false);
  }, [tb, selectedTexturePresetIndex, preset, editName, editChars, editColors]);

  // Add new preset (duplicate current)
  const handleAdd = useCallback(() => {
    tb.addTexturePreset({
      name: `Texture ${texturePresets.length + 1}`,
      chars: [...editChars],
      colors: [...editColors],
    });
  }, [tb, texturePresets.length, editChars, editColors]);

  // Delete current preset
  const handleDelete = useCallback(() => {
    if (texturePresets.length <= 1) return;
    tb.removeTexturePreset(selectedTexturePresetIndex);
  }, [tb, selectedTexturePresetIndex, texturePresets.length]);

  // Toggle an option flag
  const handleToggleOption = useCallback((idx: number) => {
    const next = [...textureOptions];
    next[idx] = !next[idx];
    tb.setTextureOptions(next);
  }, [tb, textureOptions]);

  // Make Brush: generate a 16×16 brush from the texture line
  const handleMakeBrush = useCallback(() => {
    const pixels: Pixel[][] = [];
    for (let row = 0; row < 16; row++) {
      pixels.push(editChars.map((code, col) => ({ code, color: editColors[col] ?? 14 })));
    }
    tb.setBrush({
      framebuf: pixels,
      brushRegion: { min: { row: 0, col: 0 }, max: { row: 15, col: 15 } },
    });
  }, [editChars, editColors, tb]);

  if (!preset) return null;

  return (
    <div style={{ padding: '0px 2px', display: 'flex', flexDirection: 'column', gap: '1px' }}>
      {/* Preset name + action buttons */}
      <div style={{ display: 'flex', gap: '1px', alignItems: 'center' }}>
        <input type="text" value={editName}
          onChange={(e) => { setEditName(e.target.value); setDirty(true); }}
          onFocus={inputFocus} onBlur={inputBlur}
          style={{ flex: 1, fontSize: '10px', background: '#222', color: '#ccc',
            border: '1px solid #555', padding: '1px 4px', margin: '4px 0' }} />
        <div style={dirty ? activeBtnStyle : { ...btnStyle, opacity: 0.4, cursor: 'default' }}
          onClick={dirty ? handleSave : undefined} title="Save">Save</div>
        <div style={btnStyle} onClick={handleAdd} title="New preset">+</div>
        <div style={texturePresets.length > 1 ? btnStyle : { ...btnStyle, opacity: 0.3, cursor: 'default' }}
          onClick={() => texturePresets.length > 1 && handleDelete()}
          title="Delete">🗑</div>
        <div style={btnStyle} onClick={() => {}} title="Export presets">⭡</div>
        <div style={btnStyle} onClick={() => {}} title="Import presets">⭣</div>
      </div>

      {/* Texture entry row */}
      <TextureEntryCanvas
        chars={editChars} colors={editColors}
        font={font} colorPalette={colorPalette} backgroundColor={backgroundColor}
        selectedCell={selectedCell} onCellClick={handleCellClick}
      />

      {/* R/C/X + Option toggles */}
      <div style={{ display: 'flex', gap: '2px' }}>
        <SmallBtn label="R" onClick={handleRandomChars} title="Random characters" />
        <SmallToggle label="C" active={textureRandomColor} onClick={handleToggleRandomColor} title="Random color mode" />
        <SmallBtn label="X" onClick={handleClear} title="Clear texture" />
        <div style={{ width: '4px' }} />
        {textureOptions.map((active, i) => (
          <SmallToggle key={i} label={`OP${i + 1}`} active={active}
            onClick={() => handleToggleOption(i)} title={`Option ${i + 1}`} width={28} />
        ))}
        <div onClick={handleMakeBrush} title="Generate 16×16 brush from texture" style={{
          fontSize: '9px', fontWeight: 'bold', background: '#346', color: '#adf',
          border: '1px solid #58a', padding: '0px 6px', cursor: 'pointer',
          userSelect: 'none', height: 16, display: 'inline-flex', alignItems: 'center',
          marginLeft: 'auto', flexShrink: 0,
        }}>Make Brush</div>
      </div>

      {/* 16×16 preview */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid #3a3a3a', background: '#1a1a1a', borderRadius: '2px',
        padding: '2px', overflow: 'hidden',
      }}>
        <TexturePreviewCanvas
          chars={editChars} colors={editColors}
          font={font} colorPalette={colorPalette} backgroundColor={backgroundColor}
        />
      </div>
    </div>
  );
}

export default connect(
  (state: RootState) => {
    const framebuf = selectors.getCurrentFramebuf(state);
    const { font } = selectors.getCurrentFramebufFont(state);
    const charset = framebuf?.charset ?? 'upper';
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
      textureRandomColor: state.toolbar.textureRandomColor,
      textureOptions: state.toolbar.textureOptions,
      font, colorPalette,
      textColor: state.toolbar.textColor,
      backgroundColor: framebuf?.backgroundColor ?? 0,
      curScreencode: selectors.getScreencodeWithTransform(selected, font, charTransform),
    };
  },
  (dispatch: any) => ({
    Toolbar: Toolbar.bindDispatch(dispatch),
  })
)(TexturePanel);
