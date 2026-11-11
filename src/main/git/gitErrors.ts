import { t } from '@shared/i18n'
import { UserError } from '../errors'

/** Operation in progress, for messages that depend on the context. */
export type GitErrorContext = 'stashPop' | 'stashApply' | 'pull' | 'push' | 'clone'

const AUTH_PATTERNS = [
  /authentication failed/i,
  /could not read (username|password)/i,
  /terminal prompts disabled/i,
  /permission denied \((publickey|keyboard-interactive|password)/i,
  /host key verification failed/i,
  /http basic: access denied/i,
  /returned error: 40[13]/i,
  /invalid username or password/i,
  /repository not found/i
]

const NETWORK_PATTERNS = [
  /could not resolve host/i,
  /network is unreachable/i,
  /connection (timed out|refused|reset)/i,
  /operation timed out/i,
  /failed to connect to/i,
  /unable to access '?https?:/i,
  /could not read from remote repository/i
]

/**
 * Failure of a git command. `stderr` is the raw output (the `message` is already the classified and translated
 * version, in which a file name may have matched another pattern). `aborted`: deadline exceeded or cancellation,
 * never a git answer.
 */
export class GitCommandError extends UserError {
  constructor(
    message: string,
    readonly stderr = '',
    readonly aborted = false
  ) {
    super(message)
  }
}

/** Deadline or cancellation: whoever has "try again in the catch" must not retry (it would double the wait). */
export function isAbortedGit(err: unknown): boolean {
  return err instanceof GitCommandError && err.aborted
}

/** `git show` failure because the path does not exist in the ref, decided by git's raw output. */
export function isPathNotInRefError(err: unknown): boolean {
  return err instanceof GitCommandError && isPathNotInRef(err.stderr)
}

/**
 * Translates git's error output (in English: the process runs with `LC_ALL=C`) into a clear message in the current
 * language. Without a known pattern returns git's original text.
 */
export function classifyGitError(raw: string, context?: GitErrorContext): string {
  const text = raw.trim()
  const has = (re: RegExp): boolean => re.test(text)
  const m = t().git.errors

  if (context === 'clone') return classifyCloneError(text)
  if (AUTH_PATTERNS.some(has)) return m.auth
  if (has(/conflict|automatic merge failed/i) && (context === 'stashPop' || context === 'stashApply')) {
    return context === 'stashPop' ? m.stashPopConflict : m.stashApplyConflict
  }
  if (has(/no local changes to save/i)) return m.nothingToStash
  if (has(/no stash entries found|is not a valid reference|stash@\{\d+\} is not/i)) {
    return m.stashNotFound
  }
  if (has(/you do not have the initial commit yet/i)) return m.noInitialCommit
  if (
    has(/would be overwritten by (checkout|merge)/i) ||
    has(/please commit your changes or stash them/i) ||
    has(/your local changes to the following files/i) ||
    has(/untracked working tree files would be overwritten/i)
  ) {
    return m.wouldOverwrite
  }
  if (has(/not possible to fast-forward|divergent branches/i)) {
    return m.diverged
  }
  if (has(/non-fast-forward|\[rejected\]|updates were rejected|failed to push some refs/i)) {
    return m.pushRejected
  }
  if (has(/no upstream|no tracking information|no upstream configured/i)) {
    return m.noUpstream
  }
  if (has(/src refspec .* does not match any/i)) return m.nothingToPush
  if (has(/no such remote|does not appear to be a git repository|no configured push destination/i)) {
    return m.invalidRemote
  }
  if (NETWORK_PATTERNS.some(has)) return m.network
  if (has(/already exists/i) && has(/branch/i)) return m.branchExists
  if (has(/not a valid branch name|not a valid ref/i)) return m.invalidBranchName
  if (has(/nothing (added )?to commit|no changes added to commit/i)) return m.nothingToCommit
  if (has(/author identity unknown|please tell me who you are/i)) {
    return m.noIdentity
  }
  if (has(/another git process seems to be running|index\.lock/i)) {
    return m.indexLock
  }
  return text
}

const CLONE_NOT_FOUND_PATTERNS = [
  /repository not found/i,
  /does not appear to be a git repository/i,
  /returned error: 404/i,
  /repository '.*' not found/i
]

/** Clone: a missing repository and a private one without credentials look the same to the user. */
function classifyCloneError(text: string): string {
  const has = (re: RegExp): boolean => re.test(text)
  const m = t().git.errors
  if (has(/already exists and is not an empty directory/i)) return m.cloneTargetExists
  // "Repository not found" also shows up on authentication failure (GitHub answers like this for a private repository).
  if (CLONE_NOT_FOUND_PATTERNS.some(has)) {
    return m.cloneNotFound
  }
  if (AUTH_PATTERNS.some(has)) return m.auth
  if (NETWORK_PATTERNS.some(has)) return m.network
  // No pattern: git's last real line (without the "fatal: ") gives the reason.
  const last = text
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter((l) => l && !/^cloning into /i.test(l) && !/:\s+\d{1,3}%/.test(l))
    .pop()
  return last ? m.cloneFailed(last.replace(/^(fatal|error):\s*/i, '')) : m.cloneFailedGeneric
}

const PATH_NOT_IN_REF_PATTERNS = [
  /path '.*' exists on disk, but not in/i,
  /path '.*' does not exist (in|\()/i,
  /path '.*' is in the index, but not at stage/i,
  /invalid object name 'HEAD'/i
]

/** `git show <ref>:<path>` failed only because the path does not exist in that ref (new, untracked, no commits). */
export function isPathNotInRef(raw: string): boolean {
  return PATH_NOT_IN_REF_PATTERNS.some((re) => re.test(raw))
}
