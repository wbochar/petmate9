import React, {
  Component,
  Fragment,
  FC,
  MouseEvent,
  useEffect,
  useRef,
  useState
} from 'react';
import { connect } from 'react-redux'

import Modal from '../components/Modal'
import { RootState, Rgb, PaletteName, EditBranch, vic20PaletteName, petPaletteName, ThemeMode, ShiftDrawingMode, EmulatorPaths, ConvertSettings, ConversionToolName, Img2PetsciiMatcherMode, Petmate9DitherMode } from '../redux/types'
import { Toolbar, defaultLinePresets, defaultBoxPresets, defaultTexturePresets, defaultCustomFadeSources, defaultFadeSourceToggles } from '../redux/toolbar'
import * as settings from '../redux/settings'

import * as selectors from '../redux/settingsSelectors'
// TODO ts need utils/index to be .ts
import * as utils from '../utils/palette'
import { vdcPalette } from '../utils/palette'

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

type SettingsTab = 'program' | 'ui' | 'colors' | 'emulation' | 'convert';

const EMULATOR_LABELS: { key: keyof EmulatorPaths; label: string }[] = [
  { key: 'c64',     label: 'C64 Emulator (x64sc)' },
  { key: 'c128',    label: 'C128 Emulator (x128)' },
  { key: 'c16',     label: 'C16/Plus4 Emulator (xplus4)' },
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
  charPanelBgMode: 'document' | 'global';
  themeMode: ThemeMode;
  shiftDrawingMode: ShiftDrawingMode;
  emulatorPaths: EmulatorPaths;
  ultimatePresets: string[];
  scrollZoomSensitivity: number;
  pinchZoomSensitivity: number;
  defaultZoomLevel: number;
  defaultBorderOn: boolean;
  convertSettings: ConvertSettings;
};

interface SettingsDispatchProps {
  Settings: settings.PropsFromDispatch;
  Toolbar: any;  // TODO ts
}

function SettingsInner(props: SettingsStateProps & SettingsDispatchProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('program');
  const ultimatePresetsDatalistId = 'ultimate-address-presets';
  const ultimateAddressInputRef = useRef<HTMLInputElement>(null);
  // Tracks the preset the user picked from the dropdown (or last loaded
  // from disk).  When the user types a different value, the "Update"
  // button uses this to know which entry to overwrite.
  const [selectedPresetOriginal, setSelectedPresetOriginal] = useState<string | null>(null);

  // Whenever the active address itself matches a known preset, that's our
  // editing target.  This also covers the case where SettingsInner mounts
  // before `loadSettings` finishes (initial render uses default settings,
  // so a one-shot useState initializer would capture stale data).
  useEffect(() => {
    if (
      props.ultimatePresets.includes(props.ultimateAddress) &&
      selectedPresetOriginal !== props.ultimateAddress
    ) {
      setSelectedPresetOriginal(props.ultimateAddress);
    }
    // We deliberately do NOT clear selectedPresetOriginal when the active
    // address stops matching — the user is in the middle of editing and the
    // remembered original is still the legitimate Update target.
  }, [props.ultimateAddress, props.ultimatePresets, selectedPresetOriginal]);

  const normalizeActiveUltimateAddress = () => {
    const currentAddress = props.ultimateAddress;
    const normalizedAddress = settings.normalizeUltimateUrl(currentAddress);
    if (normalizedAddress !== currentAddress) {
      props.Settings.setUltimateAddress({ branch: 'editing', address: normalizedAddress });
    }
    return normalizedAddress;
  };

  const handleTestUltimateAddress = () => {
    const addr = normalizeActiveUltimateAddress();
    if (!addr) { alert('Enter an Ultimate address first.'); return; }
    const TEST_TIMEOUT_MS = 2500;
    const http = window.require('http');
    let url: URL;
    try {
      url = new URL(addr);
    } catch {
      alert(`Invalid URL: ${addr}`);
      return;
    }
    if (url.protocol !== 'http:') {
      alert('Ultimate REST API only supports http://.');
      return;
    }
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: '/v1/version',
        method: 'GET',
      },
      (res: any) => {
        res.setEncoding('utf8');
        let body = '';
        res.on('data', (chunk: string) => { body += chunk; });
        res.on('end', () => {
          try {
            const info = JSON.parse(body);
            alert(`Connected!\nUltimate REST API v${info.version}`);
          } catch {
            alert(`Connected! (HTTP ${res.statusCode})`);
          }
        });
      }
    );
    req.setTimeout(TEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`request timed out after ${TEST_TIMEOUT_MS}ms`));
    });
    req.on('error', (err: any) => alert(`Connection failed: ${err.message}`));
    req.end();
  };

  const handleOK = () => {
    normalizeActiveUltimateAddress();
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

  const handleCharPanelBgMode = (e: any) => {
    props.Settings.setCharPanelBgMode({ branch: 'editing', mode: e.target.value as 'document' | 'global' });
  };

  const handleShiftDrawingMode = (e: any) => {
    props.Settings.setShiftDrawingMode({ branch: 'editing', mode: e.target.value as ShiftDrawingMode });
  };

  const handleScrollZoomSensitivity = (e: any) => {
    props.Settings.setScrollZoomSensitivity({ branch: 'editing', value: Number(e.target.value) });
  };

  const handlePinchZoomSensitivity = (e: any) => {
    props.Settings.setPinchZoomSensitivity({ branch: 'editing', value: Number(e.target.value) });
  };
  const handleDefaultZoomLevel = (e: any) => {
    props.Settings.setDefaultZoomLevel({ branch: 'editing', value: Number(e.target.value) });
  };
  const handleDefaultBorderOn = (e: any) => {
    props.Settings.setDefaultBorderOn({ branch: 'editing', value: e.target.checked });
  };

  const handleUltimateAddress = (e: any) => {
    const nextAddress: string = e.target.value;
    const prevAddress = props.ultimateAddress;
    props.Settings.setUltimateAddress({ branch: 'editing', address: nextAddress });
    const prevWasPreset = props.ultimatePresets.includes(prevAddress);
    const nextIsPreset = props.ultimatePresets.includes(nextAddress);
    if (nextIsPreset) {
      // User picked / completed a preset exactly: that's the editing target.
      setSelectedPresetOriginal(nextAddress);
    } else if (prevWasPreset) {
      // User just started diverging from a saved preset: remember which one
      // so they can later commit the edit via the Update button.
      setSelectedPresetOriginal(prevAddress);
    }
    // Note: we deliberately do NOT mutate presets while typing.  Earlier
    // versions edited the matching preset in-place on every keystroke,
    // which silently overwrote saved presets the moment the user changed
    // any character.  Use the explicit +/Update/🗑 buttons instead.
  };

  const handleAddUltimatePreset = () => {
    const address = normalizeActiveUltimateAddress();
    if (!address) {
      alert('Enter an Ultimate address first.');
      return;
    }
    if (props.ultimatePresets.includes(address)) {
      // Already saved — just sync the active selection so Update has a target.
      setSelectedPresetOriginal(address);
      return;
    }
    props.Settings.setUltimatePresets({
      branch: 'editing',
      presets: settings.normalizeUltimatePresets([...props.ultimatePresets, address]),
    });
    setSelectedPresetOriginal(address);
  };

  // Replace whichever preset the user last selected with the current
  // (normalized) field value.  No-op if there's nothing to replace.
  const handleUpdateUltimatePreset = () => {
    const address = normalizeActiveUltimateAddress();
    if (!address) {
      alert('Enter an Ultimate address first.');
      return;
    }
    const target = selectedPresetOriginal;
    if (!target) {
      alert('Pick a preset from the dropdown to update, or use “+” to add a new one.');
      return;
    }
    const idx = props.ultimatePresets.indexOf(target);
    if (idx < 0) {
      alert('The previously selected preset is no longer in the list.');
      return;
    }
    if (target === address) {
      // Nothing actually changed.
      return;
    }
    const nextPresets = [...props.ultimatePresets];
    nextPresets[idx] = address;
    props.Settings.setUltimatePresets({
      branch: 'editing',
      presets: settings.normalizeUltimatePresets(nextPresets),
    });
    setSelectedPresetOriginal(address);
  };

  const handleRemoveUltimatePreset = () => {
    const address = props.ultimateAddress.trim();
    if (!address) {
      alert('Select an Ultimate preset to remove first.');
      return;
    }
    const nextPresets = props.ultimatePresets.filter((preset) => preset !== address);
    if (nextPresets.length === props.ultimatePresets.length) {
      alert('Current address is not in the preset list.');
      return;
    }
    props.Settings.setUltimatePresets({
      branch: 'editing',
      presets: nextPresets,
    });
    const newActive = nextPresets[0] || '';
    props.Settings.setUltimateAddress({
      branch: 'editing',
      address: newActive,
    });
    setSelectedPresetOriginal(newActive && nextPresets.includes(newActive) ? newActive : null);
    setTimeout(() => {
      ultimateAddressInputRef.current?.focus();
    }, 0);
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
            <div className={tabClass('ui')} onClick={() => setActiveTab('ui')}>UI</div>
            <div className={tabClass('colors')} onClick={() => setActiveTab('colors')}>Colors</div>
            <div className={tabClass('emulation')} onClick={() => setActiveTab('emulation')}>Emulation</div>
            <div className={tabClass('convert')} onClick={() => setActiveTab('convert')}>Convert</div>
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
                    props.Settings.setScrollZoomSensitivity({ branch: 'editing', value: settings.defaultSettings.scrollZoomSensitivity });
                    props.Settings.setPinchZoomSensitivity({ branch: 'editing', value: settings.defaultSettings.pinchZoomSensitivity });
                  }}>Reset to Defaults</button>
                </div>
              </Fragment>
            )}

            {/* ── UI tab ── */}
            {activeTab === 'ui' && (
              <Fragment>
                <div className={common.colLabel}>Colors Panel</div>
                <label className={common.check}>
                  Show color numbers on picker chips
                  <input
                    type="checkbox"
                    checked={props.showColorNumbers}
                    onChange={handleShowColorNumbers}
                  />
                  <span className={common.checkMark}></span>
                </label>

                <div className={common.colLabel}>Characters Panel</div>
                <div className={common.inlineField}>
                  <span className={common.fieldLabel} style={{ minWidth: '100px' }}>Background</span>
                  <select
                    className={common.select}
                    value={props.charPanelBgMode}
                    onChange={handleCharPanelBgMode}
                  >
                    <option value="document">Document Background</option>
                    <option value="global">Panel Background</option>
                  </select>
                </div>

                <div className={common.colLabel} style={{ marginTop: '10px' }}>Drawing</div>
                <div style={{ fontSize: '11px', color: 'var(--subtle-text-color)', marginBottom: '6px', lineHeight: '1.4' }}>
                  Controls how the SHIFT modifier affects the pen, colorize,
                  character-only, reverse, and fade/lighten tools.  SHIFT+right-click
                  uses the line-draw mode to erase (and SHIFT+CTRL+right-click to clear to transparent).
                </div>
                <label className={common.radio}>
                  <strong>Axis Lock</strong> — shift constrains a drag to a single axis
                  <input
                    type="radio"
                    name="shiftDrawingMode"
                    value="axisLock"
                    checked={props.shiftDrawingMode === 'axisLock'}
                    onChange={handleShiftDrawingMode}
                  />
                  <span className={common.radioMark}></span>
                </label>
                <label className={common.radio}>
                  <strong>Link Line Draw</strong> — shift+click anchors, subsequent shift+clicks draw connected lines until SHIFT is released
                  <input
                    type="radio"
                    name="shiftDrawingMode"
                    value="linkLine"
                    checked={props.shiftDrawingMode === 'linkLine'}
                    onChange={handleShiftDrawingMode}
                  />
                  <span className={common.radioMark}></span>
                </label>

                <div className={common.colLabel} style={{ marginTop: '10px' }}>New Screen Defaults</div>
                <div className={common.inlineField}>
                  <span className={common.fieldLabel} style={{ minWidth: '120px' }}>Zoom</span>
                  <input
                    type="range"
                    min={1}
                    max={8}
                    step={1}
                    value={props.defaultZoomLevel}
                    onChange={handleDefaultZoomLevel}
                    style={{ flex: 1 }}
                  />
                  <span className={common.unit}>x{props.defaultZoomLevel}</span>
                </div>
                <label className={common.check}>
                  Border on by default for new screens
                  <input
                    type="checkbox"
                    checked={props.defaultBorderOn}
                    onChange={handleDefaultBorderOn}
                  />
                  <span className={common.checkMark}></span>
                </label>

                <div className={common.colLabel} style={{ marginTop: '10px' }}>Tool Presets</div>
                <div style={{ fontSize: '11px', color: 'var(--subtle-text-color)', marginBottom: '8px', lineHeight: '1.4' }}>
                  Tool presets are automatically saved whenever you add, edit, remove, or reorder them.
                  Use the buttons below to restore the built-in defaults for each tool.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  <button className='secondary' onClick={() => {
                    if (confirm('Reset Separator presets to defaults?')) {
                      props.Toolbar.setLinePresets(defaultLinePresets);
                      props.Toolbar.setSelectedLinePresetIndex(0);
                    }
                  }}>Separators</button>
                  <button className='secondary' onClick={() => {
                    if (confirm('Reset Box presets to defaults?')) {
                      props.Toolbar.setBoxPresets(defaultBoxPresets);
                      props.Toolbar.setSelectedBoxPresetIndex(0);
                    }
                  }}>Boxes</button>
                  <button className='secondary' onClick={() => {
                    if (confirm('Reset Texture presets to defaults?')) {
                      props.Toolbar.setTexturePresets(defaultTexturePresets);
                      props.Toolbar.setSelectedTexturePresetIndex(0);
                    }
                  }}>Textures</button>
                  <button className='secondary' onClick={() => {
                    if (confirm('Reset Fade/Lighten presets to defaults?')) {
                      props.Settings.setCustomFadeSources(defaultCustomFadeSources);
                      props.Settings.setFadeSourceToggles(defaultFadeSourceToggles);
                      props.Settings.saveEdits();
                    }
                  }}>Fade/Lighten</button>
                </div>

                <div style={{ marginTop: '14px' }}>
                  <button className='secondary' onClick={() => {
                    if (!confirm('Reset all UI settings and tool presets to defaults?')) return;
                    props.Settings.setShowColorNumbers({ branch: 'editing', show: settings.defaultSettings.showColorNumbers });
                    props.Settings.setCharPanelBgMode({ branch: 'editing', mode: settings.defaultSettings.charPanelBgMode });
                    props.Settings.setShiftDrawingMode({ branch: 'editing', mode: settings.defaultSettings.shiftDrawingMode });
                    props.Settings.setDefaultZoomLevel({ branch: 'editing', value: settings.defaultSettings.defaultZoomLevel });
                    props.Settings.setDefaultBorderOn({ branch: 'editing', value: settings.defaultSettings.defaultBorderOn });
                    props.Toolbar.setLinePresets(defaultLinePresets);
                    props.Toolbar.setSelectedLinePresetIndex(0);
                    props.Toolbar.setBoxPresets(defaultBoxPresets);
                    props.Toolbar.setSelectedBoxPresetIndex(0);
                    props.Toolbar.setTexturePresets(defaultTexturePresets);
                    props.Toolbar.setSelectedTexturePresetIndex(0);
                    props.Settings.setCustomFadeSources(defaultCustomFadeSources);
                    props.Settings.setFadeSourceToggles(defaultFadeSourceToggles);
                    props.Settings.saveEdits();
                  }}>Reset All to Defaults</button>
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
                <div className={common.colLabel}>C128 VDC Colors (RGBI &mdash; fixed)</div>
                <div style={{
                  cursor: 'default',
                  backgroundColor: 'var(--secondary-bg-color)',
                  marginTop: '4px',
                  marginRight: '4px',
                  padding: '4px',
                  display: 'inline-flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderStyle: 'solid',
                  borderColor: 'rgba(0,0,0,0)',
                  borderWidth: '1px',
                  fontSize: 'small',
                }}>
                  <div style={{ width: '80px' }}>VDC RGBI</div>
                  <ColorPalette totalBlocks={16} colorPalette={vdcPalette} chipSize={12} />
                </div>
                <div style={{ fontSize: '10px', color: 'var(--subtle-text-color)', marginTop: '4px' }}>
                  The C128 VDC uses a fixed RGBI palette and cannot be changed.
                </div>
                <div style={{ marginTop: '14px' }}>
                  <button className='secondary' onClick={() => {
                    props.Settings.setSelectedColorPaletteName({ branch: 'editing', name: settings.defaultSettings.selectedColorPalette });
                    props.Settings.setVic20SelectedColorPaletteName({ branch: 'editing', name: settings.defaultSettings.selectedVic20ColorPalette });
                    props.Settings.setPetSelectedColorPaletteName({ branch: 'editing', name: settings.defaultSettings.selectedPetColorPalette });
                  }}>Reset to Defaults</button>
                </div>
              </Fragment>
            )}

            {/* ── Convert tab ── */}
            {activeTab === 'convert' && (
              <Fragment>
                <div className={common.colLabel}>Conversion Tool</div>
                <div className={common.inlineField}>
                  <span className={common.fieldLabel} style={{ minWidth: '100px' }}>Tool</span>
                  <select
                    className={common.select}
                    value={props.convertSettings.selectedTool}
                    onChange={(e) => props.Settings.setConvertSettings({
                      branch: 'editing',
                      settings: { selectedTool: e.target.value as ConversionToolName }
                    })}
                  >
                    <option value="petsciiator">Petsciiator</option>
                    <option value="img2petscii">img2petscii</option>
                    <option value="petmate9">Pet9scii Converter</option>
                  </select>
                </div>

                <div className={common.colLabel}>Background Color</div>
                <label className={common.check}>
                  Use current document background color
                  <input
                    type="checkbox"
                    checked={props.convertSettings.forceBackgroundColor}
                    onChange={(e) => props.Settings.setConvertSettings({
                      branch: 'editing',
                      settings: { forceBackgroundColor: e.target.checked }
                    })}
                  />
                  <span className={common.checkMark}></span>
                </label>
                <div style={{ fontSize: '10px', color: 'var(--subtle-text-color)', marginBottom: '4px' }}>
                  When off, the converter picks the best background color from the image.
                </div>

                {props.convertSettings.selectedTool === 'petsciiator' && (
                  <Fragment>
                    <div className={common.colLabel}>Petsciiator Settings</div>
                    <div style={{ fontSize: '11px', color: 'var(--subtle-text-color)', marginBottom: '6px', lineHeight: '1.4' }}>
                      By EgonOlsen71 (used with permission). Fast feature-vector character matching with optional Floyd-Steinberg dithering.
                    </div>
                    <label className={common.check}>
                      Enable dithering (Floyd-Steinberg)
                      <input
                        type="checkbox"
                        checked={props.convertSettings.petsciiator.dithering}
                        onChange={(e) => props.Settings.setConvertSettings({
                          branch: 'editing',
                          settings: { petsciiator: { ...props.convertSettings.petsciiator, dithering: e.target.checked } }
                        })}
                      />
                      <span className={common.checkMark}></span>
                    </label>
                  </Fragment>
                )}

                {props.convertSettings.selectedTool === 'img2petscii' && (
                  <Fragment>
                    <div className={common.colLabel}>img2petscii Settings</div>
                    <div style={{ fontSize: '11px', color: 'var(--subtle-text-color)', marginBottom: '6px', lineHeight: '1.4' }}>
                      By Michel de Bree (used with permission). Pixel-by-pixel tile matching — slower but more accurate than feature vectors.
                    </div>
                    <div className={common.inlineField}>
                      <span className={common.fieldLabel} style={{ minWidth: '100px' }}>Matcher</span>
                      <select
                        className={common.select}
                        value={props.convertSettings.img2petscii.matcherMode}
                        onChange={(e) => props.Settings.setConvertSettings({
                          branch: 'editing',
                          settings: { img2petscii: { ...props.convertSettings.img2petscii, matcherMode: e.target.value as Img2PetsciiMatcherMode } }
                        })}
                      >
                        <option value="slow">Slow (best quality)</option>
                        <option value="fast">Fast</option>
                      </select>
                    </div>
                    <label className={common.check}>
                      Mono mode
                      <input
                        type="checkbox"
                        checked={props.convertSettings.img2petscii.monoMode}
                        onChange={(e) => props.Settings.setConvertSettings({
                          branch: 'editing',
                          settings: { img2petscii: { ...props.convertSettings.img2petscii, monoMode: e.target.checked } }
                        })}
                      />
                      <span className={common.checkMark}></span>
                    </label>
                    {props.convertSettings.img2petscii.monoMode && (
                      <div className={common.inlineField}>
                        <span className={common.fieldLabel} style={{ minWidth: '100px' }}>Threshold</span>
                        <input
                          type="range"
                          min={0}
                          max={255}
                          step={1}
                          value={props.convertSettings.img2petscii.monoThreshold}
                          onChange={(e) => props.Settings.setConvertSettings({
                            branch: 'editing',
                            settings: { img2petscii: { ...props.convertSettings.img2petscii, monoThreshold: Number(e.target.value) } }
                          })}
                          style={{ flex: 1 }}
                        />
                        <span className={common.unit}>{props.convertSettings.img2petscii.monoThreshold}</span>
                      </div>
                    )}
                  </Fragment>
                )}

                {props.convertSettings.selectedTool === 'petmate9' && (
                  <Fragment>
                    <div className={common.colLabel}>Pet9scii Converter Settings</div>
                    <div style={{ fontSize: '11px', color: 'var(--subtle-text-color)', marginBottom: '6px', lineHeight: '1.4' }}>
                      Perceptual Lab color matching, SSIM structural similarity, and two-pass candidate filtering for the best quality.
                    </div>
                    <div className={common.inlineField}>
                      <span className={common.fieldLabel} style={{ minWidth: '100px' }}>Dithering</span>
                      <select
                        className={common.select}
                        value={props.convertSettings.petmate9.ditherMode}
                        onChange={(e) => props.Settings.setConvertSettings({
                          branch: 'editing',
                          settings: { petmate9: { ...props.convertSettings.petmate9, ditherMode: e.target.value as Petmate9DitherMode } }
                        })}
                      >
                        <option value="floyd-steinberg">Floyd-Steinberg</option>
                        <option value="bayer4x4">Bayer 4×4 (ordered)</option>
                        <option value="bayer2x2">Bayer 2×2 (ordered)</option>
                        <option value="none">None (nearest color)</option>
                      </select>
                    </div>
                    <div className={common.inlineField}>
                      <span className={common.fieldLabel} style={{ minWidth: '100px' }}>SSIM Weight</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={props.convertSettings.petmate9.ssimWeight}
                        onChange={(e) => props.Settings.setConvertSettings({
                          branch: 'editing',
                          settings: { petmate9: { ...props.convertSettings.petmate9, ssimWeight: Number(e.target.value) } }
                        })}
                        style={{ flex: 1 }}
                      />
                      <span className={common.unit}>{props.convertSettings.petmate9.ssimWeight}%</span>
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--subtle-text-color)', marginTop: '2px' }}>
                      0% = pure color accuracy · 100% = pure structural match
                    </div>
                  </Fragment>
                )}

                <div style={{ marginTop: '14px' }}>
                  <button className='secondary' onClick={() => {
                    props.Settings.setConvertSettings({
                      branch: 'editing',
                      settings: settings.defaultSettings.convertSettings
                    });
                  }}>Reset to Defaults</button>
                </div>
              </Fragment>
            )}

            {/* ── Emulation tab ── */}
            {activeTab === 'emulation' && (
              <Fragment>
                <div className={common.colLabel}>Ultimate 64 Address/DNS</div>
                <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>http://x.x.x.x or http://dnsname</div>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <input
                    ref={ultimateAddressInputRef}
                    className={common.textInput}
                    style={{ flex: 1 }}
                    list={props.ultimatePresets.length > 0 ? ultimatePresetsDatalistId : undefined}
                    onKeyDown={(e) => e.stopPropagation()}
                    onKeyUp={(e) => e.stopPropagation()}
                    onChange={handleUltimateAddress}
                    onBlur={normalizeActiveUltimateAddress}
                    value={props.ultimateAddress}
                  />
                  {props.ultimatePresets.length > 0 && (
                    <datalist id={ultimatePresetsDatalistId}>
                      {props.ultimatePresets.map((preset, idx) => (
                        <option key={`${preset}-${idx}`} value={preset} />
                      ))}
                    </datalist>
                  )}
                  <button
                    className='secondary'
                    style={{ width: '26px', padding: '0', fontSize: '14px', lineHeight: '22px' }}
                    title="Add the current address as a new Ultimate preset"
                    onClick={handleAddUltimatePreset}
                  >+</button>
                  <button
                    className='secondary'
                    style={{ width: '26px', padding: '0', fontSize: '12px', lineHeight: '22px' }}
                    title="Update the selected preset with the current address"
                    onClick={handleUpdateUltimatePreset}
                    disabled={selectedPresetOriginal === null || selectedPresetOriginal === props.ultimateAddress}
                  >✎</button>
                  <button
                    className='secondary'
                    style={{ width: '26px', padding: '0', fontSize: '12px', lineHeight: '22px' }}
                    title="Remove Ultimate preset"
                    onClick={handleRemoveUltimatePreset}
                  >🗑</button>
                  <button className='secondary' style={{ whiteSpace: 'nowrap', fontSize: '11px' }} onClick={handleTestUltimateAddress}>Test</button>
                </div>

                <div className={common.colLabel}>Emulator Binaries</div>
                {EMULATOR_LABELS.map(({ key, label }) => (
                  <Fragment key={key}>
                    <div style={{ fontSize: '11px', color: 'var(--main-text-color)', marginTop: '6px', marginBottom: '2px' }}>{label}</div>
                    <div className={common.browseRow}>
                      <input
                        className={common.textInput}
                        value={props.emulatorPaths[key]}
                        placeholder="Path to emulator binary..."
                        onKeyDown={(e) => e.stopPropagation()}
                        onKeyUp={(e) => e.stopPropagation()}
                        onChange={(e) => handleEmulatorPath(key, e.target.value)}
                      />
                      <button className={common.browseBtn} onClick={() => browseForEmulator(key)}>Browse…</button>
                    </div>
                  </Fragment>
                ))}
                <div style={{ marginTop: '14px' }}>
                  <button className='secondary' onClick={() => {
                    props.Settings.setUltimateAddress({ branch: 'editing', address: settings.defaultSettings.ultimateAddress });
                    props.Settings.setUltimatePresets({ branch: 'editing', presets: settings.defaultSettings.ultimatePresets });
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
      charPanelBgMode: getSettingsEditing(state).charPanelBgMode,
      themeMode: getSettingsEditing(state).themeMode,
      shiftDrawingMode: getSettingsEditing(state).shiftDrawingMode,
      emulatorPaths: getSettingsEditing(state).emulatorPaths,
      ultimatePresets: getSettingsEditing(state).ultimatePresets,
      scrollZoomSensitivity: getSettingsEditing(state).scrollZoomSensitivity,
      pinchZoomSensitivity: getSettingsEditing(state).pinchZoomSensitivity,
      defaultZoomLevel: getSettingsEditing(state).defaultZoomLevel,
      defaultBorderOn: getSettingsEditing(state).defaultBorderOn,
      convertSettings: getSettingsEditing(state).convertSettings,
    }
  },
  (dispatch) => {
    return {
      Toolbar: Toolbar.bindDispatch(dispatch),
      Settings: bindActionCreators(settings.actions, dispatch)
    }
  }
)(SettingsInner)
