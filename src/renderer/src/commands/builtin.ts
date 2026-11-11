import {
  EDITOR_GROUP_FOCUS_IDS,
  commandTitle,
  defaultKeybinding,
  isCommandAvailable,
  type CommandId,
  type WindowAction
} from '@shared/commands'
import { t, type Messages } from '@shared/i18n'
import { get } from '../store'
import {
  clearSearch,
  collapseAllResults,
  expandAllResults,
  replaceAllResults,
  showSearch,
  stepSearchResult
} from '../searchActions'
import {
  formatDocument,
  jumpToSymbolHighlight,
  quickFix,
  renameSymbol,
  saveAllTabsManually,
  saveTabManually
} from '../lspActions'
import { goToDefinition, goToLocations, goToReferences, navigate, peekLocations } from '../lspNavigationActions'
import { showHierarchy } from '../hierarchyActions'
import { insertClaudeReference } from '../claudeEditorContext'
import {
  closeActiveClaudeSession,
  focusClaude,
  newClaudeConversation,
  stepClaudeSession,
  toggleClaudeSidebar
} from '../claudeLifecycle'
import { openClaudeMcp } from '../claudeMcpActions'
import { renameActiveClaudeSession } from '../claudeSessionMeta'
import { toggleContainers } from '../dockerActions'
import { isMarkdownPath } from '../lib/markdownPreview'
import { nthWorkspaceId, stepWorkspaceId } from '../lib/workspaces'
import { activateWorkspace, closeWorkspace } from '../workspaceActions'
import { checkForUpdates, installShellCommand, uninstallShellCommand } from '../updateActions'
import { registerCommand } from './registry'
import { reopenClosedTab } from '../closedTabActions'
import { openSettingsFile, openSettingsModal, toggleBooleanSetting } from '../settingsActions'
import { requestOnce } from '../requests'
import {
  emmetBalance,
  emmetExpandAbbreviation,
  hasEmmet,
  openConfigureSnippetsPicker,
  openEmmetWrapPicker,
  openInsertSnippetPicker
} from '../snippetActions'
import { openAddWorkspace } from '../overlayActions'
import {
  openCloneUrlPicker,
  openRecentPicker,
  openThemePicker,
  openQuickInput,
  openUnifiedPalette,
  toggleCommandPalette
} from '../quickInputActions'
import { openClaudeFind, showView, toggleSidebar } from '../layoutActions'
import { clearRecentFolders } from '../recentActions'
import {
  abortGitOperation,
  discardAll,
  openBranchPicker,
  openCreateBranchPicker,
  pullChanges,
  pushChanges,
  startAmend,
  syncChanges,
  undoLastCommit
} from '../gitActions'
import { openStashMessagePicker, openStashPicker, showHistory } from '../gitHistoryActions'
import { canRunOnActive, runOnSelection } from '../gitHunkActions'
import { acceptAllActiveConflicts, hasActiveConflicts, stepActiveConflict } from '../gitMergeActions'
import { toggleFileBlame } from '../gitBlameActions'
import {
  createTerminal,
  killActiveTerminal,
  openTerminalFind,
  openTerminalProfilePicker,
  splitTerminal,
  startRenameTerminal,
  togglePanelMaximized,
  togglePanelPosition,
  togglePanelView,
  toggleTerminal
} from '../terminalActions'
import {
  activeLoadedFileTab,
  closeEditorGroup,
  closeOtherTabs,
  closeSavedTabs,
  closeTab,
  closeTabsToRight,
  focusOtherEditorGroup,
  focusEditorGroupAt,
  focusEditorGroupToward,
  joinAllEditorGroups,
  moveActiveTabToAdjacentGroup,
  openMarkdownPreview,
  splitEditor,
  activeTab as currentTab
} from '../tabActions'
import { openEncodingPicker, openLanguagePicker, toggleActiveEol } from '../tabFormatActions'
import { copySelection, duplicateSelection, pasteIntoExplorer } from '../explorerFsActions'
import { restartLanguageServer } from '../lspActions'
import { pickAndOpenWorkspace } from '../workspaceLifecycle'
import {
  activeFilePath,
  canCompareWithSelected,
  compareActiveWithSaved,
  compareWithSelected,
  isActiveCompare,
  openCompareWithPicker,
  selectForCompare,
  swapCompareSides
} from '../compareActions'
import { MAX_EDITOR_GROUPS } from '@shared/editorLayout'
import {
  continueOrStart,
  debugControl,
  openDebugConfigPicker,
  openLaunchJson,
  restartDebugging,
  startDebugging,
  stopDebugging
} from '../debugActions'
import {
  addConditionalBreakpointAtCursor,
  removeAllBreakpoints,
  toggleBreakpointAtCursor
} from '../debugBreakpointActions'

type CommandCategory = keyof Messages['commands']['categories']

let registered = false

const REPO_URL = 'https://github.com/filipe-campos/walph'

/** Registers the built-in commands (call once at startup). */
export function registerBuiltinCommands(): void {
  if (registered) return
  registered = true

  const { platform, isPackaged } = window.api

  const add = (id: CommandId, category: CommandCategory, run: () => unknown, when?: () => boolean): void => {
    // Same predicate as main (menu and shortcuts): a command unavailable on this platform/build does not exist.
    if (!isCommandAvailable(id, platform, isPackaged)) return
    registerCommand({
      id,
      get title() {
        return commandTitle(id, platform)
      },
      get category() {
        return t().commands.categories[category]
      },
      keybinding: defaultKeybinding(id, platform),
      when,
      run
    })
  }
  const native = (action: WindowAction) => () => window.api.window.run(action)
  const external = (url: string) => () => window.api.window.openExternal(url)
  const activeTab = (): string | null => get().activeTabId

  add('workbench.openFolder', 'file', pickAndOpenWorkspace)
  add('workspace.add', 'file', openAddWorkspace)
  add('workspace.close', 'file', () => {
    const id = get().workspaces?.selfId
    return id ? closeWorkspace(id) : undefined
  })
  const step = (delta: 1 | -1) => () => {
    const id = stepWorkspaceId(get().workspaces?.workspaces ?? [], delta)
    if (id) activateWorkspace(id)
  }
  add('workspace.next', 'go', step(1))
  add('workspace.previous', 'go', step(-1))
  const selectCommands = [
    'workspace.select1',
    'workspace.select2',
    'workspace.select3',
    'workspace.select4',
    'workspace.select5',
    'workspace.select6',
    'workspace.select7',
    'workspace.select8',
    'workspace.select9'
  ] as const satisfies readonly CommandId[]
  selectCommands.forEach((commandId, i) => {
    const n = i + 1
    add(commandId, 'go', () => {
      const list = get().workspaces?.workspaces ?? []
      const id = nthWorkspaceId(list, n)
      if (id && !list.find((w) => w.id === id)?.active) activateWorkspace(id)
    })
  })
  add('workbench.newWindow', 'file', native('newWindow'))
  add('workbench.openRecent', 'file', openRecentPicker)
  add('workbench.clearRecent', 'file', clearRecentFolders)
  // Always listed; without an active tab they become a no-op.
  add('editor.save', 'file', () => {
    const id = activeTab()
    // Manual save: formats first if `editor.formatOnSave` (auto save does not go through here).
    return id ? saveTabManually(id) : undefined
  })
  add('workbench.saveAll', 'file', () => saveAllTabsManually())
  add('workbench.closeTab', 'file', () => {
    const id = activeTab()
    return id ? closeTab(id) : undefined
  })
  // Relative to the active tab; without an active tab they become a no-op.
  add('workbench.closeOtherTabs', 'file', () => {
    const id = activeTab()
    return id ? closeOtherTabs(id) : undefined
  })
  add('workbench.closeTabsToRight', 'file', () => {
    const id = activeTab()
    return id ? closeTabsToRight(id) : undefined
  })
  add('workbench.closeSavedTabs', 'file', closeSavedTabs)
  add('workbench.reopenClosedEditor', 'file', reopenClosedTab)
  add('workbench.closeWindow', 'file', native('closeWindow'))
  add('workbench.quit', 'file', native('quit'))

  add('workbench.showCommandPalette', 'view', toggleCommandPalette)
  add('workbench.showUnifiedPalette', 'view', openUnifiedPalette)
  add('workbench.quickOpen', 'go', () => openQuickInput(''))
  add('editor.goToLine', 'go', () => openQuickInput(':'))
  add('view.explorer', 'view', () => showView('explorer'))
  // File copy and paste: with focus on the tree (`defaultWhen`), otherwise ⌘C/⌘X/⌘V stay with the text.
  add('explorer.copy', 'explorer', () => copySelection('copy'))
  add('explorer.cut', 'explorer', () => copySelection('cut'))
  add(
    'explorer.paste',
    'explorer',
    () => pasteIntoExplorer(),
    () => !!get().root
  )
  add('explorer.duplicate', 'explorer', duplicateSelection)
  add('view.search', 'view', () => showSearch(false))
  add('search.replaceInFiles', 'search', () => showSearch(true))
  add('search.nextResult', 'search', () => stepSearchResult(1))
  add('search.previousResult', 'search', () => stepSearchResult(-1))
  add('search.replaceAll', 'search', () => {
    // Without the replace field open there is nothing to apply: opens and focuses it instead of replacing.
    if (!get().search.replaceOpen) {
      showSearch(true)
      return
    }
    showView('search')
    replaceAllResults()
  })
  add('search.clearResults', 'search', clearSearch)
  add('search.collapseAll', 'search', collapseAllResults)
  add('search.expandAll', 'search', expandAllResults)
  add('view.git', 'view', () => showView('git'))
  add('view.containers', 'view', toggleContainers)
  add('view.problems', 'view', () => togglePanelView('problems'))
  add('view.output', 'view', () => togglePanelView('output'))
  add('view.toggleSidebar', 'view', () => toggleSidebar())
  add('view.resetZoom', 'view', native('resetZoom'))
  add('view.zoomIn', 'view', native('zoomIn'))
  add('view.zoomOut', 'view', native('zoomOut'))
  add('view.toggleFullScreen', 'view', native('toggleFullScreen'))
  add('workbench.reload', 'view', native('reload'))
  add('update.check', 'help', checkForUpdates)
  add('cli.install', 'shell', installShellCommand)
  add('cli.uninstall', 'shell', uninstallShellCommand)
  add('workbench.toggleDevTools', 'view', native('toggleDevTools'))
  add('help.support', 'help', external(`${REPO_URL}#support-walph`))
  add('help.reportIssue', 'help', external(`${REPO_URL}/issues/new/choose`))

  add('workbench.openSettings', 'preferences', openSettingsModal)
  add('workbench.openSettingsJson', 'preferences', () => openSettingsFile('user'))
  add(
    'workbench.openWorkspaceSettings',
    'preferences',
    () => openSettingsFile('workspace'),
    () => !!get().root
  )
  add('workbench.openKeybindings', 'preferences', () => openSettingsFile('keybindings'))
  add('workbench.selectTheme', 'preferences', openThemePicker)

  // Git commands: only exist in a folder that is a repository.
  const inRepo = (): boolean => !!get().git?.isRepo
  // Clone works in any state (also without a folder, from the Welcome screen).
  add('git.clone', 'git', openCloneUrlPicker)
  add('git.checkout', 'git', openBranchPicker, inRepo)
  add('git.createBranch', 'git', openCreateBranchPicker, inRepo)
  add('git.pull', 'git', pullChanges, inRepo)
  add('git.push', 'git', pushChanges, inRepo)
  add('git.sync', 'git', syncChanges, inRepo)
  add('git.commitAmend', 'git', startAmend, inRepo)
  add('git.undoLastCommit', 'git', undoLastCommit, inRepo)
  add('git.discardAll', 'git', discardAll, inRepo)
  add('git.stash', 'git', openStashMessagePicker, inRepo)
  add('git.stashApply', 'git', () => openStashPicker('apply'), inRepo)
  add('git.stashPop', 'git', () => openStashPicker('pop'), inRepo)
  add('git.stashDrop', 'git', () => openStashPicker('drop'), inRepo)
  add('git.showHistory', 'git', showHistory, inRepo)
  // Hunks and lines: in the file tab (against the index, like the gutter) or in the git diff.
  add(
    'git.stageSelectedRanges',
    'git',
    () => runOnSelection('stage'),
    () => inRepo() && canRunOnActive('stage')
  )
  add(
    'git.unstageSelectedRanges',
    'git',
    () => runOnSelection('unstage'),
    () => inRepo() && canRunOnActive('unstage')
  )
  add(
    'git.revertSelectedRanges',
    'git',
    () => runOnSelection('revert'),
    () => inRepo() && canRunOnActive('revert')
  )
  add('git.nextConflict', 'git', () => stepActiveConflict(1), hasActiveConflicts)
  add('git.previousConflict', 'git', () => stepActiveConflict(-1), hasActiveConflicts)
  add('git.acceptAllCurrent', 'git', () => acceptAllActiveConflicts('current'), hasActiveConflicts)
  add('git.acceptAllIncoming', 'git', () => acceptAllActiveConflicts('incoming'), hasActiveConflicts)
  add('git.acceptAllBoth', 'git', () => acceptAllActiveConflicts('both'), hasActiveConflicts)
  add('git.abortOperation', 'git', abortGitOperation, () => !!get().git?.operation)
  add('git.toggleBlame', 'git', toggleFileBlame, () => inRepo() && activeLoadedFileTab() !== null)

  add('terminal.toggle', 'terminal', toggleTerminal)
  add('terminal.new', 'terminal', () => createTerminal())
  add('terminal.newWithProfile', 'terminal', openTerminalProfilePicker)
  add('terminal.split', 'terminal', splitTerminal)
  add('terminal.kill', 'terminal', killActiveTerminal)
  add('terminal.rename', 'terminal', () => startRenameTerminal())
  add('terminal.find', 'terminal', openTerminalFind)
  add('view.togglePanelMaximized', 'view', togglePanelMaximized)
  add('view.togglePanelPosition', 'view', togglePanelPosition)
  // Code actions: only with an active file (main fires them only with the editor focused).
  const hasFile = (): boolean => {
    const { tabs, activeTabId } = get()
    return tabs.some((t) => t.id === activeTabId && t.kind === 'file')
  }
  // Editor groups. Splitting needs a tab to copy (and room in the grid); the others, two groups.
  const isSplit = (): boolean => get().editorGroups.length > 1
  const canSplit = (): boolean => activeTab() !== null && get().editorGroups.length < MAX_EDITOR_GROUPS
  add('editor.splitRight', 'editor', () => splitEditor('right'), canSplit)
  add('editor.focusOtherGroup', 'editor', focusOtherEditorGroup, isSplit)
  add('editor.closeGroup', 'editor', () => closeEditorGroup(), isSplit)
  add('editor.splitDown', 'editor', () => splitEditor('down'), canSplit)
  add('editor.focusLeftGroup', 'editor', () => focusEditorGroupToward('left'), isSplit)
  add('editor.focusRightGroup', 'editor', () => focusEditorGroupToward('right'), isSplit)
  add('editor.focusAboveGroup', 'editor', () => focusEditorGroupToward('up'), isSplit)
  add('editor.focusBelowGroup', 'editor', () => focusEditorGroupToward('down'), isSplit)
  add(
    'editor.moveToNextGroup',
    'editor',
    () => moveActiveTabToAdjacentGroup(1),
    () => activeTab() !== null
  )
  add(
    'editor.moveToPreviousGroup',
    'editor',
    () => moveActiveTabToAdjacentGroup(-1),
    () => activeTab() !== null
  )
  add('editor.joinAllGroups', 'editor', joinAllEditorGroups, isSplit)
  // The group after the last one is created (as in VS Code); beyond it, nothing to focus.
  EDITOR_GROUP_FOCUS_IDS.forEach((id, i) =>
    add(
      id,
      'editor',
      () => focusEditorGroupAt(i),
      () => i < get().editorGroups.length || (i === get().editorGroups.length && canSplit())
    )
  )
  // File comparison: the active file is one of the sides.
  const hasActiveFile = (): boolean => activeFilePath() !== null
  add(
    'editor.selectForCompare',
    'editor',
    () => {
      const path = activeFilePath()
      if (path) selectForCompare(path)
    },
    hasActiveFile
  )
  add(
    'editor.compareWithSelected',
    'editor',
    () => {
      const path = activeFilePath()
      if (path) compareWithSelected(path)
    },
    () => canCompareWithSelected(activeFilePath())
  )
  add('editor.compareWithSaved', 'editor', compareActiveWithSaved, hasActiveFile)
  add('editor.compareWith', 'editor', openCompareWithPicker, () => hasActiveFile() && !!get().root)
  add('editor.swapDiffSides', 'editor', () => swapCompareSides(), isActiveCompare)
  // Preview: only in a `.md`/`.mdx` (opens beside it) or in the preview itself (goes back to the file).
  add('editor.markdownPreview', 'editor', openMarkdownPreview, () => {
    const tab = currentTab()
    return tab?.kind === 'markdownPreview' || (tab?.kind === 'file' && isMarkdownPath(tab.path))
  })
  // Status bar: only valid with a file loaded in the editor.
  const hasLoadedFile = (): boolean => activeLoadedFileTab() !== null
  add('editor.changeLanguageMode', 'editor', openLanguagePicker, hasLoadedFile)
  add('editor.changeEncoding', 'editor', openEncodingPicker, hasLoadedFile)
  add('editor.toggleEol', 'editor', toggleActiveEol, hasLoadedFile)
  add('editor.insertSnippet', 'editor', openInsertSnippetPicker, hasLoadedFile)
  add('workbench.configureSnippets', 'preferences', openConfigureSnippetsPicker)
  const emmetFile = (): boolean => hasLoadedFile() && hasEmmet()
  add('emmet.expandAbbreviation', 'editor', emmetExpandAbbreviation, emmetFile)
  add('emmet.wrapWithAbbreviation', 'editor', openEmmetWrapPicker, emmetFile)
  add('emmet.balanceOutward', 'editor', () => emmetBalance('outward'), emmetFile)
  add('emmet.balanceInward', 'editor', () => emmetBalance('inward'), emmetFile)
  add(
    'editor.focusBreadcrumbs',
    'editor',
    () => requestOnce('breadcrumbsFocus', { groupId: get().activeGroupId }),
    () => hasFile() && get().settings['breadcrumbs.enabled']
  )
  add('view.toggleBreadcrumbs', 'view', () => void toggleBooleanSetting('breadcrumbs.enabled'))
  add('view.toggleStickyScroll', 'view', () => void toggleBooleanSetting('editor.stickyScroll.enabled'))
  add('editor.goToDefinition', 'go', () => goToDefinition(), hasFile)
  add('editor.goToReferences', 'go', () => goToReferences(), hasFile)
  add('editor.nextSymbolHighlight', 'go', () => jumpToSymbolHighlight(1), hasFile)
  add('editor.previousSymbolHighlight', 'go', () => jumpToSymbolHighlight(-1), hasFile)
  add('editor.goToImplementation', 'go', () => goToLocations('implementation'), hasFile)
  add('editor.goToTypeDefinition', 'go', () => goToLocations('typeDefinition'), hasFile)
  add('editor.goToDeclaration', 'go', () => goToLocations('declaration'), hasFile)
  add('editor.peekDefinition', 'go', () => peekLocations('definition'), hasFile)
  add('editor.peekImplementation', 'go', () => peekLocations('implementation'), hasFile)
  add('editor.peekReferences', 'go', () => peekLocations('references'), hasFile)
  add('editor.showCallHierarchy', 'go', () => showHierarchy('call'), hasFile)
  add('editor.showTypeHierarchy', 'go', () => showHierarchy('type'), hasFile)
  add('workbench.navigateBack', 'go', () => navigate('back'))
  add('workbench.navigateForward', 'go', () => navigate('forward'))
  add('editor.goToSymbol', 'go', () => openQuickInput('@'), hasFile)
  add('workbench.showAllSymbols', 'go', () => openQuickInput('#'))
  add('editor.rename', 'editor', () => renameSymbol(), hasFile)
  add('editor.formatDocument', 'editor', () => formatDocument(), hasFile)
  add('editor.quickFix', 'editor', () => quickFix(), hasFile)
  // Claude panel: needs an open folder (the conversation runs in it).
  const hasRoot = (): boolean => !!get().root
  add('claude.focus', 'claude', focusClaude, hasRoot)
  add('claude.newConversation', 'claude', () => newClaudeConversation(), hasRoot)
  add('claude.nextSession', 'claude', () => stepClaudeSession(1), hasRoot)
  add('claude.previousSession', 'claude', () => stepClaudeSession(-1), hasRoot)
  add('claude.closeSession', 'claude', closeActiveClaudeSession, hasRoot)
  add('claude.renameSession', 'claude', renameActiveClaudeSession, hasRoot)
  add('claude.find', 'claude', openClaudeFind, () => !!get().claude.activeId)
  add('claude.manageMcp', 'claude', () => openClaudeMcp(), hasRoot)
  add('claude.insertReference', 'claude', insertClaudeReference, hasFile)
  add('claude.toggleSidebar', 'view', toggleClaudeSidebar, hasRoot)
  add('lsp.restartServer', 'language', restartLanguageServer)

  const debugging = (): boolean => get().debugSessions.length > 0
  add('view.debug', 'view', () => showView('debug'))
  add('view.debugConsole', 'view', () => togglePanelView('debugConsole'))
  add('debug.start', 'debug', () => startDebugging(), hasRoot)
  add('debug.runWithoutDebugging', 'debug', () => startDebugging({ noDebug: true }), hasRoot)
  add('debug.continue', 'debug', continueOrStart, debugging)
  add('debug.pause', 'debug', () => debugControl('pause'), debugging)
  add('debug.stop', 'debug', () => stopDebugging(), debugging)
  add('debug.restart', 'debug', restartDebugging, debugging)
  add('debug.stepOver', 'debug', () => debugControl('next'), debugging)
  add('debug.stepInto', 'debug', () => debugControl('stepIn'), debugging)
  add('debug.stepOut', 'debug', () => debugControl('stepOut'), debugging)
  add('debug.toggleBreakpoint', 'debug', toggleBreakpointAtCursor, hasFile)
  add('debug.addConditionalBreakpoint', 'debug', addConditionalBreakpointAtCursor, hasFile)
  add('debug.removeAllBreakpoints', 'debug', removeAllBreakpoints, () => Object.keys(get().breakpoints).length > 0)
  add('debug.selectConfiguration', 'debug', openDebugConfigPicker, hasRoot)
  add('debug.openLaunchJson', 'debug', openLaunchJson, hasRoot)
}
