import { describe, expect, it } from 'vitest'
import type { RecentFolder } from '@shared/types'
import { removeRecent, sanitizeRecent, setRecentBranch, touchRecent } from './recentList'

const f = (path: string, lastOpened: number | null = null, branch: string | null = null): RecentFolder => ({
  path,
  lastOpened,
  branch
})

describe('touchRecent', () => {
  it('puts it on top, removes the duplicate and stamps lastOpened', () => {
    expect(touchRecent([f('/a'), f('/b'), f('/c')], '/b', 100, 20, 'linux')).toEqual([f('/b', 100), f('/a'), f('/c')])
  })

  it('keeps the branch of the previous entry', () => {
    expect(touchRecent([f('/a', 1, 'main')], '/a', 5, 20, 'linux')).toEqual([f('/a', 5, 'main')])
  })

  it('deduplicates by samePath (trailing slash, case on macOS)', () => {
    expect(touchRecent([f('/A/x'), f('/b')], '/a/x/', 7, 20, 'darwin')).toEqual([f('/a/x/', 7), f('/b')])
  })

  it('respects the maximum', () => {
    expect(touchRecent([f('/a'), f('/b'), f('/c')], '/d', 1, 3, 'linux').map((x) => x.path)).toEqual(['/d', '/a', '/b'])
  })
})

describe('removeRecent', () => {
  it('removes the path', () => {
    expect(removeRecent([f('/a'), f('/b')], '/a/', 'linux')).toEqual([f('/b')])
  })
})

describe('setRecentBranch', () => {
  const list = [f('/a', 1, 'main'), f('/b', 2)]

  it('updates the branch without reordering', () => {
    expect(setRecentBranch(list, '/b', 'dev', 'linux')).toEqual([f('/a', 1, 'main'), f('/b', 2, 'dev')])
  })

  it('returns the same list when nothing changes or the folder is not in it', () => {
    expect(setRecentBranch(list, '/a', 'main', 'linux')).toBe(list)
    expect(setRecentBranch(list, '/z', 'main', 'linux')).toBe(list)
  })

  it('accepts null to clear the branch', () => {
    expect(setRecentBranch(list, '/a', null, 'linux')[0].branch).toBeNull()
  })
})

describe('sanitizeRecent', () => {
  it('accepts the old format (strings) with null lastOpened/branch', () => {
    expect(sanitizeRecent({ folders: ['/a', 1, '', 'rel/x', null, '/b'] }, 20, 'linux')).toEqual([f('/a'), f('/b')])
    expect(sanitizeRecent(['/a'], 20, 'linux')).toEqual([f('/a')])
  })

  it('accepts the v2 format and normalizes invalid fields', () => {
    expect(
      sanitizeRecent(
        {
          folders: [
            { path: '/a', lastOpened: 10, branch: 'main' },
            { path: '/b', lastOpened: 'x', branch: 3 },
            { path: 'rel' }
          ]
        },
        20,
        'linux'
      )
    ).toEqual([f('/a', 10, 'main'), f('/b')])
  })

  it('removes duplicates and caps', () => {
    expect(sanitizeRecent(['/a', '/a', '/b', '/c'], 2, 'linux').map((x) => x.path)).toEqual(['/a', '/b'])
  })

  it('an unexpected value becomes an empty list', () => {
    expect(sanitizeRecent(42)).toEqual([])
    expect(sanitizeRecent(null)).toEqual([])
  })
})
