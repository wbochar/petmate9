import React, {
  useState,
  useEffect,
  useCallback,
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

function ResizeSettings(props: ResizeSettingsStateProps & ResizeSettingsDispatchProps) {
  const [width, setWidth] = useState(String(props.resizeWidth));
  const [height, setHeight] = useState(String(props.resizeHeight));

  // Sync local state when props change (e.g. modal re-opens with new dimensions)
  useEffect(() => { setWidth(String(props.resizeWidth)); }, [props.resizeWidth]);
  useEffect(() => { setHeight(String(props.resizeHeight)); }, [props.resizeHeight]);

  const handleOK = useCallback(() => {
    props.Toolbar.setShowResizeSettings(false);
    const w = Math.max(1, Number(width) || props.resizeWidth);
    const h = Math.max(1, Number(height) || props.resizeHeight);
    props.Toolbar.resizeCanvas(w, h, {col:0, row:0}, props.resizeCrop);
  }, [width, height, props]);

  const handleCancel = useCallback(() => {
    props.Toolbar.setShowResizeSettings(false);
  }, [props]);

  return (
    <div>
      <Modal showModal={props.showResizeSettings}>
        <div className={common.container}>
          <div className={common.title}>Crop/Expand Image</div>

          <div className={common.colLabel}>Dimensions</div>
          <div className={common.inlineField}>
            <span className={common.fieldLabel}>Width</span>
            <input
              className={common.numInput}
              type="text"
              inputMode="numeric"
              name="width"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleOK(); }
                e.stopPropagation();
              }}
              onKeyUp={(e) => e.stopPropagation()}
            />
          </div>
          <div className={common.inlineField}>
            <span className={common.fieldLabel}>Height</span>
            <input
              className={common.numInput}
              type="text"
              inputMode="numeric"
              name="height"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleOK(); }
                e.stopPropagation();
              }}
              onKeyUp={(e) => e.stopPropagation()}
            />
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
