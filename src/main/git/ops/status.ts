import type { WebContents } from 'electron'
import type { GitStatus } from '@shared/types'
import { isAbortedGit } from '../gitErrors'
import { ignoredPaths } from '../ignoredCache'
import { parseStatus } from '../parseStatus'
import { dropRepoTop, findRepoTop } from '../repoTop'
import { git } from '../run'
import { repoOperation } from './operation'
import { createSingleFlight } from '../singleFlight'

const NOT_A_REPO: GitStatus = {
  isRepo: false,
  repoRoot: null,
  branch: null,
  upstream: null,
  ahead: 0,
  behind: 0,
  ignored: [],
  files: []
}

async function statusOnce(root: string): Promise<GitStatus> {
  let repoRoot: string
  try {
    repoRoot = await findRepoTop(root)
  } catch {
    return NOT_A_REPO
  }

  const statusArgs = ['status', '--porcelain=v1', '-z', '--branch', '--untracked-files=all']
  let out: string
  // In parallel with the status: adds no latency (the promise never rejects).
  let ignored = ignoredPaths(root)
  const operation = repoOperation(root)
  try {
    out = await git(root, statusArgs)
  } catch (err) {
    // Deadline or cancellation: retrying would double the wait.
    if (isAbortedGit(err)) throw err
    // The cached root may be stale (the `.git` is gone): check again before reporting an error.
    dropRepoTop(root)
    try {
      repoRoot = await findRepoTop(root)
    } catch {
      return NOT_A_REPO
    }
    ignored = ignoredPaths(root)
    out = await git(root, statusArgs)
  }
  const op = await operation
  return { isRepo: true, repoRoot, ...parseStatus(out, repoRoot), ignored: await ignored, ...(op && { operation: op }) }
}

// One status at a time per view: refresh bursts (watcher + actions) become at most two runs.
const statusFlights = new WeakMap<WebContents, { root: string; call: () => Promise<GitStatus> }>()

export function status(sender: WebContents, root: string): Promise<GitStatus> {
  let flight = statusFlights.get(sender)
  if (!flight || flight.root !== root) {
    flight = { root, call: createSingleFlight(() => statusOnce(root)) }
    statusFlights.set(sender, flight)
  }
  return flight.call()
}
