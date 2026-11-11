import { describe, expect, it } from 'vitest'
import { rankByLabel } from './rankByLabel'

const label = (e: { label: string }): string => e.label

describe('rankByLabel', () => {
  const entries = [{ label: 'UTF-8' }, { label: 'UTF-16 LE' }, { label: 'Windows-1252' }]
  it('without a query keeps everything and the order', () => {
    expect(rankByLabel(entries, '', label, { sort: true }).map((r) => r.entry.label)).toEqual([
      'UTF-8',
      'UTF-16 LE',
      'Windows-1252'
    ])
  })
  it('a query with only spaces counts as empty', () => {
    expect(rankByLabel(entries, '   ', label, { sort: true })).toHaveLength(3)
  })
  it('filters by the query', () => {
    expect(rankByLabel(entries, 'win', label, { sort: true }).map((r) => r.entry.label)).toEqual(['Windows-1252'])
  })
  it('returns the matched positions', () => {
    expect(rankByLabel(entries, 'win', label, { sort: true })[0].matches).toEqual([0, 1, 2])
  })
  it('sort orders by the best match; without sort keeps the order', () => {
    const list = [{ label: 'a-x-b' }, { label: 'ab' }]
    expect(rankByLabel(list, 'ab', label, { sort: true }).map((r) => r.entry.label)).toEqual(['ab', 'a-x-b'])
    expect(rankByLabel(list, 'ab', label, { sort: false }).map((r) => r.entry.label)).toEqual(['a-x-b', 'ab'])
  })
  it('tiebreak breaks ties between matches with the same score', () => {
    const list = [
      { label: 'main', rank: 2 },
      { label: 'main', rank: 1 }
    ]
    const out = rankByLabel(list, 'main', label, { sort: true, tiebreak: (a, b) => a.rank - b.rank })
    expect(out.map((r) => r.entry.rank)).toEqual([1, 2])
  })
})
