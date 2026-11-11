import { useEffect, useReducer } from 'react'
import { registerFocusTarget, type FocusTarget } from '../../focusBridge'

/**
 * Registers the component as a `requestFocus(target)` target. Returns a counter that goes up on every request: it
 * enters
 * the dependencies of the effect that focuses, which then runs after the commit (like any other state change).
 */
export function useFocusTarget(target: FocusTarget): number {
  const [requests, bump] = useReducer((n: number) => n + 1, 0)
  useEffect(() => registerFocusTarget(target, bump), [target])
  return requests
}
