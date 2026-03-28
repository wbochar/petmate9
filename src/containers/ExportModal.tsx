import React, { Component, Fragment, FunctionComponent as SFC } from 'react'
import { connect } from 'react-redux'

import Modal from '../components/Modal'
import {
  connectFormState,
  Form,
  Checkbox,
  RadioButton,
  NumberInput,
  TextInput,
  Select

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

  handleComputerChange = (name: string, value: any) => {
    this.props.setField(name, value)
    // SID only available on C64 — disable music when switching away
    if (value !== 'c64' && this.props.state.music) {
      this.props.setField('music', false)
    }
  }

  handlePlayerTypeChange = (name: string, value: any) => {
    this.props.setField(name, value)
    this.props.setField('currentScreenOnly', value === 'Single Frame')
    // Scroll modes only on C64 for now
    if ((value === 'Long Scroll' || value === 'Wide Pan') && this.props.state.computer !== 'c64') {
      this.props.setField('computer', 'c64')
    }
  }

  render () {
    const computer = this.props.state.computer;
    const isC64 = computer === 'c64';
    const playerType = this.props.state.playerType;
    const isAnimation = playerType === 'Animation';
    const isScroll = playerType === 'Long Scroll' || playerType === 'Wide Pan';
    const showFPS = isAnimation || isScroll;

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

    const isVic20 = computer === 'vic20';

    const vic20RAMOptions = [
      { value: 'unexpanded', label: 'Unexpanded (5KB)' },
      { value: '3k',  label: '+3KB (8KB total)' },
      { value: '8k',  label: '+8KB (13KB total)' },
      { value: '16k', label: '+16KB (21KB total)' },
      { value: '24k', label: '+24KB (29KB total)' },
    ];

    const fpsControls = () => {
      return (
        <div style={{marginTop:'4px'}}>
          <NumberInput name='playerFPS' label={isScroll ? 'Scroll speed' : 'FPS'} style={{width:'48px'}} />
          {isAnimation && isVic20 && <Select name='vic20RAM' label='RAM' options={vic20RAMOptions} />}
        </div>
      )
    }

    // Platform memory/capability notes
    const platformNote = (): string | null => {
      if (isScroll) {
        if (playerType === 'Long Scroll') return 'Vertical smooth scroll. Source frame height > 25 rows. C64 only.';
        if (playerType === 'Wide Pan') return 'Horizontal smooth scroll. Source frame width > 40 cols. C64 only.';
      }
      if (!isAnimation) {
        switch (computer) {
          case 'c128':   return 'C128: No SID support (BASIC at $1C01 conflicts).';
          case 'pet4032': return 'PET 4032: No color RAM, no SID.';
          case 'vic20':  return 'VIC-20: 5KB base RAM (expandable). No SID.';
          default: return null;
        }
      }
      switch (computer) {
        case 'c64':
          return this.props.state.music
            ? 'C64 anim: ~40KB for frames ($2000-$CFFF, SID at $1000)'
            : 'C64 anim: ~44KB for frames ($2000-$CFFF)';
        case 'c128':   return 'C128 anim: ~44KB for frames ($2000-$CFFF). No SID.';
        case 'pet4032': return 'PET anim: ~30KB for frames ($0800-$7FFF). Screen only, no color.';
        case 'vic20': {
          const ramInfo: Record<string, string> = {
            'unexpanded': '~3KB ($1200-$1DFF)',
            '3k':  '~6KB ($0400-$0FFF + $1200-$1DFF)',
            '8k':  '~11KB ($1200-$3FFF)',
            '16k': '~19KB ($1200-$5FFF)',
            '24k': '~27KB ($1200-$7FFF)',
          };
          return `VIC-20 anim: ${ramInfo[this.props.state.vic20RAM] || ramInfo['unexpanded']} for frames. No SID.`;
        }
        default: return null;
      }
    }
    const note = platformNote();

    return (
      <Form state={this.props.state} setField={this.props.setField}>
        <div className={common.colLabel}>PRG Player v1.01</div>
        {isC64 && <Checkbox name='music' label='Add a SID/Music' />}
        {isC64 && this.props.state.music ? musicControls():''}

        <div className={common.columns}>
          <div className={common.col}>
            <div className={common.colLabel}>Computer</div>
            <Form state={this.props.state} setField={this.handleComputerChange}>
              <RadioButton name='computer' value='c64' label='C64' />
              <RadioButton name='computer' value='pet4032' label='Pet 4032' />
              <RadioButton name='computer' value='c128' label='C128' />
              <RadioButton name='computer' value='vic20' label='Vic 20' />
            </Form>
          </div>
          <div className={common.col}>
            <div className={common.colLabel}>Player Type</div>
            <Form state={this.props.state} setField={this.handlePlayerTypeChange}>
              <RadioButton name='playerType' value='Single Frame' label='Single Frame' />
              <RadioButton name='playerType' value='Animation' label='Animation' />
              <RadioButton name='playerType' value='Long Scroll' label='Long Scroll' disabled={!isC64} />
              <RadioButton name='playerType' value='Wide Pan' label='Wide Pan' disabled={!isC64} />
            </Form>
            {showFPS ? fpsControls() : null}
          </div>
        </div>
        {note && <div style={{fontSize:'11px', color:'#aaa', marginTop:'4px'}}>{note}</div>}
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
        playerFPS: 10,
        playerScrollType: 'Linear',
        computer: 'c64' ,
        vic20RAM: 'unexpanded',
        sendToUltimate: false,

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
              {showExport.fmt?.name === 'prgPlayer' && (
                <label style={{display:'flex', alignItems:'center', gap:'4px', marginRight:'auto', fontSize:'12px', cursor:'pointer'}}>
                  <input
                    type='checkbox'
                    checked={(this.state.prgPlayer as any)?.sendToUltimate ?? false}
                    onChange={(e) => this.handleSetState((prev: any) => ({
                      ...prev,
                      prgPlayer: { ...prev.prgPlayer, sendToUltimate: e.target.checked }
                    }))}
                  />
                  Send to Ultimate
                </label>
              )}
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
