import { describe, expect, it } from 'vitest'
import { basename, dirname, isInside, parentOf, relativeTo, replacePrefix, samePath, sepOf } from './path'

describe('sepOf', () => {
  it('detects "/" in POSIX paths', () => {
    expect(sepOf('/a/b')).toBe('/')
  })
  it('detects "\\" in Windows paths', () => {
    expect(sepOf('C:\\a\\b')).toBe('\\')
  })
  it('uses "/" when there is no separator or they are mixed', () => {
    expect(sepOf('file')).toBe('/')
    expect(sepOf('C:\\a/b')).toBe('/')
  })
})

describe('basename', () => {
  it('returns the last POSIX segment', () => {
    expect(basename('/a/b/c.txt')).toBe('c.txt')
  })
  it('returns the last Windows segment', () => {
    expect(basename('C:\\a\\b\\c.txt')).toBe('c.txt')
  })
  it('ignores a trailing separator', () => {
    expect(basename('/a/b/')).toBe('b')
    expect(basename('C:\\a\\b\\')).toBe('b')
  })
  it('returns the path itself when there are no segments', () => {
    expect(basename('/')).toBe('/')
  })
})

describe('dirname', () => {
  it('returns the parent on POSIX', () => {
    expect(dirname('/a/b/c.txt')).toBe('/a/b')
    expect(dirname('/a/b')).toBe('/a')
  })
  it('returns the parent on Windows', () => {
    expect(dirname('C:\\a\\b\\c.txt')).toBe('C:\\a\\b')
    expect(dirname('C:\\a\\b')).toBe('C:\\a')
  })
  it('returns the POSIX root for direct children of the root', () => {
    expect(dirname('/a')).toBe('/')
    expect(dirname('/')).toBe('/')
  })
  // The parent of "C:\a" is the root "C:\", not "C:" (which on Windows is the current directory of drive C).
  it('keeps the separator on a Windows drive root', () => {
    expect(dirname('C:\\a')).toBe('C:\\')
  })
})

describe('isInside', () => {
  it('recognizes descendants and the directory itself (POSIX)', () => {
    expect(isInside('/a/b', '/a/b/c')).toBe(true)
    expect(isInside('/a/b', '/a/b')).toBe(true)
  })
  it('recognizes descendants and the directory itself (Windows)', () => {
    expect(isInside('C:\\a\\b', 'C:\\a\\b\\c')).toBe(true)
    expect(isInside('C:\\a\\b', 'C:\\a\\b')).toBe(true)
  })
  it('does not confuse similar name prefixes', () => {
    expect(isInside('/a/b', '/a/bc')).toBe(false)
    expect(isInside('C:\\a\\b', 'C:\\a\\bc')).toBe(false)
  })
  it('rejects paths outside or ancestors', () => {
    expect(isInside('/a/b', '/a')).toBe(false)
    expect(isInside('C:\\a', 'D:\\a\\b')).toBe(false)
  })
  it('the disk root contains everything', () => {
    expect(isInside('/', '/a/b')).toBe(true)
    expect(isInside('C:\\', 'C:\\a')).toBe(true)
  })
  it('is exact in case and Unicode form (the prefix is cut by length)', () => {
    expect(isInside('/a/Caf\u00e9', '/a/cafe\u0301/x')).toBe(false)
    expect(isInside('/a/caf\u00e9', '/a/cafe\u0301/x')).toBe(false)
  })
})

describe('relativeTo', () => {
  it('returns a relative POSIX path', () => {
    expect(relativeTo('/a/b', '/a/b/c/d.ts')).toBe('c/d.ts')
  })
  it('returns a relative Windows path with "\\"', () => {
    expect(relativeTo('C:\\a\\b', 'C:\\a\\b\\c\\d.ts')).toBe('c\\d.ts')
  })
  it('returns an empty string for the root itself', () => {
    expect(relativeTo('/a/b', '/a/b')).toBe('')
    expect(relativeTo('C:\\a', 'C:\\a')).toBe('')
  })
  it('the disk root does not lose the first character', () => {
    expect(relativeTo('/', '/a/b.ts')).toBe('a/b.ts')
    expect(relativeTo('C:\\', 'C:\\a\\b.ts')).toBe('a\\b.ts')
  })
  it('returns the original path when it is outside the root', () => {
    expect(relativeTo('/a/b', '/x/y')).toBe('/x/y')
    expect(relativeTo('C:\\a', 'D:\\x')).toBe('D:\\x')
  })
})

describe('replacePrefix', () => {
  it('replaces the prefix of descendants (POSIX)', () => {
    expect(replacePrefix('/a/old/f.ts', '/a/old', '/a/new')).toBe('/a/new/f.ts')
  })
  it('replaces the prefix of descendants (Windows)', () => {
    expect(replacePrefix('C:\\a\\old\\f.ts', 'C:\\a\\old', 'C:\\a\\new')).toBe('C:\\a\\new\\f.ts')
  })
  it('replaces the path itself', () => {
    expect(replacePrefix('/a/old', '/a/old', '/a/new')).toBe('/a/new')
  })
})

describe('samePath', () => {
  it('ignores the trailing separator, and case only where the OS ignores it', () => {
    expect(samePath('/Work/App/', '/work/app', 'darwin')).toBe(true)
    expect(samePath('/Work/App', '/work/app', 'linux')).toBe(false)
    expect(samePath('C:\\Work\\App', 'c:/work/app', 'win32')).toBe(true)
    expect(samePath('/a', '/b', 'darwin')).toBe(false)
  })
  it('unifies NFC/NFD only on macOS', () => {
    expect(samePath('/a/caf\u00e9', '/a/cafe\u0301', 'darwin')).toBe(true)
    expect(samePath('/a/caf\u00e9', '/a/cafe\u0301', 'linux')).toBe(false)
  })
})

describe('parentOf', () => {
  it('returns the folder of the item and ignores the trailing separator', () => {
    expect(parentOf('src/lib/a.ts')).toBe('src/lib')
    expect(parentOf('src/lib/')).toBe('src')
  })

  it('is empty at the root', () => {
    expect(parentOf('a.ts')).toBe('')
    expect(parentOf('src/')).toBe('')
  })
})
