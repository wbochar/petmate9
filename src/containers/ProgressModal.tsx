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

import styles from './ProgressModal.module.css'


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

interface ProgressModalStateProps {
  showProgressModal: boolean;
  progressTitle: string;
  progressValue: number;
};

interface ProgressModalDispatchProps  {
  Toolbar: any;  // TODO ts
  Framebuffer: any;
}

class ProgressModal extends Component<ProgressModalStateProps & ProgressModalDispatchProps> {

  progressTitle = this.props.progressTitle;
  progressValue = this.props.progressValue;

  handleOK = () => {
    this.props.Toolbar.setShowProgressModal(false)
    //this.width = this.props.progressTitle;
   // this.height = this.props.progressValue;


  }

  handleHide = () => {
    this.props.Toolbar.setShowProgressModal(false)

  }

  render () {
    this.progressTitle = this.props.progressTitle;
    this.progressValue = this.props.progressValue/100;

    return (
      <div className={styles.modal}>

        <Modal showModal={this.props.showProgressModal}>
          <div className={styles.progressModal}>

            <div>
              <ModalTitle><div style={{fontSize:'.5em'}}>{this.progressTitle}</div></ModalTitle>
              <br/>
              <progress style={{width:"100%",height:"40px",display:'none'}} value={this.progressValue} />
              <br/>
              <br/>

            </div>

            <div style={{alignSelf: 'flex-end',}}>

              <button className='cancel' onClick={this.handleHide}>Hide</button>


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
      showProgressModal: state.toolbar.showProgressModal,
      progressTitle:state.toolbar.progressTitle,
      progressValue:state.toolbar.progressValue,


    }
  },
  (dispatch) => {

    return {

      Toolbar: Toolbar.bindDispatch(dispatch),
      Framebuffer: Framebuffer.bindDispatch(dispatch),

    }
  }
)(ProgressModal)
