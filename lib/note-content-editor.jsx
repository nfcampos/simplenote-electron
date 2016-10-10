import React, { PropTypes } from 'react';
import {
	ContentState,
	Editor,
	EditorState,
	Modifier,
} from 'draft-js';
import { invoke, noop } from 'lodash';

function plainTextContent( editorState ) {
	return editorState.getCurrentContent().getPlainText( '\n' )
}

// contains methods that mirror the methods on Modifier with 2 differences:
// 1. operate on EditorState instances
// 2. move selection to the natural place following the modification
const EditorStateModifier = {
	insertText( editorState, selection, characters ) {
		// this function assumes selection is collapsed

		const afterInsert = EditorState.push(
			editorState,
			Modifier.insertText(
				editorState.getCurrentContent(), selection, characters
			),
			'insert-characters'
		);

		const prevSelection = editorState.getSelection();
		const prevOffset = prevSelection.getStartOffset();
		const offsetDiff = characters.length;

		// move selection forward by nr of chars that were added
		const nextSelection = prevSelection.merge( {
			anchorOffset: prevOffset + offsetDiff,
			focusOffset: prevOffset + offsetDiff,
		} )

		return EditorState.forceSelection( afterInsert, nextSelection );
	},

	removeRange( editorState, selection = editorState.getSelection() ) {
		// this function assumes startKey and endKey are the same
		// ie. selection doesn't span more than one block

		const afterRemove = EditorState.push(
			editorState,
			Modifier.removeRange( editorState.getCurrentContent(), selection ),
			'remove-range'
		);

		const prevSelection = editorState.getSelection();
		const prevOffset = prevSelection.getStartOffset();
		const offsetDiff = selection.getEndOffset() - selection.getStartOffset();

		// move selection backward by nr of chars that were removed
		const nextSelection = prevSelection.merge( {
			anchorOffset: prevOffset - offsetDiff,
			focusOffset: prevOffset - offsetDiff,
		} )

		return EditorState.forceSelection( afterRemove, nextSelection );
	},
}

export default class NoteContentEditor extends React.Component {
	static propTypes = {
		content: PropTypes.string.isRequired,
		onChangeContent: PropTypes.func.isRequired
	}

	state = {
		editorState: EditorState.createWithContent(
			ContentState.createFromText( this.props.content, '\n' )
		)
	}

	saveEditorRef = ( ref ) => {
		this.editor = ref
	}

	handleEditorStateChange = ( editorState ) => {
		const nextContent = plainTextContent( editorState );
		const prevContent = plainTextContent( this.state.editorState );

		const announceChanges = nextContent !== prevContent
			? () => this.props.onChangeContent( nextContent )
			: noop;

		this.setState( { editorState }, announceChanges );
	}

	componentWillReceiveProps( { content: newContent } ) {
		const { content: oldContent } = this.props;
		const { editorState: oldEditorState } = this.state;

		if ( newContent === oldContent ) {
			return; // identical to previous `content` prop
		}

		if ( newContent === plainTextContent( oldEditorState ) ) {
			return; // identical to rendered content
		}

		let newEditorState = EditorState.createWithContent(
			ContentState.createFromText( newContent, '\n' )
		)

		// avoids weird caret position if content is changed
		// while the editor had focus, see
		// https://github.com/facebook/draft-js/issues/410#issuecomment-223408160
		if ( oldEditorState.getSelection().getHasFocus() ) {
			newEditorState = EditorState.moveFocusToEnd( newEditorState )
		}

		this.setState( { editorState: newEditorState } );
	}

	focus = () => {
		invoke( this, 'editor.focus' );
	}

	onTab = ( e ) => {
		// prevent moving focus to next input
		e.preventDefault()

		const editorState = this.state.editorState;
		const selection = editorState.getSelection();

		if ( ! selection.isCollapsed() ) {
			return
		}

		const content = editorState.getCurrentContent();
		const selectionStart = selection.getStartOffset();
		const block = content.getBlockForKey( selection.getFocusKey() );
		const line = block.getText();

		const atStart = line.trim() === '-' || line.trim() === '*';

		if ( ! e.shiftKey ) {
			// inserting a tab character

			const offset = atStart ? 0 : selectionStart

			const newEditorState = EditorStateModifier.insertText(
				editorState,
				selection.merge( { anchorOffset: offset, focusOffset: offset } ),
				'\t'
			);

			this.handleEditorStateChange( newEditorState );
		} else {
			// outdenting

			const rangeStart = atStart ? 0 : selectionStart - 1;
			const rangeEnd = atStart ? 1 : selectionStart;
			const prevChar = block.getText().slice( rangeStart, rangeEnd );

			if ( prevChar === '\t' ) {
				const newEditorState = EditorStateModifier.removeRange(
					editorState,
					selection.merge( { anchorOffset: rangeStart, focusOffset: rangeEnd } )
				);

				this.handleEditorStateChange( newEditorState );
			}
		}
	}

	render() {
		return (
			<Editor
				ref={this.saveEditorRef}
				spellCheck
				stripPastedStyles
				onChange={this.handleEditorStateChange}
				editorState={this.state.editorState}
				onTab={this.onTab}
			/>
		);
	}
}
