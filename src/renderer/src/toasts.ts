import { set } from './store'
import type { Toast } from './types/toasts'

let toastSeq = 0
/** Above this the oldest `done`/`info` leave; `attention`/`error` are never dropped by the limit. */
const MAX_TOASTS = 5

/** Shows a toast (one with the same `key` is replaced in place). Returns the id. */
export function showToast(input: Omit<Toast, 'id'>): number {
  const id = ++toastSeq
  const toast: Toast = { ...input, id }
  const shown = { id }
  set((s) => {
    const at = toast.key ? s.toasts.findIndex((t) => t.key === toast.key) : -1
    // Same content: keeps the original (without remounting or announcing again).
    if (at >= 0) {
      const old = s.toasts[at]
      if (
        old &&
        !old.leaving &&
        old.tone === toast.tone &&
        old.title === toast.title &&
        old.description === toast.description
      ) {
        shown.id = old.id
        return s
      }
    }
    let toasts = at >= 0 ? s.toasts.map((t, i) => (i === at ? toast : t)) : [...s.toasts, toast]
    let excess = toasts.length - MAX_TOASTS
    if (excess > 0)
      toasts = toasts.filter((t) => {
        if (excess > 0 && t.id !== id && (t.tone === 'done' || t.tone === 'info')) {
          excess--
          return false
        }
        return true
      })
    return { toasts }
  })
  return shown.id
}

/**
 * Updates the `key` toast in place (same id: does not remount or repeat the entry); no effect if it is already gone.
 * The object changes, so the `duration` clock (WeakMap per toast) restarts: use only on toasts without `duration`
 * (like the clone one).
 */
export function updateToastByKey(key: string, patch: Partial<Pick<Toast, 'title' | 'description' | 'progress'>>): void {
  set((s) =>
    s.toasts.some((t) => t.key === key) ? { toasts: s.toasts.map((t) => (t.key === key ? { ...t, ...patch } : t)) } : s
  )
}

/** Starts the animated exit of the toast (it leaves the store in `dismissToast`, at the end of the animation). */
export function leaveToast(id: number): void {
  set((s) =>
    s.toasts.some((t) => t.id === id && !t.leaving)
      ? { toasts: s.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)) }
      : s
  )
}

export function dismissToast(id: number): void {
  set((s) => (s.toasts.some((t) => t.id === id) ? { toasts: s.toasts.filter((t) => t.id !== id) } : s))
}

/** Removes the toasts whose `key` matches `match` (e.g. everything from a Claude session). */
export function dismissToastsWhere(match: (key: string) => boolean): void {
  set((s) =>
    s.toasts.some((t) => t.key !== undefined && match(t.key))
      ? { toasts: s.toasts.filter((t) => t.key === undefined || !match(t.key)) }
      : s
  )
}

export function dismissToastByKey(key: string): void {
  dismissToastsWhere((k) => k === key)
}

/** Generic notice (`info` goes away in 4 s, `error` in 8 s). Claude notices use `showToast` directly. */
export function notify(text: string, kind: 'error' | 'info' = 'error'): void {
  showToast({ tone: kind, title: text, duration: kind === 'error' ? 8000 : 4000 })
}
