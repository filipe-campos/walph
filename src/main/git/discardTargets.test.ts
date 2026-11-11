import { describe, expect, it } from 'vitest'
import { selectDiscardTargets } from './discardTargets'

const pick = (index: string, workingDir: string) =>
  selectDiscardTargets([{ rel: 'a.txt', index, workingDir }], ['a.txt'])

describe('selectDiscardTargets', () => {
  it('untracked goes to the trash', () => {
    expect(pick('?', '?')).toEqual({ untracked: ['a.txt'], tracked: [] })
  })

  it.each([
    [' ', 'M'],
    ['M', 'M'],
    ['A', 'M'],
    ['A', 'D'],
    [' ', 'D']
  ])('%j%j restores the working tree', (x, y) => {
    expect(pick(x, y)).toEqual({ untracked: [], tracked: ['a.txt'] })
  })

  it('staged only (rename) does nothing', () => {
    const out = selectDiscardTargets([{ rel: 'new.txt', index: 'R', workingDir: ' ' }], ['new.txt', 'old.txt'])
    expect(out).toEqual({ untracked: [], tracked: [] })
  })

  it.each(['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD'])('%s throws a conflict error', (xy) => {
    expect(() => pick(xy[0], xy[1])).toThrow(/em conflito/)
  })

  it('ignores entries that were not requested, even in conflict', () => {
    const out = selectDiscardTargets(
      [
        { rel: 'a.txt', index: ' ', workingDir: 'M' },
        { rel: 'b.txt', index: 'U', workingDir: 'U' },
        { rel: 'c.txt', index: '?', workingDir: '?' }
      ],
      ['a.txt']
    )
    expect(out).toEqual({ untracked: [], tracked: ['a.txt'] })
  })
})
