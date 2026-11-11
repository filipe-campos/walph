import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'
import { createCloseCoordinator, type CloseDeps } from './closeCoordinator'
import type { Host, Workspace } from './windowState'

class FakeWc extends EventEmitter {
  destroyed = false
  crashed = false
  reload = vi.fn()
  forcefullyCrashRenderer = vi.fn()
  isDestroyed(): boolean {
    return this.destroyed
  }
  isCrashed(): boolean {
    return this.crashed
  }
  destroy(): void {
    this.destroyed = true
    this.emit('destroyed')
  }
}

class FakeWin extends EventEmitter {
  destroyed = false
  isDestroyed(): boolean {
    return this.destroyed
  }
  close(): void {
    const event = { prevented: false, preventDefault: () => void (event.prevented = true) }
    this.emit('close', event)
    if (!event.prevented) this.destroyed = true
  }
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

function setup(options: { confirmForce?: boolean; allowReload?: boolean } = {}) {
  const hosts: Host[] = []
  const contents = new Map<Workspace, FakeWc>()
  const requested: FakeWc[] = []
  const aborted: FakeWc[] = []
  const destroyed: Workspace[] = []
  const log: string[] = []
  const confirmForceClose = vi.fn(async () => options.confirmForce ?? false)

  const deps: CloseDeps = {
    liveContents: (ws) => (contents.get(ws) as unknown as WebContents) ?? null,
    workspaceOf: (wc) => [...contents].find(([, c]) => c === (wc as unknown as FakeWc))?.[0] ?? null,
    activeWorkspace: (host) => host.workspaces.find((w) => w.id === host.activeId)!,
    hostContents: (host) =>
      host.workspaces.flatMap((w) => (contents.has(w) ? [contents.get(w) as unknown as WebContents] : [])),
    allHosts: () => hosts,
    focusedHost: () => hosts[0] ?? null,
    present: (ws) => void log.push(`present:${ws.id}`),
    sendCloseRequested: (wc) => void requested.push(wc as unknown as FakeWc),
    sendCloseAborted: (wc) => void aborted.push(wc as unknown as FakeWc),
    confirmForceClose,
    destroyWorkspace: async (ws) => {
      destroyed.push(ws)
      const c = contents.get(ws)
      contents.delete(ws)
      ws.host.workspaces = ws.host.workspaces.filter((w) => w !== ws)
      c?.destroy()
    },
    quit: vi.fn(),
    flushHost: vi.fn(async () => {}),
    flushAllHosts: vi.fn(async () => {}),
    saveWindowsNow: vi.fn(),
    freezeWindowsFile: vi.fn(),
    setDocumentEdited: vi.fn(),
    allowReload: () => options.allowReload ?? true
  }
  const coordinator = createCloseCoordinator(deps)

  function addHost(count: number): { host: Host; list: Array<{ ws: Workspace; wc: FakeWc }> } {
    const win = new FakeWin()
    const host = { win, workspaces: [], activeId: '', closing: false } as unknown as Host
    const list = Array.from({ length: count }, (_, i) => {
      const ws = { id: `w${hosts.length}-${i}`, root: null, host } as unknown as Workspace
      const wc = new FakeWc()
      host.workspaces.push(ws)
      contents.set(ws, wc)
      return { ws, wc }
    })
    host.activeId = list[0].ws.id
    hosts.push(host)
    coordinator.attachHost(host)
    for (const { ws } of list) coordinator.attachView(ws)
    return { host, list }
  }

  const beforeQuit = (): boolean => {
    const prevent = vi.fn()
    coordinator.beforeQuit(prevent)
    return prevent.mock.calls.length > 0
  }

  return { coordinator, deps, addHost, beforeQuit, requested, aborted, destroyed, confirmForceClose, log }
}

describe('closeCoordinator', () => {
  describe('quitting the app', () => {
    it('with two dirty views asks one at a time and only then unloads and quits', async () => {
      const w = setup()
      const {
        host,
        list: [a, b]
      } = w.addHost(2)
      w.coordinator.setDirty(a.wc as unknown as WebContents, true)
      w.coordinator.setDirty(b.wc as unknown as WebContents, true)

      expect(w.beforeQuit()).toBe(true)
      expect(w.requested).toEqual([a.wc])
      expect(w.deps.flushAllHosts).not.toHaveBeenCalled()

      w.coordinator.confirmClose(a.wc as unknown as WebContents)
      expect(w.deps.quit).toHaveBeenCalledTimes(1)
      expect(w.beforeQuit()).toBe(true)
      expect(w.requested).toEqual([a.wc, b.wc])

      w.coordinator.confirmClose(b.wc as unknown as WebContents)
      expect(w.deps.quit).toHaveBeenCalledTimes(2)
      expect(w.beforeQuit()).toBe(true)
      expect(w.deps.freezeWindowsFile).toHaveBeenCalledTimes(1)
      expect(w.deps.flushAllHosts).toHaveBeenCalledTimes(1)

      await tick()
      expect(w.deps.quit).toHaveBeenCalledTimes(3)
      expect(w.beforeQuit()).toBe(false)
      expect(host.closing).toBe(false)
    })

    it('a quit already in progress does not unload twice', () => {
      const w = setup()
      w.addHost(1)
      w.beforeQuit()
      w.beforeQuit()
      expect(w.deps.flushAllHosts).toHaveBeenCalledTimes(1)
    })

    it('cancelling mid-chain reopens the question of those already confirmed and notifies the renderer', () => {
      const w = setup()
      const {
        list: [a, b]
      } = w.addHost(2)
      const cancelled = vi.fn()
      w.coordinator.onQuitCancelled(cancelled)
      w.coordinator.setDirty(a.wc as unknown as WebContents, true)
      w.coordinator.setDirty(b.wc as unknown as WebContents, true)

      w.beforeQuit()
      w.coordinator.confirmClose(a.wc as unknown as WebContents)
      w.beforeQuit()
      expect(w.requested).toEqual([a.wc, b.wc])

      w.coordinator.cancelClose(b.wc as unknown as WebContents)
      expect(cancelled).toHaveBeenCalledTimes(1)
      expect(w.aborted).toEqual([a.wc])

      w.requested.length = 0
      expect(w.beforeQuit()).toBe(true)
      expect(w.requested).toEqual([a.wc])
      expect(w.deps.flushAllHosts).not.toHaveBeenCalled()
    })

    it('cancelling the question of a workspace close does not report a quit cancellation', () => {
      const w = setup()
      const {
        list: [a]
      } = w.addHost(1)
      const cancelled = vi.fn()
      w.coordinator.onQuitCancelled(cancelled)
      w.coordinator.setDirty(a.wc as unknown as WebContents, true)
      void w.coordinator.requestCloseWorkspace(a.ws)
      w.coordinator.cancelClose(a.wc as unknown as WebContents)
      expect(cancelled).not.toHaveBeenCalled()
    })

    it('a renderer that crashes while the quit question is open lets the quit go on', () => {
      const w = setup()
      const {
        list: [a]
      } = w.addHost(1)
      w.coordinator.setDirty(a.wc as unknown as WebContents, true)
      w.beforeQuit()
      a.wc.crashed = true
      a.wc.emit('render-process-gone')
      expect(w.deps.quit).toHaveBeenCalledTimes(1)
      expect(w.beforeQuit()).toBe(true)
      expect(w.deps.flushAllHosts).toHaveBeenCalledTimes(1)
    })
  })

  describe('closing the window', () => {
    it('blocks close, asks about the dirty view and closes after confirming and unloading', async () => {
      const w = setup()
      const {
        host,
        list: [a]
      } = w.addHost(1)
      w.coordinator.setDirty(a.wc as unknown as WebContents, true)

      host.win.close()
      expect(host.win.isDestroyed()).toBe(false)
      expect(w.requested).toEqual([a.wc])

      w.coordinator.confirmClose(a.wc as unknown as WebContents)
      expect(w.deps.saveWindowsNow).toHaveBeenCalledTimes(1)
      expect(w.deps.flushHost).toHaveBeenCalledWith(host)
      await tick()
      expect(host.win.isDestroyed()).toBe(true)
    })

    it('a window without live views closes directly', () => {
      const w = setup()
      const { host, list } = w.addHost(1)
      w.deps.liveContents = () => null
      list[0].wc.destroy()
      host.workspaces = []
      host.win.close()
      expect(host.win.isDestroyed()).toBe(true)
    })

    it('a renderer that crashes with the window close pending closes the window', () => {
      const w = setup()
      const {
        host,
        list: [a]
      } = w.addHost(1)
      w.coordinator.setDirty(a.wc as unknown as WebContents, true)
      host.win.close()
      a.wc.emit('render-process-gone')
      expect(w.deps.saveWindowsNow).toHaveBeenCalled()
    })
  })

  describe('closing the workspace', () => {
    it('a clean view is destroyed right away', async () => {
      const w = setup()
      const {
        list: [a]
      } = w.addHost(2)
      await w.coordinator.requestCloseWorkspace(a.ws)
      expect(w.destroyed).toEqual([a.ws])
      expect(w.requested).toEqual([])
    })

    it('a dirty view waits for the answer and only resolves after destroying', async () => {
      const w = setup()
      const {
        list: [a]
      } = w.addHost(2)
      w.coordinator.setDirty(a.wc as unknown as WebContents, true)
      const done = vi.fn()
      void w.coordinator.requestCloseWorkspace(a.ws).then(done)
      await tick()
      expect(w.requested).toEqual([a.wc])
      expect(w.log).toContain(`present:${a.ws.id}`)
      expect(done).not.toHaveBeenCalled()

      w.coordinator.confirmClose(a.wc as unknown as WebContents)
      await tick()
      expect(w.destroyed).toEqual([a.ws])
      expect(done).toHaveBeenCalled()
    })

    it('cancelling resolves the request without destroying', async () => {
      const w = setup()
      const {
        list: [a]
      } = w.addHost(2)
      w.coordinator.setDirty(a.wc as unknown as WebContents, true)
      const done = vi.fn()
      void w.coordinator.requestCloseWorkspace(a.ws).then(done)
      w.coordinator.cancelClose(a.wc as unknown as WebContents)
      await tick()
      expect(done).toHaveBeenCalled()
      expect(w.destroyed).toEqual([])
    })

    it('a renderer that crashes with the question open destroys the workspace and releases the waiters', async () => {
      const w = setup()
      const {
        list: [a]
      } = w.addHost(2)
      w.coordinator.setDirty(a.wc as unknown as WebContents, true)
      const done = vi.fn()
      void w.coordinator.requestCloseWorkspace(a.ws).then(done)
      a.wc.crashed = true
      a.wc.emit('render-process-gone')
      await tick()
      expect(w.destroyed).toEqual([a.ws])
      expect(done).toHaveBeenCalled()
    })

    it('a destroyed view releases the waiters', async () => {
      const w = setup()
      const {
        list: [a]
      } = w.addHost(2)
      w.coordinator.setDirty(a.wc as unknown as WebContents, true)
      const done = vi.fn()
      void w.coordinator.requestCloseWorkspace(a.ws).then(done)
      a.wc.destroy()
      await tick()
      expect(done).toHaveBeenCalled()
    })

    it('a dead renderer does not block: the workspace is destroyed without asking', async () => {
      const w = setup()
      const {
        list: [a]
      } = w.addHost(2)
      w.coordinator.setDirty(a.wc as unknown as WebContents, true)
      a.wc.crashed = true
      await w.coordinator.requestCloseWorkspace(a.ws)
      expect(w.destroyed).toEqual([a.ws])
      expect(w.requested).toEqual([])
    })
  })

  describe('hung renderer', () => {
    it('offers to force close and kills the renderer if the user accepts', async () => {
      const w = setup({ confirmForce: true })
      const {
        list: [a]
      } = w.addHost(2)
      w.coordinator.setDirty(a.wc as unknown as WebContents, true)
      a.wc.emit('unresponsive')
      expect(w.coordinator.isViewResponsive(a.wc as unknown as WebContents)).toBe(false)

      void w.coordinator.requestCloseWorkspace(a.ws)
      await tick()
      expect(w.confirmForceClose).toHaveBeenCalledTimes(1)
      expect(a.wc.forcefullyCrashRenderer).toHaveBeenCalledTimes(1)
    })

    it('waiting does not kill the renderer and the question can be offered again', async () => {
      const w = setup({ confirmForce: false })
      const {
        list: [a]
      } = w.addHost(2)
      w.coordinator.setDirty(a.wc as unknown as WebContents, true)
      void w.coordinator.requestCloseWorkspace(a.ws)
      a.wc.emit('unresponsive')
      await tick()
      expect(w.confirmForceClose).toHaveBeenCalledTimes(1)
      expect(a.wc.forcefullyCrashRenderer).not.toHaveBeenCalled()

      a.wc.emit('unresponsive')
      await tick()
      expect(w.confirmForceClose).toHaveBeenCalledTimes(2)
    })

    it('hanging without a pending close does not open the dialog', async () => {
      const w = setup()
      const {
        list: [a]
      } = w.addHost(1)
      a.wc.emit('unresponsive')
      await tick()
      expect(w.confirmForceClose).not.toHaveBeenCalled()
    })

    it('responding again brings the view back to normal', () => {
      const w = setup()
      const {
        list: [a]
      } = w.addHost(1)
      a.wc.emit('unresponsive')
      a.wc.emit('responsive')
      expect(w.coordinator.isViewResponsive(a.wc as unknown as WebContents)).toBe(true)
    })
  })

  describe('renderer crash without a pending close', () => {
    it('reloads the view', () => {
      const w = setup()
      const {
        list: [a]
      } = w.addHost(1)
      a.wc.emit('render-process-gone')
      expect(a.wc.reload).toHaveBeenCalledTimes(1)
    })

    it('does not reload when the reload limit was reached', () => {
      const w = setup({ allowReload: false })
      const {
        list: [a]
      } = w.addHost(1)
      a.wc.emit('render-process-gone')
      expect(a.wc.reload).not.toHaveBeenCalled()
    })

    it('does not reload while quitting', () => {
      const w = setup()
      const {
        list: [a]
      } = w.addHost(1)
      w.beforeQuit()
      a.wc.emit('render-process-gone')
      expect(a.wc.reload).not.toHaveBeenCalled()
    })
  })

  describe('hibernation guard', () => {
    it('blocks a dirty, chained or unresponsive view', () => {
      const w = setup()
      const {
        list: [a, b]
      } = w.addHost(2)
      const wc = (c: FakeWc): WebContents => c as unknown as WebContents
      expect(w.coordinator.evictionReason(wc(a.wc))).toBeNull()

      w.coordinator.setDirty(wc(a.wc), true)
      expect(w.coordinator.evictionReason(wc(a.wc))).toBe('unsaved')

      b.wc.emit('unresponsive')
      expect(w.coordinator.evictionReason(wc(b.wc))).toBe('unresponsive')
    })

    it('a view that already confirmed in a chain stays as "closing"', () => {
      const w = setup()
      const {
        list: [a, b]
      } = w.addHost(2)
      const wc = (c: FakeWc): WebContents => c as unknown as WebContents
      w.coordinator.setDirty(wc(a.wc), true)
      w.coordinator.setDirty(wc(b.wc), true)
      w.beforeQuit()
      w.coordinator.confirmClose(wc(a.wc))
      w.coordinator.setDirty(wc(a.wc), false)
      expect(w.coordinator.evictionReason(wc(a.wc))).toBe('closing')
    })
  })

  describe('edited document', () => {
    it('reflects whether any view of the window is dirty', () => {
      const w = setup()
      const {
        host,
        list: [a]
      } = w.addHost(1)
      w.coordinator.setDirty(a.wc as unknown as WebContents, true)
      expect(w.deps.setDocumentEdited).toHaveBeenLastCalledWith(host, true)
      a.wc.emit('did-navigate')
      expect(w.deps.setDocumentEdited).toHaveBeenLastCalledWith(host, false)
    })
  })
})
