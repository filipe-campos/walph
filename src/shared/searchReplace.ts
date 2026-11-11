// Global search replace engine, pure and shared: main uses it to write to disk and the renderer to apply it to dirty
// tabs and show the preview. Offsets and columns are in UTF-16 units (like `SearchMatch`).

import type { SearchMatch, SearchOptions } from './types'

export interface TextEdit {
  from: number
  to: number
  insert: string
}

/** Computes the text that replaces a match; `null` = the span does not reproduce the match (do not replace). */
export type Replacer = (lineText: string, match: SearchMatch) => string | null

const BOM = '\uFEFF'

// ripgrep's `\w` (Unicode). In JS, `\w`/`\d`/`\b` only cover ASCII, even with the `u` flag.
const WORD = '\\p{Alphabetic}\\p{M}\\p{Nd}\\p{Pc}\\p{Join_Control}'

/**
 * Rewrites `\w`, `\W`, `\d`, `\D`, `\b` and `\B` with Unicode classes (`\p{…}`), so the JS regex (with `u`) has
 * ripgrep's semantics. `null` if it cannot be rewritten (`\W`/`\B` inside `[...]`).
 */
export function toUnicodeClasses(query: string): string | null {
  const boundary = `(?:(?<=[${WORD}])(?![${WORD}])|(?<![${WORD}])(?=[${WORD}]))`
  const notBoundary = `(?:(?<=[${WORD}])(?=[${WORD}])|(?<![${WORD}])(?![${WORD}]))`
  let out = ''
  let inClass = false
  for (let i = 0; i < query.length; i++) {
    const c = query[i]
    if (c === '\\' && i + 1 < query.length) {
      const n = query[++i]
      if (n === 'w') out += inClass ? WORD : `[${WORD}]`
      else if (n === 'd') out += '\\p{Nd}'
      else if (n === 'D') out += '\\P{Nd}'
      else if (n === 'W' && !inClass) out += `[^${WORD}]`
      else if (n === 'b') out += inClass ? '\\b' : boundary
      else if (n === 'B' && !inClass) out += notBoundary
      else if (n === 'W' || n === 'B') return null
      else out += '\\' + n
    } else if (c === '[' && !inClass) {
      inClass = true
      out += c
      if (query[i + 1] === '^') out += query[++i]
      // `]` right at the start of the class is literal.
      if (query[i + 1] === ']') out += '\\' + query[++i]
    } else {
      if (c === ']') inClass = false
      out += c
    }
  }
  return out
}

/**
 * Compiles the query in regex mode with `y` (sticky), to match exactly at the match column. `exact` = the regex has
 * ripgrep's Unicode semantics (with `u` and rewritten classes); without it, it is only reliable on ASCII lines.
 */
function compile(query: string, options: SearchOptions): { regex: RegExp; exact: boolean } | null {
  const flags = 'y' + (options.caseSensitive ? '' : 'i')
  const unicode = toUnicodeClasses(query)
  const attempts: [string, string, boolean][] = [
    ...(unicode !== null ? [[unicode, 'u', true] as [string, string, boolean]] : []),
    [query, 'u', unicode === query],
    // Syntax accepted by ripgrep but invalid with `u` (e.g. `\-`).
    [query, '', false]
  ]
  for (const [source, extra, exact] of attempts) {
    try {
      return { regex: new RegExp(source, flags + extra), exact }
    } catch {
      // try the next variant
    }
  }
  return null
}

/** JS regex equivalent to the regex-mode query (see `compile`). `null` if invalid. */
export function compileSearchRegex(query: string, options: SearchOptions): RegExp | null {
  return compile(query, options)?.regex ?? null
}

/**
 * Expands the regex-mode replacement template: `$$` → `$`, `$&` → whole match, `$1`…`$99` (two digits only if the
 * group exists, as in JS), `$<name>`. A group that did not participate becomes empty; a reference to a missing group
 * stays literal.
 */
export function expandReplacement(template: string, m: RegExpExecArray): string {
  let out = ''
  for (let i = 0; i < template.length; i++) {
    const c = template.charAt(i)
    if (c !== '$' || i + 1 >= template.length) {
      out += c
      continue
    }
    const next = template.charAt(i + 1)
    if (next === '$') {
      out += '$'
      i++
    } else if (next === '&') {
      out += m[0]
      i++
    } else if (next === '<') {
      const end = template.indexOf('>', i + 2)
      const name = end < 0 ? '' : template.slice(i + 2, end)
      if (end < 0 || !m.groups || !Object.hasOwn(m.groups, name)) out += c
      else {
        out += m.groups[name] ?? ''
        i = end
      }
    } else if (/\d/.test(next)) {
      const two = template.slice(i + 1, i + 3)
      const groupCount = m.length - 1
      if (/^\d\d$/.test(two) && Number(two) >= 1 && Number(two) <= groupCount) {
        out += m[Number(two)] ?? ''
        i += 2
      } else if (Number(next) >= 1 && Number(next) <= groupCount) {
        out += m[Number(next)] ?? ''
        i++
      } else out += c
    } else out += c
  }
  return out
}

/**
 * Creates the function that computes the replacement of each match. Outside regex mode the text is literal and the
 * span must be the query itself (ignoring case if the search ignores it). In regex mode the regex runs on the line
 * from the column and must match exactly the same length. `null` if the regex is invalid in JS.
 */
export function createReplacer(query: string, replacement: string, options: SearchOptions): Replacer | null {
  if (!options.regex) {
    const lower = query.toLowerCase()
    return (lineText, match) => {
      const hit = lineText.slice(match.column, match.column + match.length)
      if (hit.length !== match.length) return null
      const same = options.caseSensitive ? hit === query : hit === query || hit.toLowerCase() === lower
      return same ? replacement : null
    }
  }
  const compiled = compile(query, options)
  if (!compiled) return null
  const { regex, exact } = compiled
  return (lineText, match) => {
    if (match.column + match.length > lineText.length) return null
    // Without ripgrep's Unicode semantics, the matched span may have the same length and different groups: when in
    // doubt (non-ASCII line), do not replace.
    if (!exact && NON_ASCII.test(lineText)) return null
    regex.lastIndex = match.column
    const m = regex.exec(lineText)
    if (!m || m[0].length !== match.length) return null
    const insert = expandReplacement(replacement, m)
    // A group that split a surrogate pair would become U+FFFD on disk.
    return LONE_SURROGATE.test(insert) ? null : insert
  }
}

const NON_ASCII = /[^ -~\t\r\n]/
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

/**
 * For dirty tabs: ripgrep searched the disk and the buffer may have more or fewer lines. Moves each match line to
 * the content line with the same text closest to the original number (lines equal to the disk ones stay where they
 * are). A line without a counterpart stays as it is and will be skipped by `planReplacements`.
 */
export function relocateMatches(content: string, matches: SearchMatch[]): SearchMatch[] {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split('\n')
    .map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l))
  const byText = new Map<string, number[]>()
  lines.forEach((text, i) => {
    const list = byText.get(text)
    if (list) list.push(i + 1)
    else byText.set(text, [i + 1])
  })
  // A disk line goes to a single buffer line, and each buffer line receives at most one from the disk.
  const target = new Map<number, number>()
  const used = new Set<number>()
  const origins = [...new Set(matches.map((m) => m.line))].sort((a, b) => a - b)
  for (const line of origins) {
    const text = matches.find((m) => m.line === line)!.text
    if (lines[line - 1] === text && !used.has(line)) {
      target.set(line, line)
      used.add(line)
    }
  }
  for (const line of origins) {
    if (target.has(line)) continue
    const text = matches.find((m) => m.line === line)!.text
    let best: number | undefined
    for (const candidate of byText.get(text) ?? []) {
      if (used.has(candidate)) continue
      if (best === undefined || Math.abs(candidate - line) < Math.abs(best - line)) best = candidate
    }
    if (best !== undefined) {
      target.set(line, best)
      used.add(best)
    }
  }
  return matches.map((m) => {
    const line = target.get(m.line)
    return line === undefined || line === m.line ? m : { ...m, line }
  })
}

/**
 * Converts a file's matches into edits on `content`. Each match only becomes an edit if the current line is equal to
 * `match.text` (the file has not changed since the search) and the `replacer` reproduces it; otherwise the index goes
 * to `skipped`. Accepts `\n` and `\r\n` EOL and a leading BOM (ripgrep strips it from the line text). Overlapping or
 * repeated matches: only the first counts. Edits in ascending offset order.
 */
export function planReplacements(
  content: string,
  matches: SearchMatch[],
  replacer: Replacer
): { edits: TextEdit[]; skipped: number[] } {
  const bomOffset = content.startsWith(BOM) ? 1 : 0
  // Start of each line (index 0 = line 1).
  const lineStarts = [bomOffset]
  for (let i = bomOffset; i < content.length; i++) if (content.charCodeAt(i) === 10) lineStarts.push(i + 1)

  const lineText = (line: number): string | null => {
    const start = lineStarts[line - 1]
    if (start === undefined) return null
    const next = lineStarts[line]
    let end = next === undefined ? content.length : next - 1
    if (end > start && content.charCodeAt(end - 1) === 13) end--
    return content.slice(start, end)
  }

  const candidates: (TextEdit & { index: number })[] = []
  const skipped: number[] = []
  matches.forEach((match, index) => {
    const text = Number.isInteger(match.line) && match.line >= 1 ? lineText(match.line) : null
    const insert = text !== null && text === match.text ? replacer(text, match) : null
    const lineStart = lineStarts[match.line - 1]
    if (insert === null || lineStart === undefined) {
      skipped.push(index)
      return
    }
    const from = lineStart + match.column
    candidates.push({ from, to: from + match.length, insert, index })
  })

  candidates.sort((a, b) => a.from - b.from || a.index - b.index)
  const edits: TextEdit[] = []
  let lastEnd = -1
  for (const c of candidates) {
    // Overlap (or the same match twice): keeps the first, as the text would already have changed under the second.
    if (c.from < lastEnd || (c.from === lastEnd && c.to === c.from && edits.at(-1)?.from === c.from)) {
      skipped.push(c.index)
      continue
    }
    edits.push({ from: c.from, to: c.to, insert: c.insert })
    lastEnd = c.to
  }
  skipped.sort((a, b) => a - b)
  return { edits, skipped }
}

/** Applies non-overlapping edits (the ones from `planReplacements`) and returns the new text. */
export function applyEdits(content: string, edits: TextEdit[]): string {
  let out = ''
  let pos = 0
  for (const edit of [...edits].sort((a, b) => a.from - b.from)) {
    out += content.slice(pos, edit.from) + edit.insert
    pos = edit.to
  }
  return out + content.slice(pos)
}
