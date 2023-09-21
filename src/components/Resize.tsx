// @flow
import React, { Component, FunctionComponent} from 'react';
import * as toolbar from '../redux/toolbar'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux'

import styles from './Resize.module.css';



interface ResizeInputDispatchProps {
  Toolbar: toolbar.PropsFromDispatch;
}

interface ResizeInputProps {
  value: number;
	name: string;

  onSubmit: (value: number, name: string) => void;
  onCancel: () => void;
  onBlur: () => void;
}

interface ResizeInputState {
  value: number;
	name: string;
}

// This class is a bit funky with how it disables/enables keyboard shortcuts
// globally for the app while the input element has focus.  Maybe there'd be a
// better way to do this, but this seems to work.
class ResizeInput_ extends Component<ResizeInputProps & ResizeInputDispatchProps, ResizeInputState> {
  state = {
    value: 1,
		name: '',
  }

  componentWillUnmount () {
    this.props.Toolbar.setShortcutsActive(true)
  }

  handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    this.props.onSubmit(this.state.value,this.state.name)
    this.props.Toolbar.setShortcutsActive(true)
  }

  handleChange = (e: React.FormEvent<EventTarget>) => {
    let target = e.target as HTMLInputElement;
    this.setState({ value: Number(target.value) })
  }

  handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      this.props.onCancel()
      this.props.Toolbar.setShortcutsActive(true)
    }
  }

  handleBlur = (_e: React.FormEvent<HTMLInputElement>) => {
    this.props.onBlur()
    this.props.Toolbar.setShortcutsActive(true)
  }

  handleFocus = (e: React.FormEvent<HTMLInputElement>) => {
    let target = e.target as HTMLInputElement;
    this.props.Toolbar.setShortcutsActive(false)
    target.select()
  }

  render () {
    return (
      <div className={styles.tabTextEditor}>
        <form onSubmit={this.handleSubmit}>
          <input
            autoFocus
            name={this.state.name}
            onKeyDown={this.handleKeyDown}
            value={this.state.value}
            onChange={this.handleChange}
            onBlur={this.handleBlur}
            onFocus={this.handleFocus}
            type='number'
            size={2} />
        </form>
      </div>
    )
  }
}

const ResizeInput = connect(
  null,
  (dispatch) => {
    return {
      Toolbar: bindActionCreators(toolbar.Toolbar.actions, dispatch)
    }
  }
)(ResizeInput_)



interface TextEditorProps {
  value: number;
	name: string;


  onValueSave: (value: number, name: string) => void;
}

interface TextEditorState {
  editing: boolean;
}

class TextEditor extends Component<TextEditorProps, TextEditorState> {
  state = {
    editing: false
  }

  handleEditingClick = () => {
    this.setState({ editing: true })
  }

  handleBlur = () => {
    this.setState({ editing: false})
  }

  handleSubmit = (value: number, name: string) => {
    this.setState({ editing: false})
    this.props.onValueSave(value,name)
  }

  handleCancel = () => {
    this.setState({ editing: false})
  }

  render () {
    const valueElts = this.state.editing ?
      <ResizeInput
				name={this.props.name}
        value={this.props.value}
        onSubmit={this.handleSubmit}
        onBlur={this.handleBlur}
        onCancel={this.handleCancel}
      /> :
      <div className={styles.tabName} onClick={this.handleEditingClick}>
        {this.props.value}
      </div>
    return (
      <div className={styles.tabNameContainer}>
        {valueElts}
      </div>
    )
  }
}









interface CompassBlockProps {
  direction: string,
  text: string,
	selected: boolean,
}

const CompassBlock: FunctionComponent<CompassBlockProps & {hover:boolean}> = ({ direction, text, selected, hover }) => {

	let blockText = ""

	if(selected)
	{
		blockText=text
	}
	else
	{
		blockText=direction
	}

	const style = {

    backgroundColor: '#666',

    height: '25px',
		paddingTop:'2px',
    margin: '1px',
		flex: "0 1 25%",

  } as React.CSSProperties;
  const cls = hover ? styles.box : styles.boxNoHover
  return (
    <div style={style} className={cls}>{blockText}</div>
  )
}



interface ResizeProps {

	direction: string,
	resizeWidth: number,
	resizeHeight: number,
}

export default class Resize extends Component<ResizeProps> {
  static defaultProps = {
		direction: "c",
		width: 0,
		height: 0,
		resizeWidth: 0,
		resizeHeight:0,

  }
	resizeStyle = {
		width:"280px",
		border: "2px solid #333",
		margin:"0px",
		padding:"0px",
		marginTop:"10px",

	} as React.CSSProperties;


  handleValueSave = (value: number, name: string) => {
    if (value !== 0) {
			 if(name=="width")
				{
					console.log(name,value);

				}
				if(name=="height")
				{
					console.log(name,value);
				}
    }
  }
  render() {

		const width = this.props.resizeWidth;
		const height = this.props.resizeHeight;


		return (
      <div
        className={styles.container}
        style={this.resizeStyle}
      >
				<div className={styles.inputContainer}>
					Width: <TextEditor name="resizeWidth" value={width} onValueSave={this.handleValueSave}/>
					Height: <TextEditor name="resizeHeight" value={height} onValueSave={this.handleValueSave}/>
				</div>
				<div className={styles.compass}>
				<CompassBlock direction="NW" text="*" selected={false}  hover={true} />
				<CompassBlock direction="N" text="*" selected={false}  hover={true} />
				<CompassBlock direction="NE" text="*" selected={false}  hover={true} />
				<CompassBlock direction="W" text="*" selected={false}  hover={true} />
				<CompassBlock direction="C" text="*" selected={false}  hover={true} />
				<CompassBlock direction="E" text="*" selected={false}  hover={true} />
				<CompassBlock direction="SW" text="*" selected={false}  hover={true} />
				<CompassBlock direction="S" text="*" selected={false}  hover={true} />
				<CompassBlock direction="SE" text="*" selected={false}  hover={true} />


				</div>

	    </div>

    );
  }
}