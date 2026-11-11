import { describe, expect, it } from 'vitest'
import { authorInitials, selectedLabel, syncTooltip } from './syncLabel'

describe('syncTooltip', () => {
  it('singular and plural', () => {
    expect(syncTooltip(2, 1, 'origin/x')).toBe('2 commits para enviar · 1 commit para receber (origin/x)')
    expect(syncTooltip(1, 2, 'origin/x')).toBe('1 commit para enviar · 2 commits para receber (origin/x)')
  })
  it('omits the zero side', () => {
    expect(syncTooltip(3, 0, 'origin/x')).toBe('3 commits para enviar (origin/x)')
    expect(syncTooltip(0, 1, 'origin/x')).toBe('1 commit para receber (origin/x)')
  })
  it('both zero', () => {
    expect(syncTooltip(0, 0, 'origin/x')).toBe('Sincronizado com origin/x')
  })
})

describe('selectedLabel', () => {
  it('agrees in the singular', () => {
    expect(selectedLabel(1)).toBe('1 selecionado')
    expect(selectedLabel(12)).toBe('12 selecionados')
  })
})

describe('authorInitials', () => {
  it('uses the first and last word', () => {
    expect(authorInitials('Ana Souza')).toBe('AS')
    expect(authorInitials('ana maria de souza')).toBe('AS')
    expect(authorInitials('Filipe')).toBe('F')
    expect(authorInitials('')).toBe('?')
    expect(authorInitials('  ')).toBe('?')
  })
})
