import { describe, expect, it } from 'vitest'
import { getContext, resetContext, setContext } from './context'

describe('context per window', () => {
  it('stores per owner and validates key and value', () => {
    const a = {}
    const b = {}
    expect(setContext(a, 'terminalFocus', true)).toBe(true)
    expect(setContext(a, 'terminalFocus', 'yes')).toBe(false)
    expect(setContext(a, 'other', true)).toBe(false)
    expect(setContext(a, '__proto__', true)).toBe(false)
    expect(setContext(a, 'editorFocus', false)).toBe(true)
    expect(getContext(a)).toEqual({ terminalFocus: true, editorFocus: false })
    expect(getContext(b)).toEqual({})
  })

  it('reset goes back to empty', () => {
    const a = {}
    setContext(a, 'terminalFocus', true)
    resetContext(a)
    expect(getContext(a)).toEqual({})
  })
})
