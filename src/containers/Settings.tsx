import React, {
  Component,
  Fragment,
  StatelessComponent as SFC,
  MouseEvent
} from 'react';
import { connect } from 'react-redux'

import Modal from '../components/Modal'
import { RootState, Rgb, PaletteName, EditBranch, vic20PaletteName,petPaletteName } from '../redux/types'
import { Toolbar } from '../redux/toolbar'
import * as settings from '../redux/settings'

import * as selectors from '../redux/settingsSelectors'
// TODO ts need utils/index to be .ts
import * as utils from '../utils/palette'

import {
  ColorPalette,
  SortableColorPalette
} from '../components/ColorPicker'
import { bindActionCreators } from 'redux';

const ModalTitle: SFC<{}> = ({children}) => <h2>{children}</h2>
//const Title3: SFC<{}> = ({children}) => <h3>{children}</h3>
const Title: SFC<{}> = ({children}) => <h4>{children}</h4>


interface CustomPaletteProps {
  idx: number;
  palette: number[];
  setPalette: (paletteIdx: number, order: number[]) => void;
  colorPalette: Rgb[];
}


const CustomPalette: SFC<CustomPaletteProps> = ({
  idx, palette, setPalette, colorPalette
}) => {
  return (
    <Fragment>
      <Title>Custom Palette {idx}:</Title>
      <SortableColorPalette
        palette={palette}
        setPalette={(p: number[]) => setPalette(idx, p)}
        colorPalette={colorPalette}
      />
    </Fragment>
  )
}

interface PaletteOptionProps {
  onClick: (e: MouseEvent<HTMLElement>) => void;
  selected: boolean;
  label: string;
  colorPalette: Rgb[];
  totalBlocks: number;
}

const PaletteOption: SFC<PaletteOptionProps> = (props: PaletteOptionProps) => {
  return (
    <div
      onClick={props.onClick}
      style={{
        cursor: 'pointer',
        backgroundColor: 'rgb(40,40,40)',

        marginTop: '4px',
        marginRight: '4px',
        padding: '4px',
        display: 'inline-flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderStyle: 'solid',
        borderColor: props.selected ? 'rgba(255,255,255, 0.6)' : 'rgba(0,0,0,0)',
        borderWidth: '1px',
        fontSize:'small',
      }}>
      <div style={{width: '80px'}}>{props.label}</div>
      <ColorPalette totalBlocks={props.totalBlocks} colorPalette={props.colorPalette} />
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
    //console.log("selectedColorPaletteName:"+selectedColorPaletteName);

    return (
      <Fragment>
        <Title>Select C64 color palette:</Title>
        {opts.map(desc => {
          return (
            <PaletteOption
              key={desc}
              label={desc}
              selected={selectedColorPaletteName === desc}
              colorPalette={utils.colorPalettes[desc]}
              onClick={(e: MouseEvent<Element>) => this.handleClick(e, desc)}
              totalBlocks={16}
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
    //console.log("selectedPetColorPaletteName:"+selectedPetColorPaletteName);

    return (
      <Fragment>


<Title>Select Pet Default color:</Title>
{petopts.map(desc => {
  return (
    <PaletteOption
      key={desc}
      label={desc}
      selected={selectedPetColorPaletteName === desc}
      colorPalette={utils.petColorPalettes[desc]}
      onClick={(e: MouseEvent<Element>) => this.handleClick(e, desc)}
      totalBlocks={2}
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
    //console.log("selectedVic20ColorPaletteName:"+selectedVic20ColorPaletteName);

    return (
      <Fragment>


<Title>Select Vic20 color palette:</Title>
{vic20opts.map(desc => {
  return (
    <PaletteOption
      key={desc}
      label={desc}
      selected={selectedVic20ColorPaletteName === desc}
      colorPalette={utils.vic20ColorPalettes[desc]}
      onClick={(e: MouseEvent<Element>) => this.handleClick(e, desc)}
      totalBlocks={16}

    />
  )
})}
</Fragment>

    )
  }
}

interface SettingsStateProps {
  showSettings: boolean;
  palette0: number[];
  palette1: number[];
  palette2: number[];
  colorPalette: Rgb[];
  vic20colorPalette: Rgb[];
  petcolorPalette: Rgb[];
  selectedColorPaletteName: PaletteName;
  selectedVic20ColorPaletteName:vic20PaletteName;
  selectedPetColorPaletteName:petPaletteName;
  integerScale: boolean;
  ultimateAddress: string;
};

interface SettingsDispatchProps  {
  Settings: settings.PropsFromDispatch;
  Toolbar: any;  // TODO ts
}

class Settings_ extends Component<SettingsStateProps & SettingsDispatchProps> {
  handleOK = () => {
    this.props.Toolbar.setShowSettings(false)
    this.props.Settings.saveEdits()
  }

  handleCancel = () => {
    this.props.Toolbar.setShowSettings(false)
    this.props.Settings.cancelEdits()
  }

  handleIntegerScale = (e: any) => {
    this.props.Settings.setIntegerScale({
      branch: 'editing',
      scale: e.target.checked
    });
  }
  handleUltimateAddress = (e: any) => {
    this.props.Settings.setUltimateAddress({
      branch: 'editing',
      address: e.target.value
    });
  }

  render () {
    const { colorPalette,vic20colorPalette,petcolorPalette, selectedColorPaletteName,selectedVic20ColorPaletteName,selectedPetColorPaletteName } = this.props
    const setPalette = (idx: number, v: number[]) => {
      this.props.Settings.setPalette({
        branch: 'editing',
        idx,
        palette: v
      })
    }
    return (
      <div>
        <Modal showModal={this.props.showSettings}>
          <div style={{
            display: 'flex',
            height: '100%',
            flexDirection: 'column',
            justifyContent: 'space-between',
            overflowY: 'auto'
          }}>

            <div>
              <ModalTitle>Preferences</ModalTitle>

                <Title>Ultimate 64 Address/DNS</Title>


                <label style={{marginBottom:"10px",fontSize:"small"}}>http://x.x.x.x or http://dnsname</label>

                <input onChange={this.handleUltimateAddress}
                style={{fontSize:"small",background:"#333", color:"#eee",textAlign:"left", width:"90%",margin:"0px",marginTop:"10px",padding:"2px"}}
                value={this.props.ultimateAddress}></input>


              <ColorPaletteSelector
                colorPalette={colorPalette}
                selectedColorPaletteName={selectedColorPaletteName}
                setSelectedColorPaletteName={this.props.Settings.setSelectedColorPaletteName}
              />



              <Vic20ColorPaletteSelector
                vic20colorPalette={vic20colorPalette}
                selectedVic20ColorPaletteName={selectedVic20ColorPaletteName}
                setVic20SelectedColorPaletteName={this.props.Settings.setVic20SelectedColorPaletteName}
              />

              <PetColorPaletteSelector
                petcolorPalette={petcolorPalette}
                selectedPetColorPaletteName={selectedPetColorPaletteName}
                setPetSelectedColorPaletteName={this.props.Settings.setPetSelectedColorPaletteName}
              />

              <br/>



              <br/>
            </div>

            <div style={{alignSelf: 'flex-end'}}>
              <button className='cancel' onClick={this.handleCancel}>Cancel</button>
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
    }
  },
  (dispatch) => {
    return {
      Toolbar: Toolbar.bindDispatch(dispatch),
      Settings: bindActionCreators(settings.actions, dispatch)
    }
  }
)(Settings_)
