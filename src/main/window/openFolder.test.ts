import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  findWorkspaceByRoot: vi.fn(),
  focusWorkspace: vi.fn(),
  addWorkspace: vi.fn(),
  activateWorkspace: vi.fn(),
  createWindow: vi.fn(),
  focusWindow: vi.fn(),
  setWindowRoot: vi.fn(),
  targetHost: vi.fn(),
  activeWorkspace: vi.fn(),
  liveContents: vi.fn(),
  claimEmptyView: vi.fn(),
  isViewReady: vi.fn(),
  send: vi.fn()
}))

vi.mock('electron', () => ({ dialog: {} }))
vi.mock('../fs/folderState', () => ({ classifyFolder: vi.fn(), folderErrorMessage: vi.fn() }))
vi.mock('./nativeUi', () => ({ pickFolder: vi.fn() }))
vi.mock('../recent/store', () => ({ removeRecentFolder: vi.fn() }))
vi.mock('./send', () => ({ send: m.send }))
vi.mock('./viewDelivery', () => ({
  claimEmptyView: m.claimEmptyView,
  isViewReady: m.isViewReady,
  queueCommand: vi.fn(),
  queueStartRequest: vi.fn()
}))
vi.mock('./viewClose', () => ({ hibernationInFlight: vi.fn() }))
vi.mock('./windowState', () => ({
  activeContents: vi.fn(),
  activeWorkspace: m.activeWorkspace,
  findWorkspaceByRoot: m.findWorkspaceByRoot,
  liveContents: m.liveContents,
  targetHost: m.targetHost
}))
vi.mock('./windows', () => ({
  activateWorkspace: m.activateWorkspace,
  addWorkspace: m.addWorkspace,
  createWindow: m.createWindow,
  focusWindow: m.focusWindow,
  focusWorkspace: m.focusWorkspace,
  setWindowRoot: m.setWindowRoot
}))

import { openFolderAsWorkspace } from './openFolder'

describe('openFolderAsWorkspace', () => {
  beforeEach(() => {
    for (const fn of Object.values(m)) fn.mockReset()
  })

  it('folder already open in another window (or dormant): focuses the owner and does not duplicate', () => {
    const owner = { id: 'owner', root: '/a' }
    m.findWorkspaceByRoot.mockReturnValue(owner)
    expect(openFolderAsWorkspace('/a')).toBe(false)
    expect(m.focusWorkspace).toHaveBeenCalledWith(owner)
    expect(m.addWorkspace).not.toHaveBeenCalled()
    expect(m.createWindow).not.toHaveBeenCalled()
    expect(m.setWindowRoot).not.toHaveBeenCalled()
  })

  it('without any window: creates a window with the folder', () => {
    m.findWorkspaceByRoot.mockReturnValue(null)
    m.targetHost.mockReturnValue(null)
    m.createWindow.mockReturnValue({})
    m.activeWorkspace.mockReturnValue({ root: '/a' })
    expect(openFolderAsWorkspace('/a')).toBe(true)
    expect(m.createWindow).toHaveBeenCalledWith({ root: '/a' })
  })

  it('free folder with a busy active view: becomes a new active workspace in the window', () => {
    const host = { win: {} }
    const added = { id: 'new' }
    m.findWorkspaceByRoot.mockReturnValue(null)
    m.targetHost.mockReturnValue(host)
    m.activeWorkspace.mockReturnValue({ root: '/other' })
    m.liveContents.mockReturnValue({})
    m.addWorkspace.mockReturnValue(added)
    expect(openFolderAsWorkspace('/b')).toBe(true)
    expect(m.addWorkspace).toHaveBeenCalledWith(host, '/b')
    expect(m.activateWorkspace).toHaveBeenCalledWith(added)
    expect(m.focusWindow).toHaveBeenCalledWith(host.win)
  })

  it('empty and ready active view: asks the renderer to open the folder in it', () => {
    const wc = {}
    m.findWorkspaceByRoot.mockReturnValue(null)
    m.targetHost.mockReturnValue({ win: {} })
    m.activeWorkspace.mockReturnValue({ root: null })
    m.liveContents.mockReturnValue(wc)
    m.claimEmptyView.mockReturnValue(true)
    m.isViewReady.mockReturnValue(true)
    expect(openFolderAsWorkspace('/b')).toBe(true)
    expect(m.send).toHaveBeenCalledWith(wc, 'workspace:openRequested', '/b')
    expect(m.addWorkspace).not.toHaveBeenCalled()
  })

  it('empty view still starting: assigns the folder directly', () => {
    const wc = {}
    m.findWorkspaceByRoot.mockReturnValue(null)
    m.targetHost.mockReturnValue({ win: {} })
    m.activeWorkspace.mockReturnValue({ root: null })
    m.liveContents.mockReturnValue(wc)
    m.claimEmptyView.mockReturnValue(true)
    m.isViewReady.mockReturnValue(false)
    openFolderAsWorkspace('/b')
    expect(m.setWindowRoot).toHaveBeenCalledWith(wc, '/b')
  })

  it('empty view already claimed by another open: the folder becomes a new tab', () => {
    m.findWorkspaceByRoot.mockReturnValue(null)
    m.targetHost.mockReturnValue({ win: {} })
    m.activeWorkspace.mockReturnValue({ root: null })
    m.liveContents.mockReturnValue({})
    m.claimEmptyView.mockReturnValue(false)
    m.addWorkspace.mockReturnValue({})
    openFolderAsWorkspace('/b')
    expect(m.addWorkspace).toHaveBeenCalled()
    expect(m.setWindowRoot).not.toHaveBeenCalled()
  })
})
