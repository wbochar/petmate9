
import React, { Component, useRef, useCallback, useState, MouseEvent, CSSProperties } from 'react';
import { connect } from 'react-redux'
import { Dispatch, bindActionCreators } from 'redux'

import { RootState, Font, Pixel, Coord2, Rgb, Tool } from '../redux/types'
import * as framebuffer from '../redux/editor'
import * as cfonts from '../redux/customFonts'

import { Toolbar } from '../redux/toolbar'
import { framebufIndexMergeProps } from '../redux/utils'

import CharGrid from '../components/CharGrid'
import CharPosOverlay from '../components/CharPosOverlay'
import { CharSelectStatusbar } from '../components/Statusbar'

import * as utils from '../utils'
import * as fp from '../utils/fp'
import * as selectors from '../redux/selectors'
import * as screensSelectors from '../redux/screensSelectors'
import {
  getSettingsCurrentColorPalette,
  getSettingsCurrentPetColorPalette,
  getSettingsCurrentVic20ColorPalette
} from '../redux/settingsSelectors'

import FontSelector from '../components/FontSelector'

import styles from './CharSelect.module.css'

interface CharSelectProps {
  Toolbar: any; // TODO ts
  Framebuffer: framebuffer.PropsFromDispatch;
  charset: string;
  font: Font;
  customFonts: cfonts.CustomFonts;
  canvasScale: {
    scaleX: number, scaleY: number
  };
  colorPalette: Rgb[];
  selected: Coord2 | null;
  selectedTool: Tool,
  backgroundColor: number;
  textColor: number;
  ctrlKey: boolean;
}

// Char position & click hook
function useCharPos(
  charWidth: number,
  charHeight: number,
  initialCharPos: Coord2 | null
) {
  const ref = useRef<HTMLDivElement>(null);
  let [isActive, setIsActive] = useState(true);
  let [charPos, setCharPos] = useState<Coord2|null>(initialCharPos);
  let onMouseMove = useCallback(function(event: MouseEvent) {
    if (isActive && ref.current !== null) {
      const bbox = ref.current.getBoundingClientRect();
      const x = Math.floor((event.clientX - bbox.left)/bbox.width * charWidth);
      const y = Math.floor((event.clientY - bbox.top)/bbox.height * charHeight);
      if (x >= 0 && x < charWidth && y >= 0 && y < charHeight) {
        setCharPos({row: y, col: x});
      } else {
        setCharPos(null);
      }
    }
  }, [isActive,ref, charWidth, charHeight, setCharPos]);

  let onMouseEnter = useCallback(function() {
    setIsActive(true);
  }, []);

  let onMouseLeave = useCallback(function() {
    setIsActive(false);
    setCharPos(null);
  }, []);

  return {
    charPos,
    divProps: {
      ref,
      onMouseMove,
      onMouseEnter,
      onMouseLeave
    }
  };
}

function CharSelectView(props: {
  font: Font;
  charset: string;
  customFonts: cfonts.CustomFonts;
  canvasScale: {
    scaleX: number, scaleY: number
  };
  colorPalette: Rgb[];
  selected: Coord2;
  backgroundColor: string;
  style: CSSProperties;
  textColor: number;

  fb: Pixel[][];
  onCharSelected: (pos: Coord2|null) => void;
  setCharset: (charset: string) => void;
}) {
  const W = 16
  const H = 17
  const { scaleX, scaleY } = props.canvasScale;

  const { charPos, divProps } = useCharPos(W, H, props.selected);

  let screencode: number|null = utils.charScreencodeFromRowCol(props.font, props.selected);
  if (charPos !== null) {
    screencode = utils.charScreencodeFromRowCol(props.font, charPos);
  }

  let handleOnClick = useCallback(function() {
    props.onCharSelected(charPos);

  }, [charPos]);

  const customFonts = Object.entries(props.customFonts).map(([id, { name }]) => {
    return {
      id,
      name
    };



  })
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div className={styles.csContainer} style={props.style}>
        <div
          style={{
            imageRendering: 'pixelated',
            transform: `scale(${scaleX}, ${scaleY})`,
            transformOrigin: '0% 0%',
            width: W*9,
            height: H*9
          }}
          {...divProps}
          onClick={handleOnClick}
        >

          <CharGrid
            width={W}
            height={H}
            backgroundColor={props.backgroundColor}
            grid={true}
            framebuf={props.fb}
            font={props.font}
            colorPalette={props.colorPalette}
            textColor={props.textColor}
            isDirart={props.charset==='dirart'}


          />
          {charPos !== null ?
            <CharPosOverlay
              framebufWidth={W}
              framebufHeight={H}
              grid={true}
              opacity={0.5}
              charPos={charPos!}
              borderOn={false}
            />
            : null}
          {props.selected ?
            <CharPosOverlay
              framebufWidth={W}
              framebufHeight={H}
              grid={true}
              opacity={1.0}
              charPos={props.selected}
              borderOn={false}
              />
            : null}
        </div>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'row',
        marginTop:'4px',
        alignItems:'center',
        justifyContent: 'space-between'
      }}>
        <CharSelectStatusbar
          curScreencode={screencode}
          charset={props.charset}
        />
        <FontSelector
          currentCharset={props.charset}
          setCharset={props.setCharset}
          customFonts={customFonts}
        />
      </div>
    </div>
  )
}

class CharSelect extends Component<CharSelectProps> {

  fb: Pixel[][]|null = null;
  font: Font|null = null;
  prevTextColor = -1;

  constructor (props: CharSelectProps) {
    super(props)
    this.computeCachedFb(0)
  }

  computeCachedFb(textColor: number) {
    const { font } = this.props
    this.fb = fp.mkArray(17, y => {
      return fp.mkArray(16, x => {
        return {
          code: utils.charScreencodeFromRowCol(font, {row:y, col:x})!,
          color: textColor
        }
      })
    })
    this.prevTextColor = textColor
    this.font = font
  }

  handleClick = (charPos: Coord2 | null) => {

    console.log("click")
    //charPos is new one
    //this.props.selected is the old one

    if(this.props.ctrlKey)
    {
      if(this.props.selected!=null && charPos !== null)
      {
        //console.log('CharSelect.tsx: swapChars',charPos,this.props.selected);
        const srcChar = utils.charScreencodeFromRowCol(this.props.font, this.props.selected);
        const destChar = utils.charScreencodeFromRowCol(this.props.font, charPos);

        const chars = {srcChar,destChar};
        this.props.Toolbar.swapChars(chars);

      }



    }


    this.props.Toolbar.setCurrentChar(charPos)


    switch (this.props.selectedTool)
    {
      case Tool.Draw:
      case Tool.Colorize:
      case Tool.FloodFill:
      case Tool.CharDraw:
      break;

      default:
        this.props.Toolbar.setSelectedTool(Tool.Draw);
        break;

    }

  }

  render () {
    const { colorPalette } = this.props
    // Editor needs to specify a fixed width/height because the contents use
    // relative/absolute positioning and thus seem to break out of the CSS
    // grid.
    const { scaleX, scaleY } = this.props.canvasScale
    const w = `${Math.floor(scaleX*8*16+scaleX*16)}px`
    const h = `${Math.floor(scaleY*8*17+scaleY*17)}px`


    //console.log("colorPalette:",colorPalette[2])

    let backg = utils.colorIndexToCssRgb(colorPalette, this.props.backgroundColor)

    if(this.props.backgroundColor===this.props.textColor)
    {
      if(this.props.backgroundColor===0){
        backg = "rgba(25,25,25,.1)";
      }
      else{
      backg = backg.replace('rgb','rgba')+",.8)"
      }
    }
    else
    {
      backg = backg.replace('rgb','rgba')+",1)"
    }




    const s = {width: w, height:h}
    if (this.prevTextColor !== this.props.textColor ||
      this.font !== this.props.font) {
      this.computeCachedFb(this.props.textColor)
    }
    if (!this.fb) {
      throw new Error('FB cannot be null here');
    }
    return (

      <CharSelectView
        canvasScale={this.props.canvasScale}
        backgroundColor={backg}
        style={s}
        fb={this.fb}
        charset={this.props.charset}
        font={this.props.font}
        customFonts={this.props.customFonts}
        colorPalette={colorPalette}
        selected={this.props.selected!}
        onCharSelected={this.handleClick}
        setCharset={this.props.Framebuffer.setCharset}
        textColor={this.props.textColor}
      />
    )
  }
}

const mapDispatchToProps = (dispatch: Dispatch) => {
  return {
    Framebuffer: bindActionCreators(framebuffer.actions, dispatch),
    Toolbar: Toolbar.bindDispatch(dispatch)
  }
}

const mapStateToProps = (state: RootState) => {
  const framebuf = selectors.getCurrentFramebuf(state)
  const { charset, font } = selectors.getCurrentFramebufFont(state)

var currentColourPalette = getSettingsCurrentColorPalette(state);



switch(charset.substring(0,3))
{
  case "vic":
    currentColourPalette = getSettingsCurrentVic20ColorPalette(state);

  break;
  case "pet":
    currentColourPalette = getSettingsCurrentPetColorPalette(state);

  break;


}


  const selected =
    selectors.getCharRowColWithTransform(
      state.toolbar.selectedChar,
      font,
      state.toolbar.charTransform
    );
  return {
    framebufIndex: screensSelectors.getCurrentScreenFramebufIndex(state),
    backgroundColor: framebuf ? framebuf.backgroundColor : framebuffer.DEFAULT_BACKGROUND_COLOR,
    selected,
    textColor: state.toolbar.textColor,
    selectedTool: state.toolbar.selectedTool,
    ctrlKey:state.toolbar.ctrlKey,
    charset,
    font,
    customFonts: selectors.getCustomFonts(state),
    colorPalette: currentColourPalette
  }
}

export default connect(
  mapStateToProps,
  mapDispatchToProps,
  framebufIndexMergeProps
)(CharSelect)
