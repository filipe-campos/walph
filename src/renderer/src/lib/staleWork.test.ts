import { describe, expect, it } from 'vitest'
import type { GitStatus } from '@shared/types'
import { createStaleWork, keepDirEntries, MAX_STALE_DIRS, MAX_STALE_FILES, sameGitStatus } from './staleWork'

describe('createStaleWork', () => {
  it('without events delivers nothing', () => {
    expect(createStaleWork().take()).toBeNull()
  })

  it('accumulates folders without repeats and resets on delivery', () => {
    const w = createStaleWork()
    w.add({ dirs: ['/a', '/b'], files: [{ path: '/a/x', type: 'change' }] })
    w.add({ dirs: ['/a'], files: [{ path: '/b/y', type: 'add' }] })
    expect(w.take()).toEqual({
      dirs: ['/a', '/b'],
      files: [
        { path: '/a/x', type: 'change' },
        { path: '/b/y', type: 'add' }
      ]
    })
    expect(w.take()).toBeNull()
  })

  it('collapses to "everything" above the limits', () => {
    const w = createStaleWork()
    w.add({
      dirs: Array.from({ length: MAX_STALE_DIRS + 1 }, (_, i) => `/d${i}`),
      files: Array.from({ length: MAX_STALE_FILES + 1 }, (_, i) => ({ path: `/f${i}`, type: 'change' as const }))
    })
    w.add({ dirs: ['/x'], files: [] })
    expect(w.take()).toEqual({ dirs: null, files: null })
  })
})

describe('keepDirEntries', () => {
  const e = (name: string) => ({ name, path: `/r/${name}`, isDirectory: false })
  it('keeps the old reference when equal', () => {
    const prev = [e('a'), e('b')]
    expect(keepDirEntries(prev, [e('a'), e('b')])).toBe(prev)
  })
  it('uses the new one when it differs', () => {
    const next = [e('a'), e('c')]
    expect(keepDirEntries([e('a'), e('b')], next)).toBe(next)
    expect(keepDirEntries(undefined, next)).toBe(next)
  })
})

describe('sameGitStatus', () => {
  const base = (): GitStatus => ({
    isRepo: true,
    repoRoot: '/r',
    branch: 'main',
    upstream: null,
    ahead: 0,
    behind: 0,
    ignored: [],
    files: [{ path: '/r/a', index: ' ', workingDir: 'M' }]
  })
  it('equal by content', () => {
    expect(sameGitStatus(base(), base())).toBe(true)
  })
  it('detects changes', () => {
    const b = base()
    b.files[0].index = 'M'
    expect(sameGitStatus(base(), b)).toBe(false)
    expect(sameGitStatus(base(), { ...base(), ahead: 1 })).toBe(false)
    expect(sameGitStatus(null, base())).toBe(false)
  })
})

describe('createStaleWork: watcher restarted', () => {
  it('full becomes reloading all the folders', () => {
    const w = createStaleWork()
    w.add({ dirs: ['/a'], files: [], full: true })
    w.add({ dirs: ['/b'], files: [{ path: '/b/x', type: 'change' }] })
    expect(w.take()).toEqual({ dirs: null, files: [{ path: '/b/x', type: 'change' }] })
  })
})
