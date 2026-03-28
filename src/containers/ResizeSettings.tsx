import React, {
  Component,
  FC,
  useState,
} from 'react';
import { connect } from 'react-redux'

import Modal from '../components/Modal'
import { RootState,Framebuf} from '../redux/types'
import { Toolbar } from '../redux/toolbar'
import { Framebuffer } from '../redux/editor';

import common from './ModalCommon.module.css'

// TODO ts need utils/index to be .ts


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
      <div>
        <Modal showModal={this.props.showResizeSettings}>
          <div className={common.container}>
            <div className={common.title}>Crop/Expand Image</div>

            <div className={common.colLabel}>Dimensions</div>
            <div className={common.inlineField}>
              <span className={common.fieldLabel}>Width</span>
              <input
                className={common.numInput}
                type="number"
                name="width"
                defaultValue={this.props.resizeWidth}
                onChange={(e)=>this.width=Number(e.target.value)}
              />
            </div>
            <div className={common.inlineField}>
              <span className={common.fieldLabel}>Height</span>
              <input
                className={common.numInput}
                type="number"
                name="height"
                defaultValue={this.props.resizeHeight}
                onChange={(e)=>this.height=Number(e.target.value)}
              />
            </div>

            <div className={common.footer}>
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
