// Lifecycle of a view (webContents) for whoever has resources tied to it. Reloading the page (`did-navigate` of the
// main frame) or the renderer dying (`render-process-gone`) does NOT fire `destroyed`, but drops the renderer state:
// pty, searches, servers and processes would be orphaned. A leaf on purpose (electron types only).

import type { WebContents } from 'electron'
import { createLog } from '../log'

const log = createLog('view')

interface ViewHooks {
  epoch: number
  /** One callback per key, in registration order. */
  callbacks: Map<string, () => void>
}

const hooks = new WeakMap<WebContents, ViewHooks>()

/**
 * Registers `cb` to run when the view navigates, loses its renderer or is destroyed. Idempotent per `(wc, key)`:
 * calling again with the same key does not duplicate (the first callback wins; it must fetch the CURRENT state, since
 * the listeners are unique per view). The three events have ONE listener per view, no matter how many keys.
 */
export function onViewReset(wc: WebContents, key: string, cb: () => void): void {
  let h = hooks.get(wc)
  if (!h) {
    const created: ViewHooks = { epoch: 0, callbacks: new Map() }
    h = created
    hooks.set(wc, created)
    const reset = (): void => {
      created.epoch++
      for (const run of [...created.callbacks.values()]) {
        try {
          run()
        } catch (err) {
          // One domain failing cannot keep the others from releasing their processes.
          log.error('Failed to release view resources:', err)
        }
      }
    }
    wc.on('did-navigate', reset)
    wc.on('render-process-gone', reset)
    wc.once('destroyed', reset)
  }
  if (!h.callbacks.has(key)) h.callbacks.set(key, cb)
}

/**
 * Counts navigations/renderer deaths of this view (and its destruction). An async operation compares the value before
 * and after the `await`: if it changed, the view that requested it no longer exists and it must abort.
 */
export function viewEpoch(wc: WebContents): number {
  return hooks.get(wc)?.epoch ?? 0
}

const destroyHooks = new WeakMap<WebContents, Map<string, () => void>>()

/**
 * Registers `cb` to run ONCE when the view is destroyed (not on reload or renderer crash: for that, `onViewReset`).
 * Idempotent per `(wc, key)`, with a single listener per view; a callback that throws does not stop the others. Use
 * it for what only dies with the view (per-view map, subscription, last save).
 * The first registration per key wins: the callback must read the CURRENT state, not the one at call time. Returns the
 * cancellation, which removes this call's callback (not another one that won the key).
 */
export function onViewDestroyed(wc: WebContents, key: string, cb: () => void): () => void {
  let callbacks = destroyHooks.get(wc)
  if (!callbacks) {
    const created = new Map<string, () => void>()
    callbacks = created
    destroyHooks.set(wc, created)
    wc.once('destroyed', () => {
      for (const run of [...created.values()]) {
        try {
          run()
        } catch (err) {
          log.error('Failed to release resources of the destroyed view:', err)
        }
      }
      created.clear()
    })
  }
  const registered = callbacks
  if (!registered.has(key)) registered.set(key, cb)
  return () => {
    if (registered.get(key) === cb) registered.delete(key)
  }
}
