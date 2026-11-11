import { describe, expect, it } from 'vitest'
import { omitUndefined } from './omitUndefined'

describe('omitUndefined', () => {
  it('removes undefined keys and keeps null, empty and zero', () => {
    expect(omitUndefined({ a: 1, b: undefined, c: null, d: '', e: 0 })).toStrictEqual({ a: 1, c: null, d: '', e: 0 })
  })

  it('does not touch the original object', () => {
    const src = { a: undefined }
    omitUndefined(src)
    expect('a' in src).toBe(true)
  })
})
