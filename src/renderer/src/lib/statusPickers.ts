// Pure parts of the status bar pickers (language mode and encoding); the QuickInput items are built
// in `components/quickInput/buildItems.tsx`.
import type { TextEncoding } from '@shared/types'
import { ENCODINGS, encodingLabel } from './encodings'
import { t } from '@shared/i18n'
import { languageChoices, languageLabel, languageName } from './language'

export interface LanguageEntry {
  /** `null` = "Detectar pela extensão" (clears the user choice). */
  name: string | null
  label: string
  /** Current user choice: only ONE item is marked (the automatic one when there is no choice). */
  current: boolean
}

export function languageEntries(path: string, chosen: string | null): LanguageEntry[] {
  return [
    { name: null, label: t().quickInput.language.detect(languageName(path)), current: chosen === null },
    ...languageChoices().map((name) => ({ name, label: languageLabel(name), current: chosen === name }))
  ]
}

export interface EncodingEntry {
  action: 'reopen' | 'save'
  encoding: TextEncoding
  label: string
  tag?: string | undefined
}

/**
 * "Reabrir" section (marks the current encoding; a dirty tab warns that it discards) and "Salvar" section (no mark).
 */
export function encodingEntries(current: TextEncoding, dirty: boolean): EncodingEntry[] {
  const entries: EncodingEntry[] = []
  for (const action of ['reopen', 'save'] as const) {
    for (const encoding of ENCODINGS) {
      let tag: string | undefined
      if (action === 'reopen')
        tag =
          encoding === current ? t().quickInput.current : dirty ? t().quickInput.encoding.discardsChanges : undefined
      entries.push({ action, encoding, label: encodingLabel(encoding), tag })
    }
  }
  return entries
}
