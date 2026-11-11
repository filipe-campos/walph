import { describe, expect, it } from 'vitest'
import type { GitStatus } from '@shared/types'
import { buildDecorations, decorationBadge, decorationOf } from './gitDecorations'

const status = (files: [string, string, string][]): GitStatus => ({
  isRepo: true,
  repoRoot: '/r',
  branch: 'main',
  upstream: null,
  ahead: 0,
  behind: 0,
  files: files.map(([path, index, workingDir]) => ({ path, index, workingDir })),
  ignored: []
})

describe('decorationOf', () => {
  it('classifies the index/working tree pairs', () => {
    expect(decorationOf('?', '?')).toBe('untracked')
    expect(decorationOf('A', ' ')).toBe('added')
    expect(decorationOf(' ', 'D')).toBe('deleted')
    expect(decorationOf('D', ' ')).toBe('deleted')
    expect(decorationOf(' ', 'M')).toBe('modified')
    expect(decorationOf('U', 'U')).toBe('conflict')
    expect(decorationOf('A', 'A')).toBe('conflict')
    expect(decorationOf('D', 'D')).toBe('conflict')
  })
})

describe('decorationBadge', () => {
  it('one letter per decoration', () => {
    expect(decorationBadge('conflict')).toBe('!')
    expect(decorationBadge('untracked')).toBe('U')
  })
})

describe('buildDecorations', () => {
  it('a nonexistent repository decorates nothing', () => {
    expect(buildDecorations(null, '/r').size).toBe(0)
    expect(buildDecorations({ ...status([]), isRepo: false }, '/r').size).toBe(0)
  })

  it('folders inherit the mark, except the root', () => {
    const map = buildDecorations(status([['/r/a/b/f.ts', ' ', 'M']]), '/r')
    expect(map.get('/r/a/b/f.ts')).toBe('modified')
    expect(map.get('/r/a/b')).toBe('modified')
    expect(map.get('/r/a')).toBe('modified')
    expect(map.has('/r')).toBe(false)
  })

  it('the folder of a removed file becomes modified', () => {
    const map = buildDecorations(status([['/r/a/f.ts', ' ', 'D']]), '/r')
    expect(map.get('/r/a/f.ts')).toBe('deleted')
    expect(map.get('/r/a')).toBe('modified')
  })

  it('the first mark of the folder wins and the ancestors are not revisited', () => {
    const map = buildDecorations(
      status([
        ['/r/a/x.ts', '?', '?'],
        ['/r/a/y.ts', ' ', 'M']
      ]),
      '/r'
    )
    expect(map.get('/r/a')).toBe('untracked')
  })
})
