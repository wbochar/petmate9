import React from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import { Toolbar } from '../redux/toolbar';
import { RootState, Tool, Font, Rgb, FadeMode, FadeSource, FadeStepStart, FadeStepChoice, FadeStepSort, CustomFadeSource } from '../redux/types';
import * as selectors from '../redux/selectors';
import * as settings from '../redux/settings';
import { getMaxWeightSteps } from '../utils/charWeight';
import { caseModeFromCharset, computeWeightDistribution, buildCategorySet } from '../utils/charWeightConfig';
import {
  getSettingsCurrentColorPalette,
  getSettingsCurrentVic20ColorPalette,
  getSettingsCurrentPetColorPalette,
  getSettingsCustomFadeSources,
} from '../redux/settingsSelectors';

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

const selectStyle: React.CSSProperties = {
  fontSize: '10px',
  background: '#333',
  color: '#aaa',
  border: '1px solid #555',
  padding: '1px 2px',
  cursor: 'pointer',
};

// --- Step Start toggle ---
const STEP_START_CYCLE: FadeStepStart[] = ['first', 'last', 'middle'];
const STEP_START_LABELS: Record<FadeStepStart, string> = { first: 'F', last: 'L', middle: 'M' };
const STEP_START_TIPS: Record<FadeStepStart, string> = {
  first: 'Step Start: First – begin from the first character in the weight level',
  last: 'Step Start: Last – begin from the last character in the weight level',
  middle: 'Step Start: Middle – begin from the middle of the weight level',
};

// --- Step Count toggle ---
const STEP_COUNT_CYCLE: number[] = [1, 2, 4, 0];
const STEP_COUNT_LABELS: Record<number, string> = { 1: '1', 2: '2', 4: '4', 0: 'A' };
const STEP_COUNT_TIPS: Record<number, string> = {
  1: 'Step Count: 1 \u2013 single character window per weight level',
  2: 'Step Count: 2 \u2013 two-character window per weight level',
  4: 'Step Count: 4 \u2013 four-character window per weight level',
  0: 'Step Count: All \u2013 all characters in the weight level',
};

// --- Step Choice toggle ---
const STEP_CHOICE_CYCLE: FadeStepChoice[] = ['pingpong', 'rampUp', 'rampDown', 'random', 'direction'];
const STEP_CHOICE_LABELS: Record<FadeStepChoice, string> = {
  pingpong: 'P', rampUp: 'RU', rampDown: 'RD', random: 'R', direction: 'D',
};
const STEP_CHOICE_TIPS: Record<FadeStepChoice, string> = {
  pingpong: 'Step Choice: PingPong – bounce back and forth through the window',
  rampUp: 'Step Choice: Ramp Up – cycle forward through the window',
  rampDown: 'Step Choice: Ramp Down – cycle backward through the window',
  random: 'Step Choice: Random – random pick from the window',
  direction: 'Step Choice: Direction – prefer characters with matching visual direction',
};

// --- Step Sort toggle ---
const STEP_SORT_LABELS: Record<string, string> = { default: 'D', random: 'R' };
const STEP_SORT_TIPS: Record<string, string> = {
  default: 'Step Sort: Default – characters in default ROM order within each level',
  random: 'Step Sort: Random – characters shuffled randomly within each level',
};

/** Generate a short stable ID for custom fade source groups. */
function generateSourceId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const SOURCE_OPTIONS: { value: FadeSource; label: string }[] = [
  { value: 'AllCharacters', label: 'All Chars' },
  { value: 'AlphaNumeric', label: 'AlphaNum' },
  { value: 'AlphaNumExtended', label: 'AlphaNum+' },
  { value: 'PETSCII', label: 'PETSCII' },
  { value: 'Blocks', label: 'Blocks' },
  { value: 'HorizontalLines', label: 'H-Lines' },
  { value: 'VerticalLines', label: 'V-Lines' },
  { value: 'DiagonalLines', label: 'Diag' },
  { value: 'BoxesBlocks', label: 'Boxes' },
  { value: 'Symbols', label: 'Symbols' },
];

interface ToolPanelProps {
  selectedTool: Tool;
  fadeMode: FadeMode;
  fadeStrength: number;
  fadeSource: FadeSource;
  fadeShowSource: boolean;
  fadeEditMode: boolean;
  fadeStepStart: FadeStepStart;
  fadeStepCount: number;
  fadeStepChoice: FadeStepChoice;
  fadeStepSort: FadeStepSort;
  font: Font;
  charset: string;
  colorPalette: Rgb[];
  textColor: number;
  backgroundColor: number;
  customFadeSources: CustomFadeSource[];
  Toolbar: {
    setFadeMode: (mode: FadeMode) => void;
    setFadeStrength: (strength: number) => void;
    setFadeSource: (source: FadeSource) => void;
    setFadeShowSource: (flag: boolean) => void;
    setFadeEditMode: (flag: boolean) => void;
    setFadeStepStart: (s: FadeStepStart) => void;
    setFadeStepCount: (n: number) => void;
    setFadeStepChoice: (c: FadeStepChoice) => void;
    setFadeStepSort: (s: FadeStepSort) => void;
  };
  Settings: {
    setCustomFadeSources: (sources: CustomFadeSource[]) => void;
    saveEdits: () => void;
  };
}

/** Toggle style for header controls (compact). */
const toggleStyle = (active?: boolean): React.CSSProperties => ({
  fontSize: '10px',
  fontWeight: 'bold',
  background: active ? '#555' : '#333',
  color: active ? '#fff' : '#aaa',
  border: '1px solid #555',
  padding: '1px 4px',
  cursor: 'pointer',
  userSelect: 'none',
  lineHeight: '14px',
});

/** Toggle style for panel body controls (guide-panel icon size). */
const panelToggleStyle = (active?: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '22px',
  fontSize: '12px',
  fontWeight: 'bold',
  color: active ? '#fff' : '#999',
  background: active ? '#008CBA' : '#383838',
  border: `1px solid ${active ? '#008CBA' : '#555'}`,
  cursor: 'pointer',
  userSelect: 'none',
});

/** Preview of source characters ordered by weight level with grayscale grid-line indicators. */
function FadeSourcePreview({ font, fadeSource, charset, colorPalette, textColor, backgroundColor,
  stepStart, stepCount, stepSort, customScreencodes,
}: {
  font: Font;
  fadeSource: FadeSource;
  charset: string;
  colorPalette: Rgb[];
  textColor: number;
  backgroundColor: number;
  stepStart: FadeStepStart;
  stepCount: number;
  stepSort: FadeStepSort;
  customScreencodes?: number[];
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [hoverTip, setHoverTip] = React.useState('');
  const [hoverStep, setHoverStep] = React.useState<number | null>(null);
  const caseMode = caseModeFromCharset(charset);
  const steps = computeWeightDistribution(font.bits, fadeSource as any, caseMode, customScreencodes);

  // steps are heavy-first; reverse for light-first ordering
  const lightFirst = [...steps].reverse();

  // Build ordered list, applying step toggles to each weight level
  const chars: { sc: number; step: number }[] = [];
  const N = lightFirst.length;
  for (let i = 0; i < N; i++) {
    let codes = [...lightFirst[i].screencodes];

    // Apply step sort
    if (stepSort === 'random') {
      for (let k = codes.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));
        [codes[k], codes[j]] = [codes[j], codes[k]];
      }
    }

    // Apply step start + count windowing (0 = all)
    if (stepCount > 0 && codes.length > stepCount) {
      let start: number;
      switch (stepStart) {
        case 'last':   start = codes.length - 1; break;
        case 'middle': start = Math.floor(codes.length / 2); break;
        default:       start = 0; break;
      }
      const winStart = Math.max(0, Math.min(codes.length - stepCount, start - Math.floor(stepCount / 2)));
      codes = codes.slice(winStart, winStart + stepCount);
    }

    for (const sc of codes) {
      chars.push({ sc, step: i + 1 });
    }
  }

  const COLS = 16;
  const rows = Math.ceil(chars.length / COLS);
  const cellSize = 9;
  const canvasW = COLS * cellSize;
  const canvasH = rows * cellSize;
  const fgColor = colorPalette[textColor];
  const bgColor = colorPalette[backgroundColor];

  // Cell layout: [1px gutter][8px character] per axis.
  // Step boundaries marked by a bright accent on the left gutter of the first
  // character in each new step; all other gutters are dark.
  React.useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || chars.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fill entire canvas with document background
    ctx.fillStyle = `rgb(${bgColor.r},${bgColor.g},${bgColor.b})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < chars.length; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const gx = col * cellSize;   // grid-line x
      const gy = row * cellSize;   // grid-line y
      const cx = gx + 1;           // character x
      const cy = gy + 1;           // character y
      const { sc, step } = chars[i];
      const isBoundary = i === 0 || step !== chars[i - 1].step;
      const isHovered = step === hoverStep;

      // Left gutter: bright accent at step boundary, dark otherwise
      ctx.fillStyle = isBoundary ? '#999' : '#333';
      ctx.fillRect(gx, gy, 1, cellSize);
      // Top gutter: always dark
      ctx.fillStyle = '#333';
      ctx.fillRect(gx, gy, cellSize, 1);

      // Hover highlight: semi-transparent fill over the char cell
      if (isHovered) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(cx, cy, 8, 8);
      }

      // Character bitmap
      const boffs = sc * 8;
      ctx.fillStyle = `rgb(${fgColor.r},${fgColor.g},${fgColor.b})`;
      for (let py = 0; py < 8; py++) {
        const byte = font.bits[boffs + py];
        for (let px = 0; px < 8; px++) {
          if ((128 >> px) & byte) {
            ctx.fillRect(cx + px, cy + py, 1, 1);
          }
        }
      }
    }
  }, [font, fadeSource, charset, colorPalette, textColor, backgroundColor, stepStart, stepCount, stepSort, customScreencodes, hoverStep]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const col = Math.floor((e.clientX - rect.left) * sx / cellSize);
    const row = Math.floor((e.clientY - rect.top) * sy / cellSize);
    const idx = row * COLS + col;
    if (idx >= 0 && idx < chars.length && col >= 0 && col < COLS) {
      setHoverTip(`Step ${chars[idx].step} / ${N}`);
      setHoverStep(chars[idx].step);
    } else {
      setHoverTip('');
      setHoverStep(null);
    }
  };

  return (
    <div style={{ padding: '2px 4px', maxHeight: '144px', overflow: 'auto' }}>
      <canvas
        ref={canvasRef}
        title={hoverTip}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setHoverTip(''); setHoverStep(null); }}
        style={{
          imageRendering: 'pixelated',
          width: `${canvasW * 2}px`,
          height: `${canvasH * 2}px`,
        }}
        width={canvasW}
        height={canvasH}
      />
    </div>
  );
}

/** Character grid editor for custom fade source groups. */
function FadeSourceEditor({ font, colorPalette, textColor, backgroundColor, charset,
  customSource, onToggleScreencode, onNameChange, onSave,
}: {
  font: Font;
  colorPalette: Rgb[];
  textColor: number;
  backgroundColor: number;
  charset: string;
  customSource: CustomFadeSource;
  onToggleScreencode: (sc: number) => void;
  onNameChange: (name: string) => void;
  onSave: () => void;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const included = new Set(customSource.screencodes);
  const charOrder = font.charOrder; // Petmate standard sort order
  const COLS = 16;
  const ROWS = 17; // 16×17 = 272 slots (same as Characters panel)
  const totalCells = COLS * ROWS;
  const cellSize = 9;
  const canvasW = COLS * cellSize;
  const canvasH = ROWS * cellSize;
  const fgColor = colorPalette[textColor];
  const bgColor = colorPalette[backgroundColor];

  React.useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = `rgb(${bgColor.r},${bgColor.g},${bgColor.b})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < totalCells; i++) {
      const sc = i < charOrder.length ? charOrder[i] : -1;
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const gx = col * cellSize;
      const gy = row * cellSize;
      const cx = gx + 1;
      const cy = gy + 1;

      // Grid gutters (uniform — no inclusion-based coloring)
      ctx.fillStyle = '#333';
      ctx.fillRect(gx, gy, 1, cellSize);
      ctx.fillRect(gx, gy, cellSize, 1);

      if (sc < 0 || sc >= 256) continue;

      const boffs = sc * 8;
      // Selected chars: full fgColor. Unselected: 50% opacity.
      ctx.fillStyle = included.has(sc)
        ? `rgb(${fgColor.r},${fgColor.g},${fgColor.b})`
        : `rgba(${fgColor.r},${fgColor.g},${fgColor.b},0.5)`;
      for (let py = 0; py < 8; py++) {
        const byte = font.bits[boffs + py];
        for (let px = 0; px < 8; px++) {
          if ((128 >> px) & byte) {
            ctx.fillRect(cx + px, cy + py, 1, 1);
          }
        }
      }
    }
  }, [font, colorPalette, textColor, backgroundColor, customSource]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const col = Math.floor((e.clientX - rect.left) * sx / cellSize);
    const row = Math.floor((e.clientY - rect.top) * sy / cellSize);
    const idx = row * COLS + col;
    if (idx >= 0 && idx < charOrder.length && col >= 0 && col < COLS) {
      const sc = charOrder[idx];
      if (sc >= 0 && sc < 256) onToggleScreencode(sc);
    }
  };

  return (
    <div style={{ padding: '2px 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
        <input
          type="text"
          value={customSource.name}
          onChange={(e) => onNameChange(e.target.value)}
          style={{
            flex: 1,
            fontSize: '10px',
            background: '#333',
            color: '#ccc',
            border: '1px solid #555',
            padding: '2px 4px',
            outline: 'none',
          }}
          title="Edit group name"
          onKeyDown={(e) => e.stopPropagation()}
          onKeyUp={(e) => e.stopPropagation()}
        />
        <div style={toggleStyle()} onClick={onSave} title="Save and close editor">Save</div>
        <span style={{ fontSize: '9px', color: '#666' }}>{customSource.screencodes.length} chars</span>
      </div>
      <div style={{ fontSize: '9px', color: '#888', marginBottom: '2px' }}>
        Click characters to add/remove
      </div>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        style={{ imageRendering: 'pixelated', width: `${canvasW * 2}px`, height: `${canvasH * 2}px`, cursor: 'pointer' }}
        width={canvasW}
        height={canvasH}
      />
    </div>
  );
}

function ToolPanel({ selectedTool, fadeMode, fadeStrength, fadeSource, fadeShowSource, fadeEditMode, fadeStepStart, fadeStepCount, fadeStepChoice, fadeStepSort, font, charset, colorPalette, textColor, backgroundColor, customFadeSources, Toolbar: tb, Settings: st }: ToolPanelProps) {
  if (selectedTool === Tool.FadeLighten) {
    const caseMode = caseModeFromCharset(charset);
    // Resolve custom source screencodes if applicable
    const customScs = fadeSource.startsWith('Custom:')
      ? customFadeSources.find(cs => cs.id === fadeSource.slice('Custom:'.length))?.screencodes
      : undefined;
    const maxSteps = getMaxWeightSteps(font, fadeSource as any, caseMode, customScs);
    const clampedStrength = Math.min(fadeStrength, maxSteps);

    const cycleStart = () => {
      const idx = STEP_START_CYCLE.indexOf(fadeStepStart);
      tb.setFadeStepStart(STEP_START_CYCLE[(idx + 1) % STEP_START_CYCLE.length]);
    };
    const cycleCount = () => {
      const idx = STEP_COUNT_CYCLE.indexOf(fadeStepCount);
      tb.setFadeStepCount(STEP_COUNT_CYCLE[(idx + 1) % STEP_COUNT_CYCLE.length]);
    };
    const cycleChoice = () => {
      const idx = STEP_CHOICE_CYCLE.indexOf(fadeStepChoice);
      tb.setFadeStepChoice(STEP_CHOICE_CYCLE[(idx + 1) % STEP_CHOICE_CYCLE.length]);
    };
    const cycleSort = () => {
      tb.setFadeStepSort(fadeStepSort === 'default' ? 'random' : 'default');
    };

    return (
      <div>
        {/* Row 1: Step toggles sub-toolbar (guide-panel icon size) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', padding: '2px 4px' }}>
          <div style={panelToggleStyle(fadeShowSource)}
            onClick={() => tb.setFadeShowSource(!fadeShowSource)}
            title="Source preview: show character weight levels in the fade panel"
          >S</div>
          <div style={{ width: '1px', height: '16px', background: '#555', flexShrink: 0 }} />
          <div style={panelToggleStyle()} onClick={cycleStart}
            title={STEP_START_TIPS[fadeStepStart]}
          >{STEP_START_LABELS[fadeStepStart]}</div>
          <div style={panelToggleStyle()} onClick={cycleCount}
            title={STEP_COUNT_TIPS[fadeStepCount] ?? `Step Count: ${fadeStepCount}`}
          >{STEP_COUNT_LABELS[fadeStepCount] ?? fadeStepCount}</div>
          <div style={panelToggleStyle()} onClick={cycleChoice}
            title={STEP_CHOICE_TIPS[fadeStepChoice]}
          >{STEP_CHOICE_LABELS[fadeStepChoice]}</div>
          <div style={{ width: '1px', height: '16px', background: '#555', flexShrink: 0 }} />
          <div style={panelToggleStyle(fadeStepSort === 'random')} onClick={cycleSort}
            title={STEP_SORT_TIPS[fadeStepSort]}
          >{STEP_SORT_LABELS[fadeStepSort]}</div>
        </div>
        {/* Row 2: Lighten / Darken + strength slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 4px' }}>
          <button
            style={fadeMode === 'lighten' ? activeBtnStyle : btnStyle}
            onClick={() => tb.setFadeMode('lighten')}
            title="Lighten: step towards fewer pixels (lighter characters)"
          >
            Lighten
          </button>
          <button
            style={fadeMode === 'darken' ? activeBtnStyle : btnStyle}
            onClick={() => tb.setFadeMode('darken')}
            title="Darken: step towards more pixels (heavier characters)"
          >
            Darken
          </button>
          <input
            type="range"
            min={1}
            max={maxSteps}
            value={clampedStrength}
            onChange={(e) => tb.setFadeStrength(Number(e.target.value))}
            style={{ flex: 1, cursor: 'pointer', height: '12px' }}
            title={`Step strength: how many weight levels to jump per application (1\u2013${maxSteps})`}
          />
          <span
            style={{ fontSize: '10px', color: '#aaa', minWidth: '14px', textAlign: 'right' }}
            title="Current step strength"
          >
            {clampedStrength}
          </span>
        </div>
        {/* Edit panel for custom source groups */}
        {fadeEditMode && fadeSource.startsWith('Custom:') && (() => {
          const sourceId = fadeSource.slice('Custom:'.length);
          const cs = customFadeSources.find(c => c.id === sourceId);
          if (!cs) return null;
          const handleToggle = (sc: number) => {
            const scs = new Set(cs.screencodes);
            if (scs.has(sc)) scs.delete(sc); else scs.add(sc);
            const next = customFadeSources.map(c =>
              c.id === sourceId ? { ...c, screencodes: [...scs].sort((a, b) => a - b) } : c
            );
            st.setCustomFadeSources(next);
            st.saveEdits();
          };
          const handleNameChange = (name: string) => {
            const next = customFadeSources.map(c => c.id === sourceId ? { ...c, name } : c);
            st.setCustomFadeSources(next);
            st.saveEdits();
          };
          return (
            <FadeSourceEditor
              font={font}
              colorPalette={colorPalette}
              textColor={textColor}
              backgroundColor={backgroundColor}
              charset={charset}
              customSource={cs}
              onToggleScreencode={handleToggle}
              onNameChange={handleNameChange}
              onSave={() => tb.setFadeEditMode(false)}
            />
          );
        })()}
        {/* Source preview canvas */}
        {fadeShowSource && !fadeEditMode && (
          <FadeSourcePreview
            font={font}
            fadeSource={fadeSource}
            charset={charset}
            colorPalette={colorPalette}
            textColor={textColor}
            backgroundColor={backgroundColor}
            stepStart={fadeStepStart}
          stepCount={fadeStepCount}
          stepSort={fadeStepSort}
          customScreencodes={customScs}
        />
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: '8px', color: '#aaa', fontSize: '12px' }}>
      <em>Options</em> — coming soon
    </div>
  );
}

/** Header controls for the Fade/Lighten panel: source dropdown + CRUD buttons. */
function FadeHeaderControlsInner({
  fadeSource, fadeEditMode, customFadeSources, Toolbar: tb, Settings: st,
}: {
  fadeSource: FadeSource;
  fadeEditMode: boolean;
  customFadeSources: CustomFadeSource[];
  Toolbar: {
    setFadeSource: (source: FadeSource) => void;
    setFadeEditMode: (flag: boolean) => void;
  };
  Settings: {
    setCustomFadeSources: (sources: CustomFadeSource[]) => void;
    saveEdits: () => void;
  };
}) {
  const isCustom = fadeSource.startsWith('Custom:');
  const allOptions = [
    ...SOURCE_OPTIONS,
    ...customFadeSources.map(cs => ({ value: `Custom:${cs.id}`, label: cs.name })),
  ];
  const currentLabel = allOptions.find(o => o.value === fadeSource)?.label ?? fadeSource;

  // Resolve screencodes for the current source (built-in or custom)
  const resolveCurrentScreencodes = (): number[] => {
    if (isCustom) {
      const sourceId = fadeSource.slice('Custom:'.length);
      return customFadeSources.find(cs => cs.id === sourceId)?.screencodes ?? [];
    }
    const set = buildCategorySet(fadeSource as any, 'upper');
    return [...set];
  };

  const handleNew = () => {
    const scs = resolveCurrentScreencodes();
    const newSource: CustomFadeSource = { id: generateSourceId(), name: `Copy of ${currentLabel}`, screencodes: [...scs] };
    const next = [...customFadeSources, newSource];
    st.setCustomFadeSources(next);
    st.saveEdits();
    tb.setFadeSource(`Custom:${newSource.id}`);
  };

  const handleDelete = () => {
    if (!isCustom) return;
    const sourceId = fadeSource.slice('Custom:'.length);
    const next = customFadeSources.filter(cs => cs.id !== sourceId);
    st.setCustomFadeSources(next);
    st.saveEdits();
    tb.setFadeSource('AllCharacters');
    tb.setFadeEditMode(false);
  };

  const handleEdit = () => {
    if (isCustom) tb.setFadeEditMode(!fadeEditMode);
  };

  return (
    <>
      <div style={toggleStyle(isCustom && fadeEditMode)}
        onClick={handleEdit}
        title={isCustom ? 'Edit source group characters' : 'Edit: only available for custom groups (use + to create one)'}
      >E</div>
      <select
        value={fadeSource}
        onChange={(e) => { tb.setFadeSource(e.target.value as FadeSource); tb.setFadeEditMode(false); }}
        style={selectStyle}
        title="Source: which character category to use for fade/lighten stepping"
      >
        {allOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <div style={toggleStyle()} onClick={handleNew} title={`New: copy \u201c${currentLabel}\u201d as a new group`}>+</div>
      <div style={isCustom ? toggleStyle() : { ...toggleStyle(), opacity: 0.3, cursor: 'default' }}
        onClick={handleDelete}
        title={isCustom ? 'Delete this custom source group' : 'Delete: only custom groups can be deleted'}
      >🗑</div>
    </>
  );
}

export const FadeHeaderControls = connect(
  (state: RootState) => ({
    fadeSource: state.toolbar.fadeSource,
    fadeEditMode: state.toolbar.fadeEditMode,
    customFadeSources: getSettingsCustomFadeSources(state),
  }),
  (dispatch) => ({
    Toolbar: Toolbar.bindDispatch(dispatch),
    Settings: bindActionCreators(settings.actions, dispatch),
  })
)(FadeHeaderControlsInner);

export default connect(
  (state: RootState) => {
    const { charset, font } = selectors.getCurrentFramebufFont(state);
    const framebuf = selectors.getCurrentFramebuf(state);
    const prefix = charset.substring(0, 3);
    let colorPalette = getSettingsCurrentColorPalette(state);
    if (prefix === 'vic') colorPalette = getSettingsCurrentVic20ColorPalette(state);
    else if (prefix === 'pet') colorPalette = getSettingsCurrentPetColorPalette(state);
    return {
      fadeMode: state.toolbar.fadeMode,
      fadeStrength: state.toolbar.fadeStrength,
      fadeSource: state.toolbar.fadeSource,
      fadeShowSource: state.toolbar.fadeShowSource,
      fadeEditMode: state.toolbar.fadeEditMode,
      fadeStepStart: state.toolbar.fadeStepStart,
      fadeStepCount: state.toolbar.fadeStepCount,
      fadeStepChoice: state.toolbar.fadeStepChoice,
      fadeStepSort: state.toolbar.fadeStepSort,
      font,
      charset,
      colorPalette,
      textColor: state.toolbar.textColor,
      backgroundColor: framebuf ? framebuf.backgroundColor : 0,
      customFadeSources: getSettingsCustomFadeSources(state),
    };
  },
  (dispatch) => ({
    Toolbar: Toolbar.bindDispatch(dispatch),
    Settings: bindActionCreators(settings.actions, dispatch),
  })
)(ToolPanel);
