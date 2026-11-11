import type { BaseWindow, WebContents } from 'electron'
import { createEmitter } from '../util/emitter'
import {
  abortCloseChain,
  beginClose,
  blocksClose,
  cancelPendingClose,
  createCloseGuardState,
  findCloseBlocker,
  resetCloseGuard,
  type CloseGuardState,
  type CloseTarget
} from './closeGuard'
import { createReloadLimiter } from './reloadPolicy'
import { onViewDestroyed } from './viewLifecycle'
import type { Host, Workspace } from './windowState'

/**
 * Everything the coordinator asks of the rest of the app: windows, views, dialogs and quitting. Injected to test
 * without electron.
 */
export interface CloseDeps {
  liveContents(ws: Workspace): WebContents | null
  workspaceOf(wc: WebContents): Workspace | null
  activeWorkspace(host: Host): Workspace
  hostContents(host: Host): WebContents[]
  allHosts(): readonly Host[]
  focusedHost(): Host | null
  /** Shows the view that will ask the question (activates silently, restores and brings the window to the front). */
  present(ws: Workspace): void
  sendCloseRequested(wc: WebContents): void
  sendCloseAborted(wc: WebContents): void
  /** `true` = the user chose to force close a hung renderer. */
  confirmForceClose(wc: WebContents): Promise<boolean>
  destroyWorkspace(ws: Workspace): Promise<void>
  quit(): void
  flushHost(host: Host): Promise<void>
  flushAllHosts(): Promise<void>
  saveWindowsNow(): void
  freezeWindowsFile(): void
  setDocumentEdited(host: Host, edited: boolean): void
  allowReload?(wc: WebContents): boolean
}

type Candidate = { ws: Workspace; state: CloseGuardState; rendererAlive: boolean }

const rendererAlive = (wc: WebContents): boolean => !wc.isDestroyed() && !wc.isCrashed()

export function createCloseCoordinator(deps: CloseDeps) {
  const allowReload = deps.allowReload ?? createReloadLimiter<WebContents>().allow
  // Close guard per VIEW (workspace). Closing a workspace, the window or the app asks view by view.
  const guards = new WeakMap<WebContents, CloseGuardState>()
  // Views whose renderer hung (the question would never be answered).
  const unresponsive = new WeakSet<WebContents>()
  // Whoever waits for the end of a `workspaces:close` that depends on the user's answer.
  const closeWaiters = new WeakMap<WebContents, Array<() => void>>()
  // Views that already confirmed in a chain (close window / quit): cancelling the chain returns them to "ask again".
  const chain = new Set<WebContents>()
  // Windows whose views were already unloaded: the next `close` goes through.
  const closeApproved = new WeakSet<BaseWindow>()
  const quitCancels = createEmitter('window')
  let quitFlushed = false
  let quitting = false
  let forceDialogOpen = false

  function guardOf(wc: WebContents): CloseGuardState {
    let state = guards.get(wc)
    if (!state) guards.set(wc, (state = createCloseGuardState()))
    return state
  }

  /** Live views of a window, the active one first (it is the one the user sees). */
  function orderedOf(host: Host): Workspace[] {
    const active = deps.activeWorkspace(host)
    return [active, ...host.workspaces.filter((w) => w !== active)].filter((w) => deps.liveContents(w))
  }

  function candidates(list: Workspace[]): Candidate[] {
    return list.map((ws) => {
      const wc = deps.liveContents(ws)!
      return { ws, state: guardOf(wc), rendererAlive: rendererAlive(wc) }
    })
  }

  function updateDocumentEdited(host: Host): void {
    deps.setDocumentEdited(
      host,
      deps.hostContents(host).some((wc) => guardOf(wc).dirty)
    )
  }

  function settleWaiters(wc: WebContents): void {
    const waiters = closeWaiters.get(wc)
    closeWaiters.delete(wc)
    for (const resolve of waiters ?? []) resolve()
  }

  function ask(ws: Workspace): void {
    const wc = deps.liveContents(ws)
    if (!wc) return
    deps.present(ws)
    deps.sendCloseRequested(wc)
    // Renderer already hung: the question would never be answered.
    if (unresponsive.has(wc)) void offerForceClose(ws)
  }

  // Renderer hung during a blocked close: lets the user choose between waiting and forcing.
  async function offerForceClose(ws: Workspace): Promise<void> {
    const wc = deps.liveContents(ws)
    if (forceDialogOpen || !wc) return
    forceDialogOpen = true
    try {
      const force = await deps.confirmForceClose(wc)
      // Kills the renderer: `render-process-gone` resets the guard and continues the pending close.
      if (force && !wc.isDestroyed()) wc.forcefullyCrashRenderer()
    } finally {
      forceDialogOpen = false
    }
  }

  /** The question was resolved (or there is nothing left to ask): continues the pending close. */
  function continueClose(ws: Workspace, target: CloseTarget): void {
    const wc = deps.liveContents(ws)
    switch (target) {
      case 'workspace':
        void deps.destroyWorkspace(ws).finally(() => {
          if (wc) settleWaiters(wc)
        })
        break
      case 'window':
        if (!ws.host.win.isDestroyed()) ws.host.win.close()
        break
      case 'quit':
        deps.quit()
        break
    }
  }

  const isViewResponsive = (wc: WebContents): boolean => rendererAlive(wc) && !unresponsive.has(wc)

  return {
    /** Calls `cb` when the user cancels an app quit (Cancel in the unsaved files dialog). */
    onQuitCancelled: quitCancels.on,

    /** The view's renderer responds (neither dead nor hung). */
    isViewResponsive,

    /** Reason for hibernation not to unload the view, or `null`. */
    evictionReason(wc: WebContents): 'unsaved' | 'closing' | 'unresponsive' | null {
      const state = guards.get(wc)
      if (state && (state.dirty || state.closeBlocked || state.target !== null)) return 'unsaved'
      if (chain.has(wc)) return 'closing'
      if (!isViewResponsive(wc)) return 'unresponsive'
      return null
    },

    /**
     * `workspaces:close`: closes the workspace. With unsaved files it asks its renderer (Save / Don't Save / Cancel)
     * and only resolves when the question is resolved.
     */
    async requestCloseWorkspace(ws: Workspace): Promise<void> {
      const wc = deps.liveContents(ws)
      const state = wc && guardOf(wc)
      if (!wc || !state || !blocksClose(state, rendererAlive(wc))) {
        await deps.destroyWorkspace(ws)
        return
      }
      beginClose(state, 'workspace')
      await new Promise<void>((resolve) => {
        closeWaiters.set(wc, [...(closeWaiters.get(wc) ?? []), resolve])
        ask(ws)
      })
    },

    attachView(ws: Workspace): void {
      const wc = deps.liveContents(ws)
      if (!wc) return
      const state = guardOf(wc)
      const { host } = ws

      wc.on('unresponsive', () => {
        unresponsive.add(wc)
        if (state.closeBlocked) void offerForceClose(ws)
      })
      wc.on('responsive', () => unresponsive.delete(wc))

      // A dead renderer no longer answers anything: the "dirty" notice does not hold and the pending close goes on.
      wc.on('render-process-gone', () => {
        const pending = state.closeBlocked ? state.target : null
        resetCloseGuard(state)
        unresponsive.delete(wc)
        updateDocumentEdited(host)
        if (pending) continueClose(ws, pending)
        // No pending close: reloads so the view (and the WorkspaceBar) do not stay dead.
        else if (!quitting && !host.closing && host.workspaces.includes(ws) && !wc.isDestroyed() && allowReload(wc))
          wc.reload()
      })

      // Only a committed navigation (reload) discards the renderer state; `did-start-navigation` also fires for
      // navigations that end up cancelled.
      wc.on('did-navigate', () => {
        resetCloseGuard(state)
        updateDocumentEdited(host)
      })

      onViewDestroyed(wc, 'close-guard', () => {
        chain.delete(wc)
        settleWaiters(wc)
        updateDocumentEdited(host)
      })
    },

    attachHost(host: Host): void {
      host.win.on('close', (e) => {
        if (quitFlushed || closeApproved.has(host.win)) return
        // Without live views (quit already unloaded, or all died) there is nothing to ask or save.
        if (deps.hostContents(host).length === 0) return
        // Views only leave with the window after being unloaded (the session is saved on `beforeunload`): the real
        // close happens again at the end of the unload.
        e.preventDefault()
        if (quitting || host.closing) return

        const list = candidates(orderedOf(host))
        const blocker = list[findCloseBlocker(list)]
        if (blocker) {
          beginClose(blocker.state, 'window')
          ask(blocker.ws)
          return
        }
        // Closing the last window: saves first, with the current bounds (the entry stays for the next launch).
        deps.saveWindowsNow()
        for (const wc of deps.hostContents(host)) chain.delete(wc)
        void deps.flushHost(host).then(() => {
          closeApproved.add(host.win)
          if (!host.win.isDestroyed()) host.win.close()
        })
      })
    },

    /**
     * The veto happens before any window closes: `app.quit()` closes them all, and if one blocked on `close` the others
     * would already be closed. One dirty view at a time; on confirmation, `quit()` runs again and this same code asks
     * about the next one. Cancelling leaves everything open. Without a block, the views are unloaded (session saved)
     * before quitting goes on, so the quit is deferred and redone (`quitFlushed`).
     */
    beforeQuit(preventDefault: () => void): void {
      if (quitFlushed) return
      const focused = deps.focusedHost()
      const hosts = [...(focused ? [focused] : []), ...deps.allHosts().filter((h) => h !== focused)]
      const list = candidates(hosts.flatMap(orderedOf))
      const blocker = list[findCloseBlocker(list)]
      preventDefault()
      if (blocker) {
        beginClose(blocker.state, 'quit')
        ask(blocker.ws)
        return
      }
      if (quitting) return
      quitting = true
      chain.clear()
      // The window list is the current one; after this the views and windows keep closing.
      deps.freezeWindowsFile()
      void deps.flushAllHosts().finally(() => {
        quitFlushed = true
        deps.quit()
      })
    },

    setDirty(wc: WebContents, dirty: boolean): void {
      const ws = deps.workspaceOf(wc)
      if (!ws) return
      const state = guardOf(wc)
      state.dirty = dirty
      // Became dirty again after an old confirmation: the next close attempt asks again.
      if (dirty) state.allowClose = false
      updateDocumentEdited(ws.host)
    },

    confirmClose(wc: WebContents): void {
      const ws = deps.workspaceOf(wc)
      if (!ws) return
      const state = guardOf(wc)
      const target = state.target
      state.allowClose = true
      state.closeBlocked = false
      state.target = null
      if (!target) return
      if (target !== 'workspace') chain.add(wc)
      continueClose(ws, target)
    },

    cancelClose(wc: WebContents): void {
      const ws = deps.workspaceOf(wc)
      if (!ws) return
      const state = guardOf(wc)
      if (state.target === 'quit') quitCancels.emit()
      // Chain cancelled: those that already confirmed block again and the renderer of those views resumes auto save.
      const scope = new Set(
        state.target === 'quit' ? deps.allHosts().flatMap(deps.hostContents) : deps.hostContents(ws.host)
      )
      const confirmed = [...chain].filter((c) => scope.has(c) && !c.isDestroyed())
      if (
        abortCloseChain(
          state,
          confirmed.map((c) => guardOf(c))
        )
      ) {
        for (const c of confirmed) {
          chain.delete(c)
          deps.sendCloseAborted(c)
        }
      }
      cancelPendingClose(state)
      settleWaiters(wc)
    }
  }
}
