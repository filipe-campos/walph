import { app } from 'electron'
import { isLocale, resolveLocale, setLocale, type LanguageSetting } from '@shared/i18n'

/** System languages in order of preference. `WALPH_LOCALE` pins the "system" (tests run in pt-BR on any machine). */
function systemLanguages(): string[] {
  const forced = process.env.WALPH_LOCALE
  if (isLocale(forced)) return [forced]
  try {
    const preferred = app.getPreferredSystemLanguages()
    return preferred.length > 0 ? preferred : [app.getLocale()]
  } catch {
    return []
  }
}

/** Applies `workbench.language` to the main process; whoever depends on the language listens to `onLocaleChange`. */
export function applyLanguageSetting(setting: LanguageSetting): void {
  setLocale(resolveLocale(setting, systemLanguages()))
}
