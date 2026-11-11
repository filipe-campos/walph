import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'

const m = vi.hoisted(() => ({
  addRecent: vi.fn(),
  assertFolderOrForget: vi.fn(),
  dropQueuedStart: vi.fn(),
  findWorkspaceByRoot: vi.fn(),
  focusWorkspace: vi.fn(),
  getWindowRoot: vi.fn(),
  markFolderOpened: vi.fn(),
  setWindowRoot: vi.fn(),
  workspaceOf: vi.fn(),
  isWatchingRoot: vi.fn(),
  watchViewRoot: vi.fn()
}))

vi.mock('../recent/store', () => ({ addRecent: m.addRecent, assertFolderOrForget: m.assertFolderOrForget }))
vi.mock('../window/windows', () => ({
  dropQueuedStart: m.dropQueuedStart,
  findWorkspaceByRoot: m.findWorkspaceByRoot,
  focusWorkspace: m.focusWorkspace,
  getWindowRoot: m.getWindowRoot,
  markFolderOpened: m.markFolderOpened,
  setWindowRoot: m.setWindowRoot,
  workspaceOf: m.workspaceOf
}))
vi.mock('./viewWatchers', () => ({ isWatchingRoot: m.isWatchingRoot, watchViewRoot: m.watchViewRoot }))

import { focusIfOpen, openWorkspaceRoot } from './openRoot'

const sender = {} as WebContents

beforeEach(() => {
  vi.resetAllMocks()
  m.assertFolderOrForget.mockResolvedValue(undefined)
  m.setWindowRoot.mockReturnValue(true)
  m.watchViewRoot.mockResolvedValue(undefined)
})

describe('focusIfOpen', () => {
  it('focuses the folder owner and returns true', () => {
    m.findWorkspaceByRoot.mockReturnValue({ id: 'w' })
    expect(focusIfOpen(sender, '/p')).toBe(true)
    expect(m.focusWorkspace).toHaveBeenCalledWith({ id: 'w' })
  })

  it('returns false without an owner', () => {
    expect(focusIfOpen(sender, '/p')).toBe(false)
    expect(m.focusWorkspace).not.toHaveBeenCalled()
  })
})

describe('openWorkspaceRoot', () => {
  it('an invalid folder releases the window folder before throwing', async () => {
    m.assertFolderOrForget.mockImplementation((_root: string, onFail: () => void) => {
      onFail()
      return Promise.reject(new Error('nope'))
    })
    m.getWindowRoot.mockReturnValue('/p')
    await expect(openWorkspaceRoot(sender, '/p')).rejects.toThrow('nope')
    expect(m.dropQueuedStart).toHaveBeenCalledWith(sender, '/p')
    expect(m.setWindowRoot).toHaveBeenCalledWith(sender, null)
    expect(m.watchViewRoot).not.toHaveBeenCalled()
  })

  it('folder of another workspace: focuses and returns false without watching', async () => {
    m.findWorkspaceByRoot.mockReturnValue({ id: 'w' })
    await expect(openWorkspaceRoot(sender, '/p')).resolves.toBe(false)
    expect(m.watchViewRoot).not.toHaveBeenCalled()
    expect(m.addRecent).not.toHaveBeenCalled()
  })

  it('opens, watches, adds to the recents and marks the folder opened', async () => {
    await expect(openWorkspaceRoot(sender, '/p')).resolves.toBe(true)
    expect(m.watchViewRoot).toHaveBeenCalledWith(sender, '/p')
    expect(m.addRecent).toHaveBeenCalledWith('/p')
    expect(m.markFolderOpened).toHaveBeenCalledWith(sender)
  })

  it('reloading the same folder keeps the watcher that is already running', async () => {
    m.getWindowRoot.mockReturnValue('/p')
    m.isWatchingRoot.mockReturnValue(true)
    await expect(openWorkspaceRoot(sender, '/p')).resolves.toBe(true)
    expect(m.watchViewRoot).not.toHaveBeenCalled()
    expect(m.addRecent).toHaveBeenCalledWith('/p')
  })

  it('an unknown window throws', async () => {
    m.setWindowRoot.mockReturnValue(false)
    await expect(openWorkspaceRoot(sender, '/p')).rejects.toThrow()
  })
})
