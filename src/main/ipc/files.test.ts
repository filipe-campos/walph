import { beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@shared/i18n'
import { fakeWebContents } from '../testing/fakeIpc'

const harness = await vi.hoisted(async () => (await import('../testing/fakeIpc')).createIpcHarness())
const state = vi.hoisted(() => ({ root: null as string | null }))
const getFileList = vi.hoisted(() => vi.fn())

vi.mock('electron', () => harness.electronMock)
vi.mock('../window/windows', () => ({ getWindowRoot: () => state.root }))
vi.mock('../files/fileListCache', () => ({ getFileList }))

import { registerFilesHandlers } from './files'

describe('files:list', () => {
  const wc = fakeWebContents()
  const list = (root: unknown): Promise<unknown> => harness.invoke('files:list', wc, root)

  beforeEach(() => {
    state.root = '/work/proj'
    getFileList.mockResolvedValue({ files: ['a.ts'], truncated: false })
    harness.reset()
    registerFilesHandlers()
  })

  it('registers only the files:list channel', () => {
    expect(harness.registered()).toEqual({ invoke: ['files:list'], send: [] })
  })

  it('lists the folder of the view itself', async () => {
    await expect(list('/work/proj')).resolves.toEqual({ files: ['a.ts'], truncated: false })
    expect(getFileList).toHaveBeenCalledWith('/work/proj')
  })

  it('uses the folder spelling main registered, not the one the renderer sent', async () => {
    state.root = '/Work/Proj'
    const sameOnCaseInsensitive = process.platform === 'linux' ? '/Work/Proj' : '/work/proj'
    await list(sameOnCaseInsensitive)
    expect(getFileList).toHaveBeenCalledWith('/Work/Proj')
  })

  it.each([
    ['another folder', '/work/other'],
    ['parent folder', '/work'],
    ['value that is not text', 42],
    ['empty', ''],
    ['undefined', undefined]
  ])('refuses %s without querying the cache', async (_name, root) => {
    await expect(list(root)).rejects.toThrow(t().files.errors.listOnlyOwnFolder)
    expect(getFileList).not.toHaveBeenCalled()
  })

  it('a view with no open folder refuses any root', async () => {
    state.root = null
    await expect(list('/work/proj')).rejects.toThrow(t().files.errors.listOnlyOwnFolder)
    expect(getFileList).not.toHaveBeenCalled()
  })

  it('the cache error reaches the renderer', async () => {
    getFileList.mockRejectedValue(new Error('rg crashed'))
    await expect(list('/work/proj')).rejects.toThrow('rg crashed')
  })
})
