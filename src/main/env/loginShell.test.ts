import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { extractMarkedPath, loginShellPath, mergePaths, resetLoginPathCache, type SpawnLike } from './loginShell'

describe('extractMarkedPath', () => {
  it('ignores rc garbage before and after', () => {
    expect(extractMarkedPath('welcome\n__WALPH_PATH_START__/a:/b\n__WALPH_PATH_END__bye')).toBe('/a:/b')
  })
  it('null without markers or when empty', () => {
    expect(extractMarkedPath('/a:/b')).toBeNull()
    expect(extractMarkedPath('__WALPH_PATH_START____WALPH_PATH_END__')).toBeNull()
    expect(extractMarkedPath('__WALPH_PATH_START__/a')).toBeNull()
  })
})

describe('mergePaths', () => {
  it('login first, without repeats, completed with the current one', () => {
    expect(mergePaths('/a:/b', '/b:/c::/a', ':')).toBe('/a:/b:/c')
    expect(mergePaths(null, '/x', ':')).toBe('/x')
    expect(mergePaths(null, undefined, ':')).toBe('')
  })
})

describe.skipIf(process.platform === 'win32')('loginShellPath (cache per shell)', () => {
  // Fake spawner: no real interactive shell starts in the tests. `output === null` = process that does not answer.
  const fakeSpawn = (output: string | null) =>
    vi.fn<SpawnLike>(() => {
      const stdout = Object.assign(new EventEmitter(), { setEncoding: () => undefined })
      const child = Object.assign(new EventEmitter(), {
        stdout,
        stdin: Object.assign(new EventEmitter(), { end: () => undefined })
      })
      const kill = vi.fn(() => child.emit('close', null))
      queueMicrotask(() => {
        if (output === null) return
        stdout.emit('data', output)
        child.emit('close', 0)
      })
      return { child, exited: false, kill } as never
    })
  const ok = (path: string): string => `__WALPH_PATH_START__${path}__WALPH_PATH_END__`

  beforeEach(() => resetLoginPathCache())
  afterEach(() => vi.useRealTimers())

  it('reuses the result of the same shell', async () => {
    const spawner = fakeSpawn(ok('/a:/b'))
    expect(await loginShellPath('linux', '/bin/sh', spawner)).toBe('/a:/b')
    expect(await loginShellPath('linux', '/bin/sh', spawner)).toBe('/a:/b')
    expect(spawner).toHaveBeenCalledTimes(1)
  })

  it('each shell has its own cache', async () => {
    const spawner = fakeSpawn(ok('/x'))
    await loginShellPath('linux', '/bin/sh', spawner)
    await loginShellPath('linux', '/bin/bash', spawner)
    expect(spawner).toHaveBeenCalledTimes(2)
  })

  it('Windows, missing or unknown shell: null without starting a process', async () => {
    const spawner = fakeSpawn(ok('/x'))
    expect(await loginShellPath('win32', '/bin/sh', spawner)).toBeNull()
    expect(await loginShellPath('linux', '', spawner)).toBeNull()
    expect(await loginShellPath('linux', '/usr/bin/powershell', spawner)).toBeNull()
    expect(spawner).not.toHaveBeenCalled()
  })

  it('after a failure answers null right away and retries in the background, with backoff', async () => {
    vi.useFakeTimers()
    const failing = fakeSpawn('garbage without markers')
    expect(await loginShellPath('linux', '/bin/sh', failing)).toBeNull()
    expect(await loginShellPath('linux', '/bin/sh', failing)).toBeNull()
    expect(failing).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(61_000)
    const working = fakeSpawn(ok('/new'))
    // The call that triggers the retry does not wait for it.
    expect(await loginShellPath('linux', '/bin/sh', working)).toBeNull()
    await vi.advanceTimersByTimeAsync(0)
    expect(await loginShellPath('linux', '/bin/sh', working)).toBe('/new')
    expect(working).toHaveBeenCalledTimes(1)
  })

  it('there is a single background retry and the wait doubles on each failure', async () => {
    vi.useFakeTimers()
    const failing = fakeSpawn('x')
    await loginShellPath('linux', '/bin/sh', failing)
    vi.advanceTimersByTime(61_000)
    await loginShellPath('linux', '/bin/sh', failing)
    await loginShellPath('linux', '/bin/sh', failing)
    await vi.advanceTimersByTimeAsync(0)
    expect(failing).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(61_000)
    await loginShellPath('linux', '/bin/sh', failing)
    expect(failing).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(60_000)
    await loginShellPath('linux', '/bin/sh', failing)
    expect(failing).toHaveBeenCalledTimes(3)
  })

  it('spawner that throws synchronously becomes null and does not stay rejected in the cache', async () => {
    const throwing = vi.fn<SpawnLike>(() => {
      throw new Error('EAGAIN')
    })
    expect(await loginShellPath('linux', '/bin/sh', throwing)).toBeNull()
    expect(await loginShellPath('linux', '/bin/sh', throwing)).toBeNull()
  })

  it('timeout kills the tree through the group and returns null', async () => {
    vi.useFakeTimers()
    const spawner = fakeSpawn(null)
    const pending = loginShellPath('linux', '/bin/sh', spawner)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await pending).toBeNull()
    expect(spawner.mock.results[0].value.kill).toHaveBeenCalled()
  })
})
