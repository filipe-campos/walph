import { describe, expect, it } from 'vitest'
import { pathKey } from '@shared/pathCompare'
import { canonicalPath, pathToUri, uriToPath } from './uri'

describe('pathToUri / uriToPath', () => {
  it('encodes spaces, # and accents on POSIX and goes back to the same path', () => {
    const path = '/tmp/a b/é#.ts'
    const uri = pathToUri(path, 'linux')
    expect(uri).toBe('file:///tmp/a%20b/%C3%A9%23.ts')
    expect(uriToPath(uri, 'linux')).toBe(path)
  })

  it('Windows: lowercase drive and encoded colon', () => {
    expect(uriToPath('file:///c%3A/Users/a%20b/x.ts', 'win32')).toBe('c:\\Users\\a b\\x.ts')
    expect(uriToPath('file:///C:/x/y.ts', 'win32')).toBe('C:\\x\\y.ts')
    expect(pathToUri('C:\\Users\\a b\\x.ts', 'win32')).toBe('file:///C:/Users/a%20b/x.ts')
  })

  it('Windows: UNC', () => {
    expect(uriToPath('file://server/share/x.ts', 'win32')).toBe('\\\\server\\share\\x.ts')
    expect(pathToUri('\\\\server\\share\\x y.ts', 'win32')).toBe('file://server/share/x%20y.ts')
  })

  it('ignores schemes that are not file', () => {
    expect(uriToPath('untitled:Untitled-1')).toBeNull()
    expect(uriToPath('zipfile:///a.zip::b.ts')).toBeNull()
  })
})

describe('pathKey', () => {
  it('Windows ignores case and the slash kind', () => {
    expect(pathKey('c:\\Users\\Foo\\x.ts', 'win32')).toBe(pathKey('C:/users/foo/X.ts', 'win32'))
  })
  it('macOS ignores case, Linux does not', () => {
    expect(pathKey('/Tmp/A.ts', 'darwin')).toBe(pathKey('/tmp/a.ts', 'darwin'))
    expect(pathKey('/Tmp/A.ts', 'linux')).not.toBe(pathKey('/tmp/a.ts', 'linux'))
  })
})

describe('canonicalPath', () => {
  const none = (): undefined => undefined

  it('open document: the path it was opened with', () => {
    expect(canonicalPath('c:\\proj\\a.ts', 'C:\\proj', () => 'C:\\proj\\a.ts', 'win32')).toBe('C:\\proj\\a.ts')
  })

  it('macOS: an NFD accented folder from the server gets the window NFC spelling', () => {
    expect(canonicalPath('/u/cafe\u0301/a.ts', '/u/caf\u00e9', none, 'darwin')).toBe('/u/caf\u00e9/a.ts')
    expect(canonicalPath('/u/cafe\u0301/a.ts', '/u/caf\u00e9', none, 'linux')).toBe('/u/cafe\u0301/a.ts')
  })

  it('inside the folder: folder prefix + the rest as it came (Windows and macOS)', () => {
    expect(canonicalPath(uriToPath('file:///c%3A/proj/Src/B.ts', 'win32')!, 'C:\\proj', none, 'win32')).toBe(
      'C:\\proj\\Src\\B.ts'
    )
    expect(canonicalPath('/users/me/proj/Src/b.ts', '/Users/me/Proj', none, 'darwin')).toBe('/Users/me/Proj/Src/b.ts')
    expect(canonicalPath('/users/me/proj', '/Users/me/Proj', none, 'darwin')).toBe('/Users/me/Proj')
  })

  it('outside the folder or without a folder: as it came', () => {
    expect(canonicalPath('/x/y.ts', '/Users/me/Proj', none, 'darwin')).toBe('/x/y.ts')
    expect(canonicalPath('/x/y.ts', null, none, 'linux')).toBe('/x/y.ts')
  })
})
