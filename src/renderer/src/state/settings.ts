import { DEFAULT_SETTINGS, activeExcludes } from '@shared/settings'
import { getLocale } from '@shared/i18n'
import { compileExcludes } from '../lib/glob'
import { loadCachedTheme } from '../themes/cache'
import type { SettingsState } from '../types/settings'

export function scopedSettingsState(): Pick<SettingsState, 'themePreview'> {
  return { themePreview: null }
}

export function globalSettingsState(): Omit<SettingsState, keyof ReturnType<typeof scopedSettingsState>> {
  return {
    // The theme comes from the cache until the first snapshot from main (avoids the default theme flash).
    settings: { ...DEFAULT_SETTINGS, 'workbench.theme': loadCachedTheme() },
    locale: getLocale(),
    workspaceKeys: [],
    settingsLayers: { user: {}, workspace: {} },
    overlay: null,
    keybindings: null,
    excludeMatcher: compileExcludes(activeExcludes(DEFAULT_SETTINGS))
  }
}
