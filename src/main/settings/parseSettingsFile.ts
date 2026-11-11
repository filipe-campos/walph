import type { Settings, SettingsLayer } from '@shared/settings'
import { sanitizeSettings } from '@shared/settings'
import { t } from '@shared/i18n'
import { parseJsonc } from './parseJsonc'

export type ParsedSettingsFile =
  /** `warnings`: unknown keys/invalid values, ignored without invalidating the rest of the file. */
  { values: Partial<Settings>; warnings: string[] } | { error: string }

/**
 * Reads the text of a `settings.json` (JSONC). An empty file counts as `{}`; a syntax error invalidates the whole file.
 */
export function parseSettingsFile(text: string, layer: SettingsLayer = 'user', platform?: string): ParsedSettingsFile {
  if (text.trim() === '') return { values: {}, warnings: [] }
  const parsed = parseJsonc(text)
  if ('error' in parsed) return { error: parsed.error }
  // Only comments: the parse returns `undefined`.
  if (parsed.value === undefined) return { values: {}, warnings: [] }
  const { values, warnings } = sanitizeSettings(parsed.value, layer, platform)
  // A root that is not an object leaves nothing usable: treated as an error, and the file keeps its last valid version.
  if (typeof parsed.value !== 'object' || parsed.value === null || Array.isArray(parsed.value)) {
    return { error: warnings[0] ?? t().settings.warnings.notObject }
  }
  return { values, warnings }
}
