import React, { Component } from 'react'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux'

import Modal from '../components/Modal'

import * as toolbar from '../redux/toolbar'
import * as ReduxRoot from '../redux/root'
import { Framebuffer } from '../redux/editor'
import { DEFAULT_BACKGROUND_COLOR, DEFAULT_BORDER_COLOR } from '../redux/editor'

import { Framebuf, RootState } from '../redux/types'
import { loadSeqAdvanced, SeqAdvOptions } from '../utils/importers/seq2petscii'
import { formats } from '../utils'
import { electron, fs, path, app } from '../utils/electronImports'
import FontSelector from '../components/FontSelector'
import * as selectors from '../redux/selectors'
import * as screensSelectors from '../redux/screensSelectors'

import styles from './ImportSeqAdvModal.module.css'

const screenPresets: { id: string; label: string; width: number }[] = [
  { id: 'c64',      label: 'C64 40x25',     width: 40 },
  { id: 'c128-40',  label: 'C128 40x25',    width: 40 },
  { id: 'c128-80',  label: 'C128 80x25',    width: 80 },
  { id: 'pet-40',   label: 'Pet 40x25',     width: 40 },
  { id: 'pet-80',   label: 'Pet 80x25',     width: 80 },
  { id: 'vic20',    label: 'Vic20 22x23',   width: 22 },
  { id: 'custom',   label: 'Custom',        width: 40 },
]

interface ImportSeqAdvModalProps {
  showImportSeqAdv: { show: boolean };
  currentFramebuf: Framebuf | null;
  currentFramebufIndex: number | null;
}

interface ImportSeqAdvModalDispatch {
  Toolbar: toolbar.PropsFromDispatch;
  importFramebufsAppend: (framebufs: Framebuf[]) => void;
  importFileOverwrite: (data: any, framebufIndex: number) => void;
}

interface ImportSeqAdvModalState {
  filename: string | null;
  fileData: Buffer | null;
  importMode: 'overwrite' | 'new';
  useCurrentColors: boolean;
  charset: string;
  screenPreset: string;
  customWidth: number;
  cr0d: boolean;
  cr8d: boolean;
  customLineEndings: string;
  honorCls: boolean;
  stripBlanks: boolean;
}

const defaultState: ImportSeqAdvModalState = {
  filename: null,
  fileData: null,
  importMode: 'new',
  useCurrentColors: true,
  charset: 'upper',
  screenPreset: 'c64',
  customWidth: 40,
  cr0d: true,
  cr8d: true,
  customLineEndings: '',
  honorCls: true,
  stripBlanks: false,
}

class ImportSeqAdvModal_ extends Component<ImportSeqAdvModalProps & ImportSeqAdvModalDispatch, ImportSeqAdvModalState> {
  state: ImportSeqAdvModalState = { ...defaultState };

  resetState = () => {
    this.setState({ ...defaultState });
  }

  handleSelectFileWithDialog = () => {
    const { dialog } = electron.remote;
    const window_ = electron.remote.getCurrentWindow();
    const filters = [
      { name: 'SEQ Files', extensions: ['seq'] }
    ];
    const filenames = dialog.showOpenDialogSync(window_, { properties: ['openFile'], filters });
    if (filenames === undefined || filenames.length === 0) {
      return;
    }
    const filename = filenames[0];
    const data = fs.readFileSync(filename);
    this.setState({
      fileData: data,
      filename: path.basename(filename),
    });
  }

  handleOK = () => {
    this.props.Toolbar.setShowImportSeqAdv({ show: false });

    if (!this.state.fileData || !this.state.filename) {
      this.resetState();
      return;
    }

    // Build CR codes set
    const crCodes = new Set<number>();
    if (this.state.cr0d) crCodes.add(0x0d);
    if (this.state.cr8d) crCodes.add(0x8d);

    // Parse custom line endings
    if (this.state.customLineEndings.trim() !== '') {
      const parts = this.state.customLineEndings.split(',');
      for (const part of parts) {
        const trimmed = part.trim().toLowerCase();
        if (trimmed === '') continue;
        const val = trimmed.startsWith('0x')
          ? parseInt(trimmed, 16)
          : parseInt(trimmed, 16); // Treat all as hex
        if (!isNaN(val) && val >= 0 && val <= 0xff) {
          crCodes.add(val);
        }
      }
    }

    // Determine width
    const width = this.getEffectiveWidth();

    // Determine colors
    let backgroundColor = DEFAULT_BACKGROUND_COLOR;
    let borderColor = DEFAULT_BORDER_COLOR;

    if (this.state.importMode === 'new' && this.state.useCurrentColors && this.props.currentFramebuf) {
      backgroundColor = this.props.currentFramebuf.backgroundColor;
      borderColor = this.props.currentFramebuf.borderColor;
    } else if (this.state.importMode === 'overwrite' && this.props.currentFramebuf) {
      backgroundColor = this.props.currentFramebuf.backgroundColor;
      borderColor = this.props.currentFramebuf.borderColor;
    }

    // Determine charset
    const charset = this.state.importMode === 'new'
      ? this.state.charset
      : (this.props.currentFramebuf?.charset ?? 'upper');

    // Write file data to a temp file and use loadSeqAdvanced
    const tempDir = app.getPath('temp');
    const tempFile = path.join(tempDir, 'petmate9-seq-adv-import.seq');
    fs.writeFileSync(tempFile, this.state.fileData);

    const options: SeqAdvOptions = {
      width,
      crCodes,
      honorCls: this.state.honorCls,
      stripBlanks: this.state.stripBlanks,
      charset,
      backgroundColor,
      borderColor,
    };

    const framebuf = loadSeqAdvanced(tempFile, options);

    if (framebuf) {
      if (this.state.importMode === 'overwrite' && this.props.currentFramebufIndex !== null) {
        this.props.importFileOverwrite(framebuf, this.props.currentFramebufIndex);
      } else {
        this.props.importFramebufsAppend([framebuf]);
      }
    }

    this.resetState();
  }

  handleCancel = () => {
    this.props.Toolbar.setShowImportSeqAdv({ show: false });
    this.resetState();
  }

  getEffectiveWidth = (): number => {
    if (this.state.screenPreset === 'custom') {
      return Math.max(1, Math.min(1000, this.state.customWidth));
    }
    const preset = screenPresets.find(p => p.id === this.state.screenPreset);
    return preset ? preset.width : 40;
  }

  handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const presetId = e.target.value;
    const preset = screenPresets.find(p => p.id === presetId);
    this.setState({
      screenPreset: presetId,
      customWidth: preset ? preset.width : this.state.customWidth,
    });
  }

  handleCustomWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) {
      this.setState({ customWidth: val, screenPreset: 'custom' });
    }
  }

  handleImportModeChange = (mode: 'overwrite' | 'new') => {
    this.setState({ importMode: mode });
  }

  handleSetCharset = (c: string) => {
    this.setState({ charset: c });
  }

  handleCheckbox = (field: keyof ImportSeqAdvModalState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ [field]: e.target.checked } as any);
  }

  handleCustomLineEndingsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ customLineEndings: e.target.value });
  }

  render() {
    const { showImportSeqAdv } = this.props;
    const isCustomPreset = this.state.screenPreset === 'custom';

    return (
      <div>
        <Modal showModal={showImportSeqAdv.show}>
          <div className={styles.container}>
            <div className={styles.title}>Advanced SEQ Import</div>

            {/* File row */}
            <div className={styles.fileRow}>
              <button className='secondary' onClick={this.handleSelectFileWithDialog}>Select File...</button>
              <span className={styles.filename}>
                {this.state.filename ?? 'No file selected'}
              </span>
            </div>

            {/* Two-column body */}
            <div className={styles.columns}>

              {/* Left column: Import Mode + Options */}
              <div className={styles.col}>
                <div className={styles.colLabel}>Import Mode</div>
                <label className={styles.radio}>
                  <input type='radio' name='importMode'
                    checked={this.state.importMode === 'overwrite'}
                    onChange={() => this.handleImportModeChange('overwrite')}
                  />
                  <span className={styles.radioMark} />
                  Overwrite current image
                </label>
                <label className={styles.radio}>
                  <input type='radio' name='importMode'
                    checked={this.state.importMode === 'new'}
                    onChange={() => this.handleImportModeChange('new')}
                  />
                  <span className={styles.radioMark} />
                  Create new image
                </label>

                {this.state.importMode === 'new' && (
                  <div className={styles.indent}>
                    <label className={styles.check}>
                      <input type='checkbox'
                        checked={this.state.useCurrentColors}
                        onChange={this.handleCheckbox('useCurrentColors')}
                      />
                      <span className={styles.checkMark} />
                      Use current BG/Border colours
                    </label>
                    <div className={styles.inlineField}>
                      <span className={styles.fieldLabel}>Charset</span>
                      <FontSelector
                        currentCharset={this.state.charset}
                        customFonts={[]}
                        setCharset={this.handleSetCharset}
                      />
                    </div>
                  </div>
                )}

                <div className={styles.colLabel}>Options</div>
                <label className={styles.check}>
                  <input type='checkbox'
                    checked={this.state.honorCls}
                    onChange={this.handleCheckbox('honorCls')}
                  />
                  <span className={styles.checkMark} />
                  Honor CLS (0x93) clear screen
                </label>
                <label className={styles.check}>
                  <input type='checkbox'
                    checked={this.state.stripBlanks}
                    onChange={this.handleCheckbox('stripBlanks')}
                  />
                  <span className={styles.checkMark} />
                  Strip trailing blanks
                </label>
              </div>

              {/* Right column: Width + Line Endings */}
              <div className={styles.col}>
                <div className={styles.colLabel}>Image Width</div>
                <div className={styles.inlineField}>
                  <select
                    value={this.state.screenPreset}
                    onChange={this.handlePresetChange}
                    className={styles.select}
                  >
                    {screenPresets.map(p => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.inlineField}>
                  <span className={styles.fieldLabel}>Width</span>
                  <input type='number'
                    className={styles.numInput}
                    value={this.state.customWidth}
                    onChange={this.handleCustomWidthChange}
                    min={1} max={1000}
                    disabled={!isCustomPreset}
                  />
                  <span className={styles.unit}>chars</span>
                </div>

                <div className={styles.colLabel}>Line Endings</div>
                <label className={styles.check}>
                  <input type='checkbox'
                    checked={this.state.cr0d}
                    onChange={this.handleCheckbox('cr0d')}
                  />
                  <span className={styles.checkMark} />
                  CR (0x0D)
                </label>
                <label className={styles.check}>
                  <input type='checkbox'
                    checked={this.state.cr8d}
                    onChange={this.handleCheckbox('cr8d')}
                  />
                  <span className={styles.checkMark} />
                  Shifted CR (0x8D)
                </label>
                <div className={styles.inlineField}>
                  <span className={styles.fieldLabel}>Custom</span>
                  <input type='text'
                    className={styles.textInput}
                    value={this.state.customLineEndings}
                    onChange={this.handleCustomLineEndingsChange}
                    placeholder='e.g. 0A,1A'
                  />
                </div>
              </div>
            </div>

            {/* Footer buttons */}
            <div className={styles.footer}>
              <button className='cancel' onClick={this.handleCancel}>Cancel</button>
              <button className='primary' onClick={this.handleOK} disabled={!this.state.fileData}>
                Import
              </button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }
}

export default connect(
  (state: RootState) => {
    const framebufIndex = screensSelectors.getCurrentScreenFramebufIndex(state);
    return {
      showImportSeqAdv: state.toolbar.showImportSeqAdv,
      currentFramebuf: selectors.getCurrentFramebuf(state),
      currentFramebufIndex: framebufIndex,
    };
  },
  (dispatch) => {
    return {
      Toolbar: bindActionCreators(toolbar.Toolbar.actions, dispatch),
      importFramebufsAppend: bindActionCreators(ReduxRoot.actions.importFramebufsAppend, dispatch),
      importFileOverwrite: bindActionCreators(Framebuffer.actions.importFile, dispatch),
    };
  }
)(ImportSeqAdvModal_)
