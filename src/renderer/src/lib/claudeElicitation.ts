// Form of an MCP server request (elicitation): initial values, validation and the reply. Pure.
// Main validates again against the fields; here we only avoid the round trip, with messages per field.
import { validateElicitationContent, type ElicitationErrorCode } from '@shared/elicitation'
import type { ClaudeElicitationField, ClaudeElicitationValue } from '@shared/types'
import { t } from '@shared/i18n'

/** Typed text (string/number/date/single enum), a check (boolean) or choices (multiple enum). */
export type FieldDraft = string | boolean | string[]

const pad = (n: number): string => String(n).padStart(2, '0')

/** ISO → value of `<input type="datetime-local">` (local time, no time zone). */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function initialDraft(field: ClaudeElicitationField): FieldDraft {
  switch (field.type) {
    case 'string':
      if (field.default === undefined) return ''
      return field.format === 'date-time' ? toLocalInput(field.default) : field.default
    case 'number':
      return field.default === undefined ? '' : String(field.default)
    case 'boolean':
      return field.default ?? false
    case 'enum':
      if (field.multiple) return Array.isArray(field.default) ? [...field.default] : []
      return typeof field.default === 'string' ? field.default : ''
  }
}

/** Initial values: the schema `default`s already filled in. */
export function initialDrafts(fields: readonly ClaudeElicitationField[]): Record<string, FieldDraft> {
  return Object.fromEntries(fields.map((f) => [f.key, initialDraft(f)]))
}

function isBlank(draft: FieldDraft | undefined): boolean {
  if (Array.isArray(draft)) return draft.length === 0
  return typeof draft !== 'string' || draft.trim() === ''
}

/** Draft → raw value of the reply (what the rule shared with main checks); `undefined` = not filled in. */
function rawValue(field: ClaudeElicitationField, draft: FieldDraft | undefined): unknown {
  if (field.type === 'boolean') return draft === true
  if (isBlank(draft)) return undefined
  switch (field.type) {
    case 'number':
      return Number(String(draft).trim().replace(',', '.'))
    case 'enum':
      return draft
    case 'string': {
      const text = String(draft)
      if (field.format === 'date-time') {
        const date = new Date(text)
        // Invalid stays as text: the shared rule points out the error.
        return Number.isNaN(date.getTime()) ? text : date.toISOString()
      }
      return field.format === 'email' || field.format === 'uri' ? text.trim() : text
    }
  }
}

function rawContent(
  fields: readonly ClaudeElicitationField[],
  drafts: Readonly<Record<string, FieldDraft>>
): Record<string, unknown> {
  const content: Record<string, unknown> = {}
  for (const f of fields) {
    const value = rawValue(f, drafts[f.key])
    if (value !== undefined) content[f.key] = value
  }
  return content
}

/** Message of a shared rule code (the limits come from the field itself). */
export function elicitationMessage(field: ClaudeElicitationField, code: ElicitationErrorCode): string {
  const m = t().claude.elicitation
  switch (code) {
    case 'required':
      return field.type === 'enum' ? m.chooseOption : m.required
    case 'type':
      return field.type === 'number' ? m.number : m.invalidValue
    case 'minLength':
      return m.minLength(`${field.type === 'string' ? field.minLength : ''}`)
    case 'maxLength':
      return m.maxLength(`${field.type === 'string' ? field.maxLength : ''}`)
    case 'minimum':
      return m.minimum(`${field.type === 'number' ? field.minimum : ''}`)
    case 'maximum':
      return m.maximum(`${field.type === 'number' ? field.maximum : ''}`)
    case 'integer':
      return m.integer
    case 'email':
      return m.email
    case 'uri':
      return m.uri
    case 'date':
      return m.date
    case 'dateTime':
      return m.dateTime
    case 'enum':
      return m.option
  }
}

/** Errors by field key, by the same rule main applies to the reply. */
export function validateAll(
  fields: readonly ClaudeElicitationField[],
  drafts: Readonly<Record<string, FieldDraft>>
): Record<string, string> {
  const result = validateElicitationContent(fields, rawContent(fields, drafts))
  if (result.ok) return {}
  const errors: Record<string, string> = {}
  for (const f of fields) {
    const code = result.errors[f.key]
    if (code) errors[f.key] = elicitationMessage(f, code)
  }
  return errors
}

/** Error message of the field, or `null` if it is valid. */
export function validateField(field: ClaudeElicitationField, draft: FieldDraft | undefined): string | null {
  return validateAll([field], { [field.key]: draft as FieldDraft })[field.key] ?? null
}

/** Content of the `accept` reply (already normalized by the shared rule); `null` if some field is invalid. */
export function buildContent(
  fields: readonly ClaudeElicitationField[],
  drafts: Readonly<Record<string, FieldDraft>>
): Record<string, ClaudeElicitationValue> | null {
  const result = validateElicitationContent(fields, rawContent(fields, drafts))
  return result.ok ? result.content : null
}

/** Host (with port) of an `http(s)` URL; `null` if it cannot be read. Shown highlighted: it is where the user goes. */
export function urlHost(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.host || null
  } catch {
    return null
  }
}
