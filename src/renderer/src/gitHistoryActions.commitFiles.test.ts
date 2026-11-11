import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitApi, GitCommitFile } from '@shared/types'
import { installFakeApi } from './test/fakeApi'

const commitFiles = vi.fn<GitApi['commitFiles']>()
installFakeApi({ git: { commitFiles } })

const { useStore } = await import('./store')
const { loadCommitFiles } = await import('./gitHistoryActions')
const { startGitReactions } = await import('./gitActions')

const file = (path: string): GitCommitFile => ({ path, status: 'M' })

beforeEach(() => {
  commitFiles.mockReset()
  commitFiles.mockImplementation(async (_root, hash) => [file(`/r/${hash}.ts`)])
  useStore.setState({ root: '/r' })
})

describe('loadCommitFiles', () => {
  it('without an open folder returns an empty list without calling git', async () => {
    useStore.setState({ root: null })
    await expect(loadCommitFiles('abc')).resolves.toEqual([])
    expect(commitFiles).not.toHaveBeenCalled()
  })

  it('reads once per commit and reuses it on later openings', async () => {
    const first = await loadCommitFiles('abc')
    const second = await loadCommitFiles('abc')
    expect(second).toBe(first)
    expect(commitFiles).toHaveBeenCalledTimes(1)
    expect(commitFiles).toHaveBeenCalledWith('/r', 'abc')
  })

  it('different commits have their own entries', async () => {
    await loadCommitFiles('a')
    await loadCommitFiles('b')
    expect(commitFiles).toHaveBeenCalledTimes(2)
  })

  it('a failure is not cached', async () => {
    commitFiles.mockRejectedValueOnce(new Error('boom'))
    await expect(loadCommitFiles('failure')).rejects.toThrow('boom')
    await expect(loadCommitFiles('failure')).resolves.toEqual([file('/r/failure.ts')])
    expect(commitFiles).toHaveBeenCalledTimes(2)
  })

  it('the cache is bounded: the oldest commits leave first', async () => {
    for (let i = 0; i < 101; i++) await loadCommitFiles(`h${i}`)
    commitFiles.mockClear()
    await loadCommitFiles('h100')
    expect(commitFiles).not.toHaveBeenCalled()
    await loadCommitFiles('h0')
    expect(commitFiles).toHaveBeenCalledTimes(1)
  })

  it('switching folders clears the cache', async () => {
    const stop = startGitReactions()
    await loadCommitFiles('switch')
    useStore.setState({ root: '/other' })
    await loadCommitFiles('switch')
    expect(commitFiles).toHaveBeenCalledTimes(2)
    expect(commitFiles).toHaveBeenLastCalledWith('/other', 'switch')
    stop()
  })
})
