import { describe, expect, it } from 'vitest'
import { revealLabel, splitPathParts, tildePath } from './tildePath'

describe('tildePath', () => {
  it('the home itself becomes ~', () => {
    expect(tildePath('/Users/ana', '/Users/ana', 'darwin')).toBe('~')
    expect(tildePath('/Users/ana/', '/Users/ana', 'darwin')).toBe('~')
  })

  it('subfolders go under ~', () => {
    expect(tildePath('/Users/ana/dev/walph', '/Users/ana', 'darwin')).toBe('~/dev/walph')
    expect(tildePath('/Users/ana/dev/', '/Users/ana/', 'linux')).toBe('~/dev/')
  })

  it('outside the home does not change', () => {
    expect(tildePath('/opt/app', '/Users/ana', 'darwin')).toBe('/opt/app')
    expect(tildePath('/Users/ana', '', 'darwin')).toBe('/Users/ana')
  })

  it('does not confuse a name prefix (/Users/ana2)', () => {
    expect(tildePath('/Users/ana2/app', '/Users/ana', 'darwin')).toBe('/Users/ana2/app')
  })

  it('Windows ignores case and accepts both kinds of slashes', () => {
    expect(tildePath('c:\\users\\Ana\\dev', 'C:\\Users\\ana', 'win32')).toBe('~\\dev')
    expect(tildePath('C:/Users/ana/dev', 'C:\\Users\\ana', 'win32')).toBe('~/dev')
    expect(tildePath('C:\\Users\\ana2\\dev', 'C:\\Users\\ana', 'win32')).toBe('C:\\Users\\ana2\\dev')
  })

  it('Linux/macOS are case-sensitive', () => {
    expect(tildePath('/users/ana/x', '/Users/ana', 'linux')).toBe('/users/ana/x')
  })
})

describe('splitPathParts', () => {
  it('splits the parent folders and the name', () => {
    expect(splitPathParts('~/dev/walph')).toEqual({ parent: '~/dev/', leaf: 'walph' })
    expect(splitPathParts('C:\\Users\\ana\\app\\')).toEqual({ parent: 'C:\\Users\\ana\\', leaf: 'app' })
  })

  it('only ~ or a root have no parent folder', () => {
    expect(splitPathParts('~')).toEqual({ parent: '', leaf: '~' })
    expect(splitPathParts('/')).toEqual({ parent: '', leaf: '/' })
    expect(splitPathParts('/app')).toEqual({ parent: '/', leaf: 'app' })
  })
})

describe('revealLabel', () => {
  it('changes by OS', () => {
    expect(revealLabel('darwin')).toBe('Revelar no Finder')
    expect(revealLabel('win32')).toBe('Mostrar no Explorador')
    expect(revealLabel('linux')).toBe('Abrir na pasta')
  })
})
