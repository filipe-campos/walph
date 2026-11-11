import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceInfo } from '@shared/types'

const askClaude = vi.fn()
const activateWorkspace = vi.fn()
const executeCommand = vi.fn()

vi.mock('../../claudePromptActions', () => ({ askClaude: (...a: unknown[]) => askClaude(...a) }))
vi.mock('../../workspaceActions', () => ({ activateWorkspace: (...a: unknown[]) => activateWorkspace(...a) }))
vi.mock('../../commands/registry', () => ({
  executeCommand: (...a: unknown[]) => executeCommand(...a),
  keybindingOf: () => undefined,
  recentCommandIds: () => ['b.recent'],
  listCommands: () =>
    [
      ...Array.from({ length: 12 }, (_, i) => ({ id: `a.cmd${i}`, category: 'Teste', title: `Comando ${i}` })),
      { id: 'b.recent', category: 'Teste', title: 'Recente' }
    ].map((c) => ({ ...c, run: () => {} }))
}))
vi.mock('../../workspaceLifecycle', () => ({ openWorkspace: vi.fn() }))
vi.mock('../../tabActions', () => ({ openFile: vi.fn() }))
vi.mock('../../terminalActions', () => ({ createTerminal: vi.fn() }))
vi.mock('../../settingsActions', () => ({ selectTheme: vi.fn() }))
vi.mock('../editor/editorFocus', () => ({ focusEditor: vi.fn() }))
vi.mock('../../navigationState', () => ({ recordNavigation: vi.fn() }))
vi.mock('../../lspNavigationActions', () => ({ revealSymbol: vi.fn() }))

const { buildUnifiedList, buildAskClaudeItem, buildWorkspaceItems } = await import('./buildUnifiedItems')

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

const workspaces = [ws('w1', 'walph', { active: true }), ws('w2', 'api', { status: 'running', unread: 2 })]
const ctx = (root: string | null = '/p/walph') => ({
  platform: 'linux',
  workspaces,
  selfId: 'w1',
  files: {
    root,
    files: { list: { files: ['src/App.tsx', 'src/walph.ts', 'README.md'], truncated: false } },
    openPaths: ['/p/walph/README.md'],
    recent: ['/p/walph/src/App.tsx']
  }
})
const groups = (items: { group?: string | undefined }[]): (string | undefined)[] => [
  ...new Set(items.map((i) => i.group))
]

beforeEach(() => vi.clearAllMocks())

describe('buildUnifiedList', () => {
  it('without a query: workspaces, only recent commands and files, without "Perguntar ao Claude"', () => {
    const { items } = buildUnifiedList('', ctx())
    expect(groups(items)).toEqual(['Workspaces', 'Comandos', 'Arquivos'])
    expect(items.filter((i) => i.group === 'Comandos').map((i) => i.key)).toEqual(['cmd:b.recent'])
    expect(items.some((i) => i.ai)).toBe(false)
  })

  it('with a query: Workspaces, Commands and Files in that order, commands limited and the AI row at the end', () => {
    const { items } = buildUnifiedList('w', ctx())
    const order = groups(items)
    expect(order.indexOf('Workspaces')).toBeLessThan(order.indexOf('Arquivos'))
    expect(items.filter((i) => i.group === 'Comandos').length).toBeLessThanOrEqual(8)
    expect(items.at(-1)).toMatchObject({ key: 'ask-claude', ai: true })
    // Unique keys across groups.
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length)
  })

  it('with nothing matching, the AI row is the only item', () => {
    const { items } = buildUnifiedList('zzzzqqq', ctx())
    expect(items.map((i) => i.key)).toEqual(['ask-claude'])
  })

  it('files with the list still loading do not break', () => {
    const c = ctx()
    const { items } = buildUnifiedList('app', { ...c, files: { ...c.files, files: null } })
    expect(items.some((i) => i.group === 'Arquivos')).toBe(false)
  })
})

describe('workspaces', () => {
  it('brings status, unread and marks the current one; selecting activates only the others', () => {
    const items = buildWorkspaceItems('', { workspaces, selfId: 'w1' })
    expect(items.map((i) => [i.key, i.status, i.unread, i.tag])).toEqual([
      ['ws:w1', 'idle', 0, 'atual'],
      ['ws:w2', 'running', 2, undefined]
    ])
    items[0].run()
    expect(activateWorkspace).not.toHaveBeenCalled()
    items[1].run()
    expect(activateWorkspace).toHaveBeenCalledWith('w2')
  })

  it('filters by name, folder or branch; dormant ones show no status', () => {
    const list = [
      ws('w1', 'walph'),
      ws('w3', 'site', { branch: 'feature/login', dormant: true, status: 'done', unread: 3 })
    ]
    expect(buildWorkspaceItems('login', { workspaces: list, selfId: null }).map((i) => i.key)).toEqual(['ws:w3'])
    const dormant = buildWorkspaceItems('site', { workspaces: list, selfId: null })[0]
    expect(dormant.status).toBe('none')
    expect(dormant.unread).toBe(0)
  })
})

describe('long roots', () => {
  const real = [
    ws('a', 'walph', { root: '/Users/filipe/Development/Walph', branch: 'main' }),
    ws('b', 'site', { root: '/Users/filipe/Development/site', branch: 'main' }),
    ws('c', 'app', { root: '/Users/filipe/Work/app', branch: 'main' })
  ]
  const keys = (q: string): string[] => buildWorkspaceItems(q, { workspaces: real, selfId: null }).map((i) => i.key)

  it('terms that only exist in the absolute path do not match every workspace', () => {
    expect(keys('dev')).toEqual([])
    expect(keys('use')).toEqual([])
    expect(keys('file')).toEqual([])
  })
})

describe('Ask Claude', () => {
  it('sends the trimmed query; without a folder it is disabled', () => {
    const item = buildAskClaudeItem('  fix the test  ', true)
    item.run()
    expect(askClaude).toHaveBeenCalledWith('fix the test')
    expect(buildAskClaudeItem('x', false).disabled).toBe(true)
  })

  it('workspaces and the AI row do not go through executeCommand (they do not enter the recents)', () => {
    const { items } = buildUnifiedList('w', ctx())
    items.filter((i) => i.key.startsWith('ws:') || i.ai).forEach((i) => i.run())
    expect(executeCommand).not.toHaveBeenCalled()
  })
})
