// Regression tests for D7 (Group D master task list): Modal.tsx previously
// had no role="dialog", no focus trap, no initial focus on open, and no
// focus restoration on close -- a keyboard user who opened a dialog could
// Tab straight out of it into the rest of the (still "visible" behind the
// overlay) app, and closing the dialog silently dropped focus back to
// <body> instead of wherever the user had been before opening it.
//
// Modal.tsx's module scope calls `document.getElementById('modal-root')`
// once, at import time, and memoizes the result -- so the '#modal-root'
// element must exist in the DOM *before* the module is first evaluated.
// This file creates that element in `beforeAll` and only then requires
// the module (via a deferred `require`, since `import` statements are
// hoisted above all other code and would run too early).

import type ModalDefault from './Modal';

let Modal: typeof ModalDefault;

beforeAll(() => {
  const modalRoot = document.createElement('div');
  modalRoot.id = 'modal-root';
  document.body.appendChild(modalRoot);
  Modal = require('./Modal').default;
});

import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, Root } from 'react-dom/client';

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

// Flushes the setTimeout(0) Modal.tsx uses to defer initial focus until
// after the portal's DOM node is attached to the live document (see the
// comment on ModalAnimWrapper.componentDidMount).
function flushTimers() {
  act(() => { jest.runOnlyPendingTimers(); });
}

describe('Modal accessibility (D7)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders a role="dialog" with aria-modal="true" when open', () => {
    act(() => {
      root.render(
        <Modal showModal={true}>
          <button>OK</button>
        </Modal>
      );
    });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute('aria-modal')).toBe('true');
  });

  it('renders nothing when closed', () => {
    act(() => {
      root.render(
        <Modal showModal={false}>
          <button>OK</button>
        </Modal>
      );
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('moves focus into the dialog (first focusable element) when opened', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    act(() => {
      root.render(
        <Modal showModal={true}>
          <button>First</button>
          <button>Second</button>
        </Modal>
      );
    });
    flushTimers();

    expect(document.activeElement?.textContent).toBe('First');
    trigger.remove();
  });

  it('falls back to focusing the dialog container itself when it has no focusable children', () => {
    act(() => {
      root.render(
        <Modal showModal={true}>
          <span>Just some text, no controls</span>
        </Modal>
      );
    });
    flushTimers();

    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(document.activeElement).toBe(dialog);
  });

  it('restores focus to the previously-focused element when closed', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open';
    document.body.appendChild(trigger);
    trigger.focus();

    act(() => {
      root.render(
        <Modal showModal={true}>
          <button>First</button>
        </Modal>
      );
    });
    flushTimers();
    expect(document.activeElement?.textContent).toBe('First');

    act(() => {
      root.render(
        <Modal showModal={false}>
          <button>First</button>
        </Modal>
      );
    });

    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('traps Tab focus: Tab from the last element wraps to the first', () => {
    act(() => {
      root.render(
        <Modal showModal={true}>
          <button>First</button>
          <button>Last</button>
        </Modal>
      );
    });
    flushTimers();

    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const buttons = Array.from(dialog.querySelectorAll('button'));
    act(() => { buttons[1].focus(); });

    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('traps Shift+Tab focus: Shift+Tab from the first element wraps to the last', () => {
    act(() => {
      root.render(
        <Modal showModal={true}>
          <button>First</button>
          <button>Last</button>
        </Modal>
      );
    });
    flushTimers();

    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const buttons = Array.from(dialog.querySelectorAll('button'));
    act(() => { buttons[0].focus(); });

    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    });
    expect(document.activeElement).toBe(buttons[1]);
  });
});
