// Workspace hibernation (executes the `hibernation.ts` policy): background views go back to dormant when they exceed
// the limit (`workspaces.maxLiveViews`, after each activation) or stay idle (`workspaces.hibernateAfterMinutes`,
// checked by a coarse timer). Whatever is busy or dirty is protected by the guards of `evictionGuards.ts`.

import type { WebContents } from 'electron'
import { getUserSettings } from '../settings/state'
import { evictionBlocker } from './evictionGuards'
import { pickEvictions, type HibernationCandidate } from './hibernation'
import { allHosts, hibernateWorkspace, isQuitFrozen, liveContents, onWorkspaceEvent, type Workspace } from './windows'
import { createLog } from '../log'

const log = createLog('hibernation')

const CHECK_INTERVAL_MS = 60_000

let timer: NodeJS.Timeout | null = null
let unsubscribe: (() => void) | null = null
let scheduled = false
let running = false
let rerun = false

function limits(): { maxLive: number; idleMs: number } {
  const settings = getUserSettings()
  return { maxLive: settings['workspaces.maxLiveViews'], idleMs: settings['workspaces.hibernateAfterMinutes'] * 60_000 }
}

function mustKeep(wc: WebContents): boolean {
  return wc.isCrashed() || wc.isLoading() || evictionBlocker(wc) !== null
}

async function enforce(): Promise<void> {
  if (isQuitFrozen()) return
  if (running) {
    // Activation during a round: runs again when it ends, with the current candidates.
    rerun = true
    return
  }
  running = true
  try {
    const byId = new Map<string, Workspace>()
    const candidates: HibernationCandidate[] = []
    for (const host of allHosts()) {
      if (host.closing) continue
      for (const ws of host.workspaces) {
        const wc = liveContents(ws)
        byId.set(`${host.win.id}:${ws.id}`, ws)
        candidates.push({
          id: `${host.win.id}:${ws.id}`,
          live: !!wc,
          active: host.activeId === ws.id,
          lastActiveAt: ws.lastActiveAt,
          keep: wc ? mustKeep(wc) : false
        })
      }
    }
    for (const id of pickEvictions(candidates, limits(), Date.now())) {
      if (isQuitFrozen()) break
      const ws = byId.get(id)
      if (ws) await hibernateWorkspace(ws).catch((err) => log.error('Could not hibernate the workspace:', err))
    }
  } finally {
    running = false
    if (rerun) {
      rerun = false
      void enforce()
    }
  }
}

function schedule(): void {
  if (scheduled) return
  scheduled = true
  // After the rest of the activation (view created, `workspaces:changed` sent).
  setImmediate(() => {
    scheduled = false
    void enforce()
  })
}

export function startHibernation(): void {
  if (timer) return
  unsubscribe = onWorkspaceEvent((event) => {
    if (event.type === 'activated' && !event.silent) schedule()
  })
  timer = setInterval(() => void enforce(), CHECK_INTERVAL_MS)
  timer.unref()
}

export function stopHibernation(): void {
  if (timer) clearInterval(timer)
  timer = null
  unsubscribe?.()
  unsubscribe = null
}
