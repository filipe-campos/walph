import { flattenControl } from '@shared/controlChars'
import { t } from '@shared/i18n'

const MAX_LISTED = 10
const MAX_NAME = 80

// File names may contain line breaks/control chars (valid on POSIX) and forge the dialog text.
function cleanName(name: string): string {
  const flat = flattenControl(name)
  return flat.length > MAX_NAME ? `${flat.slice(0, MAX_NAME - 1)}…` : flat
}

/** Validates the argument coming from the (untrusted) renderer: a non-empty list of strings. */
export function parseFileNames(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  if (!value.every((v) => typeof v === 'string')) return null
  return value
}

/** Text of the native unsaved files dialog. */
export function buildUnsavedMessage(rawNames: string[]): { message: string; detail: string } {
  const fileNames = rawNames.map(cleanName)
  const tail = t().app.dialogs.unsavedDetail
  if (fileNames.length === 1) {
    return { message: t().app.dialogs.unsavedOne(fileNames[0] ?? ''), detail: tail }
  }
  const listed = fileNames.slice(0, MAX_LISTED)
  const lines = listed.map((n) => `• ${n}`)
  if (fileNames.length > MAX_LISTED) lines.push(t().app.dialogs.unsavedMore(fileNames.length - MAX_LISTED))
  return {
    message: t().app.dialogs.unsavedMany(fileNames.length),
    detail: `${lines.join('\n')}\n\n${tail}`
  }
}
