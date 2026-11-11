import { describe, expect, it } from 'vitest'
import { globToRegExp } from './glob'

const m = (glob: string, path: string, ic = false): boolean => !!globToRegExp(glob, ic)?.test(path)

describe('globToRegExp', () => {
  it('* and ? do not cross /', () => {
    expect(m('*.ts', 'a.ts')).toBe(true)
    expect(m('*.ts', 'src/a.ts')).toBe(false)
    expect(m('a?.ts', 'ab.ts')).toBe(true)
    expect(m('a?.ts', 'a/.ts')).toBe(false)
  })
  it('** crosses zero or more segments', () => {
    expect(m('**/*.ts', 'a.ts')).toBe(true)
    expect(m('**/*.ts', 'a/b/c.ts')).toBe(true)
    expect(m('src/**/x.ts', 'src/x.ts')).toBe(true)
    expect(m('src/**/x.ts', 'src/a/b/x.ts')).toBe(true)
    expect(m('src/**', 'src/a/b')).toBe(true)
    expect(m('src/**', 'lib/a')).toBe(false)
  })
  it('{a,b} with alternatives and nesting', () => {
    expect(m('**/*.{ts,tsx}', 'a/b.tsx')).toBe(true)
    expect(m('**/*.{ts,tsx}', 'a/b.js')).toBe(false)
    expect(m('{src,lib/{a,b}}/x', 'lib/b/x')).toBe(true)
    expect(m('{**/a,b}', 'x/y/a')).toBe(true)
  })
  it('[...] and [!...]', () => {
    expect(m('f[0-9].ts', 'f3.ts')).toBe(true)
    expect(m('f[0-9].ts', 'fa.ts')).toBe(false)
    expect(m('f[!0-9].ts', 'fa.ts')).toBe(true)
    expect(m('f[!0-9].ts', 'f/.ts')).toBe(false)
  })
  it('escapes literals and honors case only when asked', () => {
    expect(m('a.b+c', 'a.b+c')).toBe(true)
    expect(m('a.b', 'axb')).toBe(false)
    expect(m('A.ts', 'a.ts')).toBe(false)
    expect(m('A.ts', 'a.ts', true)).toBe(true)
  })
  it('an invalid or too large pattern becomes null', () => {
    expect(globToRegExp('')).toBeNull()
    expect(globToRegExp('{a,b')).toBeNull()
    expect(globToRegExp('x'.repeat(600))).toBeNull()
    expect(globToRegExp('a[')).not.toBeNull()
  })
})
