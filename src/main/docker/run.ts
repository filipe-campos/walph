import type { WebContents } from 'electron'
import { t } from '@shared/i18n'
import { runCollect } from '../process/runCollect'
import { spawnGroup, type GroupProcess } from '../process/spawnGroup'
import { getEffectiveSettings } from '../settings/state'
import { createViewRegistry } from '../window/viewResources'
import { DockerError, classifyDockerFailure, type DockerFailure } from './errors'
import { resolveDockerSpec, type DockerSpec } from './executable'
import { UserError } from '../errors'

const QUICK_TIMEOUT_MS = 15_000
export const ACTION_TIMEOUT_MS = 120_000
export const COMPOSE_TIMEOUT_MS = 10 * 60_000
const MAX_BUFFER = 16 * 1024 * 1024
const MAX_STDERR_TAIL = 256 * 1024

// Single-run commands in progress: they die with the view (not even a 10-minute `compose up` survives a reload)
// and block hibernation. `wasCancelled` tells the reset apart from the deadline or a docker failure.
const oneShots = createViewRegistry<GroupProcess>({ key: 'docker:oneShots', dispose: (proc) => void proc.kill() })

export function hasRunningCommand(sender: WebContents): boolean {
  return oneShots.has(sender)
}

/** Docker process: leader of its own group on POSIX (`kill(-pid)` takes the children), in the `will-quit` registry. */
export function spawnLive(spec: DockerSpec, args: string[], cwd?: string): GroupProcess {
  return spawnGroup(spec.file, args, { env: spec.env, cwd, stdio: ['ignore', 'pipe', 'pipe'] })
}

export async function specFor(sender: WebContents): Promise<DockerSpec> {
  try {
    return await resolveDockerSpec(getEffectiveSettings(sender)['docker.path'])
  } catch (err) {
    throw new DockerError(classifyDockerFailure(err as DockerFailure), { cause: err })
  }
}

export interface RunOptions {
  timeout?: number
  cwd?: string
  /** Compose prints progress to stderr: the error cause is the last line with "error". */
  lastErrorLine?: boolean
  /**
   * Process shared between views (the `psCache` `ps`): it belongs to none, so a reload/close of whoever started it
   * does not kill it (the other views wait for the same result). Still bounded by the deadline and by `will-quit`.
   */
  shared?: boolean
}

function lastErrorLine(stderr: string): string {
  const lines = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
  return [...lines].reverse().find((l) => /error/i.test(l)) ?? lines[lines.length - 1] ?? ''
}

/**
 * Single-run command. Runs through the live process registry (own group on POSIX): the timeout kills the whole group
 * (including `docker compose` and its children, even with `up -d`) and so does `will-quit`. Errors become
 * `DockerError` (reason + translated message).
 */
export async function run(
  sender: WebContents,
  args: string[],
  options: RunOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  const assertAlive = oneShots.guardEpoch(sender)
  const spec = await specFor(sender)
  // The view reloaded/closed while the executable was being resolved: the reset already ran and would not see this
  // process.
  if (!options.shared) assertAlive(() => new UserError(t().containers.errors.cancelled))
  const result = await runCollect(spec.file, args, {
    env: spec.env,
    cwd: options.cwd,
    group: true,
    timeout: options.timeout ?? QUICK_TIMEOUT_MS,
    // Output cut silently would become truncated JSON (or an incomplete list): exceeding the limit is a failure.
    maxBuffer: MAX_BUFFER,
    // Verbose compose/build may write a lot to stderr: only the tail matters (`lastErrorLine`), never a failure.
    maxStderr: MAX_STDERR_TAIL,
    owner: options.shared ? undefined : oneShots.scope(sender)
  })
  if (result.cancelled) throw new UserError(t().containers.errors.cancelled)
  const { spawnError, timedOut, overflow, stderr } = result
  if (!spawnError && !timedOut && !overflow && result.code === 0) return { stdout: result.stdout, stderr }
  throw new DockerError(
    classifyDockerFailure({
      code: spawnError ? (spawnError as NodeJS.ErrnoException).code : undefined,
      killed: timedOut,
      overflow,
      stderr: options.lastErrorLine ? lastErrorLine(stderr) : stderr,
      message: spawnError?.message
    })
  )
}
