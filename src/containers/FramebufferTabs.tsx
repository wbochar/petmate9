import React, {
  Component,
  PureComponent,
  useState,
  useCallback,
  CSSProperties,
} from "react";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import {
  arrayMove,
} from "../external/react-sortable-hoc";

import classnames from "classnames";

import ContextMenuArea from "./ContextMenuArea";

import CharGrid from "../components/CharGrid";
import * as framebuf from "../redux/editor";
import * as toolbar from "../redux/toolbar";
import * as screens from "../redux/screens";
import * as selectors from "../redux/selectors";
import * as screensSelectors from "../redux/screensSelectors";
import { getSettingsCurrentColorPalette, getSettingsCurrentPetColorPalette, getSettingsCurrentVic20ColorPalette, getSettingsCurrentTedColorPalette } from "../redux/settingsSelectors";
import { vdcPalette, getColorGroup } from "../utils/palette";
import { resolveColumnMode } from "../utils/platformChecks";

import * as utils from "../utils";
import * as fp from "../utils/fp";

import {
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import styles from "./FramebufferTabs.module.css";
import {
  Framebuf,
  FramebufWithFont,
  Rgb,
  Font,
  RootState,
} from "../redux/types";
import { electron } from "../utils/electronImports";
import { getJSON, getPNG } from "../utils/exporters";
import { CustomFonts } from "../redux/customFonts";

interface NameInputDispatchProps {
  Toolbar: toolbar.PropsFromDispatch;
}

interface NameInputProps {
  name: string;

  onSubmit: (name: string) => void;
  onCancel: () => void;
  onBlur: () => void;
}

interface NameInputState {
  name: string;
}

// This class is a bit funky with how it disables/enables keyboard shortcuts
// globally for the app while the input element has focus.  Maybe there'd be a
// better way to do this, but this seems to work.
class NameInput_ extends Component<
  NameInputProps & NameInputDispatchProps,
  NameInputState
> {
  state = {
    name: this.props.name,
  };

  componentWillUnmount() {
    this.props.Toolbar.setShortcutsActive(true);
  }

  handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    this.props.onSubmit(this.state.name);
    this.props.Toolbar.setShortcutsActive(true);
  };

  handleChange = (e: React.FormEvent<EventTarget>) => {
    let target = e.target as HTMLInputElement;
    this.setState({ name: target.value });
  };

  handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      this.props.onSubmit(this.state.name);
      this.props.Toolbar.setShortcutsActive(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      this.props.onCancel();
      this.props.Toolbar.setShortcutsActive(true);
    }
  };

  handleBlur = (_e: React.FocusEvent<HTMLTextAreaElement>) => {
    this.props.onBlur();
    this.props.Toolbar.setShortcutsActive(true);
  };

  handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    let target = e.target as HTMLTextAreaElement;
    this.props.Toolbar.setShortcutsActive(false);
    target.select();
  };

  render() {
    return (
      <div className={styles.tabNameEditor}>
        <form onSubmit={this.handleSubmit}>
          <textarea
            autoFocus
            rows={2}
            onKeyDown={this.handleKeyDown}
            value={this.state.name}
            onChange={this.handleChange}
            onBlur={this.handleBlur}
            onFocus={this.handleFocus}
          />
        </form>
      </div>
    );
  }
}

const NameInput = connect(null, (dispatch) => {
  return {
    Toolbar: bindActionCreators(toolbar.Toolbar.actions, dispatch),
  };
})(NameInput_);

interface NameEditorProps {
  name: string;

  onNameSave: (name: string) => void;
}

interface NameEditorState {
  editing: boolean;
}

class NameEditor extends Component<NameEditorProps, NameEditorState> {
  state = {
    editing: false,
  };

  handleEditingClick = () => {
    this.setState({ editing: true });
  };

  handleBlur = () => {
    this.setState({ editing: false });
  };

  handleSubmit = (name: string) => {
    this.setState({ editing: false });
    this.props.onNameSave(name);
  };

  handleCancel = () => {
    this.setState({ editing: false });
  };

  render() {
    const nameElts = this.state.editing ? (
      <NameInput
        name={this.props.name}
        onSubmit={this.handleSubmit}
        onBlur={this.handleBlur}
        onCancel={this.handleCancel}
      />
    ) : (
      <div className={styles.tabName} onClick={this.handleEditingClick}>
        {this.props.name}
      </div>
    );
    return <div className={styles.tabNameContainer}>{nameElts}</div>;
  }
}

function computeContainerSize(fb: Framebuf, pixelStretchX: number = 1) {
  // Effective display dimensions after pixel aspect ratio correction
  const effectiveW = fb.width * 8 * pixelStretchX;
  const effectiveH = fb.height * 8;
  // Scale to fit the 120×75 thumbnail box
  const s = Math.min(120 / effectiveW, 75 / effectiveH);
  return {
    divWidth: "120px",
    divHeight: "75px",
    scaleX: s * pixelStretchX,
    scaleY: s,
  };
}

interface FramebufTabProps {
  id: number;
  active: boolean;
  framebufId: number;
  framebuf: Framebuf;
  colorPalette: Rgb[];
  font: Font;
  draggable?: boolean;
  onDragStartTab?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOverTab?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDropTab?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEndTab?: () => void;

  setName: (name: string, framebufId: number) => void;
  onSetActiveTab: (id: number) => void;
  onDuplicateTab: (id: number) => void;
  onRemoveTab: (id: number) => void;
  onCopyTab: (id: number) => void;
  onCopyPNGTab: (id: number) => void;
  onPasteTab: (id: number) => void;
}

class FramebufTab extends PureComponent<FramebufTabProps> {
  tabRef = React.createRef<HTMLDivElement>();

  handleSelect = () => {
    this.props.onSetActiveTab(this.props.id);
  };

  handleMenuDuplicate = () => {
    this.props.onDuplicateTab(this.props.id);
  };

  handleMenuCopy = () => {
    this.props.onCopyTab(this.props.id);
  };


  handleMenuCopyPNG = () => {
    this.props.onCopyPNGTab(this.props.id);
  };

  handleMenuPaste = () => {
    this.props.onPasteTab(this.props.id);
  };

  handleMenuRemove = () => {
    this.props.onRemoveTab(this.props.id);
  };

  handleNameSave = (name: string) => {
    if (name !== "") {
      this.props.setName(name, this.props.framebufId);
    }
  };

  componentDidUpdate() {
    if (this.props.active && this.tabRef.current) {
      this.tabRef.current.scrollIntoView();
    }
  }

  render() {
    const { width, height, framebuf, backgroundColor, borderColor } =
      this.props.framebuf;
    const font = this.props.font;
    const colorPalette = this.props.colorPalette;
    const backg = utils.colorIndexToCssRgb(colorPalette, backgroundColor);
    const bord = utils.colorIndexToCssRgb(colorPalette, borderColor);
    const charPrefix = this.props.framebuf.charset.substring(0, 3);
    const columnMode = resolveColumnMode(this.props.framebuf);
    const pixelStretchX = charPrefix === 'vic' ? 2
      : columnMode === 80 ? 0.5
      : 1;
    const { scaleX, scaleY } = computeContainerSize(this.props.framebuf, pixelStretchX);
    const s = {
      width: "120px",
      height: "75px",
      backgroundColor: "#000",
      borderStyle: "solid",
      borderWidth: "5px",
      borderColor: bord,
      overflow: "hidden",
    };
    const scaleStyle: CSSProperties = {
      transform: `scale(${scaleX}, ${scaleY})`,
      transformOrigin: "0% 0%",
      imageRendering: "pixelated",
    };

    const menuItems = [
      {
        label: "Copy",
        click: this.handleMenuCopy,
      },
      {
        label: "Copy to PNG",
        click: this.handleMenuCopyPNG,
      },
      {
        label: "Paste",
        click: this.handleMenuPaste,
      },
      {
        label: "Remove",
        click: this.handleMenuRemove,
      },
      {
        label: "Duplicate",
        click: this.handleMenuDuplicate,
      },
    ];






    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          marginRight: "8px",
        }}
        ref={this.tabRef}
        draggable={this.props.draggable}
        onDragStart={this.props.onDragStartTab}
        onDragOver={this.props.onDragOverTab}
        onDrop={this.props.onDropTab}
        onDragEnd={this.props.onDragEndTab}
      >
        <ContextMenuArea menuItems={menuItems}>
          <div
            onClick={this.handleSelect}
            className={classnames(
              styles.tab,
              this.props.active ? styles.active : null
            )}
            style={s}
          >
            <div style={scaleStyle}>
              <CharGrid
                width={width}
                height={height}
                backgroundColor={backg}
                grid={false}
                framebuf={framebuf}
                font={font}
                colorPalette={colorPalette}
              />
            </div>
            <div
              style={{
                backgroundColor: "#444",
                color: "#fff",
                padding: "2px",
                position: "relative",
                marginLeft: "auto",
                marginTop: "54px",
                width: "fit-content",
                fontSize: ".8em",
                textAlign: "right",
                border: "0px solid #000",
              }}
            >
              {width}x{height}
            </div>
          </div>
        </ContextMenuArea>
        <NameEditor
          name={fp.maybeDefault(this.props.framebuf.name, "Untitled" as string)}
          onNameSave={this.handleNameSave}
        />
      </div>
    );
  }
}

type ScreenDimsProps = {
  dims: {
    width: number;
    height: number;
  };
  Toolbar: toolbar.PropsFromDispatch;
};

type ScreenDimsEditProps = {
  stopEditing: () => void;
};

function ScreenDimsEdit(props: ScreenDimsProps & ScreenDimsEditProps) {
  const { width, height } = props.dims;
  const [dimsText, setDimsText] = useState(`${width}x${height}`);

  const handleBlur = useCallback(() => {
    props.stopEditing();
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      props.stopEditing();
      const numsRe = /^([0-9]+)x([0-9]+)/;
      const matches = numsRe.exec(dimsText);
      if (matches) {
        const width = Math.max(1, Math.min(1024, parseInt(matches[1])));
        const height = Math.max(1, Math.min(1024, parseInt(matches[2])));
        props.Toolbar.setNewScreenSize({ width, height });
      }
    },
    [dimsText]
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDimsText(e.target.value);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        props.stopEditing();
      }
    },
    []
  );

  const handleFocus = useCallback((e: React.FormEvent<HTMLInputElement>) => {
    let target = e.target as HTMLInputElement;
    props.Toolbar.setShortcutsActive(false);
    target.select();
  }, []);

  return (
    <div className={styles.tabNameEditor}>
      <form onSubmit={handleSubmit}>
        <input
          autoFocus
          type="text"
          pattern="[0-9]+x[0-9]+"
          title="Specify screen width x height (e.g., 40x25)"
          value={dimsText}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={handleFocus}
          onChange={handleChange}
        />
      </form>
    </div>
  );
}

function ScreenDims(props: ScreenDimsProps) {
  const [editing, setEditing] = useState(false);
  const stopEditing = useCallback(() => {
    setEditing(false);
    props.Toolbar.setShortcutsActive(true);
  }, []);
  return (
    <div className={styles.screenDimContainer} onClick={() => setEditing(true)}>
      {editing ? (
        <ScreenDimsEdit {...props} stopEditing={stopEditing} />
      ) : (
        <div className={styles.screenDimText}>
          {props.dims.width}x{props.dims.height}
        </div>
      )}
    </div>
  );
}

function NewTabButton(props: {
  dims: { width: number; height: number };
  onClick: () => void;
  onClickX1: () => void;
  onClickX2: () => void;

  Toolbar: toolbar.PropsFromDispatch;
}) {
  const typingWorkaround = { onClick: props.onClick };

  return (
    <div
      style={{
        border: "1px solid var(--border-color)",
        margin: "0px",
        marginRight: "4px",
        textAlign: "center",
        padding: "4px",
        cursor: "pointer",
        color: "var(--toolbar-icon-color, #bdbdbd)",
        height: "94px",
        boxSizing: "border-box",
      }}
    >
      <FontAwesomeIcon {...typingWorkaround} icon={faPlus} size="2x" />
      <ScreenDims dims={props.dims} Toolbar={props.Toolbar} />
      <div style={{ marginTop: "4px", padding: "2px", display: "flex", justifyContent: "center" }}>
        <div
          onClick={props.onClickX1}
          style={{
            marginRight: "4px",
            marginTop: "4px",
            padding: "2px 4px",
            border: "1px solid var(--accent-border-color)",
            borderRadius: "2px",
            fontSize: "10px",
            cursor: "pointer",
          }}
        >
          x1
        </div>
        <div
          onClick={props.onClickX2}
          style={{
            marginRight: "4px",
            marginTop: "4px",
            padding: "2px 4px",
            border: "1px solid var(--accent-border-color)",
            borderRadius: "2px",
            fontSize: "10px",
            cursor: "pointer",
          }}
        >
          x2
        </div>
      </div>
    </div>
  );
}

interface FramebufferTabsDispatch {
  Screens: screens.PropsFromDispatch;
  Toolbar: toolbar.PropsFromDispatch;
}

interface FramebufferTabsProps {
  screens: number[];
  activeScreen: number;
  colorPalette: Rgb[];
  vic20colorPalette: Rgb[];
  petcolorPalette: Rgb[];
  tedcolorPalette: Rgb[];
  newScreenSize: { width: number; height: number };

  getFramebufByIndex: (framebufId: number) => Framebuf | null;
  getFont: (framebuf: Framebuf) => { charset: string; font: Font };
  setFramebufName: (name: string, framebufIndex: number) => void;
}

class FramebufferTabs_ extends Component<
  FramebufferTabsProps & FramebufferTabsDispatch
> {
  dragFromIndex: number | null = null;
  handleActiveClick = (idx: number) => {
    // Switch foreground colour group BEFORE the screen change so that
    // tool panels (Lines, Boxes, etc.) render with the correct palette
    // and colour in a single frame.
    const currentFbId = this.props.screens[this.props.activeScreen];
    const newFbId = this.props.screens[idx];
    const currentFb = this.props.getFramebufByIndex(currentFbId);
    const newFb = this.props.getFramebufByIndex(newFbId);
    if (currentFb && newFb) {
      const curGroup = getColorGroup(currentFb.charset, currentFb.width);
      const newGroup = getColorGroup(newFb.charset, newFb.width);
      if (curGroup !== newGroup) {
        this.props.Toolbar.switchForegroundGroup(curGroup, newGroup);
        if (newGroup === 'pet') {
          this.props.Toolbar.setBoxForceForeground(true);
          this.props.Toolbar.setTextureForceForeground(true);
        }
      }
    }
    this.props.Screens.setCurrentScreenIndex(idx);
  };

  handleNewTab = () => {
    this.props.Screens.newScreen();
    // Context menu eats the ctrl key up event, so force it to false
    this.props.Toolbar.setCtrlKey(false);
  };
  handleAllFramesX1 = () => {
    const currentScreen = this.props.activeScreen;
    this.props.screens.forEach((framebufId) => {
      this.props.Screens.setCurrentScreenIndex(framebufId);
      this.props.Toolbar.setZoom(101, "left");
    });
    this.props.Screens.setCurrentScreenIndex(currentScreen);
  };

  handleAllFramesX2 = () => {
    const currentScreen = this.props.activeScreen;
    this.props.screens.forEach((framebufId) => {
      this.props.Screens.setCurrentScreenIndex(framebufId);
      this.props.Toolbar.setZoom(102, "left");
    });
    this.props.Screens.setCurrentScreenIndex(currentScreen);
  };

  handleRemoveTab = (idx: number) => {
    this.props.Screens.removeScreen(idx);
    // Context menu eats the ctrl key up event, so force it to false
    this.props.Toolbar.setCtrlKey(false);
  };

  handleDuplicateTab = (idx: number) => {
    this.props.Screens.cloneScreen(idx);
    // Context menu eats the ctrl key up event, so force it to false
    this.props.Toolbar.setCtrlKey(false);
  };

  handleCopyTab = (idx: number) => {


    const frameId = this.props.screens[idx];
    const copyFrame = this.props.getFramebufByIndex(frameId);

    console.log("copyFrame",copyFrame)

    if (copyFrame !== null) {
      const { font } = this.props.getFont(copyFrame);
      const copyFrameWithFont: FramebufWithFont = {
        ...copyFrame,
        font,
      };


     // console.log(copyFrameWithFont,copyFrame);


      const JSONData = getJSON(copyFrameWithFont, {});

//      console.log(JSONData);

      electron.clipboard.writeBuffer(
        "petmate/framebuffer",
        Buffer.from(JSONData, "utf-8")
      );
    }
    // Context menu eats the ctrl key up event, so force it to false
    this.props.Toolbar.setCtrlKey(false);
  };

  handleCopyPNGTab = (idx: number) => {
    const frameId = this.props.screens[idx];
    const copyFrame = this.props.getFramebufByIndex(frameId);

    if (copyFrame !== null) {
      const { font } = this.props.getFont(copyFrame);
      const copyFrameWithFont: FramebufWithFont = {
        ...copyFrame,
        font,
      };



      electron.clipboard.writeBuffer(
        "image/png",
        Buffer.from(getPNG(copyFrameWithFont, this.props.colorPalette),"base64")
      );



    }
    // Context menu eats the ctrl key up event, so force it to false
    this.props.Toolbar.setCtrlKey(false);
  };

  handlePasteTab = (idx: number) => {
    const frameId = this.props.screens[idx];

    if (electron.clipboard.has("petmate/framebuffer")) {
      const pastedFrameBuffer = JSON.parse(
        Buffer.from(
          electron.clipboard.readBuffer("petmate/framebuffer")
        ).toString()
      ).framebufs;

      this.props.Screens.addScreenPlusFramebuf(frameId, pastedFrameBuffer);
    }

    // Context menu eats the ctrl key up event, so force it to false
    this.props.Toolbar.setCtrlKey(false);
  };


  handleTabDragStart = (idx: number, e: React.DragEvent<HTMLDivElement>) => {
    e.stopPropagation();
    this.dragFromIndex = idx;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `${idx}`);
  };

  handleTabDragOver = (idx: number, e: React.DragEvent<HTMLDivElement>) => {
    if (this.dragFromIndex === null || this.dragFromIndex === idx) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
  };

  handleTabDrop = (idx: number, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const fromIdx = this.dragFromIndex;
    this.dragFromIndex = null;
    if (fromIdx === null || fromIdx === idx) return;
    this.props.Screens.setScreenOrder(arrayMove(this.props.screens, fromIdx, idx));
  };

  handleTabDragEnd = () => {
    this.dragFromIndex = null;
  };

  render() {



    const lis = this.props.screens.map((framebufId, i) => {



      const framebuf = this.props.getFramebufByIndex(framebufId)!;
      const { font } = this.props.getFont(framebuf);

      var currentColourPalette = this.props.colorPalette;



      switch(framebuf.charset.substring(0,3))
      {
        case "c16":
          currentColourPalette = this.props.tedcolorPalette;
        break;
        case "vic":
          currentColourPalette = this.props.vic20colorPalette;
        break;
        case "pet":
          currentColourPalette = this.props.petcolorPalette;
        break;
        case "c12":
          if (resolveColumnMode(framebuf) === 80) currentColourPalette = vdcPalette;
        break;
      }




      return (
        <FramebufTab
          key={framebufId}
          id={i}
          framebufId={framebufId}
          onSetActiveTab={this.handleActiveClick}
          onRemoveTab={this.handleRemoveTab}
          onDuplicateTab={this.handleDuplicateTab}
          onCopyTab={this.handleCopyTab}
          onCopyPNGTab={this.handleCopyPNGTab}
          onPasteTab={this.handlePasteTab}
          framebuf={framebuf}
          active={i === this.props.activeScreen}
          font={font}
          colorPalette={currentColourPalette}
          setName={this.props.setFramebufName}
          draggable={true}
          onDragStartTab={(e) => this.handleTabDragStart(i, e)}
          onDragOverTab={(e) => this.handleTabDragOver(i, e)}
          onDropTab={(e) => this.handleTabDrop(i, e)}
          onDragEndTab={this.handleTabDragEnd}
        />
      );
    });
    return (
      <div style={{ width: "calc(100% - 318px)", display: "flex", position: "relative", zIndex: 1 }}>
        <NewTabButton
          dims={this.props.newScreenSize}
          Toolbar={this.props.Toolbar}
          onClick={this.handleNewTab}
          onClickX1={this.handleAllFramesX1}
          onClickX2={this.handleAllFramesX2}
        />

        <div
          className={styles.tabHeadings}
          onWheel={(e) => {
            // Translate vertical wheel delta into horizontal scroll so the
            // user can scroll the tab bar with a regular mouse wheel while
            // hovering over it. Only hijack the event when there is actually
            // overflow to scroll, otherwise let the page scroll normally.
            const el = e.currentTarget as HTMLDivElement;
            if (el.scrollWidth <= el.clientWidth) return;
            // deltaX overrides deltaY if the device provides a horizontal
            // component (e.g. shift+wheel on some platforms, trackpads).
            const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
            if (delta === 0) return;
            el.scrollLeft += delta;
            e.preventDefault();
          }}
        >
          <div className={styles.tabs}>
            {lis}
            <div className="tab">&nbsp;</div>
          </div>
        </div>
      </div>
    );
  }
}

export default connect(
  (state: RootState) => {
    return {
      newScreenSize: state.toolbar.newScreenSize,
      activeScreen: screensSelectors.getCurrentScreenIndex(state),
      screens: screensSelectors.getScreens(state),
      getFramebufByIndex: (idx: number) =>
        selectors.getFramebufByIndex(state, idx),
      getFont: (fb: Framebuf) => selectors.getFramebufFont(state, fb),
      colorPalette: getSettingsCurrentColorPalette(state),
      vic20colorPalette: getSettingsCurrentVic20ColorPalette(state),
      petcolorPalette: getSettingsCurrentPetColorPalette(state),
      tedcolorPalette: getSettingsCurrentTedColorPalette(state),
    };
  },
  (dispatch) => {
    return {
      Toolbar: toolbar.Toolbar.bindDispatch(dispatch),
      Screens: bindActionCreators(screens.actions, dispatch),
      setFramebufName: bindActionCreators(framebuf.actions.setName, dispatch),
    };
  }
)(FramebufferTabs_);
