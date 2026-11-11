// Unloading views: closing (window, workspace, quit) and hibernation. Both wait for the view's `destroyed`, so the
// per-webContents cleanup (pty, LSP, Claude, watcher) has run before moving on.

import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import { evictionBlocker } from './evictionGuards'
import { allHosts, emit, hostContents, liveContents, type Host, type Workspace } from './windowState'
import { isQuitFrozen } from './windowsPersistence'
import { createLog } from '../log'
import { onViewDestroyed } from './viewLifecycle'

const log = createLog('view')

const CLOSE_TIMEOUT_MS = 3000
const HIBERNATE_DESTROY_TIMEOUT_MS = 2000

// Workspaces whose view is being unloaded to hibernate (until `destroyed`): activating waits for the end.
const hibernating = new Map<Workspace, Promise<void>>()

/** The workspace's hibernation unload in progress (resolves on the old view's `destroyed`), if any. */
export function hibernationInFlight(ws: Workspace): Promise<void> | undefined {
  return hibernating.get(ws)
}

/**
 * Resolves on `destroyed`, or after `timeoutMs` calling `onTimeout`. `cancel` disarms the deadline and resolves now.
 */
function waitDestroyed(
  wc: WebContents,
  timeoutMs: number,
  onTimeout: () => void
): { done: Promise<void>; cancel: () => void } {
  let cancel = (): void => {}
  const done = new Promise<void>((resolve) => {
    let unsubscribe = (): void => {}
    const timer = setTimeout(() => {
      unsubscribe()
      onTimeout()
      resolve()
    }, timeoutMs)
    cancel = () => {
      clearTimeout(timer)
      unsubscribe()
      resolve()
    }
    unsubscribe = onViewDestroyed(wc, `wait-destroyed:${randomUUID()}`, cancel)
  })
  return { done, cancel }
}

/** Unloads a view giving the renderer the chance to save the session (`beforeunload`); waits for `destroyed`. */
export function closeContents(wc: WebContents, graceful: boolean): Promise<void> {
  if (wc.isDestroyed()) return Promise.resolve()
  // A renderer that does not unload in time: forces the close (without waiting for `beforeunload`) so `destroyed` runs
  // and the per-webContents cleanup (pty, LSP, Claude, watcher) is not orphaned.
  const { done, cancel } = waitDestroyed(wc, CLOSE_TIMEOUT_MS, () => {
    try {
      if (!wc.isDestroyed()) wc.close({ waitForBeforeUnload: false })
    } catch {
      // already destroyed
    }
  })
  try {
    // A dead renderer does not answer `beforeunload`.
    wc.close({ waitForBeforeUnload: graceful && !wc.isCrashed() })
  } catch {
    cancel()
  }
  return done
}

/** Unloads all views of the window (window close/quit): the list stays as is. */
export async function flushHost(host: Host, graceful = true): Promise<void> {
  host.closing = true
  await Promise.all(hostContents(host).map((wc) => closeContents(wc, graceful)))
}

export async function flushAllHosts(): Promise<void> {
  await Promise.all(allHosts().map((h) => flushHost(h)))
}

/**
 * Returns the workspace to dormant: unloads the view as in a graceful close (`beforeunload` saves the session; the
 * view's processes die on `destroyed`) but keeps the workspace in the bar, with folder and branch. Reactivating
 * recreates the view (`ensureView`). Never the active one, nor while quitting. `true` if the view was unloaded.
 */
export async function hibernateWorkspace(ws: Workspace): Promise<boolean> {
  const { host } = ws
  const wc = liveContents(ws)
  const view = ws.view
  if (!wc || !view || isQuitFrozen() || host.closing || host.activeId === ws.id || hibernating.has(ws)) return false
  if (!host.workspaces.includes(ws)) return false
  // Rechecks right before closing: the decision was made before the awaits of other hibernations.
  if (wc.isCrashed() || wc.isLoading() || evictionBlocker(wc) !== null) return false
  const done = (async (): Promise<void> => {
    if (!host.win.isDestroyed()) {
      view.setVisible(false)
      host.win.contentView.removeChildView(view)
    }
    // The view leaves the workspace's hands now: reactivating creates another one, never reuses this one (which is out
    // of
    // the window). Its `destroyed` only clears `ws.view` if it is still this one.
    ws.view = null
    emit({ type: 'changed', host })
    await closeContents(wc, true)
    // Deadline exceeded: `closeContents` resolves before `destroyed`; reactivating only after it (no two renderers).
    if (!wc.isDestroyed()) {
      await waitDestroyed(wc, HIBERNATE_DESTROY_TIMEOUT_MS, () => {
        // Second deadline: does not block activation forever. The view's ownership already left the workspace (`ws.view
        // = null`).
        log.error('The hibernated view was not destroyed in time; killing the renderer.')
        try {
          if (!wc.isDestroyed()) wc.forcefullyCrashRenderer()
        } catch {
          // already destroyed
        }
      }).done
    }
  })()
  hibernating.set(ws, done)
  try {
    await done
  } finally {
    hibernating.delete(ws)
  }
  return true
}
