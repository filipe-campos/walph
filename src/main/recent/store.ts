import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RecentFolder } from '@shared/types'
import { writeJsonAtomicSync } from '../fs/atomicWrite'
import { classifyFolder, folderErrorMessage } from '../fs/folderState'
import { createLog } from '../log'
import { createEmitter } from '../util/emitter'
import { removeRecent, sanitizeRecent, setRecentBranch, touchRecent } from './recentList'
import { UserError } from '../errors'

const log = createLog('recent')

// List shared by all windows; loaded from `<userData>/recent.json` on the first read.
// Format v2: `{ folders: [{ path, lastOpened, branch }] }` (the reader still accepts the v1 strings).
let folders: readonly RecentFolder[] | null = null
const changes = createEmitter<[readonly RecentFolder[]]>('recent')

const file = (): string => join(app.getPath('userData'), 'recent.json')

export function getRecent(): readonly RecentFolder[] {
  if (!folders) {
    try {
      folders = sanitizeRecent(JSON.parse(readFileSync(file(), 'utf8')))
    } catch {
      // Missing or corrupted: starts empty (the next save overwrites it).
      folders = []
    }
  }
  return folders
}

/** Runs after every write (the native menu is rebuilt; `ipc/recent.ts` notifies the renderers). */
export const onRecentChange = changes.on

// Opening workspaces and updating branches call `update` in bursts: writes and notifies only once per time window.
const FLUSH_DELAY_MS = 200
let flushTimer: NodeJS.Timeout | null = null

function flushNow(): void {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = null
  const next = folders
  if (!next) return
  try {
    writeJsonAtomicSync(file(), { folders: next })
  } catch (err) {
    log.error('Could not save the recent folders:', err)
  }
  changes.emit(next)
}

/** Writes whatever is still pending (app exit: the timer would never fire). */
export function flushRecent(): void {
  if (flushTimer) flushNow()
}

function update(next: readonly RecentFolder[]): void {
  // Memory changes right away (`recent:list` and the menu read from here); disk and notifications wait for the burst.
  folders = next
  if (flushTimer) return
  flushTimer = setTimeout(flushNow, FLUSH_DELAY_MS)
}

export function addRecent(path: string): void {
  update(touchRecent(getRecent(), path, Date.now()))
}

export function removeRecentFolder(path: string): void {
  const next = removeRecent(getRecent(), path)
  if (next.length !== getRecent().length) update(next)
}

/**
 * Ensures `root` is a folder that can be opened; otherwise throws (translated message, `t()`); if it is gone, it leaves
 * the recents. `onFail` runs before the throw (e.g. releasing the folder of a window).
 */
export async function assertFolderOrForget(root: string, onFail?: () => void): Promise<void> {
  const check = await classifyFolder(root)
  if (check.state === 'dir') return
  if (check.state === 'missing') removeRecentFolder(root)
  onFail?.()
  throw new UserError(folderErrorMessage(root, check), { cause: check.error })
}

/** Last branch of a recent folder (`workspaces.reportBranch`); only writes and notifies if something changed. */
export function updateRecentBranch(path: string, branch: string | null): void {
  const next = setRecentBranch(getRecent(), path, branch)
  if (next !== getRecent()) update(next)
}

export function clearRecent(): void {
  if (getRecent().length > 0) update([])
}
