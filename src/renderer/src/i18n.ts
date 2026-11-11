import { setLocale, t, type Locale, type Messages } from '@shared/i18n'
import { get, set, useStore } from './store'

/** Messages of the current language; the component re-renders when the language changes. */
export function useT(): Messages {
  useStore((s) => s.locale)
  return t()
}

/** Changes the renderer language (comes from main's settings snapshot). */
export function applyLocale(locale: Locale): void {
  if (get().locale === locale) return
  setLocale(locale)
  document.documentElement.lang = locale
  set({ locale })
}
