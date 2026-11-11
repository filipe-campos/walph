import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceInfo } from '@shared/types'
import type { PickerData } from './pickers'

vi.mock('../../claudePromptActions', () => ({ askClaude: vi.fn() }))
vi.mock('../../workspaceActions', () => ({ activateWorkspace: vi.fn() }))
vi.mock('../../commands/registry', () => ({
  executeCommand: vi.fn(),
  keybindingOf: () => undefined,
  recentCommandIds: () => [],
  listCommands: () => [{ id: 'a.cmd', category: 'Teste', title: 'Comando', run: () => {} }]
}))
vi.mock('../../workspaceLifecycle', () => ({ openWorkspace: vi.fn() }))
vi.mock('../../tabActions', () => ({ openFile: vi.fn() }))
vi.mock('../../terminalActions', () => ({ createTerminal: vi.fn() }))
vi.mock('../../settingsActions', () => ({ selectTheme: vi.fn() }))
vi.mock('../editor/editorFocus', () => ({ focusEditor: vi.fn() }))
vi.mock('../../navigationState', () => ({ recordNavigation: vi.fn() }))
vi.mock('../../lspNavigationActions', () => ({ revealSymbol: vi.fn() }))
vi.mock('../../gitActions', () => ({ stashSave: vi.fn() }))
const { compareActiveWith } = vi.hoisted(() => ({ compareActiveWith: vi.fn() }))
vi.mock('../../compareActions', () => ({ compareActiveWith }))

const { buildPickerList, PICKERS } = await import('./pickers')

const ws = (id: string, name: string, extra: Partial<WorkspaceInfo> = {}): WorkspaceInfo => ({
  id,
  name,
  root: `/p/${name}`,
  branch: 'main',
  status: 'idle',
  unread: 0,
  active: false,
  dormant: false,
  muted: false,
  ...extra
})

const data = (patch: Partial<PickerData> = {}): PickerData =>
  ({
    platform: 'linux',
    picker: undefined,
    unified: false,
    root: '/p/walph',
    files: { root: '/p/walph', list: { files: ['src/App.tsx', 'README.md'], truncated: false } },
    openPaths: [],
    visibleRecent: [],
    activeFilePath: '/p/walph/src/App.tsx',
    cursorLine: 4,
    cursorColumn: undefined,
    workspaces: null,
    ...patch
  }) as PickerData

describe('buildPickerList', () => {
  it('an active picker ignores the query prefixes', () => {
    const list = buildPickerList('>x', data({ picker: 'stashMessage' }))
    expect(list.items.map((i) => i.key)).toEqual(['save'])
  })

  it('"Compare with…" lists the files and compares the chosen one instead of opening it', async () => {
    const { openFile } = await import('../../tabActions')
    const list = buildPickerList('readme', data({ picker: 'compareFile' }))
    expect(list.items.map((i) => i.key)).toEqual(['README.md'])
    list.items[0]?.run()
    expect(compareActiveWith).toHaveBeenCalledWith('/p/walph/README.md')
    expect(openFile).not.toHaveBeenCalled()
  })

  it('has a builder for each picker', () => {
    expect(Object.keys(PICKERS).sort()).toEqual(
      [
        'branch',
        'cloneUrl',
        'compareFile',
        'createBranch',
        'debugConfig',
        'encoding',
        'language',
        'recent',
        'stashMessage',
        'stashPick',
        'terminalProfile',
        'theme',
        'insertSnippet',
        'configureSnippets',
        'snippetFileGlobal',
        'snippetFileWorkspace',
        'emmetWrap'
      ].sort()
    )
  })

  it('`:` goes to the line using the active tab cursor', () => {
    expect(buildPickerList(':', data()).items[0].label).toContain('Linha atual: 4, Coluna: 1')
    expect(buildPickerList(':12', data()).items[0].label).toBe('Ir para a linha 12')
  })

  it('`>` lists commands and the text without a prefix lists files', () => {
    expect(buildPickerList('>', data()).items.map((i) => i.key)).toContain('a.cmd')
    expect(buildPickerList('App', data()).items.map((i) => i.key)).toContain('src/App.tsx')
  })

  it('the unified palette only applies without a prefix; `>` is still commands only', () => {
    const d = data({ unified: true, workspaces: { selfId: 'w1', workspaces: [ws('w1', 'walph')] } })
    const groups = (q: string): (string | undefined)[] => [...new Set(buildPickerList(q, d).items.map((i) => i.group))]
    expect(groups('wal')).toContain('Workspaces')
    expect(groups('>')).toEqual([undefined])
  })
})
