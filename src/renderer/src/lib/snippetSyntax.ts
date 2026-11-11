// VS Code/LSP snippet syntax (`$1`, `${1:text}`, `${1|a,b|}`, `$0`, `$VAR`, `${VAR:default}`,
// `${VAR/regex/format/flags}`): parsing into a tree, resolution of the variables and conversion to the template of
// CodeMirror's `snippet()` (`${1}`, `${1:text}`, `${0}`). CodeMirror has no choices nor nested fields: the
// choice becomes the first value (the options come out apart, in `choices`) and the nested one becomes text of the
// outer field.

type FormatItem =
  | { type: 'text'; value: string }
  | {
      type: 'group'
      index: number
      modifier?: string
      /** `${1:+if}` / `${1:?if:else}`: text when the group matched. */
      ifText?: string
      /** `${1:-else}` / `${1:else}` / `${1:?if:else}`: text when the group did not match. */
      elseText?: string
    }

export interface Transform {
  /** `null` when the snippet regex does not compile: the transform changes nothing. */
  regex: RegExp | null
  format: FormatItem[]
}

export type SnippetNode =
  | { type: 'text'; value: string }
  | { type: 'tabstop'; index: number; children: SnippetNode[]; choices?: string[] }
  | { type: 'variable'; name: string; children: SnippetNode[] | null; transform?: Transform }

const NAME = /^[A-Za-z_][A-Za-z0-9_]*/
const DIGITS = /^\d+/

interface Parsed {
  nodes: SnippetNode[]
  end: number
}

/** Reads up to `stop` without escape; `\x` becomes `x` when `x` is in `escapable`. `-1` if not found. */
function readUntil(src: string, start: number, stop: string, escapable: string): { text: string; end: number } {
  let text = ''
  let i = start
  while (i < src.length) {
    const ch = src.charAt(i)
    if (ch === '\\' && escapable.includes(src.charAt(i + 1))) {
      text += src.charAt(i + 1)
      i += 2
      continue
    }
    if (ch === stop) return { text, end: i }
    text += ch
    i++
  }
  return { text, end: -1 }
}

function parseFormat(src: string): FormatItem[] {
  const items: FormatItem[] = []
  let text = ''
  const flush = (): void => {
    if (text) items.push({ type: 'text', value: text })
    text = ''
  }
  let i = 0
  while (i < src.length) {
    const ch = src.charAt(i)
    if (ch === '\\' && i + 1 < src.length) {
      const next = src.charAt(i + 1)
      text += next === 'n' ? '\n' : next === 't' ? '\t' : next
      i += 2
      continue
    }
    if (ch !== '$') {
      text += ch
      i++
      continue
    }
    const bare = DIGITS.exec(src.slice(i + 1))
    if (bare) {
      flush()
      items.push({ type: 'group', index: Number(bare[0]) })
      i += 1 + bare[0].length
      continue
    }
    const braced =
      /^\{(\d+)(?::(\/(upcase|downcase|capitalize|camelcase|pascalcase)|\+([^}]*)|\?([^:}]*):([^}]*)|-?([^}]*)))?\}/.exec(
        src.slice(i + 1)
      )
    if (!braced) {
      text += ch
      i++
      continue
    }
    flush()
    const [whole, index, , modifier, plus, ifText, ifElse, elseText] = braced
    const item: Extract<FormatItem, { type: 'group' }> = { type: 'group', index: Number(index) }
    if (modifier) item.modifier = modifier
    if (plus !== undefined) item.ifText = plus
    if (ifText !== undefined) {
      item.ifText = ifText
      item.elseText = ifElse ?? ''
    }
    if (elseText !== undefined) item.elseText = elseText
    items.push(item)
    i += 1 + whole.length
  }
  flush()
  return items
}

/**
 * Format up to the closing `/`; the `/` of `${1:/upcase}` belongs to the group, it does not close. Escapes are left to
 * `parseFormat`.
 */
function readFormat(src: string, start: number): { text: string; end: number } {
  let depth = 0
  for (let i = start; i < src.length; i++) {
    const ch = src.charAt(i)
    if (ch === '\\') i++
    else if (ch === '$' && src.charAt(i + 1) === '{') {
      depth++
      i++
    } else if (ch === '}' && depth > 0) depth--
    else if (ch === '/' && depth === 0) return { text: src.slice(start, i).replace(/\\\//g, '/'), end: i }
  }
  return { text: '', end: -1 }
}

/** `/regex/format/flags}` from `start` (right after the name or the number). */
function parseTransform(src: string, start: number): { transform: Transform; end: number } | null {
  const regex = readUntil(src, start + 1, '/', '/')
  if (regex.end < 0) return null
  const format = readFormat(src, regex.end + 1)
  if (format.end < 0) return null
  const flags = /^[a-z]*/.exec(src.slice(format.end + 1))?.[0] ?? ''
  const close = format.end + 1 + flags.length
  if (src.charAt(close) !== '}') return null
  let compiled: RegExp | null
  try {
    compiled = new RegExp(regex.text, flags.replace(/[^gimsuy]/g, ''))
  } catch {
    compiled = null
  }
  return { transform: { regex: compiled, format: parseFormat(format.text) }, end: close + 1 }
}

function parseNodes(src: string, start: number, inBraces: boolean): Parsed {
  const nodes: SnippetNode[] = []
  let text = ''
  const flush = (): void => {
    if (text) nodes.push({ type: 'text', value: text })
    text = ''
  }
  let i = start
  while (i < src.length) {
    const ch = src.charAt(i)
    if (ch === '}' && inBraces) {
      flush()
      return { nodes, end: i + 1 }
    }
    if (ch === '\\' && i + 1 < src.length && '$}\\'.includes(src.charAt(i + 1))) {
      text += src.charAt(i + 1)
      i += 2
      continue
    }
    if (ch !== '$') {
      text += ch
      i++
      continue
    }
    const node = parseDollar(src, i)
    if (!node) {
      text += ch
      i++
      continue
    }
    flush()
    nodes.push(node.node)
    i = node.end
  }
  flush()
  // Without the closing `}`: the caller undoes it and treats the `$` as text.
  return { nodes, end: inBraces ? -1 : i }
}

/** `a,b|}` of `${1|a,b|}` from `start`; the options escape `,`, `|` and `\`. */
function parseChoices(src: string, index: number, start: number): { node: SnippetNode; end: number } | null {
  const choices: string[] = []
  let current = ''
  let i = start
  while (i < src.length) {
    const ch = src.charAt(i)
    if (ch === '\\' && ',|\\'.includes(src.charAt(i + 1))) {
      current += src.charAt(i + 1)
      i += 2
    } else if (ch === ',') {
      choices.push(current)
      current = ''
      i++
    } else if (ch === '|') {
      if (src.charAt(i + 1) !== '}') return null
      choices.push(current)
      const children: SnippetNode[] = [{ type: 'text', value: choices[0] ?? '' }]
      return { node: { type: 'tabstop', index, children, choices }, end: i + 2 }
    } else {
      current += ch
      i++
    }
  }
  return null
}

/** A `$…` from `at`; `null` = not snippet syntax (the `$` stays as text). */
function parseDollar(src: string, at: number): { node: SnippetNode; end: number } | null {
  const rest = src.slice(at + 1)
  const bare = DIGITS.exec(rest)
  if (bare) return { node: { type: 'tabstop', index: Number(bare[0]), children: [] }, end: at + 1 + bare[0].length }
  const bareName = NAME.exec(rest)
  if (bareName) {
    return { node: { type: 'variable', name: bareName[0], children: null }, end: at + 1 + bareName[0].length }
  }
  if (rest[0] !== '{') return null
  const inner = at + 2
  const num = DIGITS.exec(src.slice(inner))
  if (num) {
    const index = Number(num[0])
    const after = inner + num[0].length
    const marker = src.charAt(after)
    if (marker === '}') return { node: { type: 'tabstop', index, children: [] }, end: after + 1 }
    if (marker === ':') {
      const body = parseNodes(src, after + 1, true)
      return body.end < 0 ? null : { node: { type: 'tabstop', index, children: body.nodes }, end: body.end }
    }
    if (marker === '|') return parseChoices(src, index, after + 1)
    if (marker === '/') {
      // Tabstop transform: the mirror goes without it (CodeMirror only copies the text).
      const parsed = parseTransform(src, after)
      return parsed ? { node: { type: 'tabstop', index, children: [] }, end: parsed.end } : null
    }
    return null
  }
  const name = NAME.exec(src.slice(inner))
  if (!name) return null
  const after = inner + name[0].length
  const marker = src.charAt(after)
  if (marker === '}') return { node: { type: 'variable', name: name[0], children: null }, end: after + 1 }
  if (marker === ':') {
    const body = parseNodes(src, after + 1, true)
    return body.end < 0 ? null : { node: { type: 'variable', name: name[0], children: body.nodes }, end: body.end }
  }
  if (marker === '/') {
    const parsed = parseTransform(src, after)
    if (!parsed) return null
    return { node: { type: 'variable', name: name[0], children: null, transform: parsed.transform }, end: parsed.end }
  }
  return null
}

/** Snippet tree. Malformed syntax becomes text, never an error. */
export function parseSnippet(src: string): SnippetNode[] {
  return parseNodes(src, 0, false).nodes
}

// ---------- Transforms ----------

function applyModifier(value: string, modifier: string | undefined): string {
  switch (modifier) {
    case 'upcase':
      return value.toUpperCase()
    case 'downcase':
      return value.toLowerCase()
    case 'capitalize':
      return value.charAt(0).toUpperCase() + value.slice(1)
    case 'camelcase':
    case 'pascalcase': {
      const words = value.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
      const joined = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
      return modifier === 'camelcase' ? joined.charAt(0).toLowerCase() + joined.slice(1) : joined
    }
    default:
      return value
  }
}

function formatMatch(match: RegExpExecArray, format: FormatItem[]): string {
  return format
    .map((item) => {
      if (item.type === 'text') return item.value
      const group = match[item.index]
      if (group) return item.ifText ?? applyModifier(group, item.modifier)
      return item.elseText ?? ''
    })
    .join('')
}

/** `${VAR/regex/format/flags}` over the value: without `g`, only the first match is replaced. */
export function applyTransform(value: string, transform: Transform): string {
  const { regex } = transform
  if (!regex) return value
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`)
  const global = regex.flags.includes('g')
  let out = ''
  let last = 0
  for (let match = re.exec(value); match; match = global ? re.exec(value) : null) {
    out += value.slice(last, match.index) + formatMatch(match, transform.format)
    last = match.index + match[0].length
    if (match[0] === '') re.lastIndex++
  }
  return out + value.slice(last)
}

// ---------- Variables ----------

function maxIndex(nodes: SnippetNode[]): number {
  let max = 0
  for (const node of nodes) {
    if (node.type === 'tabstop') max = Math.max(max, node.index, maxIndex(node.children))
    else if (node.type === 'variable' && node.children) max = Math.max(max, maxIndex(node.children))
  }
  return max
}

/**
 * Replaces the variables with the value (`resolve` returns `undefined` for unknown ones). A known and empty one uses
 * the
 * default; an unknown one becomes a placeholder with the default or its own name, as in VS Code.
 */
export function resolveVariables(nodes: SnippetNode[], resolve: (name: string) => string | undefined): SnippetNode[] {
  let next = maxIndex(nodes)
  const unknown = new Map<string, number>()
  const walk = (list: SnippetNode[]): SnippetNode[] =>
    list.flatMap((node): SnippetNode[] => {
      if (node.type === 'text') return [node]
      if (node.type === 'tabstop') return [{ ...node, children: walk(node.children) }]
      const value = resolve(node.name)
      if (value === undefined) {
        let index = unknown.get(node.name)
        if (index === undefined) unknown.set(node.name, (index = ++next))
        return [
          {
            type: 'tabstop',
            index,
            children: node.children ? walk(node.children) : [{ type: 'text', value: node.name }]
          }
        ]
      }
      const shown = node.transform ? applyTransform(value, node.transform) : value
      if (shown === '' && node.children) return walk(node.children)
      return shown ? [{ type: 'text', value: shown }] : []
    })
  return walk(nodes)
}

/** Plain text (fields become their text): preview in the completion. */
export function snippetPlainText(nodes: SnippetNode[]): string {
  return nodes
    .map((node) => (node.type === 'text' ? node.value : node.children ? snippetPlainText(node.children) : ''))
    .join('')
}

/** `true` if the snippet uses the variable (resolving it may be async, like `CLIPBOARD`). */
export function usesVariable(nodes: SnippetNode[], name: string): boolean {
  return nodes.some((node) =>
    node.type === 'variable'
      ? node.name === name || (node.children !== null && usesVariable(node.children, name))
      : node.type === 'tabstop' && usesVariable(node.children, name)
  )
}

// ---------- CodeMirror ----------

export interface CodeMirrorSnippet {
  template: string
  /** Options of each choice tabstop (`${1|a,b|}`), by tabstop number. */
  choices: Map<number, string[]>
  /** Numbers of the tabstops in the order Tab visits them (`0`, if any, last). */
  order: number[]
}

/** Braces are field syntax in the CodeMirror template: in literal text they need a backslash. */
const escapeLiteral = (text: string): string => text.replace(/[{}]/g, (c) => `\\${c}`)

/** The default of a field cannot have braces or line breaks in CodeMirror. */
const placeholderText = (nodes: SnippetNode[]): string =>
  snippetPlainText(nodes).replace(/[{}]/g, '').replace(/\n/g, ' ')

/** Converts the tree (variables already resolved; the leftover ones become nothing) to the CodeMirror template. */
export function toCodeMirrorSnippet(nodes: SnippetNode[]): CodeMirrorSnippet {
  const placeholders = new Map<number, string>()
  const choices = new Map<number, string[]>()
  const collect = (list: SnippetNode[]): void => {
    for (const node of list) {
      if (node.type !== 'tabstop') continue
      if (node.choices && !choices.has(node.index)) choices.set(node.index, node.choices)
      // The first one with text defines the field; the mirrors (`$1` after `${1:x}`) repeat the same text.
      const text = placeholderText(node.children)
      if (text && !placeholders.has(node.index)) placeholders.set(node.index, text)
    }
  }
  collect(nodes)

  const seen = new Set<number>()
  const emit = (list: SnippetNode[]): string =>
    list
      .map((node) => {
        if (node.type === 'text') return escapeLiteral(node.value)
        if (node.type === 'variable') return ''
        seen.add(node.index)
        const text = placeholders.get(node.index)
        return text ? `\${${node.index}:${text}}` : `\${${node.index}}`
      })
      .join('')
  let template = emit(nodes)
  // As in VS Code, without `$0` the cursor ends at the end of the snippet.
  if (seen.size > 0 && !seen.has(0)) {
    template += '${0}'
    seen.add(0)
  }
  const order = [...seen].sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b))
  return { template, choices, order }
}

/** LSP/VS Code snippet straight to the CodeMirror template, with the variables resolved by `resolve`. */
export function snippetToCodeMirror(src: string, resolve: (name: string) => string | undefined): CodeMirrorSnippet {
  return toCodeMirrorSnippet(resolveVariables(parseSnippet(src), resolve))
}
