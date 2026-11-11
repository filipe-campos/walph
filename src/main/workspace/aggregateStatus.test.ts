import { describe, expect, it } from 'vitest'
import { aggregateStatus } from './aggregateStatus'

describe('aggregateStatus', () => {
  it('no sessions: idle and zero', () => {
    expect(aggregateStatus([])).toEqual({ status: 'idle', unread: 0 })
  })

  it('the most urgent wins: attention > error > running > done > idle', () => {
    const s = (status: 'idle' | 'done' | 'running' | 'error' | 'attention') => ({ status, unread: 0 })
    expect(aggregateStatus([s('idle'), s('done')]).status).toBe('done')
    expect(aggregateStatus([s('done'), s('running')]).status).toBe('running')
    expect(aggregateStatus([s('running'), s('error')]).status).toBe('error')
    expect(aggregateStatus([s('error'), s('attention'), s('running')]).status).toBe('attention')
  })

  it('sums the unread; one finished and another running shows running with a counter', () => {
    expect(
      aggregateStatus([
        { status: 'done', unread: 2 },
        { status: 'running', unread: 1 }
      ])
    ).toEqual({ status: 'running', unread: 3 })
  })

  it('the order of the sessions does not change the result (all permutations of five statuses)', () => {
    const all = ['idle', 'done', 'running', 'error', 'attention'] as const
    const permute = <T>(xs: readonly T[]): T[][] =>
      xs.length <= 1
        ? [[...xs]]
        : xs.flatMap((x, i) => permute([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r]))
    for (const order of permute(all)) {
      expect(aggregateStatus(order.map((status, i) => ({ status, unread: i + 1 })))).toEqual({
        status: 'attention',
        unread: 15
      })
    }
  })

  it('error beats running, even with the running session coming after', () => {
    expect(
      aggregateStatus([
        { status: 'error', unread: 1 },
        { status: 'running', unread: 0 }
      ])
    ).toEqual({ status: 'error', unread: 1 })
  })

  it('the unread sum does not depend on the status (including idle sessions)', () => {
    expect(
      aggregateStatus([
        { status: 'idle', unread: 4 },
        { status: 'idle', unread: 0 },
        { status: 'done', unread: 3 }
      ])
    ).toEqual({ status: 'done', unread: 7 })
  })

  it('a single session returns its own status and counter', () => {
    expect(aggregateStatus([{ status: 'attention', unread: 2 }])).toEqual({ status: 'attention', unread: 2 })
  })

  it('returns a new object and does not change the given sessions', () => {
    const sessions = [{ status: 'running' as const, unread: 1 }]
    const frozen = Object.freeze(sessions.map((x) => Object.freeze({ ...x })))
    const out = aggregateStatus(frozen)
    expect(out).not.toBe(frozen[0])
    expect(frozen[0]).toEqual({ status: 'running', unread: 1 })
  })
})
