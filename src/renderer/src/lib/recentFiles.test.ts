import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  forgetRecent,
  loadRecentFiles,
  RECENT_FILES_MAX,
  renameRecent,
  saveRecentFiles,
  touchRecent
} from './recentFiles'

describe('touchRecent', () => {
  it('puts the most recent at the start', () => {
    expect(touchRecent(['/a', '/b'], '/c')).toEqual(['/c', '/a', '/b'])
  })
  it('removes a duplicate by moving it to the start', () => {
    expect(touchRecent(['/a', '/b', '/c'], '/c')).toEqual(['/c', '/a', '/b'])
  })
  it('respects the limit', () => {
    const list = Array.from({ length: RECENT_FILES_MAX }, (_, i) => `/f${i}`)
    const next = touchRecent(list, '/novo')
    expect(next).toHaveLength(RECENT_FILES_MAX)
    expect(next[0]).toBe('/novo')
    expect(next).not.toContain(`/f${RECENT_FILES_MAX - 1}`)
  })
  it('does not mutate the original list', () => {
    const list = ['/a']
    touchRecent(list, '/b')
    expect(list).toEqual(['/a'])
  })
})

describe('forgetRecent and renameRecent', () => {
  it('forgetRecent removes the file and the content of folders', () => {
    expect(forgetRecent(['/r/a/x.ts', '/r/ab/y.ts', '/r/a'], '/r/a')).toEqual(['/r/ab/y.ts'])
  })
  it('renameRecent replaces the prefix of folders and files', () => {
    expect(renameRecent(['/r/a/x.ts', '/r/ab/y.ts', '/r/a'], '/r/a', '/r/z')).toEqual([
      '/r/z/x.ts',
      '/r/ab/y.ts',
      '/r/z'
    ])
  })
  it('works with Windows paths', () => {
    expect(renameRecent(['C:\\r\\a\\x.ts', 'C:\\r\\ab\\y.ts'], 'C:\\r\\a', 'C:\\r\\z')).toEqual([
      'C:\\r\\z\\x.ts',
      'C:\\r\\ab\\y.ts'
    ])
    expect(forgetRecent(['C:\\r\\a\\x.ts', 'C:\\r\\ab\\y.ts'], 'C:\\r\\a')).toEqual(['C:\\r\\ab\\y.ts'])
  })
})

describe('persistence', () => {
  beforeEach(() => localStorage.clear())

  it('saves and loads per folder, isolating the roots', () => {
    saveRecentFiles('/r1', ['/r1/a'])
    saveRecentFiles('/r2', ['/r2/b'])
    expect(loadRecentFiles('/r1')).toEqual(['/r1/a'])
    expect(loadRecentFiles('/r2')).toEqual(['/r2/b'])
    expect(loadRecentFiles('/r3')).toEqual([])
  })
  it('corrupted JSON returns an empty list and allows saving later', () => {
    localStorage.setItem('walph.recentFiles', '{nao-json')
    expect(loadRecentFiles('/r')).toEqual([])
    saveRecentFiles('/r', ['/r/a'])
    expect(loadRecentFiles('/r')).toEqual(['/r/a'])
  })
  it('an unexpected format (array, list with non-strings) is tolerated', () => {
    localStorage.setItem('walph.recentFiles', '[1,2]')
    expect(loadRecentFiles('/r')).toEqual([])
    localStorage.setItem('walph.recentFiles', JSON.stringify({ '/r': ['/r/a', 3, null] }))
    expect(loadRecentFiles('/r')).toEqual(['/r/a'])
    localStorage.setItem('walph.recentFiles', JSON.stringify({ '/r': 'x' }))
    expect(loadRecentFiles('/r')).toEqual([])
  })
  it('caps the loaded list', () => {
    const big = Array.from({ length: RECENT_FILES_MAX + 10 }, (_, i) => `/r/${i}`)
    localStorage.setItem('walph.recentFiles', JSON.stringify({ '/r': big }))
    expect(loadRecentFiles('/r')).toHaveLength(RECENT_FILES_MAX)
  })
  it('caps the number of saved folders by dropping the oldest', () => {
    for (let i = 0; i < 25; i++) saveRecentFiles(`/r${i}`, [`/r${i}/a`])
    expect(loadRecentFiles('/r0')).toEqual([])
    expect(loadRecentFiles('/r24')).toEqual(['/r24/a'])
    expect(Object.keys(JSON.parse(localStorage.getItem('walph.recentFiles')!))).toHaveLength(20)
  })
  it('a localStorage that throws does not break', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cheio')
    })
    expect(() => saveRecentFiles('/r', ['/r/a'])).not.toThrow()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('negado')
    })
    expect(loadRecentFiles('/r')).toEqual([])
    expect(() => saveRecentFiles('/r', ['/r/a'])).not.toThrow()
  })
})
