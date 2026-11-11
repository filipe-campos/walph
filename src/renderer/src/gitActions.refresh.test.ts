import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitApi, GitStatus } from '@shared/types'
import { deferred } from './test/deferred'
import { installFakeApi } from './test/fakeApi'
import { gitStatus } from './test/gitFixtures'

const status = vi.fn<GitApi['status']>()
installFakeApi({
  git: {
    status,
    log: () => Promise.resolve({ commits: [], hasMore: false }),
    stashList: () => Promise.resolve([]),
    branches: () => Promise.resolve([])
  }
})

const { useStore } = await import('./store')
const { refreshGit, scheduleGitRefresh } = await import('./gitActions')
const { toastTitles } = await import('./test/toastTitles')

const notRepo = gitStatus()
const repo = (branch: string) => gitStatus({ isRepo: true, branch })

beforeEach(() => {
  status.mockReset()
  useStore.setState({ root: '/r', git: null, gitFailedRoot: null, toasts: [] })
})

describe('refreshGit (coalescing)', () => {
  it('without an open folder it does not query git', async () => {
    useStore.setState({ root: null })
    await refreshGit()
    expect(status).not.toHaveBeenCalled()
  })

  it('requests during a refresh become a single rerun at the end', async () => {
    const first = deferred<GitStatus>()
    status.mockReturnValueOnce(first.promise).mockResolvedValue(notRepo)
    const a = refreshGit()
    const b = refreshGit()
    const c = refreshGit()
    expect(status).toHaveBeenCalledTimes(1)
    first.resolve(notRepo)
    await Promise.all([a, b, c])
    expect(status).toHaveBeenCalledTimes(2)
  })

  it('after finishing, a new request starts another refresh', async () => {
    status.mockResolvedValue(notRepo)
    await refreshGit()
    await refreshGit()
    expect(status).toHaveBeenCalledTimes(2)
  })

  it('the rerun sees the newest result', async () => {
    const first = deferred<GitStatus>()
    status.mockReturnValueOnce(first.promise).mockResolvedValueOnce(repo('after'))
    const a = refreshGit()
    void refreshGit()
    first.resolve(repo('before'))
    await a
    expect(useStore.getState().git).toMatchObject({ branch: 'after' })
  })

  it('the answer for a folder that was already switched is ignored', async () => {
    const first = deferred<GitStatus>()
    status.mockReturnValueOnce(first.promise)
    const a = refreshGit()
    useStore.setState({ root: '/other' })
    first.resolve(repo('old'))
    await a
    expect(useStore.getState().git).toBeNull()
  })

  it('a failure notifies and marks the folder; the next refresh still runs', async () => {
    status.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(notRepo)
    await refreshGit()
    expect(useStore.getState().gitFailedRoot).toBe('/r')
    expect(toastTitles()).toEqual([expect.stringContaining('boom')])
    await refreshGit()
    expect(useStore.getState().gitFailedRoot).toBeNull()
  })

  it('a structurally equal status keeps the state reference', async () => {
    status.mockResolvedValueOnce(repo('main')).mockResolvedValueOnce(repo('main'))
    await refreshGit()
    const before = useStore.getState().git
    await refreshGit()
    expect(useStore.getState().git).toBe(before)
  })
})

describe('scheduleGitRefresh (debounce)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('a burst of requests becomes a single refresh', async () => {
    status.mockResolvedValue(notRepo)
    scheduleGitRefresh()
    scheduleGitRefresh()
    scheduleGitRefresh()
    await vi.advanceTimersByTimeAsync(300)
    expect(status).toHaveBeenCalledTimes(1)
  })

  it('a slow request (inactive view) does not delay a fast one already scheduled, but the fast one brings the slow one forward', async () => {
    status.mockResolvedValue(notRepo)
    scheduleGitRefresh(300)
    scheduleGitRefresh(3000)
    await vi.advanceTimersByTimeAsync(300)
    expect(status).toHaveBeenCalledTimes(1)
    scheduleGitRefresh(3000)
    scheduleGitRefresh(300)
    await vi.advanceTimersByTimeAsync(300)
    expect(status).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(5000)
    expect(status).toHaveBeenCalledTimes(2)
  })
})
