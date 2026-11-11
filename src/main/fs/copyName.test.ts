import { describe, expect, it } from 'vitest'
import { nextCopyName } from './copyName'

const taking =
  (...names: string[]) =>
  (c: string) =>
    names.includes(c)

describe('nextCopyName', () => {
  it('inserts "copy" before the extension', () => {
    expect(nextCopyName('a.ts', taking())).toBe('a copy.ts')
  })

  it('numbers when the copy already exists', () => {
    expect(nextCopyName('a.ts', taking('a copy.ts'))).toBe('a copy 2.ts')
    expect(nextCopyName('a.ts', taking('a copy.ts', 'a copy 2.ts'))).toBe('a copy 3.ts')
  })

  it('does not chain suffixes when copying a copy', () => {
    expect(nextCopyName('a copy.ts', taking('a copy.ts'))).toBe('a copy 2.ts')
    expect(nextCopyName('a copy 2.ts', taking('a copy.ts', 'a copy 2.ts'))).toBe('a copy 3.ts')
  })

  it('only the last extension is preserved', () => {
    expect(nextCopyName('x.tar.gz', taking())).toBe('x.tar copy.gz')
  })

  it('hidden files and files without extension get the suffix at the end', () => {
    expect(nextCopyName('.env', taking())).toBe('.env copy')
    expect(nextCopyName('Makefile', taking())).toBe('Makefile copy')
  })

  it('folders do not split an extension', () => {
    expect(nextCopyName('v1.2', taking(), true)).toBe('v1.2 copy')
  })
})
