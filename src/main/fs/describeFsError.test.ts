import { describe, expect, it } from 'vitest'
import { UserError } from '../errors'
import { describeFsError } from './describeFsError'

const errno = (code: string): Error => Object.assign(new Error(`${code}: raw`), { code })

describe('describeFsError', () => {
  it('translates the common errnos and never leaks the raw text', () => {
    for (const code of ['ENOENT', 'EEXIST', 'ENOTEMPTY', 'EACCES', 'EPERM', 'ENOTDIR', 'EISDIR']) {
      const e = describeFsError(errno(code), '/p/a.ts')
      expect(e).toBeInstanceOf(UserError)
      expect(e.message).toContain('a.ts')
      expect(e.message).not.toContain('raw')
    }
  })

  it('uses the error message for unknown codes and keeps the cause', () => {
    const original = errno('EXYZ')
    const e = describeFsError(original, '/p/a.ts')
    expect(e.message).toContain('EXYZ: raw')
    expect(e.cause).toBe(original)
  })

  it('passes a UserError through as is', () => {
    const own = new UserError('ready')
    expect(describeFsError(own, '/p/a.ts')).toBe(own)
  })
})
