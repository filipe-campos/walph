import { describe, expect, it } from 'vitest'
import type { LspDocumentSymbol } from '@shared/types'
import {
  activeRowKey,
  collapsibleKeys,
  flattenSymbols,
  sameSymbolTree,
  sortSymbolTree,
  symbolIndexPathAt,
  symbolRows,
  symbolsAtPath
} from './symbolTree'

const range = (a: number, b: number) => ({ start: { line: a, character: 0 }, end: { line: b, character: 1 } })

function sym(name: string, kind: number, a: number, b: number, children: LspDocumentSymbol[] = []): LspDocumentSymbol {
  return { name, kind, range: range(a, b), selectionRange: range(a, a), children }
}

// class Zeta { beta() { inner }, alpha }, function gamma, interface Alpha
const tree = [
  sym('Zeta', 5, 0, 10, [sym('beta', 6, 1, 5, [sym('inner', 12, 2, 3)]), sym('alpha', 6, 6, 9)]),
  sym('gamma', 12, 12, 14),
  sym('Alpha', 11, 16, 18)
]

describe('flattenSymbols', () => {
  it('flattens in document order with the parents path and the name as the target', () => {
    const flat = flattenSymbols(tree, '/p/a.ts')
    expect(flat.map((s) => [s.name, s.containerName])).toEqual([
      ['Zeta', undefined],
      ['beta', 'Zeta'],
      ['inner', 'Zeta.beta'],
      ['alpha', 'Zeta'],
      ['gamma', undefined],
      ['Alpha', undefined]
    ])
    expect(flat[1].location).toEqual({ path: '/p/a.ts', range: range(1, 1) })
  })

  it('carries the detail when it exists', () => {
    expect(flattenSymbols([{ ...sym('f', 12, 0, 1), detail: '()' }], '/a')[0].detail).toBe('()')
  })
})

describe('symbolIndexPathAt / symbolsAtPath', () => {
  it('descends to the innermost symbol that contains the position', () => {
    expect(symbolIndexPathAt(tree, { line: 2, character: 0 })).toEqual([0, 0, 0])
    expect(symbolIndexPathAt(tree, { line: 7, character: 0 })).toEqual([0, 1])
    expect(symbolIndexPathAt(tree, { line: 13, character: 0 })).toEqual([1])
    expect(symbolIndexPathAt(tree, { line: 11, character: 0 })).toEqual([])
  })

  it('range edges count as inside', () => {
    expect(symbolIndexPathAt(tree, { line: 10, character: 1 })).toEqual([0])
    expect(symbolIndexPathAt(tree, { line: 10, character: 2 })).toEqual([])
  })

  it('resolves the path and stops at the index that no longer exists', () => {
    expect(symbolsAtPath(tree, [0, 0, 0]).map((s) => s.name)).toEqual(['Zeta', 'beta', 'inner'])
    expect(symbolsAtPath(tree, [0, 5, 0]).map((s) => s.name)).toEqual(['Zeta'])
  })
})

describe('sameSymbolTree', () => {
  it('compares content, not reference', () => {
    expect(sameSymbolTree(tree, structuredClone(tree))).toBe(true)
    const changed = structuredClone(tree)
    changed[0].children[1].range.end.line = 99
    expect(sameSymbolTree(tree, changed)).toBe(false)
    expect(sameSymbolTree(tree, tree.slice(1))).toBe(false)
  })
})

describe('sortSymbolTree', () => {
  it('position returns the tree itself', () => {
    expect(sortSymbolTree(tree, 'position')).toBe(tree)
  })

  it('name sorts all levels', () => {
    const sorted = sortSymbolTree(tree, 'name')
    expect(sorted.map((s) => s.name)).toEqual(['Alpha', 'gamma', 'Zeta'])
    expect(sorted[2].children.map((s) => s.name)).toEqual(['alpha', 'beta'])
    // Does not change the original tree.
    expect(tree[0].children.map((s) => s.name)).toEqual(['beta', 'alpha'])
  })

  it('kind groups by SymbolKind and breaks ties by name', () => {
    expect(sortSymbolTree(tree, 'kind').map((s) => s.name)).toEqual(['Zeta', 'Alpha', 'gamma'])
  })
})

describe('symbolRows', () => {
  it('without a filter shows everything open, with depth and expansion state', () => {
    const rows = symbolRows(tree, new Set())
    expect(rows.map((r) => [r.symbol.name, r.depth, r.expanded])).toEqual([
      ['Zeta', 0, true],
      ['beta', 1, true],
      ['inner', 2, null],
      ['alpha', 1, null],
      ['gamma', 0, null],
      ['Alpha', 0, null]
    ])
  })

  it('collapsed ones hide the children; the key is stable across equal trees', () => {
    const first = symbolRows(tree, new Set())
    const key = first[1].key
    expect(symbolRows(structuredClone(tree), new Set())[1].key).toBe(key)
    const rows = symbolRows(tree, new Set([key]))
    expect(rows.map((r) => r.symbol.name)).toEqual(['Zeta', 'beta', 'alpha', 'gamma', 'Alpha'])
    expect(rows[1].expanded).toBe(false)
  })

  it('namesakes on the same level get different keys', () => {
    const rows = symbolRows([sym('a', 12, 0, 1), sym('a', 12, 2, 3)], new Set())
    expect(new Set(rows.map((r) => r.key)).size).toBe(2)
  })

  it('the filter keeps the matching ones and their parents, with the matched letters', () => {
    const rows = symbolRows(tree, new Set([symbolRows(tree, new Set())[0].key]), 'inr')
    expect(rows.map((r) => r.symbol.name)).toEqual(['Zeta', 'beta', 'inner'])
    expect(rows.map((r) => r.expanded)).toEqual([true, true, null])
    expect(rows[2].matches.length).toBe(3)
    expect(rows[0].matches).toEqual([])
  })

  it('a parent that matches without a matching child shows closed', () => {
    const rows = symbolRows(tree, new Set(), 'Zeta')
    expect(rows.map((r) => [r.symbol.name, r.expanded])).toEqual([['Zeta', false]])
  })

  it('a filter without a match returns nothing', () => {
    expect(symbolRows(tree, new Set(), 'xyz')).toEqual([])
  })
})

describe('collapsibleKeys', () => {
  it('are the keys of all symbols with children', () => {
    const keys = collapsibleKeys(tree)
    const rows = symbolRows(tree, new Set())
    expect([...keys].sort()).toEqual([rows[0].key, rows[1].key].sort())
    expect(symbolRows(tree, keys).map((r) => r.symbol.name)).toEqual(['Zeta', 'gamma', 'Alpha'])
  })
})

describe('activeRowKey', () => {
  it('picks the innermost visible symbol of the path, even in a sorted tree (copy)', () => {
    const chain = symbolsAtPath(tree, [0, 0, 0])
    const sorted = sortSymbolTree(tree, 'name')
    const rows = symbolRows(sorted, new Set())
    expect(activeRowKey(rows, chain)).toBe(rows.find((r) => r.symbol.name === 'inner')!.key)
    const closed = symbolRows(sorted, new Set([rows.find((r) => r.symbol.name === 'Zeta')!.key]))
    expect(activeRowKey(closed, chain)).toBe(closed.find((r) => r.symbol.name === 'Zeta')!.key)
    expect(activeRowKey(rows, [])).toBeNull()
  })
})
