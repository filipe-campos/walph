import { describe, expect, it, vi } from 'vitest'
import { createReactionScope } from './reactions'

describe('createReactionScope', () => {
  it('cancels in reverse order and only once', () => {
    const calls: number[] = []
    const scope = createReactionScope()
    scope.add(() => calls.push(1))
    scope.add(() => calls.push(2))
    scope.stop()
    scope.stop()
    expect(calls).toEqual([2, 1])
  })

  it('runs right away a cancellation added to a stopped scope', () => {
    const scope = createReactionScope()
    scope.stop()
    const off = vi.fn()
    scope.add(off)
    expect(off).toHaveBeenCalledOnce()
  })

  it('returns the global binding to neutral when the instance is still the owner', () => {
    const bind = vi.fn()
    const unbind = vi.fn()
    const scope = createReactionScope()
    scope.bindGlobal(bind, unbind)
    expect(bind).toHaveBeenCalledOnce()
    scope.stop()
    expect(unbind).toHaveBeenCalledOnce()
  })

  it('an old stop does not undo the binding of a newer instance', () => {
    const unbind = vi.fn()
    const first = createReactionScope()
    first.bindGlobal(vi.fn(), unbind)
    const second = createReactionScope()
    second.bindGlobal(vi.fn(), unbind)
    first.stop()
    expect(unbind).not.toHaveBeenCalled()
    second.stop()
    expect(unbind).toHaveBeenCalledOnce()
  })

  it('global bindings with different neutrals are independent', () => {
    const unbindA = vi.fn()
    const unbindB = vi.fn()
    const a = createReactionScope()
    a.bindGlobal(vi.fn(), unbindA)
    const b = createReactionScope()
    b.bindGlobal(vi.fn(), unbindB)
    a.stop()
    expect(unbindA).toHaveBeenCalledOnce()
    expect(unbindB).not.toHaveBeenCalled()
    b.stop()
  })
})
