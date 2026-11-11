import { describe, expect, it } from 'vitest'
import type { DebugSessionInfo, DebugStackFrame } from '@shared/types'
import { chooseFocusedSession, pickTopFrame, rootSessionOf, sessionTree } from './debugSessions'

const session = (id: string, parentId: string | null = null): DebugSessionInfo => ({
  id,
  name: id,
  type: 'node',
  parentId,
  state: 'running',
  stoppedThreadId: null,
  noDebug: false,
  capabilities: {
    conditionalBreakpoints: true,
    hitConditionalBreakpoints: false,
    logPoints: false,
    restart: false,
    terminate: true
  }
})

const frame = (id: number, path: string | null, hint: DebugStackFrame['hint'] = 'normal'): DebugStackFrame => ({
  id,
  name: `f${id}`,
  path,
  sourceName: null,
  line: 1,
  column: 1,
  hint
})

describe('chooseFocusedSession', () => {
  it('prefers the last one that stopped while alive', () => {
    expect(chooseFocusedSession([session('a'), session('b')], 'a')).toBe('a')
    expect(chooseFocusedSession([session('b')], 'a')).toBe('b')
  })

  it('without a stop, the most recent leaf (not the parent)', () => {
    expect(chooseFocusedSession([session('p'), session('c', 'p')], null)).toBe('c')
    expect(chooseFocusedSession([], null)).toBeNull()
  })
})

describe('rootSessionOf', () => {
  it('goes up to the root', () => {
    const list = [session('p'), session('c', 'p'), session('g', 'c')]
    expect(rootSessionOf(list, 'g')).toBe('p')
    expect(rootSessionOf(list, 'p')).toBe('p')
  })
})

describe('pickTopFrame', () => {
  it('skips frames without a file and deemphasized ones', () => {
    expect(pickTopFrame([frame(1, null), frame(2, '/lib', 'subtle'), frame(3, '/app')])?.id).toBe(3)
    expect(pickTopFrame([frame(1, null), frame(2, '/lib', 'subtle')])?.id).toBe(2)
    expect(pickTopFrame([frame(1, null)])?.id).toBe(1)
    expect(pickTopFrame([])).toBeNull()
  })
})

describe('sessionTree', () => {
  it('puts the children right after the parent, with depth', () => {
    const tree = sessionTree([session('a'), session('b'), session('a1', 'a')])
    expect(tree.map((n) => [n.session.id, n.depth])).toEqual([
      ['a', 0],
      ['a1', 1],
      ['b', 0]
    ])
  })
})
