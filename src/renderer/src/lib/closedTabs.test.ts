import { describe, expect, it } from 'vitest'
import type { SessionTab } from '@shared/types'
import { closedTabsFor, pushClosedTabs, removedPlacements, type ClosedTab } from './closedTabs'
import type { GroupsState } from './editorGroups'

const file = (path: string): SessionTab => ({
  kind: 'file',
  path,
  preview: false,
  cursor: { line: 1, column: 0 },
  topLine: 1
})
const entry = (path: string, index: number, groupId: string | null = 'g1'): ClosedTab => ({
  tab: file(path),
  groupId,
  index
})
const groups = (...lists: Array<[string, string[]]>): GroupsState => ({
  groups: lists.map(([id, tabIds]) => ({ id, tabIds, activeTabId: tabIds[0] ?? null })),
  activeGroupId: lists[0]?.[0] ?? 'g1',
  layout: { direction: 'row', children: lists.map(([id]) => ({ group: id })), sizes: lists.map(() => 1 / lists.length) }
})

describe('removedPlacements', () => {
  it('lists what left each group with the original position', () => {
    const before = groups(['g1', ['a', 'b', 'c']], ['g2', ['a', 'd']])
    const after = groups(['g1', ['a']])
    expect(removedPlacements(before, after)).toEqual([
      { tabId: 'b', groupId: 'g1', index: 1 },
      { tabId: 'c', groupId: 'g1', index: 2 },
      { tabId: 'a', groupId: 'g2', index: 0 },
      { tabId: 'd', groupId: 'g2', index: 1 }
    ])
  })
})

describe('pushClosedTabs', () => {
  it('in a batch, the lowest position goes on top (reopening returns each one to its place)', () => {
    const stack = pushClosedTabs([], [entry('/b', 1), entry('/c', 2), entry('/d', 3)])
    expect(stack.map((e) => e.tab.path)).toEqual(['/d', '/c', '/b'])
  })

  it('the same tab closed again in the same group replaces the old entry', () => {
    const stack = pushClosedTabs([entry('/a', 0), entry('/b', 1)], [entry('/a', 2)])
    expect(stack.map((e) => [e.tab.path, e.index])).toEqual([
      ['/b', 1],
      ['/a', 2]
    ])
    expect(pushClosedTabs([entry('/a', 0, 'g1')], [entry('/a', 0, 'g2')])).toHaveLength(2)
  })

  it('keeps only the most recent', () => {
    const many = Array.from({ length: 5 }, (_, i) => entry(`/f${i}`, 0))
    const stack = many.reduce<ClosedTab[]>((acc, e) => pushClosedTabs(acc, [e], 3), [])
    expect(stack.map((e) => e.tab.path)).toEqual(['/f2', '/f3', '/f4'])
  })
})

describe('closedTabsFor', () => {
  it('keeps the file cursor and scroll, pins the preview and ignores tabs the session does not keep', () => {
    const before = groups(['g1', ['f', 'd', 'c']])
    const after = groups(['g1', []])
    const tabs = [
      { id: 'f', kind: 'file' as const, path: '/f.ts', preview: true },
      { id: 'd', kind: 'diff' as const, path: '/d.ts', staged: true },
      { id: 'c', kind: 'diff' as const, path: '/c.ts', commit: { hash: 'abc' } }
    ]
    const result = closedTabsFor(before, after, tabs, (id) =>
      id === 'f' ? { cursor: { line: 3, column: 2 }, topLine: 2 } : null
    )
    expect(result).toEqual([
      {
        tab: { kind: 'file', path: '/f.ts', preview: false, cursor: { line: 3, column: 2 }, topLine: 2 },
        groupId: 'g1',
        index: 0
      },
      { tab: { kind: 'diff', path: '/d.ts', staged: true }, groupId: 'g1', index: 1 }
    ])
  })
})
