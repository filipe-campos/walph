import { samePath } from '@shared/pathCompare'
import type { FileChange, WorkspaceChange } from '@shared/types'
import { shouldInvalidateFileList } from '../files/normalizeFileList'
import { createLog } from '../log'
import { classifyBatch, mergeRawEvent, relativeSlash, toRootSpelling, type EntryKind, type RawKind } from './eventBatch'
import { createFlushScheduler } from './flushScheduler'
import { FLOOR_WATCH_IGNORES, createIgnoreMatcher, ignoreKey } from './watchFilter'

const log = createLog('workspace')

/** Batch window: the visible workspace reacts fast; hidden ones gather more events (the renderer is not looking). */
const ACTIVE_FLUSH_MS = 150
const INACTIVE_FLUSH_MS = 2000

export interface WatchEvent {
  type: RawKind
  path: string
}

interface WatchSubscription {
  unsubscribe: () => Promise<unknown>
}

export interface TreeWatcherDeps {
  /** Native subscription (`@parcel/watcher`); receives the real root and the ignored globs. */
  subscribe: (
    realRoot: string,
    onEvents: (err: Error | null, events: WatchEvent[]) => void,
    options: { ignore: string[] }
  ) => Promise<WatchSubscription>
  statKind: (path: string) => Promise<EntryKind>
  realpath: (path: string) => Promise<string>
  /** `files.watcherExclude` globs of this view (read after `prepare`). */
  ignoreGlobs: () => string[]
  /** Waits for the workspace settings layer of this folder before reading the globs. */
  prepare: (root: string) => Promise<void>
  send: (change: WorkspaceChange) => void
  /** Batch of files that also goes to the renderer (LSP). */
  onFiles: (files: FileChange[]) => void
  isActive: () => boolean
  /** Folder the view owns now (may have changed without a new `start`). */
  currentRoot: () => string | null
  /** The view still exists (false after `destroyed`). */
  isAlive: () => boolean
  /** The cached file list of `root` is no longer valid. */
  invalidateFileList: (root: string) => void
  /** `.git` created or removed at the root: the cached repository root is no longer valid. */
  onGitRootChange: (root: string) => void
  /** Both `subscribe` calls failed: the folder has no watcher. Called once until a start succeeds. */
  onWatchFailed: (root: string) => void
}

export interface TreeWatcher {
  /** Starts watching `root`, closing the previous watcher. `reconcile`: the first batch asks for `full`. */
  start: (root: string, reconcile?: boolean) => Promise<void>
  /** Closes the watcher and cancels an in-flight `start`. */
  stop: () => Promise<void>
  /** The view became the active one: sends the waiting batch or retries a folder left without a watcher. */
  activated: () => void
  /** Folder watched now and the key of the globs it started with; `null` without a watcher. */
  current: () => { root: string; ignoreKey: string } | null
}

interface Running {
  root: string
  ignoreKey: string
  stop: () => Promise<void>
  flushNow: () => void
}

/** Recursive watcher of a view. `generation` discards a `start` superseded by a newer one or by `stop`. */
export function createTreeWatcher(deps: TreeWatcherDeps): TreeWatcher {
  let running: Running | null = null
  let generation = 0
  let failedRoot: string | null = null
  let failureReported = false

  async function stopRunning(): Promise<void> {
    const current = running
    if (!current) return
    running = null
    await current.stop()
    // Only this folder's list: other views keep their cache.
    deps.invalidateFileList(current.root)
  }

  const superseded = (mine: number): boolean => generation !== mine || !deps.isAlive()

  async function start(root: string, reconcile = false): Promise<void> {
    const mine = ++generation
    if (failedRoot !== root) failureReported = false
    failedRoot = null
    await stopRunning()
    if (superseded(mine)) return

    await deps.prepare(root)
    if (superseded(mine)) return

    // A list cached before this watcher was not watched by anyone: it may be stale.
    deps.invalidateFileList(root)

    const globs = deps.ignoreGlobs()
    const ignored = createIgnoreMatcher(globs)
    // The native watcher returns real paths (on macOS `/tmp` → `/private/tmp`) and only prunes globs relative to that
    // spelling; the renderer only knows the view folder one.
    const realRoot = await deps.realpath(root).catch(() => root)
    if (superseded(mine)) return

    let batch = new Map<string, RawKind>()
    let sending: Promise<void> = Promise.resolve()
    // Restart or error: events may have been lost; the next batch sends `full` so the renderer reconciles.
    let full = reconcile

    const flush = (): void => {
      const taken = batch
      const wasFull = full
      full = false
      batch = new Map()
      // Queued: the async stat of a batch cannot overtake the previous one.
      sending = sending.then(async () => {
        const { dirs, files } = await classifyBatch(taken, deps.statKind)
        if (superseded(mine)) return
        const change: WorkspaceChange = { dirs, files }
        if (wasFull) {
          change.full = true
          if (!change.dirs.includes(root)) change.dirs.push(root)
        }
        deps.send(change)
        if (files.length > 0) deps.onFiles(files)
      })
    }
    const scheduler = createFlushScheduler(flush, () => (deps.isActive() ? ACTIVE_FLUSH_MS : INACTIVE_FLUSH_MS))

    const onEvents = (err: Error | null, events: WatchEvent[]): void => {
      if (err) {
        log.warn(`watcher of "${root}": ${err.message}`)
        full = true
        scheduler.schedule()
        return
      }
      let any = false
      for (const event of events) {
        const path = toRootSpelling(event.path, realRoot, root)
        const rel = relativeSlash(root, path)
        if (rel === null || ignored(rel)) continue
        any = true
        if (rel === '.git') deps.onGitRootChange(root)
        if (
          shouldInvalidateFileList(
            event.type === 'update' ? 'change' : event.type === 'create' ? 'add' : 'unlink',
            path
          )
        )
          deps.invalidateFileList(root)
        mergeRawEvent(batch, event.type, path)
      }
      if (any) scheduler.schedule()
    }

    let subscription: WatchSubscription
    try {
      subscription = await deps.subscribe(realRoot, onEvents, { ignore: globs })
    } catch (err) {
      // An invalid user glob cannot leave the folder without a watcher: falls back to the floor.
      log.warn(`watcher with user globs failed (${(err as Error).message}); using the floor`)
      try {
        subscription = await deps.subscribe(realRoot, onEvents, { ignore: [...FLOOR_WATCH_IGNORES] })
      } catch (err2) {
        log.warn(`could not watch "${root}": ${(err2 as Error).message}`)
        if (superseded(mine)) return
        failedRoot = root
        if (!failureReported) {
          failureReported = true
          deps.onWatchFailed(root)
        }
        return
      }
    }
    if (superseded(mine)) {
      await subscription.unsubscribe().catch(() => undefined)
      return
    }

    failureReported = false
    running = {
      root,
      ignoreKey: ignoreKey(globs),
      stop: async () => {
        scheduler.cancel()
        batch = new Map()
        await subscription.unsubscribe().catch(() => undefined)
      },
      flushNow: () => scheduler.flushNow()
    }
    if (reconcile) scheduler.schedule()
  }

  return {
    start,
    async stop() {
      generation++
      failedRoot = null
      await stopRunning()
    },
    activated() {
      if (running) running.flushNow()
      else if (failedRoot !== null && deps.isAlive()) {
        const retry = failedRoot
        const owned = deps.currentRoot()
        if (owned !== null && samePath(owned, retry)) void start(retry, true)
        else failedRoot = null
      }
    },
    current: () => (running ? { root: running.root, ignoreKey: running.ignoreKey } : null)
  }
}
