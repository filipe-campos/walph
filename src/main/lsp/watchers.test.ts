import { describe, expect, it } from 'vitest'
import { matchesWatch, parseWatchers, relativePosix, toWatchedType } from './watchers'

const root = '/proj'
const ch = (path: string, type: 1 | 2 | 3) => ({ path, type })

describe('parseWatchers / matchesWatch', () => {
  it('string relative to the folder; the default kind is 7', () => {
    const specs = parseWatchers({ watchers: [{ globPattern: '**/*.ts' }] }, 'linux')
    expect(matchesWatch(specs, ch('/proj/src/a.ts', 2), root, 'linux')).toBe(true)
    expect(matchesWatch(specs, ch('/proj/src/a.js', 2), root, 'linux')).toBe(false)
    expect(matchesWatch(specs, ch('/other/a.ts', 1), root, 'linux')).toBe(false)
  })
  it('kind is a mask create=1/change=2/delete=4', () => {
    const specs = parseWatchers({ watchers: [{ globPattern: '*.x', kind: 5 }] }, 'linux')
    expect(matchesWatch(specs, ch('/proj/a.x', 1), root, 'linux')).toBe(true)
    expect(matchesWatch(specs, ch('/proj/a.x', 2), root, 'linux')).toBe(false)
    expect(matchesWatch(specs, ch('/proj/a.x', 3), root, 'linux')).toBe(true)
  })
  it('RelativePattern with a string baseUri or a WorkspaceFolder', () => {
    const specs = parseWatchers(
      {
        watchers: [
          { globPattern: { baseUri: 'file:///proj/sub', pattern: '*.rel' } },
          { globPattern: { baseUri: { uri: 'file:///proj/lib', name: 'l' }, pattern: '**/*.l' } }
        ]
      },
      'linux'
    )
    expect(matchesWatch(specs, ch('/proj/sub/a.rel', 1), root, 'linux')).toBe(true)
    expect(matchesWatch(specs, ch('/proj/a.rel', 1), root, 'linux')).toBe(false)
    expect(matchesWatch(specs, ch('/proj/lib/x/y.l', 3), root, 'linux')).toBe(true)
  })
  it('invalid entries are ignored', () => {
    expect(parseWatchers(null)).toEqual([])
    expect(
      parseWatchers({ watchers: [{}, { globPattern: 3 }, { globPattern: { baseUri: 'http://x', pattern: 'a' } }] })
    ).toEqual([])
  })
  it('macOS and Windows ignore case', () => {
    const specs = parseWatchers({ watchers: [{ globPattern: '**/*.TS' }] }, 'darwin')
    expect(matchesWatch(specs, ch('/proj/a.ts', 1), root, 'darwin')).toBe(true)
  })
  it('relativePosix keeps the path spelling and rejects what is outside', () => {
    expect(relativePosix('C:\\proj', 'c:\\proj\\Src\\a.ts', 'win32')).toBe('Src/a.ts')
    expect(relativePosix('/proj', '/project/a', 'linux')).toBeNull()
  })
  it('toWatchedType', () => {
    expect([toWatchedType('add'), toWatchedType('change'), toWatchedType('unlink')]).toEqual([1, 2, 3])
  })
})
