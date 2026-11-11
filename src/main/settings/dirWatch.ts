import { watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'

export interface DirWatch {
  close(): void
}

/**
 * Watches a FOLDER (not the file) and reports when an entry called `name` changes. An atomic write (tmp + rename)
 * swaps the file's inode; watching the folder always sees the rename, with no "remove + recreate" window in which an
 * event is lost. `name === null` in the OS callback means "don't know which": treated as if it were the entry.
 * Returns `null` if the folder does not exist (or cannot be watched).
 */
function watchEntries(
  dir: string,
  accept: (name: string) => boolean,
  onEvent: (name: string, event: string) => void
): FSWatcher | null {
  try {
    const watcher = watch(dir, { persistent: false }, (event, filename) => {
      const name = filename ?? ''
      if (name === '' || accept(name)) onEvent(name, event)
    })
    // Folder deleted/permission lost: the event lands here instead of crashing the process.
    watcher.on('error', () => undefined)
    return watcher
  } catch {
    return null
  }
}

/** Calls `onChange` on every event of the entry `name` inside `dir`. */
export function watchFileInDir(dir: string, name: string, onChange: () => void): DirWatch {
  const watcher = watchEntries(dir, (n) => n === name, onChange)
  return { close: () => watcher?.close() }
}

/**
 * Watches `<root>/<folder>/<file>` even if `<folder>` does not exist yet: the root is watched to see the folder being
 * created (or deleted and recreated) and, while it exists, the folder is watched to see the file. `file` can also be
 * a name filter (several files of the same folder).
 */
export function watchNestedFile(
  root: string,
  folder: string,
  file: string | ((name: string) => boolean),
  onChange: () => void
): DirWatch {
  const folderPath = join(root, folder)
  const accept = typeof file === 'string' ? (n: string): boolean => n === file : file
  let inner: FSWatcher | null = null
  let closed = false

  const openInner = (): void => {
    inner?.close()
    inner = watchEntries(folderPath, accept, () => onChange())
  }

  const outer = watchEntries(
    root,
    (n) => n === folder,
    (_name, event) => {
      if (closed) return
      // The folder may have been (re)created or deleted (`rename`): the old watcher, tied to the previous inode, is no
      // longer useful. `change` (e.g. Windows on every write inside it) does not change existence: does not reopen.
      if (event === 'rename') openInner()
      onChange()
    }
  )
  // Starts after the root: a folder created between the two calls is still seen by the root's event.
  openInner()

  return {
    close: () => {
      closed = true
      outer?.close()
      inner?.close()
      inner = null
    }
  }
}
