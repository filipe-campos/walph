import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RG } from './rgPath'
import { buildGlobArgs, expandSettingsGlob, expandUserGlob, splitGlobList } from './searchGlobs'

describe('splitGlobList', () => {
  it('splits by comma, trims and drops empty ones', () => {
    expect(splitGlobList(' *.ts , src ,, ')).toEqual(['*.ts', 'src'])
    expect(splitGlobList('')).toEqual([])
  })
  it('does not split a comma inside braces', () => {
    expect(splitGlobList('*.{ts,tsx}, lib')).toEqual(['*.{ts,tsx}', 'lib'])
  })
})

describe('expandUserGlob', () => {
  it('anchors with ./ or /', () => {
    expect(expandUserGlob('./x')).toEqual(['/x', '/x/**'])
    expect(expandUserGlob('/x/')).toEqual(['/x', '/x/**'])
  })
  it('without a slash applies at any level', () => {
    expect(expandUserGlob('x')).toEqual(['x', '**/x/**'])
  })
  it('a slash in the middle is relative to the root', () => {
    expect(expandUserGlob('src/a')).toEqual(['src/a', 'src/a/**'])
  })
  it('does not duplicate /**', () => {
    expect(expandUserGlob('src/**')).toEqual(['src/**'])
    expect(expandUserGlob('./src/**')).toEqual(['/src/**'])
  })
})

describe('path separator per platform', () => {
  it('converts \\ into / only on Windows', () => {
    expect(expandUserGlob('src\\a', 'win32')).toEqual(['src/a', 'src/a/**'])
    expect(expandUserGlob('src\\a', 'linux')).toEqual(['src\\a', '**/src\\a/**'])
    expect(expandSettingsGlob('dist\\x', 'win32')).toBe('/dist/x')
    expect(expandSettingsGlob('a\\*', 'darwin')).toBe('/a\\*')
    expect(buildGlobArgs({ include: 'a\\b', platform: 'win32' })).toEqual(['--glob=a/b', '--glob=a/b/**'])
  })
})

describe('expandSettingsGlob', () => {
  it('anchors at the root, except **/', () => {
    expect(expandSettingsGlob('dist')).toBe('/dist')
    expect(expandSettingsGlob('./dist/')).toBe('/dist')
    expect(expandSettingsGlob('**/dist')).toBe('**/dist')
    expect(expandSettingsGlob('  ')).toBeNull()
  })
})

describe('buildGlobArgs', () => {
  it('includes first, then excludes', () => {
    expect(buildGlobArgs({ include: 'src/**', exclude: 'a', settingsExcludes: ['dist'] })).toEqual([
      '--glob=src/**',
      '--glob=!/dist',
      '--glob=!a',
      '--glob=!**/a/**'
    ])
  })
})

describe('against the real ripgrep', () => {
  let dir: string
  const files = [
    'src/a.js',
    'src/lib/b.js',
    'src/dist/c.js',
    'dist/d.js',
    'a/e.ts',
    'x/a/f.ts',
    'node_modules/m/g.js',
    'h.txt'
  ]

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'walph-globs-'))
    writeFileSync(join(dir, '.gitignore'), 'node_modules\n')
    for (const f of files) {
      mkdirSync(dirname(join(dir, f)), { recursive: true })
      writeFileSync(join(dir, f), 'needle\n')
    }
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  function run(input: Parameters<typeof buildGlobArgs>[0]): string[] {
    const out = execFileSync(
      RG,
      ['--no-config', '--files', '--hidden', '--no-require-git', ...buildGlobArgs(input), '--', '.'],
      { cwd: dir, encoding: 'utf8' }
    )
    return out
      .split('\n')
      .filter(Boolean)
      .map((p) => p.replace(/^\.[\\/]/, '').replaceAll('\\', '/'))
      .sort()
  }

  it('a folder include includes its content', () => {
    expect(run({ include: 'src/**' })).toEqual(['src/a.js', 'src/dist/c.js', 'src/lib/b.js'])
    expect(run({ include: 'src/lib' })).toEqual(['src/lib/b.js'])
    expect(run({ include: 'a' })).toEqual(['a/e.ts', 'x/a/f.ts'])
    expect(run({ include: './a' })).toEqual(['a/e.ts'])
  })
  it('include with comma and braces', () => {
    expect(run({ include: '*.{ts,txt}' })).toEqual(['a/e.ts', 'h.txt', 'x/a/f.ts'])
    expect(run({ include: '*.txt, a' })).toEqual(['a/e.ts', 'h.txt', 'x/a/f.ts'])
  })
  it('include does not beat .gitignore', () => {
    expect(run({ include: '*.js' })).not.toContain('node_modules/m/g.js')
  })
  it('the user exclude beats the include', () => {
    expect(run({ include: 'src/**', exclude: 'dist' })).toEqual(['src/a.js', 'src/lib/b.js'])
  })
  it('settings excludes: `dist` only at the root, `**/dist` at any level', () => {
    expect(run({ settingsExcludes: ['dist'] })).toContain('src/dist/c.js')
    expect(run({ settingsExcludes: ['dist'] })).not.toContain('dist/d.js')
    const any = run({ settingsExcludes: ['**/dist'] })
    expect(any).not.toContain('src/dist/c.js')
    expect(any).not.toContain('dist/d.js')
  })
})
