import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'

/** Process of the pty session; `start` identifies the instance and avoids killing a reused pid. */
export interface SessionMember {
  pid: number
  start: string
}

/** What the shutdown needs from a pty (satisfied by `IPty`). */
export interface KillablePty {
  pid: number
  kill(): void
}

/** Process table row: `group` is the session id (Linux) or the controlling tty (macOS). */
interface ProcRow {
  pid: number
  group: string
  start: string
}

const PS_TIMEOUT_MS = 2000
const PS_MAX_BUFFER = 8 * 1024 * 1024
const PS_LINE = /^\s*(\d+)\s+(\S+)\s+(\w{3} \w{3} +\d{1,2} \d{2}:\d{2}:\d{2} \d{4})\s*$/
// Jobs that handle HUP exit within tens of ms; anything slower is stubborn and the quit cannot get stuck on it.
const QUIT_WAIT_MS = 1000
const QUIT_POLL_MS = 50

// `lstart` is localized by the locale; the parser only understands the C format.
const psEnv = (): NodeJS.ProcessEnv => ({ ...process.env, LC_ALL: 'C' })

export function ptsNameOf(term: object): string | null {
  const name = (term as { ptsName?: unknown }).ptsName
  return typeof name === 'string' && name.startsWith('/dev/') ? name.slice('/dev/'.length) : null
}

/** Fields 6 (session) and 22 (start) of `/proc/<pid>/stat`; `comm` is in parentheses and may contain `)`. */
export function parseLinuxStat(stat: string): { pid: number; session: number; start: string } | null {
  const open = stat.indexOf('(')
  const close = stat.lastIndexOf(')')
  if (open < 1 || close < open) return null
  const pid = Number(stat.slice(0, open).trim())
  const rest = stat
    .slice(close + 1)
    .trim()
    .split(/\s+/)
  const session = Number(rest[3])
  const start = rest[19]
  if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(session) || !start || !/^\d+$/.test(start)) return null
  return { pid, session, start }
}

/** Output of `ps -o pid=,tty=,lstart=` in the C locale: unreadable lines are dropped. */
export function parsePsTable(output: string): ProcRow[] {
  const rows: ProcRow[] = []
  for (const line of output.split('\n')) {
    const [, rawPid, group, start] = PS_LINE.exec(line) ?? []
    const pid = Number(rawPid)
    if (pid > 0 && group && start) rows.push({ pid, group, start: start.replace(/\s+/g, ' ') })
  }
  return rows
}

const isPidDir = (name: string): boolean => /^\d+$/.test(name)

function linuxRows(stats: Iterable<string>): ProcRow[] {
  const rows: ProcRow[] = []
  for (const stat of stats) {
    const parsed = parseLinuxStat(stat)
    if (parsed) rows.push({ pid: parsed.pid, group: String(parsed.session), start: parsed.start })
  }
  return rows
}

const psArgs = ['-A', '-o', 'pid=,tty=,lstart=']

function readRowsSync(): ProcRow[] {
  try {
    if (process.platform === 'linux') {
      const stats: string[] = []
      for (const name of readdirSync('/proc').filter(isPidDir)) {
        try {
          stats.push(readFileSync(`/proc/${name}/stat`, 'utf8'))
        } catch {
          // exited during the scan
        }
      }
      return linuxRows(stats)
    }
    if (process.platform !== 'darwin') return []
    const out = spawnSync('ps', psArgs, {
      encoding: 'utf8',
      timeout: PS_TIMEOUT_MS,
      maxBuffer: PS_MAX_BUFFER,
      windowsHide: true,
      env: psEnv()
    })
    return parsePsTable(out.stdout)
  } catch {
    return []
  }
}

/**
 * Members of the shell session (without the shell itself). Only valid if the shell appears in the table inside its own
 * group (Linux: session leader; macOS: with the pty tty), which rules out a reused pid or tty. Otherwise, empty list.
 */
export function sessionMembers(rows: ProcRow[], term: KillablePty, alive = canSignal): SessionMember[] {
  const shellPid = term.pid
  const group = process.platform === 'linux' ? String(shellPid) : ptsNameOf(term)
  if (!group || !rows.some((r) => r.pid === shellPid && r.group === group)) return []
  return rows
    .filter((r) => r.group === group && r.pid !== shellPid && alive(r.pid))
    .map(({ pid, start }) => ({ pid, start }))
}

/** Current start of the pids that still exist (same format as `SessionMember.start`). */
function readStarts(pids: number[]): Map<number, string> {
  const starts = new Map<number, string>()
  if (pids.length === 0) return starts
  try {
    if (process.platform === 'linux') {
      for (const pid of pids) {
        try {
          const parsed = parseLinuxStat(readFileSync(`/proc/${pid}/stat`, 'utf8'))
          if (parsed) starts.set(parsed.pid, parsed.start)
        } catch {
          // already exited
        }
      }
    } else {
      const out = spawnSync('ps', ['-p', pids.join(','), '-o', 'pid=,tty=,lstart='], {
        encoding: 'utf8',
        timeout: PS_TIMEOUT_MS,
        windowsHide: true,
        env: psEnv()
      })
      for (const r of parsePsTable(out.stdout)) starts.set(r.pid, r.start)
    }
  } catch {
    // without a reliable reading nobody is killed
  }
  return starts
}

// EPERM (a root process, for example) cannot be signaled: no point waiting or trying to kill it.
function canSignal(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Snapshot members still alive. */
export function liveMembers(members: SessionMember[], alive = canSignal): SessionMember[] {
  return members.filter((m) => alive(m.pid))
}

/** SIGKILL to live members whose start identity matches the snapshot; the rest already exited or is another process. */
export function killSurvivors(
  members: SessionMember[],
  deps: {
    alive?: (pid: number) => boolean
    starts?: (pids: number[]) => Map<number, string>
    kill?: typeof process.kill
  } = {}
): void {
  const survivors = liveMembers(members, deps.alive)
  if (survivors.length === 0) return
  const current = (deps.starts ?? readStarts)(survivors.map((m) => m.pid))
  const kill = deps.kill ?? process.kill.bind(process)
  for (const m of survivors) {
    if (current.get(m.pid) !== m.start) continue
    try {
      kill(m.pid, 'SIGKILL')
    } catch {
      // ESRCH: already exited
    }
  }
}

function safeKill(term: KillablePty): void {
  try {
    term.kill()
  } catch {
    // shell already terminated
  }
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * `will-quit` shutdown: snapshot of the sessions, SIGHUP to the shells, a wait of up to `waitMs` only if there are
 * members, and SIGKILL (with identity check) to the leftovers. Closing a terminal or resetting the view does NOT sweep
 * on purpose: a plain `kill()` preserves nohup/disown jobs, as in VS Code. On Windows (ConPTY) it is just `kill()`.
 */
export function killPtysSyncAndSweep(terms: KillablePty[], waitMs = QUIT_WAIT_MS): void {
  const rows = terms.length > 0 ? readRowsSync() : []
  const members = terms.flatMap((term) => sessionMembers(rows, term))
  for (const term of terms) safeKill(term)
  let alive = liveMembers(members)
  const deadline = Date.now() + waitMs
  while (alive.length > 0 && Date.now() < deadline) {
    sleepSync(QUIT_POLL_MS)
    alive = liveMembers(alive)
  }
  killSurvivors(alive)
}
