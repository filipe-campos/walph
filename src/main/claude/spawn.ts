// Claude Code processes the SDK starts (`spawnClaudeCodeProcess`). The process lifecycle (own group, `taskkill /T`,
// registry swept on `will-quit`) is `spawnGroup`'s; only the stderr tail and the notice to the conversation live here.

import type { ChildProcess } from 'node:child_process'
import type { SpawnedProcess, SpawnOptions } from '@anthropic-ai/claude-agent-sdk'
import { spawnGroup, type GroupProcess } from '../process/spawnGroup'
import { unpackedPath } from '../util/unpackedPath'

export interface ClaudeProcess {
  group: GroupProcess
  child: ChildProcess
  readonly exited: boolean
  /** stderr tail (to classify failures). */
  stderr: string
}

const STDERR_CAP = 8 * 1024

/**
 * Creates the `spawnClaudeCodeProcess` function of ONE conversation. `onSpawn` receives the process record (the
 * conversation uses it to shut down). stderr is read here: the SDK interface does not expose it.
 */
export function createClaudeSpawner(onSpawn: (proc: ClaudeProcess) => void) {
  return (options: SpawnOptions): SpawnedProcess => {
    const group = spawnGroup(unpackedPath(options.command), options.args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    const { child } = group
    const proc: ClaudeProcess = {
      group,
      child,
      get exited() {
        return group.exited
      },
      stderr: ''
    }
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      proc.stderr = (proc.stderr + chunk).slice(-STDERR_CAP)
    })
    // The signal only fires after the SDK graceful shutdown (EOF on stdin + deadline): if still alive, kill the tree.
    options.signal.addEventListener('abort', () => group.kill(), { once: true })
    onSpawn(proc)
    // `stdio: pipe` guarantees stdin/stdout, which the generic `spawnGroup` type does not express.
    return child as SpawnedProcess
  }
}

/** Kills the tree of a still-alive process. */
export function killProcess(proc: ClaudeProcess): void {
  proc.group.kill()
}
