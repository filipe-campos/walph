export interface ReactionScope {
  /** Registers a cancellation; in an already stopped scope it runs right away. */
  add(off: () => void): void
  /**
   * Binds module global state (`bind`) and returns it to neutral (`unbind`) on `stop`, but only if this instance is
   * still
   * the owner: an old `stop` does not undo the binding of a newer instance. Ownership is by the identity of `unbind`,
   * so it needs to be a stable module function.
   */
  bindGlobal(bind: () => void, unbind: () => void): void
  /** Cancels everything in reverse registration order; calling it again does nothing. */
  stop(): void
}

const globalOwners = new Map<() => void, object>()

export function createReactionScope(): ReactionScope {
  const token = {}
  const offs: Array<() => void> = []
  let stopped = false
  const scope: ReactionScope = {
    add(off) {
      if (stopped) off()
      else offs.push(off)
    },
    bindGlobal(bind, unbind) {
      globalOwners.set(unbind, token)
      bind()
      scope.add(() => {
        if (globalOwners.get(unbind) !== token) return
        globalOwners.delete(unbind)
        unbind()
      })
    },
    stop() {
      if (stopped) return
      stopped = true
      for (const off of offs.reverse()) off()
      offs.length = 0
    }
  }
  return scope
}

interface SelectorStore<S> {
  getState(): S
  subscribe<T>(selector: (s: S) => T, listener: (next: T, prev: T) => void): () => void
}

/**
 * Creates the `subscribeDiff` of a store with `subscribeWithSelector`. The `prev` of `subscribe` comes from the
 * argument of
 * the outermost `set`: with a `set` nested in an earlier listener, the following ones get inconsistent pairs. Here the
 * previous is the last processed value and the current comes from `getState()`; without a real change, the listener
 * does not run.
 */
export function createSubscribeDiff<S>(store: SelectorStore<S>) {
  return function subscribeDiff<T>(
    selector: (s: S) => T,
    listener: (next: T, prev: T) => void,
    equalityFn: (a: T, b: T) => boolean = Object.is
  ): () => void {
    let last = selector(store.getState())
    return store.subscribe(selector, () => {
      const next = selector(store.getState())
      if (equalityFn(next, last)) return
      const prev = last
      last = next
      listener(next, prev)
    })
  }
}
