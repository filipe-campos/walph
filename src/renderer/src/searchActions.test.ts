import { describe, expect, it } from 'vitest'
import type { SearchResult } from '@shared/types'
import { installFakeApi } from './test/fakeApi'

// `store.ts` reads `window.api` on load: the stub must exist before the import.
installFakeApi()

const { countScope } = await import('./searchActions')

const match = (line: number) => ({ line, column: 0, length: 1, text: 'x' })
const result: SearchResult = {
  files: [
    { path: '/a.ts', matches: [match(1), match(2), match(3)] },
    { path: '/b.ts', matches: [match(1)] }
  ],
  totalMatches: 4,
  truncated: false
}

describe('countScope', () => {
  it('all sums the matches and files of the result', () => {
    expect(countScope(result, { kind: 'all' })).toEqual({ matches: 4, files: 2 })
  })

  it('all on an empty result gives zero', () => {
    expect(countScope({ files: [], totalMatches: 0, truncated: false }, { kind: 'all' })).toEqual({
      matches: 0,
      files: 0
    })
  })

  it('file counts the matches of that file', () => {
    expect(countScope(result, { kind: 'file', path: '/a.ts' })).toEqual({ matches: 3, files: 1 })
  })

  it('file for a path not in the result gives zero', () => {
    expect(countScope(result, { kind: 'file', path: '/c.ts' })).toEqual({ matches: 0, files: 0 })
  })

  it('match is always 1 occurrence in 1 file', () => {
    expect(countScope(result, { kind: 'match', path: '/a.ts', index: 2 })).toEqual({ matches: 1, files: 1 })
  })
})
