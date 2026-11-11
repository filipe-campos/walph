import { parse, printParseErrorCode, stripComments, type ParseError } from 'jsonc-parser'
import { t } from '@shared/i18n'

export type JsoncResult = { value: unknown } | { error: string }

/** Converts a (UTF-16) offset into `line:column`, both 1-based. */
function positionOf(text: string, offset: number): string {
  let line = 1
  let lineStart = 0
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') {
      line++
      lineStart = i + 1
    }
  }
  return `${line}:${offset - lineStart + 1}`
}

// The `printParseErrorCode` text is in English and only serves as a key in the catalog.
function messageOf(name: string): string {
  const messages = t().settings.jsonc.codes as Record<string, string>
  return Object.hasOwn(messages, name) ? (messages[name] ?? name) : name
}

/**
 * Reads JSONC (comments and trailing comma allowed). Empty/only whitespace/only comments = `undefined` as the value.
 * Only the first error is reported, with `line:column`, enough for the user to find the problem.
 */
export function parseJsonc(input: string): JsoncResult {
  // Windows editors (e.g. Notepad) write a BOM at the start; the parser would treat it as an invalid symbol.
  const text = input.replace(/^\uFEFF/, '')
  // Only comments/whitespace: the parser would complain about "value expected", but for us it is an empty file.
  if (stripComments(text).trim() === '') return { value: undefined }
  const errors: ParseError[] = []
  const value: unknown = parse(text, errors, { allowTrailingComma: true, disallowComments: false })
  const first = errors[0]
  if (first) {
    const name = printParseErrorCode(first.error)
    return { error: t().settings.jsonc.at(messageOf(name), positionOf(text, first.offset)) }
  }
  return { value }
}
