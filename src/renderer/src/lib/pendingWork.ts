// Async work in progress by kind, exposed in `<html data-pending="disk baseline…">`: the E2E tests wait for the
// attribute to disappear instead of using a fixed time. Whoever starts new work inside a tracked one marks it before it
// ends.
export type PendingKind = 'disk' | 'reopen' | 'baseline' | 'git'

const counts = new Map<PendingKind, number>()

function bump(kind: PendingKind, delta: number): void {
  const next = (counts.get(kind) ?? 0) + delta
  if (next > 0) counts.set(kind, next)
  else counts.delete(kind)
  const root = document.documentElement
  if (counts.size > 0) root.dataset.pending = [...counts.keys()].join(' ')
  else delete root.dataset.pending
}

/** Marks `kind` as pending until `work` ends (with success or error); the returned promise settles like `work`. */
export function trackPending<T>(kind: PendingKind, work: Promise<T>): Promise<T> {
  bump(kind, 1)
  return work.finally(() => bump(kind, -1))
}
