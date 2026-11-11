import { describe, expect, it } from 'vitest'
import { gitStatusLabel } from './gitStatusLabels'

describe('gitStatusLabel', () => {
  it('translates the status letters', () => {
    expect(gitStatusLabel('M')).toBe('Modificado')
    expect(gitStatusLabel('?')).toBe('Não rastreado')
    expect(gitStatusLabel('U')).toBe('Conflito')
    expect(gitStatusLabel('T')).toBe('Tipo alterado')
  })

  it('an unknown letter comes back as it came', () => {
    expect(gitStatusLabel('X')).toBe('X')
  })
})
