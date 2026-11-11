import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fakeWebContents, type FakeWebContents } from '../testing/fakeIpc'
import { git as g, makeTempRepo, useGitTestEnv } from '../testing/gitRepo'
import { makeRealTempDir } from '../testing/testEnv'

const harness = await vi.hoisted(async () => (await import('../testing/fakeIpc')).createIpcHarness())
let windowRoot = ''

const showOpenDialog = vi.fn()

vi.mock('electron', () => ({
  ...harness.electronMock,
  dialog: { showOpenDialog: (...args: unknown[]) => showOpenDialog(...args) },
  shell: { trashItem: vi.fn() }
}))
vi.mock('../window/windows', () => ({ getWindowRoot: () => windowRoot, windowOf: () => ({}) }))
// `file://` is only accepted in test mode.
vi.mock('../window/hiddenMode', () => ({ hiddenWindows: true }))

afterAll(useGitTestEnv())

async function call(channel: string, ...args: unknown[]): Promise<unknown> {
  return harness.invoke(channel, fakeWebContents(), ...args)
}

describe('git handlers with the window folder inside the repository', () => {
  let top: string
  let sub: string

  beforeAll(async () => {
    top = makeTempRepo({ 'sub/f.txt': 'a\n' }, { message: 'init' })
    sub = join(top, 'sub')
    windowRoot = sub
    const { registerGitHandlers } = await import('./git')
    registerGitHandlers()
  })

  afterAll(() => rmSync(top, { recursive: true, force: true }))

  it('stage and unstage of a subfolder file', async () => {
    writeFileSync(join(sub, 'f.txt'), 'b\n')
    writeFileSync(join(sub, 'new.txt'), 'n\n')
    await call('git:stage', sub, [join(sub, 'f.txt'), join(sub, 'new.txt')])
    expect(g(top, 'status', '--porcelain')).toBe('M  sub/f.txt\nA  sub/new.txt\n')
    await call('git:unstage', sub, [join(sub, 'f.txt'), join(sub, 'new.txt')])
    expect(g(top, 'status', '--porcelain')).toBe(' M sub/f.txt\n?? sub/new.txt\n')
  })

  it('discard restores a tracked subfolder file', async () => {
    await call('git:discard', sub, [join(sub, 'f.txt')])
    expect(g(top, 'status', '--porcelain')).toBe('?? sub/new.txt\n')
  })

  it('stash refuses a hash that does not match the stack', async () => {
    writeFileSync(join(sub, 'f.txt'), 'c\n')
    await call('git:stashSave', sub, 'wip')
    const [stash] = (await call('git:stashList', sub)) as { index: number; hash: string }[]
    await expect(call('git:stashApply', sub, 0, 'deadbeef')).rejects.toThrow(/stash mudou/)
    await expect(call('git:stashApply', sub, 5, stash.hash)).rejects.toThrow(/Stash não encontrado/)
    await expect(call('git:stashDrop', sub, 0, 'zz')).rejects.toThrow(/Commit inválido/)
    await call('git:stashDrop', sub, 0, stash.hash)
    expect(g(top, 'stash', 'list')).toBe('')
  })
})

describe('undoLastCommit on the root commit', () => {
  let dir: string

  beforeAll(() => {
    dir = makeTempRepo({ 'a.txt': 'a\n' }, { message: 'root' })
    windowRoot = dir
  })

  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('a detached HEAD does not delete .git/HEAD', async () => {
    g(dir, 'checkout', '-q', '--detach')
    await expect(call('git:undoLastCommit', dir)).rejects.toThrow(/HEAD destacado/)
    expect(g(dir, 'rev-parse', 'HEAD').trim()).toMatch(/^[0-9a-f]{40}$/)
  })

  it('on a branch keeps everything in the index', async () => {
    g(dir, 'checkout', '-q', '-')
    expect(await call('git:undoLastCommit', dir)).toBe('root')
    expect(g(dir, 'status', '--porcelain')).toBe('A  a.txt\n')
  })
})

describe('..foo paths and show/baseline errors', () => {
  let dir: string

  beforeAll(() => {
    dir = makeTempRepo({ 'a.txt': 'a\n' }, { message: 'init' })
    windowRoot = dir
  })

  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('a file named ..foo at the repository root does not count as outside it', async () => {
    writeFileSync(join(dir, '..foo'), 'x\n')
    await call('git:stage', dir, [join(dir, '..foo')])
    expect(g(dir, 'status', '--porcelain')).toContain('A  ..foo')
    await call('git:unstage', dir, [join(dir, '..foo')])
    await expect(call('git:stage', dir, [join(dir, '..', 'outside.txt')])).rejects.toThrow(/fora do repositório/)
  })

  it('a path missing from the ref becomes empty/null', async () => {
    writeFileSync(join(dir, 'new.txt'), 'n\n')
    expect(await call('git:show', dir, join(dir, 'new.txt'), 'HEAD')).toBe('')
    expect(await call('git:show', dir, join(dir, 'new.txt'), 'INDEX')).toBe('')
    expect(await call('git:baseline', dir, join(dir, 'new.txt'))).toBeNull()
  })

  it('a file name matching another classifier pattern is still "missing path"', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    writeFileSync(join(dir, 'docs', 'non-fast-forward.md'), 'x\n')
    const file = join(dir, 'docs', 'non-fast-forward.md')
    expect(await call('git:show', dir, file, 'HEAD')).toBe('')
    expect(await call('git:baseline', dir, file)).toBeNull()
  })

  it('a git failure that is not "missing path" reaches the caller', async () => {
    const blob = g(dir, 'rev-parse', 'HEAD:a.txt').trim()
    rmSync(join(dir, '.git', 'objects', blob.slice(0, 2), blob.slice(2)), { force: true })
    await expect(call('git:show', dir, join(dir, 'a.txt'), 'HEAD')).rejects.toThrow()
    await expect(call('git:baseline', dir, join(dir, 'a.txt'))).rejects.toThrow()
  })
})

describe('git:lastCommitMessage', () => {
  let dir: string
  let first: string

  beforeAll(() => {
    dir = makeTempRepo({ 'a.txt': 'a\n' }, { commit: false })
    g(dir, 'add', '-A')
    g(dir, 'commit', '-q', '-m', 'first subject', '-m', 'body of the first')
    first = g(dir, 'rev-parse', 'HEAD').trim()
    writeFileSync(join(dir, 'a.txt'), 'b\n')
    g(dir, 'commit', '-q', '-am', 'second subject')
    windowRoot = dir
  })

  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('without a hash returns the HEAD message', async () => {
    expect(String(await call('git:lastCommitMessage', dir))).toContain('second subject')
  })

  it('with the hash of an old commit returns its full message', async () => {
    const msg = String(await call('git:lastCommitMessage', dir, first))
    expect(msg).toContain('first subject')
    expect(msg).toContain('body of the first')
    expect(msg).not.toContain('second')
  })

  it('an invalid hash is refused', async () => {
    await expect(call('git:lastCommitMessage', dir, '--help')).rejects.toThrow('Commit inválido.')
    await expect(call('git:lastCommitMessage', dir, 'zz')).rejects.toThrow('Commit inválido.')
  })
})

describe('git:clone', () => {
  let origin: string
  let parent: string

  const fakeSender = (): { sender: FakeWebContents; events: unknown[] } => {
    const events: unknown[] = []
    const sender = fakeWebContents()
    sender.send.mockImplementation((_channel, ...payload) => void events.push(payload[0]))
    return { sender, events }
  }
  const clone = (sender: unknown, url: unknown): Promise<unknown> => harness.invoke('git:clone', sender, url)

  beforeAll(() => {
    origin = makeTempRepo({ 'a.txt': 'hi\n' }, { message: 'init' })
    parent = makeRealTempDir('walph-clone-parent-')
  })

  afterAll(() => {
    rmSync(origin, { recursive: true, force: true })
    rmSync(parent, { recursive: true, force: true })
  })

  it('validates the URL before opening the dialog', async () => {
    showOpenDialog.mockClear()
    await expect(clone(fakeSender().sender, '--upload-pack=x')).rejects.toThrow('começam com "-"')
    await expect(clone(fakeSender().sender, 'ext::sh -c x')).rejects.toThrow('ext::')
    expect(showOpenDialog).not.toHaveBeenCalled()
  })

  it('a cancelled dialog returns null', async () => {
    showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    expect(await clone(fakeSender().sender, 'https://example.com/a/b.git')).toBeNull()
  })

  it('clones a local repository, emits progress and returns the folder', async () => {
    showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [parent] })
    const { sender, events } = fakeSender()
    const result = await clone(sender, pathToFileURL(origin).href)
    expect(result).toBe(join(parent, basename(origin)))
    expect(g(result as string, 'log', '--format=%s')).toContain('init')
    expect(events[0]).toMatchObject({ stage: 'Conectando', percent: null, destination: result })
  })

  it('refuses an existing destination without deleting it', async () => {
    showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [parent] })
    await expect(clone(fakeSender().sender, pathToFileURL(origin).href)).rejects.toThrow(/já existe/)
    expect(g(join(parent, basename(origin)), 'log', '--format=%s')).toContain('init')
  })

  it('a git failure deletes the partial folder and classifies the error', async () => {
    const missing = join(tmpdir(), 'walph-no-origin-xyz', 'failed-project')
    showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [parent] })
    await expect(clone(fakeSender().sender, pathToFileURL(missing).href)).rejects.toThrow(
      /Não foi possível clonar|não encontrado/
    )
    expect(existsSync(join(parent, 'failed-project'))).toBe(false)
  })

  it('one clone per view', async () => {
    let release: (v: unknown) => void = () => undefined
    showOpenDialog.mockReturnValueOnce(new Promise((r) => (release = r)))
    const { sender } = fakeSender()
    const first = clone(sender, 'https://example.com/a/b.git')
    await expect(clone(sender, 'https://example.com/a/c.git')).rejects.toThrow('Já há uma clonagem em andamento.')
    release({ canceled: true, filePaths: [] })
    expect(await first).toBeNull()
  })
})

describe('git:status with a cached root and coalescing', () => {
  let dir: string

  beforeAll(() => {
    dir = makeRealTempDir('walph-flight-')
    windowRoot = dir
  })

  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('folder without a repository, then init, then .git removed', async () => {
    expect(((await call('git:status', dir)) as { isRepo: boolean }).isRepo).toBe(false)
    await call('git:init', dir)
    expect(((await call('git:status', dir)) as { isRepo: boolean }).isRepo).toBe(true)
    rmSync(join(dir, '.git'), { recursive: true, force: true })
    expect(((await call('git:status', dir)) as { isRepo: boolean }).isRepo).toBe(false)
  })

  it('a burst of status calls returns consistent results (the latest read wins)', async () => {
    await call('git:init', dir)
    const sender = {}
    const status = (): Promise<unknown> => harness.invoke('git:status', sender, dir)
    const calls = [status(), status(), status()]
    writeFileSync(join(dir, 'new.txt'), 'x\n')
    const results = (await Promise.all(calls)) as Array<{ files: Array<{ path: string }> }>
    const last = (await call('git:status', dir)) as { files: Array<{ path: string }> }
    expect(last.files.map((f) => f.path)).toContain(join(dir, 'new.txt'))
    expect(results[1]).toBe(results[2])
  })

  it('log and lastCommitMessage in a repository without commits', async () => {
    expect(await call('git:log', dir, 0, 10)).toEqual({ commits: [], hasMore: false })
    expect(await call('git:lastCommitMessage', dir)).toBeNull()
  })
})
