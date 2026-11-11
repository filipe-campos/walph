import { describe, expect, it } from 'vitest'
import { typeAheadIndex } from './typeAhead'

const labels = ['Desligado', 'Após um atraso', 'Ao sair do editor', 'Automático']

describe('typeAheadIndex', () => {
  it('a letter goes to the next item that starts with it, wrapping around to the start', () => {
    expect(typeAheadIndex(labels, 0, 'a')).toBe(1)
    expect(typeAheadIndex(labels, 1, 'a')).toBe(2)
    expect(typeAheadIndex(labels, 3, 'a')).toBe(1)
  })

  it('ignores case and returns -1 without a match', () => {
    expect(typeAheadIndex(labels, 1, 'D')).toBe(0)
    expect(typeAheadIndex(labels, 0, 'x')).toBe(-1)
    expect(typeAheadIndex([], 0, 'a')).toBe(-1)
    expect(typeAheadIndex(labels, 0, '')).toBe(-1)
  })

  it('a longer prefix stays on the current item', () => {
    expect(typeAheadIndex(labels, 2, 'ao')).toBe(2)
    expect(typeAheadIndex(labels, 1, 'au')).toBe(3)
  })

  it('a repeated letter cycles through the items of the letter', () => {
    expect(typeAheadIndex(labels, 1, 'aa')).toBe(2)
    expect(typeAheadIndex(labels, 2, 'aaa')).toBe(3)
  })
})
