import { EditorSelection, type Extension } from '@codemirror/state'
import { isolateHistory } from '@codemirror/commands'
import { EditorView } from '@codemirror/view'

const WRAPPERS = new Set(['*', '_', '`'])

/**
 * Markdown: with text selected, typing `*`, `_` or `` ` `` wraps the selection (as in VS Code) instead of
 * replacing it, and the inner text stays selected (repeating the character doubles it: `**bold**`). Without a selection
 * nothing changes: there is no automatic pair closing. With several selections, the empty cursors only get the
 * character.
 */
export const markdownWrap: Extension = EditorView.inputHandler.of((view, _from, _to, text) => {
  // The backtick is a dead key on ABNT2: during composition the final text is not yet the event's.
  if (view.compositionStarted || view.composing || view.state.readOnly || !WRAPPERS.has(text)) return false
  if (view.state.selection.ranges.every((r) => r.empty)) return false
  const tr = view.state.changeByRange((range) => {
    if (range.empty)
      return { changes: { from: range.from, insert: text }, range: EditorSelection.cursor(range.from + 1) }
    return {
      changes: [
        { from: range.from, insert: text },
        { from: range.to, insert: text }
      ],
      // The inner text stays selected: the opening pushes both ends by 1 character.
      range:
        range.anchor <= range.head
          ? EditorSelection.range(range.from + 1, range.to + 1)
          : EditorSelection.range(range.to + 1, range.from + 1)
    }
  })
  view.dispatch(
    view.state.update(tr, {
      userEvent: 'input.type',
      scrollIntoView: true,
      // Each wrap is its own undo step (it does not merge with the following typing).
      annotations: isolateHistory.of('full')
    })
  )
  return true
})
