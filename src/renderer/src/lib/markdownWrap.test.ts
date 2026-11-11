import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdownWrap } from './markdownWrap'

let view: EditorView | null = null

// jsdom does not implement the text measuring CodeMirror uses when drawing.
beforeEach(() => {
  const rect = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] })
  Range.prototype.getBoundingClientRect = () => rect
})
afterEach(() => {
  view?.destroy()
  view = null
})

/** Simulates typed text going through the input handlers, as CodeMirror does. */
function type(v: EditorView, text: string): void {
  const { from, to } = v.state.selection.main
  const handled = v.state.facet(EditorView.inputHandler).some((h) => h(v, from, to, text, () => v.state.update({})))
  if (!handled) v.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } })
}

function make(doc: string, selection: EditorSelection): EditorView {
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection,
      extensions: [EditorState.allowMultipleSelections.of(true), markdownWrap]
    })
  })
  return view
}

describe('markdownWrap', () => {
  it('wraps the selection and keeps the inner text selected', () => {
    const v = make('the example here', EditorSelection.single(4, 11))
    type(v, '*')
    expect(v.state.doc.toString()).toBe('the *example* here')
    expect(v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to)).toBe('example')
  })

  it('repeating the character doubles it (bold)', () => {
    const v = make('hello', EditorSelection.single(0, 5))
    type(v, '_')
    type(v, '_')
    expect(v.state.doc.toString()).toBe('__hello__')
  })

  it('wraps each selection and accepts a backtick', () => {
    const v = make('a b', EditorSelection.create([EditorSelection.range(0, 1), EditorSelection.range(2, 3)]))
    type(v, '`')
    expect(v.state.doc.toString()).toBe('`a` `b`')
  })

  it('a backward selection keeps the direction', () => {
    const v = make('abc', EditorSelection.single(3, 0))
    type(v, '*')
    expect(v.state.doc.toString()).toBe('*abc*')
    const { anchor, head } = v.state.selection.main
    expect([anchor, head]).toEqual([4, 1])
  })

  it('with a mixed selection, the empty cursor gets the character and stays after it', () => {
    const v = make('ab cd', EditorSelection.create([EditorSelection.range(0, 2), EditorSelection.cursor(4)]))
    type(v, '*')
    expect(v.state.doc.toString()).toBe('*ab* c*d')
    const [a, b] = v.state.selection.ranges
    expect([a.from, a.to]).toEqual([1, 3])
    expect([b.from, b.to]).toEqual([7, 7])
  })

  it('without a selection or with another character, does nothing special', () => {
    const v = make('abc', EditorSelection.single(1))
    type(v, '*')
    expect(v.state.doc.toString()).toBe('a*bc')
    const w = make('abc', EditorSelection.single(0, 3))
    type(w, 'x')
    expect(w.state.doc.toString()).toBe('x')
  })
})
