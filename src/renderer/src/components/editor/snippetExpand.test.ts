import { afterEach, describe, expect, it } from 'vitest'
import { nextSnippetField } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { lspTabId } from './lspHost'
import { choiceAt, snippetChoices } from './snippetChoices'
import { expandSnippet } from './snippetExpand'
import { bindSnippetHost } from './snippetHost'

bindSnippetHost({
  languageId: () => 'typescript',
  filePath: () => '/repo/src/util.ts',
  root: () => '/repo',
  snippetsFor: () => [],
  settings: () => ({
    'editor.snippetSuggestions': 'inline',
    'emmet.enabled': true,
    'emmet.triggerExpansionOnTab': true,
    'emmet.includeLanguages': {}
  })
})

let view: EditorView | null = null

afterEach(() => {
  view?.destroy()
  view = null
})

function viewWith(doc: string, cursor = doc.length): EditorView {
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [lspTabId.of('t'), snippetChoices, EditorState.allowMultipleSelections.of(true)]
    }),
    parent: document.body
  })
  return view
}

const selected = (v: EditorView): string => v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to)

describe('expandSnippet', () => {
  it('resolves variables with the tab context and selects the first field', async () => {
    const v = viewWith('x')
    await expandSnippet(v, '// $TM_FILENAME_BASE in $RELATIVE_FILEPATH: ${1:name}$0', 0, 1)
    expect(v.state.doc.toString()).toBe('// util in src/util.ts: name')
    expect(selected(v)).toBe('name')
  })

  it('TM_SELECTED_TEXT comes from the options (Insert Snippet with a selection)', async () => {
    const v = viewWith('abc')
    await expandSnippet(v, '[${TM_SELECTED_TEXT}]', 0, 3, { selectedText: 'abc' })
    expect(v.state.doc.toString()).toBe('[abc]')
  })

  it('indents the following lines by the line indent', async () => {
    const v = viewWith('  ')
    await expandSnippet(v, 'if (${1:x}) {\n\t$0\n}', 2, 2)
    expect(v.state.doc.toString()).toBe('  if (x) {\n    \n  }')
  })

  it('records the choices of each field and the active field one applies to the completion', async () => {
    const v = viewWith('')
    await expandSnippet(v, '${1|let,const|} ${2:x} = ${3|1,2|}$0', 0, 0)
    expect(v.state.doc.toString()).toBe('let x = 1')
    expect(choiceAt(v.state)?.options).toEqual(['let', 'const'])
    nextSnippetField(v)
    expect(choiceAt(v.state)).toBeNull()
    nextSnippetField(v)
    expect(choiceAt(v.state)?.options).toEqual(['1', '2'])
  })

  it('mirrors are selected together', async () => {
    const v = viewWith('')
    await expandSnippet(v, '${1:a} + $1$0', 0, 0)
    expect(v.state.selection.ranges.map((r) => v.state.sliceDoc(r.from, r.to))).toEqual(['a', 'a'])
  })
})
