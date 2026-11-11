import { describe, expect, it } from 'vitest'
import {
  hierarchyKindOf,
  HierarchyStore,
  normalizeHierarchyEdges,
  normalizeHierarchyItem,
  normalizeHierarchyItems
} from './hierarchy'

const range = (l: number) => ({ start: { line: l, character: 0 }, end: { line: l, character: 4 } })
const raw = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  kind: 12,
  uri: `file:///p/${name}.ts`,
  range: range(1),
  selectionRange: range(2),
  data: { id: name },
  ...extra
})

describe('normalizeHierarchyItem', () => {
  it('keeps the raw item and normalizes name, kind, detail, path and ranges', () => {
    const item = raw('run', { detail: 'src/run.ts' })
    expect(normalizeHierarchyItem(item, 'call', 'linux')).toEqual({
      raw: item,
      item: {
        kind: 'call',
        name: 'run',
        symbolKind: 12,
        detail: 'src/run.ts',
        path: '/p/run.ts',
        range: range(1),
        selectionRange: range(2)
      }
    })
  })

  it('without selectionRange uses the range; an unknown kind becomes 0; control chars leave the text', () => {
    const { item } = normalizeHierarchyItem(raw('a\nb', { kind: 99, selectionRange: null }), 'type', 'linux')!
    expect(item).toMatchObject({ name: 'a b', symbolKind: 0, selectionRange: range(1) })
  })

  it('drops malformed or outside file://', () => {
    expect(normalizeHierarchyItem(raw('x', { uri: 'untitled:1' }), 'call', 'linux')).toBeNull()
    expect(normalizeHierarchyItem(raw('', {}), 'call', 'linux')).toBeNull()
    expect(normalizeHierarchyItem(raw('x', { range: 'r' }), 'call', 'linux')).toBeNull()
    expect(normalizeHierarchyItem([], 'call', 'linux')).toBeNull()
    expect(normalizeHierarchyItems({ not: 'a list' }, 'call')).toEqual([])
  })
})

describe('normalizeHierarchyEdges', () => {
  it('incoming uses `from`, outgoing uses `to`; both carry fromRanges', () => {
    const call = { from: raw('caller'), to: raw('callee'), fromRanges: [range(5), 'x'] }
    expect(normalizeHierarchyEdges([call], 'incoming', 'linux')[0]).toMatchObject({
      item: { name: 'caller' },
      ranges: [range(5)]
    })
    expect(normalizeHierarchyEdges([call, 'junk'], 'outgoing', 'linux')).toHaveLength(1)
    expect(normalizeHierarchyEdges([call], 'outgoing', 'linux')[0]?.item.name).toBe('callee')
  })

  it('types arrive as items, without call ranges', () => {
    const edges = normalizeHierarchyEdges([raw('Base'), { name: 1 }], 'supertypes', 'linux')
    expect(edges).toEqual([expect.objectContaining({ item: expect.objectContaining({ kind: 'type' }), ranges: [] })])
    expect(normalizeHierarchyEdges(null, 'subtypes')).toEqual([])
  })

  it('direction → hierarchy kind', () => {
    expect(hierarchyKindOf('incoming')).toBe('call')
    expect(hierarchyKindOf('subtypes')).toBe('type')
  })
})

describe('HierarchyStore', () => {
  it('increasing ids, forgets by owner and clears', () => {
    const store = new HierarchyStore<string>()
    const a = store.add('ts', 'call', { a: 1 })
    const b = store.add('py', 'type', { b: 1 })
    expect(b).toBeGreaterThan(a)
    expect(store.get(a)).toEqual({ owner: 'ts', kind: 'call', raw: { a: 1 } })
    store.dropOwner((o) => o === 'ts')
    expect(store.get(a)).toBeUndefined()
    store.clear()
    expect(store.get(b)).toBeUndefined()
  })

  it('exceeding the limit drops the oldest', () => {
    const store = new HierarchyStore<string>()
    const first = store.add('ts', 'call', {})
    for (let i = 0; i < 10_000; i++) store.add('ts', 'call', {})
    expect(store.get(first)).toBeUndefined()
    expect(store.get(first + 1)).toBeDefined()
  })
})
