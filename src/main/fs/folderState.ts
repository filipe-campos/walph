import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { pathKey } from '@shared/pathCompare'
import { t } from '@shared/i18n'
import { TIMEOUT, withDeadline } from '../util/deadline'
import { UserError } from '../errors'

/**
 * `dir`; `missing` (ENOENT/ENOTDIR: leaves the recents); `file` (exists, but is not a folder); `inaccessible`
 * (permission, I/O…).
 */
type FolderState = 'dir' | 'missing' | 'file' | 'inaccessible'

export interface FolderCheck {
  state: FolderState
  /** Original `stat` error (only in `missing`/`inaccessible`). */
  error?: unknown
  /** `true` when the deadline (`timeoutMs`) was exceeded: the volume may just be slow; the state is `inaccessible`. */
  timedOut?: boolean
}

export interface ClassifyOptions {
  /** Gives up the check after this time (stuck network volume) and returns `inaccessible` + `timedOut`. */
  timeoutMs?: number
}

type StatFn = (path: string) => Promise<{ isDirectory(): boolean }>

/**
 * In-flight checks per root: a stuck `stat` (stalled network volume) holds a libuv thread until the OS gives up,
 * and there are only 4. Repeating the check of the same root would exhaust the pool and stall all of main's
 * `fs/promises`.
 */
const inFlight = new WeakMap<StatFn, Map<string, Promise<FolderCheck>>>()

function statOnce(path: string, statFn: StatFn): Promise<FolderCheck> {
  let pending = inFlight.get(statFn)
  if (!pending) inFlight.set(statFn, (pending = new Map<string, Promise<FolderCheck>>()))
  // Exact key: only joins calls with the same text (`Link` and `link` can be different targets).
  const key = pathKey(path, process.platform, { caseSensitive: true, nfc: false })
  const running = pending.get(key)
  if (running) return running
  const check = (async (): Promise<FolderCheck> => {
    try {
      return { state: (await statFn(path)).isDirectory() ? 'dir' : 'file' }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      // Only "does not exist" removes the folder from the recents; permission denied, I/O etc. are transient.
      return { state: code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' : 'inaccessible', error }
    }
  })()
  pending.set(key, check)
  void check.finally(() => {
    if (pending.get(key) === check) pending.delete(key)
  })
  return check
}

/**
 * Classifies a path without blocking main (async `stat`; `statSync` froze the window opening on a network
 * volume). Never rejects: every error becomes a state.
 */
export async function classifyFolder(
  path: string,
  options: ClassifyOptions = {},
  statFn: StatFn = stat
): Promise<FolderCheck> {
  const check = statOnce(path, statFn)
  if (options.timeoutMs === undefined) return check
  const result = await withDeadline(check, options.timeoutMs)
  if (result !== TIMEOUT) return result
  return { state: 'inaccessible', timedOut: true, error: new UserError(t().files.errors.folderNoResponse) }
}

/** Message of a check that did not yield `dir`. */
export function folderErrorMessage(path: string, check: FolderCheck): string {
  const name = basename(path)
  switch (check.state) {
    case 'missing':
      return t().files.errors.folderGone(name)
    case 'file':
      return t().files.errors.notAFolder(name)
    case 'inaccessible':
      return t().files.errors.folderInaccessible(
        name,
        check.error instanceof Error ? check.error.message : String(check.error)
      )
    case 'dir':
      return ''
  }
}
