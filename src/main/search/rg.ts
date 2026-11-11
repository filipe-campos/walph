// ripgrep execution shared by the file list (`ipc/files.ts`) and the search (`ipc/search.ts`): base arguments,
// stderr cap and reading the exit codes.

import { runCollect, type CollectResult, type ProcessOwner } from '../process/runCollect'
import { RG } from './rgPath'

/**
 * `--no-config` ignores the user's ~/.ripgreprc (e.g. `--no-ignore-vcs` would list node_modules or change what is
 * searched); `.git` never gets in, even with `--hidden`.
 */
const BASE_ARGS = ['--no-config', '--hidden', '--glob=!.git']

/** A root like ~ produces thousands of "Permission denied": only the start of stderr explains the error. */
const STDERR_LIMIT = 8192

type RgOutcome =
  /** Exit 0 or 1 (no results), or a stop requested by the caller. */
  | 'ok'
  | 'cancelled'
  | 'spawnError'
  /** Killed by a signal without being asked (OOM, app exit): the result is partial. */
  | 'interrupted'
  /** Exit 2: rg may have produced part of the result before the error (e.g. invalid regex). */
  | 'error'

export interface RgRunOptions {
  cwd: string
  owner?: ProcessOwner
  /** Text output as it arrives; `stop()` ends rg (the result counts as `ok`). */
  onStdout: (chunk: string, stop: () => void) => void
  /** Tests only: another executable in place of ripgrep. */
  binary?: string
}

export interface RgResult extends CollectResult {
  outcome: RgOutcome
}

/** Runs rg with the base arguments before `args`; `args` ends with `--` and what comes after it. */
export async function runRg(args: string[], { cwd, owner, onStdout, binary = RG }: RgRunOptions): Promise<RgResult> {
  let stopped = false
  const result = await runCollect(binary, [...BASE_ARGS, ...args], {
    cwd,
    owner,
    group: true,
    maxStderr: STDERR_LIMIT,
    stderrKeep: 'head',
    onStdout: (chunk, stop) =>
      onStdout(chunk, () => {
        stopped = true
        stop()
      })
  })
  return { ...result, outcome: rgOutcome(result, stopped) }
}

function rgOutcome(result: CollectResult, stopped: boolean): RgOutcome {
  if (result.spawnError) return 'spawnError'
  if (result.cancelled) return 'cancelled'
  if (stopped) return 'ok'
  if (result.code === null) return 'interrupted'
  return result.code === 2 ? 'error' : 'ok'
}

/** Translated message of the spawn error: each screen passes the texts of its own domain. */
export function describeRgSpawnError(
  err: Error,
  messages: { notFound: string; noPermission: string; failed(detail: string): string }
): string {
  const code = (err as NodeJS.ErrnoException).code
  if (code === 'ENOENT') return messages.notFound
  if (code === 'EACCES') return messages.noPermission
  return messages.failed(err.message)
}
