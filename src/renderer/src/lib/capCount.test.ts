import { afterEach, describe, expect, it } from 'vitest'
import { setLocale } from '@shared/i18n'
import { capCount } from './capCount'

afterEach(() => setLocale('pt-BR'))

describe('capCount', () => {
  it('shows the whole number up to the limit and "max+" above it', () => {
    expect(capCount(0)).toBe('0')
    expect(capCount(99)).toBe('99')
    expect(capCount(100)).toBe('99+')
    expect(capCount(9, 9)).toBe('9')
    expect(capCount(10, 9)).toBe('9+')
  })

  it('formats in the current language', () => {
    setLocale('en')
    expect(capCount(5)).toBe('5')
    expect(capCount(1500, 1000)).toBe('1,000+')
  })
})
