import { describe, expect, it } from 'vitest'
import { emptyQueryFiles, toAbs, toRel } from './quickOpenFiles'

const base = { truncated: false, openPaths: [] as string[], recent: [] as string[] }

describe('toAbs / toRel', () => {
  it('POSIX root', () => {
    expect(toAbs('/proj', 'a/b.ts')).toBe('/proj/a/b.ts')
    expect(toRel('/proj', '/proj/a/b.ts')).toBe('a/b.ts')
  })
  it('Windows root', () => {
    expect(toAbs('C:\\proj', 'a/b.ts')).toBe('C:\\proj\\a\\b.ts')
    expect(toRel('C:\\proj', 'C:\\proj\\a\\b.ts')).toBe('a/b.ts')
  })
  it('a root that ends with a separator', () => {
    expect(toAbs('/', 'a/b.ts')).toBe('/a/b.ts')
    expect(toRel('/', '/a/b.ts')).toBe('a/b.ts')
    expect(toAbs('C:\\', 'a/b.ts')).toBe('C:\\a\\b.ts')
    expect(toRel('C:\\', 'C:\\a\\b.ts')).toBe('a/b.ts')
  })
  it('outside the folder returns the absolute path', () => {
    expect(toRel('/proj', '/outro/x.ts')).toBe('/outro/x.ts')
    expect(toRel('/proj', '/project/x.ts')).toBe('/project/x.ts')
  })
})

describe('emptyQueryFiles', () => {
  it('sorts open, recent and the rest, without duplicates', () => {
    const out = emptyQueryFiles(
      {
        ...base,
        root: '/p',
        files: ['c.ts', 'a.ts', 'b.ts', 'd.ts'],
        openPaths: ['/p/c.ts', '/p/a.ts'],
        recent: ['/p/a.ts', '/p/d.ts', '/p/c.ts']
      },
      100
    )
    expect(out.map((f) => [f.rel, f.tag])).toEqual([
      ['a.ts', 'aberto'],
      ['c.ts', 'aberto'],
      ['d.ts', 'aberto recentemente'],
      ['b.ts', undefined]
    ])
    expect(out[0].abs).toBe('/p/a.ts')
  })

  it('hides recent ones missing from the full list, but keeps them if truncated', () => {
    const input = { ...base, root: '/p', files: ['a.ts'], recent: ['/p/gone.ts'] }
    expect(emptyQueryFiles(input, 10).map((f) => f.rel)).toEqual(['a.ts'])
    expect(emptyQueryFiles({ ...input, truncated: true }, 10).map((f) => f.rel)).toEqual(['gone.ts', 'a.ts'])
  })

  it('respects the limit', () => {
    const files = Array.from({ length: 10 }, (_, i) => `f${i}.ts`)
    expect(emptyQueryFiles({ ...base, root: '/p', files }, 3)).toHaveLength(3)
  })

  it('Windows root: native abs, rel with /', () => {
    const out = emptyQueryFiles({ ...base, root: 'C:\\proj', files: ['src/a.ts'], recent: ['C:\\proj\\src\\a.ts'] }, 10)
    expect(out).toEqual([{ rel: 'src/a.ts', abs: 'C:\\proj\\src\\a.ts', tag: 'aberto recentemente' }])
  })

  it('a root ending in a separator', () => {
    const out = emptyQueryFiles({ ...base, root: 'C:\\', files: ['a.ts'], openPaths: ['C:\\a.ts'] }, 10)
    expect(out).toEqual([{ rel: 'a.ts', abs: 'C:\\a.ts', tag: 'aberto' }])
    const posix = emptyQueryFiles({ ...base, root: '/', files: ['a.ts'] }, 10)
    expect(posix[0].abs).toBe('/a.ts')
  })

  it('an open tab outside the folder keeps the absolute path', () => {
    const out = emptyQueryFiles({ ...base, root: '/p', files: [], openPaths: ['/x/y.ts'] }, 10)
    expect(out).toEqual([{ rel: '/x/y.ts', abs: '/x/y.ts', tag: 'aberto' }])
  })
})
