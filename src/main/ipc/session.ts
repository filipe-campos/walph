import { app, type WebContents } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { WorkspaceSession } from '@shared/types'
import { AtomicWriter } from '../session/asyncWriter'
import { sanitizeSession, sessionFileName } from '../session/sessionFile'
import { matchOwnRoot } from '../window/ownRoot'
import { getSenderRoot } from '../window/windows'
import { handle, on } from './typed'
import { onViewDestroyed } from '../window/viewLifecycle'
import { isAbsolutePathInput } from '../fs/validate'

// Serial writes per file; whatever is pending is written synchronously when the view goes away and on quit.
const writer = new AtomicWriter()
const pathsBySender = new WeakMap<object, Set<string>>()

/** Synchronously writes any session still pending (`will-quit`). */
export function flushSessionsSync(): void {
  writer.flushSync()
}

const sessionPath = (root: string): string => join(app.getPath('userData'), 'sessions', sessionFileName(root))

async function load(root: unknown): Promise<WorkspaceSession | null> {
  if (!isAbsolutePathInput(root)) return null
  try {
    // A write still on its way (reload, reactivation after hibernating) must be on disk before the read.
    writer.flushSync(sessionPath(root))
    return sanitizeSession(JSON.parse(await readFile(sessionPath(root), 'utf8')))
  } catch {
    // Missing or corrupt: opens as a new folder.
    return null
  }
}

export function registerSessionHandlers(): void {
  handle('session:load', (_e, root: unknown) => load(root))

  // Normal = asynchronous (every 400 ms of typing). The final `beforeunload` save comes through the same channel: the
  // destroyed view (close, hibernation, quit) flushes the pending one synchronously (`flushSync`).
  on('session:save', (e, root: unknown, session: unknown) => {
    if (!isAbsolutePathInput(root)) return
    // Only the window owning the folder writes its session (otherwise another window could overwrite this project's).
    if (matchOwnRoot(getSenderRoot(e.sender), root) === null) return
    const clean = sanitizeSession(session)
    if (!clean) return
    const path = sessionPath(root)
    writer.write(path, clean)
    let paths = pathsBySender.get(e.sender)
    if (!paths) pathsBySender.set(e.sender, (paths = new Set()))
    paths.add(path)
    const sender: WebContents = e.sender
    onViewDestroyed(sender, 'session-flush', () => {
      for (const p of pathsBySender.get(sender) ?? []) writer.flushSync(p)
    })
  })
}
