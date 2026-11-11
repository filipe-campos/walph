import { describe, expect, it } from 'vitest'
import { parseBlame } from './parseBlame'

const A = '20bcb7c2425dee5755d709b7874322d326d186a0'
const B = '49906afe09cd02ee1dbfff6fe7c7cb371e9addfb'
const ZERO = '0'.repeat(40)

const SAMPLE = [
  `${A} 1 1 1`,
  'author x',
  'author-mail <y>',
  'author-time 1794326083',
  'author-tz -0300',
  'committer x',
  'summary i',
  'boundary',
  'filename f',
  '\ta',
  `${ZERO} 2 2 1`,
  'author Not Committed Yet',
  'author-mail <not.committed.yet>',
  'author-time 1794326120',
  'summary Version of f from f',
  `previous ${B} f`,
  'filename f',
  '\tB',
  `${B} 3 3 2`,
  'author Ana',
  'author-mail <ana@x>',
  'author-time 1794326120',
  'summary segundo commit',
  `previous ${A} f`,
  'filename f',
  '\tc',
  `${B} 4 4`,
  '\tauthor fake inside the content',
  `${ZERO} 5 5 1`,
  '\td',
  ''
].join('\n')

describe('parseBlame', () => {
  it('one commit per hash and the commit index on each final line', () => {
    const blame = parseBlame(SAMPLE)
    expect(blame.lines).toEqual([0, 1, 2, 2, 1])
    expect(blame.commits).toEqual([
      { hash: A, author: 'x', email: 'y', date: 1794326083000, summary: 'i', uncommitted: false },
      {
        hash: ZERO,
        author: 'Not Committed Yet',
        email: 'not.committed.yet',
        date: 1794326120000,
        summary: 'Version of f from f',
        uncommitted: true
      },
      { hash: B, author: 'Ana', email: 'ana@x', date: 1794326120000, summary: 'segundo commit', uncommitted: false }
    ])
  })

  it('content that looks like a field does not change the commit', () => {
    expect(parseBlame(SAMPLE).commits[2]?.author).toBe('Ana')
  })

  it('empty output (empty file) and gaps', () => {
    expect(parseBlame('')).toEqual({ commits: [], lines: [] })
    const holes = parseBlame(`${A} 1 3 1\nauthor x\n\tz\n`)
    expect(holes.lines).toEqual([-1, -1, 0])
  })

  it('accepts SHA-256 hashes', () => {
    const hash = 'a'.repeat(64)
    expect(parseBlame(`${hash} 1 1 1\nauthor y\n\tl\n`).commits[0]?.hash).toBe(hash)
  })
})
