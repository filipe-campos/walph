import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyWithinCap, pickShell } from './loginPath'

describe('pickShell', () => {
  it('prefers $SHELL', () => expect(pickShell('/bin/zsh', '/bin/bash')).toBe('/bin/zsh'))
  it('falls back to the account shell', () => expect(pickShell(undefined, '/bin/bash')).toBe('/bin/bash'))
  it('empty becomes undefined', () => expect(pickShell('', '')).toBeUndefined())
})

describe('applyWithinCap', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('applies when it resolves within the cap', async () => {
    const apply = vi.fn()
    await applyWithinCap(Promise.resolve('/a:/b'), 2000, apply)
    expect(apply).toHaveBeenCalledWith('/a:/b')
  })

  it('moves on without waiting and applies when the shell is slow', async () => {
    const apply = vi.fn()
    let resolve!: (v: string | null) => void
    const slow = new Promise<string | null>((r) => (resolve = r))
    const waiting = applyWithinCap(slow, 2000, apply)
    await vi.advanceTimersByTimeAsync(2000)
    await waiting
    expect(apply).not.toHaveBeenCalled()
    resolve('/late')
    await vi.advanceTimersByTimeAsync(0)
    expect(apply).toHaveBeenCalledWith('/late')
  })

  it('ignores null and rejection', async () => {
    const apply = vi.fn()
    await applyWithinCap(Promise.resolve(null), 2000, apply)
    await applyWithinCap(Promise.reject(new Error('x')), 2000, apply)
    expect(apply).not.toHaveBeenCalled()
  })
})
