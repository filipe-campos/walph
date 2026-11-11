import { describe, expect, it } from 'vitest'
import {
  activeExcludes,
  activeSearchExcludes,
  DEFAULT_SETTINGS,
  isValidShellSetting,
  mergeSettings,
  sanitizeSettings,
  SETTING_KEYS,
  USER_ONLY_SETTINGS,
  type Settings
} from './settings'

const deepFreeze = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

describe('mergeSettings in three layers', () => {
  it('the workspace beats the user, which beats the default, key by key', () => {
    const user: Partial<Settings> = { 'editor.fontSize': 16, 'editor.tabSize': 4, 'workbench.theme': 'Walph Light' }
    const workspace: Partial<Settings> = { 'editor.fontSize': 20, 'editor.wordWrap': 'on' }
    const merged = mergeSettings(user, workspace)
    expect(merged['editor.fontSize']).toBe(20)
    expect(merged['editor.tabSize']).toBe(4)
    expect(merged['workbench.theme']).toBe('Walph Light')
    expect(merged['editor.wordWrap']).toBe('on')
    expect(merged['terminal.fontSize']).toBe(DEFAULT_SETTINGS['terminal.fontSize'])
  })

  it('an empty layer or one with undefined does not erase the previous value', () => {
    const merged = mergeSettings({ 'editor.fontSize': 16 }, {}, { 'editor.fontSize': undefined })
    expect(merged['editor.fontSize']).toBe(16)
  })

  it('valid falsy values (false, 0 and empty text) override', () => {
    const merged = mergeSettings(
      { 'editor.insertSpaces': false, 'terminal.shell': '/bin/zsh' },
      { 'terminal.shell': '' }
    )
    expect(merged['editor.insertSpaces']).toBe(false)
    expect(merged['terminal.shell']).toBe('')
  })

  it('the layer order matters', () => {
    const a = { 'editor.fontSize': 10 }
    const b = { 'editor.fontSize': 30 }
    expect(mergeSettings(a, b)['editor.fontSize']).toBe(30)
    expect(mergeSettings(b, a)['editor.fontSize']).toBe(10)
  })

  it('files.exclude: accumulates globs from the three layers', () => {
    const merged = mergeSettings({ 'files.exclude': { '**/a': true } }, { 'files.exclude': { '**/b': true } })
    expect(activeExcludes(merged).sort()).toEqual(['**/.DS_Store', '**/.git', '**/a', '**/b'])
  })

  it('files.exclude: false turns off even a default glob', () => {
    const merged = mergeSettings({ 'files.exclude': { '**/.git': false } })
    expect(merged['files.exclude']['**/.git']).toBe(false)
    expect(activeExcludes(merged)).toEqual(['**/.DS_Store'])
  })

  it('files.exclude: the workspace can turn back on (true) what the user turned off', () => {
    const merged = mergeSettings({ 'files.exclude': { '**/dist': false } }, { 'files.exclude': { '**/dist': true } })
    expect(activeExcludes(merged)).toContain('**/dist')
  })

  it('does not mutate frozen defaults or the layers, and the result is independent', () => {
    const snapshot = structuredClone(DEFAULT_SETTINGS)
    const user = deepFreeze({ 'files.exclude': { '**/x': true }, 'editor.fontSize': 15 })
    const workspace = deepFreeze({ 'files.exclude': { '**/.git': false } })
    const frozenDefaults = deepFreeze(structuredClone(DEFAULT_SETTINGS))
    expect(() => mergeSettings(user, workspace)).not.toThrow()
    const merged = mergeSettings(user, workspace)
    merged['files.exclude']['**/mutated'] = true
    merged['editor.fontSize'] = 99
    expect(DEFAULT_SETTINGS).toEqual(snapshot)
    expect(mergeSettings()).toEqual(frozenDefaults)
  })

  it('ignores unknown keys of a layer', () => {
    const merged = mergeSettings({ foo: 1 } as unknown as Partial<Settings>)
    expect(merged).toEqual(DEFAULT_SETTINGS)
  })

  it('the defaults satisfy the schema itself', () => {
    expect(SETTING_KEYS.sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort())
  })
})

describe('terminal.shell (user-only)', () => {
  it('the workspace discards the key with a warning and the rest of the file applies', () => {
    const { values, warnings } = sanitizeSettings({ 'terminal.shell': './evil', 'editor.fontSize': 15 }, 'workspace')
    expect(values).toEqual({ 'editor.fontSize': 15 })
    expect(warnings).toEqual(['"terminal.shell" só pode ser definido nas configurações do usuário'])
    // Even a valid value is discarded in the workspace.
    expect(sanitizeSettings({ 'terminal.shell': '/bin/zsh' }, 'workspace').values).toEqual({})
  })

  it('the user accepts empty, an absolute path and a simple name', () => {
    for (const shell of ['', '/bin/zsh', 'zsh', 'pwsh.exe', 'C:\\Windows\\System32\\cmd.exe', 'C:/Git/bin/bash.exe']) {
      expect(sanitizeSettings({ 'terminal.shell': shell }).values, shell).toEqual({ 'terminal.shell': shell })
    }
  })

  it('an absolute path depends on the given OS', () => {
    const win = ['C:\\Windows\\cmd.exe', 'C:/Git/bin/bash.exe', '\\\\server\\share\\sh.exe']
    for (const shell of win) {
      expect(isValidShellSetting(shell, 'win32'), shell).toBe(true)
      expect(isValidShellSetting(shell, 'linux'), shell).toBe(false)
      expect(isValidShellSetting(shell, 'darwin'), shell).toBe(false)
    }
    expect(isValidShellSetting('/bin/zsh', 'linux')).toBe(true)
    expect(isValidShellSetting('/bin/zsh', 'win32')).toBe(false)
    for (const platform of ['win32', 'linux', 'darwin']) {
      expect(isValidShellSetting('', platform)).toBe(true)
      expect(isValidShellSetting('pwsh', platform)).toBe(true)
      expect(isValidShellSetting('./evil', platform)).toBe(false)
    }
    const rejected = sanitizeSettings({ 'terminal.shell': 'C:\\a.exe' }, 'user', 'linux')
    expect(rejected.values).toEqual({})
    expect(rejected.warnings).toHaveLength(1)
    expect(sanitizeSettings({ 'terminal.shell': 'C:\\a.exe' }, 'user', 'win32').values).toEqual({
      'terminal.shell': 'C:\\a.exe'
    })
  })

  it('the user cannot use a relative path', () => {
    for (const shell of ['./evil', '../evil', 'bin/evil', '.\\evil.exe', '.', '..', 'C:evil', 42]) {
      const { values, warnings } = sanitizeSettings({ 'terminal.shell': shell })
      expect(values, String(shell)).toEqual({})
      expect(warnings, String(shell)).toHaveLength(1)
    }
  })

  it('is listed in USER_ONLY_SETTINGS and out of the workspace template', () => {
    expect(USER_ONLY_SETTINGS).toContain('terminal.shell')
  })
})

describe('keys named after prototype properties', () => {
  it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty'])('"%s" becomes a warning, no throw', (key) => {
    const { values, warnings } = sanitizeSettings({ [key]: 1, 'editor.fontSize': 16 })
    expect(values).toEqual({ 'editor.fontSize': 16 })
    expect(warnings).toEqual([`configuração desconhecida "${key}"`])
  })
})

describe('search.exclude in three layers', () => {
  it('user and workspace add up globs; false in the workspace turns off a user one', () => {
    const user: Partial<Settings> = { 'search.exclude': { '**/dist': true, '**/tmp': true } }
    const workspace: Partial<Settings> = { 'search.exclude': { '**/dist': false, '**/coverage': true } }
    const merged = mergeSettings(user, workspace)
    expect(merged['search.exclude']).toEqual({
      '**/node_modules': true,
      '**/bower_components': true,
      '**/dist': false,
      '**/tmp': true,
      '**/coverage': true
    })
    expect(activeSearchExcludes(merged)).not.toContain('**/dist')
    expect(activeSearchExcludes(merged)).toContain('**/coverage')
  })

  it('the workspace can turn on in search a glob files.exclude turned off, without duplicates when both turn it on', () => {
    const merged = mergeSettings(
      { 'files.exclude': { '**/dist': true } },
      { 'search.exclude': { '**/dist': true, '**/.git': true } }
    )
    const globs = activeSearchExcludes(merged)
    expect(globs.filter((g) => g === '**/dist')).toHaveLength(1)
    expect(globs.filter((g) => g === '**/.git')).toHaveLength(1)
  })

  it('does not change the layers or the (frozen) defaults', () => {
    const layer = deepFreeze({ 'search.exclude': { '**/x': true } })
    expect(() => mergeSettings(layer)).not.toThrow()
    expect(Object.keys(DEFAULT_SETTINGS['search.exclude'])).not.toContain('**/x')
  })

  it('is a SETTING_KEYS key and applies in the workspace (it is not user-only)', () => {
    expect(SETTING_KEYS).toContain('search.exclude')
    const { values, warnings } = sanitizeSettings({ 'search.exclude': { '**/a': true } }, 'workspace')
    expect(values).toEqual({ 'search.exclude': { '**/a': true } })
    expect(warnings).toEqual([])
  })
})

describe('claude.allowBypassPermissions', () => {
  it('default false, boolean only, and user-only', () => {
    expect(DEFAULT_SETTINGS['claude.allowBypassPermissions']).toBe(false)
    expect(USER_ONLY_SETTINGS).toContain('claude.allowBypassPermissions')
    expect(sanitizeSettings({ 'claude.allowBypassPermissions': true }).values).toEqual({
      'claude.allowBypassPermissions': true
    })
    expect(sanitizeSettings({ 'claude.allowBypassPermissions': 'yes' }).warnings).toHaveLength(1)
  })

  it('claude.effort accepts empty and valid levels, rejects the rest', () => {
    expect(sanitizeSettings({ 'claude.effort': 'high' }).values).toEqual({ 'claude.effort': 'high' })
    expect(sanitizeSettings({ 'claude.effort': '' }).values).toEqual({ 'claude.effort': '' })
    expect(sanitizeSettings({ 'claude.effort': 'ultra' }).warnings).toHaveLength(1)
  })

  it('in the workspace it is ignored with a warning, and the initial mode accepts auto/bypass only from the user', () => {
    const { values, warnings } = sanitizeSettings({ 'claude.allowBypassPermissions': true }, 'workspace')
    expect(values).toEqual({})
    expect(warnings).toHaveLength(1)
    expect(sanitizeSettings({ 'claude.initialPermissionMode': 'auto' }).values).toEqual({
      'claude.initialPermissionMode': 'auto'
    })
    expect(sanitizeSettings({ 'claude.initialPermissionMode': 'bypassPermissions' }, 'workspace').values).toEqual({})
    expect(sanitizeSettings({ 'claude.initialPermissionMode': 'dontAsk' }).warnings).toHaveLength(1)
  })
})
