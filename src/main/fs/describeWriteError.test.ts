import { describe, expect, it } from 'vitest'
import { UserError } from '../errors'
import { describeWriteError } from './describeWriteError'

const errno = (code: string): Error => Object.assign(new Error(code), { code })

describe('describeWriteError', () => {
  it('translates the common errnos', () => {
    for (const code of ['EACCES', 'EPERM', 'ENOTDIR', 'EISDIR', 'ENOSPC', 'EROFS']) {
      const e = describeWriteError(errno(code), '/p/a.ts')
      expect(e.message).toContain('a.ts')
      expect(e.message).not.toBe(code)
    }
  })
  it('translates unknown errors keeping the original detail', () => {
    const e = describeWriteError(errno('EBUSY'), '/p/a.ts')
    expect(e).toBeInstanceOf(UserError)
    expect(e.message).toBe('Não foi possível gravar "a.ts": EBUSY')
  })

  it('keeps the UserError as is', () => {
    const original = new UserError('ready')
    expect(describeWriteError(original, '/p/a.ts')).toBe(original)
  })

  it('uses the overrides message before the default translation', () => {
    const e = describeWriteError(errno('ENOENT'), '/p/a.ts', { overrides: { ENOENT: 'gone' } })
    expect(e.message).toBe('gone')
    expect(describeWriteError(errno('EACCES'), '/p/a.ts', { overrides: { EACCES: 'x' } }).message).toBe('x')
  })

  it('uses the fallback only for errors without a translation', () => {
    const fallback = (name: string, message: string): string => `${name}:${message}`
    expect(describeWriteError(errno('EXYZ'), '/p/a.ts', { fallback }).message).toBe('a.ts:EXYZ')
    expect(describeWriteError('boom', '/p/a.ts', { fallback }).message).toBe('a.ts:boom')
    expect(describeWriteError(errno('ENOSPC'), '/p/a.ts', { fallback }).message).not.toContain('ENOSPC')
  })

  it('wraps values that are not Error', () => {
    expect(describeWriteError('boom', '/p/a.ts').message).toBe('Não foi possível gravar "a.ts": boom')
  })
})
