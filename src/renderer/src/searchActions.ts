// Global search actions (state in `store.search`). They live outside `store.ts` because of size; the store does not
// import this module (the reset on folder switch comes from a subscription below).
import type { ReplaceFileRequest, SearchResult } from '@shared/types'
import { createReplacer, planReplacements, relocateMatches } from '@shared/searchReplace'
import { t } from '@shared/i18n'
import { applyTabEdits } from './components/editor/documentStore'
import { currentState, getView, shownTabId } from './components/editor/groupViews'
import { get, onRootChange, set } from './store'
import { errorMessage } from './lib/errors'
import { createLatest } from './lib/latest'
import { basename } from './lib/path'
import {
  escapeRegex,
  pruneReplaced,
  searchKey,
  stepCursor,
  type SearchAnswer,
  type SearchState
} from './lib/searchResults'
import { notify } from './toasts'
import { showView } from './layoutActions'
import { syncTabWithDisk } from './diskSync'
import { confirmDialog } from './saveActions'
import { activeTab, openFile } from './tabActions'

const DEBOUNCE_MS = 250

function patchSearch(patch: Partial<SearchState>): void {
  set((s) => ({ search: { ...s.search, ...patch } }))
}

// ---------- Search (debounce + discarding stale answers) ----------

let timer: ReturnType<typeof setTimeout> | undefined
const requestSeq = createLatest()

function cancelPending(): void {
  clearTimeout(timer)
  timer = undefined
  requestSeq.invalidate()
}

async function runSearch(seq: number): Promise<void> {
  const { root, search } = get()
  if (!root || !search.query) return
  const { query, options } = search
  const key = searchKey(root, query, options)
  let result: SearchResult
  try {
    result = await window.api.search.find(root, query, options)
  } catch (err) {
    // An IPC failure becomes an answer with an error, otherwise "Searching…" would get stuck.
    result = { files: [], totalMatches: 0, truncated: false, error: errorMessage(err) }
  }
  // Newer search (or folder switched) → main killed this rg; the answer is not for the current query.
  if (!requestSeq.isCurrent(seq) || get().root !== root || result.cancelled) return
  patchSearch({ answer: { key, query, options, result }, collapsed: {}, cursor: null })
}

/** Schedules the search with the current query/options; an empty query drops the result. */
function scheduleSearch(immediate = false): void {
  cancelPending()
  const { root, search } = get()
  if (!root || !search.query) {
    if (search.answer || search.cursor) patchSearch({ answer: null, cursor: null, collapsed: {} })
    return
  }
  const seq = requestSeq.current()
  if (immediate) void runSearch(seq)
  else timer = setTimeout(() => void runSearch(seq), DEBOUNCE_MS)
}

// Switching folders invalidates the running search (the state itself is reset by `enterWorkspace`).
export function startSearchReactions(): () => void {
  return onRootChange(cancelPending)
}

/** Does the stored result answer the current search? */
function selectSearchAnswer(s: { root: string | null; search: SearchState }): SearchAnswer | null {
  const { answer, query, options } = s.search
  return answer && s.root && query && answer.key === searchKey(s.root, query, options) ? answer : null
}

export function selectSearchLoading(s: { root: string | null; search: SearchState }): boolean {
  return !!s.root && !!s.search.query && selectSearchAnswer(s) === null
}

// ---------- Fields ----------

export function setSearchQuery(query: string): void {
  patchSearch({ query })
  scheduleSearch()
}

export function setSearchReplace(replace: string): void {
  patchSearch({ replace })
}

export function toggleSearchOption(key: 'caseSensitive' | 'regex' | 'wholeWord'): void {
  patchSearch({ options: { ...get().search.options, [key]: !get().search.options[key] } })
  scheduleSearch()
}

export function setSearchFilter(key: 'include' | 'exclude', value: string): void {
  patchSearch({ options: { ...get().search.options, [key]: value } })
  scheduleSearch()
}

/** The replace field already got the requested focus: the next `showView('search')` focuses the query again. */
export function consumeFocusReplace(): void {
  if (get().search.focusReplace) patchSearch({ focusReplace: false })
}

export function toggleReplaceOpen(): void {
  patchSearch({ replaceOpen: !get().search.replaceOpen, focusReplace: false })
}

export function toggleFiltersOpen(): void {
  patchSearch({ filtersOpen: !get().search.filtersOpen })
}

export function refreshSearch(): void {
  scheduleSearch(true)
}

/** Clears query, replacement and result; keeps options and file filters. */
export function clearSearch(): void {
  cancelPending()
  patchSearch({ query: '', replace: '', answer: null, collapsed: {}, cursor: null })
}

// ---------- Collapse / expand ----------

export function collapseAllResults(): void {
  const files = selectSearchAnswer(get())?.result.files ?? []
  patchSearch({ collapsed: Object.fromEntries(files.map((f) => [f.path, true])) })
}

export function expandAllResults(): void {
  patchSearch({ collapsed: {} })
}

export function toggleResultFile(path: string): void {
  const collapsed = { ...get().search.collapsed }
  if (collapsed[path]) delete collapsed[path]
  else collapsed[path] = true
  patchSearch({ collapsed })
}

// ---------- Navigation ----------

/** Opens the match and marks it active in the list (expands the file, if collapsed). */
export function openSearchMatch(path: string, index: number): void {
  const match = selectSearchAnswer(get())?.result.files.find((f) => f.path === path)?.matches[index]
  if (!match) return
  // Only replace `collapsed` if the file was collapsed: a new object would rerender every row of the list.
  const { collapsed } = get().search
  if (collapsed[path]) {
    const next = { ...collapsed }
    delete next[path]
    patchSearch({ cursor: { path, index }, collapsed: next })
  } else patchSearch({ cursor: { path, index } })
  openFile(path, { line: match.line, column: match.column, length: match.length }, { preview: true })
}

/** F4 (`1`) / ⇧F4 (`-1`): walks the matches in order, wrapping around. Without results, does nothing. */
export function stepSearchResult(dir: 1 | -1): void {
  const answer = selectSearchAnswer(get())
  if (!answer) return
  const next = stepCursor(answer.result.files, get().search.cursor, dir)
  if (next) openSearchMatch(next.path, next.index)
}

// ---------- ⌘⇧F / ⌘⇧H ----------

/** Single-line selection in the visible file editor, or `null`. */
function editorSelection(): string | null {
  const view = getView()
  const tab = activeTab()
  if (!view || tab?.kind !== 'file' || shownTabId() !== tab.id) return null
  const { from, to } = view.state.selection.main
  if (from === to) return null
  const text = view.state.sliceDoc(from, to)
  return text.includes('\n') ? null : text
}

/** Shows the search (with the replace field if `replace`) filling the query with the editor selection. */
export function showSearch(replace: boolean): void {
  const selected = editorSelection()
  if (selected !== null) {
    const query = get().search.options.regex ? escapeRegex(selected) : selected
    if (query !== get().search.query) setSearchQuery(query)
  }
  patchSearch(replace ? { replaceOpen: true, focusReplace: true } : { focusReplace: false })
  showView('search')
}

// ---------- Replace ----------

type Scope = { kind: 'all' } | { kind: 'file'; path: string } | { kind: 'match'; path: string; index: number }

/** How many matches / files the scope reaches. */
export function countScope(result: SearchResult, scope: Scope): { matches: number; files: number } {
  if (scope.kind === 'all')
    return { matches: result.files.reduce((n, f) => n + f.matches.length, 0), files: result.files.length }
  if (scope.kind === 'match') return { matches: 1, files: 1 }
  const file = result.files.find((f) => f.path === scope.path)
  return { matches: file?.matches.length ?? 0, files: file ? 1 : 0 }
}

export async function replaceInResults(scope: Scope): Promise<void> {
  const state = get()
  const answer = selectSearchAnswer(state)
  if (!answer || state.search.replacing || answer.result.error) return
  const { root } = state
  if (!root) return
  const replacement = state.search.replace
  const replacer = createReplacer(answer.query, replacement, answer.options)
  if (!replacer) {
    notify(t().search.actions.invalidRegex)
    return
  }

  const targets = answer.result.files
    .filter((f) => scope.kind === 'all' || f.path === scope.path)
    .map((f) => ({
      path: f.path,
      indices: scope.kind === 'match' ? [scope.index] : f.matches.map((_, i) => i),
      matches: f.matches
    }))
    .filter((target) => target.indices.length > 0 && target.indices.every((i) => target.matches[i]))
  if (targets.length === 0) return

  // `replacing` already applies during the dialog: blocks replacing one/file and a second "all" while it is open.
  patchSearch({ replacing: true })
  if (scope.kind === 'all') {
    const { matches, files } = countScope(answer.result, scope)
    const m = t().search.actions
    const ok = await confirmDialog({
      message: replacement ? m.confirmReplace(matches, files, replacement) : m.confirmRemove(matches, files),
      ...(answer.result.truncated && { detail: m.truncated }),
      confirmLabel: m.replace,
      destructive: true
    })
    // The dialog is async: the search may have changed (or been cleared) while it was open.
    if (!ok || get().root !== root || get().search.answer !== answer) {
      patchSearch({ replacing: false })
      return
    }
  }

  const replaced = new Map<string, Set<number>>()
  let skippedTotal = 0
  let replacedTotal = 0
  const record = (path: string, indices: number[], skipped: number[]): void => {
    const skip = new Set(skipped)
    const done = new Set(indices.filter((_, j) => !skip.has(j)))
    skippedTotal += skip.size
    replacedTotal += done.size
    replaced.set(path, done)
  }

  try {
    const disk: (ReplaceFileRequest & { indices: number[] })[] = []
    for (const target of targets) {
      const tab = get().tabs.find((x) => x.kind === 'file' && x.path === target.path)
      const matches = target.indices.flatMap((i) => {
        const match = target.matches[i]
        return match ? [match] : []
      })
      // `record` pairs `skipped` with `indices` by position: without all the matches, the whole target is left out.
      if (matches.length !== target.indices.length) continue
      if (tab?.kind === 'file' && tab.dirty) {
        // Dirty tab: the truth is the editor buffer, not the disk.
        const editorState = currentState(tab.id)
        if (!editorState) {
          notify(t().search.actions.editorUnreadable(basename(target.path)))
          continue
        }
        // The buffer may have more/fewer lines than the disk: realign the line numbers before planning.
        const content = editorState.doc.toString()
        const plan = planReplacements(content, relocateMatches(content, matches), replacer)
        applyTabEdits(tab.id, plan.edits)
        record(target.path, target.indices, plan.skipped)
      } else disk.push({ path: target.path, matches, indices: target.indices })
    }
    if (disk.length > 0) {
      const res = await window.api.search.replace(root, {
        query: answer.query,
        options: answer.options,
        replacement,
        files: disk.map(({ path, matches }) => ({ path, matches }))
      })
      for (const file of disk) {
        const outcome = res.files.find((o) => o.path === file.path)
        if (!outcome) continue
        if (outcome.error) notify(`${basename(file.path)}: ${outcome.error}`)
        else record(file.path, file.indices, outcome.skipped)
        // Open tab: reconcile now, without waiting for the watcher (rereads the disk and only reloads if still clean).
        const tab = get().tabs.find((x) => x.kind === 'file' && x.path === file.path)
        if (tab?.kind === 'file' && !outcome.error && outcome.replaced > 0) void syncTabWithDisk(tab.id)
      }
    }
  } catch (err) {
    notify(errorMessage(err))
  }

  // Do not rerun the search (dirty tab matches would reappear): adjust the stored result, if it is still the same.
  try {
    if (get().search.answer === answer && get().root === root) {
      patchSearch({ answer: { ...answer, result: pruneReplaced(answer.result, replaced, replacer) }, cursor: null })
    }
  } finally {
    // Always release: with the flag stuck, no replacement would work anymore in this window.
    patchSearch({ replacing: false })
  }

  if (replacedTotal > 0 && skippedTotal === 0 && scope.kind === 'all')
    notify(t().search.actions.replaced(replacedTotal, replaced.size), 'info')
  if (skippedTotal > 0) notify(t().search.actions.skipped(skippedTotal))
}

export function replaceAllResults(): void {
  void replaceInResults({ kind: 'all' })
}
