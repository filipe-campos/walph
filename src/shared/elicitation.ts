// Validation of the content of an elicitation form (MCP) against the request fields. Pure and without Node APIs:
// main (authority) and the renderer (feedback while typing) validate with the same rule. Returns CODES per field;
// each side picks the message.

import { isFiniteNumber, isRecord } from './guards'
import type { ClaudeElicitationField, ClaudeElicitationValue } from './types'

export type ElicitationErrorCode =
  | 'required'
  | 'type'
  | 'minLength'
  | 'maxLength'
  | 'minimum'
  | 'maximum'
  | 'integer'
  | 'email'
  | 'uri'
  | 'date'
  | 'dateTime'
  | 'enum'

type ElicitationContent = Record<string, ClaudeElicitationValue>

/** `errors`: field key → code. Content that is not even an object uses the key `$`. */
export type ElicitationValidation =
  { ok: true; content: ElicitationContent } | { ok: false; errors: Record<string, ElicitationErrorCode> }

/** Keys that never become a field: assigning them to a plain object would touch the prototype. */
export const FORBIDDEN_KEYS: readonly string[] = ['__proto__', 'constructor', 'prototype']

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validDate(text: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
}

function validDateTime(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(text) && validDate(text.slice(0, 10)) && !Number.isNaN(Date.parse(text))
}

function canParseUrl(text: string): boolean {
  try {
    new URL(text)
    return true
  } catch {
    return false
  }
}

function checkString(field: ClaudeElicitationField & { type: 'string' }, value: string): ElicitationErrorCode | null {
  if (field.minLength !== undefined && value.length < field.minLength) return 'minLength'
  if (field.maxLength !== undefined && value.length > field.maxLength) return 'maxLength'
  if (field.format === 'email' && !EMAIL.test(value)) return 'email'
  if (field.format === 'uri' && !canParseUrl(value)) return 'uri'
  if (field.format === 'date' && !validDate(value)) return 'date'
  if (field.format === 'date-time' && !validDateTime(value)) return 'dateTime'
  return null
}

/** A (present) value against the field; `null` = ok. The normalized value goes into `out`. */
function checkValue(
  field: ClaudeElicitationField,
  value: unknown
): { code: ElicitationErrorCode } | { value: ClaudeElicitationValue | undefined } {
  switch (field.type) {
    case 'string': {
      if (typeof value !== 'string') return { code: 'type' }
      const code = checkString(field, value)
      return code ? { code } : { value }
    }
    case 'number': {
      if (!isFiniteNumber(value)) return { code: 'type' }
      if (field.integer && !Number.isInteger(value)) return { code: 'integer' }
      if (field.minimum !== undefined && value < field.minimum) return { code: 'minimum' }
      if (field.maximum !== undefined && value > field.maximum) return { code: 'maximum' }
      return { value }
    }
    case 'boolean':
      return typeof value === 'boolean' ? { value } : { code: 'type' }
    case 'enum': {
      const known = new Set(field.options.map((o) => o.value))
      if (!field.multiple) return typeof value === 'string' && known.has(value) ? { value } : { code: 'enum' }
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !known.has(v))) return { code: 'enum' }
      const unique = [...new Set(value as string[])]
      if (unique.length === 0) return field.required ? { code: 'required' } : { value: undefined }
      return { value: unique }
    }
  }
}

/**
 * Checks `content` against the fields: unknown keys are dropped, required ones must exist and each value
 * respects type/limits. Empty text and `null`/`undefined` count as "not filled" (omitted if optional).
 */
export function validateElicitationContent(
  fields: readonly ClaudeElicitationField[],
  content: unknown
): ElicitationValidation {
  const input = content === undefined ? {} : content
  if (!isRecord(input)) return { ok: false, errors: { $: 'type' } }
  const out: ElicitationContent = {}
  // No prototype: `errors['__proto__'] = …` on a plain object does not create the key.
  const errors = Object.create(null) as Record<string, ElicitationErrorCode>
  for (const field of fields) {
    if (FORBIDDEN_KEYS.includes(field.key)) {
      errors[field.key] = 'type'
      continue
    }
    const value = Object.hasOwn(input, field.key) ? input[field.key] : undefined
    const empty = value === undefined || value === null || (field.type === 'string' && value === '')
    if (empty) {
      if (field.required) errors[field.key] = 'required'
      continue
    }
    const checked = checkValue(field, value)
    if ('code' in checked) errors[field.key] = checked.code
    else if (checked.value !== undefined) out[field.key] = checked.value
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, content: out }
}
