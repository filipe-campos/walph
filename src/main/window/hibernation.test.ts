import { describe, expect, it } from 'vitest'
import { pickEvictions, type HibernationCandidate } from './hibernation'

const c = (id: string, lastActiveAt: number, extra: Partial<HibernationCandidate> = {}): HibernationCandidate => ({
  id,
  live: true,
  active: false,
  lastActiveAt,
  keep: false,
  ...extra
})

describe('pickEvictions', () => {
  it('does nothing without limits', () => {
    expect(pickEvictions([c('a', 1), c('b', 2)], { maxLive: 0, idleMs: 0 }, 1_000_000)).toEqual([])
  })

  it('removes the least recent ones until it fits the limit', () => {
    const list = [c('a', 10), c('b', 30), c('c', 20), c('d', 40, { active: true })]
    expect(pickEvictions(list, { maxLive: 2, idleMs: 0 }, 100)).toEqual(['a', 'c'])
  })

  it('never picks active, protected or dormant ones', () => {
    const list = [c('a', 1, { active: true }), c('b', 2, { keep: true }), c('c', 3, { live: false }), c('d', 4)]
    expect(pickEvictions(list, { maxLive: 1, idleMs: 0 }, 100)).toEqual(['d'])
  })

  it('accepts staying above the limit when only protected ones remain', () => {
    const list = [c('a', 1, { keep: true }), c('b', 2, { active: true })]
    expect(pickEvictions(list, { maxLive: 1, idleMs: 0 }, 100)).toEqual([])
  })

  it('hibernates due to inactivity', () => {
    const list = [c('a', 0), c('b', 90), c('c', 10, { keep: true })]
    expect(pickEvictions(list, { maxLive: 0, idleMs: 50 }, 100)).toEqual(['a'])
  })

  it('combines inactivity and limit without counting twice', () => {
    const list = [c('a', 0), c('b', 60), c('c', 70), c('d', 80)]
    // a leaves due to inactivity; 3 live remain and the limit is 2: the oldest of the rest leaves (b)
    expect(pickEvictions(list, { maxLive: 2, idleMs: 50 }, 100)).toEqual(['a', 'b'])
  })
})
