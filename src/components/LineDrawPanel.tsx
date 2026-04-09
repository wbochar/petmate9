import React, { useCallback } from 'react';
import { connect } from 'react-redux';

import { Toolbar } from '../redux/toolbar';
import { RootState } from '../redux/types';

// ---- Style constants matching the dark UI theme ----

const checkboxRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '11px',
  color: '#aaa',
  padding: '4px 0',
  userSelect: 'none',
};

// ---- Connected LineDrawPanel ----

interface LineDrawPanelStateProps {
  lineDrawChunkyMode: boolean;
  lineDrawActive: boolean;
}

interface LineDrawPanelDispatchProps {
  Toolbar: ReturnType<typeof Toolbar.bindDispatch>;
}

type LineDrawPanelProps = LineDrawPanelStateProps & LineDrawPanelDispatchProps;

function LineDrawPanel({
  lineDrawChunkyMode,
  lineDrawActive,
  Toolbar: toolbarActions,
}: LineDrawPanelProps) {
  const handleToggle = useCallback(() => {
    toolbarActions.setLineDrawChunkyMode(!lineDrawChunkyMode);
  }, [toolbarActions, lineDrawChunkyMode]);

  return (
    <div style={{ padding: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={checkboxRow}>
        <input
          type="checkbox"
          checked={lineDrawChunkyMode}
          onChange={handleToggle}
          style={{ accentColor: '#6af' }}
        />
        Chunky Pixel Mode
      </label>
      <div style={{ fontSize: '9px', color: '#666', lineHeight: '1.3' }}>
        {lineDrawActive
          ? 'Click to draw next segment. Escape to finish.'
          : 'Click on the canvas to set the start point.'}
      </div>
    </div>
  );
}

export default connect(
  (state: RootState) => ({
    lineDrawChunkyMode: state.toolbar.lineDrawChunkyMode,
    lineDrawActive: state.toolbar.lineDrawActive,
  }),
  (dispatch: any) => ({
    Toolbar: Toolbar.bindDispatch(dispatch),
  })
)(LineDrawPanel);
