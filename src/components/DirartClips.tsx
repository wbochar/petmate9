import React, { Component, useRef, useCallback, useState, MouseEvent, CSSProperties } from 'react';
import { connect } from 'react-redux'
import { Dispatch, bindActionCreators } from 'redux'

import { RootState, Font, Pixel, Coord2, Rgb, Tool, FramebufWithFont,Framebuf } from '../redux/types'
import * as framebuffer from '../redux/editor'
import * as cfonts from '../redux/customFonts'

import CharGrid from './CharGrid'


interface DirArtClipsProps {
  fb: Pixel[][];
  charset: string;
  font: Font;
  colorPalette: Rgb[];
  backgroundColor: number;
  textColor: number;
}

function DirArtClips({colorPalette,font,fb}:DirArtClipsProps)
{


return (
<div style={{border:"1px solid #333",padding:"4px",marginTop:"10px"}}>
test
	</div>

)
}
export default DirArtClips;