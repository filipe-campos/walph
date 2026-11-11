import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirEntry, FsApi, GitApi, GitBranch, GitStash } from '@shared/types'
import { deferred } from './test/deferred'
import { installFakeApi } from './test/fakeApi'
import { gitStatus } from './test/gitFixtures'

const readDir = vi.fn<FsApi['readDir']>()
const branches = vi.fn<GitApi['branches']>()
const stashList = vi.fn<GitApi['stashList']>()

installFakeApi({
  fs: { readDir, exists: () => Promise.resolve(false) },
  git: { branches, stashList, status: () => Promise.resolve(gitStatus()) },
  workspace: { focusIfOpen: () => Promise.resolve(false), open: () => Promise.resolve(true) },
  session: { load: () => Promise.resolve(null), save: () => undefined }
})

const { useStore } = await import('./store')
const { openWorkspace } = await import('./workspaceLifecycle')
const { openBranchPicker } = await import('./gitActions')
const { openStashPicker, refreshStashes } = await import('./gitHistoryActions')
const { loadDir, revealInExplorer } = await import('./explorerActions')
const { openQuickInput } = await import('./quickInputActions')

const branch = (name: string): GitBranch => ({
  name,
  remote: false,
  current: false,
  upstream: null,
  shortHash: 'abc1234',
  date: 0
})
const stash = (n: number): GitStash => ({ index: n, hash: `h${n}`, message: `s${n}`, date: 0 })

beforeEach(() => {
  readDir.mockReset()
  readDir.mockResolvedValue([])
  branches.mockReset()
  stashList.mockReset()
  useStore.setState({
    root: '/a',
    dirs: {},
    quickInput: null,
    stashes: [],
    gitBranches: null,
    toasts: [],
    git: { isRepo: true } as never
  })
})

describe('switching folders', () => {
  it('resets quickInput, claudeFindId and the pending requests of the previous folder', async () => {
    useStore.setState({
      quickInput: { query: '', picker: 'branch', session: 1 },
      claudeFindId: 'c',
      requests: { explorerReveal: { seq: 1, payload: { path: '/a/x' } } }
    })
    await openWorkspace('/b')
    const s = useStore.getState()
    expect(s.root).toBe('/b')
    expect(s.quickInput).toBeNull()
    expect(s.claudeFindId).toBeNull()
    expect(s.requests).toEqual({})
  })

  it('resets references, fileRevs and the Claude conversation in a single set, keeping claude.starting', async () => {
    useStore.setState({
      references: { title: 'r', items: [] },
      fileRevs: { '/a/x': 2 },
      panelView: 'references',
      claude: { conversations: [{ id: 'c' }] as never, activeId: 'c', starting: true, renamingId: 'c' }
    })
    const seen: Array<ReturnType<typeof useStore.getState>> = []
    const off = useStore.subscribe((s, prev) => {
      if (s.root !== prev.root) seen.push(s)
    })
    await openWorkspace('/b')
    off()
    expect(seen).toHaveLength(1)
    expect(seen[0].references).toBeNull()
    expect(seen[0].fileRevs).toEqual({})
    expect(seen[0].panelView).toBe('problems')
    expect(seen[0].claude).toEqual({ conversations: [], activeId: null, starting: true, renamingId: null })
  })

  it('a late readDir from the old folder does not put the entry back in dirs', async () => {
    const late = deferred<DirEntry[]>()
    readDir.mockImplementation((dir) => (dir === '/a/sub' ? late.promise : Promise.resolve([])))
    const pending = loadDir('/a/sub')
    await openWorkspace('/b')
    late.resolve([{ name: 'x', path: '/a/sub/x', isDirectory: false }])
    await pending
    expect(useStore.getState().dirs['/a/sub']).toBeUndefined()
  })

  it('two out-of-order reads of the same folder: the older one does not overwrite the newer one', async () => {
    const older = deferred<DirEntry[]>()
    const newer = deferred<DirEntry[]>()
    readDir.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const a = loadDir('/a/sub')
    const b = loadDir('/a/sub')
    newer.resolve([{ name: 'newer', path: '/a/sub/newer', isDirectory: false }])
    await b
    older.resolve([{ name: 'older', path: '/a/sub/older', isDirectory: false }])
    await a
    expect(useStore.getState().dirs['/a/sub']).toEqual([{ name: 'newer', path: '/a/sub/newer', isDirectory: false }])
  })

  it('an old read that fails does not erase the newer listing', async () => {
    const older = deferred<DirEntry[]>()
    readDir
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce([{ name: 'x', path: '/a/sub/x', isDirectory: false }])
    const a = loadDir('/a/sub')
    await loadDir('/a/sub')
    older.reject(new Error('x'))
    await a
    expect(useStore.getState().dirs['/a/sub']).toHaveLength(1)
  })

  it('branches arriving after switching folder/picker do not fill the state', async () => {
    const late = deferred<GitBranch[]>()
    branches.mockReturnValue(late.promise)
    openBranchPicker()
    await openWorkspace('/b')
    late.resolve([branch('stale')])
    await late.promise
    await Promise.resolve()
    expect(useStore.getState().gitBranches).toBeNull()
    expect(useStore.getState().quickInput).toBeNull()
  })

  it('branches of a picker closed and reopened: only the last one applies', async () => {
    const first = deferred<GitBranch[]>()
    branches.mockReturnValueOnce(first.promise)
    openBranchPicker()
    openQuickInput('')
    branches.mockReturnValueOnce(new Promise(() => undefined))
    openBranchPicker()
    first.resolve([branch('old')])
    await first.promise
    await Promise.resolve()
    expect(useStore.getState().gitBranches).toBeNull()
  })
})

describe('stashes', () => {
  it('out-of-order refreshStashes: the older response does not overwrite the newer one', async () => {
    const older = deferred<GitStash[]>()
    const newer = deferred<GitStash[]>()
    stashList.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const a = refreshStashes()
    const b = refreshStashes()
    newer.resolve([stash(0), stash(1)])
    await b
    older.resolve([stash(0)])
    await a
    expect(useStore.getState().stashes).toHaveLength(2)
  })

  it('openStashPicker does not open in a folder that already changed', async () => {
    const late = deferred<GitStash[]>()
    stashList.mockReturnValue(late.promise)
    const pending = openStashPicker('apply')
    await openWorkspace('/b')
    late.resolve([stash(0)])
    await pending
    expect(useStore.getState().quickInput).toBeNull()
    expect(useStore.getState().stashes).toEqual([])
  })

  it('openStashPicker with an old response does not overwrite a newer refresh', async () => {
    const older = deferred<GitStash[]>()
    const newer = deferred<GitStash[]>()
    stashList.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const picker = openStashPicker('apply')
    const refresh = refreshStashes()
    newer.resolve([stash(0), stash(1)])
    await refresh
    older.resolve([stash(0)])
    await picker
    expect(useStore.getState().stashes).toHaveLength(2)
  })
})

describe('stashes (applied sequence)', () => {
  it('picker responds while a newer refresh is still pending: opens with its list', async () => {
    const pickerResp = deferred<GitStash[]>()
    stashList.mockReturnValueOnce(pickerResp.promise).mockReturnValueOnce(new Promise(() => undefined))
    const picker = openStashPicker('apply')
    void refreshStashes()
    pickerResp.resolve([stash(0)])
    await picker
    expect(useStore.getState().quickInput?.picker).toBe('stashPick')
    expect(useStore.getState().stashes).toHaveLength(1)
  })

  it('refresh 1 resolves and refresh 2 fails: the list from 1 stays', async () => {
    const first = deferred<GitStash[]>()
    const second = deferred<GitStash[]>()
    stashList.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const a = refreshStashes()
    const b = refreshStashes()
    first.resolve([stash(0)])
    await a
    second.reject(new Error('failed'))
    await b
    expect(useStore.getState().stashes).toHaveLength(1)
  })

  it('two consecutive picker openings: the response of the first opens nothing', async () => {
    const first = deferred<GitStash[]>()
    const second = deferred<GitStash[]>()
    stashList.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const a = openStashPicker('apply')
    const b = openStashPicker('drop')
    first.resolve([stash(0)])
    await a
    expect(useStore.getState().quickInput).toBeNull()
    second.resolve([stash(0)])
    await b
    expect(useStore.getState().quickInput).toMatchObject({ picker: 'stashPick', stashAction: 'drop' })
  })
})

describe('revealInExplorer', () => {
  it('switching folders during the reveal does not publish the old folder path', async () => {
    const late = deferred<DirEntry[]>()
    readDir.mockImplementation((dir) => (dir === '/a/sub' ? late.promise : Promise.resolve([])))
    const pending = revealInExplorer('/a/sub/f.ts')
    await openWorkspace('/b')
    late.resolve([])
    await pending
    expect(useStore.getState().requests.explorerReveal).toBeUndefined()
  })
})
