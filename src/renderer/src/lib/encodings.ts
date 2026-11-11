// Text encodings offered in the status bar.
import { t } from '@shared/i18n'
import type { TextEncoding } from '@shared/types'

// Technical names, the same in all languages; only the "with BOM" is text.
const ENCODING_LABELS: Record<TextEncoding, () => string> = {
  utf8: () => 'UTF-8',
  utf8bom: () => t().editor.encoding.utf8bom,
  utf16le: () => 'UTF-16 LE',
  utf16be: () => 'UTF-16 BE',
  windows1252: () => 'Windows-1252',
  iso88591: () => 'ISO-8859-1'
}

/** Display order in the menus. */
export const ENCODINGS = Object.keys(ENCODING_LABELS) as TextEncoding[]

export function encodingLabel(encoding: TextEncoding): string {
  return ENCODING_LABELS[encoding]()
}

export function isTextEncoding(value: unknown): value is TextEncoding {
  return typeof value === 'string' && value in ENCODING_LABELS
}

/** Encoding the user chose for the tab (forced on reads); else `undefined` and main detects it by the BOM. */
export function chosenEncoding(
  tab: { encodingChosen: boolean; encoding: TextEncoding | null } | undefined
): TextEncoding | undefined {
  return tab?.encodingChosen && tab.encoding ? tab.encoding : undefined
}
