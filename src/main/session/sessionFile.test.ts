import { describe, expect, it } from 'vitest'
import { sanitizeSession, sessionFileName } from './sessionFile'

const base = {
  tabs: [
    { kind: 'file', path: '/p/a.ts', preview: false, cursor: { line: 3, column: 4 }, topLine: 12 },
    { kind: 'diff', path: '/p/b.ts', staged: true }
  ],
  activeIndex: 1,
  expanded: ['/p', '/p/src'],
  view: 'git',
  sidebarVisible: false,
  sidebarWidth: 300,
  terminalVisible: true,
  panelHeight: 200,
  panelPosition: 'right',
  panelWidth: 500
}

describe('sessionFileName', () => {
  it('is stable, hexadecimal and ends in .json', () => {
    const name = sessionFileName('/p/app', 'linux')
    expect(name).toMatch(/^[0-9a-f]{64}\.json$/)
    expect(sessionFileName('/p/app/', 'linux')).toBe(name)
  })

  it('folds case only where the system ignores it', () => {
    expect(sessionFileName('/P/App', 'darwin')).toBe(sessionFileName('/p/app', 'darwin'))
    expect(sessionFileName('/P/App', 'linux')).not.toBe(sessionFileName('/p/app', 'linux'))
  })

  it('different folders produce different names', () => {
    expect(sessionFileName('/a', 'linux')).not.toBe(sessionFileName('/b', 'linux'))
  })
})

describe('sanitizeSession', () => {
  it('keeps a valid session', () => {
    expect(sanitizeSession(base)).toEqual(base)
  })

  it('a non-object becomes null', () => {
    expect(sanitizeSession(null)).toBeNull()
    expect(sanitizeSession('x')).toBeNull()
    expect(sanitizeSession([])).toBeNull()
  })

  it('drops invalid tabs and readjusts the active tab', () => {
    const s = sanitizeSession({
      ...base,
      tabs: [{ kind: 'file', path: 'relative.ts' }, { kind: 'zzz', path: '/x' }, base.tabs[0], 7, base.tabs[1]],
      activeIndex: 4
    })
    expect(s?.tabs.map((t) => t.path)).toEqual(['/p/a.ts', '/p/b.ts'])
    expect(s?.activeIndex).toBe(1)
  })

  it('a dropped or out-of-range active tab becomes null', () => {
    expect(sanitizeSession({ ...base, activeIndex: 5 })?.activeIndex).toBeNull()
    expect(sanitizeSession({ ...base, activeIndex: -1 })?.activeIndex).toBeNull()
    expect(sanitizeSession({ ...base, activeIndex: 1.5 })?.activeIndex).toBeNull()
    expect(
      sanitizeSession({ ...base, tabs: [{ kind: 'file', path: 'x' }, base.tabs[1]], activeIndex: 0 })?.activeIndex
    ).toBeNull()
  })

  it('fixes invalid cursor and scroll', () => {
    const s = sanitizeSession({
      ...base,
      tabs: [{ kind: 'file', path: '/p/a.ts', cursor: { line: 0, column: -2 }, topLine: Number.NaN, scrollTop: 300 }]
    })
    expect(s?.tabs[0]).toEqual({
      kind: 'file',
      path: '/p/a.ts',
      preview: false,
      cursor: { line: 1, column: 0 },
      topLine: 1
    })
  })

  it('topLine: integer >= 1; fractional is truncated, invalid or legacy (scrollTop) becomes 1', () => {
    const topLine = (v: unknown): unknown =>
      (sanitizeSession({ tabs: [{ kind: 'file', path: '/p/a.ts', topLine: v }] })?.tabs[0] as { topLine: number })
        .topLine
    expect(topLine(40)).toBe(40)
    expect(topLine(7.9)).toBe(7)
    expect(topLine(0)).toBe(1)
    expect(topLine(-3)).toBe(1)
    expect(topLine('5')).toBe(1)
    expect(topLine(undefined)).toBe(1)
  })

  it('unknown view falls back to explorer; expanded only absolute and unique', () => {
    const s = sanitizeSession({ ...base, view: 'foo', expanded: ['/a', '/a', 'rel', 3] })
    expect(s?.view).toBe('explorer')
    expect(s?.expanded).toEqual(['/a'])
  })

  it('uses defaults for missing sizes and flags', () => {
    const s = sanitizeSession({})
    expect(s).toMatchObject({
      tabs: [],
      activeIndex: null,
      expanded: [],
      view: 'explorer',
      sidebarVisible: true,
      terminalVisible: false
    })
    expect(s?.sidebarWidth).toBeGreaterThan(0)
    expect(s?.panelHeight).toBeGreaterThan(0)
    expect(sanitizeSession({ sidebarWidth: -1, panelHeight: Infinity })?.sidebarWidth).toBeGreaterThan(0)
  })
})

describe('sanitizeSession: panel', () => {
  it('keeps valid position and width', () => {
    const s = sanitizeSession(base)
    expect(s?.panelPosition).toBe('right')
    expect(s?.panelWidth).toBe(500)
  })

  it('an old or invalid session falls back to bottom and the default width', () => {
    const s = sanitizeSession({ ...base, panelPosition: 'left', panelWidth: -3 })
    expect(s?.panelPosition).toBe('bottom')
    expect(s?.panelWidth).toBe(420)
    expect(sanitizeSession({})?.panelPosition).toBe('bottom')
    expect(sanitizeSession({ panelWidth: 1e9 })?.panelWidth).toBe(10_000)
  })
})

describe('sanitizeSession: Claude panel', () => {
  it('keeps the visibility and width of the Claude panel', () => {
    const s = sanitizeSession({ ...base, claudeVisible: true, claudeWidth: 377 })
    expect(s?.claudeVisible).toBe(true)
    expect(s?.claudeWidth).toBe(377)
  })

  it('clamps the Claude panel width like the other sizes', () => {
    expect(sanitizeSession({ ...base, claudeWidth: 1e9 })?.claudeWidth).toBe(10_000)
    expect(sanitizeSession({ ...base, claudeWidth: -5 })?.claudeWidth).toBe(400)
    expect(sanitizeSession({ ...base, claudeWidth: 350.6 })?.claudeWidth).toBe(351)
  })

  it('an old session (without the fields) stays valid and without them', () => {
    const s = sanitizeSession(base)
    expect(s).not.toBeNull()
    expect(s?.claudeVisible).toBeUndefined()
    expect(s?.claudeWidth).toBeUndefined()
  })
})

describe('sanitizeSession: Claude tabs', () => {
  it('an old session has no Claude tabs', () => {
    const s = sanitizeSession(base)
    expect(s?.claudeTabs).toBeUndefined()
    expect(s?.claudeActive).toBeUndefined()
  })

  it('keeps valid tabs, remaps the active one and drops junk', () => {
    const s = sanitizeSession({
      ...base,
      claudeTabs: [
        { sessionId: 'abc-123', title: 'First', model: 'opus', permissionMode: 'plan', effort: 'high', draft: 'hi' },
        { sessionId: 'with space' },
        'x',
        { draft: 'draft only' },
        { sessionId: 'def', permissionMode: 'bypassPermissions', effort: 'huge' }
      ],
      claudeActive: 3
    })
    expect(s?.claudeTabs).toEqual([
      { sessionId: 'abc-123', title: 'First', model: 'opus', permissionMode: 'plan', effort: 'high', draft: 'hi' },
      { draft: 'draft only' },
      { sessionId: 'def' }
    ])
    expect(s?.claudeActive).toBe(1)
  })

  it('uses the same rules as claude:start for sessionId and model', () => {
    const s = sanitizeSession({
      ...base,
      claudeTabs: [
        { sessionId: 'with_underscore', draft: 'x' },
        { sessionId: 'ok', model: 'model with space' }
      ]
    })
    expect(s?.claudeTabs).toEqual([{ draft: 'x' }, { sessionId: 'ok' }])
  })

  it('limits count and sizes', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ sessionId: `s${i}` }))
    expect(sanitizeSession({ ...base, claudeTabs: many })?.claudeTabs).toHaveLength(20)
    const big = sanitizeSession({
      ...base,
      claudeTabs: [{ sessionId: 's', title: 'x'.repeat(5000), draft: 'y'.repeat(99_999) }]
    })
    expect(big?.claudeTabs?.[0].title).toHaveLength(200)
    expect(big?.claudeTabs?.[0].draft).toHaveLength(20_000)
  })

  it('an invalid active index or one of a dropped tab goes away', () => {
    expect(
      sanitizeSession({ ...base, claudeTabs: [{ sessionId: 'a' }], claudeActive: 7 })?.claudeActive
    ).toBeUndefined()
    expect(
      sanitizeSession({ ...base, claudeTabs: [{ sessionId: 'a' }], claudeActive: 'x' })?.claudeActive
    ).toBeUndefined()
  })
})

describe('sanitizeSession: split editor', () => {
  const three = {
    ...base,
    tabs: [
      { kind: 'file', path: '/p/a.ts', preview: false, cursor: { line: 1, column: 0 }, topLine: 1 },
      { kind: 'markdownPreview', path: '/p/a.md' },
      { kind: 'diff', path: '/p/b.ts', staged: false }
    ],
    activeIndex: 0
  }

  it('accepts a Markdown preview tab and drops a relative path', () => {
    const s = sanitizeSession({ ...three, tabs: [...three.tabs, { kind: 'markdownPreview', path: 'rel.md' }] })
    expect(s?.tabs).toHaveLength(3)
    expect(s?.tabs[1]).toEqual({ kind: 'markdownPreview', path: '/p/a.md' })
  })

  it('accepts an image tab and drops a relative path', () => {
    const s = sanitizeSession({
      ...three,
      tabs: [...three.tabs, { kind: 'image', path: '/p/a.png' }, { kind: 'image', path: 'rel.png' }]
    })
    expect(s?.tabs).toHaveLength(4)
    expect(s?.tabs[3]).toEqual({ kind: 'image', path: '/p/a.png' })
  })

  it('keeps valid groups, ratio and active group', () => {
    const groups = [
      { tabs: [0, 2], activeIndex: 2 },
      { tabs: [1, 0], activeIndex: null }
    ]
    const s = sanitizeSession({ ...three, editorGroups: groups, activeGroup: 1, editorSplitRatio: 0.4 })
    expect(s?.editorGroups).toEqual(groups)
    expect(s?.activeGroup).toBe(1)
    expect(s?.editorSplitRatio).toBe(0.4)
  })

  it('a tab past the 200 limit only leaves the group (does not drop the groups)', () => {
    const tabs = Array.from({ length: 205 }, (_, i) => ({ ...three.tabs[0], path: `/p/f${i}.ts` }))
    const s = sanitizeSession({
      ...three,
      tabs,
      activeIndex: 0,
      editorGroups: [
        { tabs: [0, 1], activeIndex: 0 },
        { tabs: [2, 203], activeIndex: 203 }
      ]
    })
    expect(s?.tabs).toHaveLength(200)
    expect(s?.editorGroups).toEqual([
      { tabs: [0, 1], activeIndex: 0 },
      { tabs: [2], activeIndex: null }
    ])
  })

  it('an index past the existing tabs drops the groups', () => {
    const s = sanitizeSession({ ...three, editorGroups: [{ tabs: [0, 9], activeIndex: 0 }] })
    expect(s?.editorGroups).toBeUndefined()
  })

  it('an old session stays without the fields', () => {
    const s = sanitizeSession(three)
    expect(s?.editorGroups).toBeUndefined()
    expect(s?.activeGroup).toBeUndefined()
    expect(s?.editorSplitRatio).toBeUndefined()
  })

  it('remaps the indices when invalid tabs are dropped', () => {
    const tabs = [{ kind: 'file', path: 'relative' }, three.tabs[0], { kind: 'x' }, three.tabs[1]]
    const s = sanitizeSession({
      ...three,
      tabs,
      activeIndex: 1,
      editorGroups: [
        { tabs: [0, 1, 2, 3], activeIndex: 3 },
        { tabs: [0], activeIndex: 0 }
      ]
    })
    expect(s?.tabs).toHaveLength(2)
    // The 2nd group only had a dropped tab: it goes away.
    expect(s?.editorGroups).toEqual([{ tabs: [0, 1], activeIndex: 1 }])
  })

  it('drops only the field when the groups are invalid', () => {
    const bad = [
      [],
      Array.from({ length: 9 }, () => ({ tabs: [0] })),
      [{ tabs: [9], activeIndex: null }],
      [{ tabs: [0.5], activeIndex: null }],
      [{ tabs: [0, 1], activeIndex: 2 }],
      [{ tabs: [0], activeIndex: 'a' }],
      'x',
      [null]
    ]
    for (const editorGroups of bad) {
      const s = sanitizeSession({ ...three, editorGroups, activeGroup: 0, editorSplitRatio: 0.5 })
      expect(s).not.toBeNull()
      expect(s?.tabs).toHaveLength(3)
      expect(s?.editorGroups).toBeUndefined()
      expect(s?.activeGroup).toBeUndefined()
    }
  })

  it('deduplicates indices within the group and drops empty groups', () => {
    const s = sanitizeSession({
      ...three,
      editorGroups: [
        { tabs: [0, 0, 1], activeIndex: 1 },
        { tabs: [], activeIndex: null }
      ]
    })
    expect(s?.editorGroups).toEqual([{ tabs: [0, 1], activeIndex: 1 }])
  })

  it('accepts up to 8 groups with the grid, which follows the remapping of empty groups', () => {
    const s = sanitizeSession({
      ...three,
      editorGroups: [
        { tabs: [0], activeIndex: 0 },
        { tabs: [], activeIndex: null },
        { tabs: [1], activeIndex: 1 },
        { tabs: [2], activeIndex: 2 }
      ],
      activeGroup: 3,
      editorLayout: {
        direction: 'row',
        children: [
          { group: 0 },
          { direction: 'column', children: [{ group: 1 }, { group: 2 }, { group: 3 }], sizes: [0.2, 0.4, 0.4] }
        ],
        sizes: [0.5, 0.5]
      }
    })
    expect(s?.editorGroups).toHaveLength(3)
    // Group 3 became 2 (the empty one left): the active group and the grid follow.
    expect(s?.activeGroup).toBe(2)
    expect(s?.editorLayout).toEqual({
      direction: 'row',
      children: [{ group: 0 }, { direction: 'column', children: [{ group: 1 }, { group: 2 }], sizes: [0.5, 0.5] }],
      sizes: [0.5, 0.5]
    })
  })

  it('an invalid or single-group grid is omitted', () => {
    const editorGroups = [
      { tabs: [0], activeIndex: 0 },
      { tabs: [1], activeIndex: 1 }
    ]
    expect(sanitizeSession({ ...three, editorGroups, editorLayout: 'x' })?.editorLayout).toBeUndefined()
    expect(
      sanitizeSession({ ...three, editorGroups: [editorGroups[0]], editorLayout: { group: 0 } })?.editorLayout
    ).toBeUndefined()
    expect(sanitizeSession({ ...three, editorLayout: { group: 0 } })?.editorLayout).toBeUndefined()
  })

  it('an out-of-range activeGroup is omitted and the ratio is clamped', () => {
    const editorGroups = [{ tabs: [0], activeIndex: 0 }]
    expect(sanitizeSession({ ...three, editorGroups, activeGroup: 1 })?.activeGroup).toBeUndefined()
    expect(sanitizeSession({ ...three, editorGroups, activeGroup: 0.5 })?.activeGroup).toBeUndefined()
    expect(sanitizeSession({ ...three, editorGroups, editorSplitRatio: 0.01 })?.editorSplitRatio).toBe(0.15)
    expect(sanitizeSession({ ...three, editorGroups, editorSplitRatio: 5 })?.editorSplitRatio).toBe(0.85)
    expect(sanitizeSession({ ...three, editorGroups, editorSplitRatio: NaN })?.editorSplitRatio).toBeUndefined()
    expect(sanitizeSession({ ...three, editorGroups, editorSplitRatio: '0.5' })?.editorSplitRatio).toBeUndefined()
  })

  it('closed tabs: keeps the 20 most recent, drops invalid ones and normalizes group and position', () => {
    const closed = (i: number): unknown => ({ tab: { kind: 'image', path: `/r/${i}.png` }, group: 1, index: i })
    const s = sanitizeSession({
      ...three,
      closedTabs: [
        ...Array.from({ length: 20 }, (_, i) => closed(i)),
        { tab: { kind: 'file', path: 'relative' }, group: 0, index: 0 },
        { tab: { kind: 'diff', path: '/r/d.ts', staged: true }, group: -1, index: 2.5 }
      ]
    })
    expect(s?.closedTabs).toHaveLength(19)
    expect(s?.closedTabs?.[0]).toEqual({ tab: { kind: 'image', path: '/r/2.png' }, group: 1, index: 2 })
    expect(s?.closedTabs?.at(-1)).toEqual({
      tab: { kind: 'diff', path: '/r/d.ts', staged: true },
      group: null,
      index: 0
    })
    expect(sanitizeSession({ ...three, closedTabs: 'x' })?.closedTabs).toBeUndefined()
  })
})

describe('sanitizeSession: debugger', () => {
  it('keeps valid breakpoints and the Run and Debug view', () => {
    const breakpoints = [
      { path: '/p/a.py', breakpoints: [{ line: 3 }, { line: 7, enabled: false, condition: 'x > 1' }] }
    ]
    const clean = sanitizeSession({ ...base, view: 'debug', breakpoints, watches: ['x', 'y.z'] })
    expect(clean?.view).toBe('debug')
    expect(clean?.breakpoints).toEqual(breakpoints)
    expect(clean?.watches).toEqual(['x', 'y.z'])
  })

  it('drops invalid and duplicate lines and relative, repeated and empty files', () => {
    const clean = sanitizeSession({
      ...base,
      breakpoints: [
        { path: 'rel.py', breakpoints: [{ line: 1 }] },
        {
          path: '/p/a.py',
          breakpoints: [{ line: 0 }, { line: 2.7 }, { line: 2 }, { line: 'x' }, { line: 4, condition: '' }]
        },
        { path: '/p/a.py', breakpoints: [{ line: 9 }] },
        { path: '/p/b.py', breakpoints: [{ line: -1 }] }
      ],
      watches: ['ok', '', 3]
    })
    expect(clean?.breakpoints).toEqual([{ path: '/p/a.py', breakpoints: [{ line: 2 }, { line: 4 }] }])
    expect(clean?.watches).toEqual(['ok'])
  })

  it('a session without the fields does not invent them', () => {
    const clean = sanitizeSession(base)
    expect(clean?.breakpoints).toBeUndefined()
    expect(clean?.watches).toBeUndefined()
  })
})
