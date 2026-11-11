// Registry of resources tied to a view (webContents): pty, searches, git/docker processes, servers, conversations.
// Reloading the page, the renderer dying or the view being destroyed discards everything the view registered. A leaf
// on purpose: only `viewLifecycle` and `log`.

import type { WebContents } from 'electron'
import { createLog } from '../log'
import { onViewReset, viewEpoch } from './viewLifecycle'

const log = createLog('view')

type ResourceId = string | number

interface ResourceContext {
  wc: WebContents
  /** `undefined` for what came in through `track`. */
  id: ResourceId | undefined
}

interface ViewRegistryOptions<T extends object> {
  /** `onViewReset` key (unique per registry). */
  key: string
  /**
   * Releases an item (view reset, `dispose`, `disposeAll`). The item already left the registry and is already marked
   * cancelled. A returned Promise is awaited by `dispose`/`disposeAll`; failures are logged, never propagated.
   */
  dispose(item: T, context: ResourceContext): void | Promise<void>
  /**
   * `will-quit`: releases all at once, synchronously (the app exits before any wait). Without this, each item goes
   * through `dispose`. Receives the whole list for whoever needs a batch sweep.
   */
  disposeSync?(items: T[]): void
}

interface ViewRegistry<T extends object> {
  /**
   * Registers `item` on the view and arms the automatic release on its reset. A repeated `id` replaces the item
   * (without releasing it).
   */
  add(wc: WebContents, id: ResourceId, item: T): void
  /**
   * Like `add`, for whoever needs no id. Returns the function that removes the item from the registry (without
   * releasing it).
   */
  track(wc: WebContents, item: T): () => void
  /** Only returns the item if it belongs to `wc`: a message from another view about a foreign id finds nothing. */
  get(wc: WebContents, id: ResourceId): T | undefined
  values(wc: WebContents): T[]
  /** All items of all views, with the owner view. */
  entries(): Array<[WebContents, T]>
  /** Does the view have any item? (unload guards) */
  has(wc: WebContents): boolean
  /**
   * The items of a single view: `track` + `wasCancelled`, for whoever receives the owner as a parameter (e.g.
   * `runCollect`).
   */
  scope(wc: WebContents): { track(item: T): () => void; wasCancelled(item: T): boolean }
  /**
   * Removes from the registry without releasing (the item finished by itself). With `expected`, only if the current
   * item is that one.
   */
  delete(wc: WebContents, id: ResourceId, expected?: T): boolean
  /** Removes from the registry and releases. */
  dispose(wc: WebContents, id: ResourceId): Promise<void>
  /** Removes all items of the view and releases each one. */
  disposeAll(wc: WebContents): Promise<void>
  /** `will-quit`: removes and releases everything, from all views, without waiting. */
  disposeAllSync(): void
  /**
   * Marks as cancelled by the owner (not by deadline or failure), without removing from the registry. Every release
   * already does it.
   */
  markCancelled(item: T): void
  /** The item was released or marked, even after leaving the registry: decides the error message. */
  wasCancelled(item: T): boolean
  /**
   * Call before an `await` that precedes the item's registration: returns the function that, after the `await`, throws
   * `makeError()` if the view reloaded, crashed or was destroyed meanwhile (the reset already ran and would not see the
   * item).
   */
  guardEpoch(wc: WebContents): (makeError: () => Error) => void
}

export function createViewRegistry<T extends object>(options: ViewRegistryOptions<T>): ViewRegistry<T> {
  const byView = new Map<WebContents, Map<unknown, T>>()
  const cancelled = new WeakSet<object>()

  const release = (item: T, context: ResourceContext): Promise<void> => {
    cancelled.add(item)
    try {
      return Promise.resolve(options.dispose(item, context)).catch((err: unknown) => {
        log.error(`Failed to release a view resource (${options.key}):`, err)
      })
    } catch (err) {
      log.error(`Failed to release a view resource (${options.key}):`, err)
      return Promise.resolve()
    }
  }

  const watch = (wc: WebContents): void => {
    onViewReset(wc, options.key, () => void disposeAll(wc))
  }

  const take = (wc: WebContents, id: ResourceId): T | undefined => {
    const items = byView.get(wc)
    const item = items?.get(id)
    if (items && item !== undefined) {
      items.delete(id)
      if (items.size === 0) byView.delete(wc)
    }
    return item
  }

  const add = (wc: WebContents, id: unknown, item: T): void => {
    watch(wc)
    let items = byView.get(wc)
    if (!items) byView.set(wc, (items = new Map<unknown, T>()))
    items.set(id, item)
  }

  const disposeAll = (wc: WebContents): Promise<void> => {
    const items = byView.get(wc)
    if (!items) return Promise.resolve()
    byView.delete(wc)
    return Promise.all([...items].map(([id, item]) => release(item, { wc, id: asId(id) }))).then(() => undefined)
  }

  const track = (wc: WebContents, item: T): (() => void) => {
    const id = Symbol('track')
    add(wc, id, item)
    return () => {
      const items = byView.get(wc)
      if (!items?.delete(id)) return
      if (items.size === 0) byView.delete(wc)
    }
  }

  return {
    add,
    track,
    scope: (wc) => ({ track: (item) => track(wc, item), wasCancelled: (item) => cancelled.has(item) }),
    get: (wc, id) => byView.get(wc)?.get(id),
    values: (wc) => [...(byView.get(wc)?.values() ?? [])],
    entries: () =>
      [...byView].flatMap(([wc, items]) => [...items.values()].map((item): [WebContents, T] => [wc, item])),
    has: (wc) => byView.has(wc),
    delete(wc, id, expected) {
      if (expected !== undefined && byView.get(wc)?.get(id) !== expected) return false
      return take(wc, id) !== undefined
    },
    dispose(wc, id) {
      const item = take(wc, id)
      return item === undefined ? Promise.resolve() : release(item, { wc, id })
    },
    disposeAll,
    disposeAllSync() {
      const all = [...byView].flatMap(([wc, items]) => [...items].map(([id, item]) => ({ wc, id, item })))
      byView.clear()
      for (const { item } of all) cancelled.add(item)
      if (!options.disposeSync) {
        for (const { wc, id, item } of all) void release(item, { wc, id: asId(id) })
        return
      }
      try {
        options.disposeSync(all.map(({ item }) => item))
      } catch (err) {
        log.error(`Failed to release view resources (${options.key}):`, err)
      }
    },
    markCancelled: (item) => void cancelled.add(item),
    wasCancelled: (item) => cancelled.has(item),
    guardEpoch(wc) {
      watch(wc)
      const epoch = viewEpoch(wc)
      return (makeError) => {
        if (wc.isDestroyed() || viewEpoch(wc) !== epoch) throw makeError()
      }
    }
  }
}

function asId(id: unknown): ResourceId | undefined {
  return typeof id === 'string' || typeof id === 'number' ? id : undefined
}
