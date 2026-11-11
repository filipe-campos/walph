import { describe, expect, it } from 'vitest'
import type { RecentFolder, WorkspaceInfo } from '@shared/types'
import { highlightFolders, openButtonLabel, openedAgo, openWorkspaceOf, visibleSelection } from './welcomeRecents'
import { toggleSelected } from './toggleSelected'

const folder = (path: string): RecentFolder => ({ path, lastOpened: null, branch: null })
const ws = (root: string | null, dormant = false): WorkspaceInfo => ({
  id: root ?? 'empty',
  name: 'x',
  root,
  branch: null,
  status: 'running',
  unread: 0,
  active: false,
  dormant,
  muted: false
})

describe('selection', () => {
  it('toggles keeping the selection order', () => {
    expect(toggleSelected(['/a'], '/b')).toEqual(['/a', '/b'])
    expect(toggleSelected(['/a', '/b'], '/a')).toEqual(['/b'])
  })

  it('drops what left the recents', () => {
    expect(visibleSelection(['/b', '/x', '/a'], [folder('/a'), folder('/b')])).toEqual(['/b', '/a'])
  })
})

describe('openButtonLabel', () => {
  it('changes with the count', () => {
    expect(openButtonLabel(0)).toBe('Abrir todos')
    expect(openButtonLabel(1)).toBe('Abrir 1 workspace')
    expect(openButtonLabel(3)).toBe('Abrir 3 workspaces')
  })
})

describe('openedAgo', () => {
  const now = Date.UTC(2026, 5, 10, 12)
  it('prefixes the relative date', () => {
    expect(openedAgo(now - 2 * 3_600_000, now)).toBe('aberto há 2 h')
    expect(openedAgo(now - 1000, now)).toBe('aberto agora')
    expect(openedAgo(now - 30 * 3_600_000, now)).toBe('aberto ontem')
  })
  it('an old date becomes "em dd/mm/aaaa"; without a date, nothing', () => {
    expect(openedAgo(now - 90 * 86_400_000, now)).toMatch(/^aberto em \d{2}\/\d{2}\/\d{4}$/)
    expect(openedAgo(null, now)).toBeNull()
  })
})

describe('openWorkspaceOf', () => {
  it('finds by path, ignoring case on macOS and dormant ones', () => {
    expect(openWorkspaceOf([ws(null), ws('/Work/App')], '/work/app/', 'darwin')?.root).toBe('/Work/App')
    expect(openWorkspaceOf([ws('/Work/App')], '/work/app', 'linux')).toBeNull()
    expect(openWorkspaceOf([ws('/work/app', true)], '/work/app', 'linux')).toBeNull()
    expect(openWorkspaceOf(null, '/work/app', 'linux')).toBeNull()
  })
})

describe('edge cases', () => {
  it('toggleSelected does not change the original list', () => {
    const original = ['/a']
    toggleSelected(original, '/b')
    toggleSelected(original, '/a')
    expect(original).toEqual(['/a'])
  })

  it('visibleSelection with an empty list or no selection', () => {
    expect(visibleSelection([], [folder('/a')])).toEqual([])
    expect(visibleSelection(['/a'], [])).toEqual([])
  })

  it('openedAgo with a future date (clock ahead) does not break', () => {
    const now = Date.UTC(2026, 5, 10, 12)
    expect(openedAgo(now + 5 * 60_000, now)).toMatch(/^aberto /)
  })

  it('openWorkspaceOf ignores an empty workspace (no folder) and respects case on Windows', () => {
    expect(openWorkspaceOf([ws(null)], '/a', 'linux')).toBeNull()
    expect(openWorkspaceOf([ws('C:\\Work\\App')], 'c:\\work\\app', 'win32')?.root).toBe('C:\\Work\\App')
  })
})

describe('highlightFolders', () => {
  it('caps to the 4 most recent keeping the order', () => {
    const list = ['/a', '/b', '/c', '/d', '/e'].map(folder)
    expect(highlightFolders(list).map((f) => f.path)).toEqual(['/a', '/b', '/c', '/d'])
  })

  it('a short or empty list passes as is', () => {
    expect(highlightFolders([])).toEqual([])
    expect(highlightFolders([folder('/a')])).toHaveLength(1)
    expect(highlightFolders([folder('/a')], 0)).toEqual([])
  })
})
