// Typed listener set for main: `on` returns the unsubscribe and `emit` isolates errors, so a listener that throws
// neither stops the others nor breaks the emitter. Iterates over a copy (a listener may unsubscribe while running) and
// skips listeners removed during the same emit.
import { createLog } from '../log'

export interface Emitter<Args extends unknown[]> {
  on(listener: (...args: Args) => void): () => void
  emit(...args: Args): void
}

export function createEmitter<Args extends unknown[] = []>(scope: string): Emitter<Args> {
  const log = createLog(scope)
  const listeners = new Set<(...args: Args) => void>()
  return {
    on(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    emit(...args) {
      for (const listener of [...listeners]) {
        if (!listeners.has(listener)) continue
        try {
          listener(...args)
        } catch (err) {
          log.error('listener failed:', err)
        }
      }
    }
  }
}
