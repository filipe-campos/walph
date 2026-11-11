import { basename, dirname, resolve } from 'node:path'
import { applyText, readText, scheduleReload, state, userDir, pathOf, type LinkKind, type Target } from './state'
import { watchFileInDir, watchNestedFile, type DirWatch } from './dirWatch'
import { resolveLinkTarget } from './linkTarget'

// Watches the FOLDER and filters by name (`dirWatch.ts`): the file may not exist yet, and the atomic write (delete +
// rename) swaps the inode. Any event only schedules a (debounced) reread from disk.
export function startUserWatcher(): void {
  const dir = resolve(userDir())
  const kinds: Array<[string, LinkKind]> = [
    ['settings.json', 'user'],
    ['keybindings.json', 'keybindings']
  ]
  state.userWatchers = kinds.map(([name, kind]) =>
    watchFileInDir(dir, name, () => {
      scheduleReload({ kind })
      // The link may have been replaced or pointed elsewhere: re-evaluates what to watch.
      syncLinkWatcher(kind)
    })
  )
  syncLinkWatcher('user')
  syncLinkWatcher('keybindings')
}

// If settings.json/keybindings.json is a symlink, external edits happen in the REAL file (another folder, no event in
// the link's folder). Watches the target's folder, filtering by its name, and re-evaluates when the link changes.
function syncLinkWatcher(kind: LinkKind): void {
  // Queued: two consecutive events cannot create two watchers for the same target.
  state.linkSync = state.linkSync
    .then(async () => {
      const target = await resolveLinkTarget(pathOf({ kind }))
      if (state.stopped) return
      const current = state.linkWatchers.get(kind)
      if ((current?.target ?? null) === target) return
      state.linkWatchers.delete(kind)
      current?.watcher.close()
      if (!target) return
      const dir = dirname(target)
      const name = basename(target)
      const watcher = watchFileInDir(dir, name, () => {
        scheduleReload({ kind })
        syncLinkWatcher(kind)
      })
      state.linkWatchers.set(kind, { target, watcher })
    })
    .catch(() => undefined)
}

// Watches only `<root>/.walph/settings.json`, even if `.walph/` does not exist yet: creating the folder later is
// detected too.
function startRootWatcher(root: string): DirWatch {
  const target: Target = { kind: 'workspace', root }
  return watchNestedFile(resolve(root), '.walph', 'settings.json', () => scheduleReload(target))
}

export function releaseRoot(root: string | null): void {
  if (!root) return
  const entry = state.rootWatchers.get(root)
  if (!entry) return
  if (--entry.refs > 0) return
  entry.watcher.close()
  state.rootWatchers.delete(root)
  state.workspaceValues.delete(root)
  const path = pathOf({ kind: 'workspace', root })
  state.problems.delete(path)
  state.lastTexts.delete(path)
  clearTimeout(state.timers.get(path))
  state.timers.delete(path)
}

export async function acquireRoot(root: string): Promise<void> {
  const existing = state.rootWatchers.get(root)
  if (existing) {
    existing.refs++
    // The 1st window may still be reading the file: without waiting, this one would get a snapshot without the
    // workspace.
    await existing.ready
    return
  }
  const entry = { watcher: startRootWatcher(root), refs: 1, ready: Promise.resolve() }
  state.rootWatchers.set(root, entry)
  entry.ready = loadRoot(root, entry)
  await entry.ready
}

// First read: no broadcast (the caller gets the snapshot in the response).
async function loadRoot(root: string, entry: object): Promise<void> {
  const target: Target = { kind: 'workspace', root }
  const read = await readText(target)
  // Released (or released and reacquired) during the read: this result belongs to a workspace that is no longer this
  // one.
  if (state.rootWatchers.get(root) !== entry) return
  if ('failure' in read) {
    state.problems.set(pathOf(target), [read.failure])
    return
  }
  state.lastTexts.set(pathOf(target), read.text)
  applyText(target, read.text)
}

/** Releases watchers and timers (`will-quit`). */
export async function stopWatchers(): Promise<void> {
  for (const timer of state.timers.values()) clearTimeout(timer)
  state.timers.clear()
  state.stopped = true
  // Finishes an in-flight sync before closing: it cannot create a watcher after the cleanup.
  await state.linkSync
  const watchers = [
    ...state.userWatchers,
    ...[...state.linkWatchers.values()].map((l) => l.watcher),
    ...[...state.rootWatchers.values()].map((r) => r.watcher)
  ]
  state.userWatchers = []
  state.linkWatchers.clear()
  state.rootWatchers.clear()
  for (const w of watchers) w.close()
}
