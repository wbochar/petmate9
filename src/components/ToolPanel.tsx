import React from 'react';
import { connect } from 'react-redux';
import { Toolbar } from '../redux/toolbar';
import { RootState, Tool, Font, FadeMode, FadeSource, FadePickMode } from '../redux/types';
import * as selectors from '../redux/selectors';
import { getMaxWeightSteps } from '../utils/charWeight';
import { caseModeFromCharset } from '../utils/charWeightConfig';

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

const PICK_MODE_CYCLE: FadePickMode[] = ['first', 'random', 'linear'];
const PICK_MODE_LABELS: Record<FadePickMode, string> = {
  first: '1',
  random: 'R',
  linear: 'L',
};
const PICK_MODE_TIPS: Record<FadePickMode, string> = {
  first: 'First: always pick the first character in the weight level',
  random: 'Random: pick a random character in the weight level',
  linear: 'Linear: cycle through characters in the weight level (ping-pong)',
};

const SOURCE_OPTIONS: { value: FadeSource; label: string }[] = [
  { value: 'AllCharacters', label: 'All Chars' },
  { value: 'AlphaNumeric', label: 'AlphaNum' },
  { value: 'AlphaNumExtended', label: 'AlphaNum+' },
  { value: 'PETSCII', label: 'PETSCII' },
  { value: 'Blocks', label: 'Blocks' },
];

interface ToolPanelProps {
  selectedTool: Tool;
  fadeMode: FadeMode;
  fadeStrength: number;
  fadeSource: FadeSource;
  fadePickMode: FadePickMode;
  font: Font;
  charset: string;
  Toolbar: {
    setFadeMode: (mode: FadeMode) => void;
    setFadeStrength: (strength: number) => void;
    setFadeSource: (source: FadeSource) => void;
    setFadePickMode: (mode: FadePickMode) => void;
  };
}

function ToolPanel({ selectedTool, fadeMode, fadeStrength, fadeSource, fadePickMode, font, charset, Toolbar: tb }: ToolPanelProps) {
  if (selectedTool === Tool.FadeLighten) {
    const caseMode = caseModeFromCharset(charset);
    const maxSteps = getMaxWeightSteps(font, fadeSource, caseMode);
    // Clamp strength if the new source has fewer levels
    const clampedStrength = Math.min(fadeStrength, maxSteps);

    return (
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
    );
  }

  return (
    <div style={{ padding: '8px', color: '#aaa', fontSize: '12px' }}>
      <em>Options</em> — coming soon
    </div>
  );
}

/** Header controls for the Fade/Lighten panel (pick mode toggle + source dropdown). */
function FadeHeaderControlsInner({ fadeSource, fadePickMode, Toolbar: tb }: {
  fadeSource: FadeSource;
  fadePickMode: FadePickMode;
  Toolbar: {
    setFadeSource: (source: FadeSource) => void;
    setFadePickMode: (mode: FadePickMode) => void;
  };
}) {
  const nextPickMode = () => {
    const idx = PICK_MODE_CYCLE.indexOf(fadePickMode);
    tb.setFadePickMode(PICK_MODE_CYCLE[(idx + 1) % PICK_MODE_CYCLE.length]);
  };
  return (
    <>
      <div
        style={{
          fontSize: '10px',
          fontWeight: 'bold',
          background: '#333',
          color: '#aaa',
          border: '1px solid #555',
          padding: '1px 4px',
          cursor: 'pointer',
          userSelect: 'none',
          lineHeight: '14px',
        }}
        onClick={nextPickMode}
        title={PICK_MODE_TIPS[fadePickMode]}
      >
        {PICK_MODE_LABELS[fadePickMode]}
      </div>
      <select
        value={fadeSource}
        onChange={(e) => tb.setFadeSource(e.target.value as FadeSource)}
        style={selectStyle}
        title="Source: which character category to use for fade/lighten stepping"
      >
        {SOURCE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </>
  );
}

export const FadeHeaderControls = connect(
  (state: RootState) => ({
    fadeSource: state.toolbar.fadeSource,
    fadePickMode: state.toolbar.fadePickMode,
  }),
  (dispatch) => ({
    Toolbar: Toolbar.bindDispatch(dispatch),
  })
)(FadeHeaderControlsInner);

export default connect(
  (state: RootState) => {
    const { charset, font } = selectors.getCurrentFramebufFont(state);
    return {
      fadeMode: state.toolbar.fadeMode,
      fadeStrength: state.toolbar.fadeStrength,
      fadeSource: state.toolbar.fadeSource,
      fadePickMode: state.toolbar.fadePickMode,
      font,
      charset,
    };
  },
  (dispatch) => ({
    Toolbar: Toolbar.bindDispatch(dispatch),
  })
)(ToolPanel);
