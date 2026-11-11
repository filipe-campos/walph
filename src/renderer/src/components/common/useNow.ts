import { useEffect, useState } from 'react'

/**
 * Clock in ms that updates every `intervalMs` while `enabled`; stopped, it keeps the last value.
 * `until` (ms): stops ticking after the first tick in which the clock reaches it.
 */
export function useNow(intervalMs: number, enabled = true, until?: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const timer = setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (until !== undefined && current >= until) clearInterval(timer)
    }, intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs, enabled, until])
  return now
}
