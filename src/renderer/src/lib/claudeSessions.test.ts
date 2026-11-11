import { describe, expect, it } from 'vitest'
import type { ClaudeSessionSummary } from '@shared/types'
import { favoritesFirst } from './claudeSessions'

const s = (sessionId: string, favorite: boolean): ClaudeSessionSummary => ({
  sessionId,
  title: sessionId,
  lastModified: 0,
  favorite
})

describe('favoritesFirst', () => {
  it('favorites first, original order within each group, without mutating the input', () => {
    const input = [s('a', false), s('b', true), s('c', false), s('d', true)]
    expect(favoritesFirst(input).map((x) => x.sessionId)).toEqual(['b', 'd', 'a', 'c'])
    expect(input.map((x) => x.sessionId)).toEqual(['a', 'b', 'c', 'd'])
    expect(favoritesFirst([])).toEqual([])
  })
})
