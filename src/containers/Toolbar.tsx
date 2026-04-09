import React, {
  Component,
  Fragment,
  PureComponent,
  FC,
} from "react";
import { connect } from "react-redux";
import { bindActionCreators, Dispatch } from "redux";
import classnames from "classnames";
import { ActionCreators } from "redux-undo";

import ColorPicker from "../components/ColorPicker";
import * as utils from "../utils";
import * as fp from "../utils/fp";
import { Toolbar } from "../redux/toolbar";
import { Framebuffer } from "../redux/editor";
import * as framebuf from "../redux/editor";
import * as toolbar from "../redux/toolbar";
import * as selectors from "../redux/selectors";
import * as screensSelectors from "../redux/screensSelectors";
import {
  getSettingsPaletteRemap,
  getSettingsCurrentColorPalette,
  getSettingsCurrentVic20ColorPalette,
  getSettingsCurrentPetColorPalette,
} from "../redux/settingsSelectors";
import * as Root from "../redux/root";
import { framebufIndexMergeProps } from "../redux/utils";
import { Tool, Rgb, RootState, FramebufUIState } from "../redux/types";

import { withHoverFade } from "./hoc";
//faSave, faExpand,faExpandAlt,  faMagic
import {
  faClone,
  faPencilAlt,
  faUndo,
  faRedo,
  faCog,
  faArrowsAlt,
  faKeyboard,
  faFillDrip,
  faSearch,
  faEraser,
  faCropAlt,
  faImage,
  faGripLines,
  faVectorSquare,
  faAdjust,
} from "@fortawesome/free-solid-svg-icons";
import { faFlipboard } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import styles from "./Toolbar.module.css";
import { IconProp } from "@fortawesome/fontawesome-svg-core";

import { electron } from '../utils/electronImports'

const os = electron.remote.process.platform;



interface IconProps {
  selected?: boolean;
  selectedColorOnly?: boolean;
  tooltip: string | null;
  iconName: IconProp | null;
  bottom: boolean;
  subIcon?: FC<{}>;
  extraStyle?: React.CSSProperties;
  onIconClick: () => void;
}

class Icon extends PureComponent<IconProps> {
  static defaultProps = {
    bottom: false,
    subIcon: undefined,
    selectedColorOnly: false,
  };
  render() {
    const isSelected = this.props.selected !== undefined && this.props.selected;
    const selectedClass =
      isSelected && !this.props.selectedColorOnly
        ? styles.selectedTool
        : null;
    const iconStyle: React.CSSProperties = {
      ...this.props.extraStyle,
      ...(isSelected && this.props.selectedColorOnly ? { color: 'var(--toolbar-toggle-on-color)' } : {}),
    };
    const tooltip =
      this.props.tooltip !== null ? (
        <span className={styles.tooltiptext}>{this.props.tooltip}</span>
      ) : null;
    return (
      <div
        className={classnames(
          styles.tooltip,
          selectedClass,
          this.props.bottom ? styles.end : null
        )}
        onClick={() => this.props.onIconClick()}
        style={iconStyle}
      >
        {this.props.iconName !== null ? <FontAwesomeIcon className={styles.icon} icon={this.props.iconName} /> : null}
        {this.props.subIcon !== undefined ? <this.props.subIcon /> : null}
        {tooltip}
      </div>
    );
  }
}

interface SelectableToolProps {
  tool: Tool;
  selectedTool: Tool;
  setSelectedTool: (tool: Tool) => void;
}

type Omit<T, K> = Pick<T, Exclude<keyof T, K>>;

class SelectableTool extends PureComponent<
  SelectableToolProps & Omit<IconProps, "onIconClick" | "bottom">
> {
  handleClick = () => {
    this.props.setSelectedTool(this.props.tool);
  };
  render() {
    const { tool, ...props } = this.props;
    return (
      <Icon
        onIconClick={this.handleClick}
        selected={tool === this.props.selectedTool}
        {...props}
      />
    );
  }
}

interface FbColorPickerProps {
  active: boolean;
  fadeOut: boolean;
  colorPalette: Rgb[];
  paletteRemap: number[];
  color: number;
  tooltip: string;
  charset?: string;

  onSelectColor: (idx: number) => void;
  onToggleActive: () => void;
}

class FbColorPicker_ extends PureComponent<FbColorPickerProps> {
  handleSelectColor = (idx: number) => {
    this.props.onSelectColor(idx);
  };

  render() {
    const { colorPalette } = this.props;
    const bg = utils.colorIndexToCssRgb(colorPalette, this.props.color);

    let s;
    if (this.props.tooltip === "Background") {
      s = {
        height: "25px",
        marginTop: "-35px",
        backgroundColor: bg,
        flex: "none",
        width: "27px",
      };
    } else {
      s = {
        height: "40px",
        marginTop: "10px",
        backgroundColor: bg,
        flex: 1,
      };
    }

    let picker = null;
    let tooltip = null;
    if (this.props.active) {
      picker = (
        <div
          className={classnames(
            styles.colorpicker,
            this.props.fadeOut ? styles.fadeOut : null
          )}
          style={{
            top: "9px",
            filter: "drop-shadow(2.5px 2.5px 1.5px rgba(0,0,0,0.5))",
          }}
        >
          <ColorPicker
            onSelectColor={this.handleSelectColor}
            paletteRemap={this.props.paletteRemap}
            colorPalette={colorPalette}
            selected={this.props.color}
            scale={{ scaleX: 1.5, scaleY: 1.5 }}
            twoRows={true}
            ctrlKey={false}
            charset={this.props.charset}
          />
        </div>
      );
      tooltip = null;
    } else {
      tooltip = (
        <span className={styles.tooltiptext}>{this.props.tooltip}</span>
      );
    }
    return (
      <Fragment>
        <div style={s} onClick={this.props.onToggleActive} />
        {picker}
        {tooltip}
      </Fragment>
    );
  }
}
const FbColorPicker = withHoverFade(FbColorPicker_);

const renderColorizeSubIcon: FC<{}> = () => {
  return (
    <div
      style={{
        backgroundColor: "#d77",
        position: "absolute",
        width: "9px",
        height: "9px",
        top: "18px",
        left: "26px",
        borderRadius: "50%",
      }}
    ></div>
  );
};

const renderCharSubIcon: FC<{}> = () => {
  return (
    <div
      style={{
        position: "absolute",
        width: "9px",
        height: "9px",
        top: "14px",
        left: "26px",
        fontSize: "11px",
      }}
    >
      A
    </div>
  );
};

const renderRvsSubIcon: FC<{}> = () => {
  return (
    <div
      style={{
        position: "absolute",
        width: "12px",
        height: "12px",
        top: "15px",
        left: "24px",
        backgroundColor: "var(--toolbar-rvs-box-bg, #aaa)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "9px",
        fontWeight: "bold",
        transform: "scaleX(-1)",
        lineHeight: 1,
        color: "var(--toolbar-rvs-r-color, #333)",
      }}
    >
      R
    </div>
  );
};

const renderfaSearch: FC<{}> = () => {
  return (
    <div style={{
        position: "absolute",
        width: "9px",
        height: "9px",
        top: "16px",
        left: "12px",
        fontSize:"10px"
      }}
    >
     <FontAwesomeIcon icon={faSearch}></FontAwesomeIcon>
    </div>
  );
};


const renderSelectDashed: FC<{}> = () => {
  return (
    <div
      style={{
        margin: "9px",
        width: "16px",
        height: "16px",
        border: "2px dashed var(--toolbar-icon-color, #787878)",
      }}
    ></div>
  );
};

const renderDiagonalLine: FC<{}> = () => {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      style={{ margin: "4px 7px 3px 7px", color: "var(--toolbar-icon-color)" }}
    >
      <line
        x1="4" y1="20" x2="20" y2="4"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
};

interface CanvasFitSubMenuProps {
  fit: FramebufUIState["canvasFit"];
  setFit: (fit: FramebufUIState["canvasFit"]) => void;
}

interface SelectButtonProps extends CanvasFitSubMenuProps {
  name: FramebufUIState["canvasFit"];
  children?: React.ReactNode;
}

const SelectButton: FC<SelectButtonProps> = (props: SelectButtonProps) => {
  const { name, fit, setFit, children } = props;
  return (
    <div
      className={styles.canvasFitSelectButton}
      style={{
        borderStyle: "solid",
        borderWidth: "0px",
        borderColor:
          name === fit ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.0)",
      }}
      onClick={() => setFit(name)}
    >
      {children}
    </div>
  );
};

class CanvasFitSubMenu extends PureComponent<CanvasFitSubMenuProps> {
  render() {

    return (
      <div
        style={{

          alignItems: "center",
          fontSize: "0.6em",
          color: "rgb(120,120,120)",
          display: "None",
        }}
      >


        <SelectButton
          name="fitWidth"
          fit={this.props.fit}
          setFit={this.props.setFit}
        >
          W
        </SelectButton>
        <SelectButton
          name="fitWidthHeight"
          fit={this.props.fit}
          setFit={this.props.setFit}
        >
          WxH
        </SelectButton>
        <SelectButton
          name="fitHeight"
          fit={this.props.fit}
          setFit={this.props.setFit}
        >
          H
        </SelectButton>
      </div>
    );
  }
}

interface ToolbarSelectorProps {
  charset: string | null;
  framebufIndex: number | null;
  selectedTool: Tool;
  backgroundColor: number | null;
  borderColor: number | null;
  borderOn: boolean | null;
  width:  number | null;
  height:  number | null;
  paletteRemap: number[];
  colorPalette: Rgb[];
  vic20colorPalette:Rgb[]
  petcolorPalette:Rgb[]
  canvasFit: FramebufUIState["canvasFit"];
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  guideLayerVisible: boolean;
}

interface ToolbarViewProps extends ToolbarSelectorProps {
  readonly Framebuffer: framebuf.PropsFromDispatch;
  readonly Toolbar: toolbar.PropsFromDispatch;
  setFramebufCanvasFit: (fit: FramebufUIState["canvasFit"]) => void;
  // Undoable dispatchers
  undo: () => void;
  redo: () => void;
}

interface ToolbarViewState {
  readonly pickerActive: {
    border: boolean;
    background: boolean;
  };
}

class ToolbarView extends Component<
  ToolbarViewProps & ToolbarSelectorProps,
  ToolbarViewState
> {
  state = {
    pickerActive: {
      border: false,
      background: false,
    },
  };

  setPickerActive = (
    pickerId: "border" | "background" | "canvasFit",
    val: boolean
  ) => {
    this.setState((prevState) => {
      return {
        pickerActive: {
          ...prevState.pickerActive,
          [pickerId]: val,
        },
      };
    });
  };

  handleSelectBgColor = (color: number) => {
    this.setPickerActive("background", false);
    this.props.Framebuffer.setBackgroundColor(color);
  };

  handleSelectBorderColor = (color: number) => {
    this.setPickerActive("border", false);
    this.props.Framebuffer.setBorderColor(color);
  };

  render() {
    if (this.props.backgroundColor === null) {
      return null;
    }
    type MkToolArgs = {
      tool: Tool;
      iconName: IconProp | null;
      tooltip: string;
      subIcon?: FC<{}>;
      extraStyle?: React.CSSProperties;
    };
    const mkTool = ({ tool, iconName, tooltip, subIcon, extraStyle }: MkToolArgs) => {
      return (
        <SelectableTool
          key={tool}
          tool={tool}
          setSelectedTool={this.props.Toolbar.setSelectedTool}
          selectedTool={this.props.selectedTool}
          iconName={iconName}
          tooltip={tooltip}
          subIcon={subIcon}
          extraStyle={extraStyle}
        />
      );
    };
    const tools = [
      mkTool({
        tool: Tool.PanZoom,
        iconName: faArrowsAlt,
        tooltip: "Pan (scroll to zoom)",
      }),
      mkTool({
        tool: Tool.Brush,
        iconName: null,
        tooltip: "Select",
        subIcon: renderSelectDashed,
      }),
      mkTool({
        tool: Tool.Draw,
        iconName: faPencilAlt,
        tooltip: "Char & Color",
      }),
      mkTool({
        tool: Tool.Colorize,
        iconName: faPencilAlt,
        tooltip: "Color only",
        subIcon: renderColorizeSubIcon,
      }),
      mkTool({
        tool: Tool.CharDraw,
        iconName: faPencilAlt,
        tooltip: "Char only",
        subIcon: renderCharSubIcon,
      }),
      mkTool({
        tool: Tool.RvsPen,
        iconName: faPencilAlt,
        tooltip: "RVS Pen",
        subIcon: renderRvsSubIcon,
        extraStyle: { paddingBottom: "4px" },
      }),
      mkTool({
        tool: Tool.FloodFill,
        iconName: faFillDrip,
        tooltip: "Flood Fill",
      }),
      mkTool({
        tool: Tool.LinesDraw,
        iconName: null,
        tooltip: "Lines",
        subIcon: renderDiagonalLine,
      }),

      mkTool({
        tool: Tool.Text,
        iconName: faKeyboard,
        tooltip: "Keyboard Entry Mode",
      }),
      mkTool({
        tool: Tool.FadeLighten,
        iconName: faAdjust,
        tooltip: "Fade/Lighten",
      }),
      mkTool({
        tool: Tool.Textures,
        iconName: faFlipboard,
        tooltip: "Textures",
      }),
      mkTool({
        tool: Tool.Lines,
        iconName: faGripLines,
        tooltip: "Separators",
      }),
      mkTool({
        tool: Tool.Boxes,
        iconName: faVectorSquare,
        tooltip: "Boxes",
      }),

    ];



    var cr = this.props.paletteRemap;
    var cp = this.props.colorPalette;
    var cb = cr;
    var tr = true;

    switch(this.props.charset?.substring(0,3))
    {
      case "vic":
        cr = this.props.paletteRemap
        cb = this.props.paletteRemap.slice(0,8);
        cp = this.props.vic20colorPalette;
        tr = false;
        //this.props.Toolbar.setColor(6)
      break;
      case "pet":
        cr = this.props.paletteRemap.slice(0,1);
        cp = this.props.petcolorPalette;
        cb = this.props.paletteRemap.slice(0,1);
        tr = false;

        //this.props.Toolbar.setColor(1)
        //this.props.Framebuffer.convertToMono()
      break;
        default:
        //  this.props.Toolbar.setColor(14)
      break;
    }


    return (
      <div className={styles.toolbar}>
        {/* Undo/Redo icons hidden
        <Icon onIconClick={this.props.undo} iconName={faUndo} tooltip="Undo" />
        <Icon onIconClick={this.props.redo} iconName={faRedo} tooltip="Redo" />
        */}
        {tools}
        <Icon
          onIconClick={()=>{

          this.props.Toolbar.resizeDims();
           this.props.Toolbar.setShowResizeSettings(true);

        }}
          iconName={faCropAlt}
          tooltip="Crop/Resize"
        />
        <Icon
          onIconClick={()=>{
          this.props.Toolbar.clearCanvas();
        }}
          iconName={faEraser}
          tooltip="Clear canvas"
        />
        <Icon
          onIconClick={() => {
            this.props.Toolbar.setGuideLayerVisible(!this.props.guideLayerVisible);
          }}
          iconName={faImage}
          tooltip="Guide Layer (G)"
          selected={this.props.guideLayerVisible}
          selectedColorOnly={true}
          extraStyle={{ color: 'var(--toolbar-icon-guide-border-color)' }}
        />
        <Icon
          onIconClick={() => {

if(this.props.ctrlKey||this.props.shiftKey||this.props.altKey)
{
            if(this.props.ctrlKey){
              if(this.props.shiftKey)
              {
                this.props.Toolbar.setAllBorder(false);
              }else
              {
              this.props.Toolbar.setAllBorder(true);
              }
            }
            if(this.props.altKey)
            {
              this.props.Toolbar.setAllBorderFlip();
            }
          }else
          {
            this.props.Framebuffer.setBorderOn(!this.props.borderOn!);
          }

          }}
          iconName={faClone}
          tooltip="Border On/Off"
          selected={this.props.borderOn!}
          selectedColorOnly={true}
          extraStyle={{ color: 'var(--toolbar-icon-guide-border-color)' }}
        />

        <FbColorPicker
          pickerId="border"
          containerClassName={styles.tooltip}
          active={this.state.pickerActive.border}
          color={this.props.borderColor!}
          onSetActive={this.setPickerActive}
          onSelectColor={this.handleSelectBorderColor}
          paletteRemap={cb}
          colorPalette={cp}
          tooltip="Border"
          charset={this.props.charset || 'c64'}
        />
        <FbColorPicker
          pickerId="background"
          containerClassName={styles.tooltip}
          active={this.state.pickerActive.background}
          color={this.props.backgroundColor}
          onSetActive={this.setPickerActive}
          onSelectColor={this.handleSelectBgColor}
          paletteRemap={cr}
          colorPalette={cp}
          tooltip="Background"
          charset={this.props.charset || 'c64'}
        />
        <CanvasFitSubMenu
          fit={this.props.canvasFit}
          setFit={this.props.setFramebufCanvasFit}
        />

        <Icon
          bottom={true}
          onIconClick={() => this.props.Toolbar.setShowSettings(true)}
          iconName={faCog}
          tooltip="Preferences"
        />
      </div>
    );
  }
}

const undoActions = {
  undo: (framebufIndex: number) => {
    return {
      ...ActionCreators.undo(),
      framebufIndex,
    };
  },
  redo: (framebufIndex: number) => {
    return {
      ...ActionCreators.redo(),
      framebufIndex,
    };
  },
};
const mapDispatchToProps = (dispatch: any) => {
  function setCanvasFit(canvasFit: FramebufUIState["canvasFit"]) {
    return (dispatch: Dispatch, getState: any) => {
      const state = getState();
      const fbIndex = screensSelectors.getCurrentScreenFramebufIndex(state)!;
      const prevState = selectors.getFramebufUIState(getState(), fbIndex);
      dispatch(
        Toolbar.actions.setFramebufUIState(fbIndex, {
          ...prevState!,
          canvasFit,
        })
      );
    };
  }
  return {
    ...bindActionCreators(undoActions, dispatch),
    ...bindActionCreators(Root.actions, dispatch),
    Toolbar: Toolbar.bindDispatch(dispatch),
    Framebuffer: Framebuffer.bindDispatch(dispatch),
    setFramebufCanvasFit: (f: FramebufUIState["canvasFit"]) =>
      dispatch(setCanvasFit(f)),
  };
};

const mapStateToProps = (state: RootState): ToolbarSelectorProps => {
  const framebuf = selectors.getCurrentFramebuf(state);
  const framebufIndex = screensSelectors.getCurrentScreenFramebufIndex(state);
  let canvasFit: FramebufUIState["canvasFit"] = "fitWidth";

  if (framebufIndex !== null) {


    const uis = selectors.getFramebufUIState(state, framebufIndex);
    canvasFit = uis!.canvasFit;
  }
  return {
    framebufIndex,
    charset:  fp.maybe(framebuf, null, (fb) => fb.charset),
    backgroundColor: fp.maybe(framebuf, null, (fb) => fb.backgroundColor),
    borderColor: fp.maybe(framebuf, null, (fb) => fb.borderColor),
    borderOn: fp.maybe(framebuf, null, (fb) => fb.borderOn),
    width:fp.maybe(framebuf, null, (fb) => fb.width),
    height:fp.maybe(framebuf, null, (fb) => fb.height),
    selectedTool: state.toolbar.selectedTool,
    paletteRemap: getSettingsPaletteRemap(state),
    colorPalette: getSettingsCurrentColorPalette(state),
    vic20colorPalette: getSettingsCurrentVic20ColorPalette(state),
    petcolorPalette: getSettingsCurrentPetColorPalette(state),
    canvasFit,
    ctrlKey: os==="darwin" ? state.toolbar.metaKey : state.toolbar.ctrlKey,
    shiftKey: state.toolbar.shiftKey,
    altKey: state.toolbar.altKey,
    guideLayerVisible: state.toolbar.guideLayerVisible,
  };
};
export default connect(
  mapStateToProps,
  mapDispatchToProps,
  framebufIndexMergeProps
)(ToolbarView);
