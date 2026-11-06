import type { CSSProperties } from 'react';

/**
 * Shared compact "panel button" style -- used for the small save/add/
 * export/import/delete-style buttons and toggle buttons sprinkled across
 * the Texture/Box/Lines/Fade tool panels. These are plain inline style
 * objects (not CSS-module classes) to match how every consumer already
 * applies them: merged with per-instance overrides computed at render
 * time (active/selected/disabled state, custom padding, etc.) via object
 * spread, e.g. `style={dirty ? activeBtnStyle : { ...btnStyle, opacity:
 * 0.4 }}`. Centralizing the base objects here means that pattern -- and
 * any future tweak to it -- only needs to be written once instead of
 * being hand-copied (and liable to drift) in every panel file.
 */
export const btnStyle: CSSProperties = {
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

/** Same as `btnStyle`, but for a button's active/selected/"on" state. */
export const activeBtnStyle: CSSProperties = {
  ...btnStyle,
  background: 'var(--panel-btn-active-bg)',
  color: 'var(--panel-btn-active-color)',
};
