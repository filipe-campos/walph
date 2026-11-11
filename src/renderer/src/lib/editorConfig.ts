// EditorConfig (https://editorconfig.org): parser of the `.editorconfig` files, section globs and the resolution of a
// file's properties. Pure: whoever reads the disk and keeps the cache is `editorConfigActions.ts`.
import type { TextEncoding } from '@shared/types'
import type { Eol, Indent } from './textFormat'

interface CompiledGlob {
  re: RegExp
  /** `{n1..n2}` ranges, in the order of the capture groups of `re`. */
  ranges: Array<[number, number]>
}

interface EditorConfigSection {
  matcher: CompiledGlob
  /** Lowercase keys; the values of known keys too. */
  props: Record<string, string>
}

export interface EditorConfigFile {
  root: boolean
  sections: EditorConfigSection[]
}

/** An `.editorconfig` and the folder where it is (globs with `/` are relative to it). */
export interface EditorConfigSource {
  dir: string
  file: EditorConfigFile
}

export interface EditorConfigProps {
  indentStyle?: 'space' | 'tab'
  indentSize?: number | 'tab'
  tabWidth?: number
  endOfLine?: Eol
  encoding?: TextEncoding
  trimTrailingWhitespace?: boolean
  insertFinalNewline?: boolean
  maxLineLength?: number
}

// Specification limits: whatever goes past them is ignored.
const MAX_KEY = 50
const MAX_VALUE = 255
const MAX_SECTION = 4096

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

/** Index of the `}` that closes the `{` at `start` (respecting escapes and nesting), or -1. */
function closingBrace(glob: string, start: number): number {
  let depth = 0
  for (let i = start; i < glob.length; i++) {
    const c = glob.charAt(i)
    if (c === '\\') i++
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i
  }
  return -1
}

/** Splits the content of `{…}` at the top-level commas. */
function splitAlternatives(body: string): string[] {
  const parts: string[] = []
  let depth = 0
  let from = 0
  for (let i = 0; i < body.length; i++) {
    const c = body.charAt(i)
    if (c === '\\') i++
    else if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === ',' && depth === 0) {
      parts.push(body.slice(from, i))
      from = i + 1
    }
  }
  parts.push(body.slice(from))
  return parts
}

function translate(glob: string, ranges: Array<[number, number]>): string {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob.charAt(i)
    if (c === '\\') {
      out += escapeRegExp(glob.charAt(++i))
    } else if (c === '*') {
      if (glob.charAt(i + 1) === '*') {
        i++
        // `**/` also matches no folder (`a/**/b` applies to `a/b`).
        if (glob.charAt(i + 1) === '/') {
          i++
          out += '(?:.*/)?'
        } else out += '.*'
      } else out += '[^/]*'
    } else if (c === '?') {
      out += '[^/]'
    } else if (c === '[') {
      const end = glob.indexOf(']', i + 2)
      const body = end < 0 ? '' : glob.slice(i + 1, end)
      if (end < 0 || body.includes('/')) out += '\\['
      else {
        const negate = body.startsWith('!') || body.startsWith('^')
        const chars = (negate ? body.slice(1) : body).replace(/[\\\]^]/g, '\\$&')
        out += negate ? `[^/${chars}]` : `[${chars}]`
        i = end
      }
    } else if (c === '{') {
      const end = closingBrace(glob, i)
      if (end < 0) {
        out += '\\{'
        continue
      }
      const body = glob.slice(i + 1, end)
      const alternatives = splitAlternatives(body)
      const range = /^([+-]?\d+)\.\.([+-]?\d+)$/.exec(body)
      if (range) {
        const a = Number(range[1])
        const b = Number(range[2])
        ranges.push([Math.min(a, b), Math.max(a, b)])
        out += '([+-]?\\d+)'
      } else if (alternatives.length === 1) {
        // `{single}` without a comma is literal, as in the specification.
        out += `\\{${translate(body, ranges)}\\}`
      } else {
        out += `(?:${alternatives.map((alt) => translate(alt, ranges)).join('|')})`
      }
      i = end
    } else {
      out += escapeRegExp(c)
    }
  }
  return out
}

/** Glob of a section: without `/` matches the name at any depth; with `/`, relative to the file's folder. */
export function compileSectionGlob(section: string): CompiledGlob {
  let glob = section
  if (!glob.includes('/')) glob = `**/${glob}`
  else if (glob.startsWith('/')) glob = glob.slice(1)
  const ranges: Array<[number, number]> = []
  const source = translate(glob, ranges)
  return { re: new RegExp(`^${source}$`), ranges }
}

/** `relative` uses `/` as the separator, without a leading `/`. */
export function matchesSection(matcher: CompiledGlob, relative: string): boolean {
  const match = matcher.re.exec(relative)
  if (!match) return false
  return matcher.ranges.every(([min, max], i) => {
    const value = Number(match[i + 1])
    return Number.isInteger(value) && value >= min && value <= max
  })
}

const KNOWN_KEYS = new Set([
  'indent_style',
  'indent_size',
  'tab_width',
  'end_of_line',
  'charset',
  'trim_trailing_whitespace',
  'insert_final_newline',
  'max_line_length',
  'root'
])

export function parseEditorConfig(text: string): EditorConfigFile {
  const file: EditorConfigFile = { root: false, sections: [] }
  let current: EditorConfigSection | null = null
  let skipping = false
  for (const raw of text.split(/\r\n?|\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#') || line.startsWith(';')) continue
    if (line.startsWith('[') && line.endsWith(']')) {
      const name = line.slice(1, -1)
      skipping = name.length === 0 || name.length > MAX_SECTION
      current = skipping ? null : { matcher: compileSectionGlob(name), props: {} }
      if (current) file.sections.push(current)
      continue
    }
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim().toLowerCase()
    let value = line.slice(eq + 1).trim()
    if (key.length > MAX_KEY || value.length > MAX_VALUE) continue
    if (KNOWN_KEYS.has(key)) value = value.toLowerCase()
    if (current) current.props[key] = value
    else if (!skipping && key === 'root') file.root = value === 'true'
  }
  return file
}

/** Path of `path` relative to `dir`, with `/`; `null` if it is not inside. */
function relativePath(dir: string, path: string): string | null {
  const norm = (p: string): string => p.replace(/\\/g, '/')
  const base = norm(dir).replace(/\/+$/, '')
  const full = norm(path)
  if (!full.startsWith(`${base}/`)) return null
  return full.slice(base.length + 1)
}

const positiveInt = (value: string | undefined): number | undefined => {
  if (value === undefined || !/^\d+$/.test(value)) return undefined
  const n = Number(value)
  return n > 0 ? n : undefined
}

const bool = (value: string | undefined): boolean | undefined =>
  value === 'true' ? true : value === 'false' ? false : undefined

const CHARSETS: Record<string, TextEncoding> = {
  'utf-8': 'utf8',
  'utf-8-bom': 'utf8bom',
  'utf-16le': 'utf16le',
  'utf-16be': 'utf16be',
  latin1: 'iso88591'
}

/**
 * Properties of `path`. `sources` comes from the file's folder upwards, already cut at the first `root = true`: the
 * closest win, and within a file the last matching section wins. `unset` erases the inherited value.
 */
export function resolveEditorConfig(path: string, sources: readonly EditorConfigSource[]): EditorConfigProps {
  const raw: Record<string, string> = {}
  for (const { dir, file } of [...sources].reverse()) {
    const relative = relativePath(dir, path)
    if (relative === null) continue
    for (const section of file.sections) {
      if (!matchesSection(section.matcher, relative)) continue
      for (const [key, value] of Object.entries(section.props)) {
        if (value === 'unset') delete raw[key]
        else raw[key] = value
      }
    }
  }

  const props: EditorConfigProps = {}
  const style = raw.indent_style
  if (style === 'space' || style === 'tab') props.indentStyle = style
  const size = raw.indent_size === 'tab' ? 'tab' : positiveInt(raw.indent_size)
  if (size !== undefined) props.indentSize = size
  // Specification defaults: `indent_size = tab` uses `tab_width`, and `tab_width` inherits a numeric `indent_size`.
  else if (props.indentStyle === 'tab') props.indentSize = 'tab'
  const width = positiveInt(raw.tab_width) ?? (typeof props.indentSize === 'number' ? props.indentSize : undefined)
  if (width !== undefined) props.tabWidth = width
  // `cr` has no equivalent in the editor (only LF and CRLF): it is left out.
  if (raw.end_of_line === 'lf') props.endOfLine = 'LF'
  else if (raw.end_of_line === 'crlf') props.endOfLine = 'CRLF'
  const encoding = raw.charset === undefined ? undefined : CHARSETS[raw.charset]
  if (encoding) props.encoding = encoding
  const trim = bool(raw.trim_trailing_whitespace)
  if (trim !== undefined) props.trimTrailingWhitespace = trim
  const finalNewline = bool(raw.insert_final_newline)
  if (finalNewline !== undefined) props.insertFinalNewline = finalNewline
  const max = positiveInt(raw.max_line_length)
  if (max !== undefined) props.maxLineLength = max
  return props
}

/**
 * File indentation with the EditorConfig properties over `base` (detected or from the settings); `null` = the
 * EditorConfig says nothing about indentation. `defaultSize` applies to `indent_style = space` without a size in a
 * file with tabs.
 */
export function editorConfigIndent(base: Indent, props: EditorConfigProps, defaultSize: number): Indent | null {
  const { indentStyle, indentSize, tabWidth } = props
  if (indentStyle === undefined && indentSize === undefined && tabWidth === undefined) return null
  const numericSize = typeof indentSize === 'number' ? indentSize : indentSize === 'tab' ? tabWidth : undefined
  const kind = indentStyle === 'tab' ? 'tabs' : indentStyle === 'space' ? 'spaces' : base.kind
  if (kind === 'tabs') {
    const width = tabWidth ?? numericSize ?? (base.kind === 'tabs' ? base.width : undefined)
    return width === undefined ? { kind: 'tabs' } : { kind: 'tabs', width }
  }
  const size = numericSize ?? (base.kind === 'spaces' ? base.size : (tabWidth ?? base.width ?? defaultSize))
  return { kind: 'spaces', size }
}

/** Rulers requested by the EditorConfig (`max_line_length`). */
export function editorConfigRulers(props: EditorConfigProps): number[] {
  return props.maxLineLength === undefined ? [] : [props.maxLineLength]
}
