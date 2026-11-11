// Notifies whoever follows the editor outside CodeMirror (breadcrumbs, Outline, symbols) when the selection, the text
// or the syntax tree of a view change, or when it starts showing another state (`setState` recreates the plugins).
import { syntaxTree } from '@codemirror/language'
import { ViewPlugin, type EditorView } from '@codemirror/view'

export interface ViewChange {
  view: EditorView
  /** The syntax tree changed (the parser advanced or the language arrived). */
  syntax: boolean
}

const listeners = new Set<(change: ViewChange) => void>()

export function subscribeViewChanges(listener: (change: ViewChange) => void): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

function notify(change: ViewChange): void {
  for (const listener of [...listeners]) listener(change)
}

export const viewEvents = ViewPlugin.define((view) => {
  // Outside the update cycle in which the plugin is born: listeners read `view.state`.
  queueMicrotask(() => notify({ view, syntax: true }))
  return {
    update(u) {
      const syntax = syntaxTree(u.state) !== syntaxTree(u.startState)
      if (u.selectionSet || u.docChanged || syntax) notify({ view: u.view, syntax })
    }
  }
})
