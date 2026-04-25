import React, { Component, Fragment, FC } from 'react'
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
import * as screensSelectors from '../redux/screensSelectors'
import * as selectors from '../redux/selectors'

import * as utils from '../utils'
import { FileFormatGif, FileFormatPng, FileFormatSeq, FileFormatAsm, FileFormatBas, FileFormatJson, FileFormat,FileFormatD64, RootState, FileFormatPlayerV1, Framebuf, UltimateMachineType } from '../redux/types';
import { bindActionCreators } from 'redux';
import { fs, electron } from '../utils/electronImports'

import {dialogPickSidFile} from '../utils'
import { charsetToPlayerComputer, PlayerComputer } from '../utils/platformChecks'

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

function mapPlayerComputerToUltimateMachine(computer: PlayerComputer): 'c64' | 'c128' | null {
  if (computer === 'c64') return 'c64';
  if (computer === 'c128' || computer === 'c128vdc') return 'c128';
  return null;
}

function canSendPrgPlayerToUltimate(
  ultimateOnline: boolean,
  ultimateMachineType: UltimateMachineType,
  computer: PlayerComputer
): boolean {
  if (!ultimateOnline) return false;
  if (ultimateMachineType !== 'c64' && ultimateMachineType !== 'c128') return false;
  const expectedMachine = mapPlayerComputerToUltimateMachine(computer);
  if (expectedMachine === null) return false;
  return expectedMachine === ultimateMachineType;
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
  frameNames: string[];
}

function resolveSongFilePath(songFile: string | string[] | undefined): string | null {
  if (Array.isArray(songFile)) {
    const first = songFile[0];
    return typeof first === 'string' && first !== '' ? first : null;
  }
  if (typeof songFile === 'string' && songFile !== '') return songFile;
  return null;
}

function readSidLoadAddressHex(songFile: string | string[] | undefined): string | null {
  const sidPath = resolveSongFilePath(songFile);
  if (!sidPath) return null;
  try {
    const bytes = fs.readFileSync(sidPath);
    if (!bytes || bytes.length < 2) return null;

    const magic = bytes.toString('ascii', 0, 4);
    if (magic === 'PSID' || magic === 'RSID') {
      if (bytes.length < 0x7C) return null;
      const dataOffset = (bytes[6] << 8) | bytes[7];
      let loadAddress = (bytes[8] << 8) | bytes[9];
      if (loadAddress === 0) {
        if (dataOffset + 1 >= bytes.length) return null;
        loadAddress = bytes[dataOffset] | (bytes[dataOffset + 1] << 8);
      }
      return `$${loadAddress.toString(16).toUpperCase().padStart(4, '0')}`;
    }

    const loadAddress = bytes[0] | (bytes[1] << 8);
    return `$${loadAddress.toString(16).toUpperCase().padStart(4, '0')}`;
  } catch (_) {
    return null;
  }
}

class PrgPlayerExportForm extends Component<PrgPlayerExportFormatProps> {

  handleImportMusic = () => {
    const filename = dialogPickSidFile();
    this.props.setField('songFile',filename)
  }

  handleComputerChange = (name: string, value: any) => {
    this.props.setField(name, value)
    const nextPlayerType = this.props.state.playerType;
    const nextIsScroll = nextPlayerType === 'Long Scroll' || nextPlayerType === 'Wide Pan';
    const sidAllowed = value === 'c64' || (value === 'c128' && nextIsScroll);
    if (!sidAllowed && this.props.state.music) {
      this.props.setField('music', false)
    }
    // Note: `sendToUltimate` is intentionally NOT touched here.  The export
    // modal renders the checkbox based on the live `canSendPrgPlayerToUltimate`
    // gate, and `handleExport` strips the flag if the gate disallows it.
    // Mutating it from the radio handler would conflict with that single
    // source of truth (e.g. forcing it true when Ultimate is offline, or
    // false when an Ultimate-c128 actually accepts a c128 export).
    // VDC mode is single-frame only for now
    if (value === 'c128vdc' && this.props.state.playerType !== 'Single Frame') {
      this.props.setField('playerType', 'Single Frame')
      this.props.setField('currentScreenOnly', true)
    }
  }

  handlePlayerTypeChange = (name: string, value: any) => {
    this.props.setField(name, value)
    this.props.setField('currentScreenOnly', value === 'Single Frame')
    const isScroll = value === 'Long Scroll' || value === 'Wide Pan';
    let nextComputer = this.props.state.computer;
    if (isScroll && nextComputer !== 'c64' && nextComputer !== 'c128') {
      nextComputer = 'c64';
      this.props.setField('computer', nextComputer)
    }
    const sidAllowed = nextComputer === 'c64' || (nextComputer === 'c128' && isScroll);
    if (!sidAllowed && this.props.state.music) {
      this.props.setField('music', false)
    }
    // When switching to Animation, default end frame to last frame
    if (value === 'Animation' && this.props.frameNames.length > 0) {
      this.props.setField('animEndFrame', this.props.frameNames.length - 1)
    }
  }

  render () {
    const computer = this.props.state.computer;
    const isC64 = computer === 'c64';
    const isC128 = computer === 'c128';
    const isVDC = computer === 'c128vdc';
    const isScrollComputer = isC64 || isC128;
    const playerType = this.props.state.playerType;
    const isAnimation = playerType === 'Animation';
    const isScroll = playerType === 'Long Scroll' || playerType === 'Wide Pan';
    const supportsSid = (isC64 && (playerType === 'Single Frame' || isAnimation || isScroll))
      || (isC128 && isScroll);
    const scrollMode = this.props.state.playerScrollMode || 'wrap';
    const showFPS = isAnimation || isScroll;
    const scrollModeOptions = [
      { value: 'wrap', label: 'Wrap (circular)' },
      { value: 'pingpong', label: 'Ping-Pong' },
    ];

    const sidControls = () => {
      const songDisplay = resolveSongFilePath(this.props.state.songFile) || '';
      const loadAddressHex = readSidLoadAddressHex(this.props.state.songFile);
      return (
        <Fragment>
          <Checkbox name='music' label='Music/SID' />
          {this.props.state.music && (
            <div style={{marginTop:'4px'}}>
              <div style={{display:'flex', alignItems:'center', gap:'6px', marginBottom:'4px'}}>
                <button className={styles.buttonMusicAdd} onClick={this.handleImportMusic}>Pick Music</button>
                <span style={{fontSize:'11px', color:'#aaa', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                  {songDisplay !== '' ? songDisplay : 'No file selected...'}
                </span>
              </div>
              <div style={{marginBottom:'4px'}}>
                <NumberInput name='songNumber' label='Song ID' style={{width:'48px'}} min="1" max="1" width="1" />
              </div>
              <div style={{fontSize:'11px', color:'#aaa'}}>
                Load address: {loadAddressHex || 'N/A'}
              </div>
            </div>
          )}
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

    const frameOptions = this.props.frameNames.map((name, i) => ({
      value: String(i), label: `${i + 1}: ${name}`,
    }));

    const frameRangeControls = () => {
      return (
        <div style={{marginTop:'6px', paddingTop:'6px', borderTop:'1px solid var(--border-color)'}}>
          <div style={{fontSize:'11px', fontWeight:'bold', textTransform:'uppercase', letterSpacing:'0.5px', color:'var(--subtle-text-color)', marginBottom:'4px'}}>Frame Range</div>
          <div style={{display:'flex', alignItems:'center', marginBottom:'4px'}}>
            <span style={{fontSize:'12px', display:'inline-block', minWidth:'36px'}}>Start</span>
            <select
              style={{flex:1, fontSize:'12px', background:'var(--input-bg-color)', color:'var(--input-text-color)', border:0, padding:'2px 4px'}}
              value={String(this.props.state.animStartFrame)}
              onChange={(e) => this.props.setField('animStartFrame', e.target.value)}
            >
              {frameOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div style={{display:'flex', alignItems:'center', marginBottom:'4px'}}>
            <span style={{fontSize:'12px', display:'inline-block', minWidth:'36px'}}>End</span>
            <select
              style={{flex:1, fontSize:'12px', background:'var(--input-bg-color)', color:'var(--input-text-color)', border:0, padding:'2px 4px'}}
              value={String(this.props.state.animEndFrame)}
              onChange={(e) => this.props.setField('animEndFrame', e.target.value)}
            >
              {frameOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      )
    }

    const fpsControls = () => {
      const sliderValueRaw = parseInt(String(this.props.state.playerFPS ?? 10), 10);
      const sliderValue = Number.isFinite(sliderValueRaw)
        ? Math.max(1, Math.min(60, sliderValueRaw))
        : 10;
      return (
        <div style={{marginTop:'8px', paddingTop:'6px', borderTop:'1px solid var(--border-color)'}}>
          {!isScroll && <NumberInput name='playerFPS' label='FPS' style={{width:'48px'}} />}
          {isScroll && (
            <div style={{display:'flex', flexDirection:'column', gap:'3px', marginBottom:'4px'}}>
              <label style={{fontSize:'12px'}}>
                Scroll speed: {sliderValue}
                <input
                  type='range'
                  min={1}
                  max={60}
                  step={1}
                  value={sliderValue}
                  style={{display:'block', width:'100%', marginTop:'4px'}}
                  onChange={(e) => this.props.setField('playerFPS', parseInt(e.target.value, 10))}
                />
              </label>
              <div style={{fontSize:'11px', color:'#aaa'}}>Min 1 · Max 60</div>
            </div>
          )}
          {isScroll && (
            <Select name='playerScrollMode' label='Scroll mode' options={scrollModeOptions} />
          )}
          {isAnimation && isVic20 && <Select name='vic20RAM' label='RAM' options={vic20RAMOptions} />}
          {isScroll && (
            <div style={{fontSize:'11px', color:'#aaa', marginTop:'4px'}}>
              Runtime keys: SPACE pause, M mute, + / - speed.
            </div>
          )}
        </div>
      )
    }

    // Platform memory/capability notes
    const platformNote = (): string | null => {
      if (isScroll) {
        const target = computer === 'c128' ? 'C128 40-col' : 'C64';
        if (playerType === 'Long Scroll') {
          return `Vertical smooth scroll (${scrollMode === 'pingpong' ? 'ping-pong' : 'circular wrap'}). Source frame height > 25 rows. ${target}.`;
        }
        if (playerType === 'Wide Pan') {
          return `Horizontal smooth scroll (${scrollMode === 'pingpong' ? 'ping-pong' : 'circular wrap'}). Source frame width > 40 cols. ${target}.`;
        }
      }
      if (!isAnimation) {
        switch (computer) {
          case 'c16':     return 'C16/Plus4: TED video. 121 colors. No SID.';
          case 'c128':    return 'C128 40-col: VIC-II output. SID available in Long Scroll/Wide Pan modes.';
          case 'c128vdc': return 'C128 VDC 80-col: RGBI output. 80×25 screen. Single frame only.';
          case 'pet4032': return 'PET 4032: No color RAM, no SID.';
          case 'pet8032': return 'PET 8032: 80-column mode. No color RAM, no SID.';
          case 'vic20':  return 'VIC-20: 5KB base RAM (expandable). No SID.';
          default: return null;
        }
      }
      switch (computer) {
        case 'c64':
          return this.props.state.music
            ? 'C64 anim: ~40KB for frames ($2000-$CFFF, SID at $1000)'
            : 'C64 anim: ~44KB for frames ($2000-$CFFF)';
        case 'c16':    return 'C16/Plus4 anim: ~44KB for frames ($2000-$CFFF). No SID.';
        case 'c128':   return 'C128 anim: ~44KB for frames ($2000-$CFFF). No SID.';
        case 'pet4032': return 'PET 4032 anim: ~30KB for frames ($0800-$7FFF). Screen only, no color.';
        case 'pet8032': return 'PET 8032 anim: ~30KB for frames ($0800-$7FFF). 80-col screen, no color.';
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

        <div className={common.columns}>
          <div className={common.col}>
            <div className={common.colLabel}>Computer</div>
            <Form state={this.props.state} setField={this.handleComputerChange}>
              <RadioButton name='computer' value='c64' label='C64' />
              <RadioButton name='computer' value='c16' label='C16/Plus4' />
              <RadioButton name='computer' value='pet4032' label='Pet 4032' />
              <RadioButton name='computer' value='pet8032' label='Pet 8032' />
              <RadioButton name='computer' value='c128' label='C128 (40-col)' />
              <RadioButton name='computer' value='c128vdc' label='C128 VDC (80-col)' />
              <RadioButton name='computer' value='vic20' label='Vic 20' />
            </Form>
          </div>
          <div className={common.col}>
            <div className={common.colLabel}>Player Type</div>
            <Form state={this.props.state} setField={this.handlePlayerTypeChange}>
              <RadioButton name='playerType' value='Single Frame' label='Single Frame' />
              <RadioButton name='playerType' value='Animation' label='Animation' disabled={isVDC} />
              <RadioButton name='playerType' value='Long Scroll' label='Long Scroll' disabled={!isScrollComputer} />
              <RadioButton name='playerType' value='Wide Pan' label='Wide Pan' disabled={!isScrollComputer} />
            </Form>
            {showFPS ? fpsControls() : null}
            {isAnimation ? frameRangeControls() : null}
            {supportsSid && (
              <div style={{marginTop:'8px', paddingTop:'6px', borderTop:'1px solid var(--border-color)'}}>
                <div style={{fontSize:'11px', fontWeight:'bold', textTransform:'uppercase', letterSpacing:'0.5px', color:'var(--subtle-text-color)', marginBottom:'4px'}}>SID / Music</div>
                {sidControls()}
              </div>
            )}
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
  prgPlayer: FileFormatPlayerV1['exportOptions'];
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
  frameNames: string[];
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
            <PrgPlayerExportForm {...connectFormState(this.props, 'prgPlayer')} frameNames={this.props.frameNames} />
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
  emulatorPaths: import('../redux/types').EmulatorPaths;
  frameNames: string[];
  currentFramebuf: Framebuf | null;
  ultimateOnline: boolean;
  ultimateMachineType: UltimateMachineType;
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
        playerScrollMode: 'wrap',
        playerScrollType: 'Linear',
        animStartFrame: 0,
        animEndFrame: 0,
        computer: 'c64' ,
        vic20RAM: 'unexpanded',
        sendToUltimate: true,

    },
  }

  handleExport = (launch: boolean) => {
    const { showExport } = this.props;
    this.props.Toolbar.setShowExport({show:false});
    const fmt = showExport.fmt!;
    const name = fmt.name;
    if (fmt.exportOptions === undefined) {
      return;
    }
    const amendedFmt: any = {
      ...showExport.fmt,
      exportOptions: {
        ...this.state[name]
      }
    };
    if (name === 'prgPlayer') {
      const playerOptions = amendedFmt.exportOptions as FileFormatPlayerV1['exportOptions'];
      const sendAllowed = canSendPrgPlayerToUltimate(
        this.props.ultimateOnline,
        this.props.ultimateMachineType,
        playerOptions.computer
      );
      if (!sendAllowed) {
        playerOptions.sendToUltimate = false;
      }
    }
    if (launch) {
      amendedFmt.launchAfterExport = true;
    }
    this.props.fileExportAs(amendedFmt as FileFormat);
  }

  handleOK = () => {
    this.handleExport(false);
  }

  handleExportAndLaunch = () => {
    this.handleExport(true);
  }

  handleCancel = () => {
    this.props.Toolbar.setShowExport({show:false})
  }

  // When the export dialog becomes visible for the PRG Player, seed the
  // Computer/ROM target (and dependent flags) from the current framebuf's
  // charset so the default selection matches the frame being exported.
  componentDidUpdate(prevProps: ExportModalProps & ExportModalDispatch) {
    const prev = prevProps.showExport;
    const curr = this.props.showExport;
    const isPrgPlayerOpen = curr.show && curr.fmt?.name === 'prgPlayer';
    if (!isPrgPlayerOpen) return;

    // Snapshot Ultimate status into locals so the setState updater below
    // doesn't depend on potentially-stale `this.props` if React batches
    // the update across props changes.
    const ultimateOnline = this.props.ultimateOnline;
    const ultimateMachineType = this.props.ultimateMachineType;

    const justOpened = !prev.show || prev.fmt?.name !== curr.fmt?.name;
    if (justOpened) {
      const targetComputer: PlayerComputer = charsetToPlayerComputer(this.props.currentFramebuf);
      this.setState(prevState => {
        const player = prevState.prgPlayer;
        const isC64 = targetComputer === 'c64';
        const isC128 = targetComputer === 'c128';
        const isVDC = targetComputer === 'c128vdc';
        const currentPlayerType = player.playerType;
        const isScroll = currentPlayerType === 'Long Scroll' || currentPlayerType === 'Wide Pan';
        const sidAllowed = isC64 || (isC128 && isScroll);
        const nextPlayer = { ...player, computer: targetComputer };
        // VDC player only supports Single Frame today.
        if (isVDC && currentPlayerType !== 'Single Frame') {
          nextPlayer.playerType = 'Single Frame';
          nextPlayer.currentScreenOnly = true;
        }
        if (!sidAllowed && nextPlayer.music) {
          nextPlayer.music = false;
        }
        nextPlayer.sendToUltimate = canSendPrgPlayerToUltimate(
          ultimateOnline,
          ultimateMachineType,
          targetComputer
        );
        return { ...prevState, prgPlayer: nextPlayer };
      });
      return;
    }

    const ultimateStatusChanged =
      prevProps.ultimateOnline !== ultimateOnline ||
      prevProps.ultimateMachineType !== ultimateMachineType;
    if (!ultimateStatusChanged) return;

    const selectedComputer = this.state.prgPlayer.computer;
    const sendAllowed = canSendPrgPlayerToUltimate(
      ultimateOnline,
      ultimateMachineType,
      selectedComputer
    );
    // Symmetrise with the justOpened branch: when the Ultimate transitions
    // from offline -> online (or to a matching machine type) while the modal
    // is already open, default the checkbox on so the option doesn't quietly
    // appear unchecked.  Conversely, clear the flag if it's no longer
    // allowed so we don't ship a stale opt-in to handleExport.
    if (sendAllowed && !this.state.prgPlayer.sendToUltimate) {
      this.setState(prevState => ({
        ...prevState,
        prgPlayer: { ...prevState.prgPlayer, sendToUltimate: true },
      }));
    } else if (!sendAllowed && this.state.prgPlayer.sendToUltimate) {
      this.setState(prevState => ({
        ...prevState,
        prgPlayer: { ...prevState.prgPlayer, sendToUltimate: false },
      }));
    }
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
    const selectedComputer = this.state.prgPlayer.computer;
    const emulatorKey = selectedComputer === 'c128vdc' ? 'c128' : selectedComputer;
    const configuredEmulatorPath = emulatorKey
      ? this.props.emulatorPaths[emulatorKey as keyof import('../redux/types').EmulatorPaths]
      : '';
    const hasConfiguredEmulator = typeof configuredEmulatorPath === 'string' && configuredEmulatorPath !== '';
    const canUseWindowsDevFallback = process.platform === 'win32'
      && !electron.remote.app.isPackaged
      && ['c64', 'c128', 'pet4032', 'pet8032', 'vic20', 'c16'].includes(String(emulatorKey || ''));
    const canLaunchPlayer = hasConfiguredEmulator || canUseWindowsDevFallback;
    const canShowSendToUltimate =
      showExport.fmt?.name === 'prgPlayer' &&
      canSendPrgPlayerToUltimate(
        this.props.ultimateOnline,
        this.props.ultimateMachineType,
        selectedComputer
      );
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
              frameNames={this.props.frameNames}
            />

            <div className={common.footer}>
              {canShowSendToUltimate && (
                <label style={{display:'flex', alignItems:'center', gap:'4px', marginRight:'auto', fontSize:'12px', cursor:'pointer'}}>
                  <input
                    type='checkbox'
                    checked={this.state.prgPlayer.sendToUltimate}
                    onChange={(e) => this.handleSetState((prev: any) => ({
                      ...prev,
                      prgPlayer: { ...prev.prgPlayer, sendToUltimate: e.target.checked }
                    }))}
                  />
                  Send to Ultimate
                </label>
              )}
              {showExport.fmt?.name === 'd64File' && (
                <label style={{display:'flex', alignItems:'center', gap:'4px', marginRight:'auto', fontSize:'12px', cursor:'pointer'}}>
                  <input
                    type='checkbox'
                    checked={(this.state.d64File as any)?.mountOnUltimate ?? false}
                    onChange={(e) => this.handleSetState((prev: any) => ({
                      ...prev,
                      d64File: { ...prev.d64File, mountOnUltimate: e.target.checked }
                    }))}
                  />
                  Mount on Ultimate
                </label>
              )}
              <button className='cancel' onClick={this.handleCancel}>Cancel</button>
              {showExport.fmt?.name === 'prgPlayer' && canLaunchPlayer && (
                <button className='primary' onClick={this.handleExportAndLaunch}>Export &amp; Launch</button>
              )}
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
    const screens = screensSelectors.getScreens(state);
    const frameNames = screens.map((fbIdx: number, i: number) => {
      const fb = selectors.getFramebufByIndex(state, fbIdx);
      return fb && fb.name ? fb.name : `Frame ${i + 1}`;
    });
    return {
      showExport: state.toolbar.showExport,
      emulatorPaths: state.settings.saved.emulatorPaths,
      frameNames,
      currentFramebuf: selectors.getCurrentFramebuf(state),
      ultimateOnline: state.toolbar.ultimateOnline,
      ultimateMachineType: state.toolbar.ultimateMachineType,
    }
  },
  (dispatch) => {
    return {
      Toolbar: bindActionCreators(toolbar.Toolbar.actions, dispatch),
      fileExportAs: bindActionCreators(ReduxRoot.actions.fileExportAs, dispatch)
    }
  }
)(ExportModal_)
