import { describe, expect, it } from 'vitest'
import type { LspSymbol } from '@shared/types'
import { locateSymbolName, rankSymbols } from './lspSymbols'

const sym = (name: string, line = 0): LspSymbol => ({
  name,
  kind: 12,
  location: { path: '/a.ts', range: { start: { line, character: 0 }, end: { line, character: 1 } } }
})

describe('rankSymbols', () => {
  const symbols = [sym('openFile', 1), sym('closeTab', 5), sym('openFolder', 9), sym('Foo', 12)]

  it('keeps the document order without a query', () => {
    expect(rankSymbols('', symbols).map((r) => r.symbol.name)).toEqual(['openFile', 'closeTab', 'openFolder', 'Foo'])
    expect(rankSymbols('  ', symbols)).toHaveLength(4)
  })

  it('sorts by document position when the server returns them out of order', () => {
    const shuffled = [sym('b', 9), sym('a', 1), sym('c', 5)]
    expect(rankSymbols('', shuffled).map((r) => r.symbol.name)).toEqual(['a', 'c', 'b'])
    expect(rankSymbols('', shuffled, { filter: false }).map((r) => r.symbol.name)).toEqual(['b', 'a', 'c'])
  })

  it('filters and highlights by name', () => {
    const ranked = rankSymbols('opf', symbols)
    expect(ranked.map((r) => r.symbol.name)).toEqual(expect.arrayContaining(['openFile', 'openFolder']))
    expect(ranked.map((r) => r.symbol.name)).not.toContain('closeTab')
    expect(ranked[0].matches.length).toBe(3)
  })

  it('without filter keeps those the server returned, after the matching ones', () => {
    const ranked = rankSymbols('foo', symbols, { filter: false })
    expect(ranked[0].symbol.name).toBe('Foo')
    expect(ranked).toHaveLength(4)
    expect(ranked.at(-1)!.matches).toEqual([])
  })

  it('respects the limit', () => {
    expect(rankSymbols('', symbols, { filter: true, limit: 2 })).toHaveLength(2)
  })
})

describe('locateSymbolName', () => {
  it('keeps the start when it is already on the name', () => {
    expect(locateSymbolName('foo()', 'foo', 0)).toBe(0)
  })

  it('finds the name after the declaration keyword', () => {
    expect(locateSymbolName('export function computeTotal(a) {', 'computeTotal', 0)).toBe(16)
  })

  it('only matches whole identifiers', () => {
    expect(locateSymbolName('export const port = 1', 'port', 0)).toBe(13)
    expect(locateSymbolName('export const x = 1', 'x', 0)).toBe(13)
    expect(locateSymbolName('export const $x = 1', 'x', 0)).toBe(0)
  })

  it('searches from the start of the range and falls back to it if not found', () => {
    expect(locateSymbolName('a foo foo', 'foo', 3)).toBe(6)
    expect(locateSymbolName('abc', 'zzz', 1)).toBe(1)
  })
})
