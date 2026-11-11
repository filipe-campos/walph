import type { FileList } from '@shared/types'
import { deriveFolders } from './lib/claudeMentions'
import { onRootChange } from './store'

export interface ProjectFiles extends FileList {
  /** Folders with a trailing `/`. */
  folders: string[]
}

interface Entry {
  root: string
  at: number
  list: Promise<FileList>
  withFolders?: Promise<ProjectFiles>
}

/** Main caches the list and the watcher invalidates it; here it is enough not to repeat the IPC on every keystroke. */
export const PROJECT_FILES_TTL_MS = 5000

let entry: Entry | null = null

function ensure(root: string): Entry {
  if (entry && entry.root === root && Date.now() - entry.at < PROJECT_FILES_TTL_MS) return entry
  const mine: Entry = { root, at: Date.now(), list: window.api.files.list(root) }
  entry = mine
  // A failure is not cached.
  mine.list.catch(() => {
    if (entry === mine) entry = null
  })
  return mine
}

/** File list of the folder (Quick Open). */
export function loadFileList(root: string): Promise<FileList> {
  return ensure(root).list
}

/** Files and derived folders (Claude `@` mentions), over the same list as `loadFileList`. */
export function loadProjectFiles(root: string): Promise<ProjectFiles> {
  const current = ensure(root)
  current.withFolders ??= current.list.then((list) => ({ ...list, folders: deriveFolders(list.files) }))
  return current.withFolders
}

export function invalidateProjectFiles(): void {
  entry = null
}

export function startProjectFilesReactions(): () => void {
  return onRootChange(invalidateProjectFiles)
}
