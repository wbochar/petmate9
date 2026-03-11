// @flow
import React, { Component, FunctionComponent } from "react";

import { connect } from "react-redux";
import { Dispatch } from "redux";

import * as utils from "../utils";
import * as fp from "../utils/fp";

import {
  SortableContainer,
  SortableElement,
  arrayMove,
} from "../external/react-sortable-hoc";

import styles from "./ColorPicker.module.css";
import {
  Rgb,
  ColorSortMode,
} from "../redux/types";

import * as reduxToolbar from "../redux/toolbar";
import { getColorName, sortPaletteByLuma } from "../utils/palette";

interface PaletteIndexProps {
  color: number;
  colorPalette: Rgb[];
}

const ColorBlock: FunctionComponent<PaletteIndexProps & { hover: boolean }> = ({
  color,
  colorPalette,
  hover,
}) => {
  const bg = utils.colorIndexToCssRgb(colorPalette, color);
  const style = {
    backgroundColor: bg,
    width: "6px",
    height: "6px",
    marginRight: "2px",
  };
  const cls = hover ? styles.box : styles.boxNoHover;
  return <div style={style} className={cls} />;
};

const SortableItem = SortableElement(
  ({ color, colorPalette }: PaletteIndexProps) => (
    <ColorBlock color={color} hover={true} colorPalette={colorPalette} />
  )
);

const SortableList = SortableContainer(
  (props: { items: number[]; colorPalette: Rgb[] }) => {
    return (
      <div className={styles.container}>
        {props.items.map((value, index) => (
          <SortableItem
            key={`item-${index}`}
            index={index}
            color={value}
            colorPalette={props.colorPalette}
          />
        ))}
      </div>
    );
  }
);

interface SortableColorPaletteProps {
  colorPalette: Rgb[];
  palette: number[];
  setPalette: (remap: number[]) => void;
}

export class SortableColorPalette extends Component<SortableColorPaletteProps> {
  onSortEnd = (args: { oldIndex: number; newIndex: number }) => {
    const newArr = arrayMove(this.props.palette, args.oldIndex, args.newIndex);
    this.props.setPalette(newArr);
  };
  render() {
    return (
      <SortableList
        helperClass={styles.sortableHelper}
        axis="x"
        lockAxis="x"
        items={this.props.palette}
        colorPalette={this.props.colorPalette}
        onSortEnd={this.onSortEnd}
      />
    );
  }
}

export class ColorPalette extends Component<{ colorPalette: Rgb[], totalBlocks: null|number }> {
  render() {

    var blocks = 16

    if(this.props.totalBlocks!=null)
      blocks = this.props.totalBlocks


    const items = fp.mkArray(blocks, (i) => i);
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "row",
        }}
      >
        {items.map((value, idx) => {
          return (
            <ColorBlock
              key={idx}
              color={value}
              hover={true}
              colorPalette={this.props.colorPalette}
            />
          );
        })}
      </div>
    );
  }
}

interface ColorPickerProps {
  scale: { scaleX: number; scaleY: number };
  paletteRemap: number[];
  colorPalette: Rgb[];
  selected: number;
  twoRows: boolean;
  ctrlKey: boolean;
  onSelectColor: (idx: number) => void;
  Toolbar: reduxToolbar.PropsFromDispatch;
  dispatch: Dispatch;
  colorSortMode?: ColorSortMode;
  showColorNumbers?: boolean;
  charset?: string;
}

interface ColorPickerState {
  hoveredIdx: number | null;
}

export class ColorPicker extends Component<ColorPickerProps, ColorPickerState> {
  static defaultProps = {
    paletteRemap: fp.mkArray(16, (i) => i),
    twoRows: false,
    scale: { scaleX: 1, scaleY: 1 },
    colorSortMode: 'default' as ColorSortMode,
    showColorNumbers: false,
    charset: 'c64',
  };
  state: ColorPickerState = {
    hoveredIdx: null,
  };
  render() {
    const { scaleX, scaleY } = this.props.scale;
    const w = Math.floor(scaleX * 18 * 8);
    const h = Math.floor(scaleY * 4 * 8) + 2 * 2;
    const blockWidth = w / 8 - 4;
    const blockHeight = blockWidth;

    const sortMode = this.props.colorSortMode || 'default';
    const sortedRemap = sortPaletteByLuma(
      this.props.paletteRemap,
      this.props.colorPalette,
      sortMode
    );

    const showNumbers = this.props.showColorNumbers || false;
    const charset = this.props.charset || 'c64';

    // Compute font size based on chip size
    const fontSize = Math.max(7, Math.floor(blockWidth * 0.45));
    // Determine if text should be light or dark based on color luminance
    const getTextColor = (c: Rgb) => {
      const lum = (c.r + c.r + c.b + c.g + c.g + c.g) / (6 * 255);
      return lum > 0.4 ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)';
    };

    const colors = sortedRemap.map((idx) => {
      const c = this.props.colorPalette[idx];
      const bg = utils.rgbToCssRgb(c);
      const colorName = getColorName(idx, charset);
      const tooltip = `${idx}: ${colorName}`;
      const style: React.CSSProperties = {
        backgroundColor: bg,
        width: `${blockWidth}px`,
        height: `${blockHeight}px`,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      };
      const cls = this.props.selected === idx ? styles.boxSelected : styles.box;
      const isHovered = this.state.hoveredIdx === idx;
      return (
        <div
          key={idx}
          onMouseEnter={() => this.setState({ hoveredIdx: idx })}
          onMouseLeave={() => this.setState({ hoveredIdx: null })}
          onClick={() => {
            if (this.props.ctrlKey) {
              const srcColor = this.props.selected;
              const destColor = idx;
              const colors = { srcColor, destColor };
              this.props.Toolbar.swapColors(colors);
            }
            this.props.onSelectColor(idx);
          }}
          style={style}
          className={cls}
        >
          {showNumbers && (
            <span
              style={{
                fontSize: `${fontSize}px`,
                fontWeight: 'bold',
                color: getTextColor(c),
                pointerEvents: 'none',
                userSelect: 'none',
                lineHeight: 1,
              }}
            >
              {idx}
            </span>
          )}
          {isHovered && (
            <div
              style={{
                position: 'absolute',
                bottom: `${blockHeight + 6}px`,
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: 'rgba(0,0,0,0.85)',
                color: '#fff',
                padding: '2px 6px',
                borderRadius: '3px',
                fontSize: '11px',
                whiteSpace: 'nowrap',
                zIndex: 100,
                pointerEvents: 'none',
              }}
            >
              {tooltip}
            </div>
          )}
        </div>
      );
    });
    let doubleRowsStyle = {};
    if (this.props.twoRows) {
      doubleRowsStyle = {
        width: `${w}px`,
        height: `${h}px`,
        flexWrap: "wrap",
      };
    }
    return (
      <div className={styles.container} style={doubleRowsStyle}>
        {colors}
      </div>
    );
  }
}
export default connect(null, (dispatch) => {
  return {
    Toolbar: reduxToolbar.Toolbar.bindDispatch(dispatch),
    dispatch,
  };
})(ColorPicker);
