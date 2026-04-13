import React, { useCallback, useRef, useEffect, useState } from 'react';
import { connect } from 'react-redux';

import { Toolbar } from '../redux/toolbar';
import { Framebuffer } from '../redux/editor';
import { CHARSET_UPPER } from '../redux/editor';
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
  BoxPreset,
  BoxSide,
  Framebuf as FramebufType,
  TRANSPARENT_SCREENCODE,
} from '../redux/types';
import { generateBox } from '../utils/boxGen';
import { vdcPalette } from '../utils/palette';

// ---- Style constants ----

const btnStyle: React.CSSProperties = {
  fontSize: '10px', fontWeight: 'bold', background: 'var(--panel-btn-bg)', color: 'var(--panel-btn-color)',
  border: '1px solid var(--panel-btn-border)', padding: '1px 5px', cursor: 'pointer',
  userSelect: 'none', lineHeight: '14px',
};
const activeBtnStyle: React.CSSProperties = { ...btnStyle, background: 'var(--panel-btn-active-bg)', color: 'var(--panel-btn-active-color)' };
const inputStyle: React.CSSProperties = {
  width: '28px', fontSize: '9px', background: 'var(--panel-input-bg)', color: 'var(--panel-input-color)',
  border: '1px solid var(--panel-btn-border)', padding: '1px 2px', textAlign: 'center' as const,
};

const CELL = 8;
const PREVIEW_BOX_W = 8;
const PREVIEW_BOX_H = 3;

// ---- Helpers ----

function drawCell(
  ctx: CanvasRenderingContext2D, code: number, x: number, y: number,
  font: Font, fg: Rgb, bg: Rgb, isTransparent: boolean,
) {
  const boffs = code * 8;
  const img = ctx.createImageData(CELL, CELL);
  const d = img.data;
  let di = 0;
  for (let row = 0; row < 8; row++) {
    const p = font.bits[boffs + row];
    for (let i = 0; i < 8; i++) {
      const on = (128 >> i) & p;
      if (isTransparent && !on) {
        const g = ((Math.floor((x*8+i)/4) + Math.floor((y*8+row)/4)) % 2) === 0 ? 40 : 50;
        d[di] = g; d[di+1] = g; d[di+2] = g;
      } else {
        d[di] = on ? fg.r : bg.r; d[di+1] = on ? fg.g : bg.g; d[di+2] = on ? fg.b : bg.b;
      }
      d[di+3] = 255; di += 4;
    }
  }
  ctx.putImageData(img, x * CELL, y * CELL);
}

// ---- CharCell ----

function CharCell({ code, font, fg, bg, selected, onClick, scale = 2 }: {
  code: number; font: Font; fg: Rgb; bg: Rgb; selected: boolean;
  onClick: () => void; scale?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const isT = code === TRANSPARENT_SCREENCODE;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) drawCell(ctx, isT ? 0x20 : code, 0, 0, font, fg, bg, isT);
  }, [code, font, fg, bg, isT]);
  const sz = CELL * scale;
  return (
    <canvas ref={ref} width={CELL} height={CELL} onClick={onClick} style={{
      width: sz, height: sz, imageRendering: 'pixelated', cursor: 'pointer', flexShrink: 0,
      border: selected ? '1px solid rgba(128,255,128,0.8)' : '1px solid #444',
    }} />
  );
}

// ---- BoxPreview ----

function BoxPreview({ preset, previewW, previewH, font, colorPalette, textColor, backgroundColor, scale = 1, selected = false, forceForeground = false }: {
  preset: BoxPreset; previewW: number; previewH: number; font: Font;
  colorPalette: Rgb[]; textColor: number; backgroundColor: number; scale?: number; selected?: boolean; forceForeground?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = Math.max(2, previewW), h = Math.max(2, previewH);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const bg = colorPalette[backgroundColor];
    const px = generateBox(preset, w, h);
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++) {
        const p = px[r][c], isT = p.code === TRANSPARENT_SCREENCODE;
        const cellFg = forceForeground ? colorPalette[textColor] : (colorPalette[p.color] ?? colorPalette[textColor]);
        drawCell(ctx, isT ? 0x20 : p.code, c, r, font, cellFg, bg, isT);
      }
  }, [preset, w, h, font, colorPalette, textColor, backgroundColor, forceForeground]);
  return (
    <canvas ref={ref} width={w*CELL} height={h*CELL} style={{
      width: w*CELL*scale, height: h*CELL*scale, imageRendering: 'pixelated', display: 'block',
      border: selected ? '1px solid #fff' : '1px solid transparent', boxSizing: 'border-box',
    }} />
  );
}

// ---- Small button ----

function SmallBtn({ onClick, children, disabled }: {
  onClick: () => void; children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <div onClick={disabled ? undefined : onClick} style={{
      width: 14, height: 14, fontSize: '8px', fontWeight: 'bold',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--panel-btn-bg)', color: disabled ? 'var(--panel-toggle-off-color)' : 'var(--panel-label-color)',
      border: '1px solid var(--panel-btn-border)', cursor: disabled ? 'default' : 'pointer',
      userSelect: 'none', flexShrink: 0,
    }}>{children}</div>
  );
}

// ---- Toggle button (M/S/R) ----

function Toggle({ label, active, onClick, title }: {
  label: string; active: boolean; onClick: () => void; title?: string;
}) {
  return (
    <div onClick={onClick} title={title} style={{
      width: 14, height: 14, fontSize: '8px', fontWeight: 'bold',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      border: '1px solid var(--panel-btn-border)', cursor: 'pointer', userSelect: 'none', flexShrink: 0,
      background: active ? 'var(--panel-toggle-on-bg)' : 'var(--panel-toggle-off-bg)', color: active ? 'var(--panel-toggle-on-color)' : 'var(--panel-toggle-off-color)',
    }}>{label}</div>
  );
}

// ---- Repeat-char-type toggle ----

function RepeatCharToggle({ value, onClick }: {
  value: 'start' | 'end' | 'all' | 'none'; onClick: () => void;
}) {
  const cfgs: Record<string, { bg: string; color: string; label: string }> = {
    none:  { bg: 'var(--panel-toggle-off-bg)', color: 'var(--panel-toggle-off-color)', label: '·' },
    start: { bg: '#354', color: '#8e8', label: 'S' },
    end:   { bg: '#543', color: '#fc8', label: 'E' },
    all:   { bg: 'var(--panel-toggle-on-bg)', color: 'var(--panel-toggle-on-color)', label: 'A' },
  };
  const c = cfgs[value];
  return (
    <div onClick={onClick} title={`Repeat char: ${value === 'none' ? 'off' : value}`} style={{
      width: 14, height: 14, fontSize: '8px', fontWeight: 'bold',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      border: '1px solid var(--panel-btn-border)', cursor: 'pointer', userSelect: 'none', flexShrink: 0,
      background: c.bg, color: c.color,
    }}>{c.label}</div>
  );
}

// ---- Mode toggles: M R S [D] ----

function ModeToggles({ side, onToggle, vertical, reversed }: {
  side: BoxSide; onToggle: (field: string) => void;
  vertical?: boolean; reversed?: boolean;
}) {
  const items = [
    <Toggle key="M" label="M" active={side.mirror} onClick={() => onToggle('mirror')} title="Mirror" />,
    <Toggle key="R" label="R" active={side.repeat} onClick={() => onToggle('repeat')} title="Repeat" />,
    <Toggle key="S" label="S" active={side.stretch} onClick={() => onToggle('stretch')} title="Stretch" />,
    <RepeatCharToggle key="D" value={side.startEnd} onClick={() => onToggle('startEnd')} />,
  ];
  if (reversed) items.reverse();
  return (
    <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: '1px' }}>
      {items}
    </div>
  );
}

// ========== Header controls: +, Export, Import, Trash ==========

function BoxesHeaderControlsInner({
  boxPresets, selectedBoxPresetIndex, textColor, backgroundColor,
  boxDrawMode, boxForceForeground, framebuf: currentFramebuf, Toolbar: tb, dispatch,
}: {
  boxPresets: BoxPreset[]; selectedBoxPresetIndex: number;
  textColor: number; backgroundColor: number;
  boxDrawMode: boolean;
  boxForceForeground: boolean;
  framebuf: FramebufType | null;
  Toolbar: ReturnType<typeof Toolbar.bindDispatch>;
  dispatch: any;
}) {
  const preset = boxPresets[selectedBoxPresetIndex];

  const handleAdd = useCallback(() => {
    const defaultSide = (chars: number[]): BoxSide => ({
      chars, colors: chars.map(() => 14),
      mirror: false, stretch: false, repeat: true, startEnd: 'none',
    });
    const name = `Box ${boxPresets.length + 1}`;
    const base: BoxPreset = preset ? JSON.parse(JSON.stringify(preset)) : {
      name, corners: [0x55, 0x49, 0x4A, 0x4B], cornerColors: [14, 14, 14, 14],
      top: defaultSide([0x43]), bottom: defaultSide([0x43]),
      left: defaultSide([0x42]), right: defaultSide([0x42]),
      fill: TRANSPARENT_SCREENCODE, fillColor: 14,
    };
    tb.addBoxPreset({ ...base, name });
  }, [tb, boxPresets.length, preset]);

  const handleDelete = useCallback(() => {
    if (boxPresets.length <= 1) return;
    tb.removeBoxPreset(selectedBoxPresetIndex);
  }, [tb, selectedBoxPresetIndex, boxPresets.length]);

  // Encode helpers (duplicated from panel for header independence)
  const encodeName = (name: string): number[] => {
    const row = Array(16).fill(0x20);
    for (let i = 0; i < Math.min(name.length, 16); i++) {
      const ch = name.charCodeAt(i);
      if (ch >= 65 && ch <= 90) row[i] = ch - 64;
      else if (ch >= 97 && ch <= 122) row[i] = ch - 96;
      else if (ch >= 48 && ch <= 57) row[i] = ch - 48 + 0x30;
      else row[i] = 0x20;
    }
    return row;
  };
  const encodeSide = (side: BoxSide): { codes: number[]; colors: number[] } => {
    const codes = Array(16).fill(0x20); const colors = Array(16).fill(0);
    codes[0] = side.chars.length;
    for (let i = 0; i < side.chars.length; i++) { codes[1+i] = side.chars[i]; colors[1+i] = side.colors[i] ?? 0; }
    codes[5] = side.mirror?1:0; codes[6] = side.stretch?1:0; codes[7] = side.repeat?1:0;
    codes[8] = side.startEnd==='start'?1:side.startEnd==='end'?2:side.startEnd==='all'?3:0;
    return { codes, colors };
  };
  const decodeName = (row: number[]): string => {
    let name = '';
    for (let i = 0; i < 16; i++) {
      const c = row[i];
      if (c >= 1 && c <= 26) name += String.fromCharCode(c + 64);
      else if (c >= 0x30 && c <= 0x39) name += String.fromCharCode(c - 0x30 + 48);
      else if (c === 0x20) name += ' '; else name += '?';
    }
    return name.trimEnd();
  };
  const decodeSide = (codeRow: number[], colorRow: number[]): BoxSide => {
    const count = Math.min(4, Math.max(1, codeRow[0]));
    const chars: number[] = []; const colors: number[] = [];
    for (let i = 0; i < count; i++) { chars.push(codeRow[1+i]??0x20); colors.push(colorRow[1+i]??14); }
    const seMap: Record<number,'start'|'end'|'all'|'none'> = {1:'start',2:'end',3:'all'};
    return { chars, colors, mirror:codeRow[5]===1, stretch:codeRow[6]===1, repeat:codeRow[7]===1, startEnd:seMap[codeRow[8]]??'none' };
  };

  const handleExport = useCallback(() => {
    const BLANK = 0x20;
    const totalRows = boxPresets.length * 7 + 20;
    const fbPixels: Pixel[][] = [];
    for (const p of boxPresets) {
      const hdr = Array(16).fill(BLANK);
      for (let i = 0; i < 4; i++) hdr[i] = p.corners[i];
      hdr[4] = p.fill === TRANSPARENT_SCREENCODE ? 0xFF : p.fill; hdr[5] = 0xBB;
      const hdrColors = Array(16).fill(0);
      for (let i = 0; i < 4; i++) hdrColors[i] = p.cornerColors[i] ?? 14;
      hdrColors[4] = p.fillColor ?? 14;
      fbPixels.push(hdr.map((code, ci) => ({ code, color: hdrColors[ci] } as Pixel)));
      fbPixels.push(encodeName(p.name).map(code => ({ code, color: textColor })));
      for (const side of [p.top, p.bottom, p.left, p.right]) {
        const enc = encodeSide(side);
        fbPixels.push(enc.codes.map((code, ci) => ({ code, color: enc.colors[ci] })));
      }
      fbPixels.push(Array(16).fill({ code: BLANK, color: textColor }));
    }
    for (let i = 0; i < 20; i++) fbPixels.push(Array(16).fill({ code: BLANK, color: textColor }));
    dispatch(Screens.actions.addScreenAndFramebuf());
    dispatch((innerDispatch: any, getState: any) => {
      const state = getState();
      const newIdx = screensSelectors.getCurrentScreenFramebufIndex(state);
      if (newIdx === null) return;
      innerDispatch(Framebuffer.actions.setFields({ backgroundColor, borderColor: backgroundColor, borderOn: false, name: 'Boxes_' + newIdx }, newIdx));
      innerDispatch(Framebuffer.actions.setCharset(CHARSET_UPPER, newIdx));
      innerDispatch(Framebuffer.actions.setDims({ width: 16, height: totalRows }, newIdx));
      innerDispatch(Framebuffer.actions.setFields({ framebuf: fbPixels }, newIdx));
      innerDispatch(Toolbar.actions.setZoom(102, 'left'));
    });
  }, [boxPresets, textColor, backgroundColor, dispatch]);

  const handleImport = useCallback(() => {
    if (!currentFramebuf || currentFramebuf.width < 16) return;
    if (!currentFramebuf.name?.startsWith('Boxes_')) return;
    const fb = currentFramebuf.framebuf;
    const imported: BoxPreset[] = [];
    let r = 0;
    while (r + 5 < fb.length) {
      const hdrCodes = fb[r].slice(0,16).map((p: Pixel) => p.code);
      const hdrColors = fb[r].slice(0,16).map((p: Pixel) => p.color);
      if (hdrCodes[5] !== 0xBB) { r++; continue; }
      const corners = [hdrCodes[0],hdrCodes[1],hdrCodes[2],hdrCodes[3]];
      const cornerColors = [hdrColors[0],hdrColors[1],hdrColors[2],hdrColors[3]];
      const fill = hdrCodes[4]===0xFF ? TRANSPARENT_SCREENCODE : hdrCodes[4];
      const fillColor = hdrColors[4]??14;
      const name = decodeName(fb[r+1].slice(0,16).map((p: Pixel)=>p.code));
      const rc = (row: number) => fb[r+row].slice(0,16);
      const top = decodeSide(rc(2).map((p: Pixel)=>p.code), rc(2).map((p: Pixel)=>p.color));
      const bottom = decodeSide(rc(3).map((p: Pixel)=>p.code), rc(3).map((p: Pixel)=>p.color));
      const left = decodeSide(rc(4).map((p: Pixel)=>p.code), rc(4).map((p: Pixel)=>p.color));
      const right = decodeSide(rc(5).map((p: Pixel)=>p.code), rc(5).map((p: Pixel)=>p.color));
      imported.push({ name: name||`Box ${imported.length+1}`, corners, cornerColors, top, bottom, left, right, fill, fillColor });
      r += 7;
    }
    if (imported.length > 0) { tb.setBoxPresets(imported); tb.setSelectedBoxPresetIndex(0); }
  }, [currentFramebuf, tb]);

  const [boxW, setBoxW] = useState('16');
  const [boxH, setBoxH] = useState('16');
  const inputFocus = useCallback(() => tb.setShortcutsActive(false), [tb]);
  const inputBlur = useCallback(() => tb.setShortcutsActive(true), [tb]);

  return (
    <>
      <input type="text" value={boxW}
        onFocus={(e) => { (e.target as HTMLInputElement).select(); inputFocus(); }}
        onBlur={(e) => { setBoxW(String(Math.max(2, Number(e.target.value) || 16))); inputBlur(); }}
        onChange={(e) => setBoxW(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        style={{ width: '30px', fontSize: '9px', background: 'var(--panel-input-bg)', color: 'var(--panel-input-color)',
          border: '1px solid var(--panel-btn-border)', padding: '1px 1px', textAlign: 'center' as const, marginRight: 0 }}
        title="Box width" /><span style={{ fontSize: '7px', color: 'var(--panel-toggle-off-color)', margin: '0' }}>{"\u00D7"}</span><input type="text" value={boxH}
        onFocus={(e) => { (e.target as HTMLInputElement).select(); inputFocus(); }}
        onBlur={(e) => { setBoxH(String(Math.max(2, Number(e.target.value) || 16))); inputBlur(); }}
        onChange={(e) => setBoxH(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        style={{ width: '30px', fontSize: '9px', background: 'var(--panel-input-bg)', color: 'var(--panel-input-color)',
          border: '1px solid var(--panel-btn-border)', padding: '1px 1px', textAlign: 'center' as const, marginLeft: 0 }}
        title="Box height" />
      <div style={{...btnStyle, background: boxDrawMode ? '#454' : 'var(--panel-btn-bg)', color: boxDrawMode ? '#fff' : 'var(--panel-btn-color)'}} onClick={() => {
        const next = !boxDrawMode;
        tb.setBoxDrawMode(next);
        if (next) {
          tb.resetBrush();
        }
      }} title={boxDrawMode ? 'Draw mode ON: drag on canvas to draw a box' : 'Draw mode OFF: click preset to stamp with dimensions'}>✎</div>
      <div style={{...btnStyle, background: boxForceForeground ? 'var(--panel-toggle-on-bg)' : 'var(--panel-btn-bg)', color: boxForceForeground ? 'var(--panel-toggle-on-color)' : 'var(--panel-btn-color)'}} onClick={() => {
        tb.setBoxForceForeground(!boxForceForeground);
      }} title={boxForceForeground ? 'Force foreground ON: all box colors use current foreground' : 'Force foreground OFF: use preset colors'}>F</div>
      <div style={btnStyle} onClick={handleAdd} title="New box preset">+</div>
      <div style={btnStyle} onClick={handleExport} title="Export presets to new screen">⭡</div>
      <div style={btnStyle} onClick={handleImport} title="Import presets from current screen">⭣</div>
      <div
        style={boxPresets.length > 1 ? btnStyle : { ...btnStyle, opacity: 0.3, cursor: 'default' }}
        onClick={handleDelete}
        title="Delete preset"
      >
        🗑
      </div>
    </>
  );
}

export const BoxesHeaderControls = connect(
  (state: RootState) => {
    const framebuf = selectors.getCurrentFramebuf(state);
    return {
      boxPresets: state.toolbar.boxPresets,
      selectedBoxPresetIndex: state.toolbar.selectedBoxPresetIndex,
      textColor: state.toolbar.textColor,
      backgroundColor: framebuf?.backgroundColor ?? 0,
      boxDrawMode: state.toolbar.boxDrawMode,
      boxForceForeground: state.toolbar.boxForceForeground,
      framebuf,
    };
  },
  (dispatch: any) => ({ Toolbar: Toolbar.bindDispatch(dispatch), dispatch })
)(BoxesHeaderControlsInner);

// Keep old export name for compatibility
export const BoxesPresetDropdown = BoxesHeaderControls;

// ========== Box preset list (select mode) ==========

const BOX_ROW_H = 54; // 3 chars × 8px × 2 scale + padding
const BOX_VISIBLE_SLOTS = 3;

function BoxPresetList({ presets, selectedIndex, font, colorPalette, textColor, backgroundColor, onSelect, onEditClick, forceForeground = false }: {
  presets: BoxPreset[]; selectedIndex: number;
  font: Font; colorPalette: Rgb[]; textColor: number; backgroundColor: number;
  onSelect: (i: number) => void; onEditClick: (i: number) => void; forceForeground?: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <div ref={listRef} style={{
      maxHeight: BOX_ROW_H * BOX_VISIBLE_SLOTS, overflowY: 'auto',
      border: '1px solid var(--panel-btn-border)', background: 'var(--panel-list-bg)',
    }}>
      {presets.map((p, i) => {
        const isSelected = i === selectedIndex;
        return (
          <div key={i} onClick={() => onSelect(i)} title={p.name} style={{
            display: 'flex', alignItems: 'center', gap: '4px', padding: '0px 2px',
            boxSizing: 'border-box', cursor: 'pointer',
            background: isSelected ? 'var(--panel-list-item-selected)' : 'transparent',
            borderBottom: '1px solid var(--panel-list-border)',
          }}
            onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--panel-list-item-hover)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = isSelected ? 'var(--panel-list-item-selected)' : 'transparent'; }}
          >
            <div onClick={(e) => { e.stopPropagation(); onEditClick(i); }} title="Edit this box preset" style={{
              fontSize: '9px', fontWeight: 'bold', width: 14, height: 14,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--panel-btn-bg)', color: 'var(--panel-btn-color)', border: '1px solid var(--panel-btn-border)',
              cursor: 'pointer', userSelect: 'none', flexShrink: 0,
            }}>E</div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '4px', flex: 1, minWidth: 0,
              border: isSelected ? '1px solid #fff' : '1px solid transparent',
              padding: '1px 2px', boxSizing: 'border-box',
            }}>
              <BoxPreview preset={p} previewW={PREVIEW_BOX_W} previewH={PREVIEW_BOX_H}
                font={font} colorPalette={colorPalette} textColor={textColor}
                backgroundColor={backgroundColor} scale={2} forceForeground={forceForeground} />
              <span style={{ fontSize: '9px', color: isSelected ? 'var(--panel-btn-active-color)' : 'var(--panel-input-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginLeft: '4px' }}>
                {p.name}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ========== Main BoxesPanel ==========

interface BoxesPanelStateProps {
  boxPresets: BoxPreset[]; selectedBoxPresetIndex: number;
  font: Font; colorPalette: Rgb[]; textColor: number;
  backgroundColor: number; curScreencode: number;
  framebuf: FramebufType | null;
  boxDrawMode: boolean;
  boxForceForeground: boolean;
}
interface BoxesPanelDispatchProps {
  Toolbar: ReturnType<typeof Toolbar.bindDispatch>;
  Framebuffer: ReturnType<typeof Framebuffer.bindDispatch>;
  dispatch: any;
}
type BoxesPanelProps = BoxesPanelStateProps & BoxesPanelDispatchProps;

function BoxesPanel({
  boxPresets, selectedBoxPresetIndex, font, colorPalette,
  textColor, backgroundColor, curScreencode, framebuf: currentFramebuf,
  boxDrawMode, boxForceForeground,
  Toolbar: tb, Framebuffer: framebufferActions, dispatch,
}: BoxesPanelProps & { dispatch: any }) {
  // Helper: override all pixel colors with textColor when F toggle is on
  const applyForceFg = useCallback((px: Pixel[][]): Pixel[][] => {
    if (!boxForceForeground) return px;
    return px.map(row => row.map(p => ({ ...p, color: textColor })));
  }, [boxForceForeground, textColor]);
  const preset = boxPresets[selectedBoxPresetIndex];
  const [ep, setEp] = useState<BoxPreset>(preset ? JSON.parse(JSON.stringify(preset)) : boxPresets[0]);
  const [sel, setSel] = useState<{ s: string; i: number } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [boxW, setBoxW] = useState('16');
  const [boxH, setBoxH] = useState('16');
  const boxWn = Math.max(2, Number(boxW) || 16);
  const boxHn = Math.max(2, Number(boxH) || 16);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    if (preset) { setEp(JSON.parse(JSON.stringify(preset))); setSel(null); setDirty(false); }
  }, [selectedBoxPresetIndex, preset]);

  // Auto-generate brush on mount and when F toggle changes
  useEffect(() => {
    if (!boxDrawMode && preset) {
      const px = applyForceFg(generateBox(preset, boxWn, boxHn));
      tb.setBrush({
        framebuf: px,
        brushRegion: { min: { row: 0, col: 0 }, max: { row: px.length - 1, col: px[0].length - 1 } },
      });
    }
  }, [boxForceForeground, boxForceForeground && textColor]); // re-run when F toggle or fg color changes
  const fg = colorPalette[textColor], bg = colorPalette[backgroundColor];
  // When force foreground is on, all cell colors use the current foreground
  const fgOf = (colorIdx: number) => boxForceForeground ? fg : colorPalette[colorIdx ?? textColor];

  const inputFocus = useCallback(() => tb.setShortcutsActive(false), [tb]);
  const inputBlur = useCallback(() => tb.setShortcutsActive(true), [tb]);

  const cellClick = useCallback((section: string, index: number) => {
    setSel({ s: section, i: index });
    setEp(prev => {
      const n = JSON.parse(JSON.stringify(prev)) as BoxPreset;
      if (section === 'corner') {
        n.corners[index] = curScreencode;
        n.cornerColors[index] = textColor;
      } else if (section === 'fill') {
        n.fill = curScreencode;
        n.fillColor = textColor;
      } else {
        const side = n[section as 'top'|'bottom'|'left'|'right'] as BoxSide;
        side.chars[index] = curScreencode;
        side.colors[index] = textColor;
      }
      return n;
    });
    setDirty(true);
  }, [curScreencode, textColor]);

  const toggle = useCallback((sideKey: string, field: string) => {
    setEp(prev => {
      const n = JSON.parse(JSON.stringify(prev)) as BoxPreset;
      const side = n[sideKey as 'top'|'bottom'|'left'|'right'] as BoxSide;
      if (field === 'mirror') side.mirror = !side.mirror;
      else if (field === 'stretch') side.stretch = !side.stretch;
      else if (field === 'repeat') side.repeat = !side.repeat;
      else if (field === 'startEnd') {
        const cycle: Record<string, 'start'|'end'|'all'|'none'> = { none:'start', start:'end', end:'all', all:'none' };
        side.startEnd = cycle[side.startEnd];
      }
      return n;
    });
    setDirty(true);
  }, []);

  const addChar = useCallback((sideKey: string) => {
    setEp(prev => {
      const n = JSON.parse(JSON.stringify(prev)) as BoxPreset;
      const s = n[sideKey as 'top'|'bottom'|'left'|'right'] as BoxSide;
      if (s.chars.length < 4) {
        s.chars.push(s.chars[s.chars.length - 1] ?? 0x20);
        s.colors.push(s.colors[s.colors.length - 1] ?? 14);
      }
      return n;
    });
    setDirty(true);
  }, []);

  const removeChar = useCallback((sideKey: string) => {
    setEp(prev => {
      const n = JSON.parse(JSON.stringify(prev)) as BoxPreset;
      const s = n[sideKey as 'top'|'bottom'|'left'|'right'] as BoxSide;
      if (s.chars.length > 1) { s.chars.pop(); s.colors.pop(); }
      return n;
    });
    setDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!preset) return;
    tb.updateBoxPreset(selectedBoxPresetIndex, { ...ep });
    setDirty(false);
  }, [tb, selectedBoxPresetIndex, preset, ep]);

  const handleUseBrush = useCallback(() => {
    const px = applyForceFg(generateBox(ep, boxWn, boxHn));
    tb.setBrush({
      framebuf: px,
      brushRegion: { min: { row: 0, col: 0 }, max: { row: px.length - 1, col: px[0].length - 1 } },
    });
  }, [ep, boxWn, boxHn, tb, applyForceFg]);

  // Select a preset and auto-generate brush (or reset brush in draw mode)
  const handlePresetSelect = useCallback((index: number) => {
    tb.setSelectedBoxPresetIndex(index);
    if (boxDrawMode) {
      // In pencil draw mode: reset brush so user can draw fresh
      tb.resetBrush();
    } else {
      const p = boxPresets[index];
      if (p) {
        const px = applyForceFg(generateBox(p, boxWn, boxHn));
        tb.setBrush({
          framebuf: px,
          brushRegion: { min: { row: 0, col: 0 }, max: { row: px.length - 1, col: px[0].length - 1 } },
        });
      }
    }
  }, [tb, boxPresets, boxWn, boxHn, boxDrawMode, applyForceFg]);

  // E button: select + enter edit mode
  const handleEditClick = useCallback((index: number) => {
    tb.setSelectedBoxPresetIndex(index);
    setEditMode(true);
  }, [tb]);

  // Done: save if dirty, generate brush, exit edit mode
  const handleDone = useCallback(() => {
    if (dirty && preset) {
      tb.updateBoxPreset(selectedBoxPresetIndex, { ...ep });
      setDirty(false);
    }
    handleUseBrush();
    setEditMode(false);
  }, [dirty, preset, ep, selectedBoxPresetIndex, tb, handleUseBrush]);

  // Encode a string as a row of screencodes (simple ASCII mapping)
  const encodeName = (name: string): number[] => {
    const row = Array(16).fill(0x20);
    for (let i = 0; i < Math.min(name.length, 16); i++) {
      const ch = name.charCodeAt(i);
      if (ch >= 65 && ch <= 90) row[i] = ch - 64;
      else if (ch >= 97 && ch <= 122) row[i] = ch - 96;
      else if (ch >= 48 && ch <= 57) row[i] = ch - 48 + 0x30;
      else row[i] = 0x20;
    }
    return row;
  };

  const decodeName = (row: number[]): string => {
    let name = '';
    for (let i = 0; i < 16; i++) {
      const c = row[i];
      if (c >= 1 && c <= 26) name += String.fromCharCode(c + 64);
      else if (c >= 0x30 && c <= 0x39) name += String.fromCharCode(c - 0x30 + 48);
      else if (c === 0x20) name += ' ';
      else name += '?';
    }
    return name.trimEnd();
  };

  const encodeSide = (side: BoxSide): { codes: number[]; colors: number[] } => {
    const codes = Array(16).fill(0x20);
    const colors = Array(16).fill(0);
    codes[0] = side.chars.length;
    for (let i = 0; i < side.chars.length; i++) { codes[1 + i] = side.chars[i]; colors[1 + i] = side.colors[i] ?? 0; }
    codes[5] = side.mirror ? 1 : 0;
    codes[6] = side.stretch ? 1 : 0;
    codes[7] = side.repeat ? 1 : 0;
    codes[8] = side.startEnd === 'start' ? 1 : side.startEnd === 'end' ? 2 : side.startEnd === 'all' ? 3 : 0;
    return { codes, colors };
  };

  const decodeSide = (codeRow: number[], colorRow: number[]): BoxSide => {
    const count = Math.min(4, Math.max(1, codeRow[0]));
    const chars: number[] = []; const colors: number[] = [];
    for (let i = 0; i < count; i++) { chars.push(codeRow[1 + i] ?? 0x20); colors.push(colorRow[1 + i] ?? 14); }
    const seMap: Record<number, 'start'|'end'|'all'|'none'> = { 1: 'start', 2: 'end', 3: 'all' };
    return {
      chars, colors,
      mirror: codeRow[5] === 1, stretch: codeRow[6] === 1, repeat: codeRow[7] === 1,
      startEnd: seMap[codeRow[8]] ?? 'none',
    };
  };

  const handleExport = useCallback(() => {
    const BLANK = 0x20;
    const ROWS_PER_PRESET = 7;
    const totalRows = boxPresets.length * ROWS_PER_PRESET + 20;
    const fbPixels: Pixel[][] = [];
    for (const p of boxPresets) {
      const hdr = Array(16).fill(BLANK);
      for (let i = 0; i < 4; i++) hdr[i] = p.corners[i];
      hdr[4] = p.fill === TRANSPARENT_SCREENCODE ? 0xFF : p.fill;
      hdr[5] = 0xBB;
      const hdrColors = Array(16).fill(0);
      for (let i = 0; i < 4; i++) hdrColors[i] = p.cornerColors[i] ?? 14;
      hdrColors[4] = p.fillColor ?? 14;
      fbPixels.push(hdr.map((code, ci) => ({ code, color: hdrColors[ci] } as Pixel)));
      fbPixels.push(encodeName(p.name).map(code => ({ code, color: textColor })));
      for (const side of [p.top, p.bottom, p.left, p.right]) {
        const enc = encodeSide(side);
        fbPixels.push(enc.codes.map((code, ci) => ({ code, color: enc.colors[ci] })));
      }
      fbPixels.push(Array(16).fill({ code: BLANK, color: textColor }));
    }
    for (let i = 0; i < 20; i++) fbPixels.push(Array(16).fill({ code: BLANK, color: textColor }));
    dispatch(Screens.actions.addScreenAndFramebuf());
    dispatch((innerDispatch: any, getState: any) => {
      const state = getState();
      const newIdx = screensSelectors.getCurrentScreenFramebufIndex(state);
      if (newIdx === null) return;
      innerDispatch(Framebuffer.actions.setFields({ backgroundColor, borderColor: backgroundColor, borderOn: false, name: 'Boxes_' + newIdx }, newIdx));
      innerDispatch(Framebuffer.actions.setCharset(CHARSET_UPPER, newIdx));
      innerDispatch(Framebuffer.actions.setDims({ width: 16, height: totalRows }, newIdx));
      innerDispatch(Framebuffer.actions.setFields({ framebuf: fbPixels }, newIdx));
      innerDispatch(Toolbar.actions.setZoom(102, 'left'));
    });
  }, [boxPresets, textColor, backgroundColor, dispatch]);

  const handleImport = useCallback(() => {
    if (!currentFramebuf || currentFramebuf.width < 16) return;
    const fb = currentFramebuf.framebuf;
    const imported: BoxPreset[] = [];
    let r = 0;
    while (r + 5 < fb.length) {
      const hdrCodes = fb[r].slice(0, 16).map(p => p.code);
      const hdrColors = fb[r].slice(0, 16).map(p => p.color);
      if (hdrCodes[5] !== 0xBB) { r++; continue; }
      const corners = [hdrCodes[0], hdrCodes[1], hdrCodes[2], hdrCodes[3]];
      const cornerColors = [hdrColors[0], hdrColors[1], hdrColors[2], hdrColors[3]];
      const fill = hdrCodes[4] === 0xFF ? TRANSPARENT_SCREENCODE : hdrCodes[4];
      const fillColor = hdrColors[4] ?? 14;
      const name = decodeName(fb[r + 1].slice(0, 16).map(p => p.code));
      const rc = (row: number) => fb[r + row].slice(0, 16);
      const top = decodeSide(rc(2).map(p => p.code), rc(2).map(p => p.color));
      const bottom = decodeSide(rc(3).map(p => p.code), rc(3).map(p => p.color));
      const left = decodeSide(rc(4).map(p => p.code), rc(4).map(p => p.color));
      const right = decodeSide(rc(5).map(p => p.code), rc(5).map(p => p.color));
      imported.push({ name: name || `Box ${imported.length + 1}`, corners, cornerColors, top, bottom, left, right, fill, fillColor });
      r += 7;
    }
    if (imported.length > 0) { tb.setBoxPresets(imported); tb.setSelectedBoxPresetIndex(0); }
  }, [currentFramebuf, tb]);

  if (!preset) return null;

  // --- Render helpers for edit mode ---

  const renderHorizSide = (key: 'top' | 'bottom') => {
    const isTop = key === 'top';
    const side = ep[key];
    const display = isTop ? side.chars : [...side.chars].reverse();
    const canAdd = side.chars.length < 4, canRem = side.chars.length > 1;
    const charsRow = (
      <div style={{ display: 'flex', gap: '1px', alignItems: 'center', justifyContent: 'center' }}>
        <SmallBtn onClick={() => isTop ? removeChar(key) : addChar(key)} disabled={isTop ? !canRem : !canAdd}>
          {isTop ? '−' : '+'}
        </SmallBtn>
        {display.map((code, di) => {
          const ai = isTop ? di : side.chars.length - 1 - di;
          const cellFg = fgOf(side.colors[ai] ?? textColor);
          return <CharCell key={ai} code={code} font={font} fg={cellFg} bg={bg}
            selected={sel?.s === key && sel?.i === ai} onClick={() => cellClick(key, ai)} scale={1.5} />;
        })}
        <SmallBtn onClick={() => isTop ? addChar(key) : removeChar(key)} disabled={isTop ? !canAdd : !canRem}>
          {isTop ? '+' : '−'}
        </SmallBtn>
      </div>
    );
    const togglesRow = <ModeToggles side={side} onToggle={(f) => toggle(key, f)} reversed={!isTop} />;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px' }}>
        {isTop ? charsRow : togglesRow}
        {isTop ? togglesRow : charsRow}
      </div>
    );
  };

  const renderVertSide = (key: 'left' | 'right') => {
    const isLeft = key === 'left';
    const side = ep[key];
    const display = isLeft ? [...side.chars].reverse() : side.chars;
    const canAdd = side.chars.length < 4, canRem = side.chars.length > 1;
    const charsCol = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', alignItems: 'center' }}>
        <SmallBtn onClick={() => isLeft ? addChar(key) : removeChar(key)} disabled={isLeft ? !canAdd : !canRem}>
          {isLeft ? '+' : '−'}
        </SmallBtn>
        {display.map((code, di) => {
          const ai = isLeft ? side.chars.length - 1 - di : di;
          const cellFg = fgOf(side.colors[ai] ?? textColor);
          return <CharCell key={ai} code={code} font={font} fg={cellFg} bg={bg}
            selected={sel?.s === key && sel?.i === ai} onClick={() => cellClick(key, ai)} scale={1.5} />;
        })}
        <SmallBtn onClick={() => isLeft ? removeChar(key) : addChar(key)} disabled={isLeft ? !canRem : !canAdd}>
          {isLeft ? '−' : '+'}
        </SmallBtn>
      </div>
    );
    const togglesCol = <ModeToggles side={side} onToggle={(f) => toggle(key, f)} vertical reversed={isLeft} />;
    return (
      <div style={{ display: 'flex', gap: '0px', alignItems: 'center' }}>
        {isLeft ? charsCol : togglesCol}
        {isLeft ? togglesCol : charsCol}
      </div>
    );
  };

  return (
    <div style={{ padding: '3px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {!editMode ? (
        /* ---- Select mode: preset list ---- */
        <BoxPresetList
          presets={boxPresets} selectedIndex={selectedBoxPresetIndex}
          font={font} colorPalette={colorPalette} textColor={textColor}
          backgroundColor={backgroundColor}
          onSelect={handlePresetSelect} onEditClick={handleEditClick}
          forceForeground={boxForceForeground}
        />
      ) : (
        /* ---- Edit mode: grid editor + preview ---- */
        <>
          {/* Name + Save/Done row */}
          <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
            <input type="text" value={ep.name}
              onChange={(e) => { setEp(p => ({ ...p, name: e.target.value })); setDirty(true); }}
              onFocus={inputFocus} onBlur={inputBlur}
              style={{ width: '50%', fontSize: '10px', background: 'var(--panel-input-bg)', color: 'var(--panel-input-color)',
                border: '1px solid var(--panel-btn-border)', padding: '1px 4px', margin: 0, boxSizing: 'border-box' }} />
            <div style={{ flex: 1 }} />
            <div style={dirty ? activeBtnStyle : { ...btnStyle, opacity: 0.4, cursor: 'default' }}
              onClick={dirty ? handleSave : undefined} title="Save edits to preset">Save</div>
            <div style={activeBtnStyle} onClick={handleDone} title="Save and return to list">Done</div>
          </div>

          {/* Config grid + preview side by side */}
          <div style={{ display: 'flex', gap: '2px', alignItems: 'stretch' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: 'auto auto auto', gridTemplateRows: 'auto auto auto',
              gap: '0px', border: '1px solid var(--border-color)', padding: '2px', background: 'var(--panel-edit-bg)', borderRadius: '2px',
              flexShrink: 0,
            }}>
              {/* Row 1: TL corner, top side, TR corner */}
              <div style={{ alignSelf: 'start', justifySelf: 'start' }}>
                <CharCell code={ep.corners[0]} font={font} fg={fgOf(ep.cornerColors[0] ?? textColor)} bg={bg}
                  selected={sel?.s === 'corner' && sel?.i === 0} onClick={() => cellClick('corner', 0)} scale={1.5} />
              </div>
              <div style={{ justifySelf: 'center' }}>{renderHorizSide('top')}</div>
              <div style={{ alignSelf: 'start', justifySelf: 'end' }}>
                <CharCell code={ep.corners[1]} font={font} fg={fgOf(ep.cornerColors[1] ?? textColor)} bg={bg}
                  selected={sel?.s === 'corner' && sel?.i === 1} onClick={() => cellClick('corner', 1)} scale={1.5} />
              </div>
              {/* Row 2: left side, fill center, right side */}
              <div style={{ alignSelf: 'center', justifySelf: 'end' }}>{renderVertSide('left')}</div>
              <div style={{ alignSelf: 'center', justifySelf: 'center',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', padding: '1px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
                  <CharCell code={ep.fill} font={font} fg={fgOf(ep.fillColor ?? textColor)} bg={bg}
                    selected={sel?.s === 'fill' && sel?.i === 0} onClick={() => cellClick('fill', 0)} scale={1.5} />
                  <div style={{ ...btnStyle, padding: '0 2px', fontSize: '7px', lineHeight: '10px' }}
                    onClick={() => { setEp(p => ({ ...p, fill: TRANSPARENT_SCREENCODE })); setDirty(true); }}
                    title="Set fill to transparent">Clr</div>
                </div>
              </div>
              <div style={{ alignSelf: 'center', justifySelf: 'start' }}>{renderVertSide('right')}</div>
              {/* Row 3: BL corner, bottom side, BR corner */}
              <div style={{ alignSelf: 'end', justifySelf: 'start' }}>
                <CharCell code={ep.corners[2]} font={font} fg={fgOf(ep.cornerColors[2] ?? textColor)} bg={bg}
                  selected={sel?.s === 'corner' && sel?.i === 2} onClick={() => cellClick('corner', 2)} scale={1.5} />
              </div>
              <div style={{ justifySelf: 'center' }}>{renderHorizSide('bottom')}</div>
              <div style={{ alignSelf: 'end', justifySelf: 'end' }}>
                <CharCell code={ep.corners[3]} font={font} fg={fgOf(ep.cornerColors[3] ?? textColor)} bg={bg}
                  selected={sel?.s === 'corner' && sel?.i === 3} onClick={() => cellClick('corner', 3)} scale={1.5} />
              </div>
            </div>
            {/* Preview */}
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--panel-preview-border)', background: 'var(--panel-preview-bg)', borderRadius: '2px', overflow: 'hidden',
              minWidth: 0,
            }}>
              <BoxPreview preset={ep} previewW={Math.min(boxWn, 16)} previewH={Math.min(boxHn, 10)}
                font={font} colorPalette={colorPalette} textColor={textColor}
                backgroundColor={backgroundColor} scale={boxWn > 10 || boxHn > 8 ? 1 : 2} forceForeground={boxForceForeground} />
            </div>
          </div>

        </>
      )}
    </div>
  );
}

export default connect(
  (state: RootState) => {
    const framebuf = selectors.getCurrentFramebuf(state);
    const { font } = selectors.getCurrentFramebufFont(state);
    const charset = framebuf?.charset ?? 'upper';
    const prefix = charset.substring(0, 3);
    const width = framebuf?.width ?? 40;
    let colorPalette: Rgb[];
    if (prefix === 'vic') colorPalette = getSettingsCurrentVic20ColorPalette(state);
    else if (prefix === 'pet') colorPalette = getSettingsCurrentPetColorPalette(state);
    else if (prefix === 'c12' && width >= 80) colorPalette = vdcPalette;
    else colorPalette = getSettingsCurrentColorPalette(state);
    const selected = state.toolbar.selectedChar;
    const charTransform = state.toolbar.charTransform;
    return {
      boxPresets: state.toolbar.boxPresets,
      selectedBoxPresetIndex: state.toolbar.selectedBoxPresetIndex,
      font, colorPalette,
      textColor: state.toolbar.textColor,
      backgroundColor: framebuf?.backgroundColor ?? 0,
      curScreencode: selectors.getScreencodeWithTransform(selected, font, charTransform),
      framebuf: selectors.getCurrentFramebuf(state),
      boxDrawMode: state.toolbar.boxDrawMode,
      boxForceForeground: state.toolbar.boxForceForeground,
    };
  },
  (dispatch: any) => ({
    Toolbar: Toolbar.bindDispatch(dispatch),
    Framebuffer: Framebuffer.bindDispatch(dispatch),
    dispatch,
  })
)(BoxesPanel);
