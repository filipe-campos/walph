// Quick Open symbol list (`@` file, `#` workspace): fuzzy filter and highlighting. Pure.
import type { LspSymbol } from '@shared/types'
import { fuzzyMatch } from './fuzzy'

export interface RankedSymbol {
  symbol: LspSymbol
  /** Indexes of `symbol.name` matched by the query (for highlighting). */
  matches: number[]
}

const SYMBOL_LIMIT = 300

const byPosition = (a: LspSymbol, b: LspSymbol): number =>
  a.location.range.start.line - b.location.range.start.line ||
  a.location.range.start.character - b.location.range.start.character

/**
 * `filter`: drops those that do not match (file symbols). Without `filter` (workspace) the server list is kept, only
 * the highlighting goes away when the server's match is not ours. An empty query keeps the received order (the
 * document's); with a query, best match first and the original order breaks ties.
 */
export function rankSymbols(
  query: string,
  symbols: LspSymbol[],
  options: { filter: boolean; limit?: number } = { filter: true }
): RankedSymbol[] {
  const limit = options.limit ?? SYMBOL_LIMIT
  const text = query.trim()
  if (!text) {
    // File symbols: document order (the server may return them in alphabetical order).
    const list = options.filter ? [...symbols].sort(byPosition) : symbols
    return list.slice(0, limit).map((symbol) => ({ symbol, matches: [] }))
  }
  const scored: (RankedSymbol & { score: number; order: number })[] = []
  symbols.forEach((symbol, order) => {
    const result = fuzzyMatch(text, symbol.name)
    if (result) scored.push({ symbol, matches: result.matches, score: result.score, order })
    else if (!options.filter) scored.push({ symbol, matches: [], score: -Infinity, order })
  })
  // `-Infinity - -Infinity` is NaN: compares those without a match only by order.
  scored.sort((a, b) => (a.score === b.score ? 0 : b.score - a.score) || a.order - b.order)
  return scored.slice(0, limit).map(({ symbol, matches }) => ({ symbol, matches }))
}

/**
 * Column (0-based) where to reveal a symbol: the workspace server returns the range of the whole declaration
 * (`export function foo`), so it looks for the name in the first line of the range, from its start. If not found,
 * keeps the start.
 */
export function locateSymbolName(lineText: string, name: string, startColumn: number): number {
  if (!name) return startColumn
  // Only as a whole identifier: `port` must not match inside `export`.
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const word = new RegExp(`(?<![\\p{L}\\p{N}_$])${escaped}(?![\\p{L}\\p{N}_$])`, 'gu')
  word.lastIndex = startColumn
  const found = word.exec(lineText)
  return found ? found.index : startColumn
}
