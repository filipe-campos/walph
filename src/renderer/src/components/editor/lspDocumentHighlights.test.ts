import type { LspApi, LspDocumentHighlight } from '@shared/types'
import type { EditorView } from '@codemirror/view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeApi } from '../../test/fakeApi'
import { mountEditor, unmountEditors } from '../../test/editorHarness'
import { jumpToOccurrence, lspDocumentHighlights } from './lspDocumentHighlights'

const documentHighlights = vi.fn<LspApi['documentHighlights']>()

const DOC = 'let x = 1\nx = x + 2\n'
const at = (line: number, a: number, b: number) => ({ start: { line, character: a }, end: { line, character: b } })
const HIGHLIGHTS: LspDocumentHighlight[] = [
  { range: at(0, 4, 5), kind: 'write' },
  { range: at(1, 0, 1), kind: 'write' },
  { range: at(1, 4, 5), kind: 'read' }
]

beforeEach(() => {
  vi.useFakeTimers()
  installFakeApi({ lsp: { documentHighlights } })
  documentHighlights.mockResolvedValue(HIGHLIGHTS)
})

afterEach(() => {
  unmountEditors()
  vi.useRealTimers()
  documentHighlights.mockReset()
})

const flush = (ms: number): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => undefined)
const marked = (view: EditorView): string[] =>
  [...view.dom.querySelectorAll('.cm-lsp-highlight')].map((el) => `${el.className.split(' ').at(-1)}:${el.textContent}`)

function setup(selection = 4) {
  return mountEditor({ doc: DOC, extensions: [lspDocumentHighlights('t1')], selection: { anchor: selection } })
}

describe('document highlight', () => {
  it('asks for the occurrences at the cursor position and distinguishes read and write', async () => {
    const { view } = setup()
    await flush(60)
    expect(documentHighlights).toHaveBeenCalledWith('/r/a.ts', { line: 0, character: 4 })
    expect(marked(view)).toEqual(['cm-lsp-highlight-write:x', 'cm-lsp-highlight-write:x', 'cm-lsp-highlight-read:x'])
  })

  it('editing clears right away; leaving the occurrence clears and asks again after the wait', async () => {
    const { view } = setup()
    await flush(60)
    view.dispatch({ selection: { anchor: 5 } })
    expect(marked(view)).toHaveLength(3)
    view.dispatch({ selection: { anchor: 8 } })
    expect(marked(view)).toHaveLength(0)
    await flush(250)
    expect(documentHighlights).toHaveBeenLastCalledWith('/r/a.ts', { line: 0, character: 8 })
    // The response is for the `x` occurrence, far from the cursor: it does not hold for the current position.
    expect(marked(view)).toHaveLength(0)
    view.dispatch({ selection: { anchor: 4 } })
    await flush(250)
    view.dispatch({ changes: { from: 0, insert: ' ' } })
    expect(marked(view)).toHaveLength(0)
  })

  it('F7/Shift+F7 walk through the occurrences and wrap around the file', async () => {
    const { view } = setup()
    await flush(60)
    const selected = (): string => view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)
    expect(jumpToOccurrence(view, 1)).toBe(true)
    expect(view.state.selection.main.from).toBe(10)
    expect(selected()).toBe('x')
    jumpToOccurrence(view, 1)
    expect(view.state.selection.main.from).toBe(14)
    jumpToOccurrence(view, 1)
    expect(view.state.selection.main.from).toBe(4)
    jumpToOccurrence(view, -1)
    expect(view.state.selection.main.from).toBe(14)
  })

  it('without a server the navigation uses the whole word occurrences', () => {
    const { view } = mountEditor({
      doc: 'foo foobar foo',
      extensions: [lspDocumentHighlights('t1')],
      selection: { anchor: 1 },
      host: { serverFor: () => null }
    })
    jumpToOccurrence(view, 1)
    expect(view.state.selection.main.from).toBe(11)
    expect(jumpToOccurrence(mountEditor({ doc: '  ', tabId: 't2' }).view, 1)).toBe(false)
  })
})
