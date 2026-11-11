// Hibernation policy (pure): decides which workspaces with a loaded view go back to dormant. No electron: the
// controller (`hibernationController.ts`) builds the candidates and executes what is chosen.

export interface HibernationCandidate {
  id: string
  /** Has a loaded view (dormant ones neither count nor are candidates). */
  live: boolean
  /** Active workspace of some window: never hibernates. */
  active: boolean
  /** Last time it was active (ms). */
  lastActiveAt: number
  /** Something prevents unloading now (dirty file, Claude busy, a process in the terminal…). */
  keep: boolean
}

export interface HibernationLimits {
  /** 0 = no limit. */
  maxLive: number
  /** 0 = never due to inactivity. */
  idleMs: number
}

/**
 * Ids to hibernate: first those idle for longer than `idleMs`; then, if there are still more live views than `maxLive`,
 * the least recent ones (LRU). Active and protected (`keep`) ones never enter, even if the limit is not met because of
 * them.
 */
export function pickEvictions(
  candidates: readonly HibernationCandidate[],
  limits: HibernationLimits,
  now: number
): string[] {
  const live = candidates.filter((c) => c.live)
  const eligible = live.filter((c) => !c.active && !c.keep).sort((a, b) => a.lastActiveAt - b.lastActiveAt)
  const chosen = new Set<string>()
  if (limits.idleMs > 0) {
    for (const c of eligible) if (now - c.lastActiveAt >= limits.idleMs) chosen.add(c.id)
  }
  if (limits.maxLive > 0) {
    let count = live.length - chosen.size
    for (const c of eligible) {
      if (count <= limits.maxLive) break
      if (chosen.has(c.id)) continue
      chosen.add(c.id)
      count--
    }
  }
  return eligible.filter((c) => chosen.has(c.id)).map((c) => c.id)
}
