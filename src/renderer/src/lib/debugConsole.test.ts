import { describe, expect, it } from 'vitest'
import { appendEntry, appendOutput, displayText, stepHistory, type ConsoleEntry } from './debugConsole'

const counter = (): (() => number) => {
  let n = 0
  return () => ++n
}

describe('appendOutput', () => {
  it('continues the line without a break and separates by category', () => {
    const id = counter()
    let list: ConsoleEntry[] = []
    list = appendOutput(list, [{ sessionId: 's', category: 'stdout', text: 'ab' }], id)
    list = appendOutput(list, [{ sessionId: 's', category: 'stdout', text: 'c\n' }], id)
    list = appendOutput(list, [{ sessionId: 's', category: 'stdout', text: 'd' }], id)
    list = appendOutput(list, [{ sessionId: 's', category: 'stderr', text: 'e' }], id)
    expect(list.map((e) => e.text)).toEqual(['abc\n', 'd', 'e'])
  })

  it('respects the limit', () => {
    const id = counter()
    const incoming = [1, 2, 3].map((n) => ({ sessionId: 's', category: 'stdout' as const, text: `${n}\n` }))
    expect(appendOutput([], incoming, id, 2).map((e) => e.text)).toEqual(['2\n', '3\n'])
  })
})

describe('appendEntry / displayText', () => {
  it('numbers and strips the final break', () => {
    const list = appendEntry([], { kind: 'input', text: 'x + 1\n' }, counter())
    expect(list[0]?.id).toBe(1)
    expect(list[0] && displayText(list[0])).toBe('x + 1')
  })
})

describe('stepHistory', () => {
  it('goes up from the end and back down to the empty field', () => {
    const history = ['a', 'b']
    expect(stepHistory(history, -1, 'up')).toEqual({ index: 1, text: 'b' })
    expect(stepHistory(history, 1, 'up')).toEqual({ index: 0, text: 'a' })
    expect(stepHistory(history, 0, 'up')).toBeNull()
    expect(stepHistory(history, 0, 'down')).toEqual({ index: 1, text: 'b' })
    expect(stepHistory(history, 1, 'down')).toEqual({ index: -1, text: '' })
    expect(stepHistory(history, -1, 'down')).toBeNull()
  })
})
