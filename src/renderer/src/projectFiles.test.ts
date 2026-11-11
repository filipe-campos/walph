import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeApi } from './test/fakeApi'

const rootListeners: Array<() => void> = []
vi.mock('./store', () => ({
  onRootChange: (l: () => void) => {
    rootListeners.push(l)
    return () => rootListeners.splice(rootListeners.indexOf(l), 1)
  }
}))

import {
  invalidateProjectFiles,
  loadFileList,
  loadProjectFiles,
  PROJECT_FILES_TTL_MS,
  startProjectFilesReactions
} from './projectFiles'

const list = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  list.mockReset()
  list.mockImplementation(async (root: string) => ({ files: [`${root}/src/a.ts`], truncated: false }))
  installFakeApi({ files: { list } })
  invalidateProjectFiles()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('projectFiles', () => {
  it('reuses the same folder list within the TTL, across Quick Open and mentions', async () => {
    await loadFileList('/a')
    await loadProjectFiles('/a')
    await loadFileList('/a')
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('returns the same promise to concurrent requests', () => {
    expect(loadFileList('/a')).toBe(loadFileList('/a'))
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('derives the folders with a trailing `/` and keeps `truncated`', async () => {
    list.mockResolvedValue({ files: ['src/x/a.ts', 'b.ts'], truncated: true })
    const result = await loadProjectFiles('/a')
    expect(result.folders).toEqual(['src/', 'src/x/'])
    expect(result.truncated).toBe(true)
  })

  it('rereads after the TTL', async () => {
    await loadFileList('/a')
    vi.advanceTimersByTime(PROJECT_FILES_TTL_MS + 1)
    await loadFileList('/a')
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('another folder does not reuse the previous list', async () => {
    await loadFileList('/a')
    const b = await loadFileList('/b')
    expect(b.files).toEqual(['/b/src/a.ts'])
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('invalidating forces a reread', async () => {
    await loadFileList('/a')
    invalidateProjectFiles()
    await loadFileList('/a')
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('a failure is not cached', async () => {
    list.mockRejectedValueOnce(new Error('boom'))
    await expect(loadFileList('/a')).rejects.toThrow('boom')
    await expect(loadFileList('/a')).resolves.toMatchObject({ files: ['/a/src/a.ts'] })
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('a folder switch drops the cache and stopping the reaction turns it off', async () => {
    const stop = startProjectFilesReactions()
    await loadFileList('/a')
    rootListeners.forEach((l) => l())
    await loadFileList('/a')
    expect(list).toHaveBeenCalledTimes(2)
    stop()
    expect(rootListeners).toHaveLength(0)
  })
})
