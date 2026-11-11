import { describe, expect, it } from 'vitest'
import { FLOOR_WATCH_IGNORES, buildWatchIgnoreGlobs, createIgnoreMatcher, ignoreKey } from './watchFilter'

const matcher = (extra: string[] = []) => createIgnoreMatcher(buildWatchIgnoreGlobs(extra))

describe('buildWatchIgnoreGlobs', () => {
  it('always includes the floor', () => {
    expect(buildWatchIgnoreGlobs([])).toEqual([...FLOOR_WATCH_IGNORES])
  })

  it('drops the pattern that would hide .git (files.exclude)', () => {
    const globs = buildWatchIgnoreGlobs(['**/.git', '**/dist'])
    expect(globs).not.toContain('**/.git')
    expect(globs).toContain('**/dist')
    expect(globs).toContain('**/dist/**')
  })

  it('ignores empty entries and invalid globs', () => {
    expect(buildWatchIgnoreGlobs(['', '  ', '{a,b'])).toEqual([...FLOOR_WATCH_IGNORES])
  })
})

describe('createIgnoreMatcher', () => {
  it('ignores node_modules at any level, including the folder itself', () => {
    const ignored = matcher()
    expect(ignored('node_modules')).toBe(true)
    expect(ignored('node_modules/x/index.js')).toBe(true)
    expect(ignored('pkg/node_modules/x')).toBe(true)
    expect(ignored('src/node_modules_like.ts')).toBe(false)
  })

  it('watches what git needs and ignores objects, logs and hooks', () => {
    const ignored = matcher()
    for (const p of ['.git/HEAD', '.git/index', '.git/refs/heads/main', '.git/packed-refs', '.git/MERGE_HEAD'])
      expect(ignored(p)).toBe(false)
    for (const p of ['.git/objects/ab/cd', '.git/logs/HEAD', '.git/hooks/pre-commit', '.git/lfs/tmp'])
      expect(ignored(p)).toBe(true)
    expect(ignored('.git/modules/sub/objects/pack/x')).toBe(true)
    expect(ignored('.git/modules/sub/HEAD')).toBe(false)
  })

  it('applies the settings globs (folder and contents)', () => {
    const ignored = matcher(['**/.next/**', '**/coverage', 'build/tmp'])
    expect(ignored('.next/cache/a')).toBe(true)
    expect(ignored('app/coverage/lcov.info')).toBe(true)
    expect(ignored('build/tmp/x')).toBe(true)
    expect(ignored('build/out.js')).toBe(false)
    expect(ignored('dist/a.js')).toBe(false)
  })

  it('ignores the .DS_Store churn', () => {
    expect(matcher()('src/.DS_Store')).toBe(true)
  })
})

describe('ignoreKey', () => {
  it('does not depend on the order', () => {
    expect(ignoreKey(['b', 'a'])).toBe(ignoreKey(['a', 'b']))
    expect(ignoreKey(['a'])).not.toBe(ignoreKey(['a', 'b']))
  })
})
