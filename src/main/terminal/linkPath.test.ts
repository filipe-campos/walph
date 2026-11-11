import { describe, expect, it } from 'vitest'
import { expandHome, parseLsofCwd, respellUnderRoot } from './linkPath'

describe('parseLsofCwd', () => {
  it('reads the n line', () => {
    expect(parseLsofCwd('p123\nfcwd\nn/Users/me/my project\n')).toBe('/Users/me/my project')
  })
  it('decodes lsof escapes (UTF-8 per byte, backslash, control)', () => {
    expect(parseLsofCwd('n/Users/me/\\xc3\\x81rea \\xc3\\xa7\\xc3\\xa3o\n')).toBe('/Users/me/Área ção')
    expect(parseLsofCwd('n/tmp/a\\\\b\n')).toBe('/tmp/a\\b')
    expect(parseLsofCwd('n/tmp/a\\tb\n')).toBe('/tmp/a\tb')
    // Control chars come out as `^A` without a backslash (ambiguous with a literal `^`): kept as is.
    expect(parseLsofCwd('n/tmp/a^Ab\n')).toBe('/tmp/a^Ab')
    expect(parseLsofCwd('n/tmp/Área\n')).toBe('/tmp/Área')
  })
  it('an invalid escape or broken UTF-8 becomes null', () => {
    expect(parseLsofCwd('n/tmp/\\xZZ\n')).toBeNull()
    expect(parseLsofCwd('n/tmp/\\xc3\n')).toBeNull()
    expect(parseLsofCwd('n/tmp/x\\\n')).toBeNull()
  })
  it('null without an n line', () => {
    expect(parseLsofCwd('p123\nfcwd\n')).toBeNull()
    expect(parseLsofCwd('')).toBeNull()
  })
})

describe('expandHome', () => {
  it('expands ~ and ~/', () => {
    expect(expandHome('~', '/h', 'linux')).toBe('/h')
    expect(expandHome('~/a/b.ts', '/h', 'linux')).toBe('/h/a/b.ts')
    expect(expandHome('~x/a', '/h', 'linux')).toBe('~x/a')
    expect(expandHome('a/~', '/h', 'linux')).toBe('a/~')
  })
})

describe('respellUnderRoot', () => {
  it('rewrites in the spelling of the window folder', () => {
    expect(respellUnderRoot('/private/tmp/p/src/a.ts', '/private/tmp/p', '/tmp/p', 'darwin')).toBe('/tmp/p/src/a.ts')
    expect(respellUnderRoot('/private/tmp/p', '/private/tmp/p', '/tmp/p', 'darwin')).toBe('/tmp/p')
  })
  it('compares case-insensitively on macOS and case-sensitively on Linux', () => {
    expect(respellUnderRoot('/PRIVATE/tmp/p/A.ts', '/private/tmp/p', '/tmp/p', 'darwin')).toBe('/tmp/p/A.ts')
    expect(respellUnderRoot('/PRIVATE/tmp/p/a.ts', '/private/tmp/p', '/tmp/p', 'linux')).toBe('/PRIVATE/tmp/p/a.ts')
  })
  it('outside the folder (or a sibling with the same prefix) does not change', () => {
    expect(respellUnderRoot('/etc/hosts', '/private/tmp/p', '/tmp/p', 'darwin')).toBe('/etc/hosts')
    expect(respellUnderRoot('/private/tmp/p2/a.ts', '/private/tmp/p', '/tmp/p', 'darwin')).toBe('/private/tmp/p2/a.ts')
  })
})
