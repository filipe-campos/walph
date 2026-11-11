import { app } from 'electron'
import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createLog } from '../log'
import { getRecent } from '../recent/store'
import { readSavedWindows } from '../window/windowsPersistence'
import { allHosts } from '../window/windowState'
import { isSessionStale, planSessionPrune, type SessionFileInfo } from './prune'

const log = createLog('session')

// Gives `walph <dir>` and the second-instance hand-offs time to open their folders before deciding what is forgotten.
const PRUNE_DELAY_MS = 30_000

export function schedulePruneSessions(): void {
  setTimeout(() => void pruneSessions(), PRUNE_DELAY_MS).unref()
}

function liveRoots(): string[] {
  return allHosts().flatMap((h) => h.workspaces.flatMap((ws) => (ws.root ? [ws.root] : [])))
}

/** Deletes old sessions of forgotten folders. They are app state (not user files): plain `rm`, no trash. */
async function pruneSessions(): Promise<void> {
  try {
    const dir = join(app.getPath('userData'), 'sessions')
    const files: SessionFileInfo[] = []
    for (const name of await readdir(dir)) {
      try {
        files.push({ name, mtimeMs: (await stat(join(dir, name))).mtimeMs })
      } catch {
        // Vanished in the middle of the scan.
      }
    }
    const windows = readSavedWindows().flatMap((w) => w.workspaces.flatMap((ws) => (ws.root ? [ws.root] : [])))
    const recent = getRecent().map((f) => f.path)
    for (const name of planSessionPrune(files, recent, windows, liveRoots(), Date.now())) {
      try {
        // `session:save` may have rewritten the file after the scan.
        if (!isSessionStale((await stat(join(dir, name))).mtimeMs, Date.now())) continue
        await rm(join(dir, name), { force: true })
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') log.warn('Could not delete', name, err)
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') log.warn('Session cleanup failed:', err)
  }
}
