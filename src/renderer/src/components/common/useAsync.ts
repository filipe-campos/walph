import { useCallback, useEffect, useEffectEvent, useState, type DependencyList } from 'react'

type AsyncStatus = 'idle' | 'loading' | 'success' | 'error'

export type AsyncOptions = {
  /**
   * `false` does not trigger the load (`status: 'idle'`); the result already obtained for the same `deps` still holds.
   */
  enabled?: boolean
  /** Delay after the last `deps` change before calling `fn` (typing). */
  delayMs?: number
  /** While loading, `value` shows the last non-null value obtained (from other `deps` or before a `reload`). */
  keepPrevious?: boolean
  /** Called once per failure, only if the result still holds (no `deps` change or unmount). */
  onError?: (error: unknown) => void
}

export type AsyncState<T> = {
  status: AsyncStatus
  value: T | undefined
  error: unknown
  reload: () => void
}

type Settled<T> = { id: number; ok: true; value: T } | { id: number; ok: false; error: unknown }

function sameDeps(a: DependencyList, b: DependencyList): boolean {
  return a.length === b.length && a.every((dep, i) => Object.is(dep, b[i]))
}

/**
 * Async load tied to the `deps`: the result stores the round it answers, so a late response from old `deps`
 * never shows up. `loading` is derived (round different from the resolved one), with no `setState` in the effect.
 * `fn` is read on every round without entering the `deps`; list in them only what identifies the load.
 * The `deps` must be stable (primitives or props/store references), never objects, arrays or closures created
 * in render: they are compared with `Object.is` during render and would loop.
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: DependencyList,
  { enabled = true, delayMs = 0, keepPrevious = false, onError }: AsyncOptions = {}
): AsyncState<T> {
  const [key, setKey] = useState({ deps, id: 0 })
  let current = key
  if (!sameDeps(key.deps, deps)) {
    current = { deps, id: key.id + 1 }
    setKey(current)
  }
  const [settled, setSettled] = useState<Settled<T> | null>(null)
  const [last, setLast] = useState<{ value: T } | null>(null)

  const run = useEffectEvent(fn)
  const fail = useEffectEvent((error: unknown) => onError?.(error))
  const id = current.id
  const settledId = settled?.id

  useEffect(() => {
    if (!enabled || settledId === id) return
    let live = true
    const start = (): void => {
      run().then(
        (value) => {
          if (!live) return
          setSettled({ id, ok: true, value })
          if (value != null) setLast({ value })
        },
        (error: unknown) => {
          if (!live) return
          setSettled({ id, ok: false, error })
          fail(error)
        }
      )
    }
    if (!delayMs) {
      start()
      return () => {
        live = false
      }
    }
    const timer = setTimeout(start, delayMs)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [enabled, delayMs, id, settledId])

  const reload = useCallback(() => setKey((k) => ({ deps: k.deps, id: k.id + 1 })), [])

  const kept = keepPrevious ? last?.value : undefined
  if (settled && settled.id === id) {
    return settled.ok
      ? { status: 'success', value: settled.value, error: undefined, reload }
      : { status: 'error', value: kept, error: settled.error, reload }
  }
  return { status: enabled ? 'loading' : 'idle', value: kept, error: undefined, reload }
}
