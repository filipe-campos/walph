export interface FileChange {
  /** Absolute path. */
  path: string
  /**
   * `add`: file created (or recreated); `change`: content changed; `unlink`: file removed. A removed folder
   * also arrives as `unlink` (with the folder path): the tabs inside it must be treated as removed.
   */
  type: 'add' | 'change' | 'unlink'
}

export interface WorkspaceChange {
  /** Directories whose content changed (to reload in the explorer). */
  dirs: string[]
  /**
   * Files created/changed/removed in the batch (already outside `.git`), in event order. Includes the editor's own
   * writes: the renderer compares them with the saved content to ignore them.
   */
  files: FileChange[]
  /**
   * The watcher was restarted (configuration changed) or reported an error: events may have been lost. The renderer
   * must reload everything open/expanded and check the tabs against the disk, instead of trusting only `dirs`/`files`.
   */
  full?: boolean
  /**
   * Message (already translated) that the folder lost file watching: `dirs`/`files` come empty and the explorer list
   * does not update by itself. Main tries again when the view becomes the active one again.
   */
  watchError?: string
}

/** Recent folder (`recent.json`). List shared by all windows, the most recent first. */
export interface RecentFolder {
  path: string
  /** Last time the folder was opened in a workspace (ms since the epoch); `null` = old entry, without a date. */
  lastOpened: number | null
  /** Last branch reported by a workspace of this folder (`workspaces.reportBranch`); `null` = no git/unknown. */
  branch: string | null
}

export interface WorkspaceApi {
  /**
   * Folder of this window (`workspace:current`), already absolute: the one assigned by main when creating it (argv,
   * restoring the last session, Open Recent without a window) or the last one opened in it with `open`. `null` = empty
   * window. Reloading the window receives the same folder.
   */
  current(): Promise<string | null>
  /** Native folder picker dialog (`workspace:openFolder`); `null` if cancelled. Opens nothing. */
  openFolder(): Promise<string | null>
  /**
   * If `root` is already open in another window, focuses that window and returns `true` (`workspace:focusIfOpen`). Call
   * before asking about unsaved files: opening an already open folder does not change this window's one.
   */
  focusIfOpen(root: string): Promise<boolean>
  /**
   * Makes `root` this window's folder (`workspace:open`): starts watching it (one watcher per window; the previous one
   * is closed), puts it at the top of the recents and writes the window list for the next app launch. Returns `false`
   * (changing nothing) if another window has the folder; that window gets focused. A missing folder leaves the
   * recents and throws an error.
   */
  open(root: string): Promise<boolean>
  /**
   * Main asks this window to open a folder (`workspace:openRequested`), e.g. "File › Open Recent" in the native
   * menu. The renderer follows the same folder-picking flow (ask about unsaved files and call `open`).
   */
  onOpenRequested(cb: (root: string) => void): () => void
  onChange(cb: (change: WorkspaceChange) => void): () => void
}

export interface RecentApi {
  /**
   * Recently opened folders, the most recent first (`recent:list`). Shared by all windows.
   * Each one with `lastOpened` and the last branch.
   */
  list(): Promise<RecentFolder[]>
  /** Removes a folder from the list (`recent:remove`). */
  remove(path: string): Promise<void>
  /** Empties the list (`recent:clear`). */
  clear(): Promise<void>
  /** The list changed (`recent:changed`), in any window; sent to all. */
  onChange(cb: (folders: RecentFolder[]) => void): () => void
}
