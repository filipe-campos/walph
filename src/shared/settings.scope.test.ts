import { describe, expect, it } from 'vitest'
import { isValidEnvMap, isValidShellSetting, SETTING_KEYS, SETTING_RULES, USER_ONLY_SETTINGS } from './settings'

const EXPECTED_USER_ONLY = [
  'terminal.shell',
  'terminal.profiles',
  'terminal.defaultProfile',
  'lsp.servers',
  'debug.adapters',
  'claude.initialPermissionMode',
  'claude.allowBypassPermissions',
  'claude.fallbackModel',
  'claude.executable',
  'claude.env',
  'claude.idleSleepMinutes',
  'docker.path',
  'workspaces.maxLiveViews',
  'workspaces.hibernateAfterMinutes',
  'workbench.language',
  'update.enabled',
  'update.channel'
]

describe('settings scope', () => {
  it('USER_ONLY_SETTINGS derived from the rules is the list that applied before', () => {
    expect([...USER_ONLY_SETTINGS].sort()).toEqual([...EXPECTED_USER_ONLY].sort())
  })

  it('every key has a rule with a declared scope', () => {
    for (const key of SETTING_KEYS) expect(['user', 'any']).toContain(SETTING_RULES[key].scope)
  })

  it('a key validated as an executable, path or environment is user-only', () => {
    const risky = SETTING_KEYS.filter(
      (key) => SETTING_RULES[key].check === isValidShellSetting || SETTING_RULES[key].check === isValidEnvMap
    )
    expect(risky).toEqual(expect.arrayContaining(['terminal.shell', 'claude.executable', 'docker.path', 'claude.env']))
    for (const key of risky) expect(USER_ONLY_SETTINGS).toContain(key)
    for (const key of ['terminal.profiles', 'lsp.servers', 'debug.adapters'] as const)
      expect(USER_ONLY_SETTINGS).toContain(key)
  })
})
