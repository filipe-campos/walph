import { t } from '@shared/i18n'
import { isRecord } from '@shared/guards'
import { isLanguageId } from '@shared/languageId'
import type { SnippetSource, UserSnippet } from '@shared/types'
import { parseJsonc } from '../settings/parseJsonc'

/**
 * Where the file comes from: `languageId` only in `<languageId>.json` (the scope comes from the name, `scope` is
 * ignored).
 */
export interface SnippetFileOrigin {
  path: string
  /** Name shown in the warnings (`snippets/typescript.json`, `.vscode/react.code-snippets`). */
  label: string
  source: SnippetSource
  languageId?: string
}

const MAX_SNIPPETS = 5000
const MAX_BODY = 100_000
const MAX_TEXT = 1000

const isText = (v: unknown, max = MAX_TEXT): v is string => typeof v === 'string' && v.length <= max

/** A string or a list of strings; `null` if it is anything else. */
function textList(value: unknown, max: number): string[] | null {
  if (isText(value, max)) return [value]
  if (Array.isArray(value) && value.length <= MAX_TEXT && value.every((v) => isText(v, max))) return value
  return null
}

function scopesOf(raw: unknown): string[] | null {
  if (typeof raw !== 'string') return null
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(isLanguageId)
  return ids.length > 0 ? ids : null
}

/**
 * Reads a snippet file in the VS Code format (JSONC, untrusted content). Invalid entries become warnings and are
 * skipped without invalidating the rest; a broken JSONC yields no snippet.
 */
export function parseSnippetFile(
  text: string,
  origin: SnippetFileOrigin
): { snippets: UserSnippet[]; warnings: string[] } {
  const m = t().snippets.errors
  const parsed = parseJsonc(text)
  if ('error' in parsed) return { snippets: [], warnings: [m.parseFailed(origin.label, parsed.error)] }
  if (parsed.value === undefined) return { snippets: [], warnings: [] }
  if (!isRecord(parsed.value)) return { snippets: [], warnings: [m.notObject(origin.label)] }

  const snippets: UserSnippet[] = []
  const warnings: string[] = []
  for (const [name, entry] of Object.entries(parsed.value).slice(0, MAX_SNIPPETS)) {
    if (!isRecord(entry)) {
      warnings.push(m.invalidEntry(origin.label, name))
      continue
    }
    // Without `prefix` the snippet exists only for "Insert Snippet", as in VS Code.
    const prefixes = entry.prefix === undefined ? [] : textList(entry.prefix, MAX_TEXT)
    const body = textList(entry.body, MAX_BODY)
    if (!prefixes || !body || name.length > MAX_TEXT) {
      warnings.push(m.invalidEntry(origin.label, name.slice(0, 80)))
      continue
    }
    const description = isText(entry.description) && entry.description.trim() ? entry.description : undefined
    snippets.push({
      name,
      prefixes: prefixes.filter((p) => p.trim() !== ''),
      body: body.join('\n'),
      ...(description !== undefined && { description }),
      scopes: origin.languageId ? [origin.languageId] : scopesOf(entry.scope),
      source: origin.source,
      file: origin.path
    })
  }
  return { snippets, warnings }
}
