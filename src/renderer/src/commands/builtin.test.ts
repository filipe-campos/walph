import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COMMAND_IDS, isCommandAvailable, type CommandId } from '@shared/commands'
import { t } from '@shared/i18n'
import type { WorkspaceInfo } from '@shared/types'
import { installFakeApi, type DeepPartial } from '../test/fakeApi'
import { fileTab } from '../test/tabFixtures'
import type * as RegistryModule from './registry'
import type * as StoreModule from '../store'
import type { WalphApi } from '@shared/types'

const { fns, mockModule } = vi.hoisted(() => {
  const fns = new Map<string, ReturnType<typeof vi.fn>>()
  const mockModule = (module: string, names: string[]): Record<string, unknown> =>
    Object.fromEntries(
      names.map((name) => {
        const fn = vi.fn()
        fns.set(`${module}.${name}`, fn)
        return [name, fn]
      })
    )
  return { fns, mockModule }
})

vi.mock('../searchActions', () =>
  mockModule('search', [
    'clearSearch',
    'collapseAllResults',
    'expandAllResults',
    'replaceAllResults',
    'showSearch',
    'stepSearchResult'
  ])
)
vi.mock('../lspActions', () =>
  mockModule('lsp', [
    'formatDocument',
    'quickFix',
    'renameSymbol',
    'saveAllTabsManually',
    'saveTabManually',
    'restartLanguageServer'
  ])
)
vi.mock('../lspNavigationActions', () => mockModule('nav', ['goToDefinition', 'goToReferences', 'navigate']))
vi.mock('../claudeEditorContext', () => mockModule('claudeContext', ['insertClaudeReference']))
vi.mock('../claudeLifecycle', () =>
  mockModule('claude', [
    'closeActiveClaudeSession',
    'focusClaude',
    'newClaudeConversation',
    'stepClaudeSession',
    'toggleClaudeSidebar'
  ])
)
vi.mock('../claudeMcpActions', () => mockModule('mcp', ['openClaudeMcp']))
vi.mock('../claudeSessionMeta', () => mockModule('claudeMeta', ['renameActiveClaudeSession']))
vi.mock('../dockerActions', () => mockModule('docker', ['toggleContainers']))
vi.mock('../workspaceActions', () => mockModule('workspace', ['activateWorkspace', 'closeWorkspace']))
vi.mock('../updateActions', () =>
  mockModule('update', ['checkForUpdates', 'installShellCommand', 'uninstallShellCommand'])
)
vi.mock('../settingsActions', () => mockModule('settings', ['openSettingsFile', 'openSettingsModal']))
vi.mock('../overlayActions', () => mockModule('overlay', ['openAddWorkspace']))
vi.mock('../quickInputActions', () =>
  mockModule('quickInput', [
    'openCloneUrlPicker',
    'openRecentPicker',
    'openThemePicker',
    'openQuickInput',
    'openUnifiedPalette',
    'toggleCommandPalette'
  ])
)
vi.mock('../layoutActions', () => mockModule('layout', ['openClaudeFind', 'showView', 'toggleSidebar']))
vi.mock('../recentActions', () => mockModule('recent', ['clearRecentFolders']))
vi.mock('../gitActions', () =>
  mockModule('git', [
    'abortGitOperation',
    'discardAll',
    'openBranchPicker',
    'openCreateBranchPicker',
    'pullChanges',
    'pushChanges',
    'startAmend',
    'syncChanges',
    'undoLastCommit'
  ])
)
vi.mock('../gitHunkActions', () => mockModule('gitHunk', ['canRunOnActive', 'runOnSelection']))
vi.mock('../gitMergeActions', () =>
  mockModule('gitMerge', ['acceptAllActiveConflicts', 'hasActiveConflicts', 'stepActiveConflict'])
)
vi.mock('../gitBlameActions', () => mockModule('gitBlame', ['toggleFileBlame']))
vi.mock('../gitHistoryActions', () =>
  mockModule('gitHistory', ['openStashMessagePicker', 'openStashPicker', 'showHistory'])
)
vi.mock('../terminalActions', () =>
  mockModule('terminal', [
    'createTerminal',
    'killActiveTerminal',
    'openTerminalFind',
    'openTerminalProfilePicker',
    'splitTerminal',
    'startRenameTerminal',
    'togglePanelMaximized',
    'togglePanelPosition',
    'togglePanelView',
    'toggleTerminal'
  ])
)
vi.mock('../tabActions', () =>
  mockModule('tabs', [
    'activeLoadedFileTab',
    'closeEditorGroup',
    'closeOtherTabs',
    'closeSavedTabs',
    'closeTab',
    'closeTabsToRight',
    'focusOtherEditorGroup',
    'focusEditorGroupAt',
    'focusEditorGroupToward',
    'joinAllEditorGroups',
    'moveActiveTabToAdjacentGroup',
    'openMarkdownPreview',
    'splitEditor',
    'activeTab'
  ])
)
vi.mock('../closedTabActions', () => mockModule('closedTabs', ['reopenClosedTab']))
vi.mock('../tabFormatActions', () =>
  mockModule('tabFormat', ['openEncodingPicker', 'openLanguagePicker', 'toggleActiveEol'])
)
vi.mock('../explorerFsActions', () =>
  mockModule('explorerFs', ['copySelection', 'duplicateSelection', 'pasteIntoExplorer'])
)
vi.mock('../workspaceLifecycle', () => mockModule('lifecycle', ['pickAndOpenWorkspace']))
vi.mock('../debugActions', () =>
  mockModule('debug', [
    'continueOrStart',
    'debugControl',
    'openDebugConfigPicker',
    'openLaunchJson',
    'restartDebugging',
    'startDebugging',
    'stopDebugging'
  ])
)
vi.mock('../debugBreakpointActions', () =>
  mockModule('debugBreakpoints', [
    'addConditionalBreakpointAtCursor',
    'removeAllBreakpoints',
    'toggleBreakpointAtCursor'
  ])
)

const fn = (key: string): ReturnType<typeof vi.fn> => {
  const found = fns.get(key)
  if (!found) throw new Error(`unknown mock: ${key}`)
  return found
}

type Registry = typeof RegistryModule
type Store = typeof StoreModule

let registry: Registry
let store: Store
let fake: ReturnType<typeof installFakeApi>

async function load(overrides: DeepPartial<WalphApi> = {}): Promise<void> {
  vi.resetModules()
  fake = installFakeApi(overrides)
  registry = await import('./registry')
  store = await import('../store')
  const { registerBuiltinCommands } = await import('./builtin')
  registerBuiltinCommands()
}

const command = (id: CommandId) => {
  const found = registry.listAllCommands().find((c) => c.id === id)
  if (!found) throw new Error(`command not registered: ${id}`)
  return found
}
const run = (id: CommandId, ...args: unknown[]): unknown => command(id).run(...args)
const available = (id: CommandId): boolean => command(id).when?.() !== false
const ids = (): CommandId[] => registry.listAllCommands().map((c) => c.id)

function workspaces(...active: boolean[]): void {
  const list = active.map(
    (isActive, i) => ({ id: `w${i + 1}`, name: `w${i + 1}`, root: null, active: isActive }) as unknown as WorkspaceInfo
  )
  store.set({ workspaces: { selfId: 'w1', workspaces: list } })
}

beforeEach(async () => {
  await load()
  fn('tabs.activeTab').mockReturnValue(undefined)
  fn('tabs.activeLoadedFileTab').mockReturnValue(null)
})

describe('built-in command registration', () => {
  it('registers once: calling again neither duplicates nor replaces the commands', async () => {
    const { registerBuiltinCommands } = await import('./builtin')
    const before = registry.listAllCommands()
    registerBuiltinCommands()
    expect(registry.listAllCommands()).toEqual(before)
  })

  it('every command available on this platform has an implementation, and only those', () => {
    const expected = COMMAND_IDS.filter((id) => isCommandAvailable(id, 'linux', false))
    expect([...ids()].sort()).toEqual([...expected].sort())
  })

  it('title and category follow the current language (read at call time)', async () => {
    const i18n = await import('@shared/i18n')
    const save = command('editor.save')
    const portuguese = [save.title, save.category]
    i18n.setLocale('en')
    expect([save.title, save.category]).toEqual([
      i18n.t().commands.titles['editor.save'],
      i18n.t().commands.categories.file
    ])
    expect([save.title, save.category]).not.toEqual(portuguese)
  })

  it('the default shortcut comes from the shared contract', () => {
    expect(command('workbench.quickOpen').keybinding).toBe('CmdOrCtrl+P')
  })

  it('the "quit" title on macOS carries the app name', async () => {
    await load({ platform: 'darwin' })
    expect(command('workbench.quit').title).toBe(t().commands.quitApp('Walph'))
  })
})

describe('availability by platform and build', () => {
  it('in development there are reload and DevTools, and no updater or walph command', () => {
    expect(ids()).toEqual(expect.arrayContaining(['workbench.reload', 'workbench.toggleDevTools']))
    expect(ids()).not.toContain('update.check')
    expect(ids()).not.toContain('cli.install')
    expect(ids()).not.toContain('cli.uninstall')
  })

  it('in the packaged app it is the opposite', async () => {
    await load({ isPackaged: true })
    expect(ids()).not.toContain('workbench.reload')
    expect(ids()).not.toContain('workbench.toggleDevTools')
    expect(ids()).toEqual(expect.arrayContaining(['update.check', 'cli.install', 'cli.uninstall']))
  })

  it('"Close window" only exists on macOS', async () => {
    expect(ids()).not.toContain('workbench.closeWindow')
    await load({ platform: 'darwin' })
    expect(ids()).toContain('workbench.closeWindow')
  })
})

describe('commands that delegate to an action', () => {
  const direct: [CommandId, string][] = [
    ['workbench.openFolder', 'lifecycle.pickAndOpenWorkspace'],
    ['workspace.add', 'overlay.openAddWorkspace'],
    ['workbench.openRecent', 'quickInput.openRecentPicker'],
    ['workbench.clearRecent', 'recent.clearRecentFolders'],
    ['workbench.saveAll', 'lsp.saveAllTabsManually'],
    ['workbench.closeSavedTabs', 'tabs.closeSavedTabs'],
    ['workbench.reopenClosedEditor', 'closedTabs.reopenClosedTab'],
    ['workbench.showCommandPalette', 'quickInput.toggleCommandPalette'],
    ['workbench.showUnifiedPalette', 'quickInput.openUnifiedPalette'],
    ['explorer.duplicate', 'explorerFs.duplicateSelection'],
    ['explorer.paste', 'explorerFs.pasteIntoExplorer'],
    ['search.clearResults', 'search.clearSearch'],
    ['search.collapseAll', 'search.collapseAllResults'],
    ['search.expandAll', 'search.expandAllResults'],
    ['view.containers', 'docker.toggleContainers'],
    ['update.check', 'update.checkForUpdates'],
    ['workbench.openSettings', 'settings.openSettingsModal'],
    ['workbench.selectTheme', 'quickInput.openThemePicker'],
    ['git.clone', 'quickInput.openCloneUrlPicker'],
    ['git.checkout', 'git.openBranchPicker'],
    ['git.createBranch', 'git.openCreateBranchPicker'],
    ['git.pull', 'git.pullChanges'],
    ['git.push', 'git.pushChanges'],
    ['git.sync', 'git.syncChanges'],
    ['git.commitAmend', 'git.startAmend'],
    ['git.undoLastCommit', 'git.undoLastCommit'],
    ['git.discardAll', 'git.discardAll'],
    ['git.stash', 'gitHistory.openStashMessagePicker'],
    ['git.showHistory', 'gitHistory.showHistory'],
    ['terminal.toggle', 'terminal.toggleTerminal'],
    ['terminal.newWithProfile', 'terminal.openTerminalProfilePicker'],
    ['terminal.split', 'terminal.splitTerminal'],
    ['terminal.kill', 'terminal.killActiveTerminal'],
    ['terminal.find', 'terminal.openTerminalFind'],
    ['view.togglePanelMaximized', 'terminal.togglePanelMaximized'],
    ['view.togglePanelPosition', 'terminal.togglePanelPosition'],
    ['editor.focusOtherGroup', 'tabs.focusOtherEditorGroup'],
    ['editor.joinAllGroups', 'tabs.joinAllEditorGroups'],
    ['editor.markdownPreview', 'tabs.openMarkdownPreview'],
    ['editor.changeLanguageMode', 'tabFormat.openLanguagePicker'],
    ['editor.changeEncoding', 'tabFormat.openEncodingPicker'],
    ['editor.toggleEol', 'tabFormat.toggleActiveEol'],
    ['claude.focus', 'claude.focusClaude'],
    ['claude.closeSession', 'claude.closeActiveClaudeSession'],
    ['claude.renameSession', 'claudeMeta.renameActiveClaudeSession'],
    ['claude.find', 'layout.openClaudeFind'],
    ['claude.insertReference', 'claudeContext.insertClaudeReference'],
    ['claude.toggleSidebar', 'claude.toggleClaudeSidebar'],
    ['lsp.restartServer', 'lsp.restartLanguageServer']
  ]

  it.each(direct)('%s calls %s', async (id, key) => {
    if (id === 'update.check') await load({ isPackaged: true })
    await run(id)
    expect(fn(key)).toHaveBeenCalledTimes(1)
  })

  const withArgs: [CommandId, string, unknown[]][] = [
    ['workbench.quickOpen', 'quickInput.openQuickInput', ['']],
    ['editor.goToLine', 'quickInput.openQuickInput', [':']],
    ['editor.goToSymbol', 'quickInput.openQuickInput', ['@']],
    ['workbench.showAllSymbols', 'quickInput.openQuickInput', ['#']],
    ['view.explorer', 'layout.showView', ['explorer']],
    ['view.git', 'layout.showView', ['git']],
    ['explorer.copy', 'explorerFs.copySelection', ['copy']],
    ['explorer.cut', 'explorerFs.copySelection', ['cut']],
    ['view.search', 'search.showSearch', [false]],
    ['search.replaceInFiles', 'search.showSearch', [true]],
    ['search.nextResult', 'search.stepSearchResult', [1]],
    ['search.previousResult', 'search.stepSearchResult', [-1]],
    ['view.problems', 'terminal.togglePanelView', ['problems']],
    ['view.output', 'terminal.togglePanelView', ['output']],
    ['git.stashApply', 'gitHistory.openStashPicker', ['apply']],
    ['git.stashPop', 'gitHistory.openStashPicker', ['pop']],
    ['git.stashDrop', 'gitHistory.openStashPicker', ['drop']],
    ['workbench.navigateBack', 'nav.navigate', ['back']],
    ['workbench.navigateForward', 'nav.navigate', ['forward']],
    ['claude.nextSession', 'claude.stepClaudeSession', [1]],
    ['claude.previousSession', 'claude.stepClaudeSession', [-1]],
    ['workbench.openSettingsJson', 'settings.openSettingsFile', ['user']],
    ['workbench.openWorkspaceSettings', 'settings.openSettingsFile', ['workspace']],
    ['workbench.openKeybindings', 'settings.openSettingsFile', ['keybindings']],
    ['editor.splitRight', 'tabs.splitEditor', ['right']],
    ['editor.splitDown', 'tabs.splitEditor', ['down']],
    ['editor.focusLeftGroup', 'tabs.focusEditorGroupToward', ['left']],
    ['editor.focusRightGroup', 'tabs.focusEditorGroupToward', ['right']],
    ['editor.focusAboveGroup', 'tabs.focusEditorGroupToward', ['up']],
    ['editor.focusBelowGroup', 'tabs.focusEditorGroupToward', ['down']],
    ['editor.moveToNextGroup', 'tabs.moveActiveTabToAdjacentGroup', [1]],
    ['editor.moveToPreviousGroup', 'tabs.moveActiveTabToAdjacentGroup', [-1]],
    ['editor.focusGroup1', 'tabs.focusEditorGroupAt', [0]],
    ['editor.focusGroup8', 'tabs.focusEditorGroupAt', [7]]
  ]

  it.each(withArgs)('%s calls %s with the fixed arguments', async (id, key, args) => {
    await run(id)
    expect(fn(key)).toHaveBeenCalledWith(...args)
  })

  it('does not forward stray arguments to parameterless actions', async () => {
    const stray = [{ stray: true }, 'x', 7]
    await run('terminal.new', ...stray)
    expect(fn('terminal.createTerminal')).toHaveBeenCalledWith()
    await run('editor.goToDefinition', ...stray)
    expect(fn('nav.goToDefinition')).toHaveBeenCalledWith()
    await run('editor.rename', ...stray)
    expect(fn('lsp.renameSymbol')).toHaveBeenCalledWith()
    await run('editor.closeGroup', ...stray)
    expect(fn('tabs.closeEditorGroup')).toHaveBeenCalledWith()
    await run('claude.newConversation', ...stray)
    expect(fn('claude.newClaudeConversation')).toHaveBeenCalledWith()
    await run('claude.manageMcp', ...stray)
    expect(fn('mcp.openClaudeMcp')).toHaveBeenCalledWith()
  })

  it('native commands ask main for the window action', async () => {
    const native: [CommandId, string][] = [
      ['workbench.newWindow', 'newWindow'],
      ['workbench.quit', 'quit'],
      ['view.resetZoom', 'resetZoom'],
      ['view.zoomIn', 'zoomIn'],
      ['view.zoomOut', 'zoomOut'],
      ['view.toggleFullScreen', 'toggleFullScreen'],
      ['workbench.reload', 'reload'],
      ['workbench.toggleDevTools', 'toggleDevTools']
    ]
    for (const [id, action] of native) {
      await run(id)
      expect(fake.api.window.run).toHaveBeenLastCalledWith(action)
    }
  })

  it('help links open in the browser', async () => {
    await run('help.support')
    expect(fake.api.window.openExternal).toHaveBeenLastCalledWith(
      expect.stringMatching(/^https:\/\/github\.com\/.*support/)
    )
    await run('help.reportIssue')
    expect(fake.api.window.openExternal).toHaveBeenLastCalledWith(expect.stringMatching(/issues\/new/))
  })

  it('the walph command only exists when packaged and calls install and uninstall', async () => {
    await load({ isPackaged: true })
    await run('cli.install')
    await run('cli.uninstall')
    expect(fn('update.installShellCommand')).toHaveBeenCalledTimes(1)
    expect(fn('update.uninstallShellCommand')).toHaveBeenCalledTimes(1)
  })

  it('"Close window" on macOS asks for the closeWindow action', async () => {
    await load({ platform: 'darwin' })
    await run('workbench.closeWindow')
    expect(fake.api.window.run).toHaveBeenLastCalledWith('closeWindow')
  })
})

describe('commands relative to the active tab', () => {
  it.each<[CommandId, string]>([
    ['editor.save', 'lsp.saveTabManually'],
    ['workbench.closeTab', 'tabs.closeTab'],
    ['workbench.closeOtherTabs', 'tabs.closeOtherTabs'],
    ['workbench.closeTabsToRight', 'tabs.closeTabsToRight']
  ])('%s acts on the active tab', async (id, key) => {
    store.set({ activeTabId: 'x' })
    await run(id)
    expect(fn(key)).toHaveBeenCalledWith('x')
  })

  it.each<[CommandId, string]>([
    ['editor.save', 'lsp.saveTabManually'],
    ['workbench.closeTab', 'tabs.closeTab'],
    ['workbench.closeOtherTabs', 'tabs.closeOtherTabs'],
    ['workbench.closeTabsToRight', 'tabs.closeTabsToRight']
  ])('%s without an active tab does nothing', async (id, key) => {
    store.set({ activeTabId: null })
    await run(id)
    expect(fn(key)).not.toHaveBeenCalled()
  })
})

describe('workspaces', () => {
  it('closing the workspace uses this view id; without workspaces state it does nothing', () => {
    run('workspace.close')
    expect(fn('workspace.closeWorkspace')).not.toHaveBeenCalled()
    workspaces(true, false)
    run('workspace.close')
    expect(fn('workspace.closeWorkspace')).toHaveBeenCalledWith('w1')
  })

  it('next and previous are cyclic and need at least two tabs', () => {
    workspaces(true)
    run('workspace.next')
    expect(fn('workspace.activateWorkspace')).not.toHaveBeenCalled()
    workspaces(false, false, true)
    run('workspace.next')
    expect(fn('workspace.activateWorkspace')).toHaveBeenLastCalledWith('w1')
    run('workspace.previous')
    expect(fn('workspace.activateWorkspace')).toHaveBeenLastCalledWith('w2')
  })

  it('⌘N activates the Nth tab, except the one already active or one that does not exist', () => {
    workspaces(true, false)
    run('workspace.select2')
    expect(fn('workspace.activateWorkspace')).toHaveBeenCalledExactlyOnceWith('w2')
    run('workspace.select1')
    run('workspace.select9')
    expect(fn('workspace.activateWorkspace')).toHaveBeenCalledTimes(1)
  })
})

describe('replace all in search', () => {
  it('with the replace field closed it only opens it', () => {
    store.set((s) => ({ search: { ...s.search, replaceOpen: false } }))
    run('search.replaceAll')
    expect(fn('search.showSearch')).toHaveBeenCalledWith(true)
    expect(fn('search.replaceAllResults')).not.toHaveBeenCalled()
  })

  it('with the field open it shows search and replaces', () => {
    store.set((s) => ({ search: { ...s.search, replaceOpen: true } }))
    run('search.replaceAll')
    expect(fn('layout.showView')).toHaveBeenCalledWith('search')
    expect(fn('search.replaceAllResults')).toHaveBeenCalledTimes(1)
    expect(fn('search.showSearch')).not.toHaveBeenCalled()
  })
})

describe('when clauses', () => {
  it('git commands only apply in a folder that is a repository; clone always applies', () => {
    const gitIds: CommandId[] = [
      'git.checkout',
      'git.createBranch',
      'git.pull',
      'git.push',
      'git.sync',
      'git.commitAmend',
      'git.undoLastCommit',
      'git.discardAll',
      'git.stash',
      'git.stashApply',
      'git.stashPop',
      'git.stashDrop',
      'git.showHistory'
    ]
    store.set({ git: null })
    for (const id of gitIds) expect(available(id), id).toBe(false)
    expect(available('git.clone')).toBe(true)
    store.set({ git: { isRepo: true } as never })
    for (const id of gitIds) expect(available(id), id).toBe(true)
    store.set({ git: { isRepo: false } as never })
    expect(available('git.pull')).toBe(false)
  })

  it('Claude commands and workspace settings need an open folder', () => {
    const rootIds: CommandId[] = [
      'claude.focus',
      'claude.newConversation',
      'claude.nextSession',
      'claude.previousSession',
      'claude.closeSession',
      'claude.renameSession',
      'claude.manageMcp',
      'claude.toggleSidebar',
      'explorer.paste',
      'workbench.openWorkspaceSettings'
    ]
    store.set({ root: null })
    for (const id of rootIds) expect(available(id), id).toBe(false)
    store.set({ root: '/r' })
    for (const id of rootIds) expect(available(id), id).toBe(true)
  })

  it('"Find in Claude" requires an active conversation', () => {
    expect(available('claude.find')).toBe(false)
    store.set((s) => ({ claude: { ...s.claude, activeId: 'c1' } }))
    expect(available('claude.find')).toBe(true)
  })

  it('code actions require an active file', () => {
    const fileIds: CommandId[] = [
      'editor.goToDefinition',
      'editor.goToReferences',
      'editor.goToSymbol',
      'editor.rename',
      'editor.formatDocument',
      'editor.quickFix',
      'claude.insertReference'
    ]
    store.set({ tabs: [fileTab({ id: 'f' })], activeTabId: null })
    for (const id of fileIds) expect(available(id), id).toBe(false)
    store.set({ activeTabId: 'f' })
    for (const id of fileIds) expect(available(id), id).toBe(true)
    store.set({ tabs: [{ id: 'f', kind: 'image', path: '/r/a.png' }] })
    for (const id of fileIds) expect(available(id), id).toBe(false)
  })

  it('splitting the editor needs a tab and room in the grid', () => {
    store.set({ activeTabId: null, editorGroups: [{ id: 'g', tabIds: [], activeTabId: null }] })
    expect(available('editor.splitRight')).toBe(false)
    expect(available('editor.splitDown')).toBe(false)
    store.set({ activeTabId: 'f' })
    expect(available('editor.splitRight')).toBe(true)
    expect(available('editor.splitDown')).toBe(true)
    store.set({
      activeTabId: null,
      editorGroups: [
        { id: 'a', tabIds: [], activeTabId: null },
        { id: 'b', tabIds: [], activeTabId: null }
      ]
    })
    expect(available('editor.splitRight')).toBe(false)
    expect(available('editor.focusOtherGroup')).toBe(true)
    expect(available('editor.closeGroup')).toBe(true)
    expect(available('editor.joinAllGroups')).toBe(true)
    expect(available('editor.focusLeftGroup')).toBe(true)
    store.set({
      activeTabId: 'f',
      editorGroups: Array.from({ length: 8 }, (_, i) => ({ id: `g${i}`, tabIds: ['f'], activeTabId: 'f' }))
    })
    expect(available('editor.splitRight')).toBe(false)
  })

  it('focusing the Nth group applies to existing ones and to the next one (which is created)', () => {
    store.set({
      activeTabId: 'f',
      editorGroups: [
        { id: 'a', tabIds: ['f'], activeTabId: 'f' },
        { id: 'b', tabIds: ['f'], activeTabId: 'f' }
      ]
    })
    expect(available('editor.focusGroup1')).toBe(true)
    expect(available('editor.focusGroup3')).toBe(true)
    expect(available('editor.focusGroup4')).toBe(false)
  })

  it('comparison: needs an active file; with the selected one, another marked file', () => {
    store.set({ tabs: [fileTab({ id: 'f', path: '/r/a.ts' })], activeTabId: null })
    expect(available('editor.compareWithSaved')).toBe(false)
    expect(available('editor.selectForCompare')).toBe(false)
    store.set({ activeTabId: 'f', root: '/r' })
    expect(available('editor.compareWithSaved')).toBe(true)
    expect(available('editor.compareWith')).toBe(true)
    expect(available('editor.compareWithSelected')).toBe(false)
    store.set({ compareSelection: '/r/b.ts' })
    expect(available('editor.compareWithSelected')).toBe(true)
    expect(available('editor.swapDiffSides')).toBe(false)
    store.set({
      tabs: [
        {
          id: 'd',
          kind: 'diff',
          path: '/r/b.ts',
          staged: false,
          compare: { left: { path: '/r/a.ts' }, right: { path: '/r/b.ts' } }
        }
      ],
      activeTabId: 'd'
    })
    expect(available('editor.swapDiffSides')).toBe(true)
  })

  it('focusing the other group and closing a group require two groups', () => {
    expect(available('editor.focusOtherGroup')).toBe(false)
    expect(available('editor.closeGroup')).toBe(false)
    expect(available('editor.joinAllGroups')).toBe(false)
    expect(available('editor.focusBelowGroup')).toBe(false)
  })

  it('Markdown preview applies in a .md/.mdx and in the preview itself', () => {
    const tabs = fn('tabs.activeTab')
    tabs.mockReturnValue(fileTab({ path: '/r/README.md' }))
    expect(available('editor.markdownPreview')).toBe(true)
    tabs.mockReturnValue(fileTab({ path: '/r/doc.mdx' }))
    expect(available('editor.markdownPreview')).toBe(true)
    tabs.mockReturnValue({ id: 'p', kind: 'markdownPreview', path: '/r/README.md' })
    expect(available('editor.markdownPreview')).toBe(true)
    tabs.mockReturnValue(fileTab({ path: '/r/a.ts' }))
    expect(available('editor.markdownPreview')).toBe(false)
    tabs.mockReturnValue(undefined)
    expect(available('editor.markdownPreview')).toBe(false)
  })

  it('status bar items require a file loaded in the editor', () => {
    const loaded = fn('tabs.activeLoadedFileTab')
    loaded.mockReturnValue(null)
    for (const id of ['editor.changeLanguageMode', 'editor.changeEncoding', 'editor.toggleEol'] as const)
      expect(available(id), id).toBe(false)
    loaded.mockReturnValue(fileTab())
    for (const id of ['editor.changeLanguageMode', 'editor.changeEncoding', 'editor.toggleEol'] as const)
      expect(available(id), id).toBe(true)
  })

  it('commands without a clause are always available', () => {
    for (const id of ['editor.save', 'workbench.openFolder', 'terminal.toggle', 'view.explorer'] as const)
      expect(command(id).when).toBeUndefined()
  })
})
