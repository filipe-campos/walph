import { describe, expect, it } from 'vitest'
import {
  MAX_EDITOR_GROUPS,
  layoutGroups,
  layoutRects,
  layoutSashes,
  mapLayout,
  neighborGroup,
  parseLayout,
  reconcileLayout,
  resizeLayout,
  rowLayout,
  splitLayout,
  type LayoutNode
} from './editorLayout'

const leaf = (group: string): LayoutNode<string> => ({ group })

/** a | (b / c) */
const tree: LayoutNode<string> = {
  direction: 'row',
  children: [leaf('a'), { direction: 'column', children: [leaf('b'), leaf('c')], sizes: [0.5, 0.5] }],
  sizes: [0.5, 0.5]
}

describe('splitLayout', () => {
  it('a leaf becomes a split with the new one on the requested side', () => {
    expect(splitLayout(leaf('a'), 'a', 'b', 'right')).toEqual({
      direction: 'row',
      children: [leaf('a'), leaf('b')],
      sizes: [0.5, 0.5]
    })
    expect(splitLayout(leaf('a'), 'a', 'b', 'up')).toEqual({
      direction: 'column',
      children: [leaf('b'), leaf('a')],
      sizes: [0.5, 0.5]
    })
  })

  it('in the same direction as the parent it joins as a sibling, sharing the target space', () => {
    const next = splitLayout(tree, 'a', 'd', 'right')
    expect(next).toMatchObject({ direction: 'row', sizes: [0.25, 0.25, 0.5] })
    expect(layoutGroups(next)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('in a different direction it nests', () => {
    const next = splitLayout(tree, 'b', 'd', 'right')
    expect(layoutGroups(next)).toEqual(['a', 'b', 'd', 'c'])
    expect(next).toMatchObject({
      children: [{}, { direction: 'column', children: [{ direction: 'row', sizes: [0.5, 0.5] }, {}] }]
    })
  })
})

describe('mapLayout', () => {
  it('removes leaves, redistributes the space and undoes a single-child split', () => {
    expect(mapLayout(tree, (g) => (g === 'c' ? null : g))).toEqual({
      direction: 'row',
      children: [leaf('a'), leaf('b')],
      sizes: [0.5, 0.5]
    })
    expect(mapLayout(tree, () => null)).toBeNull()
  })

  it('a child in the same direction as the parent is flattened', () => {
    const nested: LayoutNode<string> = {
      direction: 'row',
      children: [leaf('x'), { direction: 'column', children: [leaf('y'), tree], sizes: [0.5, 0.5] }],
      sizes: [0.5, 0.5]
    }
    const flat = mapLayout(nested, (g) => (g === 'y' ? null : g))
    expect(flat).toMatchObject({ direction: 'row', sizes: [0.5, 0.25, 0.25] })
    expect(layoutGroups(flat!)).toEqual(['x', 'a', 'b', 'c'])
  })
})

describe('rowLayout', () => {
  it('one group is a leaf; invalid fractions become equal parts', () => {
    expect(rowLayout(['a'])).toEqual(leaf('a'))
    expect(rowLayout(['a', 'b'], [NaN, 1])).toEqual({
      direction: 'row',
      children: [leaf('a'), leaf('b')],
      sizes: [0.5, 0.5]
    })
    expect(rowLayout([])).toBeNull()
  })
})

describe('resizeLayout', () => {
  it('moves the divider respecting the minimum', () => {
    expect(resizeLayout(tree, [], 0, 0.1)).toMatchObject({ sizes: [0.6, 0.4] })
    expect(resizeLayout(tree, [], 0, -1)).toMatchObject({ sizes: [0.05, 0.95] })
    expect(resizeLayout(tree, [1], 0, 0.2)).toMatchObject({ children: [{}, { sizes: [0.7, 0.30000000000000004] }] })
  })

  it('a missing path or divider returns the same tree', () => {
    expect(resizeLayout(tree, [0], 0, 0.1)).toBe(tree)
    expect(resizeLayout(tree, [], 3, 0.1)).toBe(tree)
    expect(resizeLayout(tree, [], 0, NaN)).toBe(tree)
  })
})

describe('geometry', () => {
  it('rectangles of each group', () => {
    expect(layoutRects(tree)).toEqual([
      { group: 'a', rect: { x: 0, y: 0, w: 0.5, h: 1 } },
      { group: 'b', rect: { x: 0.5, y: 0, w: 0.5, h: 0.5 } },
      { group: 'c', rect: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 } }
    ])
  })

  it('one divider per boundary, with the split path', () => {
    expect(layoutSashes(tree)).toEqual([
      { path: [], index: 0, direction: 'row', at: 0.5, from: 0, length: 1, extent: 1 },
      { path: [1], index: 0, direction: 'column', at: 0.5, from: 0.5, length: 0.5, extent: 1 }
    ])
  })

  it('neighbor in each direction', () => {
    expect(neighborGroup(tree, 'a', 'right')).toBe('b')
    expect(neighborGroup(tree, 'c', 'left')).toBe('a')
    expect(neighborGroup(tree, 'c', 'up')).toBe('b')
    expect(neighborGroup(tree, 'b', 'down')).toBe('c')
    expect(neighborGroup(tree, 'a', 'left')).toBeUndefined()
    expect(neighborGroup(tree, 'zzz', 'left')).toBeUndefined()
  })
})

describe('reconcileLayout', () => {
  it('consistent returns the same reference', () => {
    expect(reconcileLayout(tree, ['c', 'a', 'b'])).toBe(tree)
  })

  it('removes the ones that disappeared and appends the new ones on the right', () => {
    const next = reconcileLayout(tree, ['a', 'b', 'd'])
    expect(layoutGroups(next)).toEqual(['a', 'b', 'd'])
    expect(next).toMatchObject({ direction: 'row' })
    expect(reconcileLayout(null, ['a', 'b'])).toEqual({
      direction: 'row',
      children: [leaf('a'), leaf('b')],
      sizes: [0.5, 0.5]
    })
  })

  it('a repeated leaf stays only once', () => {
    const dup: LayoutNode<string> = { direction: 'row', children: [leaf('a'), leaf('a')], sizes: [0.5, 0.5] }
    expect(reconcileLayout(dup, ['a'])).toEqual(leaf('a'))
  })
})

describe('parseLayout', () => {
  it('accepts a valid tree and normalizes the fractions', () => {
    expect(parseLayout({ direction: 'row', children: [{ group: 0 }, { group: 1 }], sizes: [2, 2] }, 2)).toEqual({
      direction: 'row',
      children: [{ group: 0 }, { group: 1 }],
      sizes: [0.5, 0.5]
    })
  })

  it('drops invalid or repeated leaves and invalid fractions', () => {
    expect(
      parseLayout(
        {
          direction: 'column',
          children: [{ group: 0 }, { group: 0 }, { group: 9 }, { group: 1 }],
          sizes: [1, 'x', 1, -1]
        },
        2
      )
    ).toEqual({ direction: 'column', children: [{ group: 0 }, { group: 1 }], sizes: [0.5, 0.5] })
  })

  it('garbage becomes null', () => {
    for (const bad of [null, 'x', [], { direction: 'diagonal', children: [] }, { group: 'a' }, { group: 0.5 }])
      expect(parseLayout(bad, 2)).toBeNull()
  })

  it('depth beyond the limit is cut', () => {
    let deep: unknown = { group: 0 }
    for (let i = 0; i < MAX_EDITOR_GROUPS + 2; i++) deep = { direction: 'row', children: [deep], sizes: [1] }
    expect(parseLayout(deep, 1)).toBeNull()
  })
})
