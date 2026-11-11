import { describe, expect, it } from 'vitest'
import { installFakeApi } from './test/fakeApi'

installFakeApi()

const { workspaceScopedState, useStore } = await import('./store')

const SCOPED_KEYS = [
  'activeTabId',
  'claude',
  'claudeFavoriteCommands',
  'claudeFindId',
  'claudeVisible',
  'closedTabs',
  'commitAmend',
  'commitMessage',
  'cursor',
  'breakpointStatus',
  'breakpoints',
  'debugConfigs',
  'debugConsole',
  'debugExpanded',
  'debugFocus',
  'debugFrames',
  'debugScopes',
  'debugSelectedConfig',
  'debugSessions',
  'debugThreads',
  'debugVariables',
  'debugWatchResults',
  'debugWatches',
  'diagnostics',
  'fileRevs',
  'dirs',
  'editorGroups',
  'editorLayout',
  'compareSelection',
  'activeGroupId',
  'expanded',
  'explorerClipboard',
  'explorerDrag',
  'explorerEdit',
  'explorerSelected',
  'explorerSelection',
  'explorerAnchor',
  'git',
  'gitBranches',
  'gitHistory',
  'hierarchy',
  'lastCommit',
  'lspStatuses',
  'panelView',
  'quickInput',
  'recentFiles',
  'references',
  'requests',
  'reveal',
  'search',
  'stashes',
  'tabs',
  'themePreview'
].sort()

describe('workspaceScopedState', () => {
  it('resets exactly the per-folder fields', () => {
    expect(Object.keys(workspaceScopedState('/a')).sort()).toEqual(SCOPED_KEYS)
  })

  it('the initial store state comes from the same object (no folder)', () => {
    const initial = useStore.getInitialState()
    const scoped = workspaceScopedState(null)
    for (const key of SCOPED_KEYS.filter(
      (k) => k !== 'activeGroupId' && k !== 'editorGroups' && k !== 'editorLayout' && k !== 'search'
    )) {
      expect(initial[key as keyof typeof initial]).toEqual(scoped[key as keyof typeof scoped])
    }
  })

  it('values of a new folder', () => {
    const s = workspaceScopedState('/a')
    expect(s.expanded).toEqual({ '/a': true })
    expect(s.tabs).toEqual([])
    expect(s.editorGroups).toHaveLength(1)
    expect(s.editorGroups[0]).toMatchObject({ id: s.activeGroupId, tabIds: [], activeTabId: null })
    expect(s.editorLayout).toEqual({ group: s.activeGroupId })
    expect(s.activeTabId).toBeNull()
    expect(s.quickInput).toBeNull()
    expect(s.themePreview).toBeNull()
    expect(s.claudeVisible).toBe(false)
    expect(s.claudeFavoriteCommands).toEqual([])
    expect(s.stashes).toEqual([])
    expect(s.diagnostics).toEqual({})
  })

  it('keeps only claude.starting and the panel view (References goes back to Problems)', () => {
    const claude = { conversations: [{ id: 'c' }] as never, activeId: 'c', starting: true, renamingId: 'c' }
    expect(workspaceScopedState('/a', { claude, panelView: 'output' })).toMatchObject({
      claude: { conversations: [], activeId: null, starting: true, renamingId: null },
      panelView: 'output'
    })
    expect(workspaceScopedState('/a', { claude, panelView: 'references' }).panelView).toBe('problems')
    expect(workspaceScopedState('/a', { claude, panelView: 'hierarchy' }).panelView).toBe('problems')
    expect(workspaceScopedState(null).panelView).toBe('terminal')
    expect(workspaceScopedState(null).claude.starting).toBe(false)
  })
})
