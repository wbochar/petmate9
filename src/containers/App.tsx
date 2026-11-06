
import React, { Component, Fragment, ReactNode } from 'react';
import { connect } from 'react-redux'
import { Dispatch } from 'redux'

import Toolbar from './Toolbar'
import FramebufferTabs from './FramebufferTabs'
import Settings from './Settings'
import ResizeSettings from './ResizeSettings'
import ProgressModal from './ProgressModal';
import CustomFontsModal from './CustomFontsModal';
import ExportModal from './ExportModal'
import ImportModal from './ImportModal'
import ImportSeqAdvModal from './ImportSeqAdvModal'
import PresetDialog from './PresetDialog'
import Editor from './Editor';
import FileDrop from './FileDrop'



import * as reduxToolbar from '../redux/toolbar'
import { RootState } from '../redux/types'
import { loadWorkspaceNoDialog,loadFileNoDialog, formats } from '../utils'

import s from './App.module.css'

interface Dims {
  width: number;
  height: number;
}

interface DivSizeProps {
  className: string;
  render: (props: Dims) => ReactNode;
}

interface DivSizeState {
  containerSize: Dims | null;
}

class DivSize extends Component<DivSizeProps, DivSizeState> {

  private ref = React.createRef<HTMLDivElement>();
  private ro: ResizeObserver | null = null;
  state = {
    containerSize: null
  };

  constructor (props: DivSizeProps) {
    super(props)

    this.ro = new ResizeObserver((entries: ResizeObserverEntry[]) => {
      const e = entries[0]
      this.setState({
        containerSize: {
          width: e.contentRect.width,
          height: e.contentRect.height
        }
      })
    })
  }

  componentDidMount () {
    if (this.ro && this.ref.current) {
      this.ro.observe(this.ref.current)
    }
  }

  componentWillUnmount () {
    if (this.ro && this.ref.current) {
      this.ro.unobserve(this.ref.current);
    }
  }


  render () {
    return (
      <div
        className={this.props.className}
        ref={this.ref}
      >
        {this.props.render(this.state.containerSize!)}
      </div>
    )
  }
}

interface AppViewProps {
  Toolbar: reduxToolbar.PropsFromDispatch;
  isModalOpen: boolean;
  dispatch: Dispatch
}

export class AppView extends Component<AppViewProps> {

  componentDidMount() {
    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('keyup', this.handleKeyUp);
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('keyup', this.handleKeyUp);
  }

  handleKeyDown = (event: KeyboardEvent) => {
    // Tab/Space are repurposed for C64-keyboard mimicry (Tab ~= CTRL for
    // color-slot shortcuts, Space = canvas pan) only while the main drawing
    // canvas itself has keyboard focus. Scoping the interception this way
    // (rather than globally) lets Tab/Space behave normally everywhere else
    // -- toolbar buttons, panel controls, and any dialog -- so those remain
    // keyboard-navigable. We additionally never intercept while a
    // modal/dialog is open (`isModalOpen`), even in the unlikely case the
    // canvas still has focus underneath it.
    const targetEl = event.target as HTMLElement;
    const isCanvasContainer = targetEl?.id === 'MainContainer';
    if (isCanvasContainer && !this.props.isModalOpen && (event.key === 'Tab' || event.key === ' '))
      event.preventDefault();
    this.props.Toolbar.keyDown(event.key)
  }

  handleKeyUp = (event: KeyboardEvent) => {
    this.props.Toolbar.keyUp(event.key)
  }

  handleLoadPetmate = (filename: string) => {
    if (!filename) {
      console.error('No file path received from drop event');
      return;
    }
    const { dispatch } = this.props;

    const extension = filename.split('.')[filename.split('.').length-1].toUpperCase();

    switch(extension)
    {
        case "PETMATE":
            loadWorkspaceNoDialog(dispatch, filename);
          break;
        case "SEQ":

           loadFileNoDialog(dispatch, filename, formats.SEQ);
          break;
        case "D64":
          loadFileNoDialog(dispatch, filename, formats.d64);
          break;
        case "C":
          loadFileNoDialog(dispatch, filename, formats.C);

        break;
        case "PRG":
        loadFileNoDialog(dispatch, filename, formats.cbase);
       break;

    }




  }

  render() {
    return (
      <Fragment>
        <FileDrop
          className={s.appGrid}
          loadDroppedFile={this.handleLoadPetmate}
        >

          <div className={s.leftmenubar}>
            <Toolbar />
          </div>
          <DivSize
            className={s.editor}
            render={(containerSize: Dims) =>
            <> <FramebufferTabs />
<Editor containerSize={containerSize} />
            </> }
          />
        </FileDrop>
        <Settings />
        <ResizeSettings  />
        <CustomFontsModal />
        <ExportModal />
        <ImportModal />
        <ImportSeqAdvModal />
        <PresetDialog />
        <ProgressModal />
      </Fragment>
    )
  }
}

const mapStateToProps = (state: RootState) => {
  return {
    isModalOpen: reduxToolbar.isModalOpen(state),
  }
}

export default connect(
  mapStateToProps,
  dispatch => {
    return {
      Toolbar: reduxToolbar.Toolbar.bindDispatch(dispatch),
      dispatch
    }
  })(AppView)
