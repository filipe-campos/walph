// Spawn of a long process or one that creates children (network git, docker, clone): leader of its own group on POSIX
// (`detached`), so `kill(-pid)` takes ssh/git-remote-https/compose along; a global registry that `will-quit` sweeps;
// when the leader exits, the group is swept for leftover children. LSP and Claude are also born here; their policy
// (restart, shutdown handshake, SDK) stays in their modules.

import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { killLiveTree, killLiveTreeGracefully, killLiveTreesSync, sweepGroup, terminateLiveTree } from './tree'

export interface GroupProcess {
  child: ChildProcess
  /** `true` after `exit` (or a spawn error): from then on the pid may be reused, never kill by it. */
  readonly exited: boolean
  /** Created with `graceful`: the `will-quit` `kill(true)` sends SIGTERM instead of SIGKILL (see `spawnGroup`). */
  readonly graceful: boolean
  /** Resolves when the process exited or never existed (spawn error); never rejects. */
  readonly closed: Promise<void>
  /** Kills the tree of a process still alive (no-op after `exit`). `sync` only in `will-quit`. */
  kill(sync?: boolean): void
  /** Gentle shutdown: SIGTERM/`taskkill /T` and, if the leader does not exit within `graceMs`, SIGKILL/`/F`. */
  terminate(graceMs?: number): void
}

/** Each live process and the function claiming it for `will-quit` (false if it exited or was killed synchronously). */
const live = new Map<GroupProcess, () => boolean>()

export function spawnGroup(
  file: string,
  args: string[],
  {
    graceful = false,
    ...options
  }: Omit<SpawnOptions, 'detached' | 'shell' | 'windowsHide'> & { graceful?: boolean } = {}
): GroupProcess {
  const child = spawn(file, args, { ...options, detached: process.platform !== 'win32', windowsHide: true })
  let exited = false
  let markClosed!: () => void
  const closed = new Promise<void>((resolve) => (markClosed = resolve))
  // `will-quit` sweeps the global registry and then git: a second `kill(true)` would be another sync Windows taskkill.
  let killedSync = false
  const proc: GroupProcess = {
    child,
    get exited() {
      return exited
    },
    graceful,
    closed,
    kill(sync = false) {
      if (exited || killedSync || child.exitCode !== null || child.signalCode !== null) return
      if (sync) killedSync = true
      // In `will-quit` the grace period cannot be awaited: a `graceful` process (git holding `index.lock`) gets
      // SIGTERM, which it handles by deleting the lock; the others, SIGKILL.
      if (sync && graceful) terminateLiveTree(child, true)
      else killLiveTree(child, sync)
    },
    terminate(graceMs) {
      if (exited || killedSync || child.exitCode !== null || child.signalCode !== null) return
      killLiveTreeGracefully(child, graceMs)
    }
  }
  live.set(proc, () => {
    if (exited || killedSync || child.exitCode !== null || child.signalCode !== null) return false
    killedSync = true
    return true
  })
  child.once('exit', () => {
    exited = true
    live.delete(proc)
    markClosed()
    // The leader exited: the group only exists while some child lives, so the pid was not reused.
    sweepGroup(child.pid)
  })
  // ENOENT/EACCES: there is no `exit`. Without a listener `error` would crash main; the caller also listens to its own.
  child.once('error', () => {
    if (child.pid !== undefined) return // kill/ipc error with the process alive: `exit` still comes
    exited = true
    live.delete(proc)
    markClosed()
  })
  return proc
}

/** `will-quit`: sync kill of every live group process, of any owner; on Windows the forced ones share a `taskkill`. */
export function killAllSpawnedGroups(): void {
  const forced: ChildProcess[] = []
  for (const [proc, claim] of [...live]) {
    if (!claim()) continue
    if (proc.graceful) terminateLiveTree(proc.child, true)
    else forced.push(proc.child)
  }
  live.clear()
  killLiveTreesSync(forced)
}
