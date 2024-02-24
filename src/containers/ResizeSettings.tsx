import React, {
  Component,
  StatelessComponent as SFC,
  useState,
} from 'react';
import { connect } from 'react-redux'

import Modal from '../components/Modal'
import { RootState} from '../redux/types'
import { Toolbar } from '../redux/toolbar'
import { Framebuffer } from '../redux/editor';


// TODO ts need utils/index to be .ts

const ModalTitle: SFC<{}> = ({children}) => <h2>{children}</h2>




interface ResizeSettingsStateProps {
  showResizeSettings: boolean;
  resizeWidth: number;
  resizeHeight: number;
//  dir: Coord2;

};

interface ResizeSettingsDispatchProps  {
  Toolbar: any;  // TODO ts
  Framebuffer: any;
}

class ResizeSettings extends Component<ResizeSettingsStateProps & ResizeSettingsDispatchProps> {



  width = this.props.resizeWidth;
  height = this.props.resizeHeight;

  handleOK = () => {
    this.props.Toolbar.setShowResizeSettings(false)


    this.props.Toolbar.resizeCanvas(this.width,this.height,{col:0,row:0});

  }

  handleCancel = () => {
    this.props.Toolbar.setShowResizeSettings(false)

  }

  render () {

    return (
      <div>
        <Modal showModal={this.props.showResizeSettings}>
          <div style={{
            display: 'flex',
            height: '100%',
            flexDirection: 'column',
            justifyContent: 'space-between',
            overflowY: 'auto'
          }}>

            <div>
              <ModalTitle>Crop/Expand Image</ModalTitle>

              <br/>
              <div style={{flexDirection:'row',alignSelf: 'center', justifyContent:'space-between'}}>
             <label style={{marginLeft:'36px'}}>Width:</label>
             <input type="number" name="width" id="inputWidth" defaultValue={this.width}  onChange={(e)=>this.width=Number(e.target.value)}  />

             <label style={{marginLeft:'36px'}}>Height:</label>
             <input type="number" name="height" id="inputHeight" defaultValue={this.height} onChange={(e)=>this.height=Number(e.target.value)}  />

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

    console.log("Checking toolbar state:",state.toolbar.resizeWidth)

    return {
      showResizeSettings: state.toolbar.showResizeSettings,
      resizeWidth:state.toolbar.resizeWidth,
      resizeHeight:state.toolbar.resizeHeight,

    }
  },
  (dispatch) => {

    return {

      Toolbar: Toolbar.bindDispatch(dispatch),
      Framebuffer: Framebuffer.bindDispatch(dispatch),

    }
  }
)(ResizeSettings)
