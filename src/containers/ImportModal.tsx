import React, { Component, FC, CSSProperties } from 'react'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux';
import memoize  from 'fast-memoize'
import { PNG } from 'pngjs'
import classnames from 'classnames'
import Modal from '../components/Modal'

import * as toolbar from '../redux/toolbar'
import * as ReduxRoot from '../redux/root'

import { FileFormat, RootState, Pixel, Rgb, Framebuf } from '../redux/types';
import CharGrid from '../components/CharGrid';
import FontSelector from '../components/FontSelector';
import { getROMFontBits } from '../redux/selectors';
import { dialogReadFile, colorIndexToCssRgb, colorPalettes } from '../utils';

import * as png2pet from '../utils/importers/png2petscii'
import { DEFAULT_BACKGROUND_COLOR, DEFAULT_BORDER_COLOR, DEFAULT_ZOOM, DEFAULT_ZOOMREADY, DIRART_ILLEGAL_CHARS } from '../redux/editor';
import { getSettingsCurrentColorPalette } from '../redux/settingsSelectors';
import ColorPicker from '../components/ColorPicker';

import styles from './ImportModal.module.css'
import common from './ModalCommon.module.css'

const ErrorMsg: FC<{ msg: string }> = ({ msg }) => <div className={classnames(styles.error, styles.title)}>Error: <span className={classnames(styles.error, styles.msg)}>{msg}</span></div>
const Text: FC<{children?: React.ReactNode}> = ({children}) => <div className={styles.text}>{children}</div>

const getROMFontBitsMemoized = memoize(getROMFontBits);
const petsciifyMemoized = memoize(petsciify);

interface PngPreviewProps {
  currentColorPalette: Rgb[];
  framebuf: Pixel[][];
  backgroundColor: number;
  borderColor: number;
  width: number;  // PETSCII width in chars
  height: number; // PETSCII height in chars
  charset: string;
}

function convertScreencodes(
  width: number,
  height: number,
  screencodes: Uint8Array,
  colors: (number|undefined)[]
): Pixel[][] {
  const dst = Array(height);
  for (let y = 0; y < height; y++) {
    const row = Array(width);
    for (let x = 0; x < width; x++) {
      const code = screencodes[y*width + x];
      const color = colors[y*width + x];
      row[x] = { code, color: color === undefined ? DEFAULT_BACKGROUND_COLOR : color };
    }
    dst[y] = row;
  }
  return dst;
}

class PngPreview extends Component<PngPreviewProps> {
  render () {
    const { width, height, backgroundColor } = this.props;
    const scaleX = 1.0;
    const scaleY = 1.0;
    const scale: CSSProperties = {
      width: width*8,
      height: height*8,
      transform: `scale(${scaleX},${scaleY})`,
      transformOrigin: '0% 0%',
      imageRendering: 'pixelated',
      borderColor: colorIndexToCssRgb(this.props.currentColorPalette, this.props.borderColor),
      borderWidth: '10px',
      borderStyle: 'solid',
    }
    const font = getROMFontBitsMemoized(this.props.charset);
    return (
      <div style={{height:'100%'}}>
        <div className={common.colLabel}>Preview</div>
        <div style={scale}>
          <CharGrid
            width={width}
            height={height}
            srcX={0}
            srcY={0}
            grid={false}
            font={font}
            backgroundColor={colorIndexToCssRgb(this.props.currentColorPalette, backgroundColor)}
            colorPalette={this.props.currentColorPalette}
            framebuf={this.props.framebuf}
          />
        </div>
      </div>
    )
  }
}

interface ImportModalProps {
  showImport: {
    show: boolean;
    fmt?: FileFormat; // undefined if show=false
  };
  currentColorPalette: Rgb[];
  colorPalettes: Rgb[][];
};

interface ImportModalDispatch {
  Toolbar: toolbar.PropsFromDispatch;
  importFramebufsAppend: (framebufs: Framebuf[]) => void;
}


interface ImportModalState {
  charset: string;
  png?: PNG;
  selectedBackgroundColor?: number;
  dirartSafe: boolean;
  /** Crop dimensions — auto-set to the detected PETSCII size on load,
   *  user can shrink to crop the import.  null = not yet loaded. */
  cropWidth: number | null;
  cropHeight: number | null;
}

function findMatchByBackgroundColor(
  matches: png2pet.Match[],
  backgroundColor: number | undefined
) {
  if (backgroundColor === undefined) {
    return matches[0];
  }
  for (let idx in matches) {
    if (matches[idx].backgroundColor === backgroundColor) {
      return matches[idx];
    }
  }
  throw new Error('impossible');
}

function toFramebuf(
  petscii: png2pet.Result,
  selectedBackgroundColor: number | undefined,
  charset: string
): Framebuf {
  const { width, height, matches, borderColor } = petscii;
  const match = findMatchByBackgroundColor(matches, selectedBackgroundColor);
  const f = petscii!;
  return {
    framebuf: convertScreencodes(width, height, match.screencodes, match.colors),
    width: f.width,
    height: f.height,
    backgroundColor: match.backgroundColor,
    borderColor: borderColor !== undefined ? borderColor : DEFAULT_BORDER_COLOR,
    charset,
    borderOn:false,
    zoom: DEFAULT_ZOOM,
    zoomReady: DEFAULT_ZOOMREADY,
  };
}

function petsciify(png: PNG|undefined, colorPalettes: Rgb[][], charset: string) {
  if (!png) {
    return undefined;
  }
  const petscii = png2pet.png2petscii({
    width: png.width,
    height: png.height,
    data: png.data,
    rgbPalettes: colorPalettes,
    fontBits: Buffer.from(getROMFontBitsMemoized(charset).bits)
  });
  return petscii;
}

class ImportModal_ extends Component<ImportModalProps & ImportModalDispatch, ImportModalState> {

  state: ImportModalState = {
    charset: 'upper',
    selectedBackgroundColor: undefined,
    dirartSafe: false,
    cropWidth: null,
    cropHeight: null,
  };

  setPNG = (png?: PNG) => {
    this.setState({
      png,
      charset: 'upper',
      selectedBackgroundColor: undefined,
      dirartSafe: false,
      cropWidth: null,
      cropHeight: null,
    });
  }

  handleOK = () => {
    this.props.Toolbar.setShowImport({show:false});
    const petscii = petsciifyMemoized(this.state.png, this.props.colorPalettes, this.state.charset);
    if (petscii !== undefined && !png2pet.isError(petscii)) {
      const fb = this.applyImportFilters(
        toFramebuf(petscii, this.state.selectedBackgroundColor, this.state.charset)
      );
      this.props.importFramebufsAppend([fb]);
    }
    this.setPNG();
  }

  handleCancel = () => {
    this.props.Toolbar.setShowImport({show:false})
    this.setPNG();
  }

  handleSetCharset = (c: string) => {
    this.setState({ charset: c });
  }

  handleSelectPng = () => {
    dialogReadFile(this.props.showImport.fmt!, (data) => {
      this.setPNG(PNG.sync.read(Buffer.from(data)));
    });
  }

  handleSelectBackgroundColor = (color: number) => {
    this.setState({selectedBackgroundColor: color});
  }

  /** Apply crop + dirartSafe to a framebuf. */
  private applyImportFilters(fb: Framebuf): Framebuf {
    let out = fb;
    // Crop
    const cw = this.state.cropWidth;
    const ch = this.state.cropHeight;
    if (cw !== null && ch !== null && (cw < out.width || ch < out.height)) {
      const w = Math.max(1, Math.min(cw, out.width));
      const h = Math.max(1, Math.min(ch, out.height));
      out = {
        ...out,
        width: w,
        height: h,
        framebuf: out.framebuf.slice(0, h).map(row => row.slice(0, w)),
      };
    }
    // DirArt safe
    if (this.state.dirartSafe) {
      out = {
        ...out,
        framebuf: out.framebuf.map(row =>
          row.map(cell => DIRART_ILLEGAL_CHARS.has(cell.code) ? { ...cell, code: 0x20 } : cell)
        ),
      };
    }
    return out;
  }

  render () {
    const { showImport } = this.props;
    const petscii = petsciifyMemoized(this.state.png, this.props.colorPalettes, this.state.charset);
    const matchedBackgroundColors = petscii && !png2pet.isError(petscii) ?
      petscii.matches.map((m) => m.backgroundColor) : [];
    const selectedBackground = petscii && !png2pet.isError(petscii) ?
      (this.state.selectedBackgroundColor === undefined ?
        matchedBackgroundColors[0] : this.state.selectedBackgroundColor) :
      0;
    // Auto-populate crop dims from detected PETSCII size.
    const fullWidth = petscii && !png2pet.isError(petscii) ? petscii.width : null;
    const fullHeight = petscii && !png2pet.isError(petscii) ? petscii.height : null;
    if (fullWidth !== null && fullHeight !== null && this.state.cropWidth === null) {
      // Schedule for next tick to avoid setState-in-render warning.
      setTimeout(() => this.setState({ cropWidth: fullWidth, cropHeight: fullHeight }), 0);
    }
    return (
      <div>
        <Modal showModal={showImport.show}>
          <div className={common.container}>
            <div className={common.title}>PNG Import Options</div>

            {petscii && !png2pet.isError(petscii) &&
              (() => {
                const previewFb = this.applyImportFilters(
                  toFramebuf(petscii, this.state.selectedBackgroundColor, this.state.charset)
                );
                return (
              <div>
                <PngPreview
                  currentColorPalette={this.props.currentColorPalette}
                  {...previewFb}
                />
                {matchedBackgroundColors.length > 1 &&
                  <div>
                    <Text>This image can be converted to any of the following background colors. Pick one:</Text>
                    <ColorPicker
                      scale={{scaleX:1, scaleY:1}}
                      paletteRemap={matchedBackgroundColors}
                      colorPalette={this.props.currentColorPalette}
                      selected={selectedBackground}
                      twoRows={false}
                      onSelectColor={this.handleSelectBackgroundColor}
                      ctrlKey={false}
                    />
                  </div>
                }
              </div>);
              })()}
            {petscii && png2pet.isError(petscii) && <ErrorMsg msg={petscii.error} />}
            <button className='secondary' style={{fontSize:'12px'}} onClick={this.handleSelectPng}>Select File...</button>
            {this.state.png &&
              <div style={{marginTop: '4px', marginBottom: '4px'}}>
                <FontSelector
                  currentCharset={this.state.charset}
                  customFonts={[]}
                  setCharset={this.handleSetCharset} />
              </div>}
            {fullWidth !== null && fullHeight !== null && (<>
              <div style={{display:'flex', alignItems:'center', gap:'6px', marginTop:'6px', fontSize:'12px'}}>
                <span>Crop:</span>
                <input type='number'
                  style={{width:'48px', fontSize:'12px'}}
                  min={1}
                  max={fullWidth}
                  value={this.state.cropWidth ?? fullWidth}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    this.setState({ cropWidth: isNaN(v) ? fullWidth : Math.max(1, Math.min(fullWidth, v)) });
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  onKeyUp={(e) => e.stopPropagation()}
                />
                <span>×</span>
                <input type='number'
                  style={{width:'48px', fontSize:'12px'}}
                  min={1}
                  max={fullHeight}
                  value={this.state.cropHeight ?? fullHeight}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    this.setState({ cropHeight: isNaN(v) ? fullHeight : Math.max(1, Math.min(fullHeight, v)) });
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  onKeyUp={(e) => e.stopPropagation()}
                />
                <span style={{color:'#aaa'}}>chars (detected {fullWidth}×{fullHeight})</span>
              </div>
              <label style={{display:'flex', alignItems:'center', gap:'4px', marginTop:'6px', fontSize:'12px', cursor:'pointer'}}>
                <input type='checkbox'
                  checked={this.state.dirartSafe}
                  onChange={(e) => this.setState({ dirartSafe: e.target.checked })}
                />
                Show only DirArt safe subset
              </label>
            </>)}

            <div className={common.footer}>
              <button className='cancel' onClick={this.handleCancel}>Cancel</button>
              <button className='primary' onClick={this.handleOK}>Import</button>
            </div>
          </div>
        </Modal>
      </div>
    )
  }
}

const getAllRgbPalettes = memoize(function (): Rgb[][] {
  return Object.values(colorPalettes);
});

export default connect(
  (state: RootState) => {
    return {
      showImport: state.toolbar.showImport,
      currentColorPalette: getSettingsCurrentColorPalette(state),
      colorPalettes: getAllRgbPalettes()
    }
  },
  (dispatch) => {
    return {
      Toolbar: bindActionCreators(toolbar.Toolbar.actions, dispatch),
      importFramebufsAppend: bindActionCreators(ReduxRoot.actions.importFramebufsAppend, dispatch)
    }
  }
)(ImportModal_)
