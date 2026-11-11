// Pure logic of the global search results: initial state, F4 navigation and updating the results after
// replacing (without redoing the search, so dirty tabs do not make the matches reappear).
import type { SearchFileResult, SearchMatch, SearchOptions, SearchResult } from '@shared/types'
import type { Replacer } from '@shared/searchReplace'

/** Response of a search, with what produced it (the replacement needs the original query and options). */
export interface SearchAnswer {
  key: string
  query: string
  options: SearchOptions
  result: SearchResult
}

export interface SearchCursor {
  path: string
  /** Index into `SearchFileResult.matches`. */
  index: number
}

export interface SearchState {
  query: string
  replace: string
  replaceOpen: boolean
  /** Includes `include`/`exclude` (raw text of the fields). */
  options: SearchOptions
  filtersOpen: boolean
  answer: SearchAnswer | null
  /** Collapsed files (path → true). */
  collapsed: Record<string, boolean>
  cursor: SearchCursor | null
  replacing: boolean
  /** The next focus request (`searchFocus` in `requests`) goes to the replace field. */
  focusReplace: boolean
}

export function createSearchState(): SearchState {
  return {
    query: '',
    replace: '',
    replaceOpen: false,
    options: { caseSensitive: false, regex: false, wholeWord: false, include: '', exclude: '' },
    filtersOpen: false,
    answer: null,
    collapsed: {},
    cursor: null,
    replacing: false,
    focusReplace: false
  }
}

/** Identifies the current search: the result only counts if `answer.key` is equal. */
export function searchKey(root: string | null, query: string, options: SearchOptions): string {
  return JSON.stringify([root, query, options])
}

/** Escapes the editor selection to become a literal query in regex mode. */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}

/**
 * Next (`1`) or previous (`-1`) match in the flat list, wrapping around to the start/end; without a valid cursor, the
 * first/last.
 */
export function stepCursor(files: SearchFileResult[], cursor: SearchCursor | null, dir: 1 | -1): SearchCursor | null {
  const flat: SearchCursor[] = []
  for (const file of files) file.matches.forEach((_, index) => flat.push({ path: file.path, index }))
  const [first] = flat
  if (!first) return null
  const at = cursor ? flat.findIndex((c) => c.path === cursor.path && c.index === cursor.index) : -1
  if (at < 0) return dir === 1 ? first : (flat.at(-1) ?? first)
  return flat[(at + dir + flat.length) % flat.length] ?? first
}

/**
 * Removes from the results the matches already replaced (`replaced`: path → indexes into `matches`). Those left on the
 * same line get the new line text and the shifted column; those that overlapped a replacement disappear (the span
 * no longer exists). Files without matches leave; `totalMatches` follows.
 */
export function pruneReplaced(
  result: SearchResult,
  replaced: Map<string, Set<number>>,
  replacer: Replacer
): SearchResult {
  let removed = 0
  const files: SearchFileResult[] = []
  for (const file of result.files) {
    const done = replaced.get(file.path)
    if (!done || done.size === 0) {
      files.push(file)
      continue
    }
    const edits = new Map<number, { column: number; length: number; insert: string }[]>()
    const gone = new Set<number>()
    file.matches.forEach((m, i) => {
      if (!done.has(i)) return
      const insert = replacer(m.text, m)
      if (insert === null) return // should not happen; keeps the match
      gone.add(i)
      const list = edits.get(m.line) ?? []
      list.push({ column: m.column, length: m.length, insert })
      edits.set(m.line, list)
    })
    const matches: SearchMatch[] = []
    file.matches.forEach((m, i) => {
      if (gone.has(i)) return
      const list = edits.get(m.line)
      if (!list) {
        matches.push(m)
        return
      }
      if (list.some((e) => m.column < e.column + e.length && e.column < m.column + m.length)) return
      let delta = 0
      let text = ''
      let pos = 0
      for (const e of [...list].sort((a, b) => a.column - b.column)) {
        text += m.text.slice(pos, e.column) + e.insert
        pos = e.column + e.length
        if (e.column + e.length <= m.column) delta += e.insert.length - e.length
      }
      matches.push({ ...m, column: m.column + delta, text: text + m.text.slice(pos) })
    })
    removed += file.matches.length - matches.length
    if (matches.length > 0) files.push({ ...file, matches })
  }
  return { ...result, files, totalMatches: Math.max(0, result.totalMatches - removed) }
}
