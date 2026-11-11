import { describe, expect, it } from 'vitest'
import { PLAIN_TEXT } from './language'
import { knownLanguages, languageIdOf, languageIdOfName } from './languageId'

describe('languageId', () => {
  it('language-data names become VS Code ids', () => {
    expect(languageIdOfName('TypeScript')).toBe('typescript')
    expect(languageIdOfName('TSX')).toBe('typescriptreact')
    expect(languageIdOfName('JSX')).toBe('javascriptreact')
    expect(languageIdOfName('C++')).toBe('cpp')
    expect(languageIdOfName('Shell')).toBe('shellscript')
    expect(languageIdOfName('PostgreSQL')).toBe('sql')
    expect(languageIdOfName('Web IDL')).toBe('web-idl')
  })

  it('by the file extension or by the user choice', () => {
    expect(languageIdOf('/a/b.tsx')).toBe('typescriptreact')
    expect(languageIdOf('/a/b.css')).toBe('css')
    expect(languageIdOf('/a/b.tsx', 'HTML')).toBe('html')
    expect(languageIdOf('/a/b.tsx', PLAIN_TEXT)).toBe('plaintext')
    expect(languageIdOf('/a/no-extension')).toBe('plaintext')
  })

  it('lists one language per id', () => {
    const ids = knownLanguages().map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('typescriptreact')
  })
})
