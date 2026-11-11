import { isRecord } from '@shared/guards'
import type { ReplaceRequest, SearchMatch, SearchOptions } from '@shared/types'
import { t } from '@shared/i18n'
import { UserError } from '../errors'

export function parseQuery(value: unknown): string {
  if (typeof value !== 'string') throw new UserError(t().search.errors.invalidQuery)
  return value
}

export function parseOptions(value: unknown): SearchOptions {
  if (
    !isRecord(value) ||
    typeof value.caseSensitive !== 'boolean' ||
    typeof value.regex !== 'boolean' ||
    typeof value.wholeWord !== 'boolean' ||
    (value.include !== undefined && typeof value.include !== 'string') ||
    (value.exclude !== undefined && typeof value.exclude !== 'string')
  ) {
    throw new UserError(t().search.errors.invalidOptions)
  }
  return value as unknown as SearchOptions
}

export function parseMatch(value: unknown): SearchMatch {
  if (
    !isRecord(value) ||
    !Number.isInteger(value.line) ||
    (value.line as number) < 1 ||
    !Number.isInteger(value.column) ||
    (value.column as number) < 0 ||
    !Number.isInteger(value.length) ||
    (value.length as number) < 0 ||
    typeof value.text !== 'string'
  ) {
    throw new UserError(t().search.errors.invalidReplace)
  }
  return value as unknown as SearchMatch
}

export function parseReplaceRequest(value: unknown): ReplaceRequest {
  if (
    !isRecord(value) ||
    typeof value.query !== 'string' ||
    typeof value.replacement !== 'string' ||
    !Array.isArray(value.files)
  ) {
    throw new UserError(t().search.errors.invalidReplace)
  }
  const options = parseOptions(value.options)
  const files = value.files.map((f: unknown) => {
    if (!isRecord(f) || typeof f.path !== 'string' || !Array.isArray(f.matches)) {
      throw new UserError(t().search.errors.invalidReplace)
    }
    return { path: f.path, matches: f.matches.map(parseMatch) }
  })
  return { query: value.query, replacement: value.replacement, options, files }
}
