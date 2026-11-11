import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cwdOrInitial, linkCandidates } from './linkCandidates'

const abs = (...parts: string[]): string => resolve(sep, ...parts)

describe('cwdOrInitial', () => {
  it('uses the read directory when it is absolute', () => {
    expect(cwdOrInitial(abs('a'), abs('init'))).toBe(abs('a'))
  })

  it('falls back to the initial one when the read failed, came back empty or relative', () => {
    expect(cwdOrInitial(null, abs('init'))).toBe(abs('init'))
    expect(cwdOrInitial('', abs('init'))).toBe(abs('init'))
    expect(cwdOrInitial('rel/dir', abs('init'))).toBe(abs('init'))
  })
})

describe('linkCandidates', () => {
  it('an absolute path does not depend on the bases', () => {
    expect(linkCandidates(abs('x', 'f.ts'), [abs('a')])).toEqual([abs('x', 'f.ts')])
  })

  it('a relative path resolves against each base, in order', () => {
    expect(linkCandidates('src/f.ts', [abs('shell'), abs('root'), abs('init')])).toEqual([
      abs('shell', 'src', 'f.ts'),
      abs('root', 'src', 'f.ts'),
      abs('init', 'src', 'f.ts')
    ])
  })

  it('repeated bases become a single candidate', () => {
    expect(linkCandidates('f.ts', [abs('a'), abs('a'), abs('b')])).toEqual([abs('a', 'f.ts'), abs('b', 'f.ts')])
  })

  it('without bases there is no candidate for a relative path', () => {
    expect(linkCandidates('f.ts', [])).toEqual([])
  })
})
