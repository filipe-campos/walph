import type { WebContents } from 'electron'
import { lstat, realpath, stat } from 'node:fs/promises'
import { subscribe } from '@parcel/watcher'
import { t } from '@shared/i18n'
import { activeWatcherExcludes } from '@shared/settings'
import type { FileChange } from '@shared/types'
import { invalidateFileList } from '../files/fileListCache'
import { invalidateRepoTop } from '../git/repoTop'
import { send } from '../window/send'
import { bindView } from '../settings/binding'
import { getEffectiveSettings, onSettingsChange } from '../settings/state'
import { createEmitter } from '../util/emitter'
import { onViewDestroyed } from '../window/viewLifecycle'
import { getWindowRoot, onWorkspaceEvent } from '../window/windows'
import type { EntryKind } from './eventBatch'
import { isActiveView } from './isActiveView'
import { createTreeWatcher, type TreeWatcher } from './treeWatcher'
import { buildWatchIgnoreGlobs, ignoreKey } from './watchFilter'

// One watcher per view (webContents).
const watchers = new Map<WebContents, TreeWatcher>()

const workspaceFiles = createEmitter<[WebContents, FileChange[]]>('workspace')

/** Internal hook (LSP): receives, per view, the batch of changed files that also goes to the renderer. */
export const onWorkspaceFiles = workspaceFiles.on

async function kindOf(path: string): Promise<EntryKind> {
  try {
    const info = await lstat(path)
    if (info.isDirectory()) return 'dir'
    if (!info.isSymbolicLink()) return 'file'
    // A link to a folder counts as a folder (as the explorer shows it).
    return (await stat(path).catch(() => null))?.isDirectory() ? 'dir' : 'file'
  } catch {
    return null
  }
}

const ignoreGlobsFor = (wc: WebContents): string[] =>
  buildWatchIgnoreGlobs(activeWatcherExcludes(getEffectiveSettings(wc)))

function watcherOf(wc: WebContents): TreeWatcher {
  let watcher = watchers.get(wc)
  if (watcher) return watcher
  watcher = createTreeWatcher({
    subscribe: (realRoot, onEvents, options) => subscribe(realRoot, onEvents, options),
    statKind: kindOf,
    realpath,
    ignoreGlobs: () => ignoreGlobsFor(wc),
    // The globs come from `files.watcherExclude`, which may be in the workspace layer: waits for it to be read for this
    // folder (otherwise the watcher would start with the previous folder's layer and only restart after events were
    // already emitted).
    prepare: (root) => bindView(wc, root),
    send: (change) => send(wc, 'workspace:changed', change),
    onFiles: (files) => workspaceFiles.emit(wc, files),
    isActive: () => isActiveView(wc),
    currentRoot: () => getWindowRoot(wc),
    isAlive: () => !wc.isDestroyed(),
    invalidateFileList,
    onGitRootChange: invalidateRepoTop,
    onWatchFailed: (root) =>
      send(wc, 'workspace:changed', { dirs: [], files: [], watchError: t().app.errors.watchFailed(root) })
  })
  watchers.set(wc, watcher)
  const created = watcher
  onViewDestroyed(wc, 'workspace-watcher', () => {
    if (watchers.get(wc) === created) watchers.delete(wc)
    void created.stop()
  })
  return watcher
}

/** Starts watching `root` in this view (the previous watcher is closed). */
export function watchViewRoot(wc: WebContents, root: string, reconcile = false): Promise<void> {
  return watcherOf(wc).start(root, reconcile)
}

/** The view already watches exactly `root` (reloading and reopening the same folder keeps the watcher). */
export function isWatchingRoot(wc: WebContents, root: string): boolean {
  return watchers.get(wc)?.current()?.root === root
}

/** Closes every workspace watcher (`will-quit`). */
export async function stopViewWatchers(): Promise<void> {
  await Promise.all([...watchers.values()].map((w) => w.stop()))
}

/** Wires the watcher to the view activation changes and to the `files.watcherExclude` globs. */
export function startViewWatcherReactions(): void {
  // The view became the active one: the batch waiting for the long window goes out right away.
  onWorkspaceEvent((event) => {
    if (event.type !== 'activated') return
    const wc = event.ws.view?.webContents
    const watcher = wc && !wc.isDestroyed() ? watchers.get(wc) : undefined
    if (wc && watcher && isActiveView(wc)) watcher.activated()
  })

  // `files.watcherExclude` changed for this view (`files.exclude` never reaches the watcher): restart with new globs.
  onSettingsChange((wc) => {
    const current = watchers.get(wc)?.current()
    if (current && current.ignoreKey !== ignoreKey(ignoreGlobsFor(wc))) void watchViewRoot(wc, current.root, true)
  })
}
