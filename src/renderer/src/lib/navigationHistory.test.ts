import { describe, expect, it } from 'vitest'
import {
  emptyHistory,
  mapHistoryPaths,
  NAV_LIMIT,
  recordLocation,
  stepBack,
  stepForward,
  type NavLocation
} from './navigationHistory'

const loc = (path: string, line: number, column = 0): NavLocation => ({ path, line, column })

describe('navigationHistory', () => {
  it('records the origin and goes back to it', () => {
    const h = recordLocation(emptyHistory, loc('/a.ts', 10))
    const step = stepBack(h, loc('/b.ts', 3))!
    expect(step.target).toEqual(loc('/a.ts', 10))
    expect(step.history.back).toEqual([])
    expect(step.history.forward).toEqual([loc('/b.ts', 3)])
  })

  it('goes forward back to the place it came back from', () => {
    const h = recordLocation(emptyHistory, loc('/a.ts', 10))
    const back = stepBack(h, loc('/b.ts', 3))!
    const fwd = stepForward(back.history, loc('/a.ts', 10))!
    expect(fwd.target).toEqual(loc('/b.ts', 3))
    expect(fwd.history.back).toEqual([loc('/a.ts', 10)])
    expect(fwd.history.forward).toEqual([])
  })

  it('a new jump drops the "forward"', () => {
    let h = recordLocation(emptyHistory, loc('/a.ts', 10))
    h = stepBack(h, loc('/b.ts', 3))!.history
    expect(h.forward).toHaveLength(1)
    h = recordLocation(h, loc('/a.ts', 100))
    expect(h.forward).toEqual([])
  })

  it('merges neighboring positions of the same file, keeping the newest', () => {
    let h = recordLocation(emptyHistory, loc('/a.ts', 10))
    h = recordLocation(h, loc('/a.ts', 12, 4))
    expect(h.back).toEqual([loc('/a.ts', 12, 4)])
    h = recordLocation(h, loc('/a.ts', 40))
    h = recordLocation(h, loc('/b.ts', 41))
    expect(h.back).toHaveLength(3)
  })

  it('limits the stack size', () => {
    let h = emptyHistory
    for (let i = 0; i < NAV_LIMIT + 20; i++) h = recordLocation(h, loc('/a.ts', 1 + i * 100))
    expect(h.back).toHaveLength(NAV_LIMIT)
    expect(h.back[0].line).toBe(1 + 20 * 100)
  })

  it('skips entries identical to the current place', () => {
    let h = recordLocation(emptyHistory, loc('/a.ts', 1))
    h = recordLocation(h, loc('/b.ts', 50))
    const step = stepBack(h, loc('/b.ts', 50))!
    expect(step.target).toEqual(loc('/a.ts', 1))
  })

  it('returns null with nowhere to go', () => {
    expect(stepBack(emptyHistory, loc('/a.ts', 1))).toBeNull()
    expect(stepForward(emptyHistory, loc('/a.ts', 1))).toBeNull()
  })

  it('follows renamed files', () => {
    const h = recordLocation(emptyHistory, loc('/old/a.ts', 1))
    const mapped = mapHistoryPaths(h, (p) => p.replace('/old', '/new'))
    expect(mapped.back[0].path).toBe('/new/a.ts')
  })
})
