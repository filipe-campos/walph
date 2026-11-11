import { describe, expect, it } from 'vitest'
import { parseLog } from './parseLog'

const US = '\x1f'
const record = (...fields: string[]): string => fields.join(US)
const H1 = 'a'.repeat(40)
const H2 = 'b'.repeat(40)
const H3 = 'c'.repeat(40)

describe('parseLog', () => {
  it('reads a commit with one parent', () => {
    const out = record(H1, 'aaaaaaa', 'Ana', 'ana@x.com', '1700000000', H2, 'feat: something') + '\0'
    expect(parseLog(out)).toEqual([
      {
        hash: H1,
        shortHash: 'aaaaaaa',
        author: 'Ana',
        email: 'ana@x.com',
        date: 1700000000000,
        subject: 'feat: something',
        parents: [H2]
      }
    ])
  })

  it('splits several commits by NUL, keeping the order', () => {
    const out =
      [
        record(H1, 'aaaaaaa', 'Ana', 'a@x', '200', H2, 'two'),
        record(H2, 'bbbbbbb', 'Bia', 'b@x', '100', '', 'one')
      ].join('\0') + '\0'
    const commits = parseLog(out)
    expect(commits.map((c) => c.subject)).toEqual(['two', 'one'])
  })

  it('a root commit has no parents and a merge has two', () => {
    const out = [
      record(H1, 'aaaaaaa', 'Ana', 'a@x', '1', '', 'root'),
      record(H3, 'ccccccc', 'Ana', 'a@x', '2', `${H1} ${H2}`, 'merge')
    ].join('\0')
    const [root, merge] = parseLog(out)
    expect(root.parents).toEqual([])
    expect(merge.parents).toEqual([H1, H2])
  })

  it('keeps an empty subject, accents and the field separator inside the subject', () => {
    const out = [
      record(H1, 'aaaaaaa', 'José', 'j@x', '1', '', ''),
      record(H2, 'bbbbbbb', 'Zoë', 'z@x', '2', '', `a${US}b ção`)
    ].join('\0')
    const commits = parseLog(out)
    expect(commits[0].subject).toBe('')
    expect(commits[0].author).toBe('José')
    expect(commits[1].subject).toBe(`a${US}b ção`)
  })

  it('tolerates line breaks between records', () => {
    const out = `${record(H1, 'aaaaaaa', 'Ana', 'a@x', '1', '', 'one')}\n\0\n${record(H2, 'bbbbbbb', 'B', 'b@x', '2', '', 'two')}\n`
    expect(parseLog(out).map((c) => c.hash)).toEqual([H1, H2])
  })

  it('ignores malformed records and empty output', () => {
    expect(parseLog('')).toEqual([])
    expect(parseLog('\0\0')).toEqual([])
    expect(parseLog(`junk\0${record(H1, 'a', 'x', 'y', 'not-a-number', '', 's')}`)).toEqual([])
  })
})

describe('parseLog: extra cases', () => {
  it('accepts output without a final NUL and keeps spaces in the subject', () => {
    const out = record(H1, 'aaaaaaa', 'Ana', 'a@x', '5', H2, '  subject  with   spaces ')
    expect(parseLog(out)[0].subject).toBe('  subject  with   spaces ')
  })

  it('ignores only the malformed record and keeps its neighbors', () => {
    const out = [
      record(H1, 'aaaaaaa', 'Ana', 'a@x', '1', '', 'one'),
      record(H2, 'bbbbbbb', 'Bia', 'b@x', '2', ''), // missing subject (6 fields)
      record('', 'ccccccc', 'Cai', 'c@x', '3', '', 'no hash'),
      record(H3, 'ccccccc', 'Cai', 'c@x', '4', '', 'four')
    ].join('\0')
    expect(parseLog(out).map((c) => c.subject)).toEqual(['one', 'four'])
  })

  it('converts seconds to milliseconds, including epoch zero', () => {
    expect(parseLog(record(H1, 'aaaaaaa', 'A', 'a@x', '0', '', 's'))[0].date).toBe(0)
    expect(parseLog(record(H1, 'aaaaaaa', 'A', 'a@x', '1893456000', '', 's'))[0].date).toBe(1893456000000)
  })

  it('octopus merge (three parents) and repeated spaces between parents', () => {
    const out = record(H3, 'ccccccc', 'A', 'a@x', '1', `${H1}  ${H2} ${H3}`, 'octopus')
    expect(parseLog(out)[0].parents).toEqual([H1, H2, H3])
  })

  it('supports emoji and CJK in author and subject', () => {
    const c = parseLog(record(H1, 'aaaaaaa', '田中 太郎', 'a@x', '1', '', 'fix: 🐛 fixes'))[0]
    expect(c.author).toBe('田中 太郎')
    expect(c.subject).toBe('fix: 🐛 fixes')
  })
})
