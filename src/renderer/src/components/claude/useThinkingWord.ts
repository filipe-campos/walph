import { useEffect, useState } from 'react'
import { pickThinkingWord } from '../../lib/thinkingWords'

const ROTATE_MS = 4000

/** Word of the "thinking" state: fixed by `seed` (the turn) and changed every ~4 s while `active`. */
export function useThinkingWord(seed: string, active = true): string {
  const [ticks, setTicks] = useState(0)
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setTicks((n) => n + 1), ROTATE_MS)
    return () => clearInterval(t)
  }, [active])
  return pickThinkingWord(seed, ticks)
}
