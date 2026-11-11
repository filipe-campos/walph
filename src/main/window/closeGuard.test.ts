import { describe, expect, it } from 'vitest'
import {
  abortCloseChain,
  beginClose,
  blocksClose,
  cancelPendingClose,
  createCloseGuardState,
  findCloseBlocker,
  isCloseChain,
  resetCloseGuard,
  type CloseGuardState,
  type CloseTarget
} from './closeGuard'

describe('guard state and cycle', () => {
  it('initial state: clean, no permission and no pending target', () => {
    expect(createCloseGuardState()).toEqual({ dirty: false, allowClose: false, target: null, closeBlocked: false })
  })

  it('a clean view never blocks, whatever the target', () => {
    expect(blocksClose(createCloseGuardState())).toBe(false)
  })

  it('beginClose sets target and closeBlocked; resetCloseGuard clears everything', () => {
    const s = createCloseGuardState()
    s.dirty = true
    beginClose(s, 'quit')
    expect(s).toMatchObject({ target: 'quit', closeBlocked: true })
    resetCloseGuard(s)
    expect(s).toEqual(createCloseGuardState())
  })

  it('the last request wins: workspace after quit counts as workspace', () => {
    const s = createCloseGuardState()
    s.dirty = true
    beginClose(s, 'quit')
    beginClose(s, 'workspace')
    expect(s.target).toBe('workspace')
  })

  it('after confirmation (allowClose) it does not block; saving everything (dirty=false) does not either', () => {
    const s = createCloseGuardState()
    s.dirty = true
    expect(blocksClose(s)).toBe(true)
    s.allowClose = true
    expect(blocksClose(s)).toBe(false)
    s.allowClose = false
    s.dirty = false
    expect(blocksClose(s)).toBe(false)
  })

  it('a dead renderer never blocks', () => {
    const s = createCloseGuardState()
    s.dirty = true
    expect(blocksClose(s, false)).toBe(false)
  })
})

describe('cancelPendingClose', () => {
  it('cancelling leaves neither target nor closeBlocked behind', () => {
    const s = createCloseGuardState()
    s.dirty = true
    beginClose(s, 'quit')
    expect(s.target).toBe('quit')
    cancelPendingClose(s)
    expect(s.closeBlocked).toBe(false)
    expect(s.target).toBeNull()
    // Still dirty: the next close asks again.
    expect(s.dirty).toBe(true)
    expect(blocksClose(s)).toBe(true)
  })
})

describe('app quit (before-quit)', () => {
  const dirty = (): ReturnType<typeof createCloseGuardState> => ({ ...createCloseGuardState(), dirty: true })
  const win = (
    state = createCloseGuardState(),
    rendererAlive = true
  ): { state: typeof state; rendererAlive: boolean } => ({
    state,
    rendererAlive
  })

  it('blocksClose: only a dirty, unresolved window with a live renderer', () => {
    expect(blocksClose(createCloseGuardState())).toBe(false)
    expect(blocksClose(dirty())).toBe(true)
    expect(blocksClose({ ...dirty(), allowClose: true })).toBe(false)
    expect(blocksClose(dirty(), false)).toBe(false)
  })

  it('findCloseBlocker: -1 without dirty windows; otherwise the first dirty one (one at a time)', () => {
    expect(findCloseBlocker([])).toBe(-1)
    expect(findCloseBlocker([win(), win()])).toBe(-1)
    expect(findCloseBlocker([win(), win(dirty()), win(dirty())])).toBe(1)
  })

  it('a dirty window with a dead renderer does not block quitting', () => {
    expect(findCloseBlocker([win(dirty(), false), win()])).toBe(-1)
  })

  it('after confirming the first, the second dirty one is the next to block', () => {
    const a = win(dirty())
    const b = win(dirty())
    expect(findCloseBlocker([a, b])).toBe(0)
    beginClose(a.state, 'quit')
    expect(a.state).toMatchObject({ target: 'quit', closeBlocked: true })
    a.state.allowClose = true
    expect(findCloseBlocker([a, b])).toBe(1)
  })

  it('cancelling the question clears the quit mark and the window stays dirty', () => {
    const a = win(dirty())
    beginClose(a.state, 'quit')
    cancelPendingClose(a.state)
    expect(a.state).toMatchObject({ target: null, closeBlocked: false, dirty: true })
  })
})

describe('abortCloseChain', () => {
  it('two dirty windows: confirming the first and cancelling the second makes the first block again', () => {
    const a = createCloseGuardState()
    const b = createCloseGuardState()
    a.dirty = true
    b.dirty = true
    // ⌘Q: A asks, the user confirms ("Don't Save").
    beginClose(a, 'quit')
    a.allowClose = true
    a.target = null
    // ⌘Q again: A goes through, B blocks and the user cancels.
    expect(
      findCloseBlocker([
        { state: a, rendererAlive: true },
        { state: b, rendererAlive: true }
      ])
    ).toBe(1)
    beginClose(b, 'quit')
    expect(abortCloseChain(b, [a])).toBe(true)
    cancelPendingClose(b)
    expect(a.allowClose).toBe(false)
    expect(blocksClose(a)).toBe(true)
  })

  it('window: the chain is aborted too; a standalone workspace does not touch the other views', () => {
    const a = createCloseGuardState()
    const b = createCloseGuardState()
    a.allowClose = true
    beginClose(b, 'window')
    expect(abortCloseChain(b, [a])).toBe(true)
    expect(a.allowClose).toBe(false)
    a.allowClose = true
    beginClose(b, 'workspace')
    expect(abortCloseChain(b, [a])).toBe(false)
    expect(a.allowClose).toBe(true)
  })

  it('cancelling a close that is not an app quit does not touch the other windows', () => {
    const a = createCloseGuardState()
    const b = createCloseGuardState()
    a.allowClose = true
    expect(abortCloseChain(b, [a])).toBe(false)
    expect(a.allowClose).toBe(true)
  })
})

describe('close targets (workspace, window, quit)', () => {
  const dirtyState = (): CloseGuardState => ({ ...createCloseGuardState(), dirty: true })
  const alive = (state: CloseGuardState): { state: CloseGuardState; rendererAlive: boolean } => ({
    state,
    rendererAlive: true
  })

  it('beginClose records each target on the blocking view', () => {
    for (const target of ['workspace', 'window', 'quit'] as CloseTarget[]) {
      const s = dirtyState()
      beginClose(s, target)
      expect(s).toMatchObject({ target, closeBlocked: true, dirty: true })
    }
  })

  it('isCloseChain: only window and quit ask view by view', () => {
    expect(isCloseChain('window')).toBe(true)
    expect(isCloseChain('quit')).toBe(true)
    expect(isCloseChain('workspace')).toBe(false)
    expect(isCloseChain(null)).toBe(false)
  })

  it('closing a dirty workspace does not depend on the other views of the window', () => {
    const a = dirtyState()
    const b = dirtyState()
    beginClose(a, 'workspace')
    expect(blocksClose(a)).toBe(true)
    // Confirmed the question of A: the close of A goes through, B still requires confirmation.
    a.allowClose = true
    expect(blocksClose(a)).toBe(false)
    expect(blocksClose(b)).toBe(true)
  })

  it('cancelling the close of a workspace does not drop the confirmation of another view', () => {
    const a = dirtyState()
    const b = dirtyState()
    b.allowClose = true
    beginClose(a, 'workspace')
    expect(abortCloseChain(a, [b])).toBe(false)
    cancelPendingClose(a)
    expect(b.allowClose).toBe(true)
    expect(a).toMatchObject({ target: null, closeBlocked: false, dirty: true })
  })

  it('window chain: the active view (first in the list) asks before the others', () => {
    const active = dirtyState()
    const second = dirtyState()
    const third = dirtyState()
    const views = [active, second, third].map(alive)
    expect(findCloseBlocker(views)).toBe(0)
    active.allowClose = true
    expect(findCloseBlocker(views)).toBe(1)
    second.allowClose = true
    expect(findCloseBlocker(views)).toBe(2)
    third.allowClose = true
    expect(findCloseBlocker(views)).toBe(-1)
  })

  it('cancelling in the middle of a quit chain with three views reverts all the ones already confirmed', () => {
    const [a, b, c] = [dirtyState(), dirtyState(), dirtyState()] as [CloseGuardState, CloseGuardState, CloseGuardState]
    a.allowClose = true
    b.allowClose = true
    beginClose(c, 'quit')
    expect(abortCloseChain(c, [a, b])).toBe(true)
    cancelPendingClose(c)
    expect([a, b, c].map((s) => blocksClose(s))).toEqual([true, true, true])
    // Restarting the quit, the first view asks again.
    expect(findCloseBlocker([a, b, c].map(alive))).toBe(0)
  })

  it('aborting the chain keeps the cancelled view target (the caller does cancelPendingClose) and dirty', () => {
    const a = dirtyState()
    const b = dirtyState()
    a.allowClose = true
    beginClose(b, 'window')
    abortCloseChain(b, [a])
    expect(b).toMatchObject({ target: 'window', closeBlocked: true, dirty: true })
    expect(a.dirty).toBe(true)
  })

  it('chain without confirmed views: aborts with no effect and returns true', () => {
    const b = dirtyState()
    beginClose(b, 'quit')
    expect(abortCloseChain(b, [])).toBe(true)
  })

  it('a renderer reloaded mid-request resets the permission and the target', () => {
    const s = dirtyState()
    s.allowClose = true
    beginClose(s, 'window')
    resetCloseGuard(s)
    expect(s).toEqual(createCloseGuardState())
    expect(abortCloseChain(s, [])).toBe(false)
  })

  it('a dirty view with a dead renderer in the middle of the chain is skipped, the next one asks', () => {
    const dead = { state: dirtyState(), rendererAlive: false }
    const next = alive(dirtyState())
    expect(findCloseBlocker([dead, next])).toBe(1)
  })
})
