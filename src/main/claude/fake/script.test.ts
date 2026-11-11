import { describe, expect, it } from 'vitest'
import { parseFakeScript } from './script'

describe('parseFakeScript', () => {
  it('accepts { turns } and the direct list of turns', () => {
    const turns = [[{ assistant: 'hi' }, { delay: 10 }]]
    expect(parseFakeScript({ turns }).turns).toEqual(turns)
    expect(parseFakeScript(turns).turns).toEqual(turns)
  })

  it('normalizes result and caps delay', () => {
    const { turns } = parseFakeScript({ turns: [[{ result: { isError: true } }, { delay: 1e9 }]] })
    expect(turns[0][0]).toEqual({ result: { isError: true, text: 'Test error.', costUsd: 0 } })
    expect(turns[0][1]).toEqual({ delay: 60_000 })
  })

  it('rejects invalid formats', () => {
    expect(() => parseFakeScript({})).toThrow('Invalid fake Claude script')
    expect(() => parseFakeScript({ turns: [[{ nope: 1 }]] })).toThrow('unknown step "nope"')
    expect(() => parseFakeScript({ turns: [[{ assistant: 1 }]] })).toThrow('"assistant" must be text')
    expect(() => parseFakeScript({ turns: [[{ assistant: 'a', delay: 1 }]] })).toThrow('exactly one key')
    expect(() => parseFakeScript({ turns: ['x'] })).toThrow('turn 0')
  })
})
