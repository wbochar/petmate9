import React, {
  Component,
  StatelessComponent as SFC,
  useState,
} from 'react';
import { connect } from 'react-redux'

import Modal from '../components/Modal'
import { RootState,Framebuf} from '../redux/types'
import { Toolbar } from '../redux/toolbar'
import { Framebuffer } from '../redux/editor';

import styles from './ResizeSettings.module.css'


import {
  connectFormState,
  Form,
  Checkbox,
  RadioButton,
  NumberInput,
  TextInput

} from '../components/formHelpers'

// TODO ts need utils/index to be .ts

const ModalTitle: SFC<{}> = ({children}) => <h2>{children}</h2>




interface ResizeSettingsStateProps {
  showResizeSettings: boolean;
  resizeWidth: number;
  resizeHeight: number;
  resizeCrop: boolean;


};

interface ResizeSettingsDispatchProps  {
  Toolbar: any;  // TODO ts
  Framebuffer: any;

}

class ResizeSettings extends Component<ResizeSettingsStateProps & ResizeSettingsDispatchProps> {



  width = this.props.resizeWidth;
  height = this.props.resizeHeight;
  resizeCrop = this.props.resizeCrop;


  handleOK = () => {
    this.props.Toolbar.setShowResizeSettings(false)
    //this.width = this.props.resizeWidth;
   // this.height = this.props.resizeHeight;
    //console.log("this.wh",this.width,this.height,"resize",this.props.resizeWidth,this.props.resizeHeight)
    this.props.Toolbar.resizeCanvas(this.width,this.height,{col:0,row:0},this.resizeCrop);


  }

  handleCancel = () => {
    this.props.Toolbar.setShowResizeSettings(false)

  }

  render () {
    this.width = this.props.resizeWidth;
    this.height = this.props.resizeHeight;
    this.resizeCrop = this.props.resizeCrop;

    return (
      <div className={styles.modal}>

        <Modal showModal={this.props.showResizeSettings}>
          <div className={styles.resizeModal}>

            <div>
              <ModalTitle>Crop/Expand Image</ModalTitle>

              <br/>
              <div style={{flexDirection:'row',alignSelf: 'center', justifyContent:'space-between'}}>
             <label style={{marginLeft:'36px'}}>Width:</label>
             <input type="number" name="width" id="inputWidth" defaultValue={this.props.resizeWidth}  onChange={(e)=>this.width=Number(e.target.value)}  />

             <label style={{marginLeft:'36px'}}>Height:</label>
             <input type="number" name="height" id="inputHeight" defaultValue={this.props.resizeHeight} onChange={(e)=>this.height=Number(e.target.value)}  />

             </div>
             <br/>
              <div style={{flexDirection:'row',alignSelf: 'center', justifyContent:'space-between',display:'none'}}>
              <label style={{marginLeft:'36px'}}>Crop (or Wrap Mode)</label>
              <input type="checkbox" name="crop" id="inputCrop" defaultChecked={this.props.resizeCrop} onChange={(e)=>this.resizeCrop=e.target.checked}></input>

                </div>

            </div>

            <div style={{alignSelf: 'flex-end',}}>

              <button className='cancel' onClick={this.handleCancel}>Cancel</button>
              <button className='primary' onClick={this.handleOK}>OK </button>

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
      showResizeSettings: state.toolbar.showResizeSettings,
      resizeWidth:state.toolbar.resizeWidth,
      resizeHeight:state.toolbar.resizeHeight,
      resizeCrop:state.toolbar.resizeCrop,

    }
  },
  (dispatch) => {

    return {

      Toolbar: Toolbar.bindDispatch(dispatch),
      Framebuffer: Framebuffer.bindDispatch(dispatch),

    }
  }
)(ResizeSettings)
