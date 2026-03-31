import React, {
  Component,
  Fragment,
  FC,
  MouseEvent,
  useState
} from 'react';
import { connect } from 'react-redux'

import Modal from '../components/Modal'
import { RootState, Rgb, PaletteName, EditBranch, vic20PaletteName, petPaletteName, ThemeMode, EmulatorPaths } from '../redux/types'
import { Toolbar } from '../redux/toolbar'
import * as settings from '../redux/settings'

import * as selectors from '../redux/settingsSelectors'
// TODO ts need utils/index to be .ts
import * as utils from '../utils/palette'

import {
  ColorPalette,
} from '../components/ColorPicker'
import { bindActionCreators } from 'redux';
import { electron } from '../utils/electronImports';

import common from './ModalCommon.module.css'


interface PaletteOptionProps {
  onClick: (e: MouseEvent<HTMLElement>) => void;
  selected: boolean;
  label: string;
  colorPalette: Rgb[];
  totalBlocks: number;
  chipSize?: number;
}

const PaletteOption: FC<PaletteOptionProps> = (props: PaletteOptionProps) => {
  return (
    <div
      onClick={props.onClick}
      style={{
        cursor: 'pointer',
        backgroundColor: 'var(--secondary-bg-color)',

        marginTop: '4px',
        marginRight: '4px',
        padding: '4px',
        display: 'inline-flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderStyle: 'solid',
        borderColor: props.selected ? 'var(--border-color)' : 'rgba(0,0,0,0)',
        borderWidth: '1px',
        fontSize:'small',
      }}>
      <div style={{width: '80px'}}>{props.label}</div>
      <ColorPalette totalBlocks={props.totalBlocks} colorPalette={props.colorPalette} chipSize={props.chipSize} />
    </div>
  )
}

interface PetColorPaletteSelectorProps {
  petcolorPalette: Rgb[];
  selectedPetColorPaletteName: petPaletteName;
  setPetSelectedColorPaletteName: (args: { branch: EditBranch, name: petPaletteName}) => void;
};

interface Vic20ColorPaletteSelectorProps {
  vic20colorPalette: Rgb[];
  selectedVic20ColorPaletteName: vic20PaletteName;
  setVic20SelectedColorPaletteName: (args: { branch: EditBranch, name: vic20PaletteName}) => void;
};

interface ColorPaletteSelectorProps {
  colorPalette: Rgb[];
  selectedColorPaletteName: PaletteName;
  setSelectedColorPaletteName: (args: { branch: EditBranch, name: PaletteName}) => void;

};

class ColorPaletteSelector extends Component<ColorPaletteSelectorProps> {
  handleClick = (_e: MouseEvent<Element>, name: PaletteName) => {
    this.props.setSelectedColorPaletteName({
      branch: 'editing',
      name
    })
  }

  render () {
    const opts: PaletteName[] = [
      'petmate',
      'colodore',
      'pepto',
      'vice',
    ]

    const { selectedColorPaletteName } = this.props

    return (
      <Fragment>
        <div className={common.colLabel}>C64 Color Palette</div>
        {opts.map(desc => {
          return (
            <PaletteOption
              key={desc}
              label={desc}
              selected={selectedColorPaletteName === desc}
              colorPalette={utils.colorPalettes[desc]}
              onClick={(e: MouseEvent<Element>) => this.handleClick(e, desc)}
              totalBlocks={16}
              chipSize={12}
            />
          )
        })}

</Fragment>

    )
  }
}


class PetColorPaletteSelector extends Component<PetColorPaletteSelectorProps> {
  handleClick = (_e: MouseEvent<Element>, name: petPaletteName) => {
    this.props.setPetSelectedColorPaletteName({
      branch: 'editing',
      name
    })
  }

  render () {


    const petopts: petPaletteName[] = [
      'petwhite',
      'petgreen',
      'petamber'


    ]


    const { selectedPetColorPaletteName } = this.props

    return (
      <Fragment>
        <div className={common.colLabel}>Pet Default Color</div>
        {petopts.map(desc => {
  return (
    <PaletteOption
      key={desc}
      label={desc}
      selected={selectedPetColorPaletteName === desc}
      colorPalette={utils.petColorPalettes[desc]}
      onClick={(e: MouseEvent<Element>) => this.handleClick(e, desc)}
      totalBlocks={2}
      chipSize={12}
   />
  )
})}
</Fragment>

    )
  }
}



class Vic20ColorPaletteSelector extends Component<Vic20ColorPaletteSelectorProps> {
  handleClick = (_e: MouseEvent<Element>, name: vic20PaletteName) => {
    this.props.setVic20SelectedColorPaletteName({
      branch: 'editing',
      name
    })
  }

  render () {


    const vic20opts: vic20PaletteName[] = [
      'vic20ntsc',
      'vic20pal',
    ]


    const { selectedVic20ColorPaletteName } = this.props

    return (
      <Fragment>
        <div className={common.colLabel}>Vic20 Color Palette</div>
        {vic20opts.map(desc => {
  return (
    <PaletteOption
      key={desc}
      label={desc}
      selected={selectedVic20ColorPaletteName === desc}
      colorPalette={utils.vic20ColorPalettes[desc]}
      onClick={(e: MouseEvent<Element>) => this.handleClick(e, desc)}
      totalBlocks={16}
      chipSize={12}
    />
  )
})}
</Fragment>

    )
  }
}

type SettingsTab = 'program' | 'colors' | 'emulation';

const EMULATOR_LABELS: { key: keyof EmulatorPaths; label: string }[] = [
  { key: 'c64',     label: 'C64 Emulator (x64sc)' },
  { key: 'c128',    label: 'C128 Emulator (x128)' },
  { key: 'pet4032', label: 'PET 4032 Emulator (xpet)' },
  { key: 'pet8032', label: 'PET 8032 Emulator (xpet -model 8032)' },
  { key: 'vic20',   label: 'VIC-20 Emulator (xvic)' },
];

interface SettingsStateProps {
  showSettings: boolean;
  palette0: number[];
  palette1: number[];
  palette2: number[];
  colorPalette: Rgb[];
  vic20colorPalette: Rgb[];
  petcolorPalette: Rgb[];
  selectedColorPaletteName: PaletteName;
  selectedVic20ColorPaletteName: vic20PaletteName;
  selectedPetColorPaletteName: petPaletteName;
  integerScale: boolean;
  ultimateAddress: string;
  showColorNumbers: boolean;
  themeMode: ThemeMode;
  emulatorPaths: EmulatorPaths;
  scrollZoomSensitivity: number;
  pinchZoomSensitivity: number;
};

interface SettingsDispatchProps {
  Settings: settings.PropsFromDispatch;
  Toolbar: any;  // TODO ts
}

function SettingsInner(props: SettingsStateProps & SettingsDispatchProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('program');

  const handleOK = () => {
    props.Toolbar.setShowSettings(false);
    props.Settings.saveEdits();
  };

  const handleCancel = () => {
    props.Toolbar.setShowSettings(false);
    props.Settings.cancelEdits();
  };

  const handleThemeMode = (e: any) => {
    props.Settings.setThemeMode({ branch: 'editing', mode: e.target.value as ThemeMode });
  };

  const handleShowColorNumbers = (e: any) => {
    props.Settings.setShowColorNumbers({ branch: 'editing', show: e.target.checked });
  };

  const handleScrollZoomSensitivity = (e: any) => {
    props.Settings.setScrollZoomSensitivity({ branch: 'editing', value: Number(e.target.value) });
  };

  const handlePinchZoomSensitivity = (e: any) => {
    props.Settings.setPinchZoomSensitivity({ branch: 'editing', value: Number(e.target.value) });
  };

  const handleUltimateAddress = (e: any) => {
    props.Settings.setUltimateAddress({ branch: 'editing', address: e.target.value });
  };

  const handleEmulatorPath = (platform: keyof EmulatorPaths, value: string) => {
    props.Settings.setEmulatorPath({ branch: 'editing', platform, path: value });
  };

  const browseForEmulator = async (platform: keyof EmulatorPaths) => {
    const result = await electron.remote.dialog.showOpenDialog({
      title: `Select ${platform} emulator binary`,
      properties: ['openFile'],
    });
    if (!result.canceled && result.filePaths.length > 0) {
      handleEmulatorPath(platform, result.filePaths[0]);
    }
  };

  const tabClass = (tab: SettingsTab) =>
    `${common.tab} ${activeTab === tab ? common.tabActive : ''}`;

  const { colorPalette, vic20colorPalette, petcolorPalette,
          selectedColorPaletteName, selectedVic20ColorPaletteName,
          selectedPetColorPaletteName } = props;

  return (
    <div>
      <Modal showModal={props.showSettings}>
        <div className={common.container} style={{ overflowY: 'auto' }}>
          <div className={common.title}>Preferences</div>

          <div className={common.tabBar}>
            <div className={tabClass('program')} onClick={() => setActiveTab('program')}>Program</div>
            <div className={tabClass('colors')} onClick={() => setActiveTab('colors')}>Colors</div>
            <div className={tabClass('emulation')} onClick={() => setActiveTab('emulation')}>Emulation</div>
          </div>

          <div className={common.tabContent}>
            {/* ── Program tab ── */}
            {activeTab === 'program' && (
              <Fragment>
                <div className={common.colLabel}>Appearance</div>
                <div className={common.inlineField}>
                  <span className={common.fieldLabel}>Theme</span>
                  <select
                    className={common.select}
                    value={props.themeMode}
                    onChange={handleThemeMode}
                  >
                    <option value="system">System Default</option>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                </div>

                <div className={common.colLabel}>Display</div>
                <label className={common.check}>
                  Show color numbers on picker chips
                  <input
                    type="checkbox"
                    checked={props.showColorNumbers}
                    onChange={handleShowColorNumbers}
                  />
                  <span className={common.checkMark}></span>
                </label>
                <div className={common.colLabel}>Zoom</div>
                <div className={common.inlineField}>
                  <span className={common.fieldLabel} style={{ minWidth: '120px' }}>Scroll Sensitivity</span>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={props.scrollZoomSensitivity}
                    onChange={handleScrollZoomSensitivity}
                    style={{ flex: 1 }}
                  />
                  <span className={common.unit}>{props.scrollZoomSensitivity}</span>
                </div>
                <div className={common.inlineField}>
                  <span className={common.fieldLabel} style={{ minWidth: '120px' }}>Pinch Sensitivity</span>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={props.pinchZoomSensitivity}
                    onChange={handlePinchZoomSensitivity}
                    style={{ flex: 1 }}
                  />
                  <span className={common.unit}>{props.pinchZoomSensitivity}</span>
                </div>

                <div style={{ marginTop: '14px' }}>
                  <button className='secondary' onClick={() => {
                    props.Settings.setThemeMode({ branch: 'editing', mode: settings.defaultSettings.themeMode });
                    props.Settings.setShowColorNumbers({ branch: 'editing', show: settings.defaultSettings.showColorNumbers });
                    props.Settings.setScrollZoomSensitivity({ branch: 'editing', value: settings.defaultSettings.scrollZoomSensitivity });
                    props.Settings.setPinchZoomSensitivity({ branch: 'editing', value: settings.defaultSettings.pinchZoomSensitivity });
                  }}>Reset to Defaults</button>
                </div>
              </Fragment>
            )}

            {/* ── Colors tab ── */}
            {activeTab === 'colors' && (
              <Fragment>
                <ColorPaletteSelector
                  colorPalette={colorPalette}
                  selectedColorPaletteName={selectedColorPaletteName}
                  setSelectedColorPaletteName={props.Settings.setSelectedColorPaletteName}
                />
                <Vic20ColorPaletteSelector
                  vic20colorPalette={vic20colorPalette}
                  selectedVic20ColorPaletteName={selectedVic20ColorPaletteName}
                  setVic20SelectedColorPaletteName={props.Settings.setVic20SelectedColorPaletteName}
                />
                <PetColorPaletteSelector
                  petcolorPalette={petcolorPalette}
                  selectedPetColorPaletteName={selectedPetColorPaletteName}
                  setPetSelectedColorPaletteName={props.Settings.setPetSelectedColorPaletteName}
                />
                <div style={{ marginTop: '14px' }}>
                  <button className='secondary' onClick={() => {
                    props.Settings.setSelectedColorPaletteName({ branch: 'editing', name: settings.defaultSettings.selectedColorPalette });
                    props.Settings.setVic20SelectedColorPaletteName({ branch: 'editing', name: settings.defaultSettings.selectedVic20ColorPalette });
                    props.Settings.setPetSelectedColorPaletteName({ branch: 'editing', name: settings.defaultSettings.selectedPetColorPalette });
                  }}>Reset to Defaults</button>
                </div>
              </Fragment>
            )}

            {/* ── Emulation tab ── */}
            {activeTab === 'emulation' && (
              <Fragment>
                <div className={common.colLabel}>Ultimate 64 Address/DNS</div>
                <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>http://x.x.x.x or http://dnsname</div>
                <input
                  className={common.textInput}
                  onChange={handleUltimateAddress}
                  value={props.ultimateAddress}
                />

                <div className={common.colLabel}>Emulator Binaries</div>
                {EMULATOR_LABELS.map(({ key, label }) => (
                  <Fragment key={key}>
                    <div style={{ fontSize: '11px', color: 'var(--main-text-color)', marginTop: '6px', marginBottom: '2px' }}>{label}</div>
                    <div className={common.browseRow}>
                      <input
                        className={common.textInput}
                        value={props.emulatorPaths[key]}
                        placeholder="Path to emulator binary..."
                        onChange={(e) => handleEmulatorPath(key, e.target.value)}
                      />
                      <button className={common.browseBtn} onClick={() => browseForEmulator(key)}>Browse…</button>
                    </div>
                  </Fragment>
                ))}
                <div style={{ marginTop: '14px' }}>
                  <button className='secondary' onClick={() => {
                    props.Settings.setUltimateAddress({ branch: 'editing', address: settings.defaultSettings.ultimateAddress });
                    for (const { key } of EMULATOR_LABELS) {
                      props.Settings.setEmulatorPath({ branch: 'editing', platform: key, path: '' });
                    }
                  }}>Reset to Defaults</button>
                </div>
              </Fragment>
            )}
          </div>

          <div className={common.footer}>
            <button className='cancel' onClick={handleCancel}>Cancel</button>
            <button className='primary' onClick={handleOK}>OK</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default connect(
  (state: RootState) => {
    const { getSettingsEditing, getSettingsEditingCurrentColorPalette } = selectors;
    return {
      showSettings: state.toolbar.showSettings,
      palette0: getSettingsEditing(state).palettes[1],
      palette1: getSettingsEditing(state).palettes[2],
      palette2: getSettingsEditing(state).palettes[3],
      colorPalette: getSettingsEditingCurrentColorPalette(state),
      vic20colorPalette: getSettingsEditingCurrentColorPalette(state),
      selectedVic20ColorPaletteName: getSettingsEditing(state).selectedVic20ColorPalette,
      petcolorPalette: getSettingsEditingCurrentColorPalette(state),
      selectedPetColorPaletteName: getSettingsEditing(state).selectedPetColorPalette,
      selectedColorPaletteName: getSettingsEditing(state).selectedColorPalette,
      integerScale: getSettingsEditing(state).integerScale,
      ultimateAddress: getSettingsEditing(state).ultimateAddress,
      showColorNumbers: getSettingsEditing(state).showColorNumbers,
      themeMode: getSettingsEditing(state).themeMode,
      emulatorPaths: getSettingsEditing(state).emulatorPaths,
      scrollZoomSensitivity: getSettingsEditing(state).scrollZoomSensitivity,
      pinchZoomSensitivity: getSettingsEditing(state).pinchZoomSensitivity,
    }
  },
  (dispatch) => {
    return {
      Toolbar: Toolbar.bindDispatch(dispatch),
      Settings: bindActionCreators(settings.actions, dispatch)
    }
  }
)(SettingsInner)
