import React, { Component, Fragment, FunctionComponent as SFC } from 'react'
import { connect } from 'react-redux'

import Modal from '../components/Modal'
import {
  connectFormState,
  Form,
  Checkbox,
  RadioButton,
  NumberInput,
  TextInput

} from '../components/formHelpers'

import * as toolbar from '../redux/toolbar'
import * as ReduxRoot from '../redux/root'

import * as utils from '../utils'
import { FileFormatGif, FileFormatPng, FileFormatSeq, FileFormatAsm, FileFormatBas, FileFormatJson, FileFormat,FileFormatD64, RootState, FileFormatPlayerV1 } from '../redux/types';
import { bindActionCreators } from 'redux';

import {dialogPickSidFile} from '../utils'

import styles from './ExportModal.module.css'
import common from './ModalCommon.module.css'

interface ExportPropsBase {
  // Set via connectFormStateTyped
  setField: (name: string, value: any) => void;
}

interface GIFExportFormatProps extends ExportPropsBase {
  state: FileFormatGif['exportOptions'];
}

class GIFExportForm extends Component<GIFExportFormatProps> {
  render () {
    let fps: string|null = null
    const delayMS = this.props.state.delayMS
    if (delayMS !== '') {
      const delayInt = parseInt(this.props.state.delayMS, 10)
      if (delayInt !== 0 && !isNaN(delayInt)) {
        const f = 1000.0 / delayInt
        fps = `${f.toFixed(1)} fps`
      }
    }
    const animControls = () => {
      return (
        <Fragment>
          <div className={common.colLabel}>Loop Mode</div>
          <RadioButton
            name='loopMode'
            value='once'
            label='Play once, no looping'
          />
          <RadioButton
            name='loopMode'
            value='loop'
            label='Loop'
          />
          <RadioButton
            name='loopMode'
            value='pingpong'
            label='Loop (ping pong)'
          />
          <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '6px'}}>
            <NumberInput
              name='delayMS'
              value={delayMS}
              label='Frame delay (ms)'
            />
            <span className={common.unit}>{fps}</span>
          </div>
        </Fragment>
      )
    }
    return (
      <Form state={this.props.state} setField={this.props.setField}>
        <div className={common.colLabel}>GIF Export Options</div>
        <Checkbox name='borders' label='Include borders' />
        <div className={common.colLabel}>Animation Mode</div>
        <RadioButton
          name='animMode'
          value='single'
          label='Current screen only'
        />
        <RadioButton
          name='animMode'
          value='anim'
          label='Export .gif anim'
        />
        {this.props.state.animMode === 'single' ? null : animControls()}
      </Form>
    )
  }
}

interface PNGExportFormatProps extends ExportPropsBase {
  state: FileFormatPng['exportOptions'];
}

class PNGExportForm extends Component<PNGExportFormatProps> {
  render () {
    return (
      <Form state={this.props.state} setField={this.props.setField}>
        <div className={common.colLabel}>PNG Export Options</div>
        <Checkbox name='alphaPixel' label='Alpha pixel work-around for Twitter' />
        <Checkbox name='borders' label='Include borders' />
        <NumberInput name='scale' label='Pixel scale' />
      </Form>
    )
  }
}

interface SEQExportFormatProps extends ExportPropsBase {
  state: FileFormatSeq['exportOptions'];
}

class SEQExportForm extends Component<SEQExportFormatProps> {
  render () {
    return (
      <Form state={this.props.state} setField={this.props.setField}>
        <div className={common.colLabel}>SEQ Export Options</div>
        <Checkbox name='insCR' label='Append Carriage Returns at end of rows'/>
        <Checkbox name='insClear' label='Insert CLS (0x93) at start of file' />
        <Checkbox name='insCharset' label='Insert font: (0x0E) lower charset or (0x8E) upper charset' />
        <Checkbox name='stripBlanks' label='Optimize sequence' />
      </Form>
    )
  }
}


interface ASMExportFormatProps extends ExportPropsBase {
  state: FileFormatAsm['exportOptions'];
}

class ASMExportForm extends Component<ASMExportFormatProps> {
  render () {
    return (
      <Form state={this.props.state} setField={this.props.setField}>
        <div className={common.colLabel}>Assembler</div>
        <RadioButton name='assembler' value='kickass' label='KickAssembler' />
        <RadioButton name='assembler' value='acme' label='ACME' />
        <RadioButton name='assembler' value='c64tass' label='64tass' />
        <RadioButton name='assembler' value='ca65' label='ca65' />
        <RadioButton name='assembler' value='c64jasm' label='c64jasm' />
        <div className={common.colLabel}>Options</div>
        <Checkbox name='currentScreenOnly' label='Current screen only' />
        <Checkbox name='standalone' label='Make output compilable to a .prg' />
        <Checkbox name='hex' label='Hexadecimal output' />
      </Form>
    )
  }
}

interface BASICExportFormatProps extends ExportPropsBase {
  state: FileFormatBas['exportOptions'];
}

class BASICExportForm extends Component<BASICExportFormatProps> {
  render () {
    return (
      <Form state={this.props.state} setField={this.props.setField}>
        <div className={common.colLabel}>BASIC Export Options</div>
        <Checkbox name='currentScreenOnly' label='Current screen only' />
        <Checkbox name='standalone' label='Add BASIC code to display the image' />
      </Form>
    )
  }
}

interface JsonExportFormatProps extends ExportPropsBase {
  state: FileFormatJson['exportOptions'];
}

class JsonExportForm extends Component<JsonExportFormatProps> {
  render () {
    return (
      <Form state={this.props.state} setField={this.props.setField}>
        <div className={common.colLabel}>JSON Export Options</div>
        <Checkbox name='currentScreenOnly' label='Current screen only' />
      </Form>
    )
  }
}

interface D64ExportFormatProps extends ExportPropsBase {
  state: FileFormatD64['exportOptions'];
}

class D64ExportForm extends Component<D64ExportFormatProps> {
  render () {
    return (
      <Form state={this.props.state} setField={this.props.setField}>
        <div className={common.colLabel}>D64 Export Options</div>
        <div style={{fontSize:'11px', color:'#aaa', marginBottom:'4px'}}>
          16-char header, 5-char ID. Use '2A' for standard format.
        </div>
        <div style={{display: 'flex', gap: '8px'}}>
          <TextInput name="header" label='Header' style={{minWidth: '12em'}} inputprops={{width:16,size:16,maxLength:16, placeholder:"1234567890ABCDEF"}} />
          <TextInput name="id" label='ID' style={{minWidth: '4em'}} inputprops={{size:5,maxLength:5, placeholder:"2A"}} />
        </div>
        <div style={{fontSize:'11px', color:'#aaa', marginTop:'4px'}}>Use UPPERCASE for header and ID text.</div>
      </Form>
    )
  }
}


interface PrgPlayerExportFormatProps extends ExportPropsBase {
  state: FileFormatPlayerV1['exportOptions'];
}

class PrgPlayerExportForm extends Component<PrgPlayerExportFormatProps> {

  handleImportMusic = () => {
    const filename = dialogPickSidFile();
    this.props.setField('songFile',filename)
  }

  handleNewType = () => {
    if(!this.props.state.currentScreenOnly) {
      this.props.setField('playerType','Single Frame')
    } else {
      this.props.setField('playerType','Animation')
    }
    this.props.setField('currentScreenOnly',!this.props.state.currentScreenOnly)
  }

  render () {
    const musicControls = () => {
      return (
        <Fragment>
          <div style={{display:'flex', alignItems:'center', gap:'6px', marginBottom:'4px'}}>
            <NumberInput name='songNumber' label="Song:" style={{width:'48px'}} min="1" max="1" width="1" />
            <span style={{fontSize:'11px', color:'#aaa', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
              {this.props.state.songFile!=='' ? this.props.state.songFile:'No file selected...'}
            </span>
            <button className={styles.buttonMusicAdd} onClick={this.handleImportMusic}>Pick Music</button>
          </div>
        </Fragment>
      )
    }

    const FramePlayerTypes = (isSingle:boolean) => {
      if(isSingle) {
        return <RadioButton name='playerType' value='Single Frame' label='Single Frame' />
      } else {
        return <RadioButton name='playerType' value='Animation' label='Animation' />
      }
    }

    return (
      <Form state={this.props.state} setField={this.props.setField}>
        <div className={common.colLabel}>PRG Player v1.00</div>
        <Checkbox name='music' label='Add a SID/Music' />
        {this.props.state.music ? musicControls():''}

        <div className={common.columns}>
          <div className={common.col}>
            <div className={common.colLabel}>Computer</div>
            <RadioButton name='computer' value='c64' label='C64' />
            <RadioButton name='computer' value='pet4032' label='Pet 4032' />
            <RadioButton name='computer' value='c128' label='C128' />
            <RadioButton name='computer' value='vic20' label='Vic 20' />
          </div>
          <div className={common.col}>
            <div className={common.colLabel}>Player Type</div>
            {FramePlayerTypes(this.props.state.currentScreenOnly)}
          </div>
        </div>
      </Form>
    )
  }
}


interface ExportModalState {
  [key: string]: FileFormat['exportOptions'];
  seqFile: FileFormatSeq['exportOptions'];
  pngFile: FileFormatPng['exportOptions'];
  asmFile: FileFormatAsm['exportOptions'];
  basFile: FileFormatBas['exportOptions'];
  gifFile: FileFormatGif['exportOptions'];
  jsonFile: FileFormatJson['exportOptions'];
  d64File: FileFormatD64['exportOptions'];

}

// Type to select one format branch from ExportModalState
type State<T extends keyof ExportModalState> = {
  state: ExportModalState[T];
  setState: any; // TODO ts
}

export function connectFormStateTyped<T extends FileFormat['name']>({state, setState}: State<T>, subtree: T) {
  return connectFormState({state, setState}, subtree);
}

interface ExportFormProps {
  ext: string | null;
  name: string;
  description: string | null;
  state: ExportModalState;
  setState: any;
}

class ExportForm extends Component<ExportFormProps> {
  render () {
  //  if (this.props.name === null) {
  //    return null
  //  }
    if (!utils.formats[this.props.name].exportOptions) {
      return null
    }
    switch (this.props.name) {

      case 'cFile':
        return null
        case 'd64File':
          return (
            <D64ExportForm {...connectFormState(this.props, 'd64File')} />
          )
      case 'prgFile':
        return null
        case 'ultFile':
          return null


        case 'pngFile':
        return (
          <PNGExportForm {...connectFormState(this.props, 'pngFile')} />
        )
      case 'seqFile':
        return (
          <SEQExportForm {...connectFormState(this.props, 'seqFile')} />
        )
      case 'asmFile':
        return (
          <ASMExportForm {...connectFormState(this.props, 'asmFile')} />
        )
      case 'basFile':
        return (
          <BASICExportForm {...connectFormState(this.props, 'basFile')} />
        )
      case 'gifFile':
        return (
          <GIFExportForm {...connectFormState(this.props, 'gifFile')} />
        )
      case 'jsonFile':
        return (
          <JsonExportForm {...connectFormState(this.props, 'jsonFile')} />
        )
        case 'prgPlayer':
          return (
            <PrgPlayerExportForm {...connectFormState(this.props, 'prgPlayer')} />
          )
      default:
        throw new Error(`unknown export format ${this.props.name}`);
    }
  }
}

interface ExportModalProps {
  showExport: {
    show: boolean;
    fmt?: FileFormat; // undefined if show=false
  };
};

interface ExportModalDispatch {
  Toolbar: toolbar.PropsFromDispatch;
  fileExportAs: (fmt: FileFormat) => void;
}

class ExportModal_ extends Component<ExportModalProps & ExportModalDispatch, ExportModalState> {
  state: ExportModalState = {
    seqFile: {
      insCR: false,
      insClear: true,
      stripBlanks: false,
      insCharset:false,
    },
    pngFile: {
      borders: true,
      alphaPixel: false,
      scale: 1,
    },
    asmFile: {
      assembler: 'kickass',
      currentScreenOnly: true,
      hex: false,
      standalone: false
    },
    basFile: {
      currentScreenOnly: true,
      standalone: false
    },
    gifFile: {
      borders: true,
      animMode: 'single',
      loopMode: 'loop',
      delayMS: '250'
    },
    jsonFile: {
      currentScreenOnly: true
    },
    d64File: {
      header: "ENTER D64 NAME",
      id: "2A"
    },
    prgPlayer: {
        currentScreenOnly: true,
        music: false,
        songFile: '',
        songNumber: 1,
        playerDebug: true,
        playerType: 'Single Frame',
        playerAnimationDirection: 'Forward',
        playerAnimationLoop: true,
        playerSpeed: 1,
        playerScrollType: 'Linear',
        computer: 'c64' ,


    },
  }

  handleOK = () => {
    const { showExport } = this.props;
    this.props.Toolbar.setShowExport({show:false});
    const fmt = showExport.fmt!;
    const name = fmt.name;
    if (fmt.exportOptions === undefined) {
      // We shouldn't be here if there are no export UI options
      return;
    }
    const amendedFmt = {
      ...showExport.fmt,
      exportOptions: {
        ...this.state[name]
      }
    };
    this.props.fileExportAs(amendedFmt as FileFormat);
  }

  handleCancel = () => {
    this.props.Toolbar.setShowExport({show:false})
  }

  handleSetState = (cb: (s: ExportModalState) => void) => {
    this.setState(prevState => {
      return cb(prevState)
    })
  }

  render () {
    const { showExport } = this.props
    const exportType = showExport.show ? showExport.fmt : undefined
    const exportExt = exportType !== undefined ? exportType.ext : null
    const fmt = showExport.fmt!;
    const exportName = exportType !== undefined ? fmt.name:''
    const exportDescription = exportType !== undefined ? fmt.description:null;
    return (
      <div>
        <Modal showModal={this.props.showExport.show}>
          <div className={common.container}>
            <div className={common.title}>Export Options</div>
            <ExportForm
              ext={exportExt}
              name={exportName}
              description={exportDescription}
              state={this.state}
              setState={this.handleSetState}
            />

            <div className={common.footer}>
              <button className='cancel' onClick={this.handleCancel}>Cancel</button>
              <button className='primary' onClick={this.handleOK}>Export</button>
            </div>
          </div>
        </Modal>
      </div>
    )
  }
}

export default connect(
  (state: RootState) => {
    return {
      showExport: state.toolbar.showExport
    }
  },
  (dispatch) => {
    return {
      Toolbar: bindActionCreators(toolbar.Toolbar.actions, dispatch),
      fileExportAs: bindActionCreators(ReduxRoot.actions.fileExportAs, dispatch)
    }
  }
)(ExportModal_)
