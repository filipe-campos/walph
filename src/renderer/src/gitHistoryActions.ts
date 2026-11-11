import type { GitCommitFile } from '@shared/types'
import { t } from '@shared/i18n'
import { createLatest } from './lib/latest'
import { get, set, onRootChange } from './store'
import type { StashAction } from './types/quickInput'
import { attempt } from './attempt'
import { createReactionScope } from './lib/reactions'
import { notify } from './toasts'
import { showPicker } from './quickInputActions'
import { showView } from './layoutActions'
import { requestOnce } from './requests'
import { requireRepo } from './gitRepo'

const api = window.api

const HISTORY_PAGE = 50

// ----- Stash -----

// Sequence of the list reads: an answer older than one already applied does not overwrite the newer one.
let stashSeq = 0
// Highest sequence applied: an answer only counts if newer (a newer pending or failed one does not invalidate it).
let stashApplied = 0
// Stash picker openings: only the latest one opens.
const stashPickerSeq = createLatest()

export async function refreshStashes(): Promise<void> {
  const { root } = get()
  if (!root) return
  const seq = ++stashSeq
  try {
    const stashes = await api.git.stashList(root)
    if (get().root !== root || seq < stashApplied) return
    stashApplied = seq
    if (JSON.stringify(stashes) !== JSON.stringify(get().stashes)) set({ stashes })
  } catch {
    // The list is secondary: the real error shows up in the status.
  }
}

export function openStashMessagePicker(): void {
  if (!requireRepo()) return
  showPicker('stashMessage')
}

/** Stash picker to apply / pop / drop. */
export async function openStashPicker(stashAction: StashAction): Promise<void> {
  const root = requireRepo()
  if (!root) return
  const seq = ++stashSeq
  const pickerSeq = stashPickerSeq.next()
  const stale = (): boolean => get().root !== root || !stashPickerSeq.isCurrent(pickerSeq)
  const list = await attempt(
    async () => {
      const stashes = await api.git.stashList(root)
      if (stale()) return null
      // A newer refresh already applied has a fresher list: do not overwrite it (the picker uses its own answer).
      if (seq > stashApplied) {
        stashApplied = seq
        set({ stashes })
      }
      return stashes
    },
    { format: (message) => t().git.actions.stashError(message), fallback: null, quiet: stale }
  )
  if (!list) return
  if (list.length === 0) return notify(t().git.actions.noStashes, 'info')
  showPicker('stashPick', {}, stashAction)
}

// ----- History -----

const historySeq = createLatest()

/** Loads the first history page, or the next one (`more`). */
export async function loadHistory(more = false): Promise<void> {
  const { root, gitHistory } = get()
  if (!root) return
  if (more && (!gitHistory || !gitHistory.hasMore || gitHistory.loading)) return
  const seq = historySeq.next()
  const skip = more && gitHistory ? gitHistory.commits.length : 0
  set((s) => ({
    gitHistory: { commits: s.gitHistory?.commits ?? [], hasMore: s.gitHistory?.hasMore ?? false, loading: true }
  }))
  const stale = (): boolean => !historySeq.isCurrent(seq) || get().root !== root
  await attempt(
    async () => {
      const page = await api.git.log(root, skip, HISTORY_PAGE)
      if (stale()) return
      set((s) => ({
        gitHistory: {
          commits: more ? [...(s.gitHistory?.commits ?? []), ...page.commits] : page.commits,
          hasMore: page.hasMore,
          loading: false
        }
      }))
    },
    {
      format: (message) => t().git.history.error(message),
      quiet: stale,
      onError: () => {
        if (!stale()) set((s) => ({ gitHistory: s.gitHistory && { ...s.gitHistory, loading: false } }))
      }
    }
  )
}

// A commit's files never change: reopening the row does not repeat the IPC. Bounded and cleared on folder switch.
const COMMIT_FILES_CACHE_MAX = 100
const commitFilesCache = new Map<string, Promise<GitCommitFile[]>>()

/** Files changed by a commit of the open folder (cached read; a failure is not cached). */
export function loadCommitFiles(hash: string): Promise<GitCommitFile[]> {
  const { root } = get()
  if (!root) return Promise.resolve([])
  const hit = commitFilesCache.get(hash)
  if (hit) return hit
  const files = api.git.commitFiles(root, hash)
  commitFilesCache.set(hash, files)
  files.catch(() => commitFilesCache.get(hash) === files && commitFilesCache.delete(hash))
  if (commitFilesCache.size > COMMIT_FILES_CACHE_MAX) {
    commitFilesCache.delete(commitFilesCache.keys().next().value as string)
  }
  return files
}

/** With the history open, reloads it if HEAD changed (commit, amend, undo, checkout, pull…). */
export async function syncHistory(): Promise<void> {
  const { root, historyOpen, gitHistory } = get()
  if (!root || !historyOpen || gitHistory?.loading) return
  // Section open without data (folder switched, repository just created): load the first page.
  if (!gitHistory) {
    if (get().git?.isRepo) void loadHistory()
    return
  }
  const before = gitHistory.commits[0]?.hash
  try {
    const page = await api.git.log(root, 0, HISTORY_PAGE)
    const current = get()
    if (current.root !== root || current.gitHistory?.loading || current.gitHistory?.commits[0]?.hash !== before) return
    if (page.commits[0]?.hash === before) return
    historySeq.invalidate()
    set({ gitHistory: { commits: page.commits, hasMore: page.hasMore, loading: false } })
  } catch {
    // Silent failure: the next refresh tries again.
  }
}

export function toggleHistory(open?: boolean): void {
  const next = open ?? !get().historyOpen
  set({ historyOpen: next })
  if (next) void loadHistory()
}

/** "Show History": opens Git, expands the section and scrolls it into view. */
export function showHistory(): void {
  if (!requireRepo()) return
  showView('git')
  requestOnce('historyScroll')
  toggleHistory(true)
}

/** Click on the status bar's last commit: opens Git and expands that commit in the history. */
export function showCommitInHistory(hash: string): void {
  if (!requireRepo()) return
  showView('git')
  requestOnce('historyReveal', { hash })
  requestOnce('historyScroll')
  toggleHistory(true)
}

/** A commit's files belong to the open folder: switching folders clears the cache. */
export function startGitHistoryReactions(): () => void {
  const scope = createReactionScope()
  scope.add(onRootChange(() => commitFilesCache.clear()))
  return scope.stop
}
