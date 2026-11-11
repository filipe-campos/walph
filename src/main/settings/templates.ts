import { t } from '@shared/i18n'
import { DEFAULT_SETTINGS, SETTING_KEYS, USER_ONLY_SETTINGS, type SettingKey } from '@shared/settings'

// Templates of the files created by "Open Settings (JSON)": all commented out, for the user to uncomment what they
// want.
const commentedDefaults = (keys: readonly SettingKey[] = SETTING_KEYS): string =>
  keys.map((key) => `  // ${JSON.stringify(key)}: ${JSON.stringify(DEFAULT_SETTINGS[key])},`).join('\n')

const header = (text: string): string =>
  text
    .split('\n')
    .map((line) => `// ${line}`)
    .join('\n')

export function userSettingsTemplate(): string {
  return `${header(t().settings.templates.user)}
{
${commentedDefaults()}
}
`
}

export function workspaceSettingsTemplate(): string {
  return `${header(t().settings.templates.workspace)}
{
${commentedDefaults(SETTING_KEYS.filter((k) => !USER_ONLY_SETTINGS.includes(k)))}
}
`
}

export function keybindingsTemplate(): string {
  return `${header(t().settings.templates.keybindings)}
[
  // { "key": "ctrl+alt+t", "command": "workbench.selectTheme" },
  // { "key": "", "command": "-workbench.closeWindow" }
]
`
}
