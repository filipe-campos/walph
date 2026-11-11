import { describe, expect, it } from 'vitest'
import { encodingEntries, languageEntries } from './statusPickers'

describe('languageEntries', () => {
  it('without a choice only the automatic one is current', () => {
    const current = languageEntries('/a/b.ts', null).filter((e) => e.current)
    expect(current.map((e) => e.name)).toEqual([null])
  })
  it('with a choice only it is current', () => {
    const current = languageEntries('/a/b.ts', 'Python').filter((e) => e.current)
    expect(current.map((e) => e.name)).toEqual(['Python'])
  })
  it('the automatic one shows what the extension detects', () => {
    expect(languageEntries('/a/b.ts', 'Python')[0].label).toContain('TypeScript')
  })
})

describe('encodingEntries', () => {
  it('marks "atual" only in the Reabrir section', () => {
    const tagged = encodingEntries('utf16le', false).filter((e) => e.tag === 'atual')
    expect(tagged).toHaveLength(1)
    expect(tagged[0]).toMatchObject({ action: 'reopen', encoding: 'utf16le' })
  })
  it('a dirty tab warns that reopening discards', () => {
    const entries = encodingEntries('utf8', true)
    expect(entries.find((e) => e.action === 'reopen' && e.encoding === 'utf16be')?.tag).toBe('descarta alterações')
    expect(entries.filter((e) => e.action === 'save').every((e) => e.tag === undefined)).toBe(true)
  })
})
