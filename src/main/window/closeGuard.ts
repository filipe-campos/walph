// Close guard per VIEW: each workspace is a webContents with its own state. What may be closing is the workspace,
// the whole window (chain: one dirty view at a time) or the app (chain across windows).

export type CloseTarget = 'workspace' | 'window' | 'quit'

export interface CloseGuardState {
  /** The renderer reported unsaved files. */
  dirty: boolean
  /** The renderer already resolved the question (saved/discarded): the next close goes through. */
  allowClose: boolean
  /** What the blocked close intends to close (`null` = nothing pending). */
  target: CloseTarget | null
  /** A blocked close is waiting for the renderer answer (to offer "Force Close" if it hangs). */
  closeBlocked: boolean
}

export function createCloseGuardState(): CloseGuardState {
  return { dirty: false, allowClose: false, target: null, closeBlocked: false }
}

/** Back to the clean state (renderer reloaded or dead: the "dirty" notice no longer holds). */
export function resetCloseGuard(state: CloseGuardState): void {
  state.dirty = false
  state.allowClose = false
  state.target = null
  state.closeBlocked = false
}

/** The user cancelled (or the save failed): nothing is pending anymore. The view stays dirty and asks again later. */
export function cancelPendingClose(state: CloseGuardState): void {
  state.closeBlocked = false
  state.target = null
}

/** The view needs user confirmation before closing (dirty, not yet resolved and with a live renderer). */
export function blocksClose(state: CloseGuardState, rendererAlive = true): boolean {
  return rendererAlive && state.dirty && !state.allowClose
}

/**
 * First view that blocks the close, or -1. The caller orders the views (the active one first). Called before any view
 * closes: if the question is cancelled, no other one has been closed yet.
 */
export function findCloseBlocker(views: ReadonlyArray<{ state: CloseGuardState; rendererAlive: boolean }>): number {
  return views.findIndex((v) => blocksClose(v.state, v.rendererAlive))
}

/** Marks the blocking view: on confirmation, the close of `target` runs again (and moves on to the next dirty one). */
export function beginClose(state: CloseGuardState, target: CloseTarget): void {
  state.target = target
  state.closeBlocked = true
}

/** `window` and `quit` ask view by view; `workspace` is a single question. */
export function isCloseChain(target: CloseTarget | null): boolean {
  return target === 'window' || target === 'quit'
}

/**
 * The user cancelled the question of a view in a chain: the views that already confirmed require confirmation again
 * (otherwise a later close would lose what was discarded). Returns `true` if it was a chain (the caller notifies the
 * renderers of those views).
 */
export function abortCloseChain(cancelled: CloseGuardState, confirmed: Iterable<CloseGuardState>): boolean {
  if (!isCloseChain(cancelled.target)) return false
  for (const s of confirmed) s.allowClose = false
  return true
}
