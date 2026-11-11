import { describe, expect, it } from 'vitest'
import { activeExcludes, activeSearchExcludes, DEFAULT_SETTINGS, mergeSettings, sanitizeSettings } from './settings'

describe('mergeSettings', () => {
  it('with no layers returns the defaults (a copy)', () => {
    const merged = mergeSettings()
    expect(merged).toEqual(DEFAULT_SETTINGS)
    expect(merged['files.exclude']).not.toBe(DEFAULT_SETTINGS['files.exclude'])
  })

  it('default ← user ← workspace, key by key', () => {
    const merged = mergeSettings(
      { 'editor.fontSize': 15, 'editor.tabSize': 4 },
      { 'editor.fontSize': 18, 'terminal.shell': '/bin/zsh' }
    )
    expect(merged['editor.fontSize']).toBe(18)
    expect(merged['editor.tabSize']).toBe(4)
    expect(merged['terminal.shell']).toBe('/bin/zsh')
    expect(merged['editor.wordWrap']).toBe('off')
  })

  it('files.exclude is merged by glob; false in the workspace turns off a user glob', () => {
    const merged = mergeSettings(
      { 'files.exclude': { '**/dist': true, '**/tmp': true } },
      { 'files.exclude': { '**/dist': false, '**/out': true } }
    )
    expect(merged['files.exclude']).toEqual({
      '**/.git': true,
      '**/.DS_Store': true,
      '**/dist': false,
      '**/tmp': true,
      '**/out': true
    })
    expect(activeExcludes(merged).sort()).toEqual(['**/.DS_Store', '**/.git', '**/out', '**/tmp'])
  })

  it('does not change the defaults or the layers', () => {
    const layer = { 'files.exclude': { '**/x': true } }
    mergeSettings(layer)
    expect(DEFAULT_SETTINGS['files.exclude']).toEqual({ '**/.git': true, '**/.DS_Store': true })
    expect(layer['files.exclude']).toEqual({ '**/x': true })
  })
})

describe('sanitizeSettings', () => {
  it('keeps the valid ones and warns about the rest', () => {
    const { values, warnings } = sanitizeSettings({
      'editor.fontSize': 100,
      'editor.insertSpaces': false,
      'files.autoSave': 'nope',
      'files.exclude': { '**/a': true, '**/b': 'x' },
      unknown: 1
    })
    expect(values).toEqual({ 'editor.insertSpaces': false })
    expect(warnings).toHaveLength(4)
  })

  it('claude.fallbackModel: comma-separated list, without spaces or empty items', () => {
    for (const ok of ['', 'sonnet', 'sonnet,haiku'])
      expect(sanitizeSettings({ 'claude.fallbackModel': ok }).values).toEqual({ 'claude.fallbackModel': ok })
    for (const bad of ['sonnet, haiku', ',sonnet', 'a,,b', 'a,', 7])
      expect(sanitizeSettings({ 'claude.fallbackModel': bad }).values).toEqual({})
  })

  it('claude.model and fallbackModel reject ids that are not model ids', () => {
    for (const ok of ['', 'opus', 'claude-opus-4-1[1m]'])
      expect(sanitizeSettings({ 'claude.model': ok }).values).toEqual({ 'claude.model': ok })
    for (const bad of ['a b', '-x', 'a;b', 'a'.repeat(201), 7]) {
      expect(sanitizeSettings({ 'claude.model': bad }).values).toEqual({})
      expect(sanitizeSettings({ 'claude.fallbackModel': bad }).values).toEqual({})
    }
    expect(sanitizeSettings({ 'claude.fallbackModel': 'a,-b' }).values).toEqual({})
  })

  it('requires integers within the range', () => {
    expect(sanitizeSettings({ 'editor.fontSize': 13.5 }).values).toEqual({})
    expect(sanitizeSettings({ 'editor.fontSize': 6 }).values).toEqual({ 'editor.fontSize': 6 })
  })

  it('a root that is not an object produces a warning', () => {
    expect(sanitizeSettings([]).warnings).toHaveLength(1)
    expect(sanitizeSettings(null).values).toEqual({})
  })
})

describe('search.exclude', () => {
  it('defaults to node_modules and bower_components on', () => {
    expect(DEFAULT_SETTINGS['search.exclude']).toEqual({ '**/node_modules': true, '**/bower_components': true })
    expect(mergeSettings()['search.exclude']).not.toBe(DEFAULT_SETTINGS['search.exclude'])
  })

  it('accepts a { glob: boolean } object', () => {
    const { values, warnings } = sanitizeSettings({ 'search.exclude': { '**/dist': true, '**/x': false } })
    expect(values).toEqual({ 'search.exclude': { '**/dist': true, '**/x': false } })
    expect(warnings).toEqual([])
  })

  it('warns and discards a value that is not an object or has a non-boolean value', () => {
    for (const bad of ['**/dist', ['**/dist'], null, 3, { '**/dist': 'yes' }, { '**/dist': 1 }]) {
      const { values, warnings } = sanitizeSettings({ 'search.exclude': bad })
      expect(values, JSON.stringify(bad)).toEqual({})
      expect(warnings, JSON.stringify(bad)).toHaveLength(1)
    }
  })

  it('is merged by glob across layers: the workspace adds or turns off', () => {
    const merged = mergeSettings(
      { 'search.exclude': { '**/dist': true } },
      { 'search.exclude': { '**/node_modules': false, '**/out': true } }
    )
    expect(merged['search.exclude']).toEqual({
      '**/node_modules': false,
      '**/bower_components': true,
      '**/dist': true,
      '**/out': true
    })
    expect(DEFAULT_SETTINGS['search.exclude']).toEqual({ '**/node_modules': true, '**/bower_components': true })
  })

  it('does not mix with files.exclude in the merge', () => {
    const merged = mergeSettings({ 'search.exclude': { '**/dist': true } })
    expect(merged['files.exclude']).toEqual(DEFAULT_SETTINGS['files.exclude'])
  })
})

describe('activeSearchExcludes', () => {
  it('joins active files.exclude and search.exclude, without duplicates and without the disabled ones', () => {
    const merged = mergeSettings({
      'files.exclude': { '**/dist': true, '**/off': false },
      'search.exclude': { '**/dist': true, '**/out': true, '**/node_modules': false }
    })
    const globs = activeSearchExcludes(merged)
    expect([...globs].sort()).toEqual(['**/.DS_Store', '**/.git', '**/bower_components', '**/dist', '**/out'])
    expect(new Set(globs).size).toBe(globs.length)
  })

  it('with the defaults includes files.exclude and search.exclude', () => {
    expect([...activeSearchExcludes(mergeSettings())].sort()).toEqual([
      '**/.DS_Store',
      '**/.git',
      '**/bower_components',
      '**/node_modules'
    ])
  })
})

describe('terminal.profiles', () => {
  const check = (profiles: unknown): boolean =>
    'terminal.profiles' in sanitizeSettings({ 'terminal.profiles': profiles }, 'user', 'darwin').values

  it('accepts path, args and env (null removes)', () => {
    expect(check({ Bash: { path: '/bin/bash', args: ['-l'], env: { FOO: '1', BAR: null } } })).toBe(true)
  })

  it('rejects a relative/empty path, an unknown key and an empty variable name or one with "="', () => {
    expect(check({ X: { path: './sh' } })).toBe(false)
    expect(check({ X: { path: '' } })).toBe(false)
    expect(check({ X: { path: '/bin/sh', cwd: '/' } })).toBe(false)
    expect(check({ X: { path: '/bin/sh', env: { '': 'x' } } })).toBe(false)
    expect(check({ X: { path: '/bin/sh', env: { 'A=B': 'c' } } })).toBe(false)
  })

  it('is user-only: the workspace discards it with a warning', () => {
    const r = sanitizeSettings({ 'terminal.profiles': {}, 'terminal.defaultProfile': 'X' }, 'workspace')
    expect(r.values).toEqual({})
    expect(r.warnings).toHaveLength(2)
  })
})

describe('debug.adapters', () => {
  const check = (adapters: unknown): boolean =>
    'debug.adapters' in sanitizeSettings({ 'debug.adapters': adapters }, 'user', 'darwin').values

  it('accepts stdio and tcp with ${port} in the arguments', () => {
    expect(check({ python: { command: '/venv/bin/python', args: ['-m', 'debugpy.adapter'], env: { A: null } } })).toBe(
      true
    )
    expect(
      check({ node: { command: 'node', args: ['/js-debug/src/dapDebugServer.js', '${port}'], transport: 'tcp' } })
    ).toBe(true)
  })

  it('rejects a relative/empty command, tcp without ${port}, unknown keys or types', () => {
    expect(check({ python: { command: './py' } })).toBe(false)
    expect(check({ python: { command: '' } })).toBe(false)
    expect(check({ node: { command: 'node', args: ['server.js'], transport: 'tcp' } })).toBe(false)
    expect(check({ node: { command: 'node', transport: 'pipe' } })).toBe(false)
    expect(check({ node: { command: 'node', port: 9229 } })).toBe(false)
    expect(check({ 'bad type': { command: 'node' } })).toBe(false)
  })

  it('is user-only: the workspace discards it with a warning', () => {
    const r = sanitizeSettings({ 'debug.adapters': { python: { command: 'python3' } } }, 'workspace')
    expect(r.values).toEqual({})
    expect(r.warnings).toHaveLength(1)
  })
})

describe('update.*', () => {
  it('has a default (on, stable channel)', () => {
    expect(DEFAULT_SETTINGS['update.enabled']).toBe(true)
    expect(DEFAULT_SETTINGS['update.channel']).toBe('stable')
  })

  it('validates the channel and the boolean', () => {
    const { values, warnings } = sanitizeSettings({ 'update.channel': 'nightly', 'update.enabled': 'yes' })
    expect(values).toEqual({})
    expect(warnings).toHaveLength(2)
    expect(sanitizeSettings({ 'update.channel': 'beta' }).values).toEqual({ 'update.channel': 'beta' })
  })

  it('the workspace does not change the update policy', () => {
    const { values, warnings } = sanitizeSettings({ 'update.channel': 'beta', 'update.enabled': false }, 'workspace')
    expect(values).toEqual({})
    expect(warnings).toHaveLength(2)
  })
})
