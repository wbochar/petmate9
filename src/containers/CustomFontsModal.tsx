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
import * as customFonts from '../redux/customFonts';
import * as selectors from '../redux/selectors';

import common from './ModalCommon.module.css'

function loadFont(filename: string): Font {
  const charOrder = [];

  const bb = fs.readFileSync(filename).slice(2, 2048+2);
  const bits = Array(256*8).fill(0);
  for (let i = 0; i < bb.length; i++) {
    bits[i] = bb[i];
  }
  for (let i = 0; i < 256; i++) {
    charOrder.push(i);
  }
  return { bits, charOrder };
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
    return (
      <div style={{display: 'flex', alignItems: 'center', marginBottom: '4px'}}>
        <button style={{margin:'0px', minWidth: '120px', fontSize: '12px'}} className='secondary' onClick={() => this.handleLoadFont()}>{buttonText}</button>
        {fontName === '' ? null : <div style={{marginLeft: '8px', fontSize: '12px'}}>{fontName}</div>}
      </div>
    );
  }
}

interface CustomFontsStateProps {
  showCustomFonts: boolean;
  customFonts: customFonts.CustomFonts;
};

interface CustomFontsDispatchProps  {
  CustomFonts: customFonts.PropsFromDispatch;
  Toolbar: any;
}

class CustomFontsModal_ extends Component<CustomFontsStateProps & CustomFontsDispatchProps> {
  handleOK = () => {
    this.props.Toolbar.setShowCustomFonts(false)
  }

  handleLoadFont = (customFontId: string | undefined, filename: string) => {
    const font = loadFont(filename);
    const fontId = customFontId === undefined ? `custom_${Object.entries(this.props.customFonts).length+1}` : customFontId;
    const fontName = path.basename(filename, '.64c');
    this.props.CustomFonts.addCustomFont(fontId, fontName, font);
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
              {fonts.map(({ id, name }) => <CustomFont key={id} id={id} name={name} onLoadFont={this.handleLoadFont} />)}
              <CustomFont onLoadFont={this.handleLoadFont} />
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
      customFonts: selectors.getCustomFonts(state)
    }
  },
  (dispatch) => {
    return {
      Toolbar: Toolbar.bindDispatch(dispatch),
      CustomFonts: bindActionCreators(customFonts.actions, dispatch)
    }
  }
)(CustomFontsModal_)
