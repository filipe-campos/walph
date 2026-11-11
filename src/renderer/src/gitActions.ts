import type { GitNetworkOp, GitStatus, GitFileStatus } from '@shared/types'
import type { LineRange } from '@shared/hunkSelection'
import { t } from '@shared/i18n'
import { sameGitStatus } from './lib/staleWork'
import { createLatest } from './lib/latest'
import { basename } from './lib/path'
import { trackPending } from './lib/pendingWork'
import { get, set, selectGitBusy } from './store'
import { attempt } from './attempt'
import { errorMessage } from './lib/errors'
import { createReactionScope } from './lib/reactions'
import { notify } from './toasts'
import { confirmDialog } from './saveActions'
import { closePickerIfOpen, showPicker, closeQuickInput } from './quickInputActions'
import { showView } from './layoutActions'
import { requestOnce } from './requests'
import { requireRepo } from './gitRepo'
import { refreshBaselines, startGitBaselineReactions } from './gitBaselineActions'
import { refreshStashes, startGitHistoryReactions, syncHistory } from './gitHistoryActions'
import { startGitBlameReactions } from './gitBlameActions'

const api = window.api

/** Pull/push/sync progress labels (status bar and Source Control), in the language of each read. */
export const GIT_OPERATION_LABELS: Readonly<Record<GitNetworkOp, string>> = {
  get pull() {
    return t().git.operation.pull
  },
  get push() {
    return t().git.operation.push
  },
  get sync() {
    return t().git.operation.sync
  }
}

// One refresh at a time: requests arriving during one become a single rerun at the end.
let gitInFlight: Promise<void> | null = null
let gitRerun = false
// Another `refreshGit` changes `gitRerun` during the `await`: read via a function, TS does not narrow it to `false`.
const rerunRequested = (): boolean => gitRerun

export function refreshGit(): Promise<void> {
  if (gitInFlight) {
    gitRerun = true
    return gitInFlight
  }
  const run = (async (): Promise<void> => {
    do {
      gitRerun = false
      await refreshGitOnce()
    } while (rerunRequested())
  })().finally(() => {
    gitInFlight = null
  })
  gitInFlight = trackPending('git', run)
  return gitInFlight
}

async function refreshGitOnce(): Promise<void> {
  const { root } = get()
  if (!root) return
  await attempt(
    async () => {
      const next = await api.git.status(root)
      if (get().root !== root) return
      // Structurally equal: keep the reference (Explorer, GitView and DiffEditor do not react to a no-op refresh).
      const git = sameGitStatus(get().git, next) ? get().git! : next
      set({ git, gitFailedRoot: null })
      if (git.isRepo) {
        void refreshStashes()
        void syncHistory()
        void refreshLastCommit(root)
      } else {
        lastCommitSeq.invalidate()
        set({ stashes: [], gitHistory: null, lastCommit: null })
      }
      void refreshBaselines()
    },
    {
      format: (message) => `Git: ${message}`,
      onError: () => {
        if (get().root === root && !get().git) set({ gitFailedRoot: root })
      }
    }
  )
}

const lastCommitSeq = createLatest()

/** Last commit for the status bar; the full message (tooltip) is only fetched when HEAD changes. */
async function refreshLastCommit(root: string): Promise<void> {
  const seq = lastCommitSeq.next()
  const stale = (): boolean => !lastCommitSeq.isCurrent(seq) || get().root !== root
  try {
    const commit = (await api.git.log(root, 0, 1)).commits[0]
    if (stale()) return
    if (!commit) return void set({ lastCommit: null })
    // Same HEAD with the message already loaded: nothing to update (avoids redrawing the bar on every watcher event).
    const previous = get().lastCommit
    if (previous?.hash === commit.hash && previous.message !== null) return
    const { hash, shortHash, author, date, subject } = commit
    if (previous?.hash !== hash) set({ lastCommit: { hash, shortHash, author, date, subject, message: null } })
    const message = await api.git.lastCommitMessage(root, hash).catch(() => null)
    if (stale()) return
    set((s) => (s.lastCommit?.hash === hash ? { lastCommit: { ...s.lastCommit, message } } : s))
  } catch {
    // Repository without commits (or git unavailable): the bar simply does not show the item.
    if (!stale()) set({ lastCommit: null })
  }
}

let gitTimer: ReturnType<typeof setTimeout> | null = null
let gitTimerDelay = 0
export const INACTIVE_GIT_REFRESH_MS = 3000
export function scheduleGitRefresh(delay = 300): void {
  // An active (fast) request beats an inactive (slow) one already scheduled, but not the other way around.
  if (gitTimer) {
    if (delay > gitTimerDelay) return
    clearTimeout(gitTimer)
  }
  gitTimerDelay = delay
  gitTimer = setTimeout(() => {
    gitTimer = null
    void refreshGit()
  }, delay)
}

/** Runs a local git operation (buttons disabled while it runs) and refreshes the status. `null` = failed/busy. */
async function withGit<T>(fn: (root: string) => Promise<T>): Promise<{ value: T } | null> {
  const { root } = get()
  if (!root || selectGitBusy(get())) return null
  set({ gitBusy: true })
  try {
    return await attempt(
      async () => {
        const value = await fn(root)
        // The folder changed meanwhile: the result does not apply to the new one (e.g. clearing its commit box).
        return get().root === root ? { value } : null
      },
      { fallback: null, quiet: () => get().root !== root }
    )
  } finally {
    set({ gitBusy: false })
    await refreshGit()
  }
}

async function runGit(fn: (root: string) => Promise<unknown>, success?: string): Promise<boolean> {
  const done = await withGit(fn)
  if (done && success) notify(success, 'info')
  return !!done
}

export const initRepository = (): Promise<boolean> => runGit((r) => api.git.init(r))
export const stageFiles = (paths: string[]): Promise<boolean> => runGit((r) => api.git.stage(r, paths))
export const unstageFiles = (paths: string[]): Promise<boolean> => runGit((r) => api.git.unstage(r, paths))
export const stageFileRanges = (path: string, ranges: LineRange[]): Promise<boolean> =>
  runGit((r) => api.git.stageRanges(r, path, ranges))
export const unstageFileRanges = (path: string, ranges: LineRange[]): Promise<boolean> =>
  runGit((r) => api.git.unstageRanges(r, path, ranges))

/** "Abort Merge" (or rebase, cherry-pick, revert in progress), always confirming. */
export async function abortGitOperation(): Promise<boolean> {
  const operation = get().git?.operation
  if (!requireRepo() || !operation || selectGitBusy(get())) return false
  const m = t().git.merge
  const confirmed = await confirmDialog({
    message: m.abortConfirm[operation],
    detail: m.abortDetail,
    confirmLabel: m.abort[operation],
    destructive: true
  })
  if (!confirmed) return false
  return runGit((r) => api.git.abortOperation(r), m.aborted)
}

// ----- Network: pull / push / sync -----

async function runNetwork(op: GitNetworkOp, fn: (root: string) => Promise<unknown>, done?: string): Promise<boolean> {
  const { root } = get()
  if (!root || selectGitBusy(get())) return false
  set({ gitOperation: op, gitOperationRoot: root })
  try {
    return await attempt(
      async () => {
        await fn(root)
        if (get().root === root) notify(done ?? t().git.done[op], 'info')
        return true
      },
      { fallback: false, quiet: () => get().root !== root }
    )
  } finally {
    // Only clear what is ours: another folder may have started its own operation meanwhile.
    if (get().gitOperationRoot === root) set({ gitOperation: null, gitOperationRoot: null })
    await refreshGit()
  }
}

export async function pullChanges(): Promise<boolean> {
  if (!requireRepo()) return false
  return runNetwork('pull', (r) => api.git.pull(r))
}

/** Without an upstream, offers to publish the branch (`push -u origin <branch>`). */
async function publishBranch(): Promise<boolean> {
  if (!requireRepo() || selectGitBusy(get())) return false
  const branch = get().git?.branch
  if (!branch) {
    notify(t().git.actions.noBranchToPublish)
    return false
  }
  const m = t().git.actions
  const confirmed = await confirmDialog({
    message: m.publishConfirm(branch),
    detail: m.publishDetail(branch),
    confirmLabel: m.publish
  })
  if (!confirmed) return false
  return runNetwork('push', (r) => api.git.push(r, { setUpstream: true }), t().git.actions.published(branch))
}

export async function pushChanges(): Promise<boolean> {
  if (!requireRepo()) return false
  if (!get().git?.upstream) return publishBranch()
  return runNetwork('push', (r) => api.git.push(r))
}

export async function syncChanges(): Promise<boolean> {
  if (!requireRepo()) return false
  if (!get().git?.upstream) return publishBranch()
  return runNetwork('sync', (r) => api.git.sync(r))
}

// ----- Branches -----

/** Opens the branch picker (clicking the status bar branch, `git.checkout`). */
export function openBranchPicker(): void {
  if (closePickerIfOpen('branch')) return
  const root = requireRepo()
  if (!root) return
  const session = showPicker('branch', { gitBranches: null })
  // Only valid for the picker (and folder) that asked: another opening or a folder switch discards the answer.
  const current = (): boolean => get().root === root && get().quickInput?.session === session
  api.git
    .branches(root)
    .then((branches) => {
      if (current()) set({ gitBranches: branches })
    })
    .catch((err) => {
      if (get().root === root) notify(errorMessage(err))
      if (current()) closeQuickInput()
    })
}

/** Asks for the new branch name (created from the current one). */
export function openCreateBranchPicker(): void {
  if (!requireRepo()) return
  showPicker('createBranch')
}

export async function checkoutBranch(name: string, remote: boolean): Promise<boolean> {
  const ok = await runGit((r) => api.git.checkout(r, name, remote))
  return ok
}

export function createBranch(name: string): Promise<boolean> {
  return runGit((r) => api.git.createBranch(r, name.trim()), t().git.actions.branchCreated(name.trim()))
}

// ----- Commit -----

export function setCommitMessage(commitMessage: string): void {
  set({ commitMessage })
}

// Message that "Amend" put in the box: turning Amend off without editing it removes it again.
let amendPrefill: string | null = null

export function setCommitAmend(on: boolean): void {
  const { root, commitMessage } = get()
  set({ commitAmend: on })
  if (!on) {
    if (amendPrefill !== null && commitMessage === amendPrefill) set({ commitMessage: '' })
    amendPrefill = null
    return
  }
  if (!root || commitMessage.trim()) return
  void attempt(async () => {
    const message = await api.git.lastCommitMessage(root)
    const s = get()
    if (s.root !== root || !s.commitAmend || s.commitMessage.trim() || !message) return
    amendPrefill = message
    set({ commitMessage: message })
  })
}

/** "Commit (Amend)": shows Git with Amend on and focus in the message box. */
export function startAmend(): void {
  if (!requireRepo()) return
  showView('git')
  setCommitAmend(true)
  requestOnce('commitFocus')
}

export async function commitChanges(): Promise<boolean> {
  const { commitMessage, commitAmend, git } = get()
  const message = commitMessage.trim()
  const staged = (git?.files ?? []).filter((f) => f.index !== ' ' && f.index !== '?')
  if (!message || (!commitAmend && staged.length === 0)) return false
  const ok = await runGit(
    (r) => api.git.commit(r, message, commitAmend ? { amend: true } : undefined),
    commitAmend ? t().git.actions.amended : undefined
  )
  if (ok) {
    amendPrefill = null
    // Only clear the box if the user did not type something else during the commit.
    set((s) =>
      s.commitMessage.trim() === message ? { commitMessage: '', commitAmend: false } : { commitAmend: false }
    )
  }
  return ok
}

/** "Undo Last Commit" (`reset --soft HEAD~1`): the changes go back to the stage and the message to the commit box. */
export async function undoLastCommit(): Promise<boolean> {
  if (!requireRepo()) return false
  const done = await withGit((r) => api.git.undoLastCommit(r))
  if (!done) return false
  showView('git')
  // A draft already typed beats the message of the undone commit.
  if (get().commitMessage.trim()) notify(t().git.actions.undoneKeptDraft, 'info')
  else {
    set({ commitMessage: done.value })
    notify(t().git.actions.undoneRestoredMessage, 'info')
  }
  return true
}

// ----- Discard -----

/** Files with changes in the working tree (the ones "Discard" affects). */
const workingChanges = (git: GitStatus | null): GitFileStatus[] =>
  (git?.files ?? []).filter((f) => f.workingDir !== ' ')

/** Discards the working tree changes of these files, always confirming (destructive action). */
export async function discardChanges(files: GitFileStatus[]): Promise<boolean> {
  if (files.length === 0) {
    notify(t().git.actions.nothingToDiscard, 'info')
    return false
  }
  const root = requireRepo()
  if (!root || selectGitBusy(get())) return false
  const untracked = files.filter((f) => f.workingDir === '?')
  const m = t().git.actions
  const notes = [m.cannotBeUndone]
  if (untracked.length > 0) notes.push(m.untrackedToTrash(untracked.length))
  const [only] = files
  const confirmed = await confirmDialog({
    message: only && files.length === 1 ? m.discardConfirmOne(basename(only.path)) : m.discardConfirmMany(files.length),
    detail: notes.join(' '),
    confirmLabel: m.discard,
    destructive: true
  })
  if (!confirmed) return false
  return runGit((r) =>
    api.git.discard(
      r,
      files.map((f) => f.path)
    )
  )
}

export function discardAll(): Promise<boolean> {
  return discardChanges(workingChanges(get().git))
}

// ----- Stash -----

export function stashSave(message?: string): Promise<boolean> {
  const text = message?.trim()
  return runGit((r) => api.git.stashSave(r, text === '' ? undefined : text), t().git.actions.stashSaved)
}

export function stashApply(index: number, hash: string): Promise<boolean> {
  return runGit((r) => api.git.stashApply(r, index, hash), t().git.actions.stashApplied)
}

export function stashPop(index: number, hash: string): Promise<boolean> {
  return runGit((r) => api.git.stashPop(r, index, hash), t().git.actions.stashPopped)
}

export async function stashDrop(index: number, hash: string): Promise<boolean> {
  if (!requireRepo() || selectGitBusy(get())) return false
  const stash = get().stashes.find((s) => s.index === index)
  const m = t().git.actions
  const confirmed = await confirmDialog({
    message: stash?.message ? m.stashDropConfirm(stash.message) : m.stashDropConfirmRef(`stash@{${index}}`),
    detail: m.cannotBeUndone,
    confirmLabel: m.stashDrop,
    destructive: true
  })
  if (!confirmed) return false
  return runGit((r) => api.git.stashDrop(r, index, hash), t().git.actions.stashDropped)
}

export function startGitReactions(): () => void {
  const scope = createReactionScope()
  scope.add(startGitHistoryReactions())
  scope.add(startGitBaselineReactions())
  scope.add(startGitBlameReactions())
  return scope.stop
}
