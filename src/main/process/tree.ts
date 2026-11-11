import { execFile, spawnSync, type ChildProcess } from 'node:child_process'

/** `taskkill` arguments for one or more trees (`/T` walks the children; `/F` forces). */
function taskkillArgs(pids: number[], force: boolean): string[] {
  const args = pids.flatMap((pid) => ['/pid', String(pid)])
  args.push('/T')
  if (force) args.push('/F')
  return args
}

function taskkill(pids: number[], force: boolean, sync: boolean): void {
  const args = taskkillArgs(pids, force)
  if (sync) {
    try {
      spawnSync('taskkill', args, { windowsHide: true, timeout: 5000 })
    } catch {
      // already terminated
    }
  } else {
    execFile('taskkill', args, { windowsHide: true }, () => undefined)
  }
}

/**
 * Kills the process and everything it created (typescript-language-server creates tsserver, which creates others). Only
 * for a process STILL ALIVE (the `ChildProcess` has not emitted `exit` yet): on POSIX the server leads its own group
 * (`detached`) and `kill(-pid)` hits the whole group; on Windows `taskkill /T` walks the tree from the live parent.
 * `sync` only in `will-quit` (blocks main until taskkill finishes); outside it taskkill is asynchronous.
 */
export function killLiveTree(child: ChildProcess, sync = false): void {
  const pid = child.pid
  if (!pid) return
  if (process.platform === 'win32') {
    taskkill([pid], true, sync)
    return
  }
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    // The `ChildProcess` knows the real pid (no risk of a reused PID, unlike `process.kill(pid)`).
    child.kill('SIGKILL')
  }
}

/**
 * Synchronous `killLiveTree` of several live processes: on Windows a single `taskkill` for all (each call costs tens of
 * ms and blocks `will-quit`); on POSIX one `kill(-pid)` per group.
 */
export function killLiveTreesSync(children: ChildProcess[]): void {
  if (process.platform !== 'win32') {
    for (const child of children) killLiveTree(child, true)
    return
  }
  const pids = children.flatMap((child) => (child.pid ? [child.pid] : []))
  if (pids.length > 0) taskkill(pids, true, true)
}

/**
 * After the leader exited: sweeps the group to catch leftover children (POSIX only; the group only exists while some
 * member lives, so the pid cannot have been reused). On Windows there is no safe way to find orphans (the pid may
 * belong to another process), so it does nothing.
 */
export function sweepGroup(pid: number | undefined): void {
  if (!pid || process.platform === 'win32') return
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    // empty group
  }
}

/** Time a command holding a lock/state (git commit, switch) has to exit on its own before SIGKILL. */
const GRACE_MS = 4000

/**
 * Asks the tree to terminate without forcing (SIGTERM to the group; `taskkill /T` without `/F` on Windows): this lets
 * git delete `index.lock` and undo what was half done, which SIGKILL/`/F` never allow. Only for a live process.
 */
export function terminateLiveTree(child: ChildProcess, sync = false): void {
  const pid = child.pid
  if (!pid) return
  if (process.platform === 'win32') {
    taskkill([pid], false, sync)
    return
  }
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}

/** `terminateLiveTree` and, if the leader is still alive after `graceMs`, `killLiveTree`. */
export function killLiveTreeGracefully(child: ChildProcess, graceMs = GRACE_MS): void {
  terminateLiveTree(child)
  const timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) killLiveTree(child)
  }, graceMs)
  timer.unref()
  child.once('exit', () => clearTimeout(timer))
}
