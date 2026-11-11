// Detection and preservation of EOL and indentation. CodeMirror always keeps the document with `\n`; the file's
// original EOL is kept apart and only reapplied on save.

import { t } from '@shared/i18n'

export type Eol = 'LF' | 'CRLF'
/** `width` of tabs: the file's own display width (EditorConfig `tab_width`); absent = `editor.tabSize`. */
export type Indent = { kind: 'spaces'; size: number } | { kind: 'tabs'; width?: number }

const DEFAULT_INDENT: Indent = { kind: 'spaces', size: 2 }

/** Indentation used when the file has no detectable indentation (`editor.insertSpaces` / `editor.tabSize`). */
export function fallbackIndent(insertSpaces: boolean, tabSize: number): Indent {
  return insertSpaces ? { kind: 'spaces', size: tabSize } : { kind: 'tabs' }
}

/** Same rule as CodeMirror to split lines (`\r\n`, `\r` or `\n`). */
const LINE_BREAK = /\r\n?|\n/

export function splitLines(text: string): string[] {
  return text.split(LINE_BREAK)
}

/** Predominant EOL; a tie or no line breaks = LF. */
export function detectEol(text: string): Eol {
  let crlf = 0
  let lf = 0
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) {
    if (i > 0 && text.charCodeAt(i - 1) === 13) crlf++
    else lf++
  }
  return crlf > lf ? 'CRLF' : 'LF'
}

function eolSeparator(eol: Eol): string {
  return eol === 'CRLF' ? '\r\n' : '\n'
}

/** Subset of CodeMirror's `Text`; avoids importing CodeMirror in a pure function. */
interface Sliceable {
  sliceString(from: number, to?: number, lineSep?: string): string
}

/** Text to write to disk: the document with the file's original EOL. */
export function serializeDoc(doc: Sliceable, eol: Eol): string {
  return doc.sliceString(0, undefined, eolSeparator(eol))
}

const MAX_INDENT_LINES = 2000
const INDENT_SIZES = [2, 3, 4, 8]

/**
 * Simple heuristic over the line indentation: more lines starting with a tab than with spaces = tabs; else the most
 * frequent step size between consecutive lines. Without evidence, `fallback` (the user setting).
 */
export function detectIndent(text: string, fallback: Indent = DEFAULT_INDENT): Indent {
  return findIndent(text) ?? fallback
}

/**
 * File indentation and whether it came from the `fallback` (no evidence in the text): that one follows the settings
 * later.
 */
export function resolveIndent(text: string, fallback: Indent): { indent: Indent; fallback: boolean } {
  const found = findIndent(text)
  return found ? { indent: found, fallback: false } : { indent: fallback, fallback: true }
}

/**
 * An already loaded fallback tab gets the new indentation; those with detected indentation (or not loaded) stay as they
 * are.
 */
export function refreshFallbackIndent<T extends { indent: Indent | null; indentFallback: boolean }>(
  tab: T,
  fallback: Indent
): T {
  if (!tab.indentFallback || !tab.indent || sameIndent(tab.indent, fallback)) return tab
  return { ...tab, indent: fallback }
}

function sameIndent(a: Indent, b: Indent): boolean {
  if (a.kind === 'tabs') return b.kind === 'tabs' && a.width === b.width
  return b.kind === 'spaces' && a.size === b.size
}

/** `null` when the text gives no indentation evidence. */
function findIndent(text: string): Indent | null {
  let tabLines = 0
  let spaceLines = 0
  const votes = new Map<number, number>()
  let prevWidth = 0
  let seen = 0

  for (const line of splitLines(text)) {
    if (++seen > MAX_INDENT_LINES) break
    if (!line.trim()) continue
    if (line[0] === '\t') {
      tabLines++
      continue
    }
    let width = 0
    while (line[width] === ' ') width++
    // A block comment continuation (" * ...") has an alignment space that is not indentation.
    if (line[width] === '*' && width % 2 === 1) {
      continue
    }
    if (width >= 2) spaceLines++
    const delta = Math.abs(width - prevWidth)
    if (INDENT_SIZES.includes(delta)) votes.set(delta, (votes.get(delta) ?? 0) + 1)
    prevWidth = width
  }

  if (tabLines > spaceLines) return { kind: 'tabs' }
  let best = 0
  let bestVotes = 0
  for (const size of INDENT_SIZES) {
    const v = votes.get(size) ?? 0
    if (v > bestVotes) {
      best = size
      bestVotes = v
    }
  }
  return best ? { kind: 'spaces', size: best } : null
}

export function formatIndent(indent: Indent): string {
  return indent.kind === 'tabs' ? t().editor.indent.tabs : t().editor.indent.spaces(indent.size)
}

/** `textDocument/formatting` options from the tab indentation; `tabSize` only applies to tabs. */
export function formatOptions(indent: Indent, tabSize: number): { tabSize: number; insertSpaces: boolean } {
  return indent.kind === 'tabs'
    ? { tabSize: indent.width ?? tabSize, insertSpaces: false }
    : { tabSize: indent.size, insertSpaces: true }
}

export type IndentKind = Indent['kind']

/** Rewritten indentation of a line: a tab advances to the next multiple of `tabSize` (as the editor draws it). */
export function reindentWhitespace(ws: string, target: IndentKind, tabSize: number): string {
  const size = Math.max(1, tabSize)
  let width = 0
  for (const ch of ws) width += ch === '\t' ? size - (width % size) : 1
  if (target === 'spaces') return ' '.repeat(width)
  return '\t'.repeat(Math.floor(width / size)) + ' '.repeat(width % size)
}

/**
 * Edits that convert only the leading indentation of each line (text already with `\n`). Offsets of the received text,
 * sorted
 * and non-overlapping: they can be applied in a single transaction (a single undo). Lines already in the format
 * produce no edit.
 */
export function reindentEdits(
  text: string,
  target: IndentKind,
  tabSize: number
): { from: number; to: number; insert: string }[] {
  const edits: { from: number; to: number; insert: string }[] = []
  let start = 0
  while (start <= text.length) {
    let end = text.indexOf('\n', start)
    if (end === -1) end = text.length
    let i = start
    while (i < end && (text[i] === ' ' || text[i] === '\t')) i++
    if (i > start) {
      const current = text.slice(start, i)
      const next = reindentWhitespace(current, target, tabSize)
      if (next !== current) edits.push({ from: start, to: i, insert: next })
    }
    start = end + 1
  }
  return edits
}
