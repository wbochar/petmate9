
import React, { Component, CSSProperties } from 'react'

import styles from './CharPosOverlay.module.css'
import { Coord2 } from '../redux/types';

const charPosOverlayStyleBase: CSSProperties = {
  position: 'absolute',
  outlineStyle: 'solid',
  outlineWidth: 0.5,
  backgroundColor: 'rgba(255,255,255,0)',
  zIndex: 1,
  pointerEvents:'none'
}

interface TextCursorOverlay {
  framebufWidth: number;
  framebufHeight: number;
  charPos: Coord2;
  grid?: boolean;
  color?: string;
  fillColor: string;
  opacity?: number;
  borderOn: boolean;
}

type CharPosOverlayProps = TextCursorOverlay & { blink: boolean };

export default class CharPosOverlay extends Component<CharPosOverlayProps> {
  static defaultProps = {
    blink: false,
    fillColor: 'rgb(255,255,255)',
    grid: false,
    borderOn: true
  }

  render () {

    const { charPos, grid, framebufWidth, framebufHeight, blink, borderOn } = this.props
    const scale = grid ? 9 : 8
    let borderval = Number(borderOn)*4;
    let alpha = this.props.opacity != undefined ? this.props.opacity : 0;
    let outlineColor = `rgba(255, 255, 255, ${alpha})`
    if (this.props.color !== undefined) {
      outlineColor = this.props.color
    }

    if (charPos.row < 0 || charPos.row+borderval >= framebufHeight+borderval ||
        charPos.col < 0 || charPos.col+borderval >= framebufWidth+borderval) {
     return null
   }


    const s = {
      ...charPosOverlayStyleBase,
      outlineColor: outlineColor,
      left: (charPos.col+borderval)*scale,
      top: (charPos.row+borderval)*scale,
      width: `${8}px`,
      height: `${8}px`
    }
    const { fillColor } = this.props
    return (
      <div style={s}>
        {blink ?
          <div style={{
              width:'100%', height:'100%',
              backgroundColor: fillColor
            }}
            className={styles.blink}>
          </div> :
          null}
      </div>
    )
  }
}

export const TextCursorOverlay = (props: TextCursorOverlay) => {
  return (
    <CharPosOverlay {...props} blink={true} />
  )
}