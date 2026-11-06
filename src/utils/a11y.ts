import React from 'react';

/**
 * DOM attributes that make a clickable `<div>` behave like a native
 * `<button>` for keyboard users, without changing its existing visuals or
 * `onClick` wiring.
 *
 * Spread the result onto a div that already has an `onClick` handler:
 *
 *   <div onClick={onClick} {...buttonA11yProps(onClick, { label: title })}>
 *
 * Only Enter activates the control (matching native <button> semantics for
 * the Enter key). Space is intentionally NOT handled anywhere in this
 * codebase's panel/toolbar controls -- it's reserved for canvas panning
 * (see App.tsx/toolbar.ts's keyDown scoping), and leaving it unhandled
 * here avoids any ambiguity with that reserved shortcut while these
 * controls are focused.
 */
export function buttonA11yProps(
  onClick: (() => void) | undefined,
  opts: { label?: string; pressed?: boolean; disabled?: boolean } = {}
): {
  role: 'button';
  tabIndex: number;
  'aria-label'?: string;
  'aria-pressed'?: boolean;
  'aria-disabled'?: boolean;
  onKeyDown: (e: React.KeyboardEvent) => void;
} {
  const { label, pressed, disabled } = opts;
  return {
    role: 'button',
    tabIndex: disabled ? -1 : 0,
    'aria-label': label,
    'aria-pressed': pressed,
    'aria-disabled': disabled || undefined,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !disabled && onClick) {
        e.preventDefault();
        onClick();
      }
    },
  };
}
