import { describe, expect, it } from 'vitest'
import { compileExcludes, compileGlob } from './glob'

const m = (glob: string, rel: string): boolean => compileGlob(glob)!(rel)

describe('compileGlob', () => {
  it('a pattern without a slash and without **/ applies only at the root', () => {
    expect(m('dist', 'dist')).toBe(true)
    expect(m('dist', 'src/dist')).toBe(false)
    expect(m('dist', 'distro')).toBe(false)
  })

  it('**/ matches at any depth', () => {
    expect(m('**/dist', 'dist')).toBe(true)
    expect(m('**/dist', 'src/dist')).toBe(true)
    expect(m('**/dist', 'a/b/c/dist')).toBe(true)
    expect(m('**/dist', 'a/mydist')).toBe(false)
  })

  it('a matched folder hides everything inside it', () => {
    expect(m('**/dist', 'dist/index.js')).toBe(true)
    expect(m('**/dist', 'src/dist/a/b.js')).toBe(true)
    expect(m('build', 'build/out/x')).toBe(true)
  })

  it('* does not cross slashes', () => {
    expect(m('src/*.ts', 'src/a.ts')).toBe(true)
    expect(m('src/*.ts', 'src/sub/a.ts')).toBe(false)
    expect(m('*.log', 'a.log')).toBe(true)
    expect(m('*.log', 'logs/a.log')).toBe(false)
    expect(m('**/*.log', 'logs/a.log')).toBe(true)
  })

  it('? matches one character', () => {
    expect(m('a?c', 'abc')).toBe(true)
    expect(m('a?c', 'ac')).toBe(false)
    expect(m('a?c', 'a/c')).toBe(false)
  })

  it('{a,b} and nesting', () => {
    expect(m('**/{node_modules,dist}', 'x/node_modules')).toBe(true)
    expect(m('**/{node_modules,dist}', 'dist')).toBe(true)
    expect(m('**/{node_modules,dist}', 'src')).toBe(false)
    expect(m('*.{ts,{js,mjs}}', 'a.mjs')).toBe(true)
    expect(m('*.{ts,{js,mjs}}', 'a.css')).toBe(false)
  })

  it('[abc] and negation', () => {
    expect(m('file[12].txt', 'file1.txt')).toBe(true)
    expect(m('file[12].txt', 'file3.txt')).toBe(false)
    expect(m('file[!12].txt', 'file3.txt')).toBe(true)
    expect(m('file[!12].txt', 'file1.txt')).toBe(false)
  })

  it('dir/** matches the content and dir itself; a/**/b matches zero or more levels', () => {
    expect(m('out/**', 'out/a/b')).toBe(true)
    expect(m('out/**', 'out')).toBe(true)
    expect(m('out/**', 'outer')).toBe(false)
    expect(m('a/**/b', 'a/b')).toBe(true)
    expect(m('a/**/b', 'a/x/y/b')).toBe(true)
  })

  it('escapes regex special characters and ignores ./ and a trailing slash', () => {
    expect(m('.git', '.git')).toBe(true)
    expect(m('.git', 'xgit')).toBe(false)
    expect(m('a+b', 'a+b')).toBe(true)
    expect(m('./dist/', 'dist')).toBe(true)
  })

  it('an empty pattern is invalid; an unclosed bracket is literal', () => {
    expect(compileGlob('')).toBeNull()
    expect(compileGlob('  ')).toBeNull()
    expect(m('a[b', 'a[b')).toBe(true)
  })
})

describe('compileExcludes', () => {
  it('combines patterns and ignores invalid ones', () => {
    const matcher = compileExcludes(['**/dist', '', '*.log'])
    expect(matcher.empty).toBe(false)
    expect(matcher.matches('src/dist/a.js')).toBe(true)
    expect(matcher.matches('a.log')).toBe(true)
    expect(matcher.matches('src/a.ts')).toBe(false)
  })

  it('an empty list matches nothing', () => {
    const matcher = compileExcludes([])
    expect(matcher.empty).toBe(true)
    expect(matcher.matches('dist')).toBe(false)
  })
})
