import type { LspApi, LspSemanticTokens } from '@shared/types'
import { Text } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeApi } from '../../test/fakeApi'
import { mountEditor, unmountEditors } from '../../test/editorHarness'
import { lspSemanticTokens, semanticDecorations } from './lspSemanticTokens'

const semanticTokens = vi.fn<LspApi['semanticTokens']>()

const TOKENS: LspSemanticTokens = {
  types: ['variable', 'function', ''],
  modifiers: ['readonly', 'static'],
  // `x` (readonly variable), `f` (static and readonly function).
  data: [0, 6, 1, 0, 1, 1, 0, 1, 1, 3]
}

beforeEach(() => {
  vi.useFakeTimers()
  installFakeApi({ lsp: { semanticTokens } })
  semanticTokens.mockResolvedValue(TOKENS)
})

afterEach(() => {
  unmountEditors()
  vi.useRealTimers()
  semanticTokens.mockReset()
})

const flush = (ms: number): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => undefined)

function classes(doc: Text, tokens: LspSemanticTokens): string[] {
  const out: string[] = []
  semanticDecorations(doc, tokens).between(0, doc.length, (from, to, value) => {
    out.push(`${from}-${to}:${String(value.spec.class)}`)
  })
  return out
}

describe('semanticDecorations', () => {
  it('classes of the type and of the set modifiers', () => {
    expect(classes(Text.of(['const x = 1', 'f()']), TOKENS)).toEqual([
      '6-7:cm-sem-variable cm-sem-mod-readonly',
      '12-13:cm-sem-function cm-sem-mod-readonly cm-sem-mod-static'
    ])
  })

  it('skips nameless types and out-of-order, overlapping or past-the-end tokens; cuts at the end of the line', () => {
    const tokens = { ...TOKENS, data: [0, 0, 3, 2, 0, 0, 4, 50, 0, 0, 0, 2, 3, 0, 0, 0, 5, 1, 0, 0, 9, 0, 1, 0, 0] }
    expect(classes(Text.of(['abcdef']), tokens)).toEqual(['4-6:cm-sem-variable'])
  })
})

describe('semantic tokens in the editor', () => {
  it('asks on mount and after editing; the mark sits inside a later decoration', async () => {
    const outer = EditorView.decorations.of(Decoration.set([Decoration.mark({ class: 'syntax' }).range(0, 11)]))
    const { view } = mountEditor({ doc: 'const x = 1\nf()', extensions: [lspSemanticTokens('t1'), outer] })
    await flush(60)
    const mark = view.dom.querySelector('.cm-sem-variable')
    expect(mark?.textContent).toBe('x')
    expect(mark?.parentElement?.classList.contains('syntax')).toBe(true)
    view.dispatch({ changes: { from: 0, insert: ' ' } })
    await flush(400)
    expect(semanticTokens).toHaveBeenCalledTimes(2)
  })

  it('without tokens (turned off) clears the marks', async () => {
    let enabled = true
    const { view } = mountEditor({
      doc: 'const x = 1\nf()',
      extensions: [lspSemanticTokens('t1')],
      host: { featureEnabled: () => enabled }
    })
    await flush(60)
    expect(view.dom.querySelectorAll('[class*="cm-sem-"]')).toHaveLength(2)
    enabled = false
    view.dispatch({ changes: { from: 0, insert: ' ' } })
    await flush(400)
    expect(view.dom.querySelectorAll('[class*="cm-sem-"]')).toHaveLength(0)
  })
})
