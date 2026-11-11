import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { assertAbsolutePath, assertValidName, isAbsolutePathInput, parseAbsolutePath } from './validate'

describe('assertAbsolutePath', () => {
  it('accepts an absolute path', () => {
    expect(assertAbsolutePath(process.cwd())).toBe(process.cwd())
  })

  it.each([undefined, null, 1, {}, '', 'relative/x', './x', 'a\0b'])('refuses %j', (value) => {
    expect(() => assertAbsolutePath(value)).toThrow('Caminho inválido')
  })
})

describe('assertValidName', () => {
  it('accepts simple names', () => {
    expect(assertValidName('a.txt')).toBe('a.txt')
    expect(assertValidName('.env')).toBe('.env')
  })

  it.each([undefined, 3, '', '.', '..', 'a/b', 'a\\b', 'a\0b'])('refuses %j', (value) => {
    expect(() => assertValidName(value)).toThrow('Nome inválido')
  })
})

describe('isAbsolutePathInput', () => {
  it('accepts only absolute text without a null byte', () => {
    expect(isAbsolutePathInput(process.cwd())).toBe(true)
    for (const value of [undefined, null, 1, {}, '', 'x/y', 'a\0b']) expect(isAbsolutePathInput(value)).toBe(false)
  })
})

describe('parseAbsolutePath', () => {
  it('normalizes the path', () => {
    expect(parseAbsolutePath(`${process.cwd()}/a/../b`)).toBe(resolve(process.cwd(), 'b'))
  })

  it("uses the caller's message, or the default one", () => {
    expect(() => parseAbsolutePath('x', 'Bad folder')).toThrow('Bad folder')
    expect(() => parseAbsolutePath('a\0b')).toThrow('Caminho inválido')
  })
})
