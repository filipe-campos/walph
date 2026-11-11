import type { LineRange } from '../hunkSelection'
import type { TextEncoding } from './fs'

export interface GitFileStatus {
  /** Absolute path */
  path: string
  /** Status in the index (staged), e.g. 'M', 'A', 'D', 'R', '?' */
  index: string
  /** Status in the working tree, e.g. 'M', 'D', '?' */
  workingDir: string
}

export interface GitStatus {
  isRepo: boolean
  repoRoot: string | null
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  files: GitFileStatus[]
  /**
   * Absolute paths ignored by git (`.gitignore`), in the window folder path space. Directories come collapsed
   * (`…/node_modules`, no trailing `/`): everything below them is ignored too. Repo without git → `[]`.
   */
  ignored: string[]
  /** Merge/rebase/cherry-pick/revert stopped waiting for the user (conflicts); absent when there is none. */
  operation?: GitRepoOperation
}

export type GitRepoOperation = 'merge' | 'rebase' | 'cherryPick' | 'revert'

/** `OURS`/`THEIRS`: the two versions of a conflicted file (index stages 2 and 3). */
export type GitRef = 'HEAD' | 'INDEX' | 'OURS' | 'THEIRS'

export interface GitBlameCommit {
  hash: string
  author: string
  email: string
  /** Author date (epoch in ms). */
  date: number
  /** First line of the message. */
  summary: string
  /** Lines not committed yet (all-zero hash). */
  uncommitted: boolean
}

export interface GitBlame {
  commits: GitBlameCommit[]
  /** Per file line (the 1st is index 0): index into `commits`, or `-1` if git did not annotate it. */
  lines: number[]
}

export interface GitBranch {
  /** Short name: `main` (local) or `origin/main` (remote). */
  name: string
  remote: boolean
  /** It is the branch HEAD is on (always `false` for remotes). */
  current: boolean
  /** Upstream of a local branch (`origin/main`), or `null`. */
  upstream: string | null
  /** Abbreviated hash of the tip commit. */
  shortHash: string
  /** Date of the tip commit (epoch in ms), to sort by recency. */
  date: number
}

export interface GitCommit {
  hash: string
  shortHash: string
  author: string
  email: string
  /** Author date (epoch in ms); the renderer formats it as a relative date. */
  date: number
  /** First line of the message. */
  subject: string
  /** Full hashes of the parents (empty in the root commit). */
  parents: string[]
}

export interface GitLogPage {
  commits: GitCommit[]
  /** There are more commits after this page. */
  hasMore: boolean
}

export interface GitCommitFile {
  /** Absolute path in the commit. */
  path: string
  /** Absolute source path when `status` is `R`/`C`. */
  oldPath?: string
  /** Letter from `git show --name-status`: 'A', 'M', 'D', 'R', 'C', 'T'. */
  status: string
}

export interface GitCommitDiff {
  /** Content in the first parent (empty if the file did not exist or the commit is the root). */
  original: string
  /** Content in the commit (empty if the file was removed). */
  modified: string
}

export interface GitStash {
  /** Position in the stack: 0 = `stash@{0}` (the most recent). */
  index: number
  /** Hash of the stash commit: checks that `stash@{index}` is still this one (the stack may have changed outside). */
  hash: string
  message: string
  /** Epoch in ms. */
  date: number
}

export interface GitCommitOptions {
  /** `git commit --amend`: replaces the last commit (allows an empty stage, just to change the message). */
  amend?: boolean
}

export interface GitPushOptions {
  /** Publishes the current branch without upstream: `push -u <remote> <branch>` (`origin`, or the only remote). */
  setUpstream?: boolean
}

/** Network operation in progress, for the progress indicator. */
export type GitNetworkOp = 'pull' | 'push' | 'sync'

/** Result of `git.checkCloneUrl`: validation from `src/main/git/cloneUrl.ts`. */
export type CloneUrlCheck =
  /** `name` = folder the clone will create inside the chosen folder (derived from the URL). */
  | { ok: true; name: string }
  /** Translated `error` (`t()`), ready to show. */
  | { ok: false; error: string }

/** Progress of the view's `git clone` (`git:cloneProgress`), read from the `--progress` stderr. */
export interface GitCloneProgress {
  url: string
  /** Folder being created (absolute). */
  destination: string
  /** Translated stage (`t()`) ("Receiving objects", "Resolving deltas"…); "Connecting" before the first line. */
  stage: string
  /** 0–100 of the current stage, `null` when git does not report it. */
  percent: number | null
}

/**
 * Every call receives `root` = window folder (main rejects any other). Paths are absolute and must be inside the
 * repository. Thrown errors already carry a translated message (`t()`) (authentication, conflict, dirty tree…).
 */
export interface GitApi {
  status(root: string): Promise<GitStatus>
  init(root: string): Promise<void>
  stage(root: string, paths: string[]): Promise<void>
  unstage(root: string, paths: string[]): Promise<void>
  commit(root: string, message: string, options?: GitCommitOptions): Promise<void>
  /**
   * Full message of the last commit (`null` without commits), to fill the box when enabling "Amend". With
   * `hash`, the message of that commit (the bar tooltip asks for the one of the commit it shows, not the current HEAD).
   */
  lastCommitMessage(root: string, hash?: string): Promise<string | null>
  /**
   * "Undo Last Commit": `reset --soft HEAD~1` (in the root commit, deletes the ref and keeps everything in the index).
   * Returns the message of the undone commit to put back in the commit box.
   */
  undoLastCommit(root: string): Promise<string>
  /**
   * Discards the working tree changes of these files (back to the index content; with nothing staged, the HEAD one).
   * Untracked ones go to the trash. Confirmation is the renderer's responsibility.
   */
  discard(root: string, paths: string[]): Promise<void>
  /** Local ones (the current first) and remote ones (without `origin/HEAD`). */
  branches(root: string): Promise<GitBranch[]>
  /**
   * Switches branch (`git switch`). Remote (`origin/feat`): switches to the local one with the same name if it exists,
   * otherwise creates it tracking the remote. Fails with a clear message if local changes prevent the switch.
   */
  checkout(root: string, name: string, remote: boolean): Promise<void>
  /** Creates the branch from the current HEAD and switches to it (`switch -c`). Invalid/existing name → error. */
  createBranch(root: string, name: string): Promise<void>
  /** Paginated `git log` of the current branch (`skip`/`limit`, log order). Repository without commits → empty page. */
  log(root: string, skip: number, limit: number): Promise<GitLogPage>
  /** Files changed in the commit relative to the first parent (to empty, in the root commit). */
  commitFiles(root: string, hash: string): Promise<GitCommitFile[]>
  /** Before/after of a commit file (follows `oldPath` across renames). */
  commitDiff(root: string, hash: string, file: GitCommitFile): Promise<GitCommitDiff>
  stashList(root: string): Promise<GitStash[]>
  /** `stash push --include-untracked` (with `-m` if there is a message). No changes → clear error. */
  stashSave(root: string, message?: string): Promise<void>
  /** `index`/`hash` come from `stashList`; if `stash@{index}` is no longer `hash`, fails without touching anything. */
  stashApply(root: string, index: number, hash: string): Promise<void>
  /** Applies and removes (`stash pop`); on conflict the stash is kept and the error says so. */
  stashPop(root: string, index: number, hash: string): Promise<void>
  stashDrop(root: string, index: number, hash: string): Promise<void>
  /** `pull --ff-only`. Authentication error → message pointing to the integrated terminal. */
  pull(root: string): Promise<string>
  /** `push` (or `push -u` with `setUpstream`). No upstream and no `setUpstream` → error. */
  push(root: string, options?: GitPushOptions): Promise<string>
  /** Pull followed by push of the current branch (requires upstream). */
  sync(root: string): Promise<string>
  /**
   * File content in HEAD/index, decoded by the BOM. `encoding` forces the decoding (tab with an encoding chosen by
   * the user, e.g. Windows-1252), so the diff compares texts decoded the same way.
   */
  show(root: string, path: string, ref: GitRef, encoding?: TextEncoding): Promise<string>
  /**
   * File content in the index, base of the gutter indicators; `null` if the file is not in the index (untracked,
   * ignored, outside a repository). `encoding` as in `show`.
   */
  baseline(root: string, path: string, encoding?: TextEncoding): Promise<string | null>
  /**
   * Stages only the changes in the selected working tree lines (as they are on disk): builds an index patch for the
   * new content and applies it with `git apply --cached`. A file outside the index or removed goes whole (`stage`).
   */
  stageRanges(root: string, path: string, ranges: LineRange[]): Promise<void>
  /** Unstages only the changes in the selected index lines (they go back to the HEAD content). */
  unstageRanges(root: string, path: string, ranges: LineRange[]): Promise<void>
  /**
   * `git blame` of the file. With `contents` (the unsaved buffer, with the file's EOL), annotates that text starting
   * from HEAD. `null` outside a repository or for a file without history (untracked, no commits).
   */
  blame(root: string, path: string, contents?: string): Promise<GitBlame | null>
  /** Aborts the merge/rebase/cherry-pick/revert in progress (`git merge --abort`…). No operation → error. */
  abortOperation(root: string): Promise<void>
  /** Validates the clone URL without running anything (`git:checkCloneUrl`), so QuickInput shows the error/folder. */
  checkCloneUrl(url: string): Promise<CloneUrlCheck>
  /**
   * Clones a repository (`git:clone`): validates the URL (invalid URL → error with a translated message (`t()`), no
   * dialog), shows the native dialog for the folder to clone into and runs
   * `git clone --progress -- <url> <folder>/<name>`. Progress through `onCloneProgress`. Returns the created folder, or
   * `null` if the dialog was cancelled or the clone was cancelled (`cancelClone`, which kills git and deletes the
   * partial folder). One clone per view; the process belongs to the view (closing or reloading kills it and deletes
   * the partial one). Existing destination, network, credentials → error with a translated message (`t()`). Does not
   * open the folder.
   */
  clone(url: string): Promise<string | null>
  /** Cancels this view's clone in progress (no effect if there is none). */
  cancelClone(): void
  onCloneProgress(cb: (progress: GitCloneProgress) => void): () => void
}
