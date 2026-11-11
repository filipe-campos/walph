import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IdlePolicy } from './idlePolicy'

function setup(overrides: { idleMs?: number; parked?: boolean; persisted?: boolean } = {}) {
  const state = { idleMs: 1000, parked: true, persisted: true, ...overrides }
  const sleep = vi.fn()
  const policy = new IdlePolicy({
    idleMs: () => state.idleMs,
    parked: () => state.parked,
    persisted: () => state.persisted,
    sleep
  })
  return { policy, state, sleep }
}

describe('IdlePolicy', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('sleeps after the deadline with the conversation stopped and saved', () => {
    const { policy, sleep } = setup()
    policy.update()
    vi.advanceTimersByTime(999)
    expect(sleep).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('a 0 deadline turns it off; a session not yet saved does not sleep', () => {
    const off = setup({ idleMs: 0 })
    off.policy.update()
    const fresh = setup({ persisted: false })
    fresh.policy.update()
    vi.advanceTimersByTime(10_000)
    expect(off.sleep).not.toHaveBeenCalled()
    expect(fresh.sleep).not.toHaveBeenCalled()
  })

  it('an action in progress suspends the deadline and `end` rearms it', () => {
    const { policy, sleep } = setup()
    policy.begin()
    policy.update()
    vi.advanceTimersByTime(5000)
    expect(sleep).not.toHaveBeenCalled()
    policy.end()
    vi.advanceTimersByTime(1000)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('a schedule from the `Stop` hook prevents sleep until the next `Stop` says otherwise', () => {
    const { policy, sleep } = setup()
    policy.noteStop(true, false)
    expect(policy.scheduled).toBe(true)
    expect(policy.hasCrons).toBe(true)
    vi.advanceTimersByTime(5000)
    expect(sleep).not.toHaveBeenCalled()
    policy.noteStop(false, false)
    vi.advanceTimersByTime(1000)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('a background task schedules without being a cron; `resetSchedule` clears both', () => {
    const { policy } = setup()
    policy.noteStop(false, true)
    expect(policy.scheduled).toBe(true)
    expect(policy.hasCrons).toBe(false)
    policy.resetSchedule()
    expect(policy.scheduled).toBe(false)
  })

  it('`hold` and `dispose` cancel the armed deadline', () => {
    const held = setup()
    held.policy.update()
    held.policy.hold()
    const gone = setup()
    gone.policy.update()
    gone.policy.dispose()
    vi.advanceTimersByTime(5000)
    expect(held.sleep).not.toHaveBeenCalled()
    expect(gone.sleep).not.toHaveBeenCalled()
  })

  it('a conversation that is not stopped is not quiescent and does not arm the deadline', () => {
    const { policy, state, sleep } = setup({ parked: false })
    expect(policy.isQuiescent()).toBe(false)
    policy.update()
    vi.advanceTimersByTime(5000)
    expect(sleep).not.toHaveBeenCalled()
    state.parked = true
    expect(policy.isQuiescent()).toBe(true)
    expect(policy.canSleep()).toBe(true)
  })
})
