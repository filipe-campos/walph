// Watcher work deferred while the workspace view is hidden: accumulates what changed (folders, files, git)
// and delivers everything at once when the view becomes active again.
import type { DirEntry, FileChange, GitStatus, WorkspaceChange } from '@shared/types'

/** Above this the detail is not worth it: it becomes "reload everything that is loaded". */
export const MAX_STALE_DIRS = 200
export const MAX_STALE_FILES = 500

interface StaleBatch {
  /** Folders to reload; `null` = all the loaded ones. */
  dirs: string[] | null
  /** Changed files; `null` = re-evaluate all the open tabs. */
  files: FileChange[] | null
}

export interface StaleWork {
  add(change: WorkspaceChange): void
  /** Returns the accumulated work (or `null` if none) and resets. */
  take(): StaleBatch | null
  clear(): void
}

export function createStaleWork(): StaleWork {
  let dirs = new Set<string>()
  let allDirs = false
  let files: FileChange[] = []
  let allFiles = false
  let any = false

  const reset = (): void => {
    dirs = new Set()
    allDirs = false
    files = []
    allFiles = false
    any = false
  }

  return {
    add(change) {
      any = true
      // Watcher restarted: what changed in the folders is unknown, so it becomes "reload all".
      // The open tabs were already re-read right away (the caller's `files`): here only the folders are worth keeping.
      if (change.full) {
        allDirs = true
        dirs = new Set()
        return
      }
      if (!allDirs) {
        for (const d of change.dirs) dirs.add(d)
        if (dirs.size > MAX_STALE_DIRS) {
          allDirs = true
          dirs = new Set()
        }
      }
      if (!allFiles) {
        files.push(...change.files)
        if (files.length > MAX_STALE_FILES) {
          allFiles = true
          files = []
        }
      }
    },
    take() {
      if (!any) return null
      const batch: StaleBatch = { dirs: allDirs ? null : [...dirs], files: allFiles ? null : files }
      reset()
      return batch
    },
    clear: reset
  }
}

function sameEntries(a: readonly DirEntry[], b: readonly DirEntry[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (!x || !y || x.path !== y.path || x.isDirectory !== y.isDirectory || x.name !== y.name) return false
  }
  return true
}

/** List of folder entries: keeps the old reference when nothing changed (the explorer does not redraw). */
export function keepDirEntries(prev: readonly DirEntry[] | undefined, next: DirEntry[]): DirEntry[] {
  return prev && sameEntries(prev, next) ? (prev as DirEntry[]) : next
}

/** Fingerprint of a file status (index + working tree). */
export function gitFileFingerprint(f: { index: string; workingDir: string } | undefined): string {
  return f ? `${f.index}${f.workingDir}` : ''
}

/** Structurally equal git status (branch/upstream/ahead/behind and the file list, in order). */
export function sameGitStatus(a: GitStatus | null, b: GitStatus | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (
    a.isRepo !== b.isRepo ||
    a.repoRoot !== b.repoRoot ||
    a.branch !== b.branch ||
    a.upstream !== b.upstream ||
    a.ahead !== b.ahead ||
    a.behind !== b.behind ||
    a.operation !== b.operation ||
    a.files.length !== b.files.length
  )
    return false
  for (let i = 0; i < a.files.length; i++) {
    const x = a.files[i]
    const y = b.files[i]
    if (!x || !y || x.path !== y.path || x.index !== y.index || x.workingDir !== y.workingDir) return false
  }
  if (a.ignored.length !== b.ignored.length) return false
  for (let i = 0; i < a.ignored.length; i++) if (a.ignored[i] !== b.ignored[i]) return false
  return true
}
