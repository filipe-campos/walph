import { describe, expect, it } from 'vitest'
import { parseParents } from './parents'

describe('parseParents', () => {
  it('a root commit has no parents', () => {
    expect(parseParents('abc123\n')).toEqual([])
  })

  it('lists the parents, including of a merge', () => {
    expect(parseParents('abc def\n')).toEqual(['def'])
    expect(parseParents('abc def 012\n')).toEqual(['def', '012'])
  })
})
