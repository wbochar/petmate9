import React from 'react';
import { connect } from 'react-redux';
import { Toolbar } from '../redux/toolbar';
import { RootState, Tool, FadeMode } from '../redux/types';

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

interface ToolPanelProps {
  selectedTool: Tool;
  fadeMode: FadeMode;
  fadeStrength: number;
  Toolbar: {
    setFadeMode: (mode: FadeMode) => void;
    setFadeStrength: (strength: number) => void;
  };
}

function ToolPanel({ selectedTool, fadeMode, fadeStrength, Toolbar: tb }: ToolPanelProps) {
  if (selectedTool === Tool.FadeLighten) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 4px' }}>
        <button
          style={fadeMode === 'lighten' ? activeBtnStyle : btnStyle}
          onClick={() => tb.setFadeMode('lighten')}
        >
          Lighten
        </button>
        <button
          style={fadeMode === 'darken' ? activeBtnStyle : btnStyle}
          onClick={() => tb.setFadeMode('darken')}
        >
          Darken
        </button>
        <input
          type="range"
          min={1}
          max={16}
          value={fadeStrength}
          onChange={(e) => tb.setFadeStrength(Number(e.target.value))}
          style={{ flex: 1, cursor: 'pointer', height: '12px' }}
        />
        <span style={{ fontSize: '10px', color: '#aaa', minWidth: '14px', textAlign: 'right' }}>
          {fadeStrength}
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

export default connect(
  (state: RootState) => ({
    fadeMode: state.toolbar.fadeMode,
    fadeStrength: state.toolbar.fadeStrength,
  }),
  (dispatch) => ({
    Toolbar: Toolbar.bindDispatch(dispatch),
  })
)(ToolPanel);
