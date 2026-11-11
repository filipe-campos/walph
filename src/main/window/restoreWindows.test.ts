import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FolderCheck } from '../fs/folderState'
import type { SavedWindow } from './windowsFile'

interface FakeWorkspace {
  id: number
  root: string | null
  dormant: boolean
}
interface FakeHost {
  win: { isDestroyed: () => boolean }
  workspaces: FakeWorkspace[]
  activeId: number
  closing: boolean
}

const env = vi.hoisted(() => ({
  saved: [] as unknown[],
  folders: new Map<string, FolderCheck>(),
  hosts: [] as unknown[],
  owned: new Set<string>(),
  checks: [] as { root: string; timeoutMs?: number | undefined }[]
}))
const createWindow = vi.hoisted(() => vi.fn())
const destroyWorkspace = vi.hoisted(() => vi.fn())
const openFolderAsWorkspace = vi.hoisted(() => vi.fn())
const target = vi.hoisted(() => {
  const state: { host: unknown } = { host: null }
  return state
})

vi.mock('../fs/folderState', () => ({
  classifyFolder: (root: string, options: { timeoutMs?: number } = {}) => {
    env.checks.push({ root, timeoutMs: options.timeoutMs })
    return Promise.resolve(env.folders.get(root) ?? { state: 'missing' })
  }
}))
vi.mock('./windowsPersistence', () => ({ readSavedWindows: () => env.saved }))
vi.mock('./openFolder', () => ({ openFolderAsWorkspace }))
vi.mock('./windows', () => ({ createWindow, destroyWorkspace }))
vi.mock('./windowState', () => ({
  allHosts: () => env.hosts,
  findWorkspaceByRoot: (root: string) => (env.owned.has(root) ? {} : null),
  isDormant: (ws: FakeWorkspace) => ws.dormant,
  targetHost: () => target.host
}))

import { restoreWindows } from './restoreWindows'

const dir: FolderCheck = { state: 'dir' }
const saved = (roots: (string | null)[], active = 0): SavedWindow => ({
  workspaces: roots.map((root) => ({ root, branch: null })),
  active,
  bounds: null,
  maximized: false
})

function newHost(options: { workspaces?: FakeWorkspace[]; activeId?: number } = {}): FakeHost {
  return {
    win: { isDestroyed: () => false },
    workspaces: options.workspaces ?? [],
    activeId: options.activeId ?? 0,
    closing: false
  }
}

describe('restoreWindows', () => {
  beforeEach(() => {
    env.saved = []
    env.folders = new Map()
    env.hosts = []
    env.owned = new Set()
    env.checks = []
    target.host = null
    createWindow.mockImplementation(() => {
      const host = newHost()
      env.hosts.push(host)
      return host
    })
    destroyWorkspace.mockResolvedValue(undefined)
  })

  it('without a saved session and without a folder opens an empty window', async () => {
    await restoreWindows(null)
    expect(createWindow).toHaveBeenCalledTimes(1)
    expect(createWindow).toHaveBeenCalledWith({ root: null })
  })

  it('an existing command line folder opens in a new window when there is no other', async () => {
    env.folders.set('/proj', dir)
    await restoreWindows('/proj')
    expect(createWindow).toHaveBeenCalledWith({ root: '/proj' })
    expect(openFolderAsWorkspace).not.toHaveBeenCalled()
  })

  it('a command line folder that vanished or is a file is ignored and becomes an empty window', async () => {
    env.folders.set('/file', { state: 'file' })
    await restoreWindows('/file')
    env.hosts = []
    await restoreWindows('/gone')
    expect(createWindow).toHaveBeenCalledTimes(2)
    expect(createWindow).toHaveBeenNthCalledWith(1, { root: null })
  })

  it('a command line folder with restored windows joins the target window as a workspace', async () => {
    env.folders.set('/a', dir)
    env.folders.set('/proj', dir)
    env.saved = [saved(['/a'])]
    const targetHost = newHost()
    target.host = targetHost
    await restoreWindows('/proj')
    expect(createWindow).toHaveBeenCalledTimes(1)
    expect(openFolderAsWorkspace).toHaveBeenCalledWith('/proj', targetHost)
  })

  it('recreates each saved window with its tabs, active one and bounds', async () => {
    env.folders.set('/a', dir)
    env.folders.set('/b', dir)
    env.folders.set('/c', dir)
    const bounds = { x: 1, y: 2, width: 800, height: 600 }
    env.saved = [{ ...saved(['/a', '/b'], 1), bounds, maximized: true }, saved(['/c'])]
    await restoreWindows(null)
    expect(createWindow).toHaveBeenCalledTimes(2)
    expect(createWindow.mock.calls[0][0]).toMatchObject({
      workspaces: [
        { root: '/a', branch: null },
        { root: '/b', branch: null }
      ],
      active: 1,
      bounds,
      maximized: true
    })
  })

  it('only the active workspace and argv folder are checked before the window opens; dormant ones later', async () => {
    env.folders.set('/active', dir)
    env.folders.set('/dormant', dir)
    env.saved = [saved(['/dormant', '/active'], 1)]
    const checksAtCreate: string[][] = []
    createWindow.mockImplementation(() => {
      checksAtCreate.push(env.checks.map((c) => c.root))
      const host = newHost({
        workspaces: [
          { id: 1, root: '/dormant', dormant: true },
          { id: 2, root: '/active', dormant: false }
        ],
        activeId: 2
      })
      env.hosts.push(host)
      return host
    })
    await restoreWindows(null)
    expect(checksAtCreate).toEqual([['/active']])
    await vi.waitFor(() => expect(env.checks.map((c) => c.root)).toEqual(['/active', '/dormant']))
    expect(createWindow.mock.calls[0][0].workspaces.map((w: { root: string }) => w.root)).toEqual([
      '/dormant',
      '/active'
    ])
  })

  it('every check has a 2 s deadline', async () => {
    env.folders.set('/a', dir)
    env.saved = [saved(['/a'])]
    await restoreWindows('/a')
    expect(env.checks.length).toBeGreaterThan(0)
    expect(env.checks.every((c) => c.timeoutMs === 2000)).toBe(true)
  })

  it('vanished active workspace: the whole window is checked and only live folders come back', async () => {
    env.folders.set('/live', dir)
    env.saved = [saved(['/gone', '/live', '/also-gone'], 0)]
    await restoreWindows(null)
    expect(createWindow.mock.calls[0][0]).toMatchObject({
      workspaces: [{ root: '/live' }],
      active: 0
    })
  })

  it('a window whose folders all vanished comes back as an empty view', async () => {
    env.saved = [saved(['/x', '/y'])]
    await restoreWindows(null)
    expect(createWindow.mock.calls[0][0]).toMatchObject({ workspaces: [{ root: null, branch: null }], active: 0 })
  })

  it('a folder past the deadline is not treated as missing; an inaccessible one within the deadline is', async () => {
    env.folders.set('/slow', { state: 'inaccessible', timedOut: true })
    env.folders.set('/inaccessible', { state: 'inaccessible' })
    env.saved = [saved(['/inaccessible', '/slow'], 0)]
    await restoreWindows(null)
    expect(createWindow.mock.calls[0][0].workspaces.map((w: { root: string }) => w.root)).toEqual(['/slow'])
  })

  it('a folder owned during the check leaves the window; a window without a free folder is not recreated', async () => {
    env.folders.set('/a', dir)
    env.folders.set('/b', dir)
    env.owned.add('/a')
    env.saved = [saved(['/a', '/b']), saved(['/a'])]
    await restoreWindows(null)
    expect(createWindow).toHaveBeenCalledTimes(1)
    expect(createWindow.mock.calls[0][0].workspaces.map((w: { root: string }) => w.root)).toEqual(['/b'])
  })

  it('with all saved windows already open and no folder, an empty window still remains', async () => {
    env.folders.set('/a', dir)
    env.owned.add('/a')
    env.saved = [saved(['/a'])]
    await restoreWindows(null)
    expect(createWindow).toHaveBeenCalledTimes(1)
    expect(createWindow).toHaveBeenCalledWith({ root: null })
  })

  it('concurrent calls share the same restore (the second folder is ignored); afterwards it runs again', async () => {
    env.folders.set('/a', dir)
    env.folders.set('/other', dir)
    env.saved = [saved(['/a'])]
    const first = restoreWindows(null)
    const second = restoreWindows('/other')
    expect(second).toBe(first)
    await Promise.all([first, second])
    expect(createWindow).toHaveBeenCalledTimes(1)
    expect(openFolderAsWorkspace).not.toHaveBeenCalled()

    env.hosts = []
    await restoreWindows(null)
    expect(createWindow).toHaveBeenCalledTimes(2)
  })

  describe('vanished dormant workspaces', () => {
    const workspace = (id: number, root: string | null, dormant = true): FakeWorkspace => ({ id, root, dormant })
    let host: FakeHost

    beforeEach(() => {
      host = newHost()
      createWindow.mockImplementation(() => {
        env.hosts.push(host)
        return host
      })
      env.folders.set('/active', dir)
    })

    const restoreWith = async (checksOf: string, expected: number, ...workspaces: FakeWorkspace[]): Promise<void> => {
      host.workspaces = workspaces
      env.saved = [saved(workspaces.map((w) => w.root))]
      await restoreWindows(null)
      await vi.waitFor(() => expect(env.checks.filter((c) => c.root === checksOf)).toHaveLength(expected))
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    it('removes only the dormant one whose folder vanished', async () => {
      const active = workspace(1, '/active', false)
      const gone = workspace(2, '/gone')
      const alive = workspace(3, '/live')
      env.folders.set('/live', dir)
      host.activeId = 1
      await restoreWith('/live', 1, active, gone, alive)
      expect(destroyWorkspace).toHaveBeenCalledTimes(1)
      expect(destroyWorkspace).toHaveBeenCalledWith(gone)
    })

    it('keeps the dormant one that is a file, inaccessible or slow (the error shows on activation)', async () => {
      env.folders.set('/file-entry', { state: 'file' })
      env.folders.set('/perm', { state: 'inaccessible' })
      env.folders.set('/slow', { state: 'inaccessible', timedOut: true })
      host.activeId = 1
      await restoreWith(
        '/slow',
        1,
        workspace(1, '/active', false),
        workspace(2, '/file-entry'),
        workspace(3, '/perm'),
        workspace(4, '/slow')
      )
      expect(destroyWorkspace).not.toHaveBeenCalled()
    })

    it('the dormant check also has a 2 s deadline', async () => {
      env.folders.set('/live', dir)
      host.activeId = 1
      await restoreWith('/live', 1, workspace(1, '/active', false), workspace(2, '/live'))
      expect(env.checks.filter((c) => c.root === '/live').every((c) => c.timeoutMs === 2000)).toBe(true)
    })

    it('never removes the active workspace, even dormant and with a vanished folder', async () => {
      host.activeId = 2
      await restoreWith('/gone', 1, workspace(1, '/active', false), workspace(2, '/gone'))
      expect(destroyWorkspace).not.toHaveBeenCalled()
    })

    it('never removes the only remaining workspace', async () => {
      host.activeId = 99
      await restoreWith('/gone', 3, workspace(2, '/gone'))
      expect(destroyWorkspace).not.toHaveBeenCalled()
    })
  })
})
