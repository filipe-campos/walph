import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, SETTING_KEYS, USER_ONLY_SETTINGS, sanitizeSettings, type SettingKey } from './settings'
import {
  SETTINGS_UI,
  SETTING_SECTIONS,
  describeComplexSetting,
  settingDescription,
  settingLabel,
  settingsOfSection
} from './settingsUi'

const accepts = (key: SettingKey, value: unknown): boolean => {
  const { values } = sanitizeSettings({ [key]: value })
  return key in values
}

describe('SETTINGS_UI', () => {
  it('every schema key has metadata, and only those', () => {
    expect(Object.keys(SETTINGS_UI).sort()).toEqual([...SETTING_KEYS].sort())
  })

  it('each key is in a known section and has a label and a description', () => {
    const sections = SETTING_SECTIONS
    for (const key of SETTING_KEYS) {
      const meta = SETTINGS_UI[key]
      expect(sections, key).toContain(meta.section)
      expect(settingLabel(key).trim(), key).not.toBe('')
      expect(settingDescription(key).trim(), key).not.toBe('')
    }
  })

  it('numeric limits match the schema validator', () => {
    for (const key of SETTING_KEYS) {
      const { control } = SETTINGS_UI[key]
      if (control.type !== 'number') continue
      expect(accepts(key, control.min), `${key} min`).toBe(true)
      expect(accepts(key, control.max), `${key} max`).toBe(true)
      expect(accepts(key, control.min - 1), `${key} min-1`).toBe(false)
      expect(accepts(key, control.max + 1), `${key} max+1`).toBe(false)
      expect(typeof DEFAULT_SETTINGS[key]).toBe('number')
    }
  })

  it('select options are valid values and include the default', () => {
    for (const key of SETTING_KEYS) {
      const { control } = SETTINGS_UI[key]
      if (control.type !== 'select' || typeof control.options === 'string') continue
      const values = control.options.map((o) => o.value)
      expect(new Set(values).size, `${key} without repeats`).toBe(values.length)
      for (const value of values) expect(accepts(key, value), `${key}=${value}`).toBe(true)
      expect(values, key).toContain(DEFAULT_SETTINGS[key])
      for (const option of control.options) if (option.requires) expect(SETTING_KEYS).toContain(option.requires)
    }
  })

  it('the control type matches the default type', () => {
    for (const key of SETTING_KEYS) {
      const { control } = SETTINGS_UI[key]
      const def = DEFAULT_SETTINGS[key]
      if (control.type === 'switch') expect(typeof def, key).toBe('boolean')
      if (control.type === 'text') expect(typeof def, key).toBe('string')
      if (control.type === 'complex') expect(typeof def, key).toBe('object')
    }
  })

  it('dependencies point to valid keys and values', () => {
    for (const key of SETTING_KEYS) {
      const dep = SETTINGS_UI[key].dependsOn
      if (!dep) continue
      expect(SETTING_KEYS).toContain(dep.key)
      expect(accepts(dep.key, dep.equals), key).toBe(true)
    }
  })

  it('complex keys are the expected ones', () => {
    const complex = SETTING_KEYS.filter((k) => SETTINGS_UI[k].control.type === 'complex').sort()
    expect(complex).toEqual([
      'claude.env',
      'debug.adapters',
      'editor.rulers',
      'files.exclude',
      'files.watcherExclude',
      'lsp.servers',
      'search.exclude',
      'terminal.profiles'
    ])
  })

  it('keys that run programs stay user-only (the UI depends on USER_ONLY_SETTINGS)', () => {
    for (const key of [
      'terminal.shell',
      'terminal.profiles',
      'lsp.servers',
      'claude.executable',
      'claude.env'
    ] as const)
      expect(USER_ONLY_SETTINGS).toContain(key)
  })

  it('settingsOfSection lists only the section keys, without "JSON only"', () => {
    const all = SETTING_SECTIONS.flatMap((s) => settingsOfSection(s))
    const visible = SETTING_KEYS.filter((k) => SETTINGS_UI[k].control.type !== 'json-only')
    expect([...all].sort()).toEqual([...visible].sort())
    expect(settingsOfSection('appearance')).toEqual([
      'workbench.language',
      'workbench.theme',
      'workbench.fontFamily',
      'workbench.fontSize',
      'workspaces.maxLiveViews',
      'workspaces.hibernateAfterMinutes',
      'update.enabled',
      'update.channel'
    ])
  })
})

describe('describeComplexSetting', () => {
  it('counts active patterns and agrees the plural', () => {
    expect(describeComplexSetting('patterns', { a: true, b: false, c: true })).toBe('2 padrões ativos')
    expect(describeComplexSetting('patterns', { a: true })).toBe('1 padrão ativo')
    expect(describeComplexSetting('patterns', { a: false })).toBe('Nenhum padrão ativo')
  })

  it('summarizes profiles, servers and variables', () => {
    expect(describeComplexSetting('profiles', { a: {}, b: {}, c: {} })).toBe('3 perfis')
    expect(describeComplexSetting('profiles', { a: {} })).toBe('1 perfil')
    expect(describeComplexSetting('profiles', {})).toBe('Nenhum perfil')
    expect(describeComplexSetting('servers', { py: {} })).toBe('1 servidor')
    expect(describeComplexSetting('adapters', { node: {}, go: {} })).toBe('2 adaptadores configurados')
    expect(describeComplexSetting('adapters', {})).toBe('Só o padrão (Python)')
    expect(describeComplexSetting('env', { A: 'x', B: null })).toBe('2 variáveis')
    expect(describeComplexSetting('env', {})).toBe('Nenhuma variável')
  })

  it('counts the rulers', () => {
    expect(describeComplexSetting('columns', [80, 120])).toBe('2 réguas')
    expect(describeComplexSetting('columns', [80])).toBe('1 régua')
    expect(describeComplexSetting('columns', [])).toBe('Nenhuma régua')
    expect(describeComplexSetting('columns', { a: 1 })).toBe('—')
  })

  it('an unexpected value becomes a dash', () => {
    expect(describeComplexSetting('profiles', null)).toBe('—')
    expect(describeComplexSetting('patterns', [])).toBe('—')
  })
})
