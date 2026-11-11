import { applyEdits, createScanner, modify, parseTree, type Node as JsonNode } from 'jsonc-parser'
import type { SettingKey, Settings } from '@shared/settings'

/**
 * Returns the `settings.json` text with `key` changed, preserving comments, order and formatting of the rest.
 * Empty text becomes a new object.
 */
export function setSettingInText<K extends SettingKey>(text: string, key: K, value: Settings[K]): string {
  // The BOM would confuse `modify`; it is preserved on write so as not to change the encoding the user chose.
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : ''
  const body = text.slice(bom.length)
  const base = body.trim() === '' ? '{}\n' : body
  const eol = base.includes('\r\n') ? '\r\n' : '\n'
  const edits = modify(base, [key], value, { formattingOptions: { insertSpaces: true, tabSize: 2, eol } })
  return bom + applyEdits(base, edits)
}

/**
 * Returns the text without `key`, preserving comments and the rest. A missing key (or empty text) returns the SAME
 * text. A repeated key loses all occurrences (the parse uses the last one; removing just one would not change the
 * value).
 */
export function removeSettingFromText(text: string, key: SettingKey): string {
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : ''
  let body = text.slice(bom.length)
  if (body.trim() === '') return text
  for (;;) {
    const root = parseTree(body)
    if (!root || root.type !== 'object' || !root.children) break
    const index = root.children.findLastIndex((p) => p.children?.[0]?.value === key)
    if (index < 0) break
    body = removeProperty(body, root.children, index)
  }
  return bom + body === text ? text : bom + body
}

// `SyntaxKind` values (ambient const enum: inaccessible with `isolatedModules`).
const COMMA = 5
const TRIVIA = new Set([12, 13, 14, 15]) // line comment, block comment, line break, whitespace

/** Offset of the next comma from `from`, skipping whitespace and comments; `-1` if another token comes first. */
function commaAfter(body: string, from: number): number {
  const scanner = createScanner(body, false)
  scanner.setPosition(from)
  for (;;) {
    const token = scanner.scan()
    if (token === COMMA) return scanner.getTokenOffset()
    if (!TRIVIA.has(token)) return -1
  }
}

// Manual cut (jsonc-parser's `modify` deletes from the previous comma onward, taking the end-of-line comment of the
// previous property): only the property, its comma and the comment on its own line go away.
function removeProperty(body: string, props: JsonNode[], index: number): string {
  const prop = props[index]
  const previous = props[index - 1]
  if (!prop) return body
  let start = prop.offset
  let end = prop.offset + prop.length
  const after = commaAfter(body, end)
  if (after >= 0) end = after + 1
  else if (previous) {
    // Last property: the leftover comma is the one after the previous property.
    const before = commaAfter(body, previous.offset + previous.length)
    if (before >= 0) {
      body = body.slice(0, before) + body.slice(before + 1)
      start--
      end--
    }
  }
  // Alone on its line: the whole line goes (with the end-of-line comment, which belongs to it).
  const lineStart = body.lastIndexOf('\n', start - 1) + 1
  const eolAt = body.indexOf('\n', end)
  const lineEnd = eolAt < 0 ? body.length : eolAt + 1
  const rest = body.slice(end, eolAt < 0 ? body.length : eolAt)
  if (/^[ \t]*$/.test(body.slice(lineStart, start)) && /^[ \t]*(\/\/.*)?\r?$/.test(rest)) {
    start = lineStart
    end = lineEnd
  }
  return body.slice(0, start) + body.slice(end)
}
