// Expansion of a snippet (VS Code/LSP syntax) in the editor: resolves the variables with the tab context, inserts with
// CodeMirror's `snippet()` (Tab/Shift-Tab between fields, mirrors edited together) and records the choices.
import { nextSnippetField, snippet, type Completion } from '@codemirror/autocomplete'
import type { EditorState, SelectionRange, Transaction } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { parseSnippet, resolveVariables, toCodeMirrorSnippet, usesVariable } from '../../lib/snippetSyntax'
import { snippetVariable, type SnippetContext } from '../../lib/snippetVariables'
import { lspTabId } from './lspHost'
import { setChoices, type ChoiceRange } from './snippetChoices'
import { snippetHost } from './snippetHost'

interface CommentTokens {
  line?: string
  block?: { open: string; close: string }
}

export interface ExpandOptions {
  /** Completion item that triggered the expansion (CodeMirror annotates the transaction with it). */
  completion?: Completion | null
  /** `TM_SELECTED_TEXT`: the text the snippet replaces or wraps. */
  selectedText?: string
}

async function readClipboard(): Promise<string> {
  try {
    return await navigator.clipboard.readText()
  } catch {
    return ''
  }
}

function contextAt(state: EditorState, from: number, selectedText: string, clipboard: string): SnippetContext {
  const tabId = state.facet(lspTabId)
  const host = snippetHost()
  const line = state.doc.lineAt(from)
  const word = state.wordAt(from)
  const comments = state.languageDataAt<CommentTokens>('commentTokens', from)[0]
  return {
    filePath: tabId ? host.filePath(tabId) : null,
    root: host.root(),
    selectedText,
    currentLine: line.text,
    currentWord: word ? state.sliceDoc(word.from, word.to) : '',
    lineIndex: line.number - 1,
    clipboard,
    lineComment: comments?.line,
    blockComment: comments?.block,
    now: new Date(),
    random: Math.random,
    uuid: () => crypto.randomUUID()
  }
}

/** Selections of each field, in Tab order, simulating `nextSnippetField` on the state (without touching the view). */
function fieldSelections(state: EditorState, count: number): (readonly SelectionRange[])[] {
  const fields = [state.selection.ranges]
  let current = state
  for (let i = 1; i < count; i++) {
    const moved = nextSnippetField({
      state: current,
      dispatch: (tr: Transaction) => {
        current = tr.state
      }
    })
    if (!moved) break
    fields.push(current.selection.ranges)
  }
  return fields
}

/**
 * Inserts `body` in place of `from…to`. With `CLIPBOARD` the read is async: if the document changed in the
 * meantime, the expansion is discarded (the positions no longer hold).
 */
export async function expandSnippet(
  view: EditorView,
  body: string,
  from: number,
  to: number,
  options: ExpandOptions = {}
): Promise<void> {
  const nodes = parseSnippet(body)
  const before = view.state.doc
  const clipboard = usesVariable(nodes, 'CLIPBOARD') ? await readClipboard() : ''
  if (view.state.doc !== before) return
  const ctx = contextAt(view.state, from, options.selectedText ?? '', clipboard)
  const converted = toCodeMirrorSnippet(resolveVariables(nodes, (name) => snippetVariable(name, ctx)))

  let inserted: Transaction | null = null
  snippet(converted.template)(
    { state: view.state, dispatch: (tr) => (inserted = tr) },
    options.completion ?? null,
    from,
    to
  )
  const tr = inserted as Transaction | null
  if (!tr) return
  view.dispatch(tr)
  if (converted.choices.size === 0) return

  const fields = fieldSelections(tr.state, converted.order.length)
  const choices: ChoiceRange[] = []
  converted.order.forEach((index, i) => {
    const opts = converted.choices.get(index)
    if (opts) for (const r of fields[i] ?? []) choices.push({ from: r.from, to: r.to, options: opts })
  })
  if (choices.length > 0) view.dispatch({ effects: setChoices.of(choices) })
}
