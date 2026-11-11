import type { WebContents } from 'electron'
import { announce, currentProblems, state } from './state'
import { acquireRoot, releaseRoot } from './watchers'
import { onViewDestroyed } from '../window/viewLifecycle'

// Reads in progress per view: whoever needs the workspace layer (the tree watcher) waits for it.
const pending = new WeakMap<WebContents, Promise<void>>()

/**
 * Binds the view to the settings layer of the `root` folder (`null` = user only): releases the previous layer, acquires
 * the new one and, when the first read finishes, resends the snapshot and notifies the listeners. Idempotent per
 * view+folder. Whoever depends on the layer (the tree watcher, the LSP) calls `settingsReady` to wait for the read.
 */
export function bindView(wc: WebContents, root: string | null): Promise<void> {
  const known = state.windows.has(wc)
  const previous = state.windows.get(wc) ?? null
  if (known && previous === root) return settingsReady(wc)
  if (!known) {
    onViewDestroyed(wc, 'settings-binding', () => {
      releaseRoot(state.windows.get(wc) ?? null)
      state.windows.delete(wc)
    })
  }
  state.windows.set(wc, root)
  releaseRoot(previous)
  const ready = (root ? acquireRoot(root) : Promise.resolve()).then(() => {
    // The view may have switched folders (or closed) during the read: the outcome belongs to the current folder.
    if (state.windows.get(wc) !== root || wc.isDestroyed()) return
    announce(wc, currentProblems(root))
  })
  pending.set(wc, ready)
  return ready
}

function settingsReady(wc: WebContents): Promise<void> {
  const root = state.windows.get(wc)
  return Promise.all([pending.get(wc), root ? state.rootWatchers.get(root)?.ready : undefined]).then(() => undefined)
}
