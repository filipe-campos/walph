import { describe, expect, it } from 'vitest'
import { createReloadLimiter } from './reloadPolicy'

describe('createReloadLimiter', () => {
  it('allows 3 reloads in the window and blocks the 4th', () => {
    const time = 0
    const limiter = createReloadLimiter(() => time)
    const view = {}
    expect([limiter.allow(view), limiter.allow(view), limiter.allow(view)]).toEqual([true, true, true])
    expect(limiter.allow(view)).toBe(false)
  })

  it('allows again when the old reloads leave the 30 s window', () => {
    let time = 0
    const limiter = createReloadLimiter(() => time)
    const view = {}
    for (let i = 0; i < 3; i++) limiter.allow(view)
    time = 29_999
    expect(limiter.allow(view)).toBe(false)
    time = 30_000
    expect(limiter.allow(view)).toBe(true)
  })

  it('counts each view separately', () => {
    const limiter = createReloadLimiter(() => 0)
    const a = {}
    const b = {}
    for (let i = 0; i < 3; i++) limiter.allow(a)
    expect(limiter.allow(a)).toBe(false)
    expect(limiter.allow(b)).toBe(true)
  })

  it('a blocked reload does not count as an attempt', () => {
    let time = 0
    const limiter = createReloadLimiter(() => time)
    const view = {}
    for (let i = 0; i < 3; i++) limiter.allow(view)
    time = 10_000
    limiter.allow(view)
    time = 30_000
    expect(limiter.allow(view)).toBe(true)
  })
})
