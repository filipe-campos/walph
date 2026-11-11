import { describe, expect, it } from 'vitest'
import { normalizeDocumentSymbols, normalizeWorkspaceSymbols } from './symbols'

const r = (l: number) => ({ start: { line: l, character: 0 }, end: { line: l, character: 3 } })

const span = (a: number, b: number) => ({ start: { line: a, character: 0 }, end: { line: b, character: 1 } })

describe('normalizeDocumentSymbols', () => {
  it('keeps the DocumentSymbol tree with ranges and children in document order', () => {
    const symbols = normalizeDocumentSymbols([
      { name: 'B', kind: 12, range: r(6), selectionRange: r(6) },
      {
        name: 'A',
        kind: 5,
        range: span(0, 5),
        selectionRange: r(0),
        children: [
          { name: 'n', kind: 6, range: r(4), selectionRange: r(4) },
          {
            name: 'm',
            kind: 6,
            detail: '()',
            range: span(2, 3),
            selectionRange: r(2),
            children: [{ name: 'x', kind: 13, range: r(3), selectionRange: r(3) }]
          }
        ]
      }
    ])
    expect(symbols.map((s) => s.name)).toEqual(['A', 'B'])
    const a = symbols[0]
    expect(a.range).toEqual(span(0, 5))
    expect(a.selectionRange).toEqual(r(0))
    expect(a.children.map((c) => c.name)).toEqual(['m', 'n'])
    expect(a.children[0].detail).toBe('()')
    expect(a.children[0].children.map((c) => c.name)).toEqual(['x'])
  })

  it('without selectionRange uses the whole range (and vice versa)', () => {
    expect(normalizeDocumentSymbols([{ name: 'f', kind: 12, range: r(1) }])).toEqual([
      { name: 'f', kind: 12, range: r(1), selectionRange: r(1), children: [] }
    ])
  })

  it('SymbolInformation[] becomes a tree by range containment', () => {
    const symbols = normalizeDocumentSymbols([
      { name: 'm', kind: 6, containerName: 'C', location: { uri: 'file:///p/a.ts', range: span(1, 2) } },
      { name: 'C', kind: 5, location: { uri: 'file:///p/a.ts', range: span(0, 3) } },
      { name: 'f', kind: 12, location: { uri: 'file:///p/a.ts', range: span(5, 6) } }
    ])
    expect(symbols.map((s) => [s.name, s.children.map((c) => c.name)])).toEqual([
      ['C', ['m']],
      ['f', []]
    ])
    expect(symbols[0].selectionRange).toEqual(span(0, 3))
  })

  it('drops invalid items', () => {
    expect(
      normalizeDocumentSymbols([{ name: '', kind: 5, range: r(0) }, { name: 'a', kind: 99, range: r(0) }, 3])
    ).toEqual([])
    expect(normalizeDocumentSymbols([{ name: 'a', kind: 5 }])).toEqual([])
    expect(normalizeDocumentSymbols(null)).toEqual([])
  })
})

describe('normalizeWorkspaceSymbols', () => {
  const sym = (name: string, uri: string, range: unknown = r(0)) => ({ name, kind: 12, location: { uri, range } })

  it('only inside the folder, with a range, and honoring the limit', () => {
    const raw = [
      sym('a', 'file:///p/a.ts'),
      sym('outside', 'file:///x/a.ts'),
      sym('noRange', 'file:///p/b.ts', null),
      sym('lib', 'untitled:x'),
      sym('b', 'file:///p/c.ts')
    ]
    expect(normalizeWorkspaceSymbols(raw, '/p', 500, 'linux').map((s) => s.name)).toEqual(['a', 'b'])
    expect(normalizeWorkspaceSymbols(raw, '/p', 1, 'linux')).toHaveLength(1)
  })
})
