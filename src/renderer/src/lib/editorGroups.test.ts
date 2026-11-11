import { describe, expect, it } from 'vitest'
import { MAX_EDITOR_GROUPS, layoutGroups } from '@shared/editorLayout'
import {
  activateTab,
  activeTabOf,
  closeGroup,
  closeTabsIn,
  createGroups,
  focusGroupAt,
  focusGroupToward,
  focusNextGroup,
  focusOtherGroup,
  groupsWithTab,
  joinAllGroups,
  moveTab,
  moveTabToAdjacentGroup,
  planSessionGroups,
  removeTabs,
  resizeGroups,
  showInOtherGroup,
  showTab,
  splitGroup,
  splitRight,
  tabsOnlyIn,
  type GroupsState
} from './editorGroups'

function one(...tabs: string[]): GroupsState {
  let s = createGroups('A')
  for (const t of tabs) s = showTab(s, t)
  return s
}

/** A: a b c · B: c d (B active). */
function two(): GroupsState {
  let s = splitRight(one('a', 'b', 'c'), 'B')
  s = showTab(s, 'd', { groupId: 'B' })
  return s
}

const ids = (s: GroupsState, group: string): string[] => s.groups.find((g) => g.id === group)!.tabIds

describe('showTab / activateTab', () => {
  it('appends to the active group and activates', () => {
    const s = one('a', 'b')
    expect(ids(s, 'A')).toEqual(['a', 'b'])
    expect(activeTabOf(s)).toBe('b')
  })

  it('does not duplicate a tab the group already has', () => {
    const s = showTab(one('a', 'b'), 'a')
    expect(ids(s, 'A')).toEqual(['a', 'b'])
    expect(activeTabOf(s)).toBe('a')
  })

  it('replaces the preview tab in its place', () => {
    const s = showTab(one('a', 'p', 'b'), 'q', { replaceId: 'p' })
    expect(ids(s, 'A')).toEqual(['a', 'q', 'b'])
  })

  it('activating a tab of the other group moves the focus to it', () => {
    const s = activateTab(two(), 'a')
    expect(s.activeGroupId).toBe('A')
    expect(activeTabOf(s)).toBe('a')
  })

  it('a tab in both groups: activating prefers the active group', () => {
    // B is the active one and has `c`.
    const s = activateTab(two(), 'c')
    expect(s.activeGroupId).toBe('B')
  })
})

describe('splitRight', () => {
  it('creates the right group with a copy of the active tab and focuses it', () => {
    const s = splitRight(one('a', 'b'), 'B')
    expect(s.groups.map((g) => g.tabIds)).toEqual([['a', 'b'], ['b']])
    expect(s.activeGroupId).toBe('B')
    expect(activeTabOf(s)).toBe('b')
  })

  it('with two groups splits the active one again: the new one goes between it and the neighbor', () => {
    const s = splitRight({ ...two(), activeGroupId: 'A' }, 'X')
    expect(s.groups.map((g) => g.id)).toEqual(['A', 'X', 'B'])
    expect(s.activeGroupId).toBe('X')
    expect(s.layout).toEqual({
      direction: 'row',
      children: [{ group: 'A' }, { group: 'X' }, { group: 'B' }],
      sizes: [0.25, 0.25, 0.5]
    })
  })

  it('without an active tab does not split', () => {
    const s = createGroups('A')
    expect(splitRight(s, 'B')).toBe(s)
  })
})

describe('tab in both groups', () => {
  it('the same tab is in both', () => {
    const s = splitRight(one('a', 'b'), 'B')
    expect(groupsWithTab(s, 'b').map((g) => g.id)).toEqual(['A', 'B'])
  })

  it('closing in one group keeps it in the other', () => {
    const s = closeTabsIn(splitRight(one('a', 'b'), 'B'), 'A', ['b'])
    expect(ids(s, 'A')).toEqual(['a'])
    expect(ids(s, 'B')).toEqual(['b'])
    expect(activeTabOf({ ...s, activeGroupId: 'A' })).toBe('a')
  })

  it('removeTabs removes from all groups', () => {
    const s = removeTabs(splitRight(one('a', 'b'), 'B'), ['b'])
    // B became empty: the group closes.
    expect(s.groups).toHaveLength(1)
    expect(ids(s, 'A')).toEqual(['a'])
    expect(s.activeGroupId).toBe('A')
  })

  it('tabsOnlyIn lists only the ones exclusive to the group', () => {
    const s = two()
    expect(tabsOnlyIn(s, 'A')).toEqual(['a', 'b'])
    expect(tabsOnlyIn(s, 'B')).toEqual(['d'])
  })
})

describe('closeTabsIn', () => {
  it('the neighbor on the right takes over when the active one closes', () => {
    const s = closeTabsIn(one('a', 'b', 'c'), 'A', ['b'])
    expect(ids(s, 'A')).toEqual(['a', 'c'])
    expect(activeTabOf(s)).toBe('c')
    const t = closeTabsIn(activateTab(one('a', 'b', 'c'), 'b'), 'A', ['b'])
    expect(activeTabOf(t)).toBe('c')
  })

  it('closing the last tab of one of the groups closes the group', () => {
    const s = closeTabsIn(splitRight(one('a'), 'B'), 'B', ['a'])
    expect(s.groups.map((g) => g.id)).toEqual(['A'])
    expect(s.activeGroupId).toBe('A')
  })

  it('the last group keeps existing, empty', () => {
    const s = closeTabsIn(one('a'), 'A', ['a'])
    expect(s.groups).toHaveLength(1)
    expect(activeTabOf(s)).toBeNull()
  })
})

describe('moveTab', () => {
  it('reorders within the group', () => {
    const s = moveTab(one('a', 'b', 'c'), 'a', 'A', 2)
    expect(ids(s, 'A')).toEqual(['b', 'c', 'a'])
    expect(activeTabOf(s)).toBe('a')
  })

  it('moves to the other group at the requested position and activates it', () => {
    const s = moveTab(activateTab(two(), 'a'), 'a', 'B', 0, 'A')
    expect(ids(s, 'A')).toEqual(['b', 'c'])
    expect(ids(s, 'B')).toEqual(['a', 'c', 'd'])
    expect(s.activeGroupId).toBe('B')
    expect(activeTabOf(s)).toBe('a')
    // The source now shows the neighbor.
    expect(s.groups[0].activeTabId).toBe('b')
  })

  it('a target that already has the tab only loses it at the source', () => {
    const s = moveTab(two(), 'c', 'B', 0, 'A')
    expect(ids(s, 'A')).toEqual(['a', 'b'])
    expect(ids(s, 'B')).toEqual(['c', 'd'])
    expect(activeTabOf(s)).toBe('c')
  })

  it('moving the last tab of the source closes its group', () => {
    const s = moveTab(splitRight(one('a'), 'B'), 'a', 'A', 5, 'B')
    // `a` is already in A: B disappears and A stays.
    expect(s.groups.map((g) => g.id)).toEqual(['A'])
    expect(ids(s, 'A')).toEqual(['a'])
  })

  it('clamps the position to the list size', () => {
    const s = moveTab({ ...two(), activeGroupId: 'A' }, 'b', 'B', 99, 'A')
    expect(ids(s, 'B')).toEqual(['c', 'd', 'b'])
  })

  it('a tab that is not at the source changes nothing', () => {
    const s = two()
    expect(moveTab(s, 'zzz', 'A', 0, 'B')).toBe(s)
  })
})

describe('closeGroup', () => {
  it('removes the group and the other takes the focus', () => {
    const s = closeGroup(two(), 'B')
    expect(s.groups.map((g) => g.id)).toEqual(['A'])
    expect(s.activeGroupId).toBe('A')
    expect(ids(s, 'A')).toEqual(['a', 'b', 'c'])
  })

  it('with a single group does nothing', () => {
    const s = one('a')
    expect(closeGroup(s, 'A')).toBe(s)
  })

  it('the caller closes the exclusive ones and then the group: what was in the other remains', () => {
    const s = two()
    const after = closeGroup(removeTabs(s, tabsOnlyIn(s, 'B')), 'B')
    expect(after.groups).toHaveLength(1)
    expect(ids(after, 'A')).toEqual(['a', 'b', 'c'])
  })
})

describe('focusOtherGroup / showInOtherGroup', () => {
  it('toggles the focus between the groups', () => {
    const s = focusOtherGroup(two())
    expect(s.activeGroupId).toBe('A')
    expect(focusOtherGroup(s).activeGroupId).toBe('B')
  })

  it('with a single group does nothing', () => {
    const s = one('a')
    expect(focusOtherGroup(s)).toBe(s)
  })

  it('creates the preview group without taking the focus from the source', () => {
    const s = showInOtherGroup(one('a'), 'p', 'B')
    expect(s.groups.map((g) => g.tabIds)).toEqual([['a'], ['p']])
    expect(s.activeGroupId).toBe('A')
    expect(s.groups[1].activeTabId).toBe('p')
  })

  it('uses the other group when it already exists', () => {
    const s = showInOtherGroup({ ...two(), activeGroupId: 'A' }, 'p', 'X')
    expect(ids(s, 'B')).toEqual(['c', 'd', 'p'])
    expect(s.activeGroupId).toBe('A')
  })
})

/** A | B on top, C below B: A takes the whole left side. */
function grid(): GroupsState {
  let s = splitGroup(one('a'), 'B', 'right')
  s = splitGroup(s, 'C', 'down')
  return s
}

describe('group grid', () => {
  it('splitting down stacks in a column inside the row', () => {
    const s = grid()
    expect(s.groups.map((g) => g.id)).toEqual(['A', 'B', 'C'])
    expect(s.activeGroupId).toBe('C')
    expect(s.layout).toEqual({
      direction: 'row',
      children: [
        { group: 'A' },
        { direction: 'column', children: [{ group: 'B' }, { group: 'C' }], sizes: [0.5, 0.5] }
      ],
      sizes: [0.5, 0.5]
    })
  })

  it('splitting left puts the new group before in the order', () => {
    const s = splitGroup(one('a'), 'L', 'left')
    expect(s.groups.map((g) => g.id)).toEqual(['L', 'A'])
  })

  it('closing a group gives back the space and undoes the single-item column', () => {
    const s = closeGroup(grid(), 'C')
    expect(s.layout).toEqual({ direction: 'row', children: [{ group: 'A' }, { group: 'B' }], sizes: [0.5, 0.5] })
    // The closed one was the active one: the focus goes to the previous group.
    expect(s.activeGroupId).toBe('B')
  })

  it('a group that empties leaves the grid', () => {
    const s = closeTabsIn(grid(), 'B', ['a'])
    expect(layoutGroups(s.layout)).toEqual(['A', 'C'])
    expect(s.groups.map((g) => g.id)).toEqual(['A', 'C'])
  })

  it('focus by direction follows the geometry', () => {
    const s = grid()
    expect(focusGroupToward(s, 'up').activeGroupId).toBe('B')
    expect(focusGroupToward(s, 'left').activeGroupId).toBe('A')
    expect(focusGroupToward(s, 'right')).toBe(s)
    const fromA = { ...s, activeGroupId: 'A' }
    // B and C touch A on the right by the same amount: the first one wins.
    expect(focusGroupToward(fromA, 'right').activeGroupId).toBe('B')
  })

  it('focus by position, and the one after the last creates a group on the right', () => {
    const s = grid()
    expect(focusGroupAt(s, 0, 'N').activeGroupId).toBe('A')
    const created = focusGroupAt(s, 3, 'N')
    expect(created.groups.map((g) => g.id)).toEqual(['A', 'B', 'C', 'N'])
    expect(focusGroupAt(s, 5, 'N')).toBe(s)
  })

  it('next/previous wrap around', () => {
    const s = grid()
    expect(focusNextGroup(s).activeGroupId).toBe('A')
    expect(focusNextGroup(s, -1).activeGroupId).toBe('B')
  })

  it('moving to the next group takes the tab and the empty group closes', () => {
    const s = moveTabToAdjacentGroup({ ...grid(), activeGroupId: 'B' }, 'a', 1, 'N', 'B')
    expect(s.groups.map((g) => g.id)).toEqual(['A', 'C'])
    expect(s.activeGroupId).toBe('C')
  })

  it('without a next group, creates one on the right if the source has other tabs', () => {
    const s = moveTabToAdjacentGroup(one('a', 'b'), 'b', 1, 'N')
    expect(s.groups.map((g) => g.tabIds)).toEqual([['a'], ['b']])
    expect(s.activeGroupId).toBe('N')
    const only = one('a')
    expect(moveTabToAdjacentGroup(only, 'a', 1, 'N')).toBe(only)
    expect(moveTabToAdjacentGroup(one('a', 'b'), 'b', -1, 'N').groups.map((g) => g.id)).toEqual(['N', 'A'])
  })

  it('splitting by moving the only tab does not leave an empty group', () => {
    const s = splitGroup(two(), 'N', 'down', { groupId: 'B', tabId: 'd', move: true })
    expect(ids(s, 'B')).toEqual(['c'])
    expect(ids(s, 'N')).toEqual(['d'])
  })

  it('joining all groups puts the tabs in the active one, without repeats', () => {
    const s = joinAllGroups({ ...two(), activeGroupId: 'B' })
    expect(s.groups).toEqual([{ id: 'B', tabIds: ['c', 'd', 'a', 'b'], activeTabId: 'd' }])
    expect(s.layout).toEqual({ group: 'B' })
    const single = one('a')
    expect(joinAllGroups(single)).toBe(single)
  })

  it('resizing only touches the fractions of the requested split, with a minimum', () => {
    const s = grid()
    const wider = resizeGroups(s, [], 0, 0.2)
    expect(wider.layout).toMatchObject({ sizes: [0.7, 0.30000000000000004] })
    const inner = resizeGroups(s, [1], 0, -0.9)
    expect(inner.layout).toMatchObject({ children: [{}, { sizes: [0.05, 0.95] }] })
    expect(resizeGroups(s, [0], 0, 0.1)).toBe(s)
  })

  it(`at the limit of ${MAX_EDITOR_GROUPS} groups does not split, only focuses the neighbor`, () => {
    let s = one('a')
    for (let i = 1; i < MAX_EDITOR_GROUPS; i++) s = splitGroup(s, `G${i}`, 'right')
    expect(s.groups).toHaveLength(MAX_EDITOR_GROUPS)
    const left = splitGroup(s, 'X', 'left')
    expect(left.groups).toHaveLength(MAX_EDITOR_GROUPS)
    expect(left.activeGroupId).toBe(`G${MAX_EDITOR_GROUPS - 2}`)
    // The preview goes to the next existing group.
    const preview = showInOtherGroup(s, 'p', 'Y')
    expect(preview.groups).toHaveLength(MAX_EDITOR_GROUPS)
    expect(preview.groups[0]?.tabIds).toContain('p')
  })
})

describe('planSessionGroups', () => {
  const identity = [0, 1, 2, 3]

  it('without groups a single group with all the tabs applies', () => {
    expect(planSessionGroups(undefined, undefined, identity, 4, 2)).toEqual({
      groups: [{ tabs: [0, 1, 2, 3], activeIndex: 2 }],
      activeGroup: 0,
      layout: { group: 0 }
    })
  })

  it('keeps two groups, with the tab in both', () => {
    const plan = planSessionGroups(
      [
        { tabs: [0, 1], activeIndex: 1 },
        { tabs: [1, 2, 3], activeIndex: 3 }
      ],
      1,
      identity,
      4,
      3
    )
    expect(plan.groups).toEqual([
      { tabs: [0, 1], activeIndex: 1 },
      { tabs: [1, 2, 3], activeIndex: 3 }
    ])
    expect(plan.activeGroup).toBe(1)
  })

  it('remaps the indexes when tabs were dropped', () => {
    // Tab 1 disappeared (-1): the following ones shift by one.
    const plan = planSessionGroups(
      [
        { tabs: [0, 1], activeIndex: 1 },
        { tabs: [2, 3], activeIndex: 2 }
      ],
      0,
      [0, -1, 1, 2],
      3,
      null
    )
    expect(plan.groups).toEqual([
      { tabs: [0], activeIndex: 0 },
      { tabs: [1, 2], activeIndex: 1 }
    ])
  })

  it('drops the group that became empty', () => {
    const plan = planSessionGroups(
      [
        { tabs: [0], activeIndex: 0 },
        { tabs: [1], activeIndex: 1 }
      ],
      1,
      [0, -1],
      1,
      0
    )
    expect(plan.groups).toEqual([{ tabs: [0], activeIndex: 0 }])
    expect(plan.activeGroup).toBe(0)
  })

  it('a tab without a group goes to the first and invalid indexes are ignored', () => {
    const plan = planSessionGroups(
      [
        { tabs: [0, 99, 'x', 0], activeIndex: 'y' },
        { tabs: [1], activeIndex: 1 }
      ],
      7,
      [0, 1, 2],
      3,
      0
    )
    expect(plan.groups).toEqual([
      { tabs: [0, 2], activeIndex: 0 },
      { tabs: [1], activeIndex: 1 }
    ])
    expect(plan.activeGroup).toBe(0)
  })

  it('old two-group session: the fraction becomes the side-by-side split', () => {
    const g = [
      { tabs: [0], activeIndex: 0 },
      { tabs: [1], activeIndex: 1 }
    ]
    expect(planSessionGroups(g, 0, [0, 1], 2, 0, undefined, 0.3).layout).toEqual({
      direction: 'row',
      children: [{ group: 0 }, { group: 1 }],
      sizes: [0.3, 0.7]
    })
  })

  it('more groups than the limit or garbage become a single group', () => {
    const g = { tabs: [0], activeIndex: 0 }
    expect(planSessionGroups([g, g, g], 0, [0], 1, 0).groups).toHaveLength(3)
    expect(planSessionGroups(Array(MAX_EDITOR_GROUPS + 1).fill(g), 0, [0], 1, 0).groups).toHaveLength(1)
    expect(planSessionGroups([] as never, 0, [0], 1, 0).groups).toHaveLength(1)
    expect(planSessionGroups('x' as never, 0, [0], 1, 0).groups).toHaveLength(1)
  })
})
