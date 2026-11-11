// Whoever knows a view cannot be unloaded now (Claude busy, a process in the terminal, a clone…) registers here.
// It is a leaf on purpose: `ipc/*` registers without `windows.ts` having to import them (avoids cycles).

import type { WebContents } from 'electron'
import { createLog } from '../log'

const log = createLog('view')

/** Why the view cannot be unloaded. Only for diagnostics and tests: never shown to the user. */
type EvictionReason =
  | 'unsaved'
  | 'closing'
  | 'unresponsive'
  | 'pendingRequest'
  | 'openingFolder'
  | 'clone'
  | 'gitOperation'
  | 'terminalProcess'
  | 'claudeBusy'
  | 'claudeScheduled'
  | 'dockerCommand'
  | 'guardFailed'

/** Returns the reason to keep the view loaded, or `null` if it can hibernate. */
export type EvictionGuard = (wc: WebContents) => EvictionReason | null

const guards = new Map<string, EvictionGuard>()

export function registerEvictionGuard(name: string, guard: EvictionGuard): void {
  guards.set(name, guard)
}

/** First reason not to unload the view, or `null`. A guard that throws counts as "keep" (conservative). */
export function evictionBlocker(wc: WebContents): EvictionReason | null {
  for (const [name, guard] of guards) {
    try {
      const reason = guard(wc)
      if (reason) return reason
    } catch (err) {
      log.error(`Unload guard "${name}" failed:`, err)
      return 'guardFailed'
    }
  }
  return null
}
