import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LspTextChange } from '@shared/types'
import { lspPositionToOffset } from '@shared/lspPosition'
import { normalizedDoc } from './documentState'
import { installFakeApi } from '../../test/fakeApi'

type Call =
  ['open', string, string, number] | ['change', string, number, LspTextChange[]] | ['save', string] | ['close', string]

const calls: Call[] = []
const paths: Record<string, string> = {}
const indent = { kind: 'spaces', size: 2 } as const

// jsdom does not implement the text measurement CodeMirror uses when drawing.
beforeEach(() => {
  calls.length = 0
  for (const k of Object.keys(paths)) delete paths[k]
  const rect = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] })
  Range.prototype.getBoundingClientRect = () => rect
  installFakeApi({
    lsp: {
      open: (p, t, v) => void calls.push(['open', p, t, v]),
      change: (p, v, c) => void calls.push(['change', p, v, c]),
      save: (p) => void calls.push(['save', p]),
      close: (p) => void calls.push(['close', p])
    }
  })
})

afterEach(() => {
  vi.resetModules()
})

/** Applies the `open`/`change` calls like a server: the version must grow 1 by 1 and the text match the editor. */
function replay(path: string): { text: string; version: number } {
  let text = ''
  let version = 0
  for (const call of calls) {
    if (call[1] !== path) continue
    if (call[0] === 'open') {
      text = call[2]
      version = call[3]
    } else if (call[0] === 'change') {
      expect(call[2]).toBe(version + 1)
      version = call[2]
      for (const change of call[3]) {
        const doc = normalizedDoc(text)
        const from = lspPositionToOffset(doc, change.range.start)
        const to = lspPositionToOffset(doc, change.range.end)
        text = text.slice(0, from) + change.text + text.slice(to)
      }
    }
  }
  return { text, version }
}

async function setup() {
  const documents = {
    ...(await import('./documentConfig')),
    ...(await import('./documentState')),
    ...(await import('./documentStore')),
    ...(await import('./groupViews'))
  }
  const sync = await import('./lspSync')
  sync.bindLspPaths((id) => paths[id])
  return documents
}

describe('document sync with the LSP', () => {
  it('open on load, change of the visible tab, save and close in the exact sequence', async () => {
    const d = await setup()
    paths.t1 = '/r/a.ts'
    d.loadDocument('t1', 'abc\ndef', indent)
    d.mountView('g1', document.body.appendChild(document.createElement('div')))
    d.setActiveGroup('g1')
    d.showDocument('g1', 't1')
    d.getView()!.dispatch({
      changes: [
        { from: 0, insert: '1' },
        { from: 7, insert: '😀' }
      ]
    })
    d.getView()!.dispatch({ changes: { from: 1, to: 4, insert: '' } })
    await d.saveDocument('t1', '/r/a.ts', 'LF')
    d.forgetDocument('t1')

    expect(calls.map((c) => c[0])).toEqual(['open', 'change', 'change', 'save', 'close'])
    expect(calls[0]).toEqual(['open', '/r/a.ts', 'abc\ndef', 1])
    // Two changes in the same transaction: decreasing position order.
    const first = calls[1] as Extract<Call, { 0: 'change' }>
    expect(first[3].map((c) => c.text)).toEqual(['😀', '1'])
    expect(replay('/r/a.ts')).toEqual({ text: '1\ndef😀', version: 3 })
    d.unmountView('g1')
  })

  it('same tab in both groups: edits on both sides make a single didChange stream and a single undo', async () => {
    const d = await setup()
    paths.t1 = '/r/a.ts'
    const dirty: boolean[] = []
    d.bindDocumentHandlers({ setDirty: (_id, v) => dirty.push(v), setCursor: () => {}, onScroll: () => {} })
    let edits = 0
    const off = d.subscribeEdits(() => edits++)
    d.loadDocument('t1', 'abc', indent)
    d.mountView('gA', document.body.appendChild(document.createElement('div')))
    d.mountView('gB', document.body.appendChild(document.createElement('div')))
    d.setActiveGroup('gA')
    d.showDocument('gA', 't1')
    d.showDocument('gB', 't1')
    const a = d.getView('gA')!
    const b = d.getView('gB')!

    // Typing does not trigger completion/signature in the unfocused view (otherwise the exclusive LSP request would
    // cancel the other side's).
    const { completionStatus } = await import('@codemirror/autocomplete')
    a.dispatch({ changes: { from: 3, insert: 'x' }, userEvent: 'input.type' })
    expect(completionStatus(b.state)).toBeNull()
    a.dispatch({ changes: { from: 3, to: 4 }, userEvent: 'delete.backward' })

    // Types in the owner and then in the mirror.
    a.dispatch({ changes: { from: 3, insert: 'd' }, userEvent: 'input.type' })
    b.dispatch({ changes: { from: 0, insert: '>' }, userEvent: 'input.type' })
    expect(a.state.doc.toString()).toBe('>abcd')
    expect(b.state.doc.toString()).toBe('>abcd')
    expect(calls.map((c) => c[0])).toEqual(['open', 'change', 'change', 'change', 'change'])
    expect(replay('/r/a.ts').text).toBe('>abcd')
    expect(edits).toBe(4)
    expect(dirty).toEqual([true, false, true, true])

    // Undo from the mirror undoes on the canonical one and reflects on both sides.
    const { undo: undoKey } = await import('@codemirror/commands')
    const ctrlZ = (view: typeof a): void => {
      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })
      )
    }
    ctrlZ(b)
    expect(a.state.doc.toString()).toBe('abcd')
    expect(a.state.doc.toString()).toBe(b.state.doc.toString())
    expect(replay('/r/a.ts').text).toBe(a.state.doc.toString())
    expect(d.currentState('t1')!.doc.toString()).toBe(a.state.doc.toString())

    // Redo/Undo from the native menu reach the mirror as `beforeinput` and also go to the canonical one.
    const nativeHistory = (view: typeof a, inputType: string): boolean =>
      view.contentDOM.dispatchEvent(new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true }))
    expect(nativeHistory(b, 'historyRedo')).toBe(false)
    expect(a.state.doc.toString()).toBe('>abcd')
    expect(b.state.doc.toString()).toBe('>abcd')
    expect(nativeHistory(b, 'historyUndo')).toBe(false)
    expect(a.state.doc.toString()).toBe('abcd')
    expect(b.state.doc.toString()).toBe('abcd')
    expect(replay('/r/a.ts').text).toBe('abcd')

    // The owner leaves the group: the mirror becomes the owner and keeps editing with the history.
    d.hideDocument('gA', 't1', true)
    expect(d.shownTabId('gA')).toBeNull()
    expect(d.shownTabId('gB')).toBe('t1')
    b.dispatch({ changes: { from: 0, insert: 'Z' }, userEvent: 'input.type' })
    expect(replay('/r/a.ts').text).toBe(b.state.doc.toString())
    expect(d.currentState('t1')).toBe(b.state)
    expect(undoKey(b)).toBe(true)
    expect(replay('/r/a.ts').text).toBe(b.state.doc.toString())

    // No view: the state goes back to storage.
    d.hideDocument('gB', 't1', true)
    expect(d.currentState('t1')!.doc.toString()).toBe(replay('/r/a.ts').text)
    off()
    d.forgetDocument('t1')
    d.unmountView('gA')
    d.unmountView('gB')
  })

  it('hidden tabs: applyTabEdits and replaceDocument (dirty tab) report; the text matches the document', async () => {
    const d = await setup()
    paths.t1 = '/r/a.ts'
    d.loadDocument('t1', 'one\ntwo\nthree', indent)
    // No view: the tab is stored (hidden).
    expect(
      d.applyTabEdits('t1', [
        { from: 0, to: 3, insert: 'ONE' },
        { from: 8, to: 13, insert: 'x\ny' }
      ])
    ).toBe(true)
    // Dirty tab: the disk changed and the text is replaced only in the differing range.
    expect(d.replaceDocument('t1', 'ONE\ntwo\nx\nz', indent)).toBe(true)

    expect(calls.map((c) => c[0])).toEqual(['open', 'change', 'change'])
    const { text, version } = replay('/r/a.ts')
    expect(version).toBe(3)
    expect(text).toBe(d.currentState('t1')!.doc.toString())
    expect(text).toBe('ONE\ntwo\nx\nz')
  })

  it('renaming closes the old path and opens the new one with the current text and the next version', async () => {
    const d = await setup()
    paths.t1 = '/r/a.ts'
    d.loadDocument('t1', 'abc', indent)
    d.applyTabEdits('t1', [{ from: 3, to: 3, insert: 'd' }])
    paths.t1 = '/r/b.ts'
    d.syncLspPaths()
    d.syncLspPaths() // idempotent
    d.applyTabEdits('t1', [{ from: 0, to: 0, insert: '>' }])
    d.forgetDocument('t1')

    expect(calls).toEqual([
      ['open', '/r/a.ts', 'abc', 1],
      ['change', '/r/a.ts', 2, expect.any(Array)],
      ['close', '/r/a.ts'],
      ['open', '/r/b.ts', 'abcd', 3],
      ['change', '/r/b.ts', 4, expect.any(Array)],
      ['close', '/r/b.ts']
    ])
    expect(replay('/r/b.ts').text).toBe('>abcd')
  })

  it('a tab without a known path does not report; closing twice only notifies once', async () => {
    const d = await setup()
    d.loadDocument('no-path', 'x', indent)
    paths.t2 = '/r/c.ts'
    d.loadDocument('t2', 'y', indent)
    d.forgetDocument('t2')
    d.forgetDocument('t2')
    expect(calls.map((c) => c[0])).toEqual(['open', 'close'])
  })
})
