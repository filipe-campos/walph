import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ runRg: vi.fn() }))
vi.mock('../search/rg', () => ({ runRg: m.runRg }))

import { getFileList, invalidateFileList } from './fileListCache'

const listing = (...paths: string[]) => ({
  outcome: 'ok',
  stderr: '',
  stdout: '',
  spawnError: null,
  paths
})

function mockRg(...paths: string[]): void {
  m.runRg.mockImplementation((_args: string[], opts: { onStdout: (chunk: string, stop: () => void) => void }) => {
    opts.onStdout(paths.map((p) => `${p}\0`).join(''), () => undefined)
    return Promise.resolve(listing(...paths))
  })
}

beforeEach(() => {
  m.runRg.mockReset()
  invalidateFileList()
})

describe('getFileList', () => {
  it('rejects a folder that is not absolute', async () => {
    await expect(getFileList('relative')).rejects.toThrow()
    expect(m.runRg).not.toHaveBeenCalled()
  })

  it('concurrent calls share one run and the result is cached', async () => {
    mockRg('a.ts', 'b.ts')
    const [one, two] = await Promise.all([getFileList('/proj'), getFileList('/proj')])
    expect(one).toBe(two)
    expect(one.files).toEqual(['a.ts', 'b.ts'])
    await getFileList('/proj')
    expect(m.runRg).toHaveBeenCalledTimes(1)
  })

  it('invalidateFileList(root) forces a new run only for that root', async () => {
    mockRg('a.ts')
    await getFileList('/one')
    await getFileList('/two')
    invalidateFileList('/one')
    await getFileList('/one')
    await getFileList('/two')
    expect(m.runRg).toHaveBeenCalledTimes(3)
  })

  it('invalidateFileList() without an argument clears all roots', async () => {
    mockRg('a.ts')
    await getFileList('/one')
    await getFileList('/two')
    invalidateFileList()
    await getFileList('/one')
    await getFileList('/two')
    expect(m.runRg).toHaveBeenCalledTimes(4)
  })

  it('a failure is not cached', async () => {
    m.runRg.mockResolvedValueOnce({ outcome: 'interrupted', stderr: '', spawnError: null })
    await expect(getFileList('/proj')).rejects.toThrow()
    mockRg('a.ts')
    await expect(getFileList('/proj')).resolves.toEqual({ files: ['a.ts'], truncated: false })
  })

  it('an rg error without files throws with the stderr', async () => {
    m.runRg.mockResolvedValueOnce({ outcome: 'error', stderr: ' boom ', spawnError: null })
    await expect(getFileList('/proj')).rejects.toThrow(/boom/)
  })
})
