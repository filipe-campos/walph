import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitApi, GitCommit, GitCommitFile, GitFileStatus, GitStash } from '@shared/types'
import { installFakeApi } from '../../test/fakeApi'
import { gitStatus } from '../../test/gitFixtures'
import { click, focus, getByRole, mount, press, queryAllByRole, settle, unmountAll } from '../../test/dom'

const commitFiles = vi.fn<GitApi['commitFiles']>()
installFakeApi({ git: { commitFiles } })

const { GitView } = await import('./GitView')
const { useStore } = await import('../../store')
const { resetStore } = await import('../../test/resetStore')

const file = (name: string, index: string, workingDir: string): GitFileStatus => ({
  path: `/r/${name}`,
  index,
  workingDir
})

const stash = (index: number, message: string): GitStash => ({ index, hash: `s${index}`, message, date: 0 })

const commit = (hash: string, subject: string): GitCommit => ({
  hash,
  shortHash: hash.slice(0, 4),
  author: 'Ana',
  email: 'ana@x.dev',
  date: 0,
  subject,
  parents: []
})

const FILES = [file('a.ts', 'M', ' '), file('b.ts', ' ', 'M'), file('c.ts', ' ', 'M')]
const COMMITS = [commit('aaaa1111', 'first'), commit('bbbb2222', 'second')]
const COMMIT_FILES: GitCommitFile[] = [
  { path: '/r/x.ts', status: 'M' },
  { path: '/r/y.ts', status: 'A' }
]

function setup(): HTMLElement {
  useStore.setState({
    root: '/r',
    git: gitStatus({ isRepo: true, files: FILES }),
    stashes: [stash(0, 'one'), stash(1, 'two')],
    historyOpen: true,
    gitHistory: { commits: COMMITS, hasMore: false, loading: false }
  })
  return mount(<GitView />)
}

const items = (host: HTMLElement, tree: string): string[] =>
  queryAllByRole(getByRole(host, 'tree', tree), 'treeitem').map((el) => el.getAttribute('aria-label') ?? el.textContent)

const row = (host: HTMLElement, tree: string, name: string | RegExp): HTMLElement =>
  getByRole(getByRole(host, 'tree', tree), 'treeitem', name)

const update = (patch: Partial<ReturnType<typeof useStore.getState>>): void => act(() => useStore.setState(patch))

const focused = (): string | null => document.activeElement?.getAttribute('aria-label') ?? null

beforeEach(() => {
  commitFiles.mockResolvedValue(COMMIT_FILES)
})

afterEach(() => {
  unmountAll()
  resetStore()
})

describe('GitView, changes tree', () => {
  it('exposes Staged and Changes as groups and the files as items, with a single tab stop', () => {
    const host = setup()
    const tree = getByRole(host, 'tree', 'Controle de Código')
    expect(items(host, 'Controle de Código')).toEqual([
      'Staged, 1 item',
      expect.stringMatching(/^a\.ts/),
      'Alterações, 2 itens',
      expect.stringMatching(/^b\.ts/),
      expect.stringMatching(/^c\.ts/)
    ])
    const stops = queryAllByRole(tree, 'treeitem').filter((el) => el.tabIndex === 0)
    expect(stops).toHaveLength(1)
    expect(stops[0].getAttribute('aria-label')).toBe('Staged, 1 item')
  })

  it('arrows, Home and End move focus between the rows without going past the end', () => {
    const host = setup()
    const staged = row(host, 'Controle de Código', 'Staged, 1 item')
    focus(staged)
    expect(press(staged, 'ArrowDown')).toBe(true)
    expect(focused()).toMatch(/^a\.ts/)
    press(document.activeElement!, 'ArrowDown')
    expect(focused()).toBe('Alterações, 2 itens')
    press(document.activeElement!, 'End')
    expect(focused()).toMatch(/^c\.ts/)
    press(document.activeElement!, 'ArrowDown')
    expect(focused()).toMatch(/^c\.ts/)
    press(document.activeElement!, 'ArrowUp')
    expect(focused()).toMatch(/^b\.ts/)
    press(document.activeElement!, 'Home')
    expect(focused()).toBe('Staged, 1 item')
    press(document.activeElement!, 'ArrowUp')
    expect(focused()).toBe('Staged, 1 item')
  })

  it('← on the item goes to the group, ← on the group collapses and → expands', () => {
    const host = setup()
    const changes = row(host, 'Controle de Código', 'Alterações, 2 itens')
    const b = row(host, 'Controle de Código', /^b\.ts/)
    focus(b)
    press(b, 'ArrowLeft')
    expect(document.activeElement).toBe(changes)

    press(changes, 'ArrowLeft')
    expect(changes.getAttribute('aria-expanded')).toBe('false')
    expect(items(host, 'Controle de Código')).toEqual([
      'Staged, 1 item',
      expect.stringMatching(/^a\.ts/),
      'Alterações, 2 itens'
    ])

    press(changes, 'ArrowRight')
    expect(changes.getAttribute('aria-expanded')).toBe('true')
    expect(items(host, 'Controle de Código')).toHaveLength(5)
  })

  it('Enter and Space on the group toggle; on the item they open the working or stage diff', () => {
    const host = setup()
    const changes = row(host, 'Controle de Código', 'Alterações, 2 itens')
    focus(changes)
    press(changes, 'Enter')
    expect(changes.getAttribute('aria-expanded')).toBe('false')
    press(changes, ' ')
    expect(changes.getAttribute('aria-expanded')).toBe('true')

    const b = row(host, 'Controle de Código', /^b\.ts/)
    focus(b)
    press(b, 'Enter')
    expect(useStore.getState().tabs).toContainEqual(
      expect.objectContaining({ kind: 'diff', path: '/r/b.ts', staged: false })
    )

    const a = row(host, 'Controle de Código', /^a\.ts/)
    click(a)
    expect(useStore.getState().tabs).toContainEqual(
      expect.objectContaining({ kind: 'diff', path: '/r/a.ts', staged: true })
    )
  })

  it('Tab enters the row actions and the busy action stays focusable (aria-disabled, not disabled)', () => {
    const host = setup()
    update({ gitBusy: true })
    const b = row(host, 'Controle de Código', /^b\.ts/)
    const stage = b.querySelector<HTMLButtonElement>('button[aria-label="Adicionar ao stage"]')!
    expect(b.querySelector('.row-actions')?.contains(stage)).toBe(true)
    expect(stage.disabled).toBe(false)
    expect(stage.getAttribute('aria-disabled')).toBe('true')
    focus(stage)
    expect(document.activeElement).toBe(stage)
  })

  it('staging the focused file takes focus to the next remaining file', () => {
    const host = setup()
    focus(row(host, 'Controle de Código', /^b\.ts/))
    update({ git: gitStatus({ isRepo: true, files: [FILES[0], file('b.ts', 'M', ' '), FILES[2]] }) })
    expect(focused()).toMatch(/^c\.ts/)
  })

  it('staging the last focused file takes focus to the previous one', () => {
    const host = setup()
    focus(row(host, 'Controle de Código', /^c\.ts/))
    update({ git: gitStatus({ isRepo: true, files: [FILES[0], FILES[1], file('c.ts', 'M', ' ')] }) })
    expect(focused()).toMatch(/^b\.ts/)
  })

  it('staging everything with focus on the header button keeps focus on it', () => {
    const host = setup()
    const group = row(host, 'Controle de Código', 'Alterações, 2 itens')
    const stageAll = group.querySelector<HTMLButtonElement>('button[aria-label="Adicionar tudo ao stage"]')!
    focus(stageAll)
    update({
      git: gitStatus({ isRepo: true, files: [file('a.ts', 'M', ' '), file('b.ts', 'M', ' '), file('c.ts', 'M', ' ')] })
    })
    expect(stageAll.disabled).toBe(false)
    expect(stageAll.getAttribute('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(stageAll)
    expect(host.textContent).toContain('Nenhuma alteração')
    expect(getByRole(host, 'tree', 'Controle de Código').textContent).not.toContain('Nenhuma alteração')
  })

  it('does not steal focus when the row disappears with focus elsewhere', () => {
    const host = setup()
    const outside = document.createElement('input')
    document.body.append(outside)
    focus(row(host, 'Controle de Código', /^b\.ts/))
    focus(outside)
    update({ git: gitStatus({ isRepo: true, files: [FILES[0], FILES[2]] }) })
    expect(document.activeElement).toBe(outside)
  })
})

describe('GitView, stashes', () => {
  it('is its own tree with one item per stash; Enter on the stash does nothing', () => {
    const host = setup()
    expect(items(host, 'Stashes')).toEqual(['Stashes, 2 itens', 'stash@{0}: one', 'stash@{1}: two'])
    const first = row(host, 'Stashes', 'stash@{0}: one')
    focus(row(host, 'Stashes', 'Stashes, 2 itens'))
    press(document.activeElement!, 'ArrowDown')
    expect(document.activeElement).toBe(first)
    press(first, 'End')
    expect(focused()).toBe('stash@{1}: two')
    const tabsBefore = useStore.getState().tabs.length
    press(document.activeElement!, 'Enter')
    expect(useStore.getState().tabs).toHaveLength(tabsBefore)
    press(document.activeElement!, 'Home')
    expect(focused()).toBe('Stashes, 2 itens')
  })

  it('← on the group collapses the stashes', () => {
    const host = setup()
    const group = row(host, 'Stashes', 'Stashes, 2 itens')
    focus(group)
    press(group, 'ArrowLeft')
    expect(group.getAttribute('aria-expanded')).toBe('false')
    expect(items(host, 'Stashes')).toEqual(['Stashes, 2 itens'])
  })

  it('removing the focused stash moves focus to the next; if it was the last, to the previous', () => {
    const host = setup()
    focus(row(host, 'Stashes', 'stash@{0}: one'))
    update({ stashes: [stash(0, 'two')] })
    expect(focused()).toBe('stash@{0}: two')

    update({ stashes: [stash(0, 'two'), stash(1, 'three')] })
    focus(row(host, 'Stashes', 'stash@{1}: three'))
    update({ stashes: [stash(0, 'two')] })
    expect(focused()).toBe('stash@{0}: two')
  })
})

describe('GitView, history', () => {
  it('each commit is a collapsed group; Enter expands, loads the files and opens the read-only diff', async () => {
    const host = setup()
    const first = row(host, 'Histórico', /first/)
    expect(first.getAttribute('aria-expanded')).toBe('false')
    expect(commitFiles).not.toHaveBeenCalled()

    focus(first)
    press(first, 'Enter')
    expect(first.getAttribute('aria-expanded')).toBe('true')
    await settle()
    expect(commitFiles).toHaveBeenCalledWith('/r', 'aaaa1111')
    expect(items(host, 'Histórico')).toEqual([
      expect.stringMatching(/first/),
      expect.stringMatching(/^x\.ts/),
      expect.stringMatching(/^y\.ts/),
      expect.stringMatching(/second/)
    ])

    const y = row(host, 'Histórico', /^y\.ts/)
    focus(y)
    press(y, 'Enter')
    expect(useStore.getState().tabs).toContainEqual(
      expect.objectContaining({
        kind: 'diff',
        path: '/r/y.ts',
        commit: { hash: 'aaaa1111', file: COMMIT_FILES[1] }
      })
    )
  })

  it('→ expands, ← on the file goes back to the commit and ← on the open commit collapses', async () => {
    const host = setup()
    const first = row(host, 'Histórico', /first/)
    focus(first)
    press(first, 'ArrowRight')
    expect(first.getAttribute('aria-expanded')).toBe('true')
    await settle()

    const x = row(host, 'Histórico', /^x\.ts/)
    focus(x)
    press(x, 'ArrowLeft')
    expect(document.activeElement).toBe(first)

    press(first, 'ArrowLeft')
    expect(first.getAttribute('aria-expanded')).toBe('false')
    expect(queryAllByRole(getByRole(host, 'tree', 'Histórico'), 'treeitem')).toHaveLength(2)
  })

  it('reopening a commit does not repeat reading the files', async () => {
    const host = setup()
    update({ gitHistory: { commits: [commit('cccc3333', 'third')], hasMore: false, loading: false } })
    const first = row(host, 'Histórico', /third/)
    focus(first)
    press(first, 'ArrowRight')
    await settle()
    press(first, 'ArrowLeft')
    press(first, 'ArrowRight')
    await settle()
    expect(commitFiles).toHaveBeenCalledTimes(1)
    expect(items(host, 'Histórico')).toHaveLength(3)
  })

  it('a failure reading the files closes the commit and reopening tries again', async () => {
    const host = setup()
    update({ gitHistory: { commits: [commit('dddd4444', 'fourth')], hasMore: false, loading: false } })
    commitFiles.mockRejectedValueOnce(new Error('boom'))
    const first = row(host, 'Histórico', /fourth/)
    focus(first)
    press(first, 'ArrowRight')
    await settle()
    expect(first.getAttribute('aria-expanded')).toBe('false')

    press(first, 'ArrowRight')
    await settle()
    expect(commitFiles).toHaveBeenCalledTimes(2)
    expect(items(host, 'Histórico')).toHaveLength(3)
  })

  it('Home and End walk the visible commits', () => {
    const host = setup()
    const first = row(host, 'Histórico', /first/)
    focus(first)
    press(first, 'End')
    expect(document.activeElement?.getAttribute('data-hash')).toBe('bbbb2222')
    press(document.activeElement!, 'Home')
    expect(document.activeElement).toBe(first)
  })
})
