import { describe, expect, it } from 'vitest'
import { describeMoveError, planMove, rebaseUnderRoot } from './movePlan'

describe('planMove', () => {
  it('builds the destination with the same name', () => {
    expect(planMove('/r', '/r/a/x.ts', '/r/b', 'linux')).toEqual({ kind: 'move', destination: '/r/b/x.ts' })
  })
  it('same source folder is a no-op', () => {
    expect(planMove('/r', '/r/a/x.ts', '/r/a/', 'linux')).toEqual({ kind: 'noop', path: '/r/a/x.ts' })
  })
  it('refuses to move the root', () => {
    expect(() => planMove('/r', '/r', '/r/a', 'linux')).toThrow('pasta aberta')
  })
  it('refuses a folder into itself or into a descendant', () => {
    expect(() => planMove('/r', '/r/a', '/r/a', 'linux')).toThrow('dentro dela mesma')
    expect(() => planMove('/r', '/r/a', '/r/a/b/c', 'linux')).toThrow('dentro dela mesma')
  })
  it('a similar prefix is not a descendant', () => {
    expect(planMove('/r', '/r/a', '/r/ab', 'linux')).toEqual({ kind: 'move', destination: '/r/ab/a' })
  })
  it('ignores case on macOS and Windows', () => {
    expect(() => planMove('/r', '/r/A', '/r/a/b', 'darwin')).toThrow('dentro dela mesma')
    expect(planMove('C:\\r', 'C:\\r\\a\\x', 'c:\\R\\a', 'win32')).toEqual({ kind: 'noop', path: 'C:\\r\\a\\x' })
  })
})

describe('describeMoveError', () => {
  const e = (code: string): Error => Object.assign(new Error('x'), { code })
  it('maps errnos to pt-BR', () => {
    expect(describeMoveError(e('EXDEV'), 'a', 'linux')?.message).toContain('outro volume')
    expect(describeMoveError(e('ENOTEMPTY'), 'a', 'linux')?.message).toBe('Já existe: a')
    expect(describeMoveError(e('EEXIST'), 'a', 'linux')?.message).toBe('Já existe: a')
    expect(describeMoveError(e('EINVAL'), 'a', 'linux')?.message).toContain('dentro dela mesma')
    expect(describeMoveError(e('EBUSY'), 'a', 'linux')?.message).toContain('em uso')
  })
  it('EPERM depends on the platform', () => {
    expect(describeMoveError(e('EPERM'), 'a', 'win32')?.message).toBe('O item está em uso por outro programa.')
    expect(describeMoveError(e('EPERM'), 'a', 'linux')?.message).toBe('Sem permissão para mover.')
  })
  it('unknown returns null and keeps the cause in the known ones', () => {
    expect(describeMoveError(e('EWHAT'), 'a')).toBeNull()
    expect(describeMoveError(e('EXDEV'), 'a')?.cause).toBeInstanceOf(Error)
  })
})

describe('rebaseUnderRoot', () => {
  it('returns in the spelling of the window folder', () => {
    expect(rebaseUnderRoot('/tmp/r', '/private/tmp/r', '/private/tmp/r/a/b', 'linux')).toBe('/tmp/r/a/b')
    expect(rebaseUnderRoot('/tmp/r', '/private/tmp/r', '/private/tmp/r', 'linux')).toBe('/tmp/r')
  })
  it('outside the root stays as is', () => {
    expect(rebaseUnderRoot('/tmp/r', '/private/tmp/r', '/x/y', 'linux')).toBe('/x/y')
  })
})
