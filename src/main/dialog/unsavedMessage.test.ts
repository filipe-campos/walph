import { describe, expect, it } from 'vitest'
import { buildUnsavedMessage, parseFileNames } from './unsavedMessage'

describe('buildUnsavedMessage', () => {
  it('one file', () => {
    const m = buildUnsavedMessage(['a.ts'])
    expect(m.message).toBe('Deseja salvar as alterações feitas em "a.ts"?')
    expect(m.detail).toBe('Suas alterações serão perdidas se você não salvá-las.')
  })

  it('several files list the names and cap at 10', () => {
    const names = Array.from({ length: 13 }, (_, i) => `f${i}.ts`)
    const m = buildUnsavedMessage(names)
    expect(m.message).toBe('Deseja salvar as alterações em 13 arquivos?')
    expect(m.detail).toContain('• f9.ts')
    expect(m.detail).not.toContain('f10.ts')
    expect(m.detail).toContain('e mais 3…')
    expect(m.detail.endsWith('Suas alterações serão perdidas se você não salvá-las.')).toBe(true)
  })
})

describe('name sanitization', () => {
  it('replaces line breaks and control chars with a space and truncates long names', () => {
    const m = buildUnsavedMessage(['a\nb\u0007c.ts'])
    expect(m.message).toBe('Deseja salvar as alterações feitas em "a b c.ts"?')
    const long = buildUnsavedMessage(['x'.repeat(200)])
    expect(long.message).toContain(`${'x'.repeat(79)}…`)
    expect(long.message).not.toContain('x'.repeat(80))
  })
})

describe('parseFileNames', () => {
  it('rejects invalid inputs', () => {
    expect(parseFileNames(undefined)).toBeNull()
    expect(parseFileNames([])).toBeNull()
    expect(parseFileNames(['a', 1])).toBeNull()
    expect(parseFileNames('a')).toBeNull()
  })
  it('accepts a list of strings', () => {
    expect(parseFileNames(['a'])).toEqual(['a'])
  })
})

describe('buildUnsavedMessage at the limits', () => {
  const tail = 'Suas alterações serão perdidas se você não salvá-las.'
  it('two files use the plural and list with a bullet', () => {
    const m = buildUnsavedMessage(['a.ts', 'b.ts'])
    expect(m.message).toBe('Deseja salvar as alterações em 2 arquivos?')
    expect(m.detail).toBe(`• a.ts\n• b.ts\n\n${tail}`)
  })
  it('exactly 10 files do not show "e mais"', () => {
    const names = Array.from({ length: 10 }, (_, i) => `f${i}.ts`)
    const m = buildUnsavedMessage(names)
    expect(m.detail).toContain('• f9.ts')
    expect(m.detail).not.toContain('e mais')
  })
  it('11 files show "e mais 1…"', () => {
    const names = Array.from({ length: 11 }, (_, i) => `f${i}.ts`)
    const m = buildUnsavedMessage(names)
    expect(m.detail).toContain('e mais 1…')
    expect(m.message).toContain('11 arquivos')
  })
  it('names with quotes and accents appear as given', () => {
    expect(buildUnsavedMessage(['ação "x".md']).message).toBe('Deseja salvar as alterações feitas em "ação "x".md"?')
  })
})

describe('parseFileNames with hostile inputs', () => {
  it('rejects null, an object and a list with null', () => {
    expect(parseFileNames(null)).toBeNull()
    expect(parseFileNames({ length: 1, 0: 'a' })).toBeNull()
    expect(parseFileNames(['a', null])).toBeNull()
  })
})
