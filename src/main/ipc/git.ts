import { isRecord } from '@shared/guards'
import type { WebContents } from 'electron'
import { isTextEncoding } from '../fs/encoding'
import type { CloneUrlCheck, TextEncoding } from '@shared/types'
import { t } from '@shared/i18n'
import { cancelClone, clone, hasClone, validateCloneUrl } from '../git/clone'
import { branches, checkout, createBranch } from '../git/ops/branches'
import { commit, commitDiff, commitFiles, lastCommitMessage, log, undoLastCommit } from '../git/ops/history'
import { blame } from '../git/ops/blame'
import { abortOperation } from '../git/ops/operation'
import { stageRanges, unstageRanges } from '../git/ops/ranges'
import { stashList, stashOp, stashSave } from '../git/ops/stash'
import { status } from '../git/ops/status'
import { baseline, discard, init, show, stage, unstage } from '../git/ops/worktree'
import { pull, push, sync } from '../git/remote'
import { hasOwnedGit } from '../git/run'
import { assertOwnRoot } from '../window/ownRoot'
import { registerEvictionGuard } from '../window/evictionGuards'
import { handle, on } from './typed'

/** Forced encoding coming from the renderer: unknown value = detect by the BOM. */
function forcedEncoding(value: unknown): TextEncoding | undefined {
  return isTextEncoding(value) ? value : undefined
}

/** Only the window's own folder: the renderer does not choose which directory git runs in. */
function ownRoot(sender: WebContents, root: unknown): string {
  return assertOwnRoot(sender, root, t().git.errors.onlyOwnFolder)
}

export function registerGitHandlers(): void {
  // A running clone or git assigned to the view (pull/push, commit, switch…) belongs to it: hibernating would cancel
  // them.
  registerEvictionGuard('git', (wc) => {
    if (hasClone(wc)) return 'clone'
    if (hasOwnedGit(wc)) return 'gitOperation'
    return null
  })
  handle('git:status', (e, root: unknown) => status(e.sender, ownRoot(e.sender, root)))
  handle('git:init', (e, root: unknown) => init(e.sender, ownRoot(e.sender, root)))
  handle('git:stage', (e, root: unknown, paths: unknown) => stage(e.sender, ownRoot(e.sender, root), paths))
  handle('git:unstage', (e, root: unknown, paths: unknown) => unstage(e.sender, ownRoot(e.sender, root), paths))
  handle('git:commit', (e, root: unknown, message: unknown, options?: unknown) =>
    commit(e.sender, ownRoot(e.sender, root), message, options)
  )
  handle('git:lastCommitMessage', (e, root: unknown, hash?: unknown) =>
    lastCommitMessage(ownRoot(e.sender, root), hash)
  )
  handle('git:undoLastCommit', (e, root: unknown) => undoLastCommit(e.sender, ownRoot(e.sender, root)))
  handle('git:discard', (e, root: unknown, paths: unknown) => discard(e.sender, ownRoot(e.sender, root), paths))
  handle('git:branches', (e, root: unknown) => branches(ownRoot(e.sender, root)))
  handle('git:checkout', (e, root: unknown, name: unknown, remote: unknown) =>
    checkout(e.sender, ownRoot(e.sender, root), name, remote)
  )
  handle('git:createBranch', (e, root: unknown, name: unknown) => createBranch(e.sender, ownRoot(e.sender, root), name))
  handle('git:log', (e, root: unknown, skip: unknown, limit: unknown) => log(ownRoot(e.sender, root), skip, limit))
  handle('git:commitFiles', (e, root: unknown, hash: unknown) => commitFiles(ownRoot(e.sender, root), hash))
  handle('git:commitDiff', (e, root: unknown, hash: unknown, file: unknown) =>
    commitDiff(ownRoot(e.sender, root), hash, file)
  )
  handle('git:stashList', (e, root: unknown) => stashList(ownRoot(e.sender, root)))
  handle('git:stashSave', (e, root: unknown, message?: unknown) =>
    stashSave(e.sender, ownRoot(e.sender, root), message)
  )
  handle('git:stashApply', (e, root: unknown, index: unknown, hash: unknown) =>
    stashOp(e.sender, ownRoot(e.sender, root), 'apply', index, hash)
  )
  handle('git:stashPop', (e, root: unknown, index: unknown, hash: unknown) =>
    stashOp(e.sender, ownRoot(e.sender, root), 'pop', index, hash)
  )
  handle('git:stashDrop', (e, root: unknown, index: unknown, hash: unknown) =>
    stashOp(e.sender, ownRoot(e.sender, root), 'drop', index, hash)
  )
  handle('git:pull', (e, root: unknown) => pull(e.sender, ownRoot(e.sender, root)))
  handle('git:push', (e, root: unknown, options?: unknown) =>
    push(e.sender, ownRoot(e.sender, root), isRecord(options) && options.setUpstream === true)
  )
  handle('git:sync', (e, root: unknown) => sync(e.sender, ownRoot(e.sender, root)))
  handle('git:show', (e, root: unknown, path: unknown, ref: unknown, encoding?: unknown) =>
    show(ownRoot(e.sender, root), path, ref, forcedEncoding(encoding))
  )
  handle('git:baseline', (e, root: unknown, path: unknown, encoding?: unknown) =>
    baseline(ownRoot(e.sender, root), path, forcedEncoding(encoding))
  )
  handle('git:stageRanges', (e, root: unknown, path: unknown, ranges: unknown) =>
    stageRanges(e.sender, ownRoot(e.sender, root), path, ranges)
  )
  handle('git:unstageRanges', (e, root: unknown, path: unknown, ranges: unknown) =>
    unstageRanges(e.sender, ownRoot(e.sender, root), path, ranges)
  )
  handle('git:blame', (e, root: unknown, path: unknown, contents?: unknown) =>
    blame(ownRoot(e.sender, root), path, contents)
  )
  handle('git:abortOperation', (e, root: unknown) => abortOperation(e.sender, ownRoot(e.sender, root)))
  handle('git:checkCloneUrl', (_e, url: unknown): CloneUrlCheck => {
    const r = validateCloneUrl(url)
    return r.ok ? { ok: true, name: r.name } : r
  })
  handle('git:clone', (e, url: unknown) => clone(e.sender, url))
  on('git:cancelClone', (e) => cancelClone(e.sender))
}
