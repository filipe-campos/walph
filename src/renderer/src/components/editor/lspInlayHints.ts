// LSP inlay hints (inferred types, parameter names) as widgets in the text, requested for the visible part.
import { StateEffect, StateField, type Extension, type Text } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import type { LspInlayHint } from '@shared/types'
import { lspPositionToOffset, offsetToLspPosition } from '@shared/lspPosition'
import { lspFetch } from './lspFetch'

const DELAY_MS = 300

class InlayHintWidget extends WidgetType {
  constructor(readonly hint: LspInlayHint) {
    super()
  }

  override eq(other: InlayHintWidget): boolean {
    // Small and already normalized hint: the serialized comparison is cheap and covers every part.
    return JSON.stringify(this.hint) === JSON.stringify(other.hint)
  }

  toDOM(): HTMLElement {
    const { hint } = this
    const dom = document.createElement('span')
    dom.className = 'cm-inlay-hint'
    if (hint.kind) dom.classList.add(`cm-inlay-hint-${hint.kind}`)
    if (hint.paddingLeft) dom.classList.add('cm-inlay-hint-pad-left')
    if (hint.paddingRight) dom.classList.add('cm-inlay-hint-pad-right')
    if (hint.tooltip) dom.title = hint.tooltip
    for (const part of hint.label) {
      const span = document.createElement('span')
      span.textContent = part.value
      if (part.tooltip) span.title = part.tooltip
      dom.append(span)
    }
    return dom
  }

  override ignoreEvent(): boolean {
    return false
  }
}

/** Hint decorations on `doc`; a position outside the document is discarded (the server saw another text). */
export function inlayHintDecorations(doc: Text, hints: readonly LspInlayHint[]): DecorationSet {
  const ranges = []
  for (const hint of hints) {
    if (hint.position.line >= doc.lines) continue
    const pos = lspPositionToOffset(doc, hint.position)
    // A parameter name precedes the argument: what is typed there goes after the hint, not before.
    const side = hint.kind === 'parameter' ? -1 : 1
    ranges.push(Decoration.widget({ widget: new InlayHintWidget(hint), side }).range(pos))
  }
  return Decoration.set(ranges, true)
}

const setHints = StateEffect.define<DecorationSet>()

const hintsField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setHints)) return effect.value
    return tr.docChanged ? value.map(tr.changes) : value
  },
  provide: (field) => EditorView.decorations.from(field)
})

export function lspInlayHints(tabId: string): Extension {
  return [
    hintsField,
    lspFetch<LspInlayHint[]>(tabId, {
      feature: 'inlayHints',
      delay: DELAY_MS,
      shouldFetch: (u) => u.docChanged || u.viewportChanged,
      request: (view, path) => {
        const { doc } = view.state
        const { from, to } = view.viewport
        const range = { start: offsetToLspPosition(doc, from), end: offsetToLspPosition(doc, to) }
        return window.api.lsp.inlayHints(path, range)
      },
      apply: (view, hints, doc) => {
        if (!hints?.length && view.state.field(hintsField).size === 0) return
        view.dispatch({ effects: setHints.of(hints ? inlayHintDecorations(doc, hints) : Decoration.none) })
      }
    })
  ]
}
