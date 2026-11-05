// Regression tests for D4 (Group D master task list): CollapsiblePanel's
// header was a plain `<div onClick>` with no way to reach or toggle it via
// keyboard. It now renders as a focusable, labelled toggle (role="button",
// tabIndex={0}, aria-expanded reflecting collapsed state) and responds to
// Enter.
//
// NOTE: this repo's node_modules is missing @testing-library/dom (a
// required peer of the already-installed @testing-library/react), so this
// test mounts via raw ReactDOM + act() instead of @testing-library/react.

import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, Root } from 'react-dom/client';

import CollapsiblePanel from './CollapsiblePanel';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

function renderPanel() {
  act(() => {
    root.render(
      <CollapsiblePanel title="Textures">
        <div>body content</div>
      </CollapsiblePanel>
    );
  });
  const header = container.querySelector('[role="button"]') as HTMLElement;
  return { header };
}

describe('CollapsiblePanel header accessibility (D4)', () => {
  it('header is a focusable, labelled toggle with aria-expanded reflecting state', () => {
    const { header } = renderPanel();
    expect(header).not.toBeNull();
    expect(header.getAttribute('tabindex')).toBe('0');
    expect(header.getAttribute('aria-label')).toBe('Textures section');
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('body content');
  });

  it('Enter key toggles collapsed state, hiding/showing body content', () => {
    const { header } = renderPanel();
    act(() => {
      header.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(container.textContent).not.toContain('body content');
    expect(header.getAttribute('aria-expanded')).toBe('false');
  });

  it('other keys (e.g. Space) do not toggle the panel', () => {
    const { header } = renderPanel();
    act(() => {
      header.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    expect(container.textContent).toContain('body content');
    expect(header.getAttribute('aria-expanded')).toBe('true');
  });

  it('clicking the header still toggles it (mouse behavior unchanged)', () => {
    const { header } = renderPanel();
    act(() => {
      header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).not.toContain('body content');
  });
});
