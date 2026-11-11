import { posix, win32 } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { comparePaths, isInside, pathKey, pathTail, samePath } from './pathCompare'

describe('samePath', () => {
  it('ignores trailing slash and redundant segments', () => {
    expect(samePath('/a/b/', '/a/b', 'linux')).toBe(true)
    expect(samePath('/a/./b/../b', '/a/b', 'linux')).toBe(true)
  })

  it('is case-sensitive on linux', () => {
    expect(samePath('/a/Foo', '/a/foo', 'linux')).toBe(false)
  })

  it('ignores case on macOS and Windows', () => {
    expect(samePath('/Users/Foo', '/users/foo', 'darwin')).toBe(true)
    expect(samePath('C:\\Proj\\App', 'c:\\proj\\app\\', 'win32')).toBe(true)
  })

  it('unifies the Unicode form on macOS', () => {
    expect(samePath('/a/caf\u00e9', '/a/cafe\u0301', 'darwin')).toBe(true)
  })

  it('different paths do not match', () => {
    expect(samePath('/a/b', '/a/c', 'darwin')).toBe(false)
    expect(pathKey('/', 'linux')).toBe('/')
  })
})

describe('pathKey (per-platform matrix)', () => {
  it('resolves, drops the trailing slash and only ignores case where the OS does', () => {
    expect(pathKey('/a/B/', 'linux')).toBe('/a/B')
    expect(pathKey('/a/B/', 'darwin')).toBe('/a/b')
    expect(pathKey('C:\\A\\B\\', 'win32')).toBe('c:\\a\\b')
  })

  it('on Windows "/" and "\\" are the same', () => {
    expect(pathKey('C:/Proj/App', 'win32')).toBe(pathKey('c:\\proj\\app', 'win32'))
  })

  it('NFC only on macOS (and only with nfc on)', () => {
    const nfd = '/a/cafe\u0301'
    expect(pathKey(nfd, 'darwin')).toBe('/a/caf\u00e9')
    expect(pathKey(nfd, 'linux')).toBe(nfd)
    expect(pathKey(nfd, 'win32')).not.toBe(pathKey('/a/caf\u00e9', 'win32'))
    expect(pathKey(nfd, 'darwin', { nfc: false })).toBe(nfd)
  })

  it('caseSensitive keeps the case on any platform', () => {
    expect(pathKey('/A/b', 'darwin', { caseSensitive: true })).toBe('/A/b')
    expect(pathKey('C:\\A', 'win32', { caseSensitive: true })).toBe('C:\\A')
  })

  it('resolve:false only normalizes (LSP lexical key)', () => {
    expect(pathKey('/a/./b/', 'linux', { resolve: false })).toBe('/a/b/')
    expect(pathKey('c:\\Users\\Foo\\x.ts', 'win32', { resolve: false, nfc: false })).toBe(
      pathKey('C:/users/foo/X.ts', 'win32', { resolve: false, nfc: false })
    )
  })

  it('the session file key does not change (saved sessions depend on it)', () => {
    expect(pathKey('/Users/Filipe/Proj/', 'darwin')).toBe('/users/filipe/proj')
    expect(pathKey('/home/f/Proj', 'linux')).toBe('/home/f/Proj')
    expect(pathKey('C:\\Proj', 'win32')).toBe('c:\\proj')
  })
})

describe('isInside', () => {
  it('accepts the root itself and descendants; strict excludes the root', () => {
    expect(isInside('/a/b', '/a/b', { platform: 'linux' })).toBe(true)
    expect(isInside('/a/b', '/a/b/c.ts', { platform: 'linux' })).toBe(true)
    expect(isInside('/a/b', '/a/b', { platform: 'linux', strict: true })).toBe(false)
    expect(isInside('/a/b', '/a/b/c.ts', { platform: 'linux', strict: true })).toBe(true)
  })

  it('compares by segments and rejects parents and siblings', () => {
    expect(isInside('/a/b', '/a/bc/c.ts', { platform: 'linux' })).toBe(false)
    expect(isInside('/a/b', '/a', { platform: 'linux' })).toBe(false)
    expect(isInside('/ws', '/ws-evil/x', { platform: 'linux' })).toBe(false)
  })

  it('".." only as a whole segment', () => {
    expect(isInside('/ws', '/ws/..x/settings.json', { platform: 'linux' })).toBe(true)
    expect(isInside('/ws', '/ws/..', { platform: 'linux' })).toBe(false)
    expect(isInside('/ws', '/ws/../x', { platform: 'linux' })).toBe(false)
  })

  it('case: ignored on macOS/Windows, exact on Linux or with caseSensitive', () => {
    expect(isInside('/Users/Foo', '/users/foo/a', { platform: 'darwin' })).toBe(true)
    expect(isInside('/Users/Foo', '/users/foo/a', { platform: 'linux' })).toBe(false)
    expect(isInside('/Users/Foo', '/users/foo/a', { platform: 'darwin', caseSensitive: true })).toBe(false)
    expect(isInside('C:\\proj', 'c:\\PROJ\\src\\a.ts', { platform: 'win32' })).toBe(true)
  })

  it('rejects another drive on Windows', () => {
    expect(isInside('C:\\ws', 'D:\\ws\\.walph\\settings.json', { platform: 'win32' })).toBe(false)
    expect(isInside('C:\\ws', 'C:\\ws\\.walph\\settings.json', { platform: 'win32' })).toBe(true)
    expect(isInside('C:\\ws', 'C:\\ws2\\x', { platform: 'win32' })).toBe(false)
  })

  it('".." of relative paths only at the start', () => {
    expect(isInside('..', '../x', { platform: 'linux' })).toBe(true)
    expect(isInside('..', '../..', { platform: 'linux' })).toBe(false)
  })
})

describe('NFC/NFD (matrix)', () => {
  const nfc = '/Users/f/Caf\u00e9'
  const nfd = '/Users/f/Cafe\u0301'

  it.each([
    ['darwin', true],
    ['linux', false],
    ['win32', false]
  ])('%s: same folder with another Unicode form = %s', (platform, same) => {
    expect(samePath(nfc, nfd, platform)).toBe(same)
    expect(isInside(nfc, `${nfd}/a.ts`, { platform })).toBe(same)
    expect(isInside(nfd, `${nfc}/a.ts`, { platform, strict: true })).toBe(same)
  })

  it('macOS: nfc:false tells them apart again', () => {
    expect(isInside(nfc, `${nfd}/a.ts`, { platform: 'darwin', nfc: false })).toBe(false)
    expect(samePath(nfc, nfd, 'darwin', { nfc: false })).toBe(false)
  })

  it('macOS: NFC also applies with caseSensitive (realpath paths)', () => {
    expect(isInside(nfc, `${nfd}/a.ts`, { platform: 'darwin', caseSensitive: true })).toBe(true)
    expect(isInside(nfc.toLowerCase(), `${nfd}/a.ts`, { platform: 'darwin', caseSensitive: true })).toBe(false)
  })
})

describe('parity with node:path', () => {
  const inputs = {
    posix: [
      '/',
      '/a',
      '/a/',
      '/a//b',
      '/a/./b/../c',
      '/a/b/..',
      '/..',
      '/../a',
      'a',
      'a/',
      './a',
      'a/../..',
      '',
      '.',
      '//a'
    ],
    win32: [
      'C:\\',
      'C:\\a\\',
      'C:/a//b',
      'c:\\a\\.\\b\\..\\c',
      'C:\\..',
      'C:a\\b',
      'C:',
      '\\a',
      '\\\\srv\\share\\x\\..\\y',
      '\\\\srv\\share',
      '\\\\srv\\\\share\\x',
      'a\\b',
      '..\\a'
    ]
  }

  // The cwd is pinned: `posix.resolve` uses the OS cwd (on Windows, `D:\\x` becomes `/x`), which is not a posix cwd.
  it.each(inputs.posix)('posix normalize/resolve of %j', (input) => {
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue('/work/dir')
    try {
      expect(pathKey(input, 'linux', { resolve: false })).toBe(posix.normalize(input))
      expect(pathKey(input, 'linux')).toBe(posix.resolve('/work/dir', input))
    } finally {
      cwd.mockRestore()
    }
  })

  it.each(inputs.win32)('win32 normalize of %j', (input) => {
    expect(pathKey(input, 'win32', { resolve: false, caseSensitive: true })).toBe(win32.normalize(input))
  })

  it.each(['a\\b', '..\\a', '.', '', '\\a', 'a\\..\\..\\..'])('win32 relative resolve of %j, fixed cwd', (input) => {
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue('C:\\work\\dir')
    try {
      expect(pathKey(input, 'win32', { caseSensitive: true })).toBe(win32.resolve('C:\\work\\dir', input))
    } finally {
      cwd.mockRestore()
    }
  })

  // Only absolute paths with drive/UNC: the rest depends on Windows' per-drive cwd, which Node simulates differently.
  it.each(['C:\\', 'C:\\a\\', 'C:/a//b', 'c:\\a\\.\\b\\..\\c', 'C:\\..', '\\\\srv\\share\\x\\..\\y'])(
    'win32 resolve of %j',
    (input) => {
      expect(pathKey(input, 'win32', { caseSensitive: true })).toBe(win32.resolve(input))
    }
  )
})

describe('pathTail', () => {
  it('cuts by segments, in the spelling of the path', () => {
    expect(pathTail('/Users/F/Proj', '/users/f/proj/Src/a.ts', { platform: 'darwin' })).toEqual(['Src', 'a.ts'])
    expect(pathTail('C:\\Proj', 'c:/proj/Src', { platform: 'win32' })).toEqual(['Src'])
    expect(pathTail('/a', '/a', { platform: 'linux' })).toEqual([])
    expect(pathTail('/a', '/b/c', { platform: 'linux' })).toBeNull()
  })

  it('NFC changes the length, not the number of segments', () => {
    expect(pathTail('/t/ae\u0301e\u0301', '/t/a\u00e9\u00e9/xyz.txt', { platform: 'darwin' })).toEqual(['xyz.txt'])
    expect(pathTail('/t/caf\u00e9', '/t/cafe\u0301/a.txt', { platform: 'darwin' })).toEqual(['a.txt'])
  })
})

describe('comparePaths', () => {
  const sorted = (paths: string[], platform: string): string[] =>
    [...paths].sort((a, b) => comparePaths(a, b, platform))

  it('sorts by segment: the folder comes before siblings with the same prefix', () => {
    expect(sorted(['/r/a-b.txt', '/r/a/z.txt', '/r/b.txt', '/r/a.txt'], 'linux')).toEqual([
      '/r/a/z.txt',
      '/r/a-b.txt',
      '/r/a.txt',
      '/r/b.txt'
    ])
  })

  it('gives the same order on Windows as on POSIX', () => {
    const win = sorted(['C:\\r\\a-b.txt', 'C:\\r\\a\\z.txt', 'C:\\r\\b.txt', 'C:\\r\\a.txt'], 'win32')
    expect(win).toEqual(['C:\\r\\a\\z.txt', 'C:\\r\\a-b.txt', 'C:\\r\\a.txt', 'C:\\r\\b.txt'])
  })

  it('is 0 only for the same path', () => {
    expect(comparePaths('/r/a', '/r/a', 'linux')).toBe(0)
    expect(comparePaths('/r/a', '/r/a/b', 'linux')).toBeLessThan(0)
  })
})
