// MCP server elicitation: a server asks the user for data (form) or for a visit to a page (URL). The request comes
// from the server, so it is UNTRUSTED: here it is reduced to the flat JSON Schema subset the panel can show. Anything
// outside that is declined (we never show half the form and return incomplete data). The renderer response is also
// revalidated against the fields before going to the server.

import { flattenControl, stripControl } from '@shared/controlChars'
import { isFiniteNumber, isRecord } from '@shared/guards'
import { t } from '@shared/i18n'
import { FORBIDDEN_KEYS } from '@shared/elicitation'
import type { ClaudeElicitationField, ClaudePermissionRequest } from '@shared/types'

export const MAX_FIELDS = 20
const MAX_OPTIONS = 100
const MAX_MESSAGE = 2000
const MAX_TITLE = 200
const MAX_LABEL = 200
const MAX_DESCRIPTION = 500
const MAX_SERVER = 100
const MAX_KEY = 100
const MAX_VALUE = 200
const MAX_URL = 8192
/** Cap on the `maxLength` accepted from a text field: above it the server limit does not help the UI. */
const MAX_TEXT = 100_000

type ElicitationRequest = Extract<ClaudePermissionRequest, { kind: 'elicitation' }>
type Normalized = Omit<ElicitationRequest, 'requestId'>

export type NormalizedElicitation = { ok: true; request: Normalized } | { ok: false; reason: string }

/** Plain text: no control characters (a line break becomes a space), trimmed and truncated. */
export function plainText(v: unknown, max: number, keepNewlines = false): string {
  if (typeof v !== 'string') return ''
  const cleaned = (keepNewlines ? stripControl(v, { keepNewlines }) : flattenControl(v)).trim()
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned
}

const finite = (v: unknown): number | undefined => (isFiniteNumber(v) ? v : undefined)

function nonNegInt(v: unknown): number | undefined {
  const n = finite(v)
  return n !== undefined && Number.isInteger(n) && n >= 0 ? Math.min(n, MAX_TEXT) : undefined
}

type Option = { value: string; label: string }

/** `enum` (+ `enumNames`) or a `[{ const, title }]` list → options; `null` = invalid format. */
function enumOptions(values: unknown, names: unknown): Option[] | null {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_OPTIONS) return null
  const seen = new Set<string>()
  const options: Option[] = []
  for (let i = 0; i < values.length; i++) {
    const value: unknown = values[i]
    if (typeof value !== 'string' || value === '' || value.length > MAX_VALUE || seen.has(value)) return null
    seen.add(value)
    const name: unknown = Array.isArray(names) ? names[i] : undefined
    options.push({ value, label: plainText(name, MAX_LABEL) || plainText(value, MAX_LABEL) })
  }
  return options
}

function constOptions(list: unknown): Option[] | null {
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_OPTIONS) return null
  const values: unknown[] = []
  const titles: unknown[] = []
  for (const item of list) {
    if (!isRecord(item)) return null
    values.push(item.const)
    titles.push(item.title)
  }
  return enumOptions(values, titles)
}

type Base = { key: string; label: string; description: string; required: boolean }

function parseField(key: string, raw: unknown, required: boolean): ClaudeElicitationField | null {
  if (!isRecord(raw) || key === '' || key.length > MAX_KEY || FORBIDDEN_KEYS.includes(key)) return null
  const base: Base = {
    key,
    label: plainText(raw.title, MAX_LABEL) || plainText(key, MAX_LABEL),
    description: plainText(raw.description, MAX_DESCRIPTION),
    required
  }

  // Single choice: `enum` or `oneOf`, with or without `type: 'string'`.
  if (raw.type === 'string' || raw.type === undefined) {
    const options = raw.enum !== undefined ? enumOptions(raw.enum, raw.enumNames) : constOptions(raw.oneOf)
    if (raw.enum !== undefined || raw.oneOf !== undefined) {
      if (!options) return null
      const def =
        typeof raw.default === 'string' && options.some((o) => o.value === raw.default) ? raw.default : undefined
      return { ...base, type: 'enum', multiple: false, options, ...(def !== undefined ? { default: def } : {}) }
    }
  }

  switch (raw.type) {
    case 'string': {
      const format =
        raw.format === 'email' || raw.format === 'uri' || raw.format === 'date' || raw.format === 'date-time'
          ? raw.format
          : undefined
      const minLength = nonNegInt(raw.minLength)
      const maxLength = nonNegInt(raw.maxLength)
      const def = typeof raw.default === 'string' ? plainText(raw.default, MAX_TEXT, true) : undefined
      return {
        ...base,
        type: 'string',
        ...(format ? { format } : {}),
        ...(minLength !== undefined ? { minLength } : {}),
        ...(maxLength !== undefined ? { maxLength } : {}),
        ...(def !== undefined ? { default: def } : {})
      }
    }
    case 'number':
    case 'integer': {
      const minimum = finite(raw.minimum)
      const maximum = finite(raw.maximum)
      const def = finite(raw.default)
      return {
        ...base,
        type: 'number',
        integer: raw.type === 'integer',
        ...(minimum !== undefined ? { minimum } : {}),
        ...(maximum !== undefined ? { maximum } : {}),
        ...(def !== undefined ? { default: def } : {})
      }
    }
    case 'boolean':
      return { ...base, type: 'boolean', ...(typeof raw.default === 'boolean' ? { default: raw.default } : {}) }
    case 'array': {
      if (!isRecord(raw.items)) return null
      const options =
        raw.items.enum !== undefined ? enumOptions(raw.items.enum, raw.items.enumNames) : constOptions(raw.items.anyOf)
      if (!options) return null
      const def = Array.isArray(raw.default)
        ? raw.default.filter((v): v is string => typeof v === 'string' && options.some((o) => o.value === v))
        : undefined
      return { ...base, type: 'enum', multiple: true, options, ...(def && def.length > 0 ? { default: def } : {}) }
    }
    default:
      return null
  }
}

function parseFields(schema: unknown): ClaudeElicitationField[] | string {
  if (schema === undefined) return []
  if (!isRecord(schema) || schema.type !== 'object') return 'the schema is not an object'
  const properties = schema.properties
  if (properties === undefined) return []
  if (!isRecord(properties)) return 'the schema properties are invalid'
  const keys = Object.keys(properties)
  if (keys.length > MAX_FIELDS) return 'too many fields'
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((k) => typeof k === 'string') : [])
  const fields: ClaudeElicitationField[] = []
  for (const key of keys) {
    const field = parseField(key, properties[key], required.has(key))
    if (!field) return `field "${plainText(key, 40)}" has an unsupported format`
    fields.push(field)
  }
  return fields
}

/** `http(s)` only, normalized by `URL`; anything else (`file:`, `javascript:`, relative…) is invalid. */
export function httpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL) return null
  try {
    const url = new URL(raw)
    // Credentials in the URL hide the real host of what the user is about to open.
    if (url.username !== '' || url.password !== '') return null
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

/** SDK input (`ElicitationRequest`, untrusted) → contract request, or the reason to decline. */
export function normalizeElicitation(raw: unknown): NormalizedElicitation {
  if (!isRecord(raw)) return { ok: false, reason: 'malformed request' }
  const serverName = plainText(raw.serverName, MAX_SERVER) || 'MCP'
  const message = plainText(raw.message, MAX_MESSAGE, true)
  const title = plainText(raw.title, MAX_TITLE) || plainText(raw.displayName, MAX_TITLE)
  const head = { serverName, message, ...(title ? { title } : {}) }
  if (raw.mode === 'url') {
    const url = httpUrl(raw.url)
    if (!url) return { ok: false, reason: 'invalid URL' }
    return { ok: true, request: { kind: 'elicitation', ...head, mode: 'url', url, fields: [] } }
  }
  if (raw.mode !== undefined && raw.mode !== 'form') return { ok: false, reason: 'unknown mode' }
  const fields = parseFields(raw.requestedSchema)
  if (typeof fields === 'string') return { ok: false, reason: fields }
  return { ok: true, request: { kind: 'elicitation', ...head, mode: 'form', fields } }
}

/** Notice when the request is declined without showing up. */
export function declinedNotice(serverName: unknown): string {
  const name = plainText(serverName, 60) || 'MCP'
  return t().claudeHost.elicitation.declined(name)
}

/** Notice when an elicitation URL is not `http(s)`. */
export function declinedUrlNotice(serverName: unknown): string {
  const name = plainText(serverName, 60) || 'MCP'
  return t().claudeHost.elicitation.declinedUrl(name)
}
