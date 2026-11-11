import { afterEach, describe, expect, it } from 'vitest'
import { LOCALES, setLocale } from '@shared/i18n'
import { pickThinkingWord, thinkingWords } from './thinkingWords'

describe('pickThinkingWord', () => {
  afterEach(() => setLocale('pt-BR'))

  it('is deterministic for the same seed and step', () => {
    expect(pickThinkingWord('turno-1', 3)).toBe(pickThinkingWord('turno-1', 3))
  })

  it('changes word on each step and wraps around the list', () => {
    const n = thinkingWords().length
    expect(pickThinkingWord('x', 1)).not.toBe(pickThinkingWord('x', 0))
    expect(pickThinkingWord('x', n)).toBe(pickThinkingWord('x', 0))
  })

  it('does not repeat words in the list of any language', () => {
    for (const locale of LOCALES) {
      setLocale(locale)
      const words = thinkingWords()
      expect(words.every((w) => w.trim() === w && w.length > 0)).toBe(true)
      expect(new Set(words).size).toBe(words.length)
    }
  })

  it('uses the words of the current language', () => {
    expect(thinkingWords()).toContain('Matutando')
    setLocale('en')
    expect(thinkingWords()).toContain('Pondering')
    expect(thinkingWords()).toContain(pickThinkingWord('x'))
  })
})
