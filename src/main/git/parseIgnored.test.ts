import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_IGNORED, parseIgnored } from './parseIgnored'

const root = join('/', 'repo')

describe('parseIgnored', () => {
  it('splits by NUL and joins with the root', () => {
    expect(parseIgnored('a.log\0dist/b.js\0', root)).toEqual([join(root, 'a.log'), join(root, 'dist/b.js')])
  })
  it('strips the trailing slash of collapsed folders', () => {
    expect(parseIgnored('node_modules/\0', root)).toEqual([join(root, 'node_modules')])
  })
  it('ignores empty entries', () => {
    expect(parseIgnored('', root)).toEqual([])
    expect(parseIgnored('\0\0a\0/\0', root)).toEqual([join(root, 'a')])
  })
  it('drops entries inside an already listed folder', () => {
    expect(parseIgnored('foo/\0foo/a.log\0foo/bar/b\0foobar.log\0', root)).toEqual([
      join(root, 'foo'),
      join(root, 'foobar.log')
    ])
  })
  it('applies the cap after dropping the redundant ones', () => {
    const inner = Array.from({ length: MAX_IGNORED }, (_, i) => `d/f${i}`).join('\0')
    expect(parseIgnored(`${inner}\0d/\0z`, root)).toEqual([join(root, 'd'), join(root, 'z')])
  })
  it('caps the number of entries', () => {
    const out = Array.from({ length: MAX_IGNORED + 10 }, (_, i) => `f${i}`).join('\0')
    expect(parseIgnored(out, root)).toHaveLength(MAX_IGNORED)
  })
})
