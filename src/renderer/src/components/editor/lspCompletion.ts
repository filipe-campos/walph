// LSP completion in `@codemirror/autocomplete`. The source enters through the state `languageData` (added to the
// language ones, such as keywords and variables of the file itself, never replacing them) and only applies to files
// with a ready server.
import {
  pickedCompletion,
  type Completion,
  type CompletionContext,
  type CompletionSource
} from '@codemirror/autocomplete'
import { EditorState, type Extension, type Text } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { omitUndefined } from '@shared/omitUndefined'
import type { TextEdit } from '@shared/searchReplace'
import type { LspCompletionItem } from '@shared/types'
import { lspRangeToOffsets, offsetToLspPosition } from '@shared/lspPosition'
import { isEmptyMarkup, renderMarkup } from '../../lib/lspMarkdown'
import { completionKindName, iconForType } from '../../lib/symbolKinds'
import { lspEditsToOffsetEdits } from '../../lib/workspaceEdit'
import { lspHost, lspTabId } from './lspHost'
import { forgetTriggers, serverTriggers } from './lspTriggers'
import { lspDocPath } from './lspSync'
import { choiceAt } from './snippetChoices'
import { expandSnippet } from './snippetExpand'

const WORD = /[\p{L}\p{N}_$]*/u
const WORD_ONLY = /^[\p{L}\p{N}_$]*$/u

// An item of the list, with what is needed to resolve and apply it later (the user may have typed more).
interface Entry {
  item: LspCompletionItem
  /** Position of the item in the server list (the `resolveCompletion` key). */
  index: number
  resultId: number
  /** Document the list was computed on: the server positions hold for it. */
  doc: Text
  tabId: string
  resolved?: Promise<LspCompletionItem>
  done?: LspCompletionItem
}

function resolveEntry(entry: Entry): Promise<LspCompletionItem> {
  if (!entry.item.resolvable) return Promise.resolve(entry.item)
  entry.resolved ??= window.api.lsp.resolveCompletion(entry.resultId, entry.index).then(
    (item) => (entry.done = item ?? entry.item),
    () => (entry.done = entry.item)
  )
  return entry.resolved
}

// ---------- Apply ----------

/** Extra edits (auto-import) ending before `limit`: those coming after would be shifted by what was typed. */
function extraEdits(item: LspCompletionItem, doc: Text, limit: number): TextEdit[] {
  if (!item.additionalTextEdits?.length) return []
  try {
    return lspEditsToOffsetEdits(doc, item.additionalTextEdits).filter((e) => e.to <= limit)
  } catch {
    return []
  }
}

/** Range and text to insert. The end of the server range goes up to the cursor: the user may have typed after. */
function mainEdit(
  item: LspCompletionItem,
  doc: Text,
  from: number,
  to: number
): { from: number; to: number; text: string } {
  if (item.textEdit) {
    const range = lspRangeToOffsets(doc, item.textEdit.range)
    return { from: Math.min(range.from, from), to, text: item.textEdit.newText }
  }
  return { from, to, text: item.insertText || item.label }
}

function applyEntry(view: EditorView, completion: Completion, from: number, to: number, entry: Entry): void {
  const item = entry.done ?? entry.item
  const main = mainEdit(item, entry.doc, from, to)
  const extra = extraEdits(item, entry.doc, main.from)
  const shift = extra.reduce((sum, e) => sum + e.insert.length - (e.to - e.from), 0)

  if (item.insertTextFormat === 'snippet') {
    // `snippet()` builds its own transaction: the extra edits go first, and the range follows the shift.
    if (extra.length) view.dispatch({ changes: extra, userEvent: 'input.complete' })
    void expandSnippet(view, main.text, main.from + shift, main.to + shift, { completion })
  } else {
    view.dispatch({
      changes: [...extra, { from: main.from, to: main.to, insert: main.text }],
      selection: { anchor: main.from + shift + main.text.length },
      userEvent: 'input.complete',
      annotations: pickedCompletion.of(completion)
    })
  }

  // TS only returns the auto-import when resolving the item. If the resolution did not finish before Enter, the edits
  // go
  // in as soon as they arrive, provided the document has not changed again (the positions are before the cursor).
  if (item.resolvable && !entry.done) {
    void resolveEntry(entry).then((resolved) => {
      // Only holds if the view still shows the same tab and nothing changed before the cursor: the server positions are
      // from `entry.doc` and the extra edits always sit before `main.from`.
      if (view.state.facet(lspTabId) !== entry.tabId) return
      if (view.state.doc.sliceString(0, main.from) !== entry.doc.sliceString(0, main.from)) return
      const late = extraEdits(resolved, entry.doc, main.from)
      if (late.length) view.dispatch({ changes: late, userEvent: 'input.complete' })
    })
  }
}

// ---------- Info (detail + documentation) ----------

async function completionInfo(entry: Entry): Promise<Node | null> {
  const item = await resolveEntry(entry)
  const dom = document.createElement('div')
  dom.className = 'lsp-completion-info'
  if (item.detail) {
    const detail = document.createElement('div')
    detail.className = 'lsp-info-detail'
    detail.textContent = item.detail
    dom.append(detail)
  }
  if (!isEmptyMarkup(item.documentation)) dom.append(renderMarkup(item.documentation!, lspDocPath(entry.tabId)))
  return dom.childNodes.length > 0 ? dom : null
}

// ---------- Source ----------

function lspCompletionSource(tabId: string): CompletionSource {
  return async (ctx: CompletionContext) => {
    const path = lspDocPath(tabId)
    const server = path ? lspHost().serverFor(path) : null
    // In a snippet choice field, the list is only the options.
    if (!path || !server || choiceAt(ctx.state)) return null
    if (!server.ready) {
      forgetTriggers(server.id)
      return null
    }

    const word = ctx.matchBefore(WORD)!
    // Numbers (`12`) do not ask for completion; Ctrl+Space always asks.
    if (!ctx.explicit && /^\p{N}/u.test(word.text)) return null
    let triggerCharacter: string | undefined
    if (word.text === '') {
      const previous = ctx.pos > 0 ? ctx.state.sliceDoc(ctx.pos - 1, ctx.pos) : ''
      if (previous && (await serverTriggers(path, server.id)).completion.includes(previous)) triggerCharacter = previous
      else if (!ctx.explicit) return null
    }

    const doc = ctx.state.doc
    let list
    try {
      list = await window.api.lsp.completion(path, offsetToLspPosition(doc, ctx.pos), triggerCharacter)
    } catch {
      return null
    }
    if (!list || list.items.length === 0 || ctx.aborted) return null

    // The server order (`sortText`) becomes `boost`: CodeMirror sorts by match and uses the boost to break ties.
    const ranked = list.items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => (a.item.sortText ?? a.item.label).localeCompare(b.item.sortText ?? b.item.label))
    const options: Completion[] = ranked.map(({ item, index }, rank) => {
      const entry: Entry = { item, index, resultId: list.resultId, doc, tabId }
      const label = item.filterText || item.label
      return {
        label,
        ...omitUndefined({
          displayLabel: label === item.label ? undefined : item.label,
          detail: item.detail,
          info: item.resolvable || item.documentation ? () => completionInfo(entry) : undefined
        }),
        type: completionKindName(item.kind),
        boost: Math.round(30 * (1 - rank / ranked.length)),
        apply: (view, completion, from, to) => applyEntry(view, completion, from, to, entry)
      }
    })
    return {
      from: word.from,
      options,
      // Incomplete list: the server decides again on every keystroke.
      ...(!list.isIncomplete && { validFor: WORD_ONLY })
    }
  }
}

/** LSP completion source for the tab, added to the language ones. */
export function lspCompletion(tabId: string): Extension {
  const source = lspCompletionSource(tabId)
  return EditorState.languageData.of(() => [{ autocomplete: source }])
}

/** Type icon (codicon colored by group), in place of the default CodeMirror icon. */
export const completionIcon = {
  render(completion: Completion): Node {
    const { icon, group } = iconForType(completion.type)
    const el = document.createElement('i')
    el.className = `codicon ${icon} cm-completionKind kind-${group}`
    el.setAttribute('aria-hidden', 'true')
    return el
  },
  position: 20
}
