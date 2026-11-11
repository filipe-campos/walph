// Login shell PATH: an app opened from Finder/Dock inherits a minimal PATH (/usr/bin:/bin…) and git, node, docker and
// Claude's Bash would not be found. Used by startup (`env/loginPath.ts`), by Claude and by docker.

import { basename, delimiter } from 'node:path'
import { spawnGroup } from '../process/spawnGroup'

const START = '__WALPH_PATH_START__'
const END = '__WALPH_PATH_END__'
const LOGIN_SHELLS = new Set(['bash', 'zsh', 'fish', 'sh', 'ksh'])
const LOGIN_TIMEOUT_MS = 5000
/** A failure (timeout, broken rc) may be transient: the retry runs in the background, doubling the wait up to a cap. */
const RETRY_BASE_MS = 60_000
const RETRY_MAX_MS = 30 * 60_000
const MAX_STDOUT = 1024 * 1024

/** Value between the markers (the shell rc may print garbage before/after); `null` if not found. */
export function extractMarkedPath(stdout: string): string | null {
  const start = stdout.lastIndexOf(START)
  if (start === -1) return null
  const from = start + START.length
  const end = stdout.indexOf(END, from)
  if (end === -1) return null
  const value = stdout.slice(from, end).trim()
  return value === '' ? null : value
}

/** Login PATH first, then the missing entries of the current PATH (without repeats). */
export function mergePaths(login: string | null, current: string | undefined, delimiter: string): string {
  const seen = new Set<string>()
  const result: string[] = []
  for (const part of [...(login ?? '').split(delimiter), ...(current ?? '').split(delimiter)]) {
    if (part === '' || seen.has(part)) continue
    seen.add(part)
    result.push(part)
  }
  return result.join(delimiter)
}

/** Final PATH of child processes: the login shell one (`loginPath`) first, then the inherited one. */
export async function effectivePath(loginPath: () => Promise<string | null> = () => loginShellPath()): Promise<string> {
  return mergePaths(await loginPath(), process.env.PATH, delimiter)
}

interface Entry {
  /** Resolves the first attempt; callers arriving after a failure do not wait for it. */
  first: Promise<string | null>
  path: string | null
  failures: number
  nextRetryAt: number
  retrying: boolean
}

// One cache per shell: `$SHELL` may change between calls (docker/Claude use the environment one, startup may fall back
// to the account shell) and one shell's PATH does not apply to another. Only success is kept forever.
const cached = new Map<string, Entry>()

/** Injectable `spawnGroup` so tests do not start a real interactive shell. */
export type SpawnLike = typeof spawnGroup

function probe(shell: string, spawner: SpawnLike): Promise<string | null> {
  return new Promise<string | null>((done) => {
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    // `-i` to also read .zshrc/.bashrc (many people export PATH there); `command printenv` works in fish too.
    const script = `printf '%s' ${START}; command printenv PATH; printf '%s' ${END}`
    let stdout = ''
    let settled = false
    let timer: NodeJS.Timeout | undefined
    const finish = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      done(extractMarkedPath(stdout))
    }
    try {
      const proc = spawner(shell, ['-ilc', script], { env, stdio: ['pipe', 'pipe', 'ignore'] })
      timer = setTimeout(() => proc.kill(), LOGIN_TIMEOUT_MS)
      proc.child.stdout?.setEncoding('utf8')
      proc.child.stdout?.on('data', (chunk: string) => {
        if (stdout.length < MAX_STDOUT) stdout += chunk
      })
      proc.child.once('close', finish)
      proc.child.once('error', finish)
      proc.child.stdin?.on('error', () => undefined)
      proc.child.stdin?.end()
    } catch {
      finish()
    }
  })
}

function recordFailure(entry: Entry): void {
  entry.failures += 1
  entry.nextRetryAt = Date.now() + Math.min(RETRY_BASE_MS * 2 ** (entry.failures - 1), RETRY_MAX_MS)
}

/**
 * PATH exported by the user's interactive login shell (`$SHELL -ilc`), resolved once per shell. Only macOS/Linux and
 * known shells; any failure/timeout returns `null` (the inherited PATH applies). After a failure the calls answer
 * `null` right away and the new attempt runs in the background (one at a time, with a 60 s backoff doubling up to
 * 30 min): the caller never waits the 5 s timeout again. The shell is a group leader: the timeout takes along what the
 * rc left behind. Never uses `shell: true`.
 */
export function loginShellPath(
  platform: string = process.platform,
  shell: string | undefined = process.env.SHELL,
  spawner: SpawnLike = spawnGroup
): Promise<string | null> {
  if (platform === 'win32' || !shell || !LOGIN_SHELLS.has(basename(shell))) return Promise.resolve(null)
  const hit = cached.get(shell)
  if (!hit) {
    const entry: Entry = { first: Promise.resolve(null), path: null, failures: 0, nextRetryAt: 0, retrying: true }
    entry.first = probe(shell, spawner).then((path) => {
      entry.retrying = false
      if (path === null) recordFailure(entry)
      else entry.path = path
      return path
    })
    cached.set(shell, entry)
    return entry.first
  }
  if (hit.path !== null) return Promise.resolve(hit.path)
  if (hit.retrying) return hit.first
  if (Date.now() >= hit.nextRetryAt) {
    hit.retrying = true
    void probe(shell, spawner).then((path) => {
      hit.retrying = false
      if (path === null) recordFailure(hit)
      else hit.path = path
    })
  }
  return Promise.resolve(null)
}

/** Tests only. */
export function resetLoginPathCache(): void {
  cached.clear()
}
