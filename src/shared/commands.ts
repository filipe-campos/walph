// Ids of the built-in commands and their default shortcuts. Single source for the native menu (main) and the palette
// (renderer), so the shortcut shown in the palette is always the one the menu registers.
import { t } from './i18n'

/** Select workspace 1…9: the index is the workspace position in the bar. */
export const WORKSPACE_SELECT_IDS = [
  'workspace.select1',
  'workspace.select2',
  'workspace.select3',
  'workspace.select4',
  'workspace.select5',
  'workspace.select6',
  'workspace.select7',
  'workspace.select8',
  'workspace.select9'
] as const

/** Focus the 1st…8th editor group: the index is the group position in the grid (reading order). */
export const EDITOR_GROUP_FOCUS_IDS = [
  'editor.focusGroup1',
  'editor.focusGroup2',
  'editor.focusGroup3',
  'editor.focusGroup4',
  'editor.focusGroup5',
  'editor.focusGroup6',
  'editor.focusGroup7',
  'editor.focusGroup8'
] as const

/** Every id, for whoever needs to walk the table (e.g. main building the chord shortcuts). */
export const COMMAND_IDS = [
  'workbench.openFolder',
  'workbench.newWindow',
  'workbench.openRecent',
  'workbench.clearRecent',
  'editor.save',
  'workbench.saveAll',
  'workbench.closeTab',
  'workbench.closeOtherTabs',
  'workbench.closeTabsToRight',
  'workbench.closeSavedTabs',
  'workbench.reopenClosedEditor',
  'workbench.openSettings',
  'workbench.openSettingsJson',
  'workbench.openWorkspaceSettings',
  'workbench.openKeybindings',
  'workbench.selectTheme',
  'workbench.closeWindow',
  'workbench.quit',
  'workbench.showCommandPalette',
  'workbench.showUnifiedPalette',
  'workbench.quickOpen',
  'editor.goToLine',
  'workbench.reload',
  'workbench.toggleDevTools',
  'view.explorer',
  'view.search',
  'search.replaceInFiles',
  'search.nextResult',
  'search.previousResult',
  'search.replaceAll',
  'search.clearResults',
  'search.collapseAll',
  'search.expandAll',
  'view.git',
  'view.containers',
  'view.problems',
  'view.output',
  'view.toggleSidebar',
  'view.resetZoom',
  'view.zoomIn',
  'view.zoomOut',
  'view.toggleFullScreen',
  'terminal.toggle',
  'terminal.new',
  'terminal.newWithProfile',
  'terminal.split',
  'terminal.kill',
  'terminal.rename',
  'terminal.find',
  'view.togglePanelMaximized',
  'view.togglePanelPosition',
  'lsp.restartServer',
  'view.debug',
  'view.debugConsole',
  'debug.start',
  'debug.runWithoutDebugging',
  'debug.continue',
  'debug.pause',
  'debug.stop',
  'debug.restart',
  'debug.stepOver',
  'debug.stepInto',
  'debug.stepOut',
  'debug.toggleBreakpoint',
  'debug.addConditionalBreakpoint',
  'debug.removeAllBreakpoints',
  'debug.selectConfiguration',
  'debug.openLaunchJson',
  'editor.goToDefinition',
  'editor.goToReferences',
  'editor.goToImplementation',
  'editor.goToTypeDefinition',
  'editor.goToDeclaration',
  'editor.peekDefinition',
  'editor.peekImplementation',
  'editor.peekReferences',
  'editor.showCallHierarchy',
  'editor.showTypeHierarchy',
  'workbench.navigateBack',
  'workbench.navigateForward',
  'editor.rename',
  'editor.formatDocument',
  'editor.quickFix',
  'editor.goToSymbol',
  'workbench.showAllSymbols',
  'editor.splitRight',
  'editor.focusOtherGroup',
  'editor.closeGroup',
  'editor.splitDown',
  'editor.focusLeftGroup',
  'editor.focusRightGroup',
  'editor.focusAboveGroup',
  'editor.focusBelowGroup',
  'editor.moveToNextGroup',
  'editor.moveToPreviousGroup',
  'editor.joinAllGroups',
  ...EDITOR_GROUP_FOCUS_IDS,
  'editor.selectForCompare',
  'editor.compareWithSelected',
  'editor.compareWithSaved',
  'editor.compareWith',
  'editor.swapDiffSides',
  'editor.markdownPreview',
  'editor.changeLanguageMode',
  'editor.changeEncoding',
  'editor.toggleEol',
  'editor.nextSymbolHighlight',
  'editor.previousSymbolHighlight',
  'editor.insertSnippet',
  'workbench.configureSnippets',
  'emmet.expandAbbreviation',
  'emmet.wrapWithAbbreviation',
  'emmet.balanceOutward',
  'emmet.balanceInward',
  'editor.focusBreadcrumbs',
  'view.toggleBreadcrumbs',
  'view.toggleStickyScroll',
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
  'git.showHistory',
  'git.clone',
  'git.stageSelectedRanges',
  'git.unstageSelectedRanges',
  'git.revertSelectedRanges',
  'git.nextConflict',
  'git.previousConflict',
  'git.acceptAllCurrent',
  'git.acceptAllIncoming',
  'git.acceptAllBoth',
  'git.abortOperation',
  'git.toggleBlame',
  'claude.focus',
  'claude.newConversation',
  'claude.insertReference',
  'claude.toggleSidebar',
  'claude.nextSession',
  'claude.previousSession',
  'claude.closeSession',
  'claude.renameSession',
  'claude.find',
  'claude.manageMcp',
  'explorer.copy',
  'explorer.cut',
  'explorer.paste',
  'explorer.duplicate',
  'workspace.add',
  'workspace.close',
  'workspace.next',
  'workspace.previous',
  ...WORKSPACE_SELECT_IDS,
  'update.check',
  'cli.install',
  'cli.uninstall',
  'help.support',
  'help.reportIssue'
] as const

export type CommandId = (typeof COMMAND_IDS)[number]

type WorkspaceSelectId = (typeof WORKSPACE_SELECT_IDS)[number]
type EditorGroupFocusId = (typeof EDITOR_GROUP_FOCUS_IDS)[number]
/** Commands with a fixed title in `commands.titles`; select workspace and focus group carry the number in the title. */
export type TitledCommandId = Exclude<CommandId, WorkspaceSelectId | EditorGroupFocusId>

/** Command title in the current language (palette, shortcut list and, by default, the native menu label). */
export function commandTitle(id: CommandId, platform: string): string {
  const messages = t().commands
  const select = (WORKSPACE_SELECT_IDS as readonly CommandId[]).indexOf(id)
  if (select >= 0) return messages.selectWorkspace(select + 1)
  const focus = (EDITOR_GROUP_FOCUS_IDS as readonly CommandId[]).indexOf(id)
  if (focus >= 0) return messages.focusEditorGroup(focus + 1)
  if (id === 'workbench.quit' && platform === 'darwin') return messages.quitApp('Walph')
  return messages.titles[id as TitledCommandId]
}

/** Native window actions that main runs on the renderer's request (equivalent to the menu `role`s). */
export type WindowAction =
  | 'newWindow'
  | 'closeWindow'
  | 'quit'
  | 'reload'
  | 'toggleDevTools'
  | 'resetZoom'
  | 'zoomIn'
  | 'zoomOut'
  | 'toggleFullScreen'

/** A default shortcut: the key (Electron accelerator) and, optionally, the `when` clause that enables it. */
export interface DefaultBinding {
  key: string
  when?: string
}

/**
 * Default shortcuts of a command, in order of preference (the native menu and the UI show the first); empty list = no
 * shortcut. Two commands may use the same key only with disjoint `when`s (the `commands.test.ts` test ensures it).
 * Chords are space-separated accelerators (`Ctrl+K S`): the native menu does not accept them, so main handles them
 * in `before-input-event` (see `isChord`).
 */
export function defaultKeybindings(id: CommandId, platform: string): readonly DefaultBinding[] {
  const keys = defaultKeys(id, platform)
  const list = keys === undefined ? [] : typeof keys === 'string' ? [keys] : keys
  return list.map((key) => {
    const when = defaultWhen(id, platform, key)
    return when ? { key, when } : { key }
  })
}

/** Key of the first default shortcut (`undefined` = no shortcut): display before the first `SettingsSnapshot`. */
export function defaultKeybinding(id: CommandId, platform: string): string | undefined {
  return defaultKeybindings(id, platform)[0]?.key
}

/**
 * Default keys of a command in Electron accelerator format (`CmdOrCtrl+Shift+P`): one, several (the first is the
 * main one) or `undefined`. Depends on the OS because some native shortcuts differ (full screen, devtools, quit).
 */
function defaultKeys(id: CommandId, platform: string): string | readonly string[] | undefined {
  const isMac = platform === 'darwin'
  switch (id) {
    // ⌘O opens the folder as a new workspace; changing the folder of the current workspace has no shortcut.
    case 'workbench.openFolder':
      return undefined
    case 'workbench.newWindow':
      return 'CmdOrCtrl+Shift+N'
    // Ctrl+R (VS Code's) is already Reload in dev and, in the terminal, the shell's reverse search.
    case 'workbench.openRecent':
    case 'workbench.clearRecent':
      return undefined
    case 'editor.save':
      return 'CmdOrCtrl+S'
    case 'workbench.saveAll':
      return isMac ? 'Alt+Cmd+S' : 'Ctrl+K S'
    // With focus in the Claude panel, ⌘W closes the session (`claude.closeSession`), not the editor tab.
    case 'workbench.closeTab':
      return 'CmdOrCtrl+W'
    case 'workbench.closeOtherTabs':
    case 'workbench.closeTabsToRight':
    case 'workbench.closeSavedTabs':
      return undefined
    case 'workbench.reopenClosedEditor':
      return 'CmdOrCtrl+Shift+T'
    case 'workbench.openSettings':
      return 'CmdOrCtrl+,'
    case 'workbench.openSettingsJson':
    case 'workbench.openWorkspaceSettings':
    case 'workbench.openKeybindings':
    case 'workbench.selectTheme':
      return undefined
    case 'workbench.closeWindow':
      return 'CmdOrCtrl+Shift+W'
    case 'workbench.quit':
      // Same as the native role: on Windows quit is Alt+F4 (Ctrl+Q would close the app with focus in the terminal).
      return platform === 'win32' ? undefined : isMac ? 'Cmd+Q' : 'Ctrl+Q'
    case 'workbench.showCommandPalette':
      return 'CmdOrCtrl+Shift+P'
    // ⌘K from the design system. On Win/Linux Ctrl+K is the prefix of the Save All chord and Ctrl+Shift+K deletes a
    // line in the editor: no default shortcut there (the user picks one in keybindings.json).
    case 'workbench.showUnifiedPalette':
      return isMac ? 'Cmd+K' : undefined
    case 'workbench.quickOpen':
      return 'CmdOrCtrl+P'
    case 'editor.goToLine':
      // As in VS Code: Ctrl+G on every OS (on macOS ⌘G is "Find Next").
      return 'Ctrl+G'
    case 'workbench.reload':
      return 'CmdOrCtrl+R'
    case 'workbench.toggleDevTools':
      return isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I'
    case 'view.explorer':
      return 'CmdOrCtrl+Shift+E'
    case 'view.search':
      return 'CmdOrCtrl+Shift+F'
    case 'search.replaceInFiles':
      return 'CmdOrCtrl+Shift+H'
    case 'search.nextResult':
      return 'F4'
    case 'search.previousResult':
      return 'Shift+F4'
    case 'search.replaceAll':
    case 'search.clearResults':
    case 'search.collapseAll':
    case 'search.expandAll':
      return undefined
    // On macOS ⌘⇧G is "Find Previous" in the editor: as in VS Code, Git goes to ⌃⇧G.
    case 'view.git':
      return 'Ctrl+Shift+G'
    // Containers screen (⇧⌘D from the design system).
    case 'view.containers':
      return 'CmdOrCtrl+Shift+D'
    case 'view.problems':
      return 'CmdOrCtrl+Shift+M'
    case 'view.output':
      return 'CmdOrCtrl+Shift+U'
    case 'view.toggleSidebar':
      return 'CmdOrCtrl+B'
    case 'view.resetZoom':
      return 'CmdOrCtrl+0'
    case 'view.zoomIn':
      return 'CmdOrCtrl+Plus'
    case 'view.zoomOut':
      return 'CmdOrCtrl+-'
    // Outside macOS F11 is Full Screen only without a debug session (`defaultWhen`); with one it is Step Into
    // (debug.stepInto).
    case 'view.toggleFullScreen':
      return isMac ? 'Ctrl+Cmd+F' : 'F11'
    case 'terminal.toggle':
      return 'Ctrl+`'
    case 'terminal.new':
      return 'Ctrl+Shift+`'
    // Split and search only with the terminal focused (`defaultWhen`): outside it ⌘F belongs to the editor and ⌘\ is
    // free.
    case 'terminal.split':
      return isMac ? 'Cmd+\\' : 'Ctrl+Shift+5'
    case 'terminal.find':
      return 'CmdOrCtrl+F'
    case 'terminal.newWithProfile':
    case 'terminal.kill':
    case 'terminal.rename':
    case 'view.togglePanelMaximized':
    case 'view.togglePanelPosition':
      return undefined
    case 'lsp.restartServer':
      return undefined
    // VS Code keys. ⇧⌘D (its "Run and Debug") is already the Containers screen.
    case 'view.debug':
      return undefined
    case 'view.debugConsole':
      return 'CmdOrCtrl+Shift+Y'
    case 'debug.start':
    case 'debug.continue':
      return 'F5'
    case 'debug.runWithoutDebugging':
      return 'Ctrl+F5'
    case 'debug.pause':
      return 'F6'
    case 'debug.stop':
      return 'Shift+F5'
    case 'debug.restart':
      return 'CmdOrCtrl+Shift+F5'
    case 'debug.stepOver':
      return 'F10'
    case 'debug.stepInto':
      return 'F11'
    case 'debug.stepOut':
      return 'Shift+F11'
    case 'debug.toggleBreakpoint':
      return 'F9'
    case 'debug.addConditionalBreakpoint':
    case 'debug.removeAllBreakpoints':
    case 'debug.selectConfiguration':
    case 'debug.openLaunchJson':
      return undefined
    // Code actions: only with the editor focused (`defaultWhen`), otherwise F2/F12 would steal keys from the
    // explorer/terminal.
    case 'editor.goToDefinition':
      return 'F12'
    case 'editor.goToReferences':
      return 'Shift+F12'
    case 'editor.nextSymbolHighlight':
      return 'F7'
    case 'editor.previousSymbolHighlight':
      return 'Shift+F7'
    // As in VS Code; Shift+F12 is already Go to References, so Peek References has no default shortcut.
    case 'editor.goToImplementation':
      return 'CmdOrCtrl+F12'
    case 'editor.peekDefinition':
      return 'Alt+F12'
    case 'editor.peekImplementation':
      return 'CmdOrCtrl+Shift+F12'
    case 'editor.showCallHierarchy':
      return 'Shift+Alt+H'
    case 'editor.goToTypeDefinition':
    case 'editor.goToDeclaration':
    case 'editor.peekReferences':
    case 'editor.showTypeHierarchy':
      return undefined
    // On Windows/Linux Ctrl+- is "Zoom Out": VS Code's default applies on those OSes (Alt+←/→).
    case 'workbench.navigateBack':
      return isMac ? 'Ctrl+-' : 'Alt+Left'
    case 'workbench.navigateForward':
      return isMac ? 'Ctrl+Shift+-' : 'Alt+Right'
    case 'editor.rename':
      return 'F2'
    case 'editor.formatDocument':
      return 'Shift+Alt+F'
    case 'editor.quickFix':
      return 'CmdOrCtrl+.'
    case 'editor.goToSymbol':
      return 'CmdOrCtrl+Shift+O'
    case 'workbench.showAllSymbols':
      return 'CmdOrCtrl+T'
    // ⌘\ splits the editor outside the terminal (in the terminal the same key splits the terminal, disjoint `when`s).
    case 'editor.splitRight':
      return 'CmdOrCtrl+\\'
    case 'editor.focusOtherGroup':
    case 'editor.closeGroup':
    case 'editor.joinAllGroups':
      return undefined
    // ⌘K is the unified palette on macOS (it cannot be a chord prefix): there split down goes to ⌥⌘\.
    case 'editor.splitDown':
      return isMac ? 'Alt+Cmd+\\' : 'Ctrl+K Ctrl+\\'
    // For the same reason, on macOS the directional focus commands live only in the palette and the menu.
    case 'editor.focusLeftGroup':
      return isMac ? undefined : 'Ctrl+K Ctrl+Left'
    case 'editor.focusRightGroup':
      return isMac ? undefined : 'Ctrl+K Ctrl+Right'
    case 'editor.focusAboveGroup':
      return isMac ? undefined : 'Ctrl+K Ctrl+Up'
    case 'editor.focusBelowGroup':
      return isMac ? undefined : 'Ctrl+K Ctrl+Down'
    case 'editor.moveToNextGroup':
      return isMac ? 'Ctrl+Cmd+Right' : 'Ctrl+Alt+Right'
    case 'editor.moveToPreviousGroup':
      return isMac ? 'Ctrl+Cmd+Left' : 'Ctrl+Alt+Left'
    // ⌘1…⌘9 already select the workspace: the group goes to ⌃1…⌃8 (macOS) and Alt+1…8 (Win/Linux).
    case 'editor.focusGroup1':
    case 'editor.focusGroup2':
    case 'editor.focusGroup3':
    case 'editor.focusGroup4':
    case 'editor.focusGroup5':
    case 'editor.focusGroup6':
    case 'editor.focusGroup7':
    case 'editor.focusGroup8':
      return `${isMac ? 'Ctrl' : 'Alt'}+${id.slice(-1)}`
    case 'editor.compareWithSaved':
      return isMac ? undefined : 'Ctrl+K D'
    case 'editor.selectForCompare':
    case 'editor.compareWithSelected':
    case 'editor.compareWith':
    case 'editor.swapDiffSides':
      return undefined
    // Clickable status bar items; through the palette, no default shortcut.
    case 'editor.changeLanguageMode':
    case 'editor.changeEncoding':
    case 'editor.toggleEol':
      return undefined
    // Snippets and Emmet: through the palette (and the menu); Emmet's Tab belongs to the editor, not an app shortcut.
    case 'editor.insertSnippet':
    case 'workbench.configureSnippets':
    case 'emmet.expandAbbreviation':
    case 'emmet.wrapWithAbbreviation':
    case 'emmet.balanceOutward':
    case 'emmet.balanceInward':
      return undefined
    case 'editor.focusBreadcrumbs':
      return 'CmdOrCtrl+Shift+.'
    case 'view.toggleBreadcrumbs':
    case 'view.toggleStickyScroll':
      return undefined
    // Only with the editor focused: in other fields ⇧⌘V is paste without formatting and, in the Linux terminal,
    // Ctrl+Shift+V pastes.
    case 'editor.markdownPreview':
      return 'CmdOrCtrl+Shift+V'
    // Git commands only through the palette, status bar and source control view (no default shortcut).
    case 'git.checkout':
    case 'git.createBranch':
    case 'git.pull':
    case 'git.push':
    case 'git.sync':
    case 'git.commitAmend':
    case 'git.undoLastCommit':
    case 'git.discardAll':
    case 'git.stash':
    case 'git.stashApply':
    case 'git.stashPop':
    case 'git.stashDrop':
    case 'git.showHistory':
    case 'git.stageSelectedRanges':
    case 'git.unstageSelectedRanges':
    case 'git.revertSelectedRanges':
    case 'git.nextConflict':
    case 'git.previousConflict':
    case 'git.acceptAllCurrent':
    case 'git.acceptAllIncoming':
    case 'git.acceptAllBoth':
    case 'git.abortOperation':
    case 'git.toggleBlame':
      return undefined
    // Welcome action. Ctrl+Alt alone is AltGr on Windows layouts (e.g. Polish AltGr+O = ó): with Shift.
    case 'git.clone':
      return isMac ? 'Alt+Cmd+O' : 'Ctrl+Shift+Alt+O'
    // ⌘L from the design system (in the editor "select line" stays in the palette); ⌘⎋ as in the official VS Code
    // extension.
    case 'claude.focus':
      return isMac ? ['Cmd+L', 'Cmd+Escape'] : ['Ctrl+L', 'Ctrl+Escape']
    case 'claude.newConversation':
      return 'CmdOrCtrl+Shift+L'
    case 'claude.insertReference':
      return 'Alt+K'
    // `claude.manageMcp`: only through the palette, the panel's ⋯ menu and `/mcp` in the prompt.
    case 'claude.toggleSidebar':
    case 'claude.manageMcp':
      return undefined
    // Only with focus in the Claude panel (`defaultWhen`).
    case 'claude.nextSession':
      return 'Ctrl+Tab'
    case 'claude.previousSession':
      return 'Ctrl+Shift+Tab'
    case 'claude.closeSession':
      return 'CmdOrCtrl+W'
    case 'claude.renameSession':
      return 'F2'
    // With focus in the Claude panel, ⌘F searches text in the session (`defaultWhen`).
    case 'claude.find':
      return 'CmdOrCtrl+F'
    // Only with focus in the explorer tree (`defaultWhen`): in the editor, the terminal and Claude ⌘C/⌘X/⌘V belong to
    // the text.
    case 'explorer.copy':
      return 'CmdOrCtrl+C'
    case 'explorer.cut':
      return 'CmdOrCtrl+X'
    case 'explorer.paste':
      return 'CmdOrCtrl+V'
    case 'explorer.duplicate':
      return undefined
    case 'workspace.add':
      return 'CmdOrCtrl+O'
    case 'workspace.close':
      return undefined
    // Literal Ctrl on every OS (as in browser tabs); with focus in Claude the same key switches session.
    case 'workspace.next':
      return 'Ctrl+Tab'
    case 'workspace.previous':
      return 'Ctrl+Shift+Tab'
    case 'workspace.select1':
    case 'workspace.select2':
    case 'workspace.select3':
    case 'workspace.select4':
    case 'workspace.select5':
    case 'workspace.select6':
    case 'workspace.select7':
    case 'workspace.select8':
    case 'workspace.select9':
      return `CmdOrCtrl+${id.slice(-1)}`
    case 'update.check':
    case 'cli.install':
    case 'cli.uninstall':
    case 'help.support':
    case 'help.reportIssue':
      return undefined
    default: {
      // Fails to compile if a new CommandId is left without a `case`.
      const exhaustive: never = id
      return exhaustive
    }
  }
}

/**
 * `true` if the command exists on this platform/build. Single source for the renderer registry, the native menu and
 * main's shortcut tables: an unavailable command must not swallow the key in `before-input-event` (e.g. Ctrl+R in the
 * packaged app has to reach the terminal shell).
 */
export function isCommandAvailable(id: CommandId, platform: string, isPackaged: boolean): boolean {
  switch (id) {
    case 'workbench.reload':
    case 'workbench.toggleDevTools':
      return !isPackaged
    // The updater and the `walph` command point to the installed executable; in dev it would be the node_modules
    // Electron.
    case 'update.check':
    case 'cli.install':
    case 'cli.uninstall':
      return isPackaged
    // Outside macOS there is no "Close Window" (closing the window is quitting).
    case 'workbench.closeWindow':
      return platform === 'darwin'
    default:
      return true
  }
}

/** Context keys that the renderer reports to main and that the shortcuts' `when` clauses can use. */
export const CONTEXT_KEYS = [
  'terminalFocus',
  'editorFocus',
  'claudeFocus',
  'markdownPreviewFocus',
  'explorerFocus',
  'inDebugMode'
] as const

export type ContextKey = (typeof CONTEXT_KEYS)[number]

/**
 * Mutually exclusive focus contexts: all derive from the same `document.activeElement` and the containers (`.xterm`,
 * `.code-editor .cm-editor`, `.claude-panel`, `.markdown-preview`, `.tree`) do not nest, so at most one is true at a
 * time. Used to decide whether two `when` clauses can hold together (`whenDisjoint`).
 */
export const FOCUS_CONTEXT_KEYS = [
  'terminalFocus',
  'editorFocus',
  'claudeFocus',
  'markdownPreviewFocus',
  'explorerFocus'
] as const satisfies readonly ContextKey[]

export type FocusContextKey = (typeof FOCUS_CONTEXT_KEYS)[number]

/**
 * Default `when` clause of a shortcut (`!terminalFocus`, `a && !b`, `a || b`), or `undefined` (always active). `key` is
 * the shortcut key, for when only one of the command's shortcuts has a `when`.
 * A shortcut with `when` does not become a menu accelerator (which fires on any focus): main handles it in
 * `before-input-event` and the menu only shows the hint in the label, as with chords.
 */
function defaultWhen(id: CommandId, platform: string, key: string): string | undefined {
  // On Win/Linux the 1st stroke of the chord (Ctrl+K) is "delete to end of line" in the shell: in the terminal it
  // belongs to the shell.
  if (id === 'workbench.saveAll' && platform !== 'darwin') return '!terminalFocus'
  // Outside the editor, Alt+K (claude.insertReference) is text (e.g. "˚" on macOS) or a shell key.
  switch (id) {
    case 'editor.goToDefinition':
    case 'editor.goToReferences':
    case 'editor.goToImplementation':
    case 'editor.goToTypeDefinition':
    case 'editor.goToDeclaration':
    case 'editor.peekDefinition':
    case 'editor.peekImplementation':
    case 'editor.peekReferences':
    case 'editor.showCallHierarchy':
    case 'editor.showTypeHierarchy':
    case 'editor.rename':
    case 'editor.formatDocument':
    case 'editor.quickFix':
    case 'editor.nextSymbolHighlight':
    case 'editor.previousSymbolHighlight':
    case 'claude.insertReference':
      return 'editorFocus'
    // In the preview, the same key goes back to the source file.
    case 'editor.markdownPreview':
      return 'editorFocus || markdownPreviewFocus'
    case 'editor.splitRight':
      return '!terminalFocus'
    // In the terminal, Ctrl+K (chord prefix), Alt+digit (readline argument) and Ctrl+Alt+arrow belong to the shell.
    case 'editor.splitDown':
    case 'editor.focusLeftGroup':
    case 'editor.focusRightGroup':
    case 'editor.focusAboveGroup':
    case 'editor.focusBelowGroup':
    case 'editor.moveToNextGroup':
    case 'editor.moveToPreviousGroup':
    case 'editor.compareWithSaved':
    case 'editor.focusGroup1':
    case 'editor.focusGroup2':
    case 'editor.focusGroup3':
    case 'editor.focusGroup4':
    case 'editor.focusGroup5':
    case 'editor.focusGroup6':
    case 'editor.focusGroup7':
    case 'editor.focusGroup8':
      return '!terminalFocus'
    case 'terminal.split':
    case 'terminal.find':
      return 'terminalFocus'
    // In the terminal, Ctrl+- / Alt+← belong to the shell (readline undo, previous word).
    case 'workbench.navigateBack':
    case 'workbench.navigateForward':
      return '!terminalFocus'
    // On Win/Linux Ctrl+L is "clear screen" in the terminal shell.
    case 'claude.focus':
      return key === 'Ctrl+L' ? '!terminalFocus' : undefined
    case 'claude.nextSession':
    case 'claude.previousSession':
    case 'claude.closeSession':
    case 'claude.renameSession':
    case 'claude.find':
      return 'claudeFocus'
    case 'explorer.copy':
    case 'explorer.cut':
    case 'explorer.paste':
    case 'explorer.duplicate':
      return 'explorerFocus'
    case 'workbench.closeTab':
    case 'workspace.next':
    case 'workspace.previous':
      return '!claudeFocus'
    // F5 starts without a session and continues with one; the other debugger keys only apply during the session.
    case 'debug.start':
    case 'debug.runWithoutDebugging':
      return '!inDebugMode'
    case 'debug.continue':
    case 'debug.pause':
    case 'debug.stop':
    case 'debug.restart':
    case 'debug.stepOver':
    case 'debug.stepInto':
    case 'debug.stepOut':
      return 'inDebugMode'
    case 'debug.toggleBreakpoint':
      return 'editorFocus'
    case 'view.toggleFullScreen':
      return platform === 'darwin' ? undefined : '!inDebugMode'
    // Outside macOS Ctrl+T is "transpose characters" in the terminal shell.
    case 'workbench.showAllSymbols':
      return platform === 'darwin' ? undefined : '!terminalFocus'
    default:
      return undefined
  }
}

/** `true` if the shortcut is a chord (`Ctrl+K S`), which the native menu cannot register as an accelerator. */
export function isChord(keybinding: string): boolean {
  return keybinding.trim().includes(' ')
}
