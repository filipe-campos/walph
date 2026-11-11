import { describe, expect, it } from 'vitest'
import {
  COMMAND_IDS,
  defaultKeybinding,
  defaultKeybindings,
  isChord,
  isCommandAvailable,
  type CommandId
} from './commands'

const IDS = COMMAND_IDS
/** Commands whose default shortcut is a `Ctrl+K …` chord on Windows/Linux. */
const DEFAULT_CHORDS: CommandId[] = [
  'workbench.saveAll',
  'editor.splitDown',
  'editor.focusLeftGroup',
  'editor.focusRightGroup',
  'editor.focusAboveGroup',
  'editor.focusBelowGroup',
  'editor.compareWithSaved'
]

const PLATFORMS = ['darwin', 'win32', 'linux']
// On Windows quit has no shortcut (native Alt+F4), as in Electron's `quit` role.
// The unified palette (⌘K) only has a default shortcut on macOS: Ctrl+K is the prefix of the Save All chord elsewhere.
// On macOS ⌘K is the unified palette and cannot be a chord prefix: the group/compare chords have no shortcut there.
const SEM_ATALHO: Record<string, CommandId[]> = {
  darwin: [
    'editor.focusLeftGroup',
    'editor.focusRightGroup',
    'editor.focusAboveGroup',
    'editor.focusBelowGroup',
    'editor.compareWithSaved'
  ],
  win32: ['workbench.quit', 'workbench.showUnifiedPalette'],
  linux: ['workbench.showUnifiedPalette']
}
// Commands with no default shortcut on any OS (palette, menus, context menu of the tabs / status bar / git view).
const SO_PALETA: CommandId[] = [
  'update.check',
  'cli.install',
  'cli.uninstall',
  'help.support',
  'help.reportIssue',
  'workbench.closeOtherTabs',
  'workbench.closeTabsToRight',
  'workbench.closeSavedTabs',
  'workbench.openSettingsJson',
  'workbench.openWorkspaceSettings',
  'workbench.openKeybindings',
  'workbench.selectTheme',
  'workbench.openRecent',
  'workbench.openFolder',
  'workspace.close',
  'workbench.clearRecent',
  'editor.focusOtherGroup',
  'editor.closeGroup',
  'editor.joinAllGroups',
  'editor.selectForCompare',
  'editor.compareWithSelected',
  'editor.compareWith',
  'editor.swapDiffSides',
  'editor.changeLanguageMode',
  'editor.changeEncoding',
  'editor.toggleEol',
  'editor.insertSnippet',
  'workbench.configureSnippets',
  'emmet.expandAbbreviation',
  'emmet.wrapWithAbbreviation',
  'emmet.balanceOutward',
  'emmet.balanceInward',
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
  'claude.toggleSidebar',
  'claude.manageMcp',
  'lsp.restartServer',
  'editor.goToTypeDefinition',
  'editor.goToDeclaration',
  'editor.peekReferences',
  'editor.showTypeHierarchy',
  'view.debug',
  'debug.addConditionalBreakpoint',
  'debug.removeAllBreakpoints',
  'debug.selectConfiguration',
  'debug.openLaunchJson',
  'search.replaceAll',
  'search.clearResults',
  'search.collapseAll',
  'search.expandAll',
  'terminal.newWithProfile',
  'terminal.kill',
  'terminal.rename',
  'view.togglePanelMaximized',
  'view.togglePanelPosition',
  'view.toggleBreadcrumbs',
  'view.toggleStickyScroll',
  'explorer.duplicate'
]
const comAtalho = (platform: string): CommandId[] =>
  IDS.filter((id) => !SEM_ATALHO[platform]?.includes(id) && !SO_PALETA.includes(id))

describe('defaultKeybinding', () => {
  it.each(PLATFORMS)('every command has a shortcut on %s', (platform) => {
    for (const id of comAtalho(platform)) expect(defaultKeybinding(id, platform), id).toBeTruthy()
  })

  it('palette-only commands have no shortcut on any OS', () => {
    for (const platform of PLATFORMS) {
      for (const id of SO_PALETA) expect(defaultKeybinding(id, platform), `${id} ${platform}`).toBeUndefined()
    }
  })

  it('save all is Alt+Cmd+S on macOS and the Ctrl+K S chord on Windows/Linux', () => {
    expect(defaultKeybinding('workbench.saveAll', 'darwin')).toBe('Alt+Cmd+S')
    expect(defaultKeybinding('workbench.saveAll', 'win32')).toBe('Ctrl+K S')
    expect(defaultKeybinding('workbench.saveAll', 'linux')).toBe('Ctrl+K S')
  })

  it('full screen, devtools and quit differ between darwin and win32/linux', () => {
    for (const id of ['view.toggleFullScreen', 'workbench.toggleDevTools', 'workbench.quit'] as CommandId[]) {
      const mac = defaultKeybinding(id, 'darwin')
      expect(defaultKeybinding(id, 'win32'), id).not.toBe(mac)
      expect(defaultKeybinding(id, 'linux'), id).not.toBe(mac)
    }
  })

  it('win32 has no shortcut to quit', () => {
    expect(defaultKeybinding('workbench.quit', 'win32')).toBeUndefined()
  })

  it('win32 and linux share the same shortcuts (except quit)', () => {
    for (const id of comAtalho('win32')) expect(defaultKeybinding(id, 'win32'), id).toBe(defaultKeybinding(id, 'linux'))
  })

  it('uses the expected palette and zoom shortcuts', () => {
    expect(defaultKeybinding('workbench.showCommandPalette', 'darwin')).toBe('CmdOrCtrl+Shift+P')
    expect(defaultKeybinding('view.zoomIn', 'linux')).toBe('CmdOrCtrl+Plus')
  })
})

describe('defaultKeybindings', () => {
  it('claude.focus has two shortcuts, ⌘L first; on Win/Linux Ctrl+L yields to the terminal shell', () => {
    expect(defaultKeybindings('claude.focus', 'darwin')).toEqual([{ key: 'Cmd+L' }, { key: 'Cmd+Escape' }])
    expect(defaultKeybindings('claude.focus', 'linux')).toEqual([
      { key: 'Ctrl+L', when: '!terminalFocus' },
      { key: 'Ctrl+Escape' }
    ])
  })

  it('⌘F: search in the Claude session only with focus in the panel, disjoint from the terminal search', () => {
    expect(defaultKeybindings('claude.find', 'darwin')).toEqual([{ key: 'CmdOrCtrl+F', when: 'claudeFocus' }])
    expect(defaultKeybindings('terminal.find', 'darwin')).toEqual([{ key: 'CmdOrCtrl+F', when: 'terminalFocus' }])
  })

  it('⌘W: close tab outside the Claude panel, close session inside it', () => {
    expect(defaultKeybindings('workbench.closeTab', 'darwin')).toEqual([{ key: 'CmdOrCtrl+W', when: '!claudeFocus' }])
    expect(defaultKeybindings('claude.closeSession', 'darwin')).toEqual([{ key: 'CmdOrCtrl+W', when: 'claudeFocus' }])
  })

  it('⌘K only on macOS; ⌃⇧G is Git on every OS', () => {
    expect(defaultKeybinding('workbench.showUnifiedPalette', 'darwin')).toBe('Cmd+K')
    expect(defaultKeybindings('workbench.showUnifiedPalette', 'linux')).toEqual([])
    for (const platform of PLATFORMS) expect(defaultKeybinding('view.git', platform)).toBe('Ctrl+Shift+G')
  })

  it('defaultKeybinding returns the first shortcut of the list', () => {
    for (const platform of PLATFORMS) {
      for (const id of IDS) expect(defaultKeybinding(id, platform)).toBe(defaultKeybindings(id, platform)[0]?.key)
    }
  })
})

describe('COMMAND_IDS', () => {
  it('has no repeated ids', () => {
    expect(new Set(COMMAND_IDS).size).toBe(COMMAND_IDS.length)
  })
})

describe('isChord', () => {
  it('recognizes chords (space-separated strokes)', () => {
    expect(isChord('Ctrl+K S')).toBe(true)
    expect(isChord('CmdOrCtrl+K CmdOrCtrl+S')).toBe(true)
    expect(isChord('  Ctrl+K S  ')).toBe(true)
  })
  it('single-stroke shortcuts are not chords', () => {
    expect(isChord('Ctrl+S')).toBe(false)
    expect(isChord('Alt+Cmd+S')).toBe(false)
    expect(isChord('CmdOrCtrl+Plus')).toBe(false)
    expect(isChord('F11')).toBe(false)
    expect(isChord('')).toBe(false)
    expect(isChord(' Ctrl+S ')).toBe(false)
  })
  it('default chords only outside macOS (there ⌘K is the unified palette)', () => {
    for (const platform of PLATFORMS) {
      const chords = COMMAND_IDS.filter((id) => {
        const b = defaultKeybinding(id, platform)
        return b !== undefined && isChord(b)
      })
      expect(chords).toEqual(platform === 'darwin' ? [] : DEFAULT_CHORDS)
    }
  })
})

describe('isCommandAvailable', () => {
  it('reload and devtools only exist outside the packaged app', () => {
    for (const id of ['workbench.reload', 'workbench.toggleDevTools'] as const) {
      expect(isCommandAvailable(id, 'linux', false)).toBe(true)
      expect(isCommandAvailable(id, 'linux', true)).toBe(false)
      expect(isCommandAvailable(id, 'darwin', true)).toBe(false)
    }
  })

  it('close window only exists on macOS', () => {
    expect(isCommandAvailable('workbench.closeWindow', 'darwin', true)).toBe(true)
    expect(isCommandAvailable('workbench.closeWindow', 'win32', false)).toBe(false)
    expect(isCommandAvailable('workbench.closeWindow', 'linux', false)).toBe(false)
  })

  it('the other commands are always available', () => {
    expect(isCommandAvailable('workbench.quit', 'darwin', true)).toBe(true)
    expect(isCommandAvailable('editor.save', 'linux', true)).toBe(true)
  })
})

describe('default when of the editor commands', () => {
  it('workspace symbols only yield to the terminal outside macOS', () => {
    expect(defaultKeybindings('workbench.showAllSymbols', 'darwin')).toEqual([{ key: 'CmdOrCtrl+T' }])
    expect(defaultKeybindings('workbench.showAllSymbols', 'linux')).toEqual([
      { key: 'CmdOrCtrl+T', when: '!terminalFocus' }
    ])
    expect(defaultKeybindings('workbench.showAllSymbols', 'win32')[0]?.when).toBe('!terminalFocus')
  })
})
