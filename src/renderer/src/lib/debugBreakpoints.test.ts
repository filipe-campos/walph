import { describe, expect, it } from 'vitest'
import {
  breakpointMarks,
  breakpointsFromSession,
  breakpointsToSession,
  moveBreakpoints,
  setBreakpointEnabled,
  setBreakpointFields,
  toSourceBreakpoints,
  toggleBreakpoint,
  type Breakpoint
} from './debugBreakpoints'

const bp = (line: number, extra: Partial<Breakpoint> = {}): Breakpoint => ({ line, enabled: true, ...extra })

describe('toggleBreakpoint', () => {
  it('adds in order and removes the same line', () => {
    const list = toggleBreakpoint(toggleBreakpoint([], 10), 3)
    expect(list.map((b) => b.line)).toEqual([3, 10])
    expect(toggleBreakpoint(list, 10)).toEqual([bp(3)])
  })
})

describe('setBreakpointFields', () => {
  it('creates with a condition and drops empty fields', () => {
    const list = setBreakpointFields([], 5, { condition: ' x > 1 ' })
    expect(list).toEqual([bp(5, { condition: 'x > 1' })])
    expect(setBreakpointFields(list, 5, { condition: '  ' })).toEqual([bp(5)])
  })

  it('reenables a disabled breakpoint', () => {
    const list = setBreakpointFields([bp(2, { enabled: false })], 2, { logMessage: 'hi {x}' })
    expect(list).toEqual([bp(2, { logMessage: 'hi {x}' })])
  })
})

describe('moveBreakpoints', () => {
  it('applies all the shifts over the previous list', () => {
    const list = [bp(1), bp(2), bp(5)]
    expect(
      moveBreakpoints(list, [
        { from: 2, to: 4 },
        { from: 5, to: 7 }
      ]).map((b) => b.line)
    ).toEqual([1, 4, 7])
  })

  it('merges breakpoints that land on the same line', () => {
    const list = [bp(3, { condition: 'a' }), bp(4)]
    expect(moveBreakpoints(list, [{ from: 4, to: 3 }])).toEqual([bp(3, { condition: 'a' })])
  })
})

describe('toSourceBreakpoints', () => {
  it('sends only the enabled ones, without `enabled`', () => {
    const list = [bp(1), bp(2, { enabled: false }), bp(3, { hitCondition: '2' })]
    expect(toSourceBreakpoints(list)).toEqual([{ line: 1 }, { line: 3, hitCondition: '2' }])
  })
})

describe('breakpointMarks', () => {
  it('distinguishes disabled, unverified, conditional and logpoint', () => {
    const list = [bp(1, { enabled: false }), bp(2), bp(3, { condition: 'x' }), bp(4, { logMessage: 'm' }), bp(5)]
    const statuses = [{ line: 2, verified: false, actualLine: null, message: 'no code' }]
    expect(breakpointMarks(list, statuses).map((m) => [m.line, m.kind, m.title])).toEqual([
      [1, 'disabled', null],
      [2, 'unverified', 'no code'],
      [3, 'conditional', 'x'],
      [4, 'log', 'm'],
      [5, 'enabled', null]
    ])
  })
})

describe('session', () => {
  it('round trip keeps the disabled ones and drops empty files', () => {
    const map = { '/a.py': [bp(1), bp(2, { enabled: false, condition: 'c' })], '/b.py': [] }
    const files = breakpointsToSession(map)
    expect(files).toEqual([{ path: '/a.py', breakpoints: [{ line: 1 }, { line: 2, enabled: false, condition: 'c' }] }])
    expect(breakpointsFromSession(files)).toEqual({ '/a.py': map['/a.py'] })
  })

  it('ignores invalid and repeated lines', () => {
    const files = [{ path: '/a', breakpoints: [{ line: 0 }, { line: 2 }, { line: 2 }, { line: 1.5 }] }]
    expect(breakpointsFromSession(files)).toEqual({ '/a': [bp(2)] })
  })

  it('setBreakpointEnabled only changes the requested line', () => {
    expect(setBreakpointEnabled([bp(1), bp(2)], 2, false)).toEqual([bp(1), bp(2, { enabled: false })])
  })
})
