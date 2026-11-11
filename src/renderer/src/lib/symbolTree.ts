// Symbol tree of a document (`LspDocumentSymbol`): flattening for the `@` picker, path to the cursor position
// (breadcrumbs, Outline), sorting, filtering and the visible rows of the Outline. Pure.
import type { LspDocumentSymbol, LspPosition, LspRange, LspSymbol } from '@shared/types'
import { compareText } from '@shared/i18n'
import { fuzzyMatch } from './fuzzy'

export type SymbolSortOrder = 'position' | 'name' | 'kind'

const comparePosition = (a: LspPosition, b: LspPosition): number => a.line - b.line || a.character - b.character

const rangeContains = (range: LspRange, pos: LspPosition): boolean =>
  comparePosition(range.start, pos) <= 0 && comparePosition(pos, range.end) <= 0

/** Flat list in document order, with the parents path in `containerName` and the name as the target. */
export function flattenSymbols(tree: LspDocumentSymbol[], path: string): LspSymbol[] {
  const result: LspSymbol[] = []
  const visit = (nodes: LspDocumentSymbol[], parents: string[]): void => {
    for (const node of nodes) {
      result.push({
        name: node.name,
        kind: node.kind,
        ...(node.detail !== undefined && { detail: node.detail }),
        ...(parents.length > 0 && { containerName: parents.join('.') }),
        location: { path, range: node.selectionRange }
      })
      visit(node.children, [...parents, node.name])
    }
  }
  visit(tree, [])
  return result
}

/**
 * Indexes (from the root inwards) of the symbols whose range contains `pos`. Among overlapping siblings the last one
 * that starts before the position wins (the innermost in badly nested lists).
 */
export function symbolIndexPathAt(tree: LspDocumentSymbol[], pos: LspPosition): number[] {
  const path: number[] = []
  let level = tree
  for (;;) {
    let found = -1
    level.forEach((node, i) => {
      if (rangeContains(node.range, pos)) found = i
    })
    const node = level[found]
    if (!node) return path
    path.push(found)
    level = node.children
  }
}

/** The symbols of an index path (for when the path is older than the tree, it stops at what does not exist). */
export function symbolsAtPath(tree: LspDocumentSymbol[], indices: readonly number[]): LspDocumentSymbol[] {
  const result: LspDocumentSymbol[] = []
  let level = tree
  for (const index of indices) {
    const node = level[index]
    if (!node) break
    result.push(node)
    level = node.children
  }
  return result
}

/** Trees equal in content (to keep the previous reference and not redraw whoever shows it). */
export function sameSymbolTree(a: readonly LspDocumentSymbol[], b: readonly LspDocumentSymbol[]): boolean {
  if (a.length !== b.length) return false
  return a.every((x, i) => {
    const y = b[i]
    return (
      !!y &&
      x.name === y.name &&
      x.kind === y.kind &&
      x.detail === y.detail &&
      sameRange(x.range, y.range) &&
      sameRange(x.selectionRange, y.selectionRange) &&
      sameSymbolTree(x.children, y.children)
    )
  })
}

const sameRange = (a: LspRange, b: LspRange): boolean =>
  comparePosition(a.start, b.start) === 0 && comparePosition(a.end, b.end) === 0

// "By category" order as in VS Code: the `SymbolKind` value groups (modules, classes, methods…).
const comparators: Record<SymbolSortOrder, (a: LspDocumentSymbol, b: LspDocumentSymbol) => number> = {
  position: (a, b) => comparePosition(a.range.start, b.range.start),
  name: (a, b) => compareText(a.name, b.name) || comparePosition(a.range.start, b.range.start),
  kind: (a, b) => a.kind - b.kind || compareText(a.name, b.name) || comparePosition(a.range.start, b.range.start)
}

/** Sorted copy at all levels (`position` returns the tree itself, which already comes in document order). */
export function sortSymbolTree(tree: LspDocumentSymbol[], order: SymbolSortOrder): LspDocumentSymbol[] {
  if (order === 'position') return tree
  const compare = comparators[order]
  const visit = (nodes: LspDocumentSymbol[]): LspDocumentSymbol[] =>
    [...nodes].sort(compare).map((node) => (node.children.length ? { ...node, children: visit(node.children) } : node))
  return visit(tree)
}

/** Visible row of the Outline. `key` identifies the symbol across edits (name + kind + order among namesakes). */
export interface SymbolRow {
  key: string
  symbol: LspDocumentSymbol
  depth: number
  /** `null` = no children. */
  expanded: boolean | null
  /** Indexes matched by the filter in `symbol.name`. */
  matches: number[]
}

/** The children with the key of each (the parent key + kind and name; namesakes get `#n` in the level order). */
function keyed(nodes: LspDocumentSymbol[], parentKey: string): [string, LspDocumentSymbol][] {
  const seen = new Map<string, number>()
  return nodes.map((symbol) => {
    const base = `${parentKey}/${symbol.kind}:${symbol.name}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return [n ? `${base}#${n}` : base, symbol]
  })
}

/**
 * Visible rows of the tree. With `query`, the symbols that match (fuzzy) and their parents stay, open down to what
 * matched; without it, `collapsed` (keys) decides which are closed.
 */
export function symbolRows(tree: LspDocumentSymbol[], collapsed: ReadonlySet<string>, query = ''): SymbolRow[] {
  const text = query.trim()
  // Returns whether some symbol of the level got in (to keep the parents in the filter).
  const visit = (nodes: LspDocumentSymbol[], parentKey: string, depth: number, out: SymbolRow[]): boolean => {
    let any = false
    for (const [key, symbol] of keyed(nodes, parentKey)) {
      const parent = symbol.children.length > 0
      if (text) {
        const match = fuzzyMatch(text, symbol.name)
        const children: SymbolRow[] = []
        const childMatched = visit(symbol.children, key, depth + 1, children)
        if (!match && !childMatched) continue
        out.push({ key, symbol, depth, expanded: parent ? childMatched : null, matches: match?.matches ?? [] })
        out.push(...children)
      } else {
        const open = parent && !collapsed.has(key)
        out.push({ key, symbol, depth, expanded: parent ? open : null, matches: [] })
        if (open) visit(symbol.children, key, depth + 1, out)
      }
      any = true
    }
    return any
  }
  const rows: SymbolRow[] = []
  visit(tree, '', 0, rows)
  return rows
}

/** Keys of all symbols with children (Collapse All). */
export function collapsibleKeys(tree: LspDocumentSymbol[]): Set<string> {
  const keys = new Set<string>()
  const visit = (nodes: LspDocumentSymbol[], parentKey: string): void => {
    for (const [key, symbol] of keyed(nodes, parentKey)) {
      if (symbol.children.length === 0) continue
      keys.add(key)
      visit(symbol.children, key)
    }
  }
  visit(tree, '')
  return keys
}

const sameSymbol = (a: LspDocumentSymbol, b: LspDocumentSymbol): boolean =>
  a.name === b.name && a.kind === b.kind && sameRange(a.selectionRange, b.selectionRange)

/**
 * Row to highlight for the cursor: the innermost symbol of `chain` (path to the cursor) that is visible. Sorting
 * copies the nodes, so the comparison is by content.
 */
export function activeRowKey(rows: readonly SymbolRow[], chain: readonly LspDocumentSymbol[]): string | null {
  for (let i = chain.length - 1; i >= 0; i--) {
    const target = chain[i]
    const row = target && rows.find((r) => r.depth === i && sameSymbol(r.symbol, target))
    if (row) return row.key
  }
  return null
}
