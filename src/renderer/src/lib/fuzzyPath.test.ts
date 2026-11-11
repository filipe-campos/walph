import { describe, expect, it } from 'vitest'
import { matchPath, rankPaths } from './fuzzyPath'

const PATHS = [
  'src/i/d/x.ts',
  'src/renderer/src/lib/editor/x.ts',
  'src/renderer/index.html',
  'src/main/index.ts',
  'README.md'
]

describe('rankPaths', () => {
  it('prioritizes the match in the file name (idx)', () => {
    const r = rankPaths('idx', PATHS, 10).map((x) => x.path)
    expect(r.slice(0, 2)).toEqual(['src/main/index.ts', 'src/renderer/index.html'])
    expect(r).toContain('src/i/d/x.ts')
    expect(r).toContain('src/renderer/src/lib/editor/x.ts')
    expect(r.indexOf('src/i/d/x.ts')).toBeGreaterThan(1)
    expect(r.indexOf('src/renderer/src/lib/editor/x.ts')).toBeGreaterThan(1)
  })
  it('the file name beats a match over the full path', () => {
    const r = rankPaths('main', ['main/zzz/a.ts', 'src/other/main.ts'], 10)
    expect(r[0].path).toBe('src/other/main.ts')
  })
  it('a query with / matches the whole path', () => {
    const r = rankPaths('main/index', PATHS, 10)
    expect(r.map((x) => x.path)).toEqual(['src/main/index.ts'])
  })
  it('ignores spaces in the query', () => {
    expect(rankPaths('in dex', PATHS, 10)[0].path).toBe('src/main/index.ts')
  })
  it('excludes paths without a match', () => {
    expect(rankPaths('zzzz', PATHS, 10)).toEqual([])
    expect(rankPaths('readme', PATHS, 10).map((x) => x.path)).toEqual(['README.md'])
  })
  it('breaks ties by shorter path and then alphabetical order', () => {
    const r = rankPaths('a.ts', ['dir/a.ts', 'a.ts', 'b/a.ts', 'c/a.ts'], 10).map((x) => x.path)
    expect(r[0]).toBe('a.ts')
    expect(r.slice(1)).toEqual(['b/a.ts', 'c/a.ts', 'dir/a.ts'])
  })
  it('limits the number of results', () => {
    const many = Array.from({ length: 50 }, (_, i) => `f/file${String(i).padStart(2, '0')}.ts`)
    const r = rankPaths('file', many, 5)
    expect(r).toHaveLength(5)
    expect(r.map((x) => x.path)).toEqual(many.slice(0, 5))
  })
  it('an empty query matches everything', () => {
    expect(rankPaths('', PATHS, 100)).toHaveLength(PATHS.length)
  })
})

describe('matchPath', () => {
  it('returns indexes relative to the full path pointing to the right letters', () => {
    const path = 'src/main/index.ts'
    const m = matchPath('idx', path)!
    expect(m.matches.map((i) => path[i])).toEqual(['i', 'd', 'x'])
    expect(m.matches[0]).toBeGreaterThanOrEqual(path.lastIndexOf('/') + 1)
  })
  it('indexes of a query with / point to the path', () => {
    const path = 'src/main/index.ts'
    const m = matchPath('s/m/i', path)!
    expect(m.matches.map((i) => path[i]).join('')).toBe('s/m/i')
  })
  it('accepts a typed \\ as a separator', () => {
    expect(matchPath('main\\index', 'src/main/index.ts')).not.toBeNull()
  })
  it('falls back to the path when the name does not match', () => {
    const m = matchPath('mainindex', 'src/main/index.ts')
    expect(m).not.toBeNull()
  })
  it('returns null without a match', () => {
    expect(matchPath('qqq', 'src/main/index.ts')).toBeNull()
  })
  it('is case and accent insensitive', () => {
    expect(matchPath('acao', 'docs/Ação.md')).not.toBeNull()
  })
})
