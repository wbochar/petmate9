import React, {
  Component,
  FC
} from 'react';
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux';

import { electron, fs, path } from '../utils/electronImports'
import Modal from '../components/Modal';
import { RootState, Font } from '../redux/types';
import { Toolbar } from '../redux/toolbar';
import { Framebuffer } from '../redux/editor';
import * as customFonts from '../redux/customFonts';
import * as selectors from '../redux/selectors';
import * as screensSelectors from '../redux/screensSelectors';
import { loadAppFile, charOrderUpper } from '../utils';

import common from './ModalCommon.module.css'

// The bar addon (16 chars: transparency marker, etc.) appended after the
// 256-char ROM data.  Loaded once and shared by all custom font imports.
const barAddon = Array.from(new Uint8Array(loadAppFile('assets/bar-minimal.bin')));

const PLATFORM_OPTIONS = [
  { id: 'c64',     label: 'C64' },
  { id: 'c128',    label: 'C128' },
  { id: 'c128vdc', label: 'C128 VDC' },
  { id: 'vic20',   label: 'VIC-20' },
  { id: 'pet',     label: 'PET' },
  { id: 'c16',     label: 'C16/Plus4' },
];

function loadFont(filename: string): Font {
  const bb = fs.readFileSync(filename).slice(2, 2048+2);
  // 256 glyphs from the .64c file + 16 bar addon chars (transparency, etc.)
  const bits = Array(272*8).fill(0);
  for (let i = 0; i < bb.length; i++) {
    bits[i] = bb[i];
  }
  // Append bar-minimal addon at offset 2048 (char 256+)
  for (let i = 0; i < barAddon.length; i++) {
    bits[2048 + i] = barAddon[i];
  }
  // Use the same curated Petmate sort order as built-in charsets
  return { bits, charOrder: [...charOrderUpper] };
}

export function openFileDialog() {
  const { dialog } = electron.remote;
  const window = electron.remote.getCurrentWindow();
  const filters = [
    { name: 'C64 font file', extensions: ['64c'] },
  ]
  const filename = dialog.showOpenDialogSync(window, { properties: ['openFile'], filters })
  if (filename === undefined || filename.length !== 1) {
    return undefined;
  }
  return filename[0];
}

interface CustomFontProps {
  id?: string;
  name?: string;
  platform?: string;
  onLoadFont: (id: string|undefined, filename: string) => void;
}

class CustomFont extends Component<CustomFontProps> {
  handleLoadFont = () => {
    const filename = openFileDialog();
    if (filename !== undefined) {
      this.props.onLoadFont(this.props.id, filename);
    }
  }

  render () {
    const { fontName, buttonText } = this.props.id !== undefined ? {
      fontName: this.props.name,
      buttonText: 'Load .64c..'
    } : {
      fontName: '',
      buttonText: 'New Font from .64c'
    };
    const platformLabel = this.props.platform
      ? PLATFORM_OPTIONS.find(p => this.props.id?.startsWith(p.id + '_'))?.label
      : undefined;
    return (
      <div style={{display: 'flex', alignItems: 'center', marginBottom: '4px'}}>
        <button style={{margin:'0px', minWidth: '120px', fontSize: '12px'}} className='secondary' onClick={() => this.handleLoadFont()}>{buttonText}</button>
        {fontName === '' ? null : <div style={{marginLeft: '8px', fontSize: '12px'}}>{fontName}</div>}
        {platformLabel ? <div style={{marginLeft: '6px', fontSize: '10px', color: 'var(--panel-hint-color)'}}>({platformLabel})</div> : null}
      </div>
    );
  }
}

interface CustomFontsStateProps {
  showCustomFonts: boolean;
  customFonts: customFonts.CustomFonts;
  framebufIndex: number | null;
};

interface CustomFontsDispatchProps  {
  CustomFonts: customFonts.PropsFromDispatch;
  Toolbar: any;
  dispatch: any;
}

class CustomFontsModal_ extends Component<CustomFontsStateProps & CustomFontsDispatchProps> {
  state = {
    selectedPlatform: 'c64',
  };

  handleOK = () => {
    this.props.Toolbar.setShowCustomFonts(false)
  }

  handleLoadFont = (customFontId: string | undefined, filename: string) => {
    const font = loadFont(filename);
    const isNew = customFontId === undefined;
    const platform = this.state.selectedPlatform;
    const fontId = isNew ? `${platform}_custom_${Object.entries(this.props.customFonts).length+1}` : customFontId;
    const fontName = path.basename(filename, '.64c');
    this.props.CustomFonts.addCustomFont(fontId, fontName, font);
    // Auto-switch the current frame to the newly loaded charset
    if (isNew && this.props.framebufIndex !== null) {
      this.props.dispatch(Framebuffer.actions.setCharset(fontId, this.props.framebufIndex));
    }
  }

  render () {
    const fonts = Object.entries(this.props.customFonts).map(([id, { name }]) => {
      return { id, name };
    });
    return (
      <div>
        <Modal showModal={this.props.showCustomFonts}>
          <div className={common.container} style={{color: 'var(--main-text-color)'}}>
            <div className={common.title}>Custom Fonts</div>

            <div className={common.colLabel}>Load custom fonts</div>
            <div>
              {fonts.map(({ id, name }) => <CustomFont key={id} id={id} name={name} platform={id} onLoadFont={this.handleLoadFont} />)}
              <div style={{display: 'flex', alignItems: 'center', marginBottom: '4px', gap: '6px'}}>
                <CustomFont onLoadFont={this.handleLoadFont} />
                <select
                  value={this.state.selectedPlatform}
                  onChange={(e) => this.setState({ selectedPlatform: e.target.value })}
                  style={{
                    fontSize: '12px',
                    background: 'var(--panel-btn-bg)',
                    color: 'var(--panel-btn-color)',
                    border: '1px solid var(--panel-btn-border)',
                    padding: '2px 4px',
                    cursor: 'pointer',
                  }}
                  title="Platform determines which color palette and export options are used"
                >
                  {PLATFORM_OPTIONS.map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={common.footer}>
              <button className='primary' onClick={this.handleOK}>OK</button>
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
      showCustomFonts: state.toolbar.showCustomFonts,
      customFonts: selectors.getCustomFonts(state),
      framebufIndex: screensSelectors.getCurrentScreenFramebufIndex(state),
    }
  },
  (dispatch) => {
    return {
      Toolbar: Toolbar.bindDispatch(dispatch),
      CustomFonts: bindActionCreators(customFonts.actions, dispatch),
      dispatch,
    }
  }
)(CustomFontsModal_)
