import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { git, makeTempRepo } from '../testing/gitRepo'
import { parseBranchLine, parseStatus } from './parseStatus'

const root = join('/repo')
const nul = (...entries: string[]): string => entries.join('\0') + '\0'

describe('parseBranchLine', () => {
  it('reads a simple branch without upstream', () => {
    expect(parseBranchLine('main')).toEqual({ branch: 'main', upstream: null, ahead: 0, behind: 0 })
  })

  it('reads a branch with an up-to-date upstream', () => {
    expect(parseBranchLine('main...origin/main')).toEqual({
      branch: 'main',
      upstream: 'origin/main',
      ahead: 0,
      behind: 0
    })
  })

  it('reads ahead and behind', () => {
    expect(parseBranchLine('feature/x...origin/feature/x [ahead 3, behind 2]')).toEqual({
      branch: 'feature/x',
      upstream: 'origin/feature/x',
      ahead: 3,
      behind: 2
    })
  })

  it('reads only ahead', () => {
    expect(parseBranchLine('main...origin/main [ahead 12]')).toMatchObject({
      upstream: 'origin/main',
      ahead: 12,
      behind: 0
    })
  })

  it('reads only behind', () => {
    expect(parseBranchLine('main...origin/main [behind 7]')).toMatchObject({
      upstream: 'origin/main',
      ahead: 0,
      behind: 7
    })
  })

  it('handles a removed upstream (gone) without ahead/behind', () => {
    expect(parseBranchLine('main...origin/main [gone]')).toEqual({
      branch: 'main',
      upstream: 'origin/main',
      ahead: 0,
      behind: 0
    })
  })

  it('handles a repository without commits', () => {
    expect(parseBranchLine('No commits yet on main')).toEqual({ branch: 'main', upstream: null, ahead: 0, behind: 0 })
  })

  it('handles a detached HEAD', () => {
    expect(parseBranchLine('HEAD (no branch)')).toEqual({
      branch: 'HEAD (detached)',
      upstream: null,
      ahead: 0,
      behind: 0
    })
  })
})

describe('parseStatus', () => {
  it('reads branch and modified, staged and untracked files', () => {
    const out = nul(
      '## main...origin/main [ahead 1, behind 2]',
      ' M src/a.ts',
      'M  src/b.ts',
      'A  new.txt',
      '?? notas.txt'
    )
    expect(parseStatus(out, root)).toEqual({
      branch: 'main',
      upstream: 'origin/main',
      ahead: 1,
      behind: 2,
      files: [
        { path: join(root, 'src/a.ts'), index: ' ', workingDir: 'M' },
        { path: join(root, 'src/b.ts'), index: 'M', workingDir: ' ' },
        { path: join(root, 'new.txt'), index: 'A', workingDir: ' ' },
        { path: join(root, 'notas.txt'), index: '?', workingDir: '?' }
      ]
    })
  })

  it('returns an empty list when the tree is clean', () => {
    expect(parseStatus(nul('## main'), root)).toEqual({
      branch: 'main',
      upstream: null,
      ahead: 0,
      behind: 0,
      files: []
    })
  })

  it('reads a repository without commits with an untracked file', () => {
    const out = nul('## No commits yet on main', '?? a.txt')
    expect(parseStatus(out, root)).toEqual({
      branch: 'main',
      upstream: null,
      ahead: 0,
      behind: 0,
      files: [{ path: join(root, 'a.txt'), index: '?', workingDir: '?' }]
    })
  })

  it('reads a detached HEAD', () => {
    const out = nul('## HEAD (no branch)', ' M a.txt')
    const r = parseStatus(out, root)
    expect(r.branch).toBe('HEAD (detached)')
    expect(r.files).toHaveLength(1)
  })

  it('skips the source path of a rename', () => {
    const out = nul('## main', 'R  new.ts', 'former.ts', ' M other.ts')
    const r = parseStatus(out, root)
    expect(r.files).toEqual([
      { path: join(root, 'new.ts'), index: 'R', workingDir: ' ' },
      { path: join(root, 'other.ts'), index: ' ', workingDir: 'M' }
    ])
  })

  it('skips the source path of a copy', () => {
    const out = nul('## main', 'C  copia.ts', 'orig.ts', '?? z.txt')
    expect(parseStatus(out, root).files.map((f) => f.path)).toEqual([join(root, 'copia.ts'), join(root, 'z.txt')])
  })

  it('does not mistake a rename source that looks like a status entry', () => {
    // the source "?? x" would have been read as untracked if the skip were missing
    const out = nul('## main', 'R  b.ts', '?? x')
    expect(parseStatus(out, root).files).toHaveLength(1)
  })

  it('preserves spaces and non-ASCII characters in the paths', () => {
    const out = nul('## main', '?? pasta com espaço/ação.txt')
    expect(parseStatus(out, root).files[0].path).toBe(join(root, 'pasta com espaço/ação.txt'))
  })

  it('reads a rename with a working tree modification', () => {
    const out = nul('## main', 'RM new.ts', 'old.ts')
    expect(parseStatus(out, root).files).toEqual([{ path: join(root, 'new.ts'), index: 'R', workingDir: 'M' }])
  })

  it('reads merge conflicts', () => {
    const out = nul('## main', 'UU conflito.ts', 'AA ambos.ts')
    expect(parseStatus(out, root).files.map((f) => [f.index, f.workingDir])).toEqual([
      ['U', 'U'],
      ['A', 'A']
    ])
  })

  it('produces no files for empty output', () => {
    expect(parseStatus('', root).files).toEqual([])
  })
})

describe('parseStatus with real git output', () => {
  it('parses rename, modification and untracked from a temporary repository', () => {
    const dir = makeTempRepo()
    try {
      // No commits yet
      writeFileSync(join(dir, 'a.txt'), 'a\n')
      const empty = parseStatus(git(dir, 'status', '--porcelain=v1', '-z', '--branch', '--untracked-files=all'), dir)
      expect(empty).toMatchObject({ branch: 'main', upstream: null, ahead: 0, behind: 0 })
      expect(empty.files).toEqual([{ path: join(dir, 'a.txt'), index: '?', workingDir: '?' }])

      writeFileSync(join(dir, 'old.txt'), 'content long enough for git to detect the rename\n')
      git(dir, 'add', '.')
      git(dir, 'commit', '-q', '-m', 'init')
      git(dir, 'mv', 'old.txt', 'new.txt')
      writeFileSync(join(dir, 'a.txt'), 'alterado\n')
      writeFileSync(join(dir, 'ação.txt'), 'x\n')

      const out = git(dir, 'status', '--porcelain=v1', '-z', '--branch', '--untracked-files=all')
      const r = parseStatus(out, dir)
      expect(r.branch).toBe('main')
      const byPath = Object.fromEntries(r.files.map((f) => [f.path, f.index + f.workingDir]))
      expect(byPath).toEqual({
        [join(dir, 'new.txt')]: 'R ',
        [join(dir, 'a.txt')]: ' M',
        [join(dir, 'ação.txt')]: '??'
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
