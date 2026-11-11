import { describe, expect, it } from 'vitest'
import { buildIgnoredSet, isGitIgnored } from './gitIgnored'

describe('isGitIgnored', () => {
  const set = buildIgnoredSet(['/repo/node_modules', '/repo/dist/app.js', '/repo/.env/'], 'linux')

  it('marks the path itself and the descendants of an ignored folder', () => {
    expect(isGitIgnored(set, '/repo/node_modules', '/repo', 'linux')).toBe(true)
    expect(isGitIgnored(set, '/repo/node_modules/a/b.js', '/repo', 'linux')).toBe(true)
    expect(isGitIgnored(set, '/repo/dist/app.js', '/repo', 'linux')).toBe(true)
    expect(isGitIgnored(set, '/repo/.env', '/repo', 'linux')).toBe(true)
  })

  it('does not mark siblings, similar prefixes or the root', () => {
    expect(isGitIgnored(set, '/repo/dist/other.js', '/repo', 'linux')).toBe(false)
    expect(isGitIgnored(set, '/repo/node_modules2/x', '/repo', 'linux')).toBe(false)
    expect(isGitIgnored(set, '/repo/src/a.ts', '/repo', 'linux')).toBe(false)
    expect(isGitIgnored(buildIgnoredSet(['/repo'], 'linux'), '/repo/a.ts', '/repo', 'linux')).toBe(false)
  })

  it('ignores the ancestor above the root and handles missing data', () => {
    expect(isGitIgnored(buildIgnoredSet(['/'], 'linux'), '/repo/a', '/repo', 'linux')).toBe(false)
    expect(isGitIgnored(buildIgnoredSet(undefined, 'linux'), '/repo/a', '/repo', 'linux')).toBe(false)
  })

  it('accepts both slashes on Windows and ignores case', () => {
    const win = buildIgnoredSet(['C:\\Repo\\node_modules'], 'win32')
    expect(isGitIgnored(win, 'c:\\repo\\node_modules\\x\\y.js', 'C:\\Repo', 'win32')).toBe(true)
    expect(isGitIgnored(win, 'C:/Repo/node_modules/x', 'C:\\Repo', 'win32')).toBe(true)
    expect(isGitIgnored(win, 'C:\\Repo\\src\\a.ts', 'C:\\Repo', 'win32')).toBe(false)
  })
})
