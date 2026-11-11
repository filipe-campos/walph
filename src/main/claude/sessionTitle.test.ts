import { describe, expect, it } from 'vitest'
import { autoTitle, displayTitle, toSessionSummary } from './sessionTitle'

// Chosen order (the same in the tab and in the history): user title (Walph) > CLI customTitle (`/rename`) >
// automatic summary > first message (first line, up to 60 characters).
describe('displayTitle', () => {
  it('the user title beats everything', () => {
    expect(displayTitle({ userTitle: 'Mine', customTitle: 'CLI', summary: 'Summary', firstPrompt: 'hi' })).toBe('Mine')
  })

  it('without a user title: customTitle > summary > first message', () => {
    expect(displayTitle({ customTitle: 'CLI', summary: 'Summary', firstPrompt: 'hi' })).toBe('CLI')
    expect(displayTitle({ summary: 'Summary', firstPrompt: 'hi' })).toBe('Summary')
    expect(displayTitle({ firstPrompt: '\n  Fix the bug  \nother' })).toBe('Fix the bug')
  })

  it('without any data returns null', () => {
    expect(displayTitle({})).toBeNull()
  })
})

describe('autoTitle', () => {
  it('with a user title, ignores customTitle/summary that are a copy of it', () => {
    expect(autoTitle({ userTitle: 'Mine', customTitle: 'Mine', summary: 'Mine', firstPrompt: 'First' })).toBe('First')
    expect(autoTitle({ userTitle: 'Mine', customTitle: 'Mine', summary: 'Summary', firstPrompt: 'First' })).toBe(
      'Summary'
    )
  })

  it('without a user title uses the same chain as displayTitle', () => {
    expect(autoTitle({ summary: 'Summary', firstPrompt: 'x' })).toBe('Summary')
  })
})

describe('toSessionSummary', () => {
  const s = { sessionId: 'a', lastModified: 5, gitBranch: 'main', summary: 'Summary', firstPrompt: 'hi' }

  it('applies the Walph metadata and the title', () => {
    expect(toSessionSummary(s, { favorite: true, title: 'Mine' })).toEqual({
      sessionId: 'a',
      title: 'Mine',
      lastModified: 5,
      gitBranch: 'main',
      favorite: true
    })
  })

  it('without metadata nor title uses the default text and cuts at 200', () => {
    expect(toSessionSummary({ sessionId: 'b', lastModified: 1 }, undefined)).toEqual({
      sessionId: 'b',
      title: 'Conversa sem título',
      lastModified: 1,
      favorite: false
    })
    expect(toSessionSummary({ ...s, customTitle: 'x'.repeat(300) }, undefined).title).toHaveLength(200)
  })
})
