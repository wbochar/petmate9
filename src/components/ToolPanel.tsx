import React from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import { Toolbar } from '../redux/toolbar';
import { Framebuffer, CHARSET_UPPER } from '../redux/editor';
import * as Screens from '../redux/screens';
import * as screensSelectors from '../redux/screensSelectors';
import { RootState, Tool, Font, Rgb, Pixel, FadeMode, FadeSource, FadeStepStart, FadeStepChoice, FadeStepSort, FadePresetToggles, CustomFadeSource, Framebuf as FramebufType } from '../redux/types';
import * as selectors from '../redux/selectors';
import * as settings from '../redux/settings';
import { getMaxWeightSteps } from '../utils/charWeight';
import { caseModeFromCharset, computeWeightDistribution } from '../utils/charWeightConfig';
import {
  getSettingsCurrentColorPalette,
  getSettingsCurrentVic20ColorPalette,
  getSettingsCurrentPetColorPalette,
  getSettingsCustomFadeSources,
} from '../redux/settingsSelectors';
import { vdcPalette } from '../utils/palette';

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

const activeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'var(--panel-btn-active-bg)',
  color: 'var(--panel-btn-active-color)',
};

const selectStyle: React.CSSProperties = {
  fontSize: '10px',
  background: 'var(--panel-btn-bg)',
  color: 'var(--panel-btn-color)',
  border: '1px solid var(--panel-btn-border)',
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

/** The first 4 built-in sources are "fixed" presets (marked with *).
 *  Custom sources created by the user are listed after these. */
const SOURCE_OPTIONS: { value: FadeSource; label: string }[] = [
  { value: 'AllCharacters', label: '*All Chars' },
  { value: 'AlphaNumeric', label: '*AlphaNum' },
  { value: 'AlphaNumExtended', label: '*AlphaNum+' },
  { value: 'PETSCII', label: '*PETSCII' },
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
    switchFadeSource: (source: FadeSource) => void;
    saveFadeToggles: () => void;
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
  background: active ? 'var(--panel-btn-active-bg)' : 'var(--panel-btn-bg)',
  color: active ? 'var(--panel-btn-active-color)' : 'var(--panel-btn-color)',
  border: '1px solid var(--panel-btn-border)',
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
  color: active ? '#fff' : 'var(--subtle-text-color)',
  background: active ? '#008CBA' : 'var(--panel-btn-bg)',
  border: `1px solid ${active ? '#008CBA' : 'var(--panel-btn-border)'}`,
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
  // Seed counter: incremented on click to re-shuffle random sort.
  const [shuffleSeed, setShuffleSeed] = React.useState(0);
  const caseMode = caseModeFromCharset(charset);

  // Memoize the character list so random shuffle only happens when inputs
  // change or the user clicks (shuffleSeed), NOT on every hover.
  const { chars, N } = React.useMemo(() => {
    const steps = computeWeightDistribution(font.bits, fadeSource as any, caseMode, customScreencodes);
    const lightFirst = [...steps].reverse();
    const result: { sc: number; step: number }[] = [];
    const totalSteps = lightFirst.length;
    for (let i = 0; i < totalSteps; i++) {
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
        result.push({ sc, step: i + 1 });
      }
    }
    return { chars: result, N: totalSteps };
  }, [font, fadeSource, charset, stepStart, stepCount, stepSort, customScreencodes, shuffleSeed]);

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
  }, [chars, colorPalette, textColor, backgroundColor, hoverStep]);

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

  const handleClick = () => {
    if (stepSort === 'random') setShuffleSeed(s => s + 1);
  };

  return (
    <div style={{ padding: '2px 4px', maxHeight: '144px', overflow: 'auto' }}>
      <canvas
        ref={canvasRef}
        title={hoverTip}
        onClick={handleClick}
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
  customSource, onToggleScreencode, onNameChange, onSave, onClear,
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
  onClear: () => void;
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

  const [localName, setLocalName] = React.useState(customSource.name);
  React.useEffect(() => { setLocalName(customSource.name); }, [customSource.name]);

  return (
    <div style={{ padding: '2px 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
        <input
          type="text"
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          onBlur={() => onNameChange(localName)}
          style={{
            flex: 1,
            fontSize: '10px',
            background: 'var(--panel-input-bg)',
            color: 'var(--panel-input-color)',
            border: '1px solid var(--panel-btn-border)',
            padding: '2px 4px',
            outline: 'none',
          }}
          title="Edit group name"
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
            e.stopPropagation();
          }}
          onKeyUp={(e) => e.stopPropagation()}
        />
        <div style={toggleStyle()} onClick={onSave} title="Save and close editor">Save</div>
        <span style={{ fontSize: '9px', color: 'var(--panel-hint-color)' }}>{customSource.screencodes.length} chars</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
        <span style={{ fontSize: '9px', color: 'var(--panel-label-color)' }}>Click characters to add/remove</span>
        <div style={toggleStyle()} onClick={onClear} title="Clear all selected characters">Clear</div>
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
      // Defer save so new value is in Redux first
      setTimeout(() => tb.saveFadeToggles(), 0);
    };
    const cycleCount = () => {
      const idx = STEP_COUNT_CYCLE.indexOf(fadeStepCount);
      tb.setFadeStepCount(STEP_COUNT_CYCLE[(idx + 1) % STEP_COUNT_CYCLE.length]);
      setTimeout(() => tb.saveFadeToggles(), 0);
    };
    const cycleChoice = () => {
      const idx = STEP_CHOICE_CYCLE.indexOf(fadeStepChoice);
      tb.setFadeStepChoice(STEP_CHOICE_CYCLE[(idx + 1) % STEP_CHOICE_CYCLE.length]);
      setTimeout(() => tb.saveFadeToggles(), 0);
    };
    const cycleSort = () => {
      tb.setFadeStepSort(fadeStepSort === 'default' ? 'random' : 'default');
      setTimeout(() => tb.saveFadeToggles(), 0);
    };
    const toggleShowSource = () => {
      tb.setFadeShowSource(!fadeShowSource);
      setTimeout(() => tb.saveFadeToggles(), 0);
    };

    return (
      <div>
        {/* Row 1: Step toggles + source dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', padding: '2px 4px' }}>
          <div style={panelToggleStyle(fadeShowSource)}
            onClick={toggleShowSource}
            title="Source preview: show character weight levels in the fade panel"
          >S</div>
          <div style={{ width: '1px', height: '16px', background: 'var(--panel-btn-border)', flexShrink: 0 }} />
          <div style={panelToggleStyle()} onClick={cycleStart}
            title={STEP_START_TIPS[fadeStepStart]}
          >{STEP_START_LABELS[fadeStepStart]}</div>
          <div style={panelToggleStyle()} onClick={cycleCount}
            title={STEP_COUNT_TIPS[fadeStepCount] ?? `Step Count: ${fadeStepCount}`}
          >{STEP_COUNT_LABELS[fadeStepCount] ?? fadeStepCount}</div>
          <div style={panelToggleStyle()} onClick={cycleChoice}
            title={STEP_CHOICE_TIPS[fadeStepChoice]}
          >{STEP_CHOICE_LABELS[fadeStepChoice]}</div>
          <div style={{ width: '1px', height: '16px', background: 'var(--panel-btn-border)', flexShrink: 0 }} />
          <div style={panelToggleStyle(fadeStepSort === 'random')} onClick={cycleSort}
            title={STEP_SORT_TIPS[fadeStepSort]}
          >{STEP_SORT_LABELS[fadeStepSort]}</div>
          <div style={{ width: '1px', height: '16px', background: 'var(--panel-btn-border)', flexShrink: 0 }} />
          <select
            value={fadeSource}
            onChange={(e) => { tb.switchFadeSource(e.target.value as FadeSource); }}
            style={{ ...selectStyle, flex: 1, minWidth: 0, height: '22px', boxSizing: 'border-box' }}
            title="Source: which character category to use for fade/lighten stepping"
          >
            {[
              ...SOURCE_OPTIONS,
              ...customFadeSources.map(cs => ({ value: `Custom:${cs.id}`, label: cs.name })),
            ].map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
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
            style={{ fontSize: '10px', color: 'var(--panel-btn-color)', minWidth: '14px', textAlign: 'right' }}
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
          const handleClear = () => {
            const next = customFadeSources.map(c =>
              c.id === sourceId ? { ...c, screencodes: [] } : c
            );
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
              onClear={handleClear}
            />
          );
        })()}
        {/* Source preview canvas */}
        {fadeShowSource && !fadeEditMode && (
          <FadeSourcePreview
            key={`${fadeSource}:${customScs ? customScs.reduce((h, v) => h * 31 + v, 0) : 0}`}
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

// ---- Fade export / import encoding helpers ----

const FADE_MARKER = 0xBE;
const FADE_EXPORT_W = 16;

const STEP_START_VALUES: FadeStepStart[] = ['first', 'last', 'middle'];
const STEP_CHOICE_VALUES: FadeStepChoice[] = ['pingpong', 'rampUp', 'rampDown', 'random', 'direction'];

function encodeFadeName(name: string): number[] {
  const row = Array(FADE_EXPORT_W).fill(0x20);
  for (let i = 0; i < Math.min(name.length, FADE_EXPORT_W); i++) {
    const ch = name.charCodeAt(i);
    if (ch >= 65 && ch <= 90) row[i] = ch - 64;
    else if (ch >= 97 && ch <= 122) row[i] = ch - 96;
    else if (ch >= 48 && ch <= 57) row[i] = ch - 48 + 0x30;
    else row[i] = 0x20;
  }
  return row;
}

function decodeFadeName(codes: number[]): string {
  let name = '';
  for (let i = 0; i < Math.min(codes.length, FADE_EXPORT_W); i++) {
    const c = codes[i];
    if (c >= 1 && c <= 26) name += String.fromCharCode(c + 64);
    else if (c >= 0x30 && c <= 0x39) name += String.fromCharCode(c - 0x30 + 48);
    else if (c === 0x20) name += ' ';
    else name += '?';
  }
  return name.trimEnd();
}

/** Header controls for the Fade/Lighten panel: source dropdown + CRUD buttons + export/import. */
function FadeHeaderControlsInner({
  fadeSource, fadeEditMode, fadeDrawMode, customFadeSources, fadeSourceToggles,
  textColor, backgroundColor, framebuf: currentFramebuf,
  Toolbar: tb, Settings: st, dispatch,
}: {
  fadeSource: FadeSource;
  fadeEditMode: boolean;
  fadeDrawMode: boolean;
  customFadeSources: CustomFadeSource[];
  fadeSourceToggles: Record<string, FadePresetToggles>;
  textColor: number;
  backgroundColor: number;
  framebuf: FramebufType | null;
  Toolbar: {
    setFadeSource: (source: FadeSource) => void;
    setFadeEditMode: (flag: boolean) => void;
    switchFadeSource: (source: FadeSource) => void;
    setFadeDrawMode: (flag: boolean) => void;
    resetBrush: () => void;
  };
  Settings: {
    setCustomFadeSources: (sources: CustomFadeSource[]) => void;
    setFadeSourceToggles: (t: Record<string, FadePresetToggles>) => void;
    saveEdits: () => void;
  };
  dispatch: any;
}) {
  const isCustom = fadeSource.startsWith('Custom:');
  const allOptions = [
    ...SOURCE_OPTIONS,
    ...customFadeSources.map(cs => ({ value: `Custom:${cs.id}`, label: cs.name })),
  ];

  const handleNew = () => {
    const nextNum = customFadeSources.length + 1;
    const newSource: CustomFadeSource = { id: generateSourceId(), name: `New Preset ${nextNum}`, screencodes: [] };
    const next = [...customFadeSources, newSource];
    st.setCustomFadeSources(next);
    st.saveEdits();
    tb.switchFadeSource(`Custom:${newSource.id}`);
    tb.setFadeEditMode(true);
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

  // ---- Export: write all custom sources + toggle settings to a new screen ----
  const handleExport = () => {
    const BLANK = 0x20;
    const fbPixels: Pixel[][] = [];

    // Helper: build header + name + screencode rows for one entry
    const writeEntry = (toggles: FadePresetToggles | undefined, scCount: number, builtinIdx: number) => {
      const t = toggles ?? { fadeShowSource: true, fadeStepStart: 'first' as FadeStepStart, fadeStepCount: 1, fadeStepChoice: 'pingpong' as FadeStepChoice, fadeStepSort: 'default' as FadeStepSort };
      const hdr = Array(FADE_EXPORT_W).fill(BLANK);
      hdr[0] = FADE_MARKER;
      hdr[1] = t.fadeShowSource ? 1 : 0;
      hdr[2] = STEP_START_VALUES.indexOf(t.fadeStepStart);
      hdr[3] = t.fadeStepCount;
      hdr[4] = STEP_CHOICE_VALUES.indexOf(t.fadeStepChoice);
      hdr[5] = t.fadeStepSort === 'random' ? 1 : 0;
      hdr[6] = (scCount >> 8) & 0xFF;
      hdr[7] = scCount & 0xFF;
      hdr[8] = builtinIdx;
      fbPixels.push(hdr.map(code => ({ code, color: 0 } as Pixel)));
    };

    // 1. Built-in presets (toggles only)
    SOURCE_OPTIONS.forEach((opt, idx) => {
      writeEntry(fadeSourceToggles[opt.value], 0, idx);
      fbPixels.push(encodeFadeName(opt.label).map(code => ({ code, color: textColor } as Pixel)));
    });

    // 2. Custom presets (toggles + screencodes)
    for (const cs of customFadeSources) {
      const key = `Custom:${cs.id}`;
      writeEntry(fadeSourceToggles[key], cs.screencodes.length, 0xFF);
      fbPixels.push(encodeFadeName(cs.name).map(code => ({ code, color: textColor } as Pixel)));
      // Screencode rows, 16 per row
      for (let i = 0; i < cs.screencodes.length; i += FADE_EXPORT_W) {
        const row = Array(FADE_EXPORT_W).fill(BLANK);
        for (let j = 0; j < FADE_EXPORT_W && i + j < cs.screencodes.length; j++) {
          row[j] = cs.screencodes[i + j];
        }
        fbPixels.push(row.map(code => ({ code, color: textColor } as Pixel)));
      }
    }

    // Padding
    for (let i = 0; i < 10; i++) fbPixels.push(Array(FADE_EXPORT_W).fill({ code: BLANK, color: textColor }));

    dispatch(Screens.actions.addScreenAndFramebuf());
    dispatch((innerDispatch: any, getState: any) => {
      const state = getState();
      const newIdx = screensSelectors.getCurrentScreenFramebufIndex(state);
      if (newIdx === null) return;
      innerDispatch(Framebuffer.actions.setFields({ backgroundColor, borderColor: backgroundColor, borderOn: false, name: 'Fade_' + newIdx }, newIdx));
      innerDispatch(Framebuffer.actions.setCharset(CHARSET_UPPER, newIdx));
      innerDispatch(Framebuffer.actions.setDims({ width: FADE_EXPORT_W, height: fbPixels.length }, newIdx));
      innerDispatch(Framebuffer.actions.setFields({ framebuf: fbPixels }, newIdx));
      innerDispatch(Toolbar.actions.setZoom(102, 'left'));
    });
  };

  // ---- Import: read custom sources + toggle settings from a Fade_ screen ----
  const handleImport = () => {
    if (!currentFramebuf || currentFramebuf.width < FADE_EXPORT_W) return;
    if (!currentFramebuf.name?.startsWith('Fade_')) return;
    const fb = currentFramebuf.framebuf;
    const importedSources: CustomFadeSource[] = [];
    const importedToggles: Record<string, FadePresetToggles> = {};
    let r = 0;
    while (r < fb.length) {
      const codes = fb[r].slice(0, FADE_EXPORT_W).map((p: Pixel) => p.code);
      if (codes[0] !== FADE_MARKER) { r++; continue; }
      // Parse header
      const toggles: FadePresetToggles = {
        fadeShowSource: codes[1] === 1,
        fadeStepStart: STEP_START_VALUES[codes[2]] ?? 'first',
        fadeStepCount: codes[3],
        fadeStepChoice: STEP_CHOICE_VALUES[codes[4]] ?? 'pingpong',
        fadeStepSort: codes[5] === 1 ? 'random' : 'default',
      };
      const scCount = (codes[6] << 8) | codes[7];
      const builtinIdx = codes[8];
      r++; // advance past header
      if (r >= fb.length) break;
      // Name row
      const nameCodes = fb[r].slice(0, FADE_EXPORT_W).map((p: Pixel) => p.code);
      const name = decodeFadeName(nameCodes);
      r++;
      if (builtinIdx !== 0xFF) {
        // Built-in: just store toggles
        const opt = SOURCE_OPTIONS[builtinIdx];
        if (opt) importedToggles[opt.value] = toggles;
      } else {
        // Custom: read screencodes
        const screencodes: number[] = [];
        const scRows = Math.ceil(scCount / FADE_EXPORT_W);
        for (let sr = 0; sr < scRows && r < fb.length; sr++, r++) {
          const scRow = fb[r].slice(0, FADE_EXPORT_W).map((p: Pixel) => p.code);
          for (let j = 0; j < FADE_EXPORT_W && screencodes.length < scCount; j++) {
            screencodes.push(scRow[j]);
          }
        }
        const id = generateSourceId();
        importedSources.push({ id, name: name || `Preset ${importedSources.length + 1}`, screencodes });
        importedToggles[`Custom:${id}`] = toggles;
      }
    }
    // Apply imports
    if (importedSources.length > 0 || Object.keys(importedToggles).length > 0) {
      st.setCustomFadeSources(importedSources);
      st.setFadeSourceToggles(importedToggles);
      st.saveEdits();
      if (importedSources.length > 0) {
        tb.switchFadeSource(`Custom:${importedSources[0].id}`);
      } else {
        tb.switchFadeSource('AllCharacters');
      }
    }
  };

  return (
    <>
      <div style={toggleStyle(!fadeDrawMode)}
        onClick={() => { tb.setFadeDrawMode(false); }}
        title="Pencil mode: click/drag to fade individual cells"
      >{"\u270E"}</div>
      <div style={toggleStyle(fadeDrawMode)}
        onClick={() => { tb.setFadeDrawMode(true); tb.resetBrush(); }}
        title="Box-select mode: drag a rectangle, then apply fade to the region"
      ><span style={{ display: 'inline-block', width: '8px', height: '8px', border: '1.5px solid currentColor', verticalAlign: 'middle' }} /></div>
      {isCustom && (
        <div style={toggleStyle(isCustom && fadeEditMode)}
          onClick={handleEdit}
          title="Edit source group characters"
        >E</div>
      )}
      <div style={toggleStyle()} onClick={handleNew} title="New: create a new custom source group">+</div>
      <div style={toggleStyle()} onClick={handleExport} title="Export fade presets to new screen">{"\u2B61"}</div>
      <div style={toggleStyle()} onClick={handleImport} title="Import fade presets from current screen">{"\u2B63"}</div>
      <div style={isCustom ? toggleStyle() : { ...toggleStyle(), opacity: 0.3, cursor: 'default' }}
        onClick={handleDelete}
        title={isCustom ? 'Delete this custom source group' : 'Delete: only custom groups can be deleted'}
      >🗑</div>
    </>
  );
}

export const FadeHeaderControls = connect(
  (state: RootState) => {
    const framebuf = selectors.getCurrentFramebuf(state);
    return {
      fadeSource: state.toolbar.fadeSource,
      fadeEditMode: state.toolbar.fadeEditMode,
      fadeDrawMode: state.toolbar.fadeDrawMode,
      customFadeSources: getSettingsCustomFadeSources(state),
      fadeSourceToggles: state.settings.saved.fadeSourceToggles ?? {},
      textColor: state.toolbar.textColor,
      backgroundColor: framebuf?.backgroundColor ?? 0,
      framebuf,
    };
  },
  (dispatch: any) => ({
    Toolbar: Toolbar.bindDispatch(dispatch),
    Settings: bindActionCreators(settings.actions, dispatch),
    dispatch,
  })
)(FadeHeaderControlsInner);

export default connect(
  (state: RootState) => {
    const { charset, font } = selectors.getCurrentFramebufFont(state);
    const framebuf = selectors.getCurrentFramebuf(state);
    const prefix = charset.substring(0, 3);
    const width = framebuf?.width ?? 40;
    let colorPalette = getSettingsCurrentColorPalette(state);
    if (prefix === 'vic') colorPalette = getSettingsCurrentVic20ColorPalette(state);
    else if (prefix === 'pet') colorPalette = getSettingsCurrentPetColorPalette(state);
    else if (prefix === 'c12' && width >= 80) colorPalette = vdcPalette;
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
