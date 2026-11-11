import { describe, expect, it } from 'vitest'
import { COMPOSE_PROJECT, resolveContainerRef } from './refs'

const known = [
  { id: 'abcdef012345', name: 'web' },
  { id: '0123456789ab', name: 'db-1' }
]

describe('resolveContainerRef', () => {
  it('accepts a hexadecimal id of 12 to 64 digits', () => {
    expect(resolveContainerRef('abcdef012345', [])).toBe('abcdef012345')
    expect(resolveContainerRef('a'.repeat(64), [])).toBe('a'.repeat(64))
  })
  it('converts the name of a known container into its id', () => {
    expect(resolveContainerRef('db-1', known)).toBe('0123456789ab')
  })
  it('rejects an unknown name with a pt-BR message', () => {
    expect(() => resolveContainerRef('other', known)).toThrow(/Container desconhecido/)
  })
  it('rejects a short, long or uppercase id', () => {
    for (const bad of ['abc', 'a'.repeat(65), 'ABCDEF012345', 'abcdef01234g'])
      expect(() => resolveContainerRef(bad, [])).toThrow(/Container desconhecido/)
  })
  it('never lets through anything that looks like an option or command', () => {
    for (const bad of ['--privileged', '-v', 'web; rm -rf /', '$(id)', ''])
      expect(() => resolveContainerRef(bad, known)).toThrow()
  })
  it('rejects values that are not text', () => {
    for (const bad of [undefined, null, 42, {}, ['abcdef012345']])
      expect(() => resolveContainerRef(bad, known)).toThrow()
  })
})

describe('COMPOSE_PROJECT', () => {
  it('accepts valid compose names', () => {
    for (const ok of ['app', 'my-app_2', '0abc']) expect(COMPOSE_PROJECT.test(ok)).toBe(true)
  })
  it('rejects uppercase, options, spaces and separators', () => {
    for (const bad of ['App', '-p', '_x', 'a b', 'a/b', 'a;b', '..', '']) expect(COMPOSE_PROJECT.test(bad)).toBe(false)
  })
})
