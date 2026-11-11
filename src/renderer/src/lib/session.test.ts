import { describe, expect, it } from 'vitest'
import { Text } from '@codemirror/state'
import type { SessionTab, WorkspaceSession } from '@shared/types'
import { rowLayout } from '@shared/editorLayout'
import {
  buildSession,
  clampPanelHeight,
  clampClaudeWidth,
  clampPanelWidth,
  parsePanelPosition,
  clampSidebarWidth,
  mergeRestoredTabs,
  restoredTabKey,
  type MergeableTab,
  offsetToPosition,
  planSession,
  planTabs,
  positionToOffset
} from './session'

const doc = Text.of(['abc', '', 'defgh'])

describe('offsetToPosition / positionToOffset', () => {
  it('converts to a 1-based line and a 0-based column', () => {
    expect(offsetToPosition(doc, 0)).toEqual({ line: 1, column: 0 })
    expect(offsetToPosition(doc, 3)).toEqual({ line: 1, column: 3 })
    expect(offsetToPosition(doc, 4)).toEqual({ line: 2, column: 0 })
    expect(offsetToPosition(doc, 7)).toEqual({ line: 3, column: 2 })
  })

  it('goes back to the same offset', () => {
    for (let offset = 0; offset <= doc.length; offset++)
      expect(positionToOffset(doc, offsetToPosition(doc, offset))).toBe(offset)
  })

  it('clamps to the document', () => {
    expect(positionToOffset(doc, { line: 99, column: 99 })).toBe(doc.length)
    expect(positionToOffset(doc, { line: 0, column: -4 })).toBe(0)
    expect(positionToOffset(doc, { line: 1, column: 50 })).toBe(3)
    expect(positionToOffset(doc, { line: NaN, column: NaN })).toBe(0)
    expect(offsetToPosition(doc, 999)).toEqual({ line: 3, column: 5 })
  })
})

describe('sizes', () => {
  it('clamps the sidebar width', () => {
    expect(clampSidebarWidth(10)).toBe(170)
    expect(clampSidebarWidth(5000)).toBe(700)
    expect(clampSidebarWidth(300)).toBe(300)
    expect(clampSidebarWidth('x')).toBe(260)
  })

  it('clamps the panel height to the window', () => {
    expect(clampPanelHeight(10, 800)).toBe(100)
    expect(clampPanelHeight(900, 800)).toBe(650)
    expect(clampPanelHeight(300, 800)).toBe(300)
    expect(clampPanelHeight(300, 100)).toBe(100)
    expect(clampPanelHeight(undefined, 800)).toBe(260)
  })
})

describe('panel on the right', () => {
  it('clamps the width leaving room for the editor', () => {
    expect(clampPanelWidth(10, 1400)).toBe(240)
    expect(clampPanelWidth(5000, 1400)).toBe(950)
    expect(clampPanelWidth(500, 1400)).toBe(500)
    expect(clampPanelWidth(undefined, 1400)).toBe(480)
    expect(clampPanelWidth('x', 600)).toBe(240)
    expect(clampPanelWidth(NaN, 1400)).toBe(480)
  })

  it('an old or invalid session falls back to bottom', () => {
    expect(parsePanelPosition('right')).toBe('right')
    expect(parsePanelPosition('bottom')).toBe('bottom')
    expect(parsePanelPosition(undefined)).toBe('bottom')
    expect(parsePanelPosition('left')).toBe('bottom')
  })
})

describe('clampClaudeWidth', () => {
  it('clamps to the range and leaves room for the editor', () => {
    expect(clampClaudeWidth(100, 1600)).toBe(300)
    expect(clampClaudeWidth(5000, 1600)).toBe(900)
    expect(clampClaudeWidth(5000, 1000)).toBe(550)
    expect(clampClaudeWidth(undefined, 1600)).toBe(400)
    expect(clampClaudeWidth('x', 1600)).toBe(400)
  })
})

describe('buildSession', () => {
  it('builds the session in tab order', () => {
    const session = buildSession({
      tabs: [
        { id: 'a', kind: 'file', path: '/r/a.ts', preview: true },
        { id: 'b', kind: 'diff', path: '/r/b.ts', staged: true },
        { id: 'c', kind: 'file', path: '/r/c.ts', preview: false }
      ],
      activeTabId: 'c',
      viewOf: (id) => (id === 'a' ? { cursor: { line: 4, column: 2 }, topLine: 120.6 } : null),
      expanded: { '/r': true, '/r/src': true, '/r/old': false },
      view: 'git',
      sidebarVisible: false,
      sidebarWidth: 300.4,
      terminalVisible: true,
      panelHeight: 200,
      panelPosition: 'bottom' as const,
      panelWidth: 480,
      claudeVisible: true,
      claudeWidth: 410.4
    })
    expect(session).toEqual({
      tabs: [
        { kind: 'file', path: '/r/a.ts', preview: true, cursor: { line: 4, column: 2 }, topLine: 121 },
        { kind: 'diff', path: '/r/b.ts', staged: true },
        { kind: 'file', path: '/r/c.ts', preview: false, cursor: { line: 1, column: 0 }, topLine: 1 }
      ],
      activeIndex: 2,
      expanded: ['/r', '/r/src'],
      view: 'git',
      sidebarVisible: false,
      sidebarWidth: 300,
      terminalVisible: true,
      panelHeight: 200,
      panelPosition: 'bottom' as const,
      panelWidth: 480,
      claudeVisible: true,
      claudeWidth: 410
    })
  })

  it('without an active tab returns activeIndex null', () => {
    const session = buildSession({
      tabs: [],
      activeTabId: 'x',
      viewOf: () => null,
      expanded: {},
      view: 'explorer',
      sidebarVisible: true,
      sidebarWidth: 260,
      terminalVisible: false,
      panelHeight: 260,
      panelPosition: 'bottom' as const,
      panelWidth: 480
    })
    expect(session.activeIndex).toBeNull()
  })
})

describe('buildSession with encoding and language', () => {
  const base = {
    activeTabId: 'a',
    viewOf: () => null,
    expanded: {},
    view: 'explorer' as const,
    sidebarVisible: true,
    sidebarWidth: 260,
    terminalVisible: false,
    panelHeight: 260,
    panelPosition: 'bottom' as const,
    panelWidth: 480
  }

  it('only keeps the encoding chosen by the user and the chosen language', () => {
    const session = buildSession({
      ...base,
      tabs: [
        { id: 'a', kind: 'file', path: '/p/a.txt', encoding: 'utf16le', encodingChosen: true, language: 'Python' },
        { id: 'b', kind: 'file', path: '/p/b.txt', encoding: 'utf8bom', encodingChosen: false, language: null }
      ]
    })
    expect(session.tabs[0]).toMatchObject({ encoding: 'utf16le', language: 'Python' })
    expect(session.tabs[1]).not.toHaveProperty('encoding')
    expect(session.tabs[1]).not.toHaveProperty('language')
  })
})

describe('buildSession with a Claude proposal diff', () => {
  it('does not persist the ephemeral tab', () => {
    const session = buildSession({
      tabs: [
        { id: 'a', kind: 'file', path: '/r/a.ts' },
        { id: 'p', kind: 'diff', path: '/r/a.ts', proposal: { requestId: 'r' } }
      ],
      activeTabId: 'p',
      viewOf: () => null,
      expanded: {},
      view: 'explorer',
      sidebarVisible: true,
      sidebarWidth: 260,
      terminalVisible: false,
      panelHeight: 260,
      panelPosition: 'bottom',
      panelWidth: 480
    })
    expect(session.tabs).toHaveLength(1)
    expect(session).not.toHaveProperty('claudeVisible')
  })
})

describe('buildSession with commit diffs', () => {
  const base = {
    viewOf: () => null,
    expanded: {},
    view: 'git' as const,
    sidebarVisible: true,
    sidebarWidth: 260,
    terminalVisible: false,
    panelHeight: 260,
    panelPosition: 'bottom' as const,
    panelWidth: 480
  }

  it('does not keep commit diffs and recomputes the active tab index', () => {
    const session = buildSession({
      ...base,
      tabs: [
        { id: 'a', kind: 'diff', path: '/r/a.ts', commit: 'abc1234' },
        { id: 'b', kind: 'file', path: '/r/b.ts' },
        { id: 'c', kind: 'diff', path: '/r/c.ts', commit: 'abc1234' }
      ],
      activeTabId: 'b'
    })
    expect(session.tabs.map((t) => t.path)).toEqual(['/r/b.ts'])
    expect(session.activeIndex).toBe(0)
  })

  it('with an active commit diff, the session has no active tab', () => {
    const session = buildSession({
      ...base,
      tabs: [
        { id: 'a', kind: 'file', path: '/r/a.ts' },
        { id: 'c', kind: 'diff', path: '/r/c.ts', commit: 'abc1234' }
      ],
      activeTabId: 'c'
    })
    expect(session.tabs).toHaveLength(1)
    expect(session.activeIndex).toBeNull()
  })
})

describe('buildSession: commit and stage diffs', () => {
  const base = {
    viewOf: () => null,
    expanded: {},
    view: 'git' as const,
    sidebarVisible: true,
    sidebarWidth: 260,
    terminalVisible: false,
    panelHeight: 260,
    panelPosition: 'bottom' as const,
    panelWidth: 480
  }

  it('only commit diffs: session without tabs and without an active tab', () => {
    const session = buildSession({
      ...base,
      tabs: [{ id: 'a', kind: 'diff', path: '/r/a.ts', commit: 'abc' }],
      activeTabId: 'a'
    })
    expect(session.tabs).toEqual([])
    expect(session.activeIndex).toBeNull()
  })

  it('a working tree/stage diff stays in the session, with the staged flag', () => {
    const session = buildSession({
      ...base,
      tabs: [
        { id: 'a', kind: 'diff', path: '/r/a.ts', commit: 'abc' },
        { id: 'b', kind: 'diff', path: '/r/b.ts', staged: true },
        { id: 'c', kind: 'diff', path: '/r/c.ts' }
      ],
      activeTabId: 'c'
    })
    expect(session.tabs).toEqual([
      { kind: 'diff', path: '/r/b.ts', staged: true },
      { kind: 'diff', path: '/r/c.ts', staged: false }
    ])
    expect(session.activeIndex).toBe(1)
  })
})

describe('planTabs', () => {
  const file = (path: string): SessionTab => ({
    kind: 'file',
    path,
    preview: false,
    cursor: { line: 1, column: 0 },
    topLine: 1
  })
  const diff = (path: string, staged = false): SessionTab => ({ kind: 'diff', path, staged })

  it('keeps everything when the files exist', () => {
    const tabs = [file('/a'), diff('/b'), file('/c')]
    expect(planTabs(tabs, 2, [true, true, true])).toEqual({ tabs, activeIndex: 2 })
  })

  it('drops nonexistent files, but not diffs', () => {
    const tabs = [file('/a'), diff('/b'), file('/c')]
    expect(planTabs(tabs, 0, [false, false, true])).toEqual({ tabs: [diff('/b'), file('/c')], activeIndex: 0 })
  })

  it('if the active tab disappears, uses the next one and then the previous one', () => {
    const tabs = [file('/a'), file('/b'), file('/c')]
    expect(planTabs(tabs, 1, [true, false, true]).activeIndex).toBe(1)
    expect(planTabs(tabs, 2, [true, true, false]).activeIndex).toBe(1)
    expect(planTabs(tabs, 1, [false, false, false])).toEqual({ tabs: [], activeIndex: null })
  })

  it('removes repeats and repoints the active one to the first', () => {
    const tabs = [file('/a'), file('/b'), file('/a')]
    expect(planTabs(tabs, 2, [true, true, true])).toEqual({ tabs: [file('/a'), file('/b')], activeIndex: 0 })
  })

  it('staged and unstaged diffs of the same file are distinct tabs', () => {
    const tabs = [diff('/a', true), diff('/a', false)]
    expect(planTabs(tabs, 1, [false, false]).tabs).toHaveLength(2)
  })

  it('an invalid active index becomes null', () => {
    const tabs = [file('/a')]
    expect(planTabs(tabs, null, [true]).activeIndex).toBeNull()
    expect(planTabs(tabs, 5, [true]).activeIndex).toBeNull()
    expect(planTabs(tabs, -1, [true]).activeIndex).toBeNull()
  })
})

const sessionOf = (partial: object): WorkspaceSession => partial as unknown as WorkspaceSession

describe('editor groups', () => {
  const base = {
    viewOf: () => null,
    expanded: {},
    view: 'explorer' as const,
    sidebarVisible: true,
    sidebarWidth: 260,
    terminalVisible: false,
    panelHeight: 260,
    panelPosition: 'bottom' as const,
    panelWidth: 480
  }
  const tabs = [
    { id: 'a', kind: 'file' as const, path: '/r/a.md' },
    { id: 'c', kind: 'diff' as const, path: '/r/x.ts', commit: 'abc' },
    { id: 'p', kind: 'markdownPreview' as const, path: '/r/a.md' },
    { id: 'b', kind: 'file' as const, path: '/r/b.ts' }
  ]

  it('a single group does not write the new fields (session the same as before)', () => {
    const session = buildSession({
      ...base,
      tabs,
      activeTabId: 'a',
      groups: [{ id: 'g0', tabIds: ['a', 'p', 'b'], activeTabId: 'a' }]
    })
    expect(session).not.toHaveProperty('editorGroups')
    expect(session).not.toHaveProperty('editorLayout')
    expect(session.tabs.map((t) => t.kind)).toEqual(['file', 'markdownPreview', 'file'])
    expect(session.tabs[1]).toEqual({ kind: 'markdownPreview', path: '/r/a.md' })
  })

  it('two groups become indexes of the persisted list, without the commit diff', () => {
    const session = buildSession({
      ...base,
      tabs,
      activeTabId: 'p',
      groups: [
        { id: 'g0', tabIds: ['a', 'c', 'b'], activeTabId: 'b' },
        { id: 'g1', tabIds: ['p', 'b'], activeTabId: 'p' }
      ],
      activeGroupIndex: 1,
      layout: { direction: 'row', children: [{ group: 'g0' }, { group: 'g1' }], sizes: [0.3, 0.7] }
    })
    expect(session.editorGroups).toEqual([
      { tabs: [0, 2], activeIndex: 2 },
      { tabs: [1, 2], activeIndex: 1 }
    ])
    expect(session.activeGroup).toBe(1)
    expect(session.editorLayout).toEqual({
      direction: 'row',
      children: [{ group: 0 }, { group: 1 }],
      sizes: [0.3, 0.7]
    })
    expect(session).not.toHaveProperty('editorSplitRatio')
    // `activeIndex` is still the active tab of the active group.
    expect(session.activeIndex).toBe(1)
  })

  it('planSession: an old session without groups becomes a single group', () => {
    const file = (path: string): SessionTab => ({
      kind: 'file',
      path,
      preview: false,
      cursor: { line: 1, column: 0 },
      topLine: 1
    })
    const plan = planSession(sessionOf({ tabs: [file('/a'), file('/b')], activeIndex: 1 }), [true, true])
    expect(plan.groups).toEqual([{ tabs: [0, 1], activeIndex: 1 }])
    expect(plan.activeGroup).toBe(0)
    expect(plan.layout).toEqual({ group: 0 })
  })

  it('planSession: restores the two groups and drops the preview of a file that disappeared', () => {
    const file = (path: string): SessionTab => ({
      kind: 'file',
      path,
      preview: false,
      cursor: { line: 1, column: 0 },
      topLine: 1
    })
    const preview = (path: string): SessionTab => ({ kind: 'markdownPreview', path })
    const plan = planSession(
      sessionOf({
        tabs: [file('/a.md'), preview('/a.md'), file('/b.ts'), preview('/gone.md')],
        activeIndex: 1,
        editorGroups: [
          { tabs: [0, 2], activeIndex: 0 },
          { tabs: [1, 3, 2], activeIndex: 3 }
        ],
        activeGroup: 1,
        editorSplitRatio: 0.9
      }),
      [true, true, true, false]
    )
    expect(plan.tabs).toHaveLength(3)
    expect(plan.groups).toEqual([
      { tabs: [0, 2], activeIndex: 0 },
      // The active one (preview that disappeared) falls back to the first that remained.
      { tabs: [1, 2], activeIndex: 1 }
    ])
    expect(plan.activeGroup).toBe(1)
    expect(plan.activeIndex).toBe(1)
    // Session from before the grid: the old fraction (clamped) becomes the side-by-side split.
    expect(plan.layout).toMatchObject({ direction: 'row', children: [{ group: 0 }, { group: 1 }] })
    expect((plan.layout as { sizes: number[] }).sizes[0]).toBeCloseTo(0.85)
  })
})

describe('planSession with the grid', () => {
  const file = (path: string): SessionTab => ({
    kind: 'file',
    path,
    preview: false,
    cursor: { line: 1, column: 0 },
    topLine: 1
  })

  it('restores three groups with nested splits', () => {
    const plan = planSession(
      sessionOf({
        tabs: [file('/a'), file('/b'), file('/c')],
        activeIndex: 2,
        editorGroups: [
          { tabs: [0], activeIndex: 0 },
          { tabs: [1], activeIndex: 1 },
          { tabs: [2], activeIndex: 2 }
        ],
        activeGroup: 2,
        editorLayout: {
          direction: 'row',
          children: [{ group: 0 }, { direction: 'column', children: [{ group: 1 }, { group: 2 }], sizes: [0.4, 0.6] }],
          sizes: [0.5, 0.5]
        }
      }),
      [true, true, true]
    )
    expect(plan.groups).toHaveLength(3)
    expect(plan.activeGroup).toBe(2)
    expect(plan.activeIndex).toBe(2)
    expect(plan.layout).toEqual({
      direction: 'row',
      children: [{ group: 0 }, { direction: 'column', children: [{ group: 1 }, { group: 2 }], sizes: [0.4, 0.6] }],
      sizes: [0.5, 0.5]
    })
  })

  it('a group that became empty leaves the grid and the indexes follow the filtered list', () => {
    const plan = planSession(
      sessionOf({
        tabs: [file('/a'), file('/gone'), file('/c')],
        activeIndex: 0,
        editorGroups: [
          { tabs: [0], activeIndex: 0 },
          { tabs: [1], activeIndex: 1 },
          { tabs: [2], activeIndex: 2 }
        ],
        editorLayout: {
          direction: 'column',
          children: [{ group: 0 }, { direction: 'row', children: [{ group: 1 }, { group: 2 }], sizes: [0.5, 0.5] }],
          sizes: [0.5, 0.5]
        }
      }),
      [true, false, true]
    )
    expect(plan.groups).toEqual([
      { tabs: [0], activeIndex: 0 },
      { tabs: [1], activeIndex: 1 }
    ])
    expect(plan.layout).toEqual({ direction: 'column', children: [{ group: 0 }, { group: 1 }], sizes: [0.5, 0.5] })
  })

  it('an invalid grid becomes the groups side by side', () => {
    const plan = planSession(
      sessionOf({
        tabs: [file('/a'), file('/b'), file('/c')],
        activeIndex: 0,
        editorGroups: [
          { tabs: [0], activeIndex: 0 },
          { tabs: [1], activeIndex: 1 },
          { tabs: [2], activeIndex: 2 }
        ],
        editorLayout: { direction: 'diagonal' } as never
      }),
      [true, true, true]
    )
    expect(plan.layout).toEqual({
      direction: 'row',
      children: [{ group: 0 }, { group: 1 }, { group: 2 }],
      sizes: [1 / 3, 1 / 3, 1 / 3]
    })
  })
})

describe('mergeRestoredTabs', () => {
  const file = (id: string, path: string): MergeableTab => ({ id, kind: 'file', path })
  const group = (id: string, tabIds: string[], activeTabId: string | null) => ({ id, tabIds, activeTabId })
  let n = 0
  const newId = (): string => `new-${++n}`
  const plan = (groups: { tabs: number[]; activeIndex: number | null }[], activeGroup = 0) => ({
    groups,
    activeGroup,
    layout: rowLayout(
      groups.map((_, i) => i),
      groups.length === 2 ? [0.3, 0.7] : []
    ) ?? { group: 0 }
  })
  const leaf = (id: string) => ({ group: id })

  it('without open tabs, the session takes over tabs, groups, split and active tab', () => {
    const restored = [file('r0', '/a'), file('r1', '/b')]
    const out = mergeRestoredTabs({
      restored,
      plan: plan([{ tabs: [0, 1], activeIndex: 1 }]),
      current: {
        tabs: [],
        editorGroups: [group('g0', [], null)],
        activeGroupId: 'g0',
        editorLayout: leaf('g0'),
        activeTabId: null
      },
      newId
    })
    expect(out.tabs).toEqual(restored)
    expect(out.editorGroups).toEqual([group('g0', ['r0', 'r1'], 'r1')])
    expect(out.activeGroupId).toBe('g0')
    expect(out.editorLayout).toEqual(leaf('g0'))
    expect(out.activeTabId).toBe('r1')
    expect(out.dropped).toEqual([])
  })

  it('an extra session group gets a new id and the active one comes from plan.activeGroup', () => {
    const out = mergeRestoredTabs({
      restored: [file('r0', '/a'), file('r1', '/b')],
      plan: plan(
        [
          { tabs: [0], activeIndex: 0 },
          { tabs: [1], activeIndex: 0 }
        ],
        1
      ),
      current: {
        tabs: [],
        editorGroups: [group('g0', [], null)],
        activeGroupId: 'g0',
        editorLayout: leaf('g0'),
        activeTabId: null
      },
      newId: () => 'g1'
    })
    expect(out.editorGroups.map((g) => g.id)).toEqual(['g0', 'g1'])
    expect(out.editorLayout).toEqual({ direction: 'row', children: [leaf('g0'), leaf('g1')], sizes: [0.3, 0.7] })
    expect(out.activeGroupId).toBe('g1')
    expect(out.activeTabId).toBe('r1')
  })

  it('with tabs opened in the meantime, they and the current state win and the restored ones go in front of the first group', () => {
    const mine = file('m0', '/c')
    const out = mergeRestoredTabs({
      restored: [file('r0', '/a')],
      plan: plan([{ tabs: [0], activeIndex: 0 }]),
      current: {
        tabs: [mine],
        editorGroups: [group('g0', ['m0'], 'm0')],
        activeGroupId: 'g0',
        editorLayout: leaf('g0'),
        activeTabId: 'm0'
      },
      newId
    })
    expect(out.tabs.map((t) => t.id)).toEqual(['r0', 'm0'])
    expect(out.editorGroups).toEqual([group('g0', ['r0', 'm0'], 'm0')])
    expect(out.editorLayout).toEqual(leaf('g0'))
    expect(out.activeTabId).toBe('m0')
  })

  it('a restored repeat of an open tab is dropped and disappears from the groups', () => {
    const out = mergeRestoredTabs({
      restored: [file('r0', '/a'), file('r1', '/b')],
      plan: plan([{ tabs: [0, 1], activeIndex: 0 }]),
      current: {
        tabs: [file('m0', '/a')],
        editorGroups: [group('g0', ['m0'], 'm0')],
        activeGroupId: 'g0',
        editorLayout: leaf('g0'),
        activeTabId: 'm0'
      },
      newId
    })
    expect(out.dropped.map((t) => t.id)).toEqual(['r0'])
    expect(out.tabs.map((t) => t.id)).toEqual(['r1', 'm0'])
    expect(out.editorGroups[0].tabIds).toEqual(['r1', 'm0'])
  })

  it('the dropped active tab falls back to the first that remained in the group', () => {
    const out = mergeRestoredTabs({
      restored: [file('r0', '/a'), file('r1', '/b')],
      plan: plan([{ tabs: [0, 1], activeIndex: 0 }]),
      current: {
        tabs: [],
        editorGroups: [group('g0', [], null)],
        activeGroupId: 'g0',
        editorLayout: leaf('g0'),
        activeTabId: null
      },
      newId
    })
    expect(out.activeTabId).toBe('r0')
    const dup = mergeRestoredTabs({
      restored: [file('r0', '/a'), file('r1', '/b')],
      plan: plan([{ tabs: [0, 1], activeIndex: 0 }]),
      current: {
        tabs: [file('m0', '/a')],
        editorGroups: [group('g0', ['m0'], null)],
        activeGroupId: 'g0',
        editorLayout: leaf('g0'),
        activeTabId: null
      },
      newId
    })
    expect(dup.activeTabId).toBeNull()
  })
})

describe('restoredTabKey', () => {
  it('distinguishes file, preview and diff (commit and staged)', () => {
    const keys = [
      restoredTabKey({ id: '1', kind: 'file', path: '/a' }),
      restoredTabKey({ id: '2', kind: 'markdownPreview', path: '/a' }),
      restoredTabKey({ id: '3', kind: 'diff', path: '/a', staged: false }),
      restoredTabKey({ id: '4', kind: 'diff', path: '/a', staged: true }),
      restoredTabKey({ id: '5', kind: 'diff', path: '/a', staged: false, commit: { hash: 'abc' } })
    ]
    expect(new Set(keys).size).toBe(5)
  })
})
