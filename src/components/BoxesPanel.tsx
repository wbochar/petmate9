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

// ---- Style constants ----

const btnStyle: React.CSSProperties = {
  fontSize: '10px', fontWeight: 'bold', background: '#333', color: '#aaa',
  border: '1px solid #555', padding: '1px 5px', cursor: 'pointer',
  userSelect: 'none', lineHeight: '14px',
};
const activeBtnStyle: React.CSSProperties = { ...btnStyle, background: '#555', color: '#fff' };
const inputStyle: React.CSSProperties = {
  width: '28px', fontSize: '9px', background: '#222', color: '#ccc',
  border: '1px solid #555', padding: '1px 2px', textAlign: 'center' as const,
};

const CELL = 8;
const PREVIEW_BOX_W = 4;
const PREVIEW_BOX_H = 2;

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

function BoxPreview({ preset, previewW, previewH, font, colorPalette, textColor, backgroundColor, scale = 1 }: {
  preset: BoxPreset; previewW: number; previewH: number; font: Font;
  colorPalette: Rgb[]; textColor: number; backgroundColor: number; scale?: number;
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
        const cellFg = colorPalette[p.color] ?? colorPalette[textColor];
        drawCell(ctx, isT ? 0x20 : p.code, c, r, font, cellFg, bg, isT);
      }
  }, [preset, w, h, font, colorPalette, textColor, backgroundColor]);
  return (
    <canvas ref={ref} width={w*CELL} height={h*CELL} style={{
      width: w*CELL*scale, height: h*CELL*scale, imageRendering: 'pixelated', display: 'block',
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
      background: '#333', color: disabled ? '#444' : '#888',
      border: '1px solid #555', cursor: disabled ? 'default' : 'pointer',
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
      border: '1px solid #555', cursor: 'pointer', userSelect: 'none', flexShrink: 0,
      background: active ? '#446' : '#333', color: active ? '#adf' : '#555',
    }}>{label}</div>
  );
}

// ---- Repeat-char-type toggle ----

function RepeatCharToggle({ value, onClick }: {
  value: 'start' | 'end' | 'all' | 'none'; onClick: () => void;
}) {
  const cfgs: Record<string, { bg: string; color: string; label: string }> = {
    none:  { bg: '#333', color: '#555', label: '·' },
    start: { bg: '#354', color: '#8e8', label: 'S' },
    end:   { bg: '#543', color: '#fc8', label: 'E' },
    all:   { bg: '#446', color: '#adf', label: 'A' },
  };
  const c = cfgs[value];
  return (
    <div onClick={onClick} title={`Repeat char: ${value === 'none' ? 'off' : value}`} style={{
      width: 14, height: 14, fontSize: '8px', fontWeight: 'bold',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      border: '1px solid #555', cursor: 'pointer', userSelect: 'none', flexShrink: 0,
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

// ========== Graphical preset dropdown (exported for header) ==========

function BoxesPresetDropdownInner({ boxPresets, selectedBoxPresetIndex, font, colorPalette, textColor, backgroundColor, Toolbar: tb }: {
  boxPresets: BoxPreset[]; selectedBoxPresetIndex: number;
  font: Font; colorPalette: Rgb[]; textColor: number; backgroundColor: number;
  Toolbar: ReturnType<typeof Toolbar.bindDispatch>;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const current = boxPresets[selectedBoxPresetIndex];

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger: compact mini preview */}
      <div onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        style={{ cursor: 'pointer', border: '1px solid #555', display: 'flex', alignItems: 'center', gap: '2px', padding: '0px 2px', background: '#333', height: '18px', boxSizing: 'border-box' }}>
        <BoxPreview preset={current} previewW={PREVIEW_BOX_W} previewH={PREVIEW_BOX_H}
          font={font} colorPalette={colorPalette} textColor={textColor} backgroundColor={backgroundColor} scale={1} />
        <span style={{ fontSize: '7px', color: '#aaa', lineHeight: 1 }}>▼</span>
      </div>
      {/* Popup list */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, zIndex: 100,
          background: '#2a2a2a', border: '1px solid #555', maxHeight: 160, overflowY: 'auto',
          boxShadow: '0 2px 8px rgba(0,0,0,0.5)', width: '120px',
        }}>
          {boxPresets.map((p, i) => (
            <div key={i}
              onClick={(e) => { e.stopPropagation(); tb.setSelectedBoxPresetIndex(i); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 4px',
                cursor: 'pointer', background: i === selectedBoxPresetIndex ? '#444' : 'transparent',
                borderBottom: '1px solid #333',
              }}
              onMouseEnter={(e) => { if (i !== selectedBoxPresetIndex) (e.currentTarget as HTMLDivElement).style.background = '#3a3a3a'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = i === selectedBoxPresetIndex ? '#444' : 'transparent'; }}
            >
              <BoxPreview preset={p} previewW={PREVIEW_BOX_W} previewH={3}
                font={font} colorPalette={colorPalette} textColor={textColor} backgroundColor={backgroundColor} scale={1} />
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

export const BoxesPresetDropdown = connect(
  (state: RootState) => {
    const framebuf = selectors.getCurrentFramebuf(state);
    const { font } = selectors.getCurrentFramebufFont(state);
    const charset = framebuf?.charset ?? 'upper';
    const prefix = charset.substring(0, 3);
    let colorPalette: Rgb[];
    if (prefix === 'vic') colorPalette = getSettingsCurrentVic20ColorPalette(state);
    else if (prefix === 'pet') colorPalette = getSettingsCurrentPetColorPalette(state);
    else colorPalette = getSettingsCurrentColorPalette(state);
    return {
      boxPresets: state.toolbar.boxPresets,
      selectedBoxPresetIndex: state.toolbar.selectedBoxPresetIndex,
      font, colorPalette,
      textColor: state.toolbar.textColor,
      backgroundColor: framebuf?.backgroundColor ?? 0,
    };
  },
  (dispatch: any) => ({ Toolbar: Toolbar.bindDispatch(dispatch) })
)(BoxesPresetDropdownInner);

// ========== Main BoxesPanel ==========

interface BoxesPanelStateProps {
  boxPresets: BoxPreset[]; selectedBoxPresetIndex: number;
  font: Font; colorPalette: Rgb[]; textColor: number;
  backgroundColor: number; curScreencode: number;
  framebuf: FramebufType | null;
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
  Toolbar: tb, Framebuffer: framebufferActions, dispatch,
}: BoxesPanelProps & { dispatch: any }) {
  const preset = boxPresets[selectedBoxPresetIndex];
  const [ep, setEp] = useState<BoxPreset>(preset ? JSON.parse(JSON.stringify(preset)) : boxPresets[0]);
  const [sel, setSel] = useState<{ s: string; i: number } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [boxW, setBoxW] = useState(16);
  const [boxH, setBoxH] = useState(16);

  useEffect(() => {
    if (preset) { setEp(JSON.parse(JSON.stringify(preset))); setSel(null); setDirty(false); }
  }, [selectedBoxPresetIndex, preset]);

  const fg = colorPalette[textColor], bg = colorPalette[backgroundColor];

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
    const px = generateBox(ep, boxW, boxH);
    tb.setBrush({
      framebuf: px,
      brushRegion: { min: { row: 0, col: 0 }, max: { row: px.length - 1, col: px[0].length - 1 } },
    });
  }, [ep, boxW, boxH, tb]);

  // Encode a string as a row of screencodes (simple ASCII mapping)
  const encodeName = (name: string): number[] => {
    const row = Array(16).fill(0x20);
    for (let i = 0; i < Math.min(name.length, 16); i++) {
      const ch = name.charCodeAt(i);
      // A-Z → 1-26, a-z → 1-26, 0-9 → 0x30-0x39, space → 0x20
      if (ch >= 65 && ch <= 90) row[i] = ch - 64;       // A-Z
      else if (ch >= 97 && ch <= 122) row[i] = ch - 96;  // a-z
      else if (ch >= 48 && ch <= 57) row[i] = ch - 48 + 0x30; // 0-9
      else row[i] = 0x20; // space/other
    }
    return row;
  };

  const decodeName = (row: number[]): string => {
    let name = '';
    for (let i = 0; i < 16; i++) {
      const c = row[i];
      if (c >= 1 && c <= 26) name += String.fromCharCode(c + 64); // A-Z
      else if (c >= 0x30 && c <= 0x39) name += String.fromCharCode(c - 0x30 + 48); // 0-9
      else if (c === 0x20) name += ' ';
      else name += '?';
    }
    return name.trimEnd();
  };

  // Encode a BoxSide into two rows: screencodes then colors (16 wide each)
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
      mirror: codeRow[5] === 1,
      stretch: codeRow[6] === 1,
      repeat: codeRow[7] === 1,
      startEnd: seMap[codeRow[8]] ?? 'none',
    };
  };

  // Export: create a new screen with all box presets encoded as rows
  const handleExport = useCallback(() => {
    const BLANK = 0x20;
    const ROWS_PER_PRESET = 7; // header + name + 4 side-code-rows + separator
    const totalRows = boxPresets.length * ROWS_PER_PRESET + 20;
    const fbPixels: Pixel[][] = [];

    for (const p of boxPresets) {
      // Row 0: corners + fill + marker (screencodes)
      const hdr = Array(16).fill(BLANK);
      for (let i = 0; i < 4; i++) hdr[i] = p.corners[i];
      hdr[4] = p.fill === TRANSPARENT_SCREENCODE ? 0xFF : p.fill;
      hdr[5] = 0xBB; // marker
      // Row 0 colors: corner colors + fill color
      const hdrColors = Array(16).fill(0);
      for (let i = 0; i < 4; i++) hdrColors[i] = p.cornerColors[i] ?? 14;
      hdrColors[4] = p.fillColor ?? 14;
      fbPixels.push(hdr.map((code, ci) => ({ code, color: hdrColors[ci] } as Pixel)));
      // Row 1: name
      fbPixels.push(encodeName(p.name).map(code => ({ code, color: textColor })));
      // Rows 2-9: each side = 2 rows (codes, then colors)
      for (const side of [p.top, p.bottom, p.left, p.right]) {
        const enc = encodeSide(side);
        fbPixels.push(enc.codes.map((code, ci) => ({ code, color: enc.colors[ci] })));
      }
      // Separator row
      fbPixels.push(Array(16).fill({ code: BLANK, color: textColor }));
    }
    // Extra blank rows
    for (let i = 0; i < 20; i++) fbPixels.push(Array(16).fill({ code: BLANK, color: textColor }));

    dispatch(Screens.actions.addScreenAndFramebuf());
    dispatch((innerDispatch: any, getState: any) => {
      const state = getState();
      const newIdx = screensSelectors.getCurrentScreenFramebufIndex(state);
      if (newIdx === null) return;
      innerDispatch(Framebuffer.actions.setFields({
        backgroundColor, borderColor: backgroundColor, borderOn: false,
        name: 'Boxes_' + newIdx,
      }, newIdx));
      innerDispatch(Framebuffer.actions.setCharset(CHARSET_UPPER, newIdx));
      innerDispatch(Framebuffer.actions.setDims({ width: 16, height: totalRows }, newIdx));
      innerDispatch(Framebuffer.actions.setFields({ framebuf: fbPixels }, newIdx));
      innerDispatch(Toolbar.actions.setZoom(102, 'left'));
    });
  }, [boxPresets, textColor, backgroundColor, dispatch]);

  // Import: read box presets from the current screen
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
    if (imported.length > 0) {
      tb.setBoxPresets(imported);
      tb.setSelectedBoxPresetIndex(0);
    }
  }, [currentFramebuf, tb]);

  if (!preset) return null;

  // --- Render helpers ---

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
          const cellFg = colorPalette[side.colors[ai] ?? textColor];
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
          const cellFg = colorPalette[side.colors[ai] ?? textColor];
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
      {/* Name + action buttons */}
      <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
        <input type="text" value={ep.name}
          onChange={(e) => { setEp(p => ({ ...p, name: e.target.value })); setDirty(true); }}
          onFocus={inputFocus} onBlur={inputBlur}
          style={{ flex: 1, fontSize: '10px', background: '#222', color: '#ccc',
            border: '1px solid #555', padding: '1px 4px' }} />
        <div style={dirty ? activeBtnStyle : { ...btnStyle, opacity: 0.4, cursor: 'default' }}
          onClick={dirty ? handleSave : undefined} title="Save">Save</div>
        <div style={btnStyle} onClick={() => tb.addBoxPreset({ ...ep, name: `Box ${boxPresets.length + 1}` })}
          title="New preset">+</div>
        <div style={boxPresets.length > 1 ? btnStyle : { ...btnStyle, opacity: 0.3, cursor: 'default' }}
          onClick={() => boxPresets.length > 1 && tb.removeBoxPreset(selectedBoxPresetIndex)}
          title="Delete">🗑</div>
      </div>

      {/* Side-by-side: config grid (left) + preview (right) */}
      <div style={{ display: 'flex', gap: '2px', alignItems: 'stretch' }}>
        {/* Config grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'auto auto auto', gridTemplateRows: 'auto auto auto',
          gap: '0px', border: '1px solid #444', padding: '2px', background: '#252525', borderRadius: '2px',
          flexShrink: 0,
        }}>
        {/* Row 1 */}
        <div style={{ alignSelf: 'start', justifySelf: 'start' }}>
          <CharCell code={ep.corners[0]} font={font} fg={colorPalette[ep.cornerColors[0] ?? textColor]} bg={bg}
            selected={sel?.s === 'corner' && sel?.i === 0} onClick={() => cellClick('corner', 0)} scale={1.5} />
        </div>
        <div style={{ justifySelf: 'center' }}>{renderHorizSide('top')}</div>
        <div style={{ alignSelf: 'start', justifySelf: 'end' }}>
          <CharCell code={ep.corners[1]} font={font} fg={colorPalette[ep.cornerColors[1] ?? textColor]} bg={bg}
            selected={sel?.s === 'corner' && sel?.i === 1} onClick={() => cellClick('corner', 1)} scale={1.5} />
        </div>

          {/* Row 2 */}
          <div style={{ alignSelf: 'center', justifySelf: 'end' }}>{renderVertSide('left')}</div>
          <div style={{ alignSelf: 'center', justifySelf: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', padding: '1px' }}>
            <input type="number" min={2} max={80} value={boxW}
              onFocus={(e) => { e.target.select(); inputFocus(); }} onBlur={inputBlur}
              onChange={(e) => setBoxW(Math.max(2, Number(e.target.value)))} style={inputStyle} title="Width" />
            <span style={{ fontSize: '7px', color: '#555' }}>×</span>
            <input type="number" min={2} max={50} value={boxH}
              onFocus={(e) => { e.target.select(); inputFocus(); }} onBlur={inputBlur}
              onChange={(e) => setBoxH(Math.max(2, Number(e.target.value)))} style={inputStyle} title="Height" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '1px', marginTop: '1px' }}>
              <CharCell code={ep.fill} font={font} fg={colorPalette[ep.fillColor ?? textColor]} bg={bg}
                selected={sel?.s === 'fill' && sel?.i === 0} onClick={() => cellClick('fill', 0)} scale={1.5} />
              <div style={{ ...btnStyle, padding: '0 2px', fontSize: '7px', lineHeight: '10px' }}
                onClick={() => { setEp(p => ({ ...p, fill: TRANSPARENT_SCREENCODE })); setDirty(true); }}
                title="Set fill to transparent">Clr</div>
            </div>
          </div>
          <div style={{ alignSelf: 'center', justifySelf: 'start' }}>{renderVertSide('right')}</div>

        {/* Row 3 */}
        <div style={{ alignSelf: 'end', justifySelf: 'start' }}>
          <CharCell code={ep.corners[2]} font={font} fg={colorPalette[ep.cornerColors[2] ?? textColor]} bg={bg}
            selected={sel?.s === 'corner' && sel?.i === 2} onClick={() => cellClick('corner', 2)} scale={1.5} />
        </div>
        <div style={{ justifySelf: 'center' }}>{renderHorizSide('bottom')}</div>
        <div style={{ alignSelf: 'end', justifySelf: 'end' }}>
          <CharCell code={ep.corners[3]} font={font} fg={colorPalette[ep.cornerColors[3] ?? textColor]} bg={bg}
            selected={sel?.s === 'corner' && sel?.i === 3} onClick={() => cellClick('corner', 3)} scale={1.5} />
        </div>
        </div>

        {/* Preview (right side, fills remaining width) */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid #3a3a3a', background: '#1a1a1a', borderRadius: '2px', overflow: 'hidden',
          minWidth: 0,
        }}>
          <BoxPreview preset={ep} previewW={Math.min(boxW, 16)} previewH={Math.min(boxH, 10)}
            font={font} colorPalette={colorPalette} textColor={textColor}
            backgroundColor={backgroundColor} scale={boxW > 10 || boxH > 8 ? 1 : 2} />
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '2px' }}>
        <div style={activeBtnStyle} onClick={handleUseBrush} title="Generate box and use as brush">Brush</div>
        <div style={{ ...btnStyle, marginLeft: 'auto' }} onClick={handleExport} title="Export all presets to clipboard (JSON)">⭡</div>
        <div style={btnStyle} onClick={handleImport} title="Import presets from clipboard (JSON)">⭣</div>
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
      boxPresets: state.toolbar.boxPresets,
      selectedBoxPresetIndex: state.toolbar.selectedBoxPresetIndex,
      font, colorPalette,
      textColor: state.toolbar.textColor,
      backgroundColor: framebuf?.backgroundColor ?? 0,
      curScreencode: selectors.getScreencodeWithTransform(selected, font, charTransform),
      framebuf: selectors.getCurrentFramebuf(state),
    };
  },
  (dispatch: any) => ({
    Toolbar: Toolbar.bindDispatch(dispatch),
    Framebuffer: Framebuffer.bindDispatch(dispatch),
    dispatch,
  })
)(BoxesPanel);
