// One `PathAllowlist` per view: created on first use and dies with the view (reload, renderer crash or close).

import type { WebContents } from 'electron'
import { PathAllowlist, type PathAllowlistOptions, type PathCheck } from '../fs/pathAllowlist'
import { createViewRegistry } from './viewResources'

const ID = 'allowlist'

interface ViewPathAllowlist {
  allow(wc: WebContents, path: string): Promise<void>
  verify(wc: WebContents, path: string): Promise<PathCheck>
  /** Forgets the view's grants (folder changed). */
  clear(wc: WebContents): void
}

/** `key` is the `onViewReset` key: unique per list. */
export function createViewPathAllowlist(key: string, options: PathAllowlistOptions = {}): ViewPathAllowlist {
  const lists = createViewRegistry<PathAllowlist>({ key, dispose: (list) => list.clear() })
  return {
    allow(wc, path) {
      // A read that ends after the reload or close must not record anything (nor retain the dead view).
      if (wc.isDestroyed()) return Promise.resolve()
      const assertAlive = lists.guardEpoch(wc)
      const isStale = (): boolean => {
        try {
          assertAlive(() => new Error('stale'))
          return false
        } catch {
          return true
        }
      }
      let list = lists.get(wc, ID)
      if (!list) lists.add(wc, ID, (list = new PathAllowlist(options)))
      return list.allow(path, isStale)
    },
    verify: (wc, path) => lists.get(wc, ID)?.verify(path) ?? Promise.resolve('unknown'),
    clear: (wc) => void lists.dispose(wc, ID)
  }
}
