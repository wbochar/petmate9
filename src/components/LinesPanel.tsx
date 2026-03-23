import React, { useCallback, useRef, useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import { Toolbar } from '../redux/toolbar';
import { Framebuffer } from '../redux/editor';
import { CHARSET_DIRART } from '../redux/editor';
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
  Coord2,
  Brush,
  Framebuf as FramebufType,
  LinePreset,
  Tool,
} from '../redux/types';

// Inline style constants matching the dark UI theme
const btnStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 'bold',
  background: '#333',
  color: '#aaa',
  border: '1px solid #555',
  padding: '2px 6px',
  cursor: 'pointer',
  userSelect: 'none',
  lineHeight: '14px',
};

const activeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: '#555',
  color: '#fff',
};

// ---- Shared helper: draw a 16×1 character strip onto a canvas ----

const CELL = 8;
const STRIP_W = 16;
const CANVAS_W = STRIP_W * CELL; // 128
const CANVAS_H = CELL;           // 8

function drawCharStrip(
  ctx: CanvasRenderingContext2D,
  chars: number[],
  font: Font,
  colorPalette: Rgb[],
  textColor: number,
  backgroundColor: number,
  selectedCell?: number | null,
) {
  const bg = colorPalette[backgroundColor];
  ctx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const fg = colorPalette[textColor];
  const bits = font.bits;

  for (let col = 0; col < STRIP_W; col++) {
    const code = chars[col] ?? 0x20;
    const boffs = code * 8;
    const img = ctx.createImageData(CELL, CELL);
    const d = img.data;
    let di = 0;
    for (let y = 0; y < 8; y++) {
      const p = bits[boffs + y];
      for (let i = 0; i < 8; i++) {
        const on = (128 >> i) & p;
        d[di + 0] = on ? fg.r : bg.r;
        d[di + 1] = on ? fg.g : bg.g;
        d[di + 2] = on ? fg.b : bg.b;
        d[di + 3] = 255;
        di += 4;
      }
    }
    ctx.putImageData(img, col * CELL, 0);
  }

  if (selectedCell != null && selectedCell >= 0 && selectedCell < STRIP_W) {
    ctx.strokeStyle = 'rgba(128,255,128,0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(selectedCell * CELL + 0.5, 0.5, CELL - 1, CELL - 1);
  }
}

// ---- Mini 16×1 editable canvas (used for the active editor) ----

interface MiniCharCanvasProps {
  chars: number[];
  font: Font;
  colorPalette: Rgb[];
  textColor: number;
  backgroundColor: number;
  selectedCell: number | null;
  curScreencode: number;
  onCellClick: (col: number) => void;
  scale?: number;
}

function MiniCharCanvas({
  chars,
  font,
  colorPalette,
  textColor,
  backgroundColor,
  selectedCell,
  curScreencode,
  onCellClick,
  scale = 2,
}: MiniCharCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);

  // Draw the base strip
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    drawCharStrip(ctx, chars, font, colorPalette, textColor, backgroundColor, selectedCell);
  }, [chars, font, colorPalette, textColor, backgroundColor, selectedCell]);

  // Draw hover preview on the overlay canvas
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d')!;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    if (hoverCol === null || hoverCol < 0 || hoverCol >= STRIP_W) return;

    const bg = colorPalette[backgroundColor];
    const fg = colorPalette[textColor];
    const bits = font.bits;
    const boffs = curScreencode * 8;
    const img = ctx.createImageData(CELL, CELL);
    const d = img.data;
    let di = 0;
    for (let y = 0; y < 8; y++) {
      const p = bits[boffs + y];
      for (let i = 0; i < 8; i++) {
        const on = (128 >> i) & p;
        d[di + 0] = on ? fg.r : bg.r;
        d[di + 1] = on ? fg.g : bg.g;
        d[di + 2] = on ? fg.b : bg.b;
        d[di + 3] = 180; // semi-transparent preview
        di += 4;
      }
    }
    ctx.putImageData(img, hoverCol * CELL, 0);

    // Highlight border
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(hoverCol * CELL + 0.5, 0.5, CELL - 1, CELL - 1);
  }, [hoverCol, curScreencode, font, colorPalette, textColor, backgroundColor]);

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

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => setHoverCol(colFromEvent(e)),
    [colFromEvent]
  );

  const handleMouseLeave = useCallback(() => setHoverCol(null), []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const col = colFromEvent(e);
      if (col !== null) onCellClick(col);
    },
    [colFromEvent, onCellClick]
  );

  const w = CANVAS_W * scale;
  const h = CANVAS_H * scale;

  return (
    <div
      style={{ position: 'relative', width: w, height: h, cursor: 'pointer', border: '1px solid #555' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: w, height: h,
          imageRendering: 'pixelated',
        }}
      />
      <canvas
        ref={overlayRef}
        width={CANVAS_W}
        height={CANVAS_H}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: w, height: h,
          imageRendering: 'pixelated',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

// ---- Read-only thumbnail canvas for dropdown rows ----

interface PresetThumbProps {
  chars: number[];
  font: Font;
  colorPalette: Rgb[];
  textColor: number;
  backgroundColor: number;
  scale?: number;
}

function PresetThumb({
  chars,
  font,
  colorPalette,
  textColor,
  backgroundColor,
  scale = 2,
}: PresetThumbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    drawCharStrip(ctx, chars, font, colorPalette, textColor, backgroundColor);
  }, [chars, font, colorPalette, textColor, backgroundColor]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      style={{
        width: CANVAS_W * scale,
        height: CANVAS_H * scale,
        imageRendering: 'pixelated',
        display: 'block',
      }}
    />
  );
}

// ---- Scrollable preset list (4 visible slots) ----

const ROW_H = 22; // height of each slot row in px
const VISIBLE_SLOTS = 4;

interface PresetListProps {
  presets: LinePreset[];
  selectedIndex: number;
  font: Font;
  colorPalette: Rgb[];
  textColor: number;
  backgroundColor: number;
  onSelect: (index: number) => void;
}

function PresetList({
  presets,
  selectedIndex,
  font,
  colorPalette,
  textColor,
  backgroundColor,
  onSelect,
}: PresetListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the selected item into view when selection changes
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <div
      ref={listRef}
      style={{
        maxHeight: ROW_H * VISIBLE_SLOTS,
        overflowY: 'auto',
        border: '1px solid #555',
        background: '#2a2a2a',
      }}
    >
      {presets.map((p, i) => (
        <div
          key={i}
          onClick={() => onSelect(i)}
          title={p.name}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            padding: '2px 2px',
            height: ROW_H,
            boxSizing: 'border-box',
            cursor: 'pointer',
            background: 'transparent',
            borderBottom: '1px solid #333',
            outline: i === selectedIndex ? '1px solid #fff' : 'none',
            outlineOffset: '-1px',
          }}
          onMouseEnter={(e) => {
            if (i !== selectedIndex)
              (e.currentTarget as HTMLDivElement).style.background = '#3a3a3a';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = 'transparent';
          }}
        >
          <span style={{ fontSize: '9px', color: '#777', width: '14px', textAlign: 'right', flexShrink: 0 }}>
            {i + 1}.
          </span>
          <PresetThumb
            chars={p.chars}
            font={font}
            colorPalette={colorPalette}
            textColor={textColor}
            backgroundColor={backgroundColor}
          />
        </div>
      ))}
    </div>
  );
}

// ---- Connected LinesPanel ----

interface LinesPanelStateProps {
  linePresets: LinePreset[];
  selectedLinePresetIndex: number;
  font: Font;
  colorPalette: Rgb[];
  textColor: number;
  backgroundColor: number;
  curScreencode: number;
  framebuf: FramebufType | null;
}

interface LinesPanelDispatchProps {
  Toolbar: ReturnType<typeof Toolbar.bindDispatch>;
  Framebuffer: ReturnType<typeof Framebuffer.bindDispatch>;
  dispatch: any;
}

type LinesPanelProps = LinesPanelStateProps & LinesPanelDispatchProps;

function LinesPanel({
  linePresets,
  selectedLinePresetIndex,
  font,
  colorPalette,
  textColor,
  backgroundColor,
  curScreencode,
  framebuf: currentFramebuf,
  Toolbar: toolbarActions,
  Framebuffer: framebufferActions,
  dispatch,
}: LinesPanelProps) {
  const preset = linePresets[selectedLinePresetIndex];

  // Local editing state: a working copy of the selected preset's chars
  const [editChars, setEditChars] = useState<number[]>(preset ? [...preset.chars] : []);
  const [selectedCell, setSelectedCell] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  // Sync local state when the selected preset changes
  useEffect(() => {
    if (preset) {
      setEditChars([...preset.chars]);
      setSelectedCell(null);
      setDirty(false);
    }
  }, [selectedLinePresetIndex, preset]);

  // When a cell is clicked, place the current character into that cell
  const handleCellClick = useCallback(
    (col: number) => {
      setSelectedCell(col);
      setEditChars((prev) => {
        const next = [...prev];
        next[col] = curScreencode;
        return next;
      });
      setDirty(true);
    },
    [curScreencode]
  );

  // Preset selection from graphical dropdown
  const handlePresetSelect = useCallback(
    (index: number) => {
      toolbarActions.setSelectedLinePresetIndex(index);
    },
    [toolbarActions]
  );

  // Add new preset (duplicate current)
  const handleAdd = useCallback(() => {
    const name = `Line ${linePresets.length + 1}`;
    const chars = preset ? [...editChars] : Array(16).fill(0x20);
    toolbarActions.addLinePreset({ name, chars });
  }, [toolbarActions, linePresets.length, preset, editChars]);

  // Delete current preset
  const handleDelete = useCallback(() => {
    if (linePresets.length <= 1) return; // keep at least one
    toolbarActions.removeLinePreset(selectedLinePresetIndex);
  }, [toolbarActions, selectedLinePresetIndex, linePresets.length]);

  // Save edits back to the preset
  const handleSave = useCallback(() => {
    if (!preset) return;
    toolbarActions.updateLinePreset(selectedLinePresetIndex, {
      ...preset,
      chars: [...editChars],
    });
    setDirty(false);
  }, [toolbarActions, selectedLinePresetIndex, preset, editChars]);

  // Export: create a new dirart screen with all line presets + 10 blank rows
  const handleExport = useCallback(() => {
    const BLANK = 0x20;
    const extraRows = 10;
    const totalRows = linePresets.length + extraRows;
    const fbPixels: Pixel[][] = [];
    for (let r = 0; r < totalRows; r++) {
      const row: Pixel[] = [];
      for (let c = 0; c < 16; c++) {
        const code = r < linePresets.length ? (linePresets[r].chars[c] ?? BLANK) : BLANK;
        row.push({ code, color: textColor });
      }
      fbPixels.push(row);
    }
    dispatch(Screens.actions.addScreenAndFramebuf());
    dispatch((innerDispatch: any, getState: any) => {
      const state = getState();
      const newIdx = screensSelectors.getCurrentScreenFramebufIndex(state);
      if (newIdx === null) return;
      innerDispatch(Framebuffer.actions.setFields({
        backgroundColor,
        borderColor: backgroundColor,
        borderOn: false,
        name: 'Lines_' + newIdx,
      }, newIdx));
      innerDispatch(Framebuffer.actions.setCharset(CHARSET_DIRART, newIdx));
      innerDispatch(Framebuffer.actions.setDims({ width: 16, height: totalRows }, newIdx));
      innerDispatch(Framebuffer.actions.setFields({ framebuf: fbPixels }, newIdx));
      innerDispatch(Toolbar.actions.setZoom(102, 'left'));
    });
  }, [linePresets, textColor, backgroundColor, dispatch]);

  // Import: read 16-wide rows from the current document as line presets
  const handleImport = useCallback(() => {
    if (!currentFramebuf || currentFramebuf.width < 16) return;
    const BLANK = 0x20;
    const imported: LinePreset[] = [];
    for (let r = 0; r < currentFramebuf.height; r++) {
      const row = currentFramebuf.framebuf[r];
      const chars = row.slice(0, 16).map((p) => p.code);
      // Stop at first all-blank row
      if (chars.every((c) => c === BLANK)) break;
      imported.push({ name: `Line ${imported.length + 1}`, chars });
    }
    if (imported.length > 0) {
      toolbarActions.setLinePresets(imported);
      toolbarActions.setSelectedLinePresetIndex(0);
    }
  }, [currentFramebuf, toolbarActions]);

  // Create brush from the current line (stay on Lines tool so the panel remains visible)
  const handleUseBrush = useCallback(() => {
    const pixels: Pixel[][] = [
      editChars.map((code) => ({ code, color: textColor })),
    ];
    const brush: Brush = {
      framebuf: pixels,
      brushRegion: {
        min: { row: 0, col: 0 },
        max: { row: 0, col: 15 },
      },
    };
    toolbarActions.setBrush(brush);
  }, [editChars, textColor, toolbarActions]);

  if (!preset) return null;

  return (
    <div style={{ padding: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {/* Scrollable preset list */}
      <PresetList
        presets={linePresets}
        selectedIndex={selectedLinePresetIndex}
        font={font}
        colorPalette={colorPalette}
        textColor={textColor}
        backgroundColor={backgroundColor}
        onSelect={handlePresetSelect}
      />

      {/* 16×1 character canvas editor */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0' }}>
        <MiniCharCanvas
          chars={editChars}
          font={font}
          colorPalette={colorPalette}
          textColor={textColor}
          backgroundColor={backgroundColor}
          selectedCell={selectedCell}
          curScreencode={curScreencode}
          onCellClick={handleCellClick}
        />
        <div style={{ fontSize: '9px', color: '#777', marginTop: '4px' }}>
          Click a cell to place the selected character
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '2px' }}>
        <div
          style={dirty ? activeBtnStyle : { ...btnStyle, opacity: 0.4, cursor: 'default' }}
          onClick={dirty ? handleSave : undefined}
          title="Save edits to preset"
        >
          Save
        </div>
        <div style={btnStyle} onClick={handleAdd} title="Save as new preset">
          +
        </div>
        <div style={activeBtnStyle} onClick={handleUseBrush} title="Use line as brush">
          Use as Brush
        </div>
        <div style={{ ...btnStyle, marginLeft: 'auto' }} onClick={handleExport} title="Export lines to new screen">
          ⭡
        </div>
        <div style={btnStyle} onClick={handleImport} title="Import lines from current screen">
          ⭣
        </div>
        <div
          style={linePresets.length > 1 ? btnStyle : { ...btnStyle, opacity: 0.3, cursor: 'default' }}
          onClick={handleDelete}
          title="Delete preset"
        >
          🗑
        </div>
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
    if (prefix === 'vic') {
      colorPalette = getSettingsCurrentVic20ColorPalette(state);
    } else if (prefix === 'pet') {
      colorPalette = getSettingsCurrentPetColorPalette(state);
    } else {
      colorPalette = getSettingsCurrentColorPalette(state);
    }

    const selected = state.toolbar.selectedChar;
    const charTransform = state.toolbar.charTransform;

    return {
      linePresets: state.toolbar.linePresets,
      selectedLinePresetIndex: state.toolbar.selectedLinePresetIndex,
      font,
      colorPalette,
      textColor: state.toolbar.textColor,
      backgroundColor: framebuf?.backgroundColor ?? 0,
      curScreencode: selectors.getScreencodeWithTransform(selected, font, charTransform),
      framebuf,
    };
  },
  (dispatch: any) => ({
    Toolbar: Toolbar.bindDispatch(dispatch),
    Framebuffer: Framebuffer.bindDispatch(dispatch),
    dispatch,
  })
)(LinesPanel);
