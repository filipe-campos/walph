import { describe, expect, it } from 'vitest'
import { MAX_RESTARTS, nextRestart, STABLE_UPTIME_MS } from './backoff'

describe('nextRestart', () => {
  it('delays of 1, 2, 4, 8 and 16 s and then gives up', () => {
    const delays: Array<number | null> = []
    let attempts = 0
    for (let i = 0; i < MAX_RESTARTS + 1; i++) {
      const plan = nextRestart(attempts, 100)
      delays.push(plan?.delayMs ?? null)
      attempts = plan?.attempt ?? attempts
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, null])
  })

  it('resets the count if the server stayed up long enough', () => {
    expect(nextRestart(4, STABLE_UPTIME_MS)).toEqual({ attempt: 1, delayMs: 1000 })
    expect(nextRestart(4, STABLE_UPTIME_MS - 1)).toEqual({ attempt: 5, delayMs: 16000 })
  })
})
