// Internationalization shared by main and renderer. Full guide: `i18n` skill.
import { CATALOGS, type Messages } from './catalog'
import { getLocale, type Locale } from './locale'

export type { Messages } from './catalog'
export { compareText, formatDate, formatList, formatNumber } from './format'
export {
  DEFAULT_LOCALE,
  getLocale,
  isLocale,
  LOCALES,
  onLocaleChange,
  resolveLocale,
  setLocale,
  type LanguageSetting,
  type Locale
} from './locale'

/**
 * Messages of the current language. Call at display time (never store the result in a module: the language can
 * change).
 */
export const t = (): Messages => CATALOGS[getLocale()]

/** Name of each language written in itself (the picker shows it this way, regardless of the current language). */
export const LOCALE_NAMES: Record<Locale, string> = {
  'pt-BR': 'Português (Brasil)',
  en: 'English',
  es: 'Español'
}
