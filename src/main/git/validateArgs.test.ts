import { rmSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { makeTempRepo, useGitTestEnv } from '../testing/gitRepo'
import {
  assertBranchName,
  assertHash,
  assertStashIndex,
  parseCommitFile,
  repoRelative,
  repoRelativeList
} from './validateArgs'

// `resolve` adds the drive on Windows, like the paths `repoRelative` resolves.
const top = resolve(sep, 'repo')

describe('repoRelative', () => {
  it('returns the path relative to the root with /', () => {
    expect(repoRelative(top, join(top, 'a', 'b.txt'))).toBe('a/b.txt')
  })

  it('accepts a file named ..foo at the root', () => {
    expect(repoRelative(top, join(top, '..foo'))).toBe('..foo')
  })

  it('refuses a path outside the repository, the root itself and a relative path', () => {
    expect(() => repoRelative(top, join(sep, 'other', 'x'))).toThrow('fora do repositório')
    expect(() => repoRelative(top, top)).toThrow('fora do repositório')
    expect(() => repoRelative(top, 'a/b')).toThrow('Caminho inválido')
    expect(() => repoRelative(top, 42)).toThrow('Caminho inválido')
  })
})

describe('repoRelativeList', () => {
  it('converts each path', () => {
    expect(repoRelativeList(top, [join(top, 'a'), join(top, 'b', 'c')])).toEqual(['a', 'b/c'])
  })

  it('refuses an empty list or one that is not a list', () => {
    expect(() => repoRelativeList(top, [])).toThrow('Nenhum arquivo informado')
    expect(() => repoRelativeList(top, 'a')).toThrow('Nenhum arquivo informado')
  })
})

describe('parseCommitFile', () => {
  it('keeps only status and paths', () => {
    expect(parseCommitFile({ status: 'R100', path: 'b', oldPath: 'a', extra: 1 })).toEqual({
      status: 'R100',
      path: 'b',
      oldPath: 'a'
    })
  })

  it('refuses what is not an object or has no status', () => {
    expect(() => parseCommitFile(null)).toThrow('Arquivo inválido')
    expect(() => parseCommitFile([])).toThrow('Arquivo inválido')
    expect(() => parseCommitFile({ status: '' })).toThrow('Arquivo inválido')
    expect(() => parseCommitFile({ status: 1 })).toThrow('Arquivo inválido')
  })
})

describe('assertHash', () => {
  it('accepts hex of 4 to 64 characters', () => {
    expect(assertHash('abcd')).toBe('abcd')
    expect(assertHash('A'.repeat(40))).toBe('A'.repeat(40))
  })

  it('refuses short, long, non-hex and non-string', () => {
    for (const bad of ['abc', 'a'.repeat(65), 'zzzz', '--help', '', 12, undefined]) {
      expect(() => assertHash(bad)).toThrow('Commit inválido')
    }
  })
})

describe('assertStashIndex', () => {
  it('accepts a non-negative integer', () => {
    expect(assertStashIndex(0)).toBe(0)
    expect(assertStashIndex(3)).toBe(3)
  })

  it('refuses negative, fractional and non-number', () => {
    for (const bad of [-1, 1.5, '1', NaN, undefined]) expect(() => assertStashIndex(bad)).toThrow('Stash inválido')
  })
})

describe('assertBranchName', () => {
  const restoreEnv = useGitTestEnv()
  const repo = makeTempRepo({ 'a.txt': 'a\n' }, { message: 'init' })
  afterAll(() => {
    rmSync(repo, { recursive: true, force: true })
    restoreEnv()
  })

  it('accepts a valid name', async () => {
    expect(await assertBranchName(repo, 'feature/x')).toBe('feature/x')
  })

  it('refuses empty, an option, @{ and a name git rejects', async () => {
    for (const bad of ['', '  ', '-f', 'a@{1}', 'a b', 'a..b', 7]) {
      await expect(assertBranchName(repo, bad)).rejects.toThrow('Nome de branch inválido')
    }
  })
})
