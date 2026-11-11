import { describe, expect, it } from 'vitest'
import { parseBranches } from './parseBranches'

const line = (ref: string, head: string, up: string, hash: string, date: number): string =>
  [ref, head, up, hash, String(date)].join('\x1f')

describe('parseBranches', () => {
  it('lists locals and remotes, the current one first, ignoring origin/HEAD', () => {
    const out = [
      line('refs/heads/dev', ' ', 'origin/dev', 'bbb1111', 200),
      line('refs/heads/main', '*', 'origin/main', 'aaa1111', 100),
      line('refs/remotes/origin/HEAD', ' ', '', 'aaa1111', 100),
      line('refs/remotes/origin/main', ' ', '', 'aaa1111', 100),
      line('refs/remotes/origin/feat/x', ' ', '', 'ccc1111', 300)
    ].join('\n')
    const branches = parseBranches(out + '\n')
    expect(branches.map((b) => b.name)).toEqual(['main', 'dev', 'origin/feat/x', 'origin/main'])
    expect(branches[0]).toEqual({
      name: 'main',
      remote: false,
      current: true,
      upstream: 'origin/main',
      shortHash: 'aaa1111',
      date: 100000
    })
    expect(branches.filter((b) => b.remote).every((b) => !b.current && b.upstream === null)).toBe(true)
  })

  it('sorts locals by most recent commit', () => {
    const out = [line('refs/heads/a', ' ', '', 'h1', 10), line('refs/heads/b', ' ', '', 'h2', 20)].join('\n')
    expect(parseBranches(out).map((b) => b.name)).toEqual(['b', 'a'])
  })

  it('ignores unknown refs and empty output', () => {
    expect(parseBranches('')).toEqual([])
    expect(parseBranches(line('refs/tags/v1', ' ', '', 'h', 1))).toEqual([])
  })
})

describe('parseBranches: extra cases', () => {
  it('keeps the full name of local branches with a slash', () => {
    const out = line('refs/heads/feature/login/v2', ' ', '', 'h1', 10)
    expect(parseBranches(out)[0]).toMatchObject({ name: 'feature/login/v2', remote: false })
  })

  it('the current branch comes first even being the oldest', () => {
    const out = [
      line('refs/heads/new', ' ', '', 'h2', 999),
      line('refs/heads/main', '*', '', 'h1', 1),
      line('refs/remotes/origin/zzz', ' ', '', 'h3', 5000)
    ].join('\n')
    expect(parseBranches(out).map((b) => b.name)).toEqual(['main', 'new', 'origin/zzz'])
  })

  it('locals always before remotes, even the most recent remotes', () => {
    const out = [line('refs/remotes/origin/x', ' ', '', 'h1', 900), line('refs/heads/y', ' ', '', 'h2', 1)].join('\n')
    expect(parseBranches(out).map((b) => b.remote)).toEqual([false, true])
  })

  it('a date tie is broken by name', () => {
    const out = [line('refs/heads/b', ' ', '', 'h', 5), line('refs/heads/a', ' ', '', 'h', 5)].join('\n')
    expect(parseBranches(out).map((b) => b.name)).toEqual(['a', 'b'])
  })

  it('an empty upstream becomes null and a missing or invalid date becomes 0', () => {
    const [b] = parseBranches(['refs/heads/x', ' ', '', 'abc', ''].join('\x1f'))
    expect(b.upstream).toBeNull()
    expect(b.date).toBe(0)
    const [c] = parseBranches(['refs/heads/x', ' ', '', 'abc', 'nan'].join('\x1f'))
    expect(c.date).toBe(0)
  })

  it('a remote without a name after the remote and blank lines are ignored', () => {
    const out = ['', line('refs/remotes/origin', ' ', '', 'h', 1), '', line('refs/heads/ok', ' ', '', 'h', 1)].join(
      '\n'
    )
    expect(parseBranches(out).map((b) => b.name)).toEqual(['ok'])
  })

  it('accepts CRLF in the output without breaking the last numeric field', () => {
    // `\r` stuck to the timestamp makes Number() ignore the whitespace: the date stays valid.
    const out = line('refs/heads/x', '*', '', 'h', 7) + '\r\n'
    expect(parseBranches(out)[0].date).toBe(7000)
  })
})
