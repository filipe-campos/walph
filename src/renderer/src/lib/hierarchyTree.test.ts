import { describe, expect, it } from 'vitest'
import type { LspHierarchyItem } from '@shared/types'
import { defaultDirection, flattenHierarchy, nodeTarget, toNode, type HierarchyState } from './hierarchyTree'

const range = (l: number) => ({ start: { line: l, character: 0 }, end: { line: l, character: 3 } })
const item = (id: number): LspHierarchyItem => ({
  id,
  kind: 'call',
  name: `n${id}`,
  symbolKind: 12,
  path: `/p/n${id}.ts`,
  range: range(0),
  selectionRange: range(1)
})
const node = (id: number, ranges = [range(9)]) => toNode({ item: item(id), ranges })

const state = (over: Partial<HierarchyState> = {}): HierarchyState => ({
  kind: 'call',
  direction: 'incoming',
  name: 'n1',
  roots: [node(1, [])],
  children: {},
  expanded: {},
  ...over
})

describe('flattenHierarchy', () => {
  it('collapsed shows only the roots; expanded without a reply shows "loading"', () => {
    expect(flattenHierarchy(state()).map((r) => r.key)).toEqual(['1'])
    const rows = flattenHierarchy(state({ expanded: { '1': true } }))
    expect(rows.map((r) => (r.type === 'status' ? r.status : r.key))).toEqual(['1', 'loading'])
  })

  it('children in depth, with the parent of each row; empty and error become a state row', () => {
    const rows = flattenHierarchy(
      state({
        expanded: { '1': true, '2': true, '3': true },
        children: { '1': [node(2), node(3)], '2': [], '3': 'error' }
      })
    )
    expect(rows.map((r) => [r.type === 'node' ? r.key : r.status, r.depth, r.parentKey])).toEqual([
      ['1', 0, null],
      ['2', 1, '1'],
      ['empty', 2, '2'],
      ['3', 1, '1'],
      ['error', 2, '3']
    ])
  })
})

describe('nodeTarget', () => {
  it('an incoming call goes to the call site; the rest goes to the symbol name', () => {
    const n = node(2)
    expect(nodeTarget(n, 'incoming')).toEqual({ path: '/p/n2.ts', range: range(9) })
    expect(nodeTarget(n, 'outgoing')).toEqual({ path: '/p/n2.ts', range: range(1) })
    expect(nodeTarget(node(3, []), 'incoming')).toEqual({ path: '/p/n3.ts', range: range(1) })
  })

  it('default direction by kind', () => {
    expect(defaultDirection('call')).toBe('incoming')
    expect(defaultDirection('type')).toBe('subtypes')
  })
})
