import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type * as StoreModule from './store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({ app: { getPath: () => state.userData } }))

let store: typeof StoreModule
const recentFile = (): string => join(state.userData, 'recent.json')
const saved = (): { path: string }[] =>
  (JSON.parse(readFileSync(recentFile(), 'utf8')) as { folders: { path: string }[] }).folders

beforeEach(async () => {
  vi.useFakeTimers()
  state.userData = mkdtempSync(join(tmpdir(), 'walph-recent-'))
  vi.resetModules()
  store = await import('./store')
})

afterEach(() => {
  vi.useRealTimers()
  rmSync(state.userData, { recursive: true, force: true })
})

describe('getRecent', () => {
  it('starts empty without a file', () => {
    expect(store.getRecent()).toEqual([])
  })

  it('reads the v2 file and the v1 one (strings)', async () => {
    writeFileSync(recentFile(), JSON.stringify({ folders: ['/a', { path: '/b', lastOpened: 5, branch: 'main' }] }))
    expect(store.getRecent().map((f) => f.path)).toEqual(['/a', '/b'])
  })

  it('a corrupted file becomes an empty list', () => {
    writeFileSync(recentFile(), '{ nope')
    expect(store.getRecent()).toEqual([])
  })
})

describe('burst writes', () => {
  it('changes memory right away and writes/notifies only once', () => {
    const onChange = vi.fn()
    store.onRecentChange(onChange)
    store.addRecent('/a')
    store.addRecent('/b')
    expect(store.getRecent().map((f) => f.path)).toEqual(['/b', '/a'])
    expect(onChange).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]?.[0]).toBe(store.getRecent())
    expect(saved().map((f) => f.path)).toEqual(['/b', '/a'])
  })

  it('flushRecent writes what is pending and does nothing when nothing is pending', () => {
    const onChange = vi.fn()
    store.onRecentChange(onChange)
    store.flushRecent()
    expect(onChange).not.toHaveBeenCalled()
    store.addRecent('/a')
    store.flushRecent()
    expect(saved().map((f) => f.path)).toEqual(['/a'])
    vi.advanceTimersByTime(500)
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

describe('mutations', () => {
  it('removeRecentFolder only schedules when something is removed', () => {
    const onChange = vi.fn()
    store.onRecentChange(onChange)
    store.removeRecentFolder('/x')
    vi.advanceTimersByTime(500)
    expect(onChange).not.toHaveBeenCalled()
    store.addRecent('/a')
    store.flushRecent()
    store.removeRecentFolder('/a')
    expect(store.getRecent()).toEqual([])
  })

  it('updateRecentBranch writes the branch and ignores an equal value', () => {
    store.addRecent('/a')
    store.flushRecent()
    const onChange = vi.fn()
    store.onRecentChange(onChange)
    store.updateRecentBranch('/a', 'dev')
    expect(store.getRecent()[0]?.branch).toBe('dev')
    vi.advanceTimersByTime(200)
    store.updateRecentBranch('/a', 'dev')
    vi.advanceTimersByTime(200)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('clearRecent empties only when there are items', () => {
    const onChange = vi.fn()
    store.onRecentChange(onChange)
    store.clearRecent()
    vi.advanceTimersByTime(200)
    expect(onChange).not.toHaveBeenCalled()
    store.addRecent('/a')
    store.clearRecent()
    expect(store.getRecent()).toEqual([])
  })
})

describe('assertFolderOrForget', () => {
  it('accepts a folder', async () => {
    const dir = join(state.userData, 'ok')
    mkdirSync(dir)
    await expect(store.assertFolderOrForget(dir)).resolves.toBeUndefined()
  })

  it('missing folder: removes it from recents, runs onFail and throws', async () => {
    const gone = join(state.userData, 'gone')
    store.addRecent(gone)
    const onFail = vi.fn()
    await expect(store.assertFolderOrForget(gone, onFail)).rejects.toThrow()
    expect(onFail).toHaveBeenCalledTimes(1)
    expect(store.getRecent()).toEqual([])
  })

  it('file (not a folder): throws without forgetting the entry', async () => {
    const f = join(state.userData, 'file.txt')
    writeFileSync(f, 'x')
    store.addRecent(f)
    await expect(store.assertFolderOrForget(f)).rejects.toThrow()
    expect(store.getRecent()).toHaveLength(1)
  })
})
