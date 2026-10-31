
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
class ModalAnimWrapper extends Component<ModalAnimWrapperProps, ModalAnimWrapperState> {
  state = {
    init: true
  }

  private ref: HTMLDivElement|null = null;
  private animTimerId: ReturnType<typeof setTimeout> | null = null;

  componentDidMount () {
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
  }

  componentWillUnmount () {
    // Without this, closing the modal before the 20ms animation-kickoff
    // timer fires (e.g. a very fast open/close) left a pending setState
    // call targeting an already-unmounted component.
    if (this.animTimerId !== null) {
      clearTimeout(this.animTimerId)
      this.animTimerId = null
    }
  }

  render () {
    return (
      <Fragment>
        <div ref={(r) => this.ref = r}>
          <div
            className={styles.modalBackground}
            style={{
              opacity: this.state.init ? 0.0 : 1.0,
              transition: 'opacity 0.2s linear'
            }}
          />
          <div
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
