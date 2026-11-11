import type { LspApi, LspInlayHint } from '@shared/types'
import { Text } from '@codemirror/state'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred } from '../../test/deferred'
import { installFakeApi } from '../../test/fakeApi'
import { mountEditor, unmountEditors } from '../../test/editorHarness'
import { emitLspRefresh } from './lspHost'
import { inlayHintDecorations, lspInlayHints } from './lspInlayHints'

const inlayHints = vi.fn<LspApi['inlayHints']>()

const HINT: LspInlayHint = {
  position: { line: 0, character: 2 },
  label: [{ value: 'a:', tooltip: 'parameter a' }],
  kind: 'parameter',
  paddingLeft: false,
  paddingRight: true,
  tooltip: 'hint'
}

beforeEach(() => {
  vi.useFakeTimers()
  installFakeApi({ lsp: { inlayHints } })
  inlayHints.mockResolvedValue([HINT])
})

afterEach(() => {
  unmountEditors()
  vi.useRealTimers()
  inlayHints.mockReset()
})

const flush = (ms: number): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => undefined)
const hints = (root: HTMLElement): HTMLElement[] => [...root.querySelectorAll<HTMLElement>('.cm-inlay-hint')]

describe('inlay hints', () => {
  it('asks for the visible part on mount and draws the label with padding and tooltip', async () => {
    const { view } = mountEditor({ doc: 'f(1, 2)\n', extensions: [lspInlayHints('t1')] })
    await flush(60)
    expect(inlayHints).toHaveBeenCalledWith('/r/a.ts', {
      start: { line: 0, character: 0 },
      end: { line: 1, character: 0 }
    })
    const [dom] = hints(view.dom)
    expect(dom?.textContent).toBe('a:')
    expect(dom?.className).toBe('cm-inlay-hint cm-inlay-hint-parameter cm-inlay-hint-pad-right')
    expect(dom?.title).toBe('hint')
    expect(dom?.querySelector('span')?.title).toBe('parameter a')
  })

  it('a response computed on a text that already changed is discarded; the edit asks again', async () => {
    const first = deferred<LspInlayHint[]>()
    inlayHints.mockReturnValueOnce(first.promise)
    const { view } = mountEditor({ doc: 'f(1, 2)\n', extensions: [lspInlayHints('t1')] })
    await flush(60)
    view.dispatch({ changes: { from: 0, insert: 'x' } })
    first.resolve([HINT])
    await flush(0)
    expect(hints(view.dom)).toHaveLength(0)
    await flush(300)
    expect(inlayHints).toHaveBeenCalledTimes(2)
    expect(hints(view.dom)).toHaveLength(1)
  })

  it('turned off in the settings it does not ask and a refresh clears what was there', async () => {
    let enabled = true
    const { view } = mountEditor({
      doc: 'f(1, 2)\n',
      extensions: [lspInlayHints('t1')],
      host: { featureEnabled: () => enabled }
    })
    await flush(60)
    expect(hints(view.dom)).toHaveLength(1)
    enabled = false
    emitLspRefresh({ feature: 'inlayHints' })
    await flush(0)
    expect(hints(view.dom)).toHaveLength(0)
    expect(inlayHints).toHaveBeenCalledTimes(1)
  })

  it('a refresh from another server or another feature does not ask again', async () => {
    mountEditor({ doc: 'f(1)\n', extensions: [lspInlayHints('t1')] })
    await flush(60)
    emitLspRefresh({ feature: 'inlayHints', serverId: 'other' })
    emitLspRefresh({ feature: 'semanticTokens' })
    await flush(0)
    expect(inlayHints).toHaveBeenCalledTimes(1)
    emitLspRefresh({ feature: 'inlayHints', serverId: 'srv' })
    await flush(0)
    expect(inlayHints).toHaveBeenCalledTimes(2)
  })
})

describe('inlayHintDecorations', () => {
  it('discards hints past the end of the document', () => {
    const set = inlayHintDecorations(Text.of(['ab']), [HINT, { ...HINT, position: { line: 4, character: 0 } }])
    expect(set.size).toBe(1)
  })
})
