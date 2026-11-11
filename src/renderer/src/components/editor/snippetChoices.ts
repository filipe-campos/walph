// Snippet choices (`${1|a,b|}`): CodeMirror's `snippet()` only knows fields, so each choice field is
// stored here with its options and, when Tab selects it, the completion list opens with them.
import {
  hasNextSnippetField,
  hasPrevSnippetField,
  startCompletion,
  type CompletionSource
} from '@codemirror/autocomplete'
import { EditorState, StateEffect, StateField, type Extension } from '@codemirror/state'
import { ViewPlugin, type ViewUpdate } from '@codemirror/view'

export interface ChoiceRange {
  from: number
  to: number
  options: readonly string[]
}

export const setChoices = StateEffect.define<ChoiceRange[]>()

const choiceField = StateField.define<ChoiceRange[]>({
  create: () => [],
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setChoices)) return effect.value
    if (value.length === 0) return value
    // The snippet ended (last field, Esc, cursor outside): the choices die with it.
    if (!hasNextSnippetField(tr.state) && !hasPrevSnippetField(tr.state)) return []
    if (!tr.docChanged) return value
    return value.map((r) => ({ ...r, from: tr.changes.mapPos(r.from, -1), to: tr.changes.mapPos(r.to, 1) }))
  }
})

/** Choice field containing the main selection (the whole field selected or the cursor inside it). */
export function choiceAt(state: EditorState): ChoiceRange | null {
  const ranges = state.field(choiceField, false)
  if (!ranges?.length) return null
  const { from, to } = state.selection.main
  return ranges.find((r) => r.from <= from && to <= r.to) ?? null
}

function exactChoice(state: EditorState): boolean {
  const choice = choiceAt(state)
  const { from, to } = state.selection.main
  return !!choice && choice.from === from && choice.to === to
}

const choiceSource: CompletionSource = (ctx) => {
  const choice = choiceAt(ctx.state)
  if (!choice) return null
  return {
    from: choice.from,
    to: choice.to,
    filter: false,
    options: choice.options.map((label, i) => ({ label, type: 'enum', boost: 99 - Math.min(i, 198) }))
  }
}

const openOnSelect = ViewPlugin.define((view) => ({
  update(update: ViewUpdate) {
    const assigned = update.transactions.some((tr) => tr.effects.some((e) => e.is(setChoices)))
    if (!assigned && !update.selectionSet) return
    if (!exactChoice(update.state) || (!assigned && exactChoice(update.startState))) return
    // Cannot dispatch during the update: the list opens right after.
    queueMicrotask(() => {
      if (exactChoice(view.state)) startCompletion(view)
    })
  }
}))

export const snippetChoices: Extension = [
  choiceField,
  openOnSelect,
  EditorState.languageData.of(() => [{ autocomplete: choiceSource }])
]
