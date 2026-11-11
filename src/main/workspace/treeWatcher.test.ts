import { join, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLOOR_WATCH_IGNORES } from './watchFilter'
import { createTreeWatcher, type TreeWatcherDeps, type WatchEvent } from './treeWatcher'

type OnEvents = (err: Error | null, events: WatchEvent[]) => void

function setup(overrides: Partial<TreeWatcherDeps> = {}) {
  const unsubscribe = vi.fn(() => Promise.resolve())
  const calls: { realRoot: string; onEvents: OnEvents; ignore: string[] }[] = []
  const deps = {
    subscribe: vi.fn((realRoot: string, onEvents: OnEvents, options: { ignore: string[] }) => {
      calls.push({ realRoot, onEvents, ignore: options.ignore })
      return Promise.resolve({ unsubscribe })
    }),
    statKind: vi.fn(() => Promise.resolve('file' as const)),
    realpath: vi.fn((p: string) => Promise.resolve(p)),
    ignoreGlobs: vi.fn(() => ['**/node_modules/**']),
    prepare: vi.fn(() => Promise.resolve()),
    send: vi.fn(),
    onFiles: vi.fn(),
    isActive: vi.fn(() => true),
    isAlive: vi.fn(() => true),
    currentRoot: vi.fn((): string | null => '/proj'),
    invalidateFileList: vi.fn(),
    onGitRootChange: vi.fn(),
    onWatchFailed: vi.fn(),
    ...overrides
  } satisfies TreeWatcherDeps
  return { deps, calls, unsubscribe, watcher: createTreeWatcher(deps) }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('event batch', () => {
  it('sends files and folders after the active window and notifies the files hook', async () => {
    const { watcher, calls, deps } = setup()
    await watcher.start('/proj')
    calls[0].onEvents(null, [{ type: 'update', path: '/proj/src/a.ts' }])
    expect(deps.send).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(150)
    expect(deps.send).toHaveBeenCalledWith({
      dirs: ['/proj/src'],
      files: [{ path: '/proj/src/a.ts', type: 'change' }]
    })
    expect(deps.onFiles).toHaveBeenCalledTimes(1)
  })

  it('a hidden view waits for the long window and activated() sends right away', async () => {
    const { watcher, calls, deps } = setup({ isActive: vi.fn(() => false) })
    await watcher.start('/proj')
    calls[0].onEvents(null, [{ type: 'create', path: '/proj/a.ts' }])
    await vi.advanceTimersByTimeAsync(150)
    expect(deps.send).not.toHaveBeenCalled()
    watcher.activated()
    await vi.advanceTimersByTimeAsync(0)
    expect(deps.send).toHaveBeenCalledTimes(1)
  })

  it('ignores what matches the globs and what is outside the root', async () => {
    const { watcher, calls, deps } = setup()
    await watcher.start('/proj')
    calls[0].onEvents(null, [
      { type: 'update', path: '/proj/node_modules/x/index.js' },
      { type: 'update', path: '/other/a.ts' }
    ])
    await vi.advanceTimersByTimeAsync(5000)
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('the root .git invalidates the cached repository', async () => {
    const { watcher, calls, deps } = setup({ ignoreGlobs: () => [] })
    await watcher.start('/proj')
    calls[0].onEvents(null, [{ type: 'create', path: '/proj/.git' }])
    expect(deps.onGitRootChange).toHaveBeenCalledWith('/proj')
  })

  it('a watcher error becomes a full batch with the root', async () => {
    const { watcher, calls, deps } = setup()
    await watcher.start('/proj')
    calls[0].onEvents(new Error('boom'), [])
    await vi.advanceTimersByTimeAsync(150)
    expect(deps.send).toHaveBeenCalledWith({ dirs: ['/proj'], files: [], full: true })
  })

  it('reconcile sends full in the first batch, only once', async () => {
    const { watcher, calls, deps } = setup()
    await watcher.start('/proj', true)
    await vi.advanceTimersByTimeAsync(150)
    expect(deps.send).toHaveBeenCalledWith({ dirs: ['/proj'], files: [], full: true })
    calls[0].onEvents(null, [{ type: 'update', path: '/proj/a.ts' }])
    await vi.advanceTimersByTimeAsync(150)
    expect(deps.send).toHaveBeenLastCalledWith({
      dirs: ['/proj'],
      files: [{ path: '/proj/a.ts', type: 'change' }]
    })
  })

  it('maps the real path back to the folder spelling', async () => {
    // The watcher reports native paths under the real root.
    const realRoot = join(sep, 'private', 'proj')
    const { watcher, calls, deps } = setup({ realpath: vi.fn(() => Promise.resolve(realRoot)) })
    await watcher.start('/proj')
    expect(calls[0].realRoot).toBe(realRoot)
    calls[0].onEvents(null, [{ type: 'update', path: join(realRoot, 'a.ts') }])
    await vi.advanceTimersByTimeAsync(150)
    expect(deps.send).toHaveBeenCalledWith({ dirs: ['/proj'], files: [{ path: `/proj${sep}a.ts`, type: 'change' }] })
  })
})

describe('generation', () => {
  it('a newer start supersedes the previous one still waiting for prepare', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const prepare = vi.fn().mockReturnValueOnce(gate).mockResolvedValue(undefined)
    const { watcher, deps, calls } = setup({ prepare })
    const first = watcher.start('/a')
    const second = watcher.start('/b')
    release()
    await Promise.all([first, second])
    expect(deps.subscribe).toHaveBeenCalledTimes(1)
    expect(calls[0].realRoot).toBe('/b')
    expect(watcher.current()?.root).toBe('/b')
  })

  it('switching folders closes the previous watcher and invalidates its list', async () => {
    const { watcher, unsubscribe, deps } = setup()
    await watcher.start('/a')
    await watcher.start('/b')
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(deps.invalidateFileList).toHaveBeenCalledWith('/a')
    expect(deps.invalidateFileList).toHaveBeenCalledWith('/b')
  })

  it('stop during subscribe undoes the subscription and leaves no watcher', async () => {
    let resolveSub!: (s: { unsubscribe: () => Promise<void> }) => void
    const unsubscribe = vi.fn(() => Promise.resolve())
    const subscribe = vi.fn(() => new Promise<{ unsubscribe: () => Promise<void> }>((r) => (resolveSub = r)))
    const { watcher } = setup({ subscribe })
    const starting = watcher.start('/proj')
    await vi.advanceTimersByTimeAsync(0)
    const stopping = watcher.stop()
    resolveSub({ unsubscribe })
    await Promise.all([starting, stopping])
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(watcher.current()).toBeNull()
  })

  it('a view destroyed during prepare does not subscribe', async () => {
    let alive = true
    const { watcher, deps } = setup({
      isAlive: () => alive,
      prepare: vi.fn(() => {
        alive = false
        return Promise.resolve()
      })
    })
    await watcher.start('/proj')
    expect(deps.subscribe).not.toHaveBeenCalled()
  })

  it('an in-flight batch goes away when the watcher is replaced', async () => {
    const stat = vi.fn(() => Promise.resolve('file' as const))
    const { watcher, calls, deps } = setup({ statKind: stat })
    await watcher.start('/proj')
    calls[0].onEvents(null, [{ type: 'update', path: '/proj/a.ts' }])
    await watcher.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(deps.send).not.toHaveBeenCalled()
  })
})

describe('subscribe failure', () => {
  it('an invalid glob falls back to the floor and keeps watching', async () => {
    const subscribe = vi
      .fn()
      .mockRejectedValueOnce(new Error('glob'))
      .mockResolvedValueOnce({ unsubscribe: () => Promise.resolve() })
    const { watcher, deps } = setup({ subscribe })
    await watcher.start('/proj')
    expect(subscribe).toHaveBeenCalledTimes(2)
    expect(subscribe.mock.calls[1][2].ignore).toEqual([...FLOOR_WATCH_IGNORES])
    expect(watcher.current()?.root).toBe('/proj')
    expect(deps.onWatchFailed).not.toHaveBeenCalled()
  })

  it('both failures notify the view once and activation retries with full', async () => {
    const ok = { unsubscribe: () => Promise.resolve() }
    const subscribe = vi
      .fn()
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockRejectedValueOnce(new Error('3'))
      .mockRejectedValueOnce(new Error('4'))
      .mockResolvedValue(ok)
    const { watcher, deps } = setup({ subscribe })
    await watcher.start('/proj')
    expect(deps.onWatchFailed).toHaveBeenCalledWith('/proj')
    expect(watcher.current()).toBeNull()

    watcher.activated()
    await vi.advanceTimersByTimeAsync(0)
    expect(subscribe).toHaveBeenCalledTimes(4)
    expect(deps.onWatchFailed).toHaveBeenCalledTimes(1)

    watcher.activated()
    await vi.advanceTimersByTimeAsync(150)
    expect(watcher.current()?.root).toBe('/proj')
    expect(deps.send).toHaveBeenCalledWith({ dirs: ['/proj'], files: [], full: true })
  })

  it('the view root became null after the failure: neither retries nor prepares', async () => {
    const currentRoot = vi.fn((): string | null => '/proj')
    const { watcher, deps } = setup({ subscribe: vi.fn().mockRejectedValue(new Error('x')), currentRoot })
    await watcher.start('/proj')
    vi.mocked(deps.prepare).mockClear()
    currentRoot.mockReturnValue(null)
    watcher.activated()
    await vi.advanceTimersByTimeAsync(0)
    expect(deps.prepare).not.toHaveBeenCalled()
    currentRoot.mockReturnValue('/proj')
    watcher.activated()
    await vi.advanceTimersByTimeAsync(0)
    expect(deps.prepare).not.toHaveBeenCalled()
  })

  it('the view root became another folder after the failure: does not retry', async () => {
    const currentRoot = vi.fn((): string | null => '/proj')
    const { watcher, deps } = setup({ subscribe: vi.fn().mockRejectedValue(new Error('x')), currentRoot })
    await watcher.start('/proj')
    vi.mocked(deps.prepare).mockClear()
    currentRoot.mockReturnValue('/other')
    watcher.activated()
    await vi.advanceTimersByTimeAsync(0)
    expect(deps.prepare).not.toHaveBeenCalled()
  })

  it('stop cancels the pending retry', async () => {
    const subscribe = vi.fn().mockRejectedValue(new Error('x'))
    const { watcher } = setup({ subscribe })
    await watcher.start('/proj')
    await watcher.stop()
    watcher.activated()
    await vi.advanceTimersByTimeAsync(0)
    expect(subscribe).toHaveBeenCalledTimes(2)
  })
})
