import { describe, expect, it } from 'vitest'
import { parseStashList } from './parseStash'

describe('parseStashList', () => {
  it('reads index, date and message', () => {
    const out =
      ['stash@{0}\x1faaa\x1f200\x1fOn main: wip', 'stash@{1}\x1fbbb\x1f100\x1fWIP on dev: abc123 msg'].join('\0') + '\0'
    expect(parseStashList(out)).toEqual([
      { index: 0, hash: 'aaa', message: 'On main: wip', date: 200000 },
      { index: 1, hash: 'bbb', message: 'WIP on dev: abc123 msg', date: 100000 }
    ])
  })

  it('ignores invalid records and empty output', () => {
    expect(parseStashList('')).toEqual([])
    expect(parseStashList('junk\0')).toEqual([])
  })
})

describe('parseStashList: extra cases', () => {
  it('indexes with more than one digit', () => {
    const out = ['stash@{12}\x1fh\x1f1\x1fx'].join('\0')
    expect(parseStashList(out)[0].index).toBe(12)
  })

  it('a message with the field separator is preserved', () => {
    expect(parseStashList('stash@{0}\x1fh\x1f1\x1fa\x1fb')[0].message).toBe('a\x1fb')
  })

  it('empty message and invalid date (becomes 0)', () => {
    expect(parseStashList('stash@{0}\x1fh\x1fabc\x1f')).toEqual([{ index: 0, hash: 'h', message: '', date: 0 }])
  })

  it('ignores refs that are not stash@{n} and tolerates line breaks between records', () => {
    const out = 'stash@{x}\x1fh\x1f1\x1fruim\0\nstash@{3}\x1fh3\x1f2\x1fbom\0'
    expect(parseStashList(out)).toEqual([{ index: 3, hash: 'h3', message: 'bom', date: 2000 }])
  })

  it('preserves accents and emoji in the message', () => {
    expect(parseStashList('stash@{0}\x1fh\x1f1\x1fOn main: ação ✨')[0].message).toBe('On main: ação ✨')
  })
})
