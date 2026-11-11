import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { git } from '../testing/gitRepo'
import { isolatedGitConfigEnv, makeRealTempDir } from '../testing/testEnv'
import { EXCLUDE_PATTERN, ensureLocalSettingsIgnored, excludeAddition } from './gitExclude'

describe('excludeAddition', () => {
  it('appends the pattern with the right line break', () => {
    expect(excludeAddition('')).toBe(`${EXCLUDE_PATTERN}\n`)
    expect(excludeAddition('# x\n')).toBe(`${EXCLUDE_PATTERN}\n`)
    expect(excludeAddition('# x')).toBe(`\n${EXCLUDE_PATTERN}\n`)
  })
  it('does not duplicate', () => {
    expect(excludeAddition(`a\n${EXCLUDE_PATTERN}\n`)).toBe('')
    expect(excludeAddition('.claude/settings.local.json\r\n')).toBe('')
  })
})

describe('ensureLocalSettingsIgnored', () => {
  let dir: string
  const saved = {
    global: process.env.GIT_CONFIG_GLOBAL,
    nosystem: process.env.GIT_CONFIG_NOSYSTEM,
    xdg: process.env.XDG_CONFIG_HOME
  }
  beforeEach(async () => {
    // The Claude CLI usually ignores this file in the user's global gitignore: isolate from the machine environment.
    const isolated = isolatedGitConfigEnv()
    process.env.GIT_CONFIG_GLOBAL = isolated.GIT_CONFIG_GLOBAL
    process.env.GIT_CONFIG_NOSYSTEM = isolated.GIT_CONFIG_NOSYSTEM
    dir = makeRealTempDir('walph-gitex-')
    // The default `core.excludesFile` (~/.config/git/ignore) also belongs to the user.
    process.env.XDG_CONFIG_HOME = join(dir, 'xdg')
  })
  afterEach(async () => {
    for (const [key, value] of [
      ['GIT_CONFIG_GLOBAL', saved.global],
      ['GIT_CONFIG_NOSYSTEM', saved.nosystem],
      ['XDG_CONFIG_HOME', saved.xdg]
    ] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await rm(dir, { recursive: true, force: true })
  })

  const ignored = (cwd: string): boolean => {
    try {
      git(cwd, 'check-ignore', '-q', '--', '.claude/settings.local.json')
      return true
    } catch {
      return false
    }
  }

  it('adds to the repo info/exclude (also from a subfolder) and does not touch .gitignore', async () => {
    git(dir, 'init', '-q')
    await writeFile(join(dir, '.gitignore'), 'node_modules\n')
    await mkdir(join(dir, 'sub'))
    const sub = join(dir, 'sub')
    expect(ignored(sub)).toBe(false)
    await ensureLocalSettingsIgnored(sub)
    expect(ignored(sub)).toBe(true)
    expect(await readFile(join(dir, '.git', 'info', 'exclude'), 'utf8')).toContain(EXCLUDE_PATTERN)
    expect(await readFile(join(dir, '.gitignore'), 'utf8')).toBe('node_modules\n')
    await ensureLocalSettingsIgnored(sub)
    expect((await readFile(join(dir, '.git', 'info', 'exclude'), 'utf8')).split(EXCLUDE_PATTERN)).toHaveLength(2)
  })

  it('preserves the existing exclude (no final break) and leaves no temp file', async () => {
    git(dir, 'init', '-q')
    const exclude = join(dir, '.git', 'info', 'exclude')
    await mkdir(join(dir, '.git', 'info'), { recursive: true })
    await writeFile(exclude, '# mine\nfoo')
    await ensureLocalSettingsIgnored(dir)
    expect(await readFile(exclude, 'utf8')).toBe(`# mine\nfoo\n${EXCLUDE_PATTERN}\n`)
    expect(await readdir(join(dir, '.git', 'info'))).toEqual(['exclude'])
  })

  it('a non-UTF-8 exclude comes back byte for byte and a read error does not wipe the file', async () => {
    git(dir, 'init', '-q')
    const exclude = join(dir, '.git', 'info', 'exclude')
    await mkdir(join(dir, '.git', 'info'), { recursive: true })
    const original = Buffer.from([0x23, 0x20, 0xe9, 0x0a])
    await writeFile(exclude, original)
    await ensureLocalSettingsIgnored(dir)
    expect(await readFile(exclude)).toEqual(Buffer.concat([original, Buffer.from(`${EXCLUDE_PATTERN}\n`)]))

    await rm(exclude)
    await mkdir(exclude)
    await ensureLocalSettingsIgnored(dir)
    expect((await stat(exclude)).isDirectory()).toBe(true)
  })

  it('outside a repository does nothing and does not throw', async () => {
    await expect(ensureLocalSettingsIgnored(dir)).resolves.toBeUndefined()
  })
})
