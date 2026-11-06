
import React, { Component, Fragment } from 'react'
import ReactDOM from 'react-dom'

import styles from './Modal.module.css'

const modalRoot = document.getElementById('modal-root')

class ModalBase extends Component<React.PropsWithChildren<{}>> {
  private el = document.createElement('div')

  componentDidMount() {
    // The portal element is inserted in the DOM tree after
    // the Modal's children are mounted, meaning that children
    // will be mounted on a detached DOM node. If a child
    // component requires to be attached to the DOM tree
    // immediately when mounted, for example to measure a
    // DOM node, or uses 'autoFocus' in a descendant, add
    // state to Modal and only render the children when Modal
    // is inserted in the DOM tree.
    if (modalRoot) {
      modalRoot.appendChild(this.el)
    }
  }

  componentWillUnmount() {
    if (modalRoot) {
      modalRoot.removeChild(this.el)
    }
  }

  render() {
    return ReactDOM.createPortal(
      this.props.children,
      this.el
    )
  }
}

interface ModalAnimWrapperProps extends React.PropsWithChildren<{}> {
  contentStyle?: React.CSSProperties;
}
interface ModalAnimWrapperState {
    init: boolean;
}

// Selector for elements a focus trap should treat as reachable stops.
// Mirrors the set of controls made keyboard-operable elsewhere in this
// Group D accessibility pass (native form controls, plus role="button"
// divs from the D3/D4 commits).
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[role="button"]:not([aria-disabled="true"])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

class ModalAnimWrapper extends Component<ModalAnimWrapperProps, ModalAnimWrapperState> {
  state = {
    init: true
  }

  private ref: HTMLDivElement|null = null;
  private animTimerId: ReturnType<typeof setTimeout> | null = null;
  private focusTimerId: ReturnType<typeof setTimeout> | null = null;
  private contentRef = React.createRef<HTMLDivElement>();
  // The element focused right before this modal opened, so focus can be
  // restored to it (rather than silently falling back to <body>) once the
  // modal closes -- e.g. the toolbar/menu icon that triggered the dialog.
  private previouslyFocused: HTMLElement | null = null;

  getFocusableElements(): HTMLElement[] {
    const root = this.contentRef.current;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  }

  focusInitialElement = () => {
    const [first] = this.getFocusableElements();
    // Fall back to the dialog container itself (tabIndex={-1} below makes
    // it a valid script-focus target) when the dialog has no focusable
    // descendants yet, so focus always moves into the modal on open.
    (first ?? this.contentRef.current)?.focus();
  };

  // Basic focus trap (ARIA dialog pattern): Tab/Shift+Tab wraps between the
  // first and last focusable elements instead of escaping to the rest of
  // the (inert, but not actually disabled) page behind the modal.
  handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const focusable = this.getFocusableElements();
    if (focusable.length === 0) {
      e.preventDefault();
      this.contentRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    const activeInModal = active instanceof Node && this.contentRef.current?.contains(active);
    if (e.shiftKey) {
      if (!activeInModal || active === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (!activeInModal || active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  componentDidMount () {
    this.previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // This is required to trigger the CSS animation
    const ANIMATION_TIMEOUT = 20
    this.animTimerId = setTimeout(() => {
      // This is for to force a repaint,
      // which is necessary in order to transition styles.
      // (jjhellst: or so I think..  From https://github.com/reactjs/react-transition-group/blob/780e8e5bf62efa655a2683c216cdabd7f7a09897/src/CSSTransition.js#L210-L217)
      // eslint-disable-next-line no-unused-expressions
      this.ref && this.ref.scrollTop
      this.animTimerId = null;
      this.setState({init: false})
    }, ANIMATION_TIMEOUT)

    // ModalBase's componentDidMount (which appends the portal's DOM node
    // into the live document) runs *after* this component's -- see the
    // comment on ModalBase above. Calling .focus() here would silently
    // no-op since this.contentRef.current isn't attached to the document
    // yet. Deferring to a macrotask guarantees the portal attachment (part
    // of the same synchronous commit) has already happened by the time
    // this runs.
    this.focusTimerId = setTimeout(this.focusInitialElement, 0);
  }

  componentWillUnmount () {
    // Without this, closing the modal before the 20ms animation-kickoff
    // timer fires (e.g. a very fast open/close) left a pending setState
    // call targeting an already-unmounted component.
    if (this.animTimerId !== null) {
      clearTimeout(this.animTimerId)
      this.animTimerId = null
    }
    if (this.focusTimerId !== null) {
      clearTimeout(this.focusTimerId)
      this.focusTimerId = null
    }
    // Restore focus to whatever triggered the dialog, if it's still around
    // (e.g. hasn't itself been unmounted while the dialog was open).
    if (this.previouslyFocused && document.contains(this.previouslyFocused)) {
      this.previouslyFocused.focus();
    }
  }

  render () {
    return (
      <Fragment>
        <div ref={(r) => this.ref = r} onKeyDown={this.handleKeyDown}>
          <div
            className={styles.modalBackground}
            style={{
              opacity: this.state.init ? 0.0 : 1.0,
              transition: 'opacity 0.2s linear'
            }}
          />
          <div
            ref={this.contentRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            className={styles.modal}
            style={{
              opacity: this.state.init ? 0.0 : 1.0,
              transform: this.state.init ? 'translate(-50%, -40%)' : 'translate(-50%, -50%)',
              transition: 'opacity 0.2s linear, transform 0.2s linear',
              ...this.props.contentStyle,
            }}>
            {this.props.children}
          </div>
        </div>
      </Fragment>
    )
  }
}

interface ModalProps {
  showModal: boolean;
  children?: React.ReactNode;
  /** Optional style overrides merged into the modal's own inline style
   *  (e.g. a wider `width` for dialogs with more content). */
  contentStyle?: React.CSSProperties;
}

export default class Modal extends Component<ModalProps> {
  modalBody = () => {
    return (
      <ModalAnimWrapper contentStyle={this.props.contentStyle}>
        {this.props.children}
      </ModalAnimWrapper>
    )
  }

  render () {
    return (
      <ModalBase>
        {this.props.showModal ? this.modalBody() : null}
      </ModalBase>
    )
  }
}
