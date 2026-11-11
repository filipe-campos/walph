import { describe, expect, it } from 'vitest'
import { isSessionStale, planSessionPrune, SESSION_MAX_AGE_MS } from './prune'
import { sessionFileName } from './sessionFile'

const now = Date.UTC(2026, 5, 1)
const old = now - SESSION_MAX_AGE_MS - 1000
const young = now - SESSION_MAX_AGE_MS + 60_000
const name = (root: string): string => sessionFileName(root, 'linux')
const plan = (
  files: { name: string; mtimeMs: number }[],
  recent: string[] = [],
  windows: string[] = [],
  live: string[] = []
): string[] => planSessionPrune(files, recent, windows, live, now, 'linux')

describe('planSessionPrune', () => {
  it('deletes the old session of an unreferenced folder', () => {
    expect(plan([{ name: name('/p/a'), mtimeMs: old }])).toEqual([name('/p/a')])
  })

  it('keeps the folder that is in the recents or in the saved windows', () => {
    const files = [
      { name: name('/p/recent'), mtimeMs: old },
      { name: name('/p/open'), mtimeMs: old }
    ]
    expect(plan(files, ['/p/recent/'], ['/p/open'])).toEqual([])
  })

  it('keeps the folder open now, even outside the recents and the saved windows', () => {
    const files = [
      { name: name('/p/live'), mtimeMs: old },
      { name: name('/p/other'), mtimeMs: old }
    ]
    expect(plan(files, [], [], ['/p/live/'])).toEqual([name('/p/other')])
  })

  it('keeps the recent session', () => {
    expect(plan([{ name: name('/p/a'), mtimeMs: young }])).toEqual([])
  })

  it('ignores non-session files and invalid dates', () => {
    const files = [
      { name: 'notes.txt', mtimeMs: old },
      { name: `${name('/p/a')}.tmp`, mtimeMs: old },
      { name: 'ABC.json', mtimeMs: old },
      { name: name('/p/b'), mtimeMs: Number.NaN }
    ]
    expect(plan(files)).toEqual([])
  })
})

describe('isSessionStale', () => {
  it('only applies to finite dates past the limit', () => {
    expect(isSessionStale(old, now)).toBe(true)
    expect(isSessionStale(young, now)).toBe(false)
    expect(isSessionStale(Number.NaN, now)).toBe(false)
  })
})
