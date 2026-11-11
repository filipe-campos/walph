import type { WebContents } from 'electron'
import { rmSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { GitCloneProgress } from '@shared/types'
import { cloneStartStep, parseCloneProgressLine, sameStep, splitProgressChunk } from './cloneProgress'
import { resolveCloneUrl, type CloneUrlResolved } from './cloneUrl'
import { classifyGitError } from './gitErrors'
import { t } from '@shared/i18n'
import { networkEnv } from './run'
import { pickFolder } from '../window/nativeUi'
import { send } from '../window/send'
import { spawnGroup, type GroupProcess } from '../process/spawnGroup'
import { hiddenWindows } from '../window/hiddenMode'
import { createViewRegistry } from '../window/viewResources'
import { createLog } from '../log'
import { UserError } from '../errors'

const log = createLog('clone')

interface CloneJob {
  /** `null` while the folder dialog is open or git has not started yet. */
  proc: GroupProcess | null
  /** Folder created by this clone (`null` until the `mkdir` succeeds). */
  destination: string | null
  /** The `clone()` flow finished (the `finally` already removed the job from the registry). */
  finished: boolean
}

// One clone per view. No timeout: the user cancels (`git:cancelClone`) and a reloaded or dead view kills the
// process. On reset the job goes back to the registry until the `finally` of its flow: a new clone into the same
// folder stays blocked (`inProgress`) while the old flow may still delete its partial folder.
const CURRENT = 'current'
const clones = createViewRegistry<CloneJob>({
  key: 'git:clone',
  dispose: (job, { wc }) => {
    job.proc?.kill()
    removePartialCloneSync(job.destination)
    if (!job.finished) clones.add(wc, CURRENT, job)
  },
  disposeSync: (jobs) => {
    for (const job of jobs) {
      job.proc?.kill(true)
      // Synchronous: on `will-quit` the app exits before the async removal of the process `close`.
      removePartialCloneSync(job.destination)
    }
  }
})

export function hasClone(owner: WebContents): boolean {
  return clones.has(owner)
}

/** Cancels every clone in progress and removes the partial folders (app exit). */
export function killAllClones(): void {
  clones.disposeAllSync()
}

export function cancelClone(owner: WebContents): void {
  const job = clones.get(owner, CURRENT)
  if (!job) return
  clones.markCancelled(job)
  job.proc?.kill()
}

export function validateCloneUrl(url: unknown): CloneUrlResolved {
  // `file://` only in tests (unpackaged app with WALPH_HIDDEN_WINDOWS=1).
  return resolveCloneUrl(typeof url === 'string' ? url : '', { allowFile: hiddenWindows })
}

/** Deletes the folder THIS clone created (the `mkdir` without `recursive` guarantees it did not exist before). */
async function removePartialClone(destination: string): Promise<void> {
  try {
    await rm(destination, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch (err) {
    log.error('Could not delete the partial clone:', err)
  }
}

/**
 * Synchronous version, used on app exit / destroyed view. It is the only exception to "deletes go to the trash": the
 * folder was created by this clone (mkdir without `recursive`), it is never user content, and the trash would keep
 * partial garbage.
 */
function removePartialCloneSync(destination: string | null): void {
  if (!destination) return
  try {
    rmSync(destination, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  } catch (err) {
    log.error('Could not delete the partial clone:', err)
  }
}

export async function clone(sender: WebContents, rawUrl: unknown): Promise<string | null> {
  const check = validateCloneUrl(rawUrl)
  if (!check.ok) throw new UserError(check.error)
  // URL normalized (lowercase scheme) by main: the renderer only knows the `name`.
  const url = check.url
  if (clones.has(sender)) throw new UserError(t().git.clone.inProgress)

  // Reserves the slot right away: the dialog is async and a second request cannot get through it.
  const job: CloneJob = { proc: null, destination: null, finished: false }
  clones.add(sender, CURRENT, job)
  try {
    const parent = await pickFolder(sender, { title: t().git.clone.pickTitle, buttonLabel: t().git.clone.pickButton })
    if (!parent || clones.wasCancelled(job) || sender.isDestroyed()) return null

    const destination = join(parent, check.name)
    try {
      // No `recursive`: fails if it already exists, so everything we delete later was created by us.
      await mkdir(destination)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new UserError(t().git.clone.folderExists(check.name, parent), { cause: err })
      }
      throw new UserError(t().git.clone.mkdirFailed(check.name, parent, (err as Error).message), { cause: err })
    }
    job.destination = destination
    try {
      return await runClone(sender, job, url, parent, destination)
    } catch (err) {
      await removePartialClone(destination)
      throw err
    }
  } finally {
    job.finished = true
    clones.delete(sender, CURRENT, job)
  }
}

async function runClone(
  sender: WebContents,
  job: CloneJob,
  url: string,
  parent: string,
  destination: string
): Promise<string | null> {
  const emit = (step: Pick<GitCloneProgress, 'stage' | 'percent'>): void => {
    send(sender, 'git:cloneProgress', { url, destination, ...step } satisfies GitCloneProgress)
  }
  emit(cloneStartStep())

  const env = await networkEnv(parent, true)
  // Only the transports we accept (also applies to redirects).
  env.GIT_ALLOW_PROTOCOL = hiddenWindows ? 'https:ssh:file' : 'https:ssh'
  if (clones.wasCancelled(job) || sender.isDestroyed()) {
    await removePartialClone(destination)
    return null
  }

  return new Promise<string | null>((resolvePromise, reject) => {
    // POSIX: leader of its own group, to also kill ssh/git-remote-https/index-pack.
    const group = spawnGroup('git', ['clone', '--progress', '--', url, destination], {
      cwd: parent,
      env,
      stdio: ['ignore', 'ignore', 'pipe']
    })
    const proc = group.child
    job.proc = group
    let pending = ''
    let tail = ''
    let last: Pick<GitCloneProgress, 'stage' | 'percent'> | null = cloneStartStep()
    let settled = false

    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      job.proc = null
      fn()
    }

    proc.stderr?.setEncoding('utf8')
    proc.stderr?.on('data', (chunk: string) => {
      // Only the end of stderr matters for the error message.
      tail = (tail + chunk).slice(-8192)
      const { lines, rest } = splitProgressChunk(pending, chunk)
      pending = rest
      for (const line of lines) {
        const step = parseCloneProgressLine(line)
        if (!step || sameStep(last, step)) continue
        last = step
        emit(step)
      }
    })
    proc.once('error', (err) =>
      finish(() => {
        const missing = (err as NodeJS.ErrnoException).code === 'ENOENT'
        reject(new UserError(missing ? t().git.clone.gitNotFound : t().git.clone.spawnFailed(err.message)))
      })
    )
    proc.once('close', (code) => {
      finish(() => {
        if (clones.wasCancelled(job)) {
          void removePartialClone(destination).then(() => resolvePromise(null))
        } else if (code === 0) {
          resolvePromise(destination)
        } else {
          reject(new UserError(classifyGitError(tail, 'clone')))
        }
      })
    })
  })
}
