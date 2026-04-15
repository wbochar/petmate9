
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
import { buildWeightCharOrder } from '../utils/charWeight'
import * as screensSelectors from '../redux/screensSelectors'
import {
  getSettingsCurrentColorPalette,
  getSettingsCurrentPetColorPalette,
  getSettingsCurrentVic20ColorPalette,
  getSettingsCurrentTedColorPalette,
  getSettingsCharPanelBgMode,
} from '../redux/settingsSelectors'
import { vdcPalette } from '../utils/palette'

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
  charPanelBgMode: 'document' | 'global';
  renderPanel?: (content: React.ReactNode, sortDropdown: React.ReactNode) => React.ReactNode;
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

type CharSortMode = 'petmate' | 'rom' | 'heavy' | 'light';

function CharSelectView(props: {
  font: Font;
  charset: string;
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

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: props.style.width,
      margin: '0 auto',
    }}>
      <div className={styles.csContainer} style={props.style}>
        <div
          style={{
            imageRendering: 'pixelated',
            transform: `scale(${scaleX}, ${scaleY})`,
            transformOrigin: '0% 0%',
            width: W*9,
            height: H*9,
            borderLeft: '1px solid black',
            borderTop: '1px solid black',
            boxSizing: 'content-box',
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
      }}>
        <CharSelectStatusbar
          curScreencode={screencode}
          charset={props.charset}
          font={props.font}
        />
      </div>
    </div>
  )
}

class CharSelect extends Component<CharSelectProps> {

  fb: Pixel[][]|null = null;
  font: Font|null = null;
  prevTextColor = -1;
  prevSortMode: CharSortMode = 'petmate';

  state = {
    charSortMode: 'petmate' as CharSortMode,
  };

  constructor (props: CharSelectProps) {
    super(props)
    this.computeCachedFb(0, props.font)
  }

  computeCachedFb(textColor: number, displayFont: Font) {
    this.fb = fp.mkArray(17, y => {
      return fp.mkArray(16, x => {
        return {
          code: utils.charScreencodeFromRowCol(displayFont, {row:y, col:x})!,
          color: textColor
        }
      })
    })
    this.prevTextColor = textColor
    this.font = this.props.font
    this.prevSortMode = this.state.charSortMode
  }

  // Build the display font for the current sort mode.
  private getDisplayFont(): Font {
    const sortMode = this.state.charSortMode;
    if (sortMode === 'rom') {
      return { ...this.props.font, charOrder: utils.romCharOrder };
    } else if (sortMode === 'heavy' || sortMode === 'light') {
      return { ...this.props.font, charOrder: buildWeightCharOrder(this.props.font, sortMode) };
    }
    return this.props.font;
  }

  // Convert a display-order position to Petmate-order position
  displayToPetmate = (pos: Coord2 | null): Coord2 | null => {
    if (pos === null || this.state.charSortMode === 'petmate') return pos;
    const displayFont = this.getDisplayFont();
    const screencode = utils.charScreencodeFromRowCol(displayFont, pos);
    if (screencode === null) return null;
    return utils.rowColFromScreencode(this.props.font, screencode);
  }

  // Convert a Petmate-order position to display-order position
  petmateToDisplay = (pos: Coord2): Coord2 => {
    if (this.state.charSortMode === 'petmate') return pos;
    const screencode = utils.charScreencodeFromRowCol(this.props.font, pos);
    if (screencode === null) return pos;
    const displayFont = this.getDisplayFont();
    return utils.rowColFromScreencode(displayFont, screencode);
  }

  handleClick = (charPos: Coord2 | null) => {
    // charPos is in display-order space — convert to Petmate order
    const petmatePos = this.displayToPetmate(charPos);

    if(this.props.ctrlKey)
    {
      if(this.props.selected!=null && petmatePos !== null)
      {
        const srcChar = utils.charScreencodeFromRowCol(this.props.font, this.props.selected);
        const destChar = utils.charScreencodeFromRowCol(this.props.font, petmatePos);

        const chars = {srcChar,destChar};
        this.props.Toolbar.swapChars(chars);

      }
    }

    this.props.Toolbar.setCurrentChar(petmatePos)

    switch (this.props.selectedTool)
    {
      case Tool.Draw:
      case Tool.Colorize:
      case Tool.FloodFill:
      case Tool.CharDraw:
      case Tool.RvsPen:
      case Tool.Lines:
      case Tool.LinesDraw:
      case Tool.Textures:
      case Tool.Boxes:
      case Tool.FadeLighten:
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
    const w = `${Math.floor(scaleX*8*16+scaleX*16+scaleX)}px`
    const h = `${Math.floor(scaleY*8*17+scaleY*17+scaleY)}px`


    //console.log("colorPalette:",colorPalette[2])

    let backg: string;
    if (this.props.charPanelBgMode === 'document') {
      // B mode: direct document background color
      const bgRgb = colorPalette[this.props.backgroundColor];
      if (this.props.backgroundColor === this.props.textColor) {
        // fg==bg: nudge background slightly so characters remain visible
        const luma = utils.luminance(bgRgb);
        const offset = luma < 0.5 ? 40 : -40;
        const r = Math.max(0, Math.min(255, bgRgb.r + offset));
        const g = Math.max(0, Math.min(255, bgRgb.g + offset));
        const b = Math.max(0, Math.min(255, bgRgb.b + offset));
        backg = `rgb(${r}, ${g}, ${b})`;
      } else {
        backg = utils.rgbToCssRgb(bgRgb);
      }
    } else {
      // G mode: transparent – show the panel's own CSS background
      backg = 'transparent';
    }




    const s = {width: w, height:h}

    const sortMode = this.state.charSortMode;
    const displayFont = this.getDisplayFont();

    if (this.prevTextColor !== this.props.textColor ||
      this.font !== this.props.font ||
      this.prevSortMode !== sortMode) {
      this.computeCachedFb(this.props.textColor, displayFont)
    }
    if (!this.fb) {
      throw new Error('FB cannot be null here');
    }

    // Convert selected position to display order
    const displaySelected = this.props.selected
      ? this.petmateToDisplay(this.props.selected)
      : this.props.selected;

    const customFonts = Object.entries(this.props.customFonts).map(([id, { name }]) => ({
      id,
      name
    }));

    const sortDropdown = (
      <>
        <select
          value={sortMode}
          onChange={(e) => this.setState({ charSortMode: e.target.value as CharSortMode })}
          style={{
            fontSize: "10px",
            background: "var(--panel-btn-bg)",
            color: "var(--panel-btn-color)",
            border: "1px solid var(--panel-btn-border)",
            padding: "1px 2px",
            cursor: "pointer",
          }}
        >
          <option value="petmate">Petmate</option>
          <option value="rom">ROM Order</option>
          <option value="heavy">Heavy</option>
          <option value="light">Light</option>
        </select>
        <FontSelector
          currentCharset={this.props.charset}
          setCharset={this.props.Framebuffer.setCharset}
          customFonts={customFonts}
        />
      </>
    );

    const content = (
      <CharSelectView
        canvasScale={this.props.canvasScale}
        backgroundColor={backg}
        style={s}
        fb={this.fb}
        charset={this.props.charset}
        font={displayFont}
        colorPalette={colorPalette}
        selected={displaySelected!}
        onCharSelected={this.handleClick}
        textColor={this.props.textColor}
      />
    );

    if (this.props.renderPanel) {
      return this.props.renderPanel(content, sortDropdown) as React.ReactElement;
    }
    return content;
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
const charPrefix = charset.substring(0,3);
const fbWidth = framebuf?.width ?? 40;

switch(charPrefix)
{
  case "c16":
    currentColourPalette = getSettingsCurrentTedColorPalette(state);
  break;
  case "vic":
    currentColourPalette = getSettingsCurrentVic20ColorPalette(state);
  break;
  case "pet":
    currentColourPalette = getSettingsCurrentPetColorPalette(state);
  break;
  case "c12":
    if (fbWidth >= 80) currentColourPalette = vdcPalette;
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
    colorPalette: currentColourPalette,
    charPanelBgMode: getSettingsCharPanelBgMode(state),
  }
}

export default connect(
  mapStateToProps,
  mapDispatchToProps,
  framebufIndexMergeProps
)(CharSelect)
