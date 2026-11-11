import { t } from '@shared/i18n'
import { createLatest } from './lib/latest'
import { saveRecentFiles, touchRecent } from './lib/recentFiles'
import { isInside } from './lib/path'
import { set, get } from './store'
import { attempt } from './attempt'

const api = window.api

const recentSeq = createLatest()

/** Loads the recent folders list and keeps it up to date; returns the unsubscribe. */
export function watchRecents(): () => void {
  const seq = recentSeq.next()
  void attempt(
    async () => {
      const recentFolders = await api.recent.list()
      // An update that arrived before the response is newer than it.
      if (recentSeq.isCurrent(seq)) set({ recentFolders })
    },
    { format: (message) => t().app.errors.recentFolders(message) }
  )
  const off = api.recent.onChange((recentFolders) => {
    recentSeq.invalidate()
    set({ recentFolders })
  })
  return off
}

export function removeRecentFolder(path: string): void {
  void attempt(() => api.recent.remove(path))
}

export function clearRecentFolders(): void {
  void attempt(() => api.recent.clear())
}

export function setRecentFiles(recentFiles: string[]): void {
  const { root, recentFiles: current } = get()
  // Removals/renames of paths unrelated to the list do not need to rewrite localStorage.
  if (recentFiles.length === current.length && recentFiles.every((p, i) => p === current[i])) return
  set({ recentFiles })
  if (root) saveRecentFiles(root, recentFiles)
}

export function markRecentFile(path: string): void {
  // Recents are per folder: outside files (e.g. the user settings.json) are left out.
  const { root } = get()
  if (!root || !isInside(root, path)) return
  if (get().recentFiles[0] !== path) setRecentFiles(touchRecent(get().recentFiles, path))
}
