// LSP semantic highlighting: `cm-sem-<type>` marks (+ `cm-sem-mod-<modifier>`) on top of the Lezer highlighting. The
// LSP extensions come before the theme in the list, so these marks sit inside and their color wins.
import { RangeSetBuilder, StateEffect, StateField, type Extension, type Text } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'
import type { LspSemanticTokens } from '@shared/types'
import { lspFetch } from './lspFetch'

const DELAY_MS = 400
/** The modifiers are bits of a 32-bit integer. */
const MODIFIER_BITS = 32

/**
 * Decorations of the tokens (absolute, 5 integers each) on `doc`; tokens out of order or outside the document are
 * skipped.
 */
export function semanticDecorations(doc: Text, tokens: LspSemanticTokens): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const cache = new Map<string, Decoration>()
  const { data, types, modifiers } = tokens
  const modifierCount = Math.min(modifiers.length, MODIFIER_BITS)
  let last = 0
  for (let i = 0; i + 4 < data.length; i += 5) {
    const line = data[i] ?? 0
    if (line >= doc.lines) break
    const type = types[data[i + 3] ?? -1]
    if (!type) continue
    const info = doc.line(line + 1)
    const from = info.from + (data[i + 1] ?? 0)
    const to = Math.min(from + (data[i + 2] ?? 0), info.to)
    if (from < last || from >= to) continue
    const bits = data[i + 4] ?? 0
    const key = `${type}|${bits}`
    let mark = cache.get(key)
    if (!mark) {
      let className = `cm-sem-${type}`
      for (let m = 0; m < modifierCount; m++) {
        const name = modifiers[m]
        // `>>>`: bit 31 would make the number negative.
        if (name && ((bits >>> m) & 1) === 1) className += ` cm-sem-mod-${name}`
      }
      mark = Decoration.mark({ class: className })
      cache.set(key, mark)
    }
    builder.add(from, to, mark)
    last = to
  }
  return builder.finish()
}

const setTokens = StateEffect.define<DecorationSet>()

const tokensField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setTokens)) return effect.value
    return tr.docChanged ? value.map(tr.changes) : value
  },
  provide: (field) => EditorView.decorations.from(field)
})

export function lspSemanticTokens(tabId: string): Extension {
  return [
    tokensField,
    lspFetch<LspSemanticTokens | null>(tabId, {
      feature: 'semanticTokens',
      delay: DELAY_MS,
      shouldFetch: (u) => u.docChanged,
      request: (_view, path) => window.api.lsp.semanticTokens(path),
      apply: (view, tokens, doc) => {
        if (!tokens?.data.length && view.state.field(tokensField).size === 0) return
        view.dispatch({ effects: setTokens.of(tokens ? semanticDecorations(doc, tokens) : Decoration.none) })
      }
    })
  ]
}
