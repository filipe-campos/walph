import type { LspApi, LspSignatureHelp } from '@shared/types'
import type { EditorView } from '@codemirror/view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred } from '../../test/deferred'
import { installFakeApi } from '../../test/fakeApi'
import { mountEditor, unmountEditors } from '../../test/editorHarness'
import type { LspHost } from './lspHost'
import { closeSignatureHelp, lspSignatureHelp } from './lspSignatureHelp'

const signatureHelp = vi.fn<LspApi['signatureHelp']>()
const triggerCharacters = vi.fn<LspApi['triggerCharacters']>()

const HELP: LspSignatureHelp = {
  activeSignature: 0,
  activeParameter: 0,
  signatures: [{ label: 'add(a: number, b: number)', parameters: [{ label: 'a: number' }, { label: 'b: number' }] }]
}

beforeEach(() => {
  vi.useFakeTimers()
  installFakeApi({ lsp: { signatureHelp, triggerCharacters } })
  triggerCharacters.mockResolvedValue({ completion: [], signature: ['(', ','], signatureRetrigger: [','] })
  signatureHelp.mockResolvedValue(HELP)
})

afterEach(() => {
  unmountEditors()
  vi.useRealTimers()
})

function setup(doc = 'add', host: Partial<LspHost> = {}, path: string | null = '/r/a.ts') {
  const editor = mountEditor({
    doc,
    extensions: [lspSignatureHelp('t1')],
    selection: { anchor: doc.length },
    host,
    path
  })
  return editor
}

function typeChar(view: EditorView, text: string): void {
  const at = view.state.selection.main.head
  view.dispatch({
    changes: { from: at, insert: text },
    selection: { anchor: at + text.length },
    userEvent: 'input.type'
  })
}

const flush = async (ms = 0): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms)
}
const tooltip = (view: EditorView): HTMLElement | null => view.dom.querySelector<HTMLElement>('.lsp-signature')
const activeText = (view: EditorView): string => tooltip(view)!.querySelector('.lsp-signature-active')!.textContent
const press = (view: EditorView, key: string, init: KeyboardEventInit = {}): boolean =>
  !view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))

describe('signature help', () => {
  it('typing a trigger character asks for help at the cursor and highlights the active parameter', async () => {
    const { view } = setup()
    typeChar(view, '(')
    await flush()
    expect(signatureHelp).toHaveBeenCalledExactlyOnceWith('/r/a.ts', { line: 0, character: 4 }, '(')
    expect(tooltip(view)!.querySelector('.lsp-signature-label')!.textContent).toBe('add(a: number, b: number)')
    expect(activeText(view)).toBe('a: number')
  })

  it('a plain character without the hint open does not query the server', async () => {
    const { view } = setup()
    typeChar(view, 'x')
    await flush(200)
    expect(signatureHelp).not.toHaveBeenCalled()
    expect(tooltip(view)).toBeNull()
  })

  it('a plain character with the hint open re-evaluates without "trigger"; leaving the call closes it', async () => {
    const { view } = setup()
    typeChar(view, '(')
    await flush()
    signatureHelp.mockResolvedValue({ ...HELP, activeParameter: 1 })
    typeChar(view, 'x')
    await flush()
    expect(signatureHelp).toHaveBeenLastCalledWith('/r/a.ts', { line: 0, character: 5 }, undefined)
    expect(activeText(view)).toBe('b: number')

    signatureHelp.mockResolvedValue(null)
    typeChar(view, 'y')
    await flush()
    expect(tooltip(view)).toBeNull()
  })

  it('a retrigger character only counts as a trigger with the hint open', async () => {
    triggerCharacters.mockResolvedValue({ completion: [], signature: ['('], signatureRetrigger: [','] })
    const { view } = setup('add')
    typeChar(view, ',')
    await flush()
    expect(signatureHelp).not.toHaveBeenCalled()

    typeChar(view, '(')
    await flush()
    typeChar(view, ',')
    await flush()
    expect(signatureHelp).toHaveBeenLastCalledWith('/r/a.ts', expect.anything(), ',')
  })

  it('moving the cursor with the hint open re-evaluates after a short interval, only once', async () => {
    const { view } = setup()
    typeChar(view, '(')
    await flush()
    signatureHelp.mockClear()
    view.dispatch({ selection: { anchor: 1 } })
    view.dispatch({ selection: { anchor: 2 } })
    await flush(59)
    expect(signatureHelp).not.toHaveBeenCalled()
    await flush(1)
    expect(signatureHelp).toHaveBeenCalledTimes(1)
  })

  it('moving the cursor without the hint open does not query', async () => {
    const { view } = setup('add(1)')
    view.dispatch({ selection: { anchor: 2 } })
    await flush(200)
    expect(signatureHelp).not.toHaveBeenCalled()
  })

  it('several signatures show the counter and the parameter and signature documentation', async () => {
    signatureHelp.mockResolvedValue({
      activeSignature: 1,
      activeParameter: 0,
      signatures: [
        { label: 'f(a)', parameters: [{ label: 'a' }] },
        {
          label: 'f(x, y)',
          documentation: { kind: 'plaintext', value: 'Adds two.' },
          parameters: [{ label: 'x', documentation: { kind: 'plaintext', value: 'first' } }, { label: 'y' }]
        }
      ]
    })
    const { view } = setup('f')
    typeChar(view, '(')
    await flush()
    expect(tooltip(view)!.querySelector('.lsp-signature-count')!.textContent).toBe('2/2')
    const docs = [...tooltip(view)!.querySelectorAll('.lsp-doc')].map((d) => d.textContent)
    expect(docs).toEqual([expect.stringContaining('first'), expect.stringContaining('Adds two.')])
  })

  it('the active parameter of the signature takes precedence over the list one', async () => {
    signatureHelp.mockResolvedValue({
      activeSignature: 0,
      activeParameter: 0,
      signatures: [{ ...HELP.signatures[0], activeParameter: 1 }]
    })
    const { view } = setup()
    typeChar(view, '(')
    await flush()
    expect(activeText(view)).toBe('b: number')
  })

  it('Esc closes the hint; without an open hint Esc is not consumed', async () => {
    const { view } = setup()
    expect(press(view, 'Escape')).toBe(false)
    typeChar(view, '(')
    await flush()
    expect(press(view, 'Escape')).toBe(true)
    expect(tooltip(view)).toBeNull()
  })

  it('the close effect (hiding the tab) removes the hint', async () => {
    const { view } = setup()
    typeChar(view, '(')
    await flush()
    view.dispatch({ effects: closeSignatureHelp })
    expect(tooltip(view)).toBeNull()
  })

  it('Mod-Shift-Space asks for help right away, without a trigger character', async () => {
    const { view } = setup('add(1, 2)')
    view.dispatch({ selection: { anchor: 6 } })
    expect(press(view, ' ', { ctrlKey: true, shiftKey: true })).toBe(true)
    await flush()
    expect(signatureHelp).toHaveBeenCalledExactlyOnceWith('/r/a.ts', { line: 0, character: 6 }, undefined)
    expect(tooltip(view)).not.toBeNull()
  })

  it('server missing or not ready and a tab without a path: nothing is requested', async () => {
    for (const args of [
      [{ serverFor: () => null }, '/r/a.ts'],
      [{ serverFor: () => ({ id: 's', ready: false }) }, '/r/a.ts'],
      [{}, null]
    ] as const) {
      const { view } = setup('add', args[0], args[1])
      typeChar(view, '(')
      await flush(200)
      unmountEditors()
    }
    expect(signatureHelp).not.toHaveBeenCalled()
  })

  it('a server error keeps everything as it was', async () => {
    signatureHelp.mockRejectedValue(new Error('x'))
    const { view } = setup()
    typeChar(view, '(')
    await flush()
    expect(tooltip(view)).toBeNull()
  })

  it('a response without signatures does not open the hint', async () => {
    signatureHelp.mockResolvedValue({ activeSignature: 0, activeParameter: 0, signatures: [] })
    const { view } = setup()
    typeChar(view, '(')
    await flush()
    expect(tooltip(view)).toBeNull()
  })

  it('a response for an old position is discarded and asks again at the current position', async () => {
    const first = deferred<LspSignatureHelp>()
    signatureHelp.mockReturnValueOnce(first.promise)
    const { view } = setup()
    typeChar(view, '(')
    await flush()
    typeChar(view, '1')
    first.resolve(HELP)
    await flush()
    expect(signatureHelp).toHaveBeenCalledTimes(2)
    expect(signatureHelp).toHaveBeenLastCalledWith('/r/a.ts', { line: 0, character: 5 }, undefined)
    expect(tooltip(view)).not.toBeNull()
  })

  it('the hint follows the text typed before it', async () => {
    const { view } = setup('\nadd')
    typeChar(view, '(')
    await flush()
    view.dispatch({ changes: { from: 0, insert: 'xx' } })
    expect(tooltip(view)).not.toBeNull()
  })

  it('destroying the view cancels the scheduled request', async () => {
    const { view } = setup()
    typeChar(view, '(')
    view.destroy()
    await flush(200)
    expect(signatureHelp).not.toHaveBeenCalled()
  })
})
