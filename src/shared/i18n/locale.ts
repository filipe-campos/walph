// Current language of the process (main or renderer). Each process keeps its own; main resolves the language and the
// renderer receives the result (argv when the view is created, then the settings snapshot).

export const LOCALES = ['pt-BR', 'en', 'es'] as const
export type Locale = (typeof LOCALES)[number]

/** Value of `workbench.language`: a fixed language or `system` (follows the operating system). */
export type LanguageSetting = 'system' | Locale

// Unit tests and the catalogs' reference text are pt-BR.
export const DEFAULT_LOCALE: Locale = 'pt-BR'
// A system in an untranslated language falls back to English, not to the reference language.
const FALLBACK_LOCALE: Locale = 'en'

export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (LOCALES as readonly string[]).includes(v)

/** First supported language among the system's preferred ones (`pt-PT` → `pt-BR`, `es-419` → `es`), else English. */
export function matchSystemLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const lang = tag.toLowerCase().split(/[-_]/)[0]
    if (lang === 'pt') return 'pt-BR'
    if (lang === 'es') return 'es'
    if (lang === 'en') return 'en'
  }
  return FALLBACK_LOCALE
}

export function resolveLocale(setting: LanguageSetting, preferred: readonly string[]): Locale {
  return setting === 'system' ? matchSystemLocale(preferred) : setting
}

let current: Locale = DEFAULT_LOCALE
const listeners = new Set<(locale: Locale) => void>()

export const getLocale = (): Locale => current

export function setLocale(locale: Locale): void {
  if (locale === current) return
  current = locale
  for (const cb of listeners) cb(locale)
}

/** Notifies on every language change; returns the unsubscribe. */
export function onLocaleChange(cb: (locale: Locale) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
