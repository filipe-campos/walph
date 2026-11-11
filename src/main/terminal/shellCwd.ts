import { readlink } from 'node:fs/promises'
import { runCollect } from '../process/runCollect'
import { cwdOrInitial } from './linkCandidates'
import { parseLsofCwd } from './linkPath'
import type { Terminal } from './registry'

const CWD_CACHE_MS = 1000

async function lsofCwd(pid: number): Promise<string | null> {
  const r = await runCollect('/usr/sbin/lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
    timeout: 1000,
    maxBuffer: 1024 * 1024
  })
  return r.spawnError || r.timedOut || r.overflow || r.code !== 0 ? null : parseLsofCwd(r.stdout)
}

/** Current shell directory, best effort. Caches the Promise for 1 s: hover calls this repeatedly and in parallel. */
export function shellCwd(t: Terminal, fresh = false): Promise<string> {
  const now = Date.now()
  if (!fresh && t.cwdCache && now - t.cwdCache.at < CWD_CACHE_MS) return t.cwdCache.cwd
  const read = async (): Promise<string> => {
    let cwd: string | null = null
    try {
      if (process.platform === 'linux') cwd = await readlink(`/proc/${t.term.pid}/cwd`)
      else if (process.platform === 'darwin') cwd = await lsofCwd(t.term.pid)
    } catch {
      cwd = null
    }
    return cwdOrInitial(cwd, t.initialCwd)
  }
  const cwd = read()
  t.cwdCache = { at: now, cwd }
  return cwd
}
