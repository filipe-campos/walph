import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { history } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import type { LspApi, LspCodeLens } from '@shared/types'
import { deferred } from '../../test/deferred'
import { installFakeApi } from '../../test/fakeApi'
import { mountEditor, unmountEditors } from '../../test/editorHarness'
import { codeLensOn, refreshCodeLenses } from './lspCodeLens'
import { lspPeek } from './lspPeek'

const codeLens = vi.fn<LspApi['codeLens']>()
const resolveCodeLens = vi.fn<LspApi['resolveCodeLens']>()

const range = (line: number) => ({ start: { line, character: 0 }, end: { line, character: 3 } })
const location = { path: '/r/b.ts', range: range(4) }

beforeEach(() => {
  vi.useFakeTimers()
  installFakeApi({ lsp: { codeLens, resolveCodeLens } })
  codeLens.mockResolvedValue(null)
  resolveCodeLens.mockResolvedValue(null)
})

afterEach(() => {
  unmountEditors()
  vi.useRealTimers()
})

const DOC = 'function a() {}\n  function b() {}\nconst c = 1'

function setup({ mirror = false, path = '/r/a.ts' }: { mirror?: boolean; path?: string | null } = {}) {
  return mountEditor({ doc: DOC, extensions: [mirror ? [] : history(), codeLensOn, lspPeek()], path })
}

const flush = async (ms = 0): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms)
}
const lensLines = (view: EditorView): string[] =>
  [...view.dom.querySelectorAll<HTMLElement>('.cm-code-lens')].map((el) => el.textContent)

describe('code lenses', () => {
  it('asks for the list on mount, shows the resolved ones and resolves the visible ones', async () => {
    const lenses: LspCodeLens[] = [
      { range: range(0), command: { title: '2 references', locations: [location] } },
      { range: range(1) }
    ]
    codeLens.mockResolvedValue({ resultId: 5, resolvable: true, lenses })
    resolveCodeLens.mockResolvedValue({ range: range(1), command: { title: '1 implementation', locations: [] } })
    const { view } = setup()
    await flush()
    expect(codeLens).toHaveBeenCalledExactlyOnceWith('/r/a.ts')
    expect(resolveCodeLens).toHaveBeenCalledExactlyOnceWith('/r/a.ts', 5, 1)
    expect(lensLines(view)).toEqual(['2 references', '1 implementation'])
    // The lens follows the line indent.
    const indented = view.dom.querySelectorAll<HTMLElement>('.cm-code-lens')[1]
    expect(indented?.style.paddingLeft).toBe('2ch')
  })

  it('a response for a text changed during the request is discarded; a new request follows the edit', async () => {
    const pending = deferred<Awaited<ReturnType<LspApi['codeLens']>>>()
    codeLens.mockReturnValueOnce(pending.promise)
    const { view } = setup()
    await flush()
    view.dispatch({ changes: { from: 0, insert: '\n' } })
    pending.resolve({ resultId: 1, resolvable: false, lenses: [{ range: range(0), command: { title: 'old' } }] })
    await flush()
    expect(lensLines(view)).toEqual([])
    codeLens.mockResolvedValue({
      resultId: 2,
      resolvable: false,
      lenses: [{ range: range(1), command: { title: 'new' } }]
    })
    await flush(600)
    expect(codeLens).toHaveBeenCalledTimes(2)
    expect(lensLines(view)).toEqual(['new'])
  })

  it('clicking a locations lens opens the peek; a command lens runs on the server', async () => {
    const command = { title: 'Run', command: 'x.run' }
    codeLens.mockResolvedValue({
      resultId: 1,
      resolvable: false,
      lenses: [
        { range: range(0), command: { title: '1 reference', locations: [location] } },
        { range: range(2), command: { title: 'Run', command } }
      ]
    })
    const { view, host } = setup()
    await flush()
    const [refs, run] = [...view.dom.querySelectorAll<HTMLElement>('.cm-code-lens-item.action')]
    refs?.click()
    expect(view.dom.querySelector('.lsp-peek .lsp-peek-title')?.textContent).toBe('1 reference')
    run?.click()
    expect(host.runLensCommand).toHaveBeenCalledWith('/r/a.ts', command)
  })

  it('the mirror copy (no history) and the tab without a path do not ask for lenses', async () => {
    setup({ mirror: true })
    await flush()
    unmountEditors()
    setup({ path: null })
    await flush()
    expect(codeLens).not.toHaveBeenCalled()
  })

  it('the server refresh asks for the list again', async () => {
    setup()
    await flush()
    refreshCodeLenses()
    await flush()
    expect(codeLens).toHaveBeenCalledTimes(2)
  })
})
