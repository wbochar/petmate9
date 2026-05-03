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
  getSettingsCurrentTedColorPalette,
} from '../redux/settingsSelectors';
import { getActiveBoxPresets, getActivePresetGroup } from '../redux/selectors';
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
import { buildBoxesExportPixels, getExportFrameSpec } from '../utils/presetExport';
import { importBoxPresetsFromFramebuf } from '../utils/presetImport';

// ---- Style constants ----

const btnStyle: React.CSSProperties = {
  fontSize: '10px', fontWeight: 'bold', background: 'var(--panel-btn-bg)', color: 'var(--panel-btn-color)',
  border: '1px solid var(--panel-btn-border)', padding: '1px 5px', cursor: 'pointer',
  userSelect: 'none', lineHeight: '14px',
};
const activeBtnStyle: React.CSSProperties = { ...btnStyle, background: 'var(--panel-btn-active-bg)', color: 'var(--panel-btn-active-color)' };
// Editor-panel variants: the box preset editor's buttons are harder to read
// than the thin header controls, so bump the font/padding a little. Header
// buttons keep the tighter btnStyle/activeBtnStyle above.
const editorBtnStyle: React.CSSProperties = {
  ...btnStyle, fontSize: '12px', lineHeight: '16px', padding: '2px 7px',
};
const editorActiveBtnStyle: React.CSSProperties = {
  ...activeBtnStyle, fontSize: '12px', lineHeight: '16px', padding: '2px 7px',
};
const inputStyle: React.CSSProperties = {
  width: '28px', fontSize: '9px', background: 'var(--panel-input-bg)', color: 'var(--panel-input-color)',
  border: '1px solid var(--panel-btn-border)', padding: '1px 2px', textAlign: 'center' as const,
};

const CELL = 8;
const PREVIEW_BOX_W = 8;
const PREVIEW_BOX_H = 3;

// ---- Helpers ----

/** Fallback black used when a palette lookup returns undefined (can happen
 *  when a preset's colour index points outside the active platform's
 *  palette size, e.g. a C64 preset referenced by a PET screen). */
const RGB_BLACK: Rgb = { r: 0, g: 0, b: 0 };

/** Palette index lookup with graceful fallback so drawCell never throws
 *  on undefined entries. */
function paletteColor(palette: Rgb[] | undefined, idx: number | undefined): Rgb {
  if (!palette) return RGB_BLACK;
  const i = idx ?? 0;
  return palette[i] ?? palette[0] ?? RGB_BLACK;
}

function drawCell(
  ctx: CanvasRenderingContext2D, code: number, x: number, y: number,
  font: Font, fg: Rgb | undefined, bg: Rgb | undefined, isTransparent: boolean,
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
      if (isTransparent && !on) {
        const g = ((Math.floor((x*8+i)/4) + Math.floor((y*8+row)/4)) % 2) === 0 ? 40 : 50;
        d[di] = g; d[di+1] = g; d[di+2] = g;
      } else {
        d[di] = on ? safeFg.r : safeBg.r; d[di+1] = on ? safeFg.g : safeBg.g; d[di+2] = on ? safeFg.b : safeBg.b;
      }
      d[di+3] = 255; di += 4;
    }
  }
  ctx.putImageData(img, x * CELL, y * CELL);
}

function isBoxPresetFrameName(name: string | undefined): boolean {
  if (!name) return false;
  const normalized = name.toLowerCase();
  return normalized.startsWith('boxes_') || normalized.includes('_boxes_');
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
    const bg = paletteColor(colorPalette, backgroundColor);
    const px = generateBox(preset, w, h);
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++) {
        const p = px[r][c], isT = p.code === TRANSPARENT_SCREENCODE;
        const cellFg = forceForeground
          ? paletteColor(colorPalette, textColor)
          : paletteColor(colorPalette, p.color ?? textColor);
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
      width: 16, height: 16, fontSize: '11px', fontWeight: 'bold',
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
      width: 16, height: 16, fontSize: '11px', fontWeight: 'bold',
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
      width: 16, height: 16, fontSize: '11px', fontWeight: 'bold',
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
  boxForceForeground, framebuf: currentFramebuf, framebufIndex, activeGroup, Toolbar: tb, dispatch,
}: {
  boxPresets: BoxPreset[]; selectedBoxPresetIndex: number;
  textColor: number; backgroundColor: number;
  boxForceForeground: boolean;
  framebuf: FramebufType | null;
  framebufIndex: number | null;
  activeGroup: string;
  Toolbar: ReturnType<typeof Toolbar.bindDispatch>;
  dispatch: any;
}) {
  const preset = boxPresets[selectedBoxPresetIndex];

  const handleAdd = useCallback(() => {
    const defaultSide = (chars: number[]): BoxSide => ({
      chars, colors: chars.map(() => 14),
      mirror: false, stretch: false, repeat: true, startEnd: 'none',
    });
    const name = `BOX ${boxPresets.length + 1}`;
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

  // Read-side PETSCII decoders. Import-only; the write side uses the shared
  // buildBoxesExportPixels() helper so encoding stays in one place.
  // Legacy (pre-grouped) exports were 16-wide; newer exports are 24-wide and
  // platform-specific frames may be up to 80 cols. We clamp reads to the
  // lesser of 24 and the source frame width for backwards compatibility.
  const EXPORT_WIDTH = 24;
  const decodeName = (row: number[]): string => {
    let name = '';
    for (let i = 0; i < row.length; i++) {
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
    // Platform-matched frame: charset/width/palette follow the active group
    // so the exported screen renders with the same ROM font + colours the
    // presets were authored for.  Always use the platform's default
    // foreground/background/border colours.
    const spec = getExportFrameSpec(activeGroup);
    const isC64 = activeGroup === 'c64';
    const exportFg = spec.textColor;
    // Build pixels already padded to spec.width so each row's length
    // matches the host framebuffer dimensions (critical for the 80-col VDC
    // frame, which would otherwise leave undefined cells past column 24).
    const fbPixels = buildBoxesExportPixels(boxPresets, activeGroup, exportFg, spec.width, !isC64);
    dispatch(Screens.actions.addScreenAndFramebuf());
    dispatch((innerDispatch: any, getState: any) => {
      const state = getState();
      const newIdx = screensSelectors.getCurrentScreenFramebufIndex(state);
      if (newIdx === null) return;
      innerDispatch(Framebuffer.actions.setCharset(spec.charset, newIdx));
      innerDispatch(Framebuffer.actions.setDims({ width: spec.width, height: fbPixels.length }, newIdx));
      innerDispatch(Framebuffer.actions.setFields({
        backgroundColor: spec.backgroundColor,
        borderColor: spec.borderColor,
        borderOn: false,
        name: `${activeGroup}_boxes_${newIdx}`,
        framebuf: fbPixels,
      }, newIdx));
      innerDispatch(Toolbar.actions.setZoom(102, 'left'));
    });
  }, [boxPresets, activeGroup, dispatch]);

  const handleImport = useCallback(() => {
    // Accept both legacy 16-wide and new EXPORT_WIDTH-wide exports.
    if (!currentFramebuf || currentFramebuf.width < 16) return;
    if (!isBoxPresetFrameName(currentFramebuf.name)) return;
    const imported = importBoxPresetsFromFramebuf(currentFramebuf);
    if (!imported || imported.presets.length === 0) return;
    tb.setPresetDialog({
      show: true,
      type: 'import-panel',
      importKind: 'boxes',
      sourceFramebufIndex: framebufIndex ?? undefined,
    });
  }, [currentFramebuf, framebufIndex, tb]);

  return (
    <>
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
      boxPresets: getActiveBoxPresets(state),
      selectedBoxPresetIndex: state.toolbar.selectedBoxPresetIndex,
      textColor: state.toolbar.textColor,
      backgroundColor: framebuf?.backgroundColor ?? 0,
      boxForceForeground: state.toolbar.boxForceForeground,
      framebuf,
      framebufIndex: screensSelectors.getCurrentScreenFramebufIndex(state),
      activeGroup: getActivePresetGroup(state),
    };
  },
  (dispatch: any) => ({ Toolbar: Toolbar.bindDispatch(dispatch), dispatch })
)(BoxesHeaderControlsInner);

// Keep old export name for compatibility
export const BoxesPresetDropdown = BoxesHeaderControls;

// ========== Box preset list (select mode) ==========

const BOX_ROW_H = 54; // 3 chars × 8px × 2 scale + padding
const BOX_VISIBLE_SLOTS = 3;

function BoxPresetList({ presets, selectedIndex, font, colorPalette, textColor, backgroundColor, onSelect, onEditClick, onMove, onDuplicate, onDelete, forceForeground = false }: {
  presets: BoxPreset[]; selectedIndex: number;
  font: Font; colorPalette: Rgb[]; textColor: number; backgroundColor: number;
  onSelect: (i: number) => void; onEditClick: (i: number) => void;
  onMove?: (from: number, to: number) => void;
  onDuplicate?: (index: number) => void;
  onDelete?: (index: number) => void;
  forceForeground?: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);
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
        if (target >= 0 && target < presets.length) onMove(selectedIndex, target);
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
    }
  }, [selectedIndex, presets.length, onSelect, onMove, onDuplicate, onDelete]);

  return (
    <div
      ref={listRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        maxHeight: BOX_ROW_H * BOX_VISIBLE_SLOTS, overflowY: 'auto',
        border: '1px solid var(--panel-btn-border)', background: 'var(--panel-list-bg)',
        outline: 'none',
      }}
    >
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
  framebufIndex: number | null;
  boxDrawMode: boolean;
  boxForceForeground: boolean;
  activeGroup: string;
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
  framebufIndex,
  boxDrawMode, boxForceForeground, activeGroup,
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
  const fg = paletteColor(colorPalette, textColor), bg = paletteColor(colorPalette, backgroundColor);
  // When force foreground is on, all cell colors use the current foreground.
  // Always route through paletteColor() so out-of-range indices fall back to
  // palette[0]/black instead of propagating undefined into drawCell.
  const fgOf = (colorIdx: number) => boxForceForeground ? fg : paletteColor(colorPalette, colorIdx ?? textColor);

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

  // Bulk-apply the currently selected foreground (textColor) to a subset of
  // the preset's color slots. target is one of:
  //   'corners'          -> all four corner color slots
  //   'slot:<0-3>'       -> the Nth character slot on all four edges (top/bottom/left/right),
  //                         only where that slot exists (chars.length > N)
  //   'all'              -> every color slot in the preset (corners, all edge slots, fill)
  const applyBulkColor = useCallback((target: 'corners' | 'all' | `slot:${0|1|2|3}`) => {
    setEp(prev => {
      const n = JSON.parse(JSON.stringify(prev)) as BoxPreset;
      const sideKeys = ['top', 'bottom', 'left', 'right'] as const;
      if (target === 'corners') {
        n.cornerColors = [textColor, textColor, textColor, textColor];
      } else if (target === 'all') {
        n.cornerColors = [textColor, textColor, textColor, textColor];
        n.fillColor = textColor;
        for (const k of sideKeys) {
          const side = n[k] as BoxSide;
          side.colors = side.colors.map(() => textColor);
        }
      } else {
        const slot = Number(target.split(':')[1]);
        for (const k of sideKeys) {
          const side = n[k] as BoxSide;
          if (slot < side.colors.length) side.colors[slot] = textColor;
        }
      }
      return n;
    });
    setDirty(true);
  }, [textColor]);

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

  /** Reorder the active group's preset list (Ctrl+↑/↓ in the preset list). */
  const handlePresetMove = useCallback((from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= boxPresets.length || to >= boxPresets.length) return;
    const moved = [...boxPresets];
    const [item] = moved.splice(from, 1);
    moved.splice(to, 0, item);
    tb.setBoxPresets(moved);
    tb.setSelectedBoxPresetIndex(to);
  }, [tb, boxPresets]);

  /** Duplicate the preset at the given index (Insert key). */
  const handlePresetDuplicate = useCallback((index: number) => {
    const src = boxPresets[index];
    if (!src) return;
    const dupe: BoxPreset = JSON.parse(JSON.stringify(src));
    dupe.name = `${src.name.toUpperCase()} COPY`;
    const next = [...boxPresets];
    next.splice(index + 1, 0, dupe);
    tb.setBoxPresets(next);
    tb.setSelectedBoxPresetIndex(index + 1);
  }, [tb, boxPresets]);

  /** Remove the preset at the given index (Delete key). Keeps at least one. */
  const handlePresetDelete = useCallback((index: number) => {
    if (boxPresets.length <= 1) return;
    tb.removeBoxPreset(index);
  }, [tb, boxPresets.length]);

  // E button: select + enter edit mode
  const handleEditClick = useCallback((index: number) => {
    tb.setSelectedBoxPresetIndex(index);
    setEditMode(true);
  }, [tb]);

  // Done: save if dirty, exit edit mode, leave currently highlighted preset active
  const handleDone = useCallback(() => {
    if (dirty && preset) {
      tb.updateBoxPreset(selectedBoxPresetIndex, { ...ep });
      setDirty(false);
    }
    setEditMode(false);
  }, [dirty, preset, ep, selectedBoxPresetIndex, tb]);

  // Read-side PETSCII decoders. Import-only; the write side uses the shared
  // buildBoxesExportPixels() helper so encoding stays in one place.
  const EXPORT_WIDTH = 24;

  const decodeName = (row: number[]): string => {
    let name = '';
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c >= 1 && c <= 26) name += String.fromCharCode(c + 64);
      else if (c >= 0x30 && c <= 0x39) name += String.fromCharCode(c - 0x30 + 48);
      else if (c === 0x20) name += ' ';
      else name += '?';
    }
    return name.trimEnd();
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
    const spec = getExportFrameSpec(activeGroup);
    const isC64 = activeGroup === 'c64';
    const exportFg = spec.textColor;
    const fbPixels = buildBoxesExportPixels(boxPresets, activeGroup, exportFg, spec.width, !isC64);
    dispatch(Screens.actions.addScreenAndFramebuf());
    dispatch((innerDispatch: any, getState: any) => {
      const state = getState();
      const newIdx = screensSelectors.getCurrentScreenFramebufIndex(state);
      if (newIdx === null) return;
      innerDispatch(Framebuffer.actions.setCharset(spec.charset, newIdx));
      innerDispatch(Framebuffer.actions.setDims({ width: spec.width, height: fbPixels.length }, newIdx));
      innerDispatch(Framebuffer.actions.setFields({
        backgroundColor: spec.backgroundColor,
        borderColor: spec.borderColor,
        borderOn: false,
        name: `${activeGroup}_boxes_${newIdx}`,
        framebuf: fbPixels,
      }, newIdx));
      innerDispatch(Toolbar.actions.setZoom(102, 'left'));
    });
  }, [boxPresets, activeGroup, dispatch]);

  const handleImport = useCallback(() => {
    // Accept both legacy 16-wide and new EXPORT_WIDTH-wide exports.
    if (!currentFramebuf || currentFramebuf.width < 16) return;
    if (!isBoxPresetFrameName(currentFramebuf.name)) return;
    const imported = importBoxPresetsFromFramebuf(currentFramebuf);
    if (!imported || imported.presets.length === 0) return;
    tb.setPresetDialog({
      show: true,
      type: 'import-panel',
      importKind: 'boxes',
      sourceFramebufIndex: framebufIndex ?? undefined,
    });
  }, [currentFramebuf, framebufIndex, tb]);

  if (!preset) return null;

  // --- Render helpers for edit mode ---

  /** Render only the horizontal chars row (remove btn + 4 char slots + add
   *  btn) for top/bottom.  Sits in grid row 1 / row 5 at the outer edge,
   *  same height as a corner chip so TL/TR/BL/BR land at the true corners.
   *  We always render 4 slots; slots past `side.chars.length` are shown
   *  greyed-out and non-interactive so the user can see where additional
   *  chars would appear if they hit `+`. */
  const renderHorizCharsRow = (key: 'top' | 'bottom') => {
    const isTop = key === 'top';
    const side = ep[key];
    const canAdd = side.chars.length < 4, canRem = side.chars.length > 1;
    // Slot ordering: top shows chars left->right, bottom is reversed so the
    // box's visual perimeter reads consistently around all four sides.
    const slotOrder = isTop ? [0, 1, 2, 3] : [3, 2, 1, 0];
    return (
      // gap: 0 so the +/- buttons tile at the same 18 px slot size as the
      // char cells; any gap here would make the row wider than a clean
      // 6-slot multiple and break alignment with the corner chips above.
      <div style={{ display: 'flex', gap: 0, alignItems: 'center', justifyContent: 'center' }}>
        <SmallBtn onClick={() => isTop ? removeChar(key) : addChar(key)} disabled={isTop ? !canRem : !canAdd}>
          {isTop ? '−' : '+'}
        </SmallBtn>
        {slotOrder.map((ai) => {
          const active = ai < side.chars.length;
          const code = active ? side.chars[ai] : 0x20;
          const cellFg = fgOf(active ? (side.colors[ai] ?? textColor) : textColor);
          // Always render the slot through a fixed-size wrapper so the flex
          // item's outer box is the same 18 px whether the slot is active
          // or greyed out. This prevents the row width from jittering when
          // add/remove toggles a slot between the two states.
          return (
            <div key={ai} style={{
              width: 18, height: 18, display: 'inline-flex', flexShrink: 0,
              opacity: active ? 1 : 0.3, pointerEvents: active ? 'auto' : 'none',
            }}>
              <CharCell code={code} font={font} fg={cellFg} bg={bg}
                selected={active && sel?.s === key && sel?.i === ai}
                onClick={active ? () => cellClick(key, ai) : () => {}} scale={2} />
            </div>
          );
        })}
        <SmallBtn onClick={() => isTop ? addChar(key) : removeChar(key)} disabled={isTop ? !canAdd : !canRem}>
          {isTop ? '+' : '−'}
        </SmallBtn>
      </div>
    );
  };

  /** Render only the horizontal toggle row for top/bottom.  Sits in its own
   *  inner grid row immediately below/above the chars row. */
  const renderHorizTogglesRow = (key: 'top' | 'bottom') => {
    const side = ep[key];
    return <ModeToggles side={side} onToggle={(f) => toggle(key, f)} reversed={key === 'bottom'} />;
  };

  /** Render the 4 char slots (no +/- buttons) of a vertical side.  Slots
   *  past `side.chars.length` are shown greyed-out and non-interactive so
   *  the user can see all the potential char positions even on short sides. */
  const renderVertCharsCol = (key: 'left' | 'right') => {
    const isLeft = key === 'left';
    const side = ep[key];
    // Left side is displayed bottom-to-top (mirrors how the box perimeter
    // wraps around); right side is top-to-bottom.
    const slotOrder = isLeft ? [3, 2, 1, 0] : [0, 1, 2, 3];
    return (
      // gap: 0 keeps the vertical chars col tiling at the fixed 18 px slot
      // size so it lines up with the corner chips at the top and bottom.
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, alignItems: 'center' }}>
        {slotOrder.map((ai) => {
          const active = ai < side.chars.length;
          const code = active ? side.chars[ai] : 0x20;
          const cellFg = fgOf(active ? (side.colors[ai] ?? textColor) : textColor);
          // Same fixed-size wrapper as the horizontal rows so the vertical
          // chars col never changes width when slots flip between active
          // and greyed-out.
          return (
            <div key={ai} style={{
              width: 18, height: 18, display: 'inline-flex', flexShrink: 0,
              opacity: active ? 1 : 0.3, pointerEvents: active ? 'auto' : 'none',
            }}>
              <CharCell code={code} font={font} fg={cellFg} bg={bg}
                selected={active && sel?.s === key && sel?.i === ai}
                onClick={active ? () => cellClick(key, ai) : () => {}} scale={2} />
            </div>
          );
        })}
      </div>
    );
  };

  /** Render the top (add for left, remove for right) or bottom (remove for
   *  left, add for right) button of a vertical side.  These buttons sit in
   *  the same grid row as the opposite side's horizontal toggle strip so
   *  the perimeter stays a clean rectangle. */
  const renderVertEndBtn = (key: 'left' | 'right', which: 'top' | 'bot') => {
    const isLeft = key === 'left';
    const side = ep[key];
    const canAdd = side.chars.length < 4;
    const canRem = side.chars.length > 1;
    const isAdd = (isLeft && which === 'top') || (!isLeft && which === 'bot');
    return (
      <SmallBtn
        onClick={() => (isAdd ? addChar(key) : removeChar(key))}
        disabled={isAdd ? !canAdd : !canRem}
      >
        {isAdd ? '+' : '−'}
      </SmallBtn>
    );
  };

  /** Render only the vertical toggles column (M/S/R/Repeat).  Rendered
   *  inside the center cell adjacent to the fill so it doesn't widen the
   *  outer grid's corner columns. */
  const renderVertTogglesCol = (key: 'left' | 'right') => {
    const side = ep[key];
    return <ModeToggles side={side} onToggle={(f) => toggle(key, f)} vertical reversed={key === 'left'} />;
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
          onMove={handlePresetMove}
          onDuplicate={handlePresetDuplicate}
          onDelete={handlePresetDelete}
          forceForeground={boxForceForeground}
        />
      ) : (
        /* ---- Edit mode: grid editor + preview ---- */
        <>
          {/* Name + Save/Done row */}
          <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
            <input type="text" value={ep.name}
              onChange={(e) => { setEp(p => ({ ...p, name: e.target.value.toUpperCase() })); setDirty(true); }}
              onFocus={inputFocus} onBlur={inputBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  // Save the current edits (works even if the field is the only
                  // thing that changed) and keep the user in edit mode.
                  if (preset) {
                    tb.updateBoxPreset(selectedBoxPresetIndex, { ...ep });
                    setDirty(false);
                  }
                  (e.target as HTMLInputElement).blur();
                }
                e.stopPropagation();
              }}
              onKeyUp={(e) => e.stopPropagation()}
              style={{ width: '50%', fontSize: '10px', background: 'var(--panel-input-bg)', color: 'var(--panel-input-color)',
                border: '1px solid var(--panel-btn-border)', padding: '1px 4px', margin: 0, boxSizing: 'border-box' }} />
            <div style={{ flex: 1 }} />
            <div style={dirty ? editorActiveBtnStyle : { ...editorBtnStyle, opacity: 0.4, cursor: 'default' }}
              onClick={dirty ? handleSave : undefined} title="Save edits to preset">Save</div>
            <div style={editorActiveBtnStyle} onClick={handleDone} title="Save and return to list">Done</div>
          </div>

          {/* Config grid + preview side by side.
              The box editor uses a 5-row grid so every cell of the visible
              perimeter is a single 16 px square:
                row 1: TL | top chars row | TR
                row 2:    | top toggles   |
                row 3: left chars col | fill + vert toggles | right chars col
                row 4:    | bottom toggles|
                row 5: BL | bot chars row | BR
              The toggle rows live in their own dedicated grid rows (not
              inside the chars row container), which keeps rows 1 and 5
              the same height as the corner chips and lets the corners sit
              at the true outer corners of the box. */}
          <div style={{ display: 'flex', gap: '2px', alignItems: 'stretch' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: 'auto auto auto', gridTemplateRows: 'auto auto auto auto auto',
              gap: '0px', border: '1px solid var(--border-color)', padding: '2px', background: 'var(--panel-edit-bg)', borderRadius: '2px',
              flexShrink: 0,
            }}>
              {/* Row 1: TL corner | top chars row | TR corner */}
              <div style={{ alignSelf: 'start', justifySelf: 'center' }}>
                <CharCell code={ep.corners[0]} font={font} fg={fgOf(ep.cornerColors[0] ?? textColor)} bg={bg}
                  selected={sel?.s === 'corner' && sel?.i === 0} onClick={() => cellClick('corner', 0)} scale={2} />
              </div>
              <div style={{ justifySelf: 'center', alignSelf: 'center' }}>{renderHorizCharsRow('top')}</div>
              <div style={{ alignSelf: 'start', justifySelf: 'center' }}>
                <CharCell code={ep.corners[1]} font={font} fg={fgOf(ep.cornerColors[1] ?? textColor)} bg={bg}
                  selected={sel?.s === 'corner' && sel?.i === 1} onClick={() => cellClick('corner', 1)} scale={2} />
              </div>
              {/* Row 2: left-side add btn | top toggles row | right-side remove btn.
                  Placing the vertical sides' top +/- buttons in this row puts
                  them on the exact same horizontal line as the top toggles. */}
              <div style={{ justifySelf: 'center', alignSelf: 'center' }}>
                {renderVertEndBtn('left', 'top')}
              </div>
              <div style={{ justifySelf: 'center', alignSelf: 'center' }}>{renderHorizTogglesRow('top')}</div>
              <div style={{ justifySelf: 'center', alignSelf: 'center' }}>
                {renderVertEndBtn('right', 'top')}
              </div>
              {/* Row 3: left chars col | fill + vertical toggles | right chars col */}
              <div style={{ alignSelf: 'center', justifySelf: 'center' }}>{renderVertCharsCol('left')}</div>
              <div style={{ alignSelf: 'center', justifySelf: 'stretch',
                display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                gap: '2px', padding: '1px' }}>
                {renderVertTogglesCol('left')}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
                  <CharCell code={ep.fill} font={font} fg={fgOf(ep.fillColor ?? textColor)} bg={bg}
                    selected={sel?.s === 'fill' && sel?.i === 0} onClick={() => cellClick('fill', 0)} scale={2} />
                  <div style={{ ...editorBtnStyle, padding: '1px 3px', fontSize: '10px', lineHeight: '12px' }}
                    onClick={() => { setEp(p => ({ ...p, fill: TRANSPARENT_SCREENCODE })); setDirty(true); }}
                    title="Set fill to transparent">Clr</div>
                </div>
                {renderVertTogglesCol('right')}
              </div>
              <div style={{ alignSelf: 'center', justifySelf: 'center' }}>{renderVertCharsCol('right')}</div>
              {/* Row 4: left-side remove btn | bottom toggles row | right-side add btn.
                  Mirror of row 2 so the bottom +/- buttons line up with the
                  bottom toggles. */}
              <div style={{ justifySelf: 'center', alignSelf: 'center' }}>
                {renderVertEndBtn('left', 'bot')}
              </div>
              <div style={{ justifySelf: 'center', alignSelf: 'center' }}>{renderHorizTogglesRow('bottom')}</div>
              <div style={{ justifySelf: 'center', alignSelf: 'center' }}>
                {renderVertEndBtn('right', 'bot')}
              </div>
              {/* Row 5: BL corner | bottom chars row | BR corner */}
              <div style={{ alignSelf: 'end', justifySelf: 'center' }}>
                <CharCell code={ep.corners[2]} font={font} fg={fgOf(ep.cornerColors[2] ?? textColor)} bg={bg}
                  selected={sel?.s === 'corner' && sel?.i === 2} onClick={() => cellClick('corner', 2)} scale={2} />
              </div>
              <div style={{ justifySelf: 'center', alignSelf: 'center' }}>{renderHorizCharsRow('bottom')}</div>
              <div style={{ alignSelf: 'end', justifySelf: 'center' }}>
                <CharCell code={ep.corners[3]} font={font} fg={fgOf(ep.cornerColors[3] ?? textColor)} bg={bg}
                  selected={sel?.s === 'corner' && sel?.i === 3} onClick={() => cellClick('corner', 3)} scale={2} />
              </div>
            </div>
            {/* Preview + bulk color-apply buttons along the top edge.
                Each button paints the CURRENT foreground (textColor) onto a
                group of the preset's color slots. */}
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              border: '1px solid var(--panel-preview-border)', background: 'var(--panel-preview-bg)', borderRadius: '2px', overflow: 'hidden',
              minWidth: 0,
            }}>
              <div style={{
                display: 'flex', gap: '1px', padding: '2px', justifyContent: 'center',
                background: 'var(--panel-edit-bg)', borderBottom: '1px solid var(--panel-preview-border)',
              }}>
                <div style={{ ...btnStyle, padding: '0 4px', fontSize: '10px', lineHeight: '13px' }}
                  onClick={() => applyBulkColor('corners')}
                  title="All Corners Color value">C</div>
                <div style={{ ...btnStyle, padding: '0 4px', fontSize: '10px', lineHeight: '13px' }}
                  onClick={() => applyBulkColor('slot:0')}
                  title="All 1st character slot color">1</div>
                <div style={{ ...btnStyle, padding: '0 4px', fontSize: '10px', lineHeight: '13px' }}
                  onClick={() => applyBulkColor('slot:1')}
                  title="All 2nd character slot color">2</div>
                <div style={{ ...btnStyle, padding: '0 4px', fontSize: '10px', lineHeight: '13px' }}
                  onClick={() => applyBulkColor('slot:2')}
                  title="All 3rd character slot color">3</div>
                <div style={{ ...btnStyle, padding: '0 4px', fontSize: '10px', lineHeight: '13px' }}
                  onClick={() => applyBulkColor('slot:3')}
                  title="All 4th character slot color">4</div>
                <div style={{ ...btnStyle, padding: '0 4px', fontSize: '10px', lineHeight: '13px' }}
                  onClick={() => applyBulkColor('all')}
                  title="Apply color to all parts of the box">ALL</div>
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* Square 12x12 preview. The brush size (boxW/boxH) still drives
                    the generated brush output — only the edit preview is fixed. */}
                <BoxPreview preset={ep} previewW={10} previewH={10}
                  font={font} colorPalette={colorPalette} textColor={textColor}
                  backgroundColor={backgroundColor} scale={1.5} forceForeground={boxForceForeground} />
              </div>
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
    if (prefix === 'c16') colorPalette = getSettingsCurrentTedColorPalette(state);
    else if (prefix === 'vic') colorPalette = getSettingsCurrentVic20ColorPalette(state);
    else if (prefix === 'pet') colorPalette = getSettingsCurrentPetColorPalette(state);
    else if (prefix === 'c12' && width >= 80) colorPalette = vdcPalette;
    else colorPalette = getSettingsCurrentColorPalette(state);
    const selected = state.toolbar.selectedChar;
    const charTransform = state.toolbar.charTransform;
    return {
      boxPresets: getActiveBoxPresets(state),
      selectedBoxPresetIndex: state.toolbar.selectedBoxPresetIndex,
      font, colorPalette,
      textColor: state.toolbar.textColor,
      backgroundColor: framebuf?.backgroundColor ?? 0,
      curScreencode: selectors.getScreencodeWithTransform(selected, font, charTransform),
      framebuf: selectors.getCurrentFramebuf(state),
      framebufIndex: screensSelectors.getCurrentScreenFramebufIndex(state),
      boxDrawMode: state.toolbar.boxDrawMode,
      boxForceForeground: state.toolbar.boxForceForeground,
      activeGroup: getActivePresetGroup(state),
    };
  },
  (dispatch: any) => ({
    Toolbar: Toolbar.bindDispatch(dispatch),
    Framebuffer: Framebuffer.bindDispatch(dispatch),
    dispatch,
  })
)(BoxesPanel);
