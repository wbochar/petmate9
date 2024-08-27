
// @flow
import React, { PureComponent } from 'react';

class CustomFontSelect extends React.Component<{
  customFonts: {id: string, name: string}[],
  current: string,
  setCharset: (name: string) => void
}> {

  handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.preventDefault();
    this.props.setCharset(e.target.value);
  }

  render () {
    const charsets = [
      {
        id: 'upper',
        name: 'C64 Upper'
      },
      {
        id: 'lower',
        name: 'C64 Lower'
      },
      {
        id: 'dirart',
        name: 'DirArt'
      },
      {
        id: 'cbaseUpper',
        name: 'Cbase Upper'
      },
      {
        id: 'cbaseLower',
        name: 'Cbase Lower'
      },
      {
        id: 'c64SEUpper',
        name: 'C64 Upper SE'
      },
      {
        id: 'c64SELower',
        name: 'C64 Lower SE'
      },
      {
        id: 'c128Upper',
        name: 'C128 Upper'
      },
      {
        id: 'c128Lower',
        name: 'C128 Lower'
      },
      {
        id: 'petGfx',
        name: 'Pet GFX'
      },
      {
        id: 'petBiz',
        name: 'Pet Business'
      },
      {
        id: 'c16Upper',
        name: 'C16 Upper'
      },
      {
        id: 'c16Lower',
        name: 'C16 Lower'
      },
      {
        id: 'vic20Upper',
        name: 'Vic20 Upper'
      },
      {
        id: 'vic20Lower',
        name: 'Vic20 Lower'
      },


    ].concat(this.props.customFonts);
    const options = charsets.map(cf => {
      let displayName = cf.name;
      return (
        <option
          key={cf.id}
          value={cf.id}
        >
          {displayName}
        </option>
      );
    })
    return (
      <div style={{marginLeft: '5px'}}>
        <select tabIndex={-1} style={{
          borderStyle: 'solid',
          borderWidth: '0px',
          borderColor: 'rgba(255,255,255, 0.0)'
        }}
          value={this.props.current}
          onChange={this.handleSelectChange}
        >
          {options}
        </select>
      </div>
    )
  }
}

interface FontSelectorProps {
  currentCharset: string;
  setCharset: (c: string) => void;
  customFonts: { id: string, name: string}[];
}

export default class FontSelector extends PureComponent<FontSelectorProps> {
  render () {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        fontSize: '0.8em',
        color: 'rgb(120,120,120)'
      }}>
        <div></div>
        <CustomFontSelect
          customFonts={this.props.customFonts}
          current={this.props.currentCharset}
          setCharset={this.props.setCharset}
        />
      </div>
    )
  }
}
