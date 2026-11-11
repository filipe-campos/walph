// Pure choices about the debug sessions: which session the toolbar and the commands control and which frame to show.
import type { DebugSessionInfo, DebugStackFrame } from '@shared/types'

/**
 * Focused session: the one of the last `stopped` while alive; else the leaf (session without children) created last.
 * Parents created by js-debug (`startDebugging`) almost never have threads: acting on them would do nothing.
 */
export function chooseFocusedSession(sessions: readonly DebugSessionInfo[], lastStopped: string | null): string | null {
  if (lastStopped && sessions.some((s) => s.id === lastStopped)) return lastStopped
  const parents = new Set(sessions.map((s) => s.parentId).filter((id): id is string => id !== null))
  const leaves = sessions.filter((s) => !parents.has(s.id))
  return (leaves.at(-1) ?? sessions.at(-1))?.id ?? null
}

/** Root of the session tree: stop/restart apply to the whole tree. */
export function rootSessionOf(sessions: readonly DebugSessionInfo[], id: string): string {
  let current = sessions.find((s) => s.id === id)
  const seen = new Set<string>()
  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id)
    const parent = sessions.find((s) => s.id === current?.parentId)
    if (!parent) break
    current = parent
  }
  return current?.id ?? id
}

/** Frame to show on stop: the first with a file and not deemphasized; else the first with a file; else the first. */
export function pickTopFrame(frames: readonly DebugStackFrame[]): DebugStackFrame | null {
  return (
    frames.find((f) => f.path !== null && f.hint !== 'subtle' && f.hint !== 'label') ??
    frames.find((f) => f.path !== null) ??
    frames[0] ??
    null
  )
}

/** Sessions as a tree (parents before children, in creation order) with the depth of each one. */
export function sessionTree(sessions: readonly DebugSessionInfo[]): { session: DebugSessionInfo; depth: number }[] {
  const ids = new Set(sessions.map((s) => s.id))
  const out: { session: DebugSessionInfo; depth: number }[] = []
  const visit = (parentId: string | null, depth: number): void => {
    for (const s of sessions) {
      const parent = s.parentId !== null && ids.has(s.parentId) ? s.parentId : null
      if (parent !== parentId) continue
      out.push({ session: s, depth })
      visit(s.id, depth + 1)
    }
  }
  visit(null, 0)
  return out
}
