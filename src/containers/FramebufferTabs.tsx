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
  SortableContainer,
  SortableElement,
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
import { getSettingsCurrentColorPalette } from "../redux/settingsSelectors";

import * as utils from "../utils";
import * as fp from "../utils/fp";

import {
  faPlus,
  faAlignLeft,
  faAlignCenter,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import styles from "./FramebufferTabs.module.css";
import {
  Framebuf,
  FramebufWithFont,
  Rgb,
  Font,
  RootState,
  RgbPalette,
} from "../redux/types";
import { electron } from "../utils/electronImports";
import { getJSON, getPNG } from "../utils/exporters";
import { CustomFonts } from "../redux/customFonts";
import {
  ActionsUnion,
  createAction,
  DispatchPropsFromActions,
} from "../redux/typeUtils";
import { framebufFromJson } from "../redux/workspace";

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
    if (e.key === "Escape") {
      e.preventDefault();
      this.props.onCancel();
      this.props.Toolbar.setShortcutsActive(true);
    }
  };

  handleBlur = (_e: React.FormEvent<HTMLInputElement>) => {
    this.props.onBlur();
    this.props.Toolbar.setShortcutsActive(true);
  };

  handleFocus = (e: React.FormEvent<HTMLInputElement>) => {
    let target = e.target as HTMLInputElement;
    this.props.Toolbar.setShortcutsActive(false);
    target.select();
  };

  render() {
    return (
      <div className={styles.tabNameEditor}>
        <form onSubmit={this.handleSubmit}>
          <input
            autoFocus
            onKeyDown={this.handleKeyDown}
            value={this.state.name}
            onChange={this.handleChange}
            onBlur={this.handleBlur}
            onFocus={this.handleFocus}
            type="text"
            size={14}
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

function computeContainerSize(fb: Framebuf) {
  const pixWidth = fb.width * 8;
  const pixHeight = fb.height * 8;
  // TODO if height is bigger than maxHeight, need to scale differently
  // to fit the box.

  let s;
  if (pixHeight > 200) {
    s = 120 / pixWidth;
  } else {
    s = 75 / pixHeight;
  }

  if (pixWidth > 320) {
    s = 75 / pixHeight;
  }

  if (pixHeight == pixWidth) {
    s = 120 / pixWidth;
  }
  return {
    divWidth: "120px",
    divHeight: "75px",
    scaleX: s,
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
    //const maxHeight = 25*2*1.5;
    const { scaleX, scaleY } = computeContainerSize(this.props.framebuf);
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
     /* {
        label: "Duplicate",
        click: this.handleMenuDuplicate,
      },
*/      {
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

const SortableFramebufTab = SortableElement((props: FramebufTabProps) => (
  <FramebufTab {...props} />
));

const SortableTabList = SortableContainer((props: { children: any }) => {
  return <div className={styles.tabs}>{props.children}</div>;
});

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
  onClickLeft: () => void;
  onClickCenter: () => void;

  Toolbar: toolbar.PropsFromDispatch;
}) {
  // onClick is not in FontAwesomeIcon props and don't know how to pass
  // it otherwise.
  const typingWorkaround = { onClick: props.onClick };
  const onClickL = { onClick: props.onClickLeft };
  const onClickC = { onClick: props.onClickCenter };

  return (
    <div
      style={{
        border: "1px solid #333",
        margin: "0px",
        marginRight: "8px",
        textAlign: "center",
        padding: "16px",
        cursor: "pointer",
        color: "#bdbdbd",
        width: "50px",
      }}
    >
      <FontAwesomeIcon {...typingWorkaround} icon={faPlus} size="2x" />
      <ScreenDims dims={props.dims} Toolbar={props.Toolbar} />
      <div style={{ marginTop: "4px", padding: "2px", display: "flex" }}>
        <FontAwesomeIcon
          {...onClickL}
          style={{
            marginRight: "8px",
            marginTop: "4px",
            padding: "2px",
            border: "1px solid #666",
            borderRadius: "2px",
          }}
          icon={faAlignLeft}
          size="1x"
        />
        <FontAwesomeIcon
          {...onClickC}
          style={{
            marginLeft: "0px",
            marginTop: "4px",
            padding: "2px",
            border: "1px solid #666",
            borderRadius: "2px",
          }}
          icon={faAlignCenter}
          size="1x"
        />
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
  newScreenSize: { width: number; height: number };

  getFramebufByIndex: (framebufId: number) => Framebuf | null;
  getFont: (framebuf: Framebuf) => { charset: string; font: Font };
  setFramebufName: (name: string, framebufIndex: number) => void;
}

class FramebufferTabs_ extends Component<
  FramebufferTabsProps & FramebufferTabsDispatch
> {
  handleActiveClick = (idx: number) => {
    this.props.Screens.setCurrentScreenIndex(idx);
  };

  handleNewTab = () => {
    this.props.Screens.newScreen();
    // Context menu eats the ctrl key up event, so force it to false
    this.props.Toolbar.setCtrlKey(false);
  };
  handleAllFramesLeft = () => {
    const currentScreen = this.props.activeScreen;

    const lis = this.props.screens.map((framebufId, i) => {
      //const framebuf = this.props.getFramebufByIndex(framebufId)!
      this.props.Screens.setCurrentScreenIndex(framebufId);
      this.props.Toolbar.setZoom(101, "left");
    });
    this.props.Screens.setCurrentScreenIndex(currentScreen);
  };
  handleAllFramesCenter = () => {
    const currentScreen = this.props.activeScreen;

    const lis = this.props.screens.map((framebufId, i) => {
      const framebuf = this.props.getFramebufByIndex(framebufId)!;
      this.props.Screens.setCurrentScreenIndex(framebufId);
      this.props.Toolbar.setZoom(101, "center");
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

    if (copyFrame != null) {
      const { font } = this.props.getFont(copyFrame);
      const copyFrameWithFont: FramebufWithFont = {
        ...copyFrame,
        font,
      };


     // console.log(copyFrameWithFont,copyFrame);


      const JSONData = getJSON(copyFrameWithFont, {});

      console.log(JSONData);

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

    if (copyFrame != null) {
      const { font } = this.props.getFont(copyFrame);
      const copyFrameWithFont: FramebufWithFont = {
        ...copyFrame,
        font,
      };

      console.log('b4 electron.clipboard.availableFormats():',electron.clipboard.availableFormats());

      electron.clipboard.writeBuffer(
        "image/png",
        Buffer.from(getPNG(copyFrameWithFont, this.props.colorPalette),"base64")
      );

      console.log('After electron.clipboard.availableFormats():',electron.clipboard.availableFormats());

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
      console.log("handlePasteTab", idx, frameId, pastedFrameBuffer.name);
      this.props.Screens.addScreenPlusFramebuf(frameId, pastedFrameBuffer);
    }

    // Context menu eats the ctrl key up event, so force it to false
    this.props.Toolbar.setCtrlKey(false);
  };

  onSortEnd = (args: { oldIndex: number; newIndex: number }) => {
    this.props.Screens.setScreenOrder(
      arrayMove(this.props.screens, args.oldIndex, args.newIndex)
    );
  };

  render() {
    const lis = this.props.screens.map((framebufId, i) => {
      const framebuf = this.props.getFramebufByIndex(framebufId)!;
      const { font } = this.props.getFont(framebuf);
      return (
        <SortableFramebufTab
          key={framebufId}
          index={i}
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
          colorPalette={this.props.colorPalette}
          setName={this.props.setFramebufName}
        />
      );
    });
    return (
      <div style={{ width: "100%", display: "flex" }}>
        <NewTabButton
          dims={this.props.newScreenSize}
          Toolbar={this.props.Toolbar}
          onClick={this.handleNewTab}
          onClickLeft={this.handleAllFramesLeft}
          onClickCenter={this.handleAllFramesCenter}
        />

        <div className={styles.tabHeadings}>
          <SortableTabList
            distance={5}
            axis="x"
            lockAxis="x"
            onSortEnd={this.onSortEnd}
          >
            {lis}
            <div className="tab">&nbsp;</div>
          </SortableTabList>
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
