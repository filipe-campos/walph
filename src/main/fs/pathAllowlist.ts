// Paths main granted to a view. A grant comes from something main saw (native dialog, a file it read itself for
// the editor, user confirmation), never from a renderer request. Each grant pins the canonical target of the path:
// a symlink swapped later does not count. It is the building block of `claude/attachments` and `fs/writeAccess`.

import { stat } from 'node:fs/promises'
import { pathKey, samePath } from '@shared/pathCompare'
import { canonicalPath } from './paths'

/** `expired`: there was a grant, but past its deadline. `changed`: the path no longer leads to what was granted. */
export type PathCheck = 'ok' | 'unknown' | 'expired' | 'changed'

export interface PathAllowlistOptions {
  /** Validity of each grant, renewed on every successful `verify`. Without a value, it does not expire. */
  ttlMs?: number
  /** Requires an existing file and also pins dev/ino: a file replaced by another (same path too) is `changed`. */
  pinFile?: boolean
  /** Evicts the oldest grant when going past this. */
  maxEntries?: number
  now?: () => number
}

interface Allowed {
  until: number
  real: string
  dev: number
  ino: number
}

export class PathAllowlist {
  private readonly entries = new Map<string, Allowed>()
  private readonly now: () => number

  constructor(private readonly options: PathAllowlistOptions = {}) {
    this.now = options.now ?? Date.now
  }

  /** With `pinFile`, a file that does not exist is not granted (`stat` throws). */
  async allow(path: string, isStale: () => boolean = () => false): Promise<void> {
    this.prune()
    const info = this.options.pinFile ? await stat(path) : null
    const key = pathKey(path)
    const real = await canonicalPath(path)
    if (isStale()) return
    this.entries.delete(key)
    this.entries.set(key, { until: this.expiry(), real, dev: info?.dev ?? 0, ino: info?.ino ?? 0 })
    const { maxEntries } = this.options
    if (maxEntries !== undefined && this.entries.size > maxEntries) {
      this.entries.delete(this.entries.keys().next().value as string)
    }
  }

  /** `ok` renews the deadline. */
  async verify(path: string): Promise<PathCheck> {
    const key = pathKey(path)
    const entry = this.entries.get(key)
    if (!entry) return 'unknown'
    if (entry.until <= this.now()) {
      this.entries.delete(key)
      return 'expired'
    }
    try {
      // Both sides are real paths (or the rest as given): case matters.
      if (!samePath(await canonicalPath(path), entry.real, undefined, { caseSensitive: true })) return 'changed'
      if (this.options.pinFile) {
        const info = await stat(path)
        if (info.dev !== entry.dev || info.ino !== entry.ino) return 'changed'
      }
    } catch {
      return 'changed'
    }
    entry.until = this.expiry()
    // Map order is usage order: eviction by `maxEntries` takes the most idle grant.
    this.entries.delete(key)
    this.entries.set(key, entry)
    return 'ok'
  }

  clear(): void {
    this.entries.clear()
  }

  private expiry(): number {
    return this.options.ttlMs === undefined ? Infinity : this.now() + this.options.ttlMs
  }

  private prune(): void {
    const now = this.now()
    for (const [key, entry] of this.entries) if (entry.until <= now) this.entries.delete(key)
  }
}
