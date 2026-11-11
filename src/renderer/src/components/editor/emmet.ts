// Emmet in the editor: decides from the syntax tree context whether the abbreviation before the cursor counts (HTML/JSX
// text, CSS block; never in a string, comment, tag or attribute), offers the expansion in the completion and expands it
// with Tab.
import {
  completionStatus,
  hasNextSnippetField,
  hasPrevSnippetField,
  type Completion,
  type CompletionSource
} from '@codemirror/autocomplete'
import { syntaxTree } from '@codemirror/language'
import { EditorSelection, EditorState, Prec, type Extension } from '@codemirror/state'
import { keymap, type EditorView } from '@codemirror/view'
import { balancedInward, balancedOutward } from '@emmetio/html-matcher'
import { t } from '@shared/i18n'
import {
  emmetSyntaxFor,
  expandAbbreviation,
  extractAbbreviation,
  isLikelyAbbreviation,
  startsWithElement,
  type EmmetSyntax
} from '../../lib/emmet'
import { lspTabId } from './lspHost'
import { choiceAt } from './snippetChoices'
import { snippetPreview } from './snippetCompletion'
import { expandSnippet } from './snippetExpand'
import { snippetHost } from './snippetHost'

type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>['resolveInner']>

type Region = 'markup' | 'jsx' | 'script' | 'stylesheet' | 'stylesheetBlock' | 'blocked' | 'unknown'

// Inside these nodes an abbreviation is user text, not markup: Tab and completion behave normally. No
// `TagName`: in CSS it is the selector the parser sees in a still incomplete declaration (`m10`).
const BLOCKED = new Set([
  'Comment',
  'LineComment',
  'BlockComment',
  'String',
  'TemplateString',
  'OpenTag',
  'CloseTag',
  'SelfClosingTag',
  'StartTag',
  'EndTag',
  'Attribute',
  'AttributeValue',
  'ProcessingInst',
  'DoctypeDecl',
  'JSXOpenTag',
  'JSXCloseTag',
  'JSXSelfClosingTag',
  'JSXFragmentTag',
  'JSXAttribute',
  'JSXAttributeValue'
])

const JSX_CONTENT = new Set(['JSXElement', 'JSXFragment', 'JSXText'])

// Indented syntaxes have no `Block` in the tree: any line counts.
const INDENTED = new Set(['sass', 'stylus'])

function regionAt(state: EditorState, pos: number): Region {
  let inBlock = false
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    const { name } = node
    if (BLOCKED.has(name)) return 'blocked'
    // `{…}` inside JSX is code.
    if (name === 'JSXEscape') return 'script'
    if (JSX_CONTENT.has(name)) return 'jsx'
    if (name === 'Block') inBlock = true
    if (name === 'StyleSheet') return inBlock ? 'stylesheetBlock' : 'stylesheet'
    if (name === 'Script') return 'script'
    if (name === 'Document') return 'markup'
  }
  return 'unknown'
}

interface EmmetContext {
  syntax: EmmetSyntax
  /** JS code of a JSX file: only clear abbreviations, at a point where an expression fits. */
  script: boolean
}

function emmetContext(state: EditorState, pos: number, base: EmmetSyntax | null): EmmetContext | null {
  if (!base) return null
  switch (regionAt(state, pos)) {
    case 'blocked':
      return null
    case 'stylesheetBlock':
      return { syntax: base.type === 'stylesheet' ? base : { type: 'stylesheet', syntax: 'css' }, script: false }
    case 'stylesheet':
      return base.type === 'stylesheet' && INDENTED.has(base.syntax) ? { syntax: base, script: false } : null
    case 'jsx':
      return base.syntax === 'jsx' ? { syntax: base, script: false } : null
    case 'script':
      return base.syntax === 'jsx' ? { syntax: base, script: true } : null
    case 'markup':
      return base.type === 'markup' ? { syntax: base, script: false } : null
    case 'unknown':
      return { syntax: base, script: false }
  }
}

/** In JSX code, the abbreviation must start where an element fits (`return (`, `=>`, `? :`, `&&`…). */
function fitsScript(state: EditorState, lineFrom: number, start: number): boolean {
  const before = state.sliceDoc(lineFrom, start).trimEnd()
  if (before === '') {
    const line = state.doc.lineAt(lineFrom)
    const previous = line.number > 1 ? state.doc.line(line.number - 1).text.trimEnd() : ''
    return /(\(|=>)$/.test(previous)
  }
  return /(\(|\breturn|=>|\?|:|&&|\|\|)$/.test(before)
}

function declarationStart(text: string): boolean {
  // In CSS the abbreviation is the start of a declaration: nothing but whitespace since the last `{`, `}` or `;`.
  const cut = Math.max(text.lastIndexOf('{'), text.lastIndexOf('}'), text.lastIndexOf(';'))
  return text.slice(cut + 1).trim() === ''
}

export interface FoundAbbreviation {
  abbreviation: string
  from: number
  to: number
  syntax: EmmetSyntax
  /** Expansion in the VS Code snippet syntax. */
  snippet: string
}

/**
 * Abbreviation before the cursor that Emmet expands in the context. `strict` (Tab, completion) requires it to look
 * intentional; the "Expand Abbreviation" command accepts any.
 */
export function abbreviationAt(state: EditorState, pos: number, strict: boolean): FoundAbbreviation | null {
  const host = snippetHost()
  const settings = host.settings()
  if (!settings['emmet.enabled']) return null
  const tabId = state.facet(lspTabId)
  const base = emmetSyntaxFor(host.languageId(tabId), settings['emmet.includeLanguages'])
  const ctx = emmetContext(state, pos, base)
  if (!ctx) return null
  const line = state.doc.lineAt(pos)
  const found = extractAbbreviation(line.text, pos - line.from, ctx.syntax.type)
  if (!found) return null
  const from = line.from + found.start
  const to = line.from + found.end
  const { abbreviation } = found
  if (strict && !isLikelyAbbreviation(abbreviation, ctx.syntax)) return null
  if (ctx.script && (!startsWithElement(abbreviation) || !fitsScript(state, line.from, from))) return null
  if (ctx.syntax.type === 'stylesheet' && !declarationStart(line.text.slice(0, found.start))) return null
  const snippet = expandAbbreviation(abbreviation, ctx.syntax)
  return snippet ? { abbreviation, from, to, syntax: ctx.syntax, snippet } : null
}

/** Expands the abbreviation before the cursor. `false` = nothing to expand (Tab goes on to indent). */
export function expandAbbreviationAtCursor(view: EditorView, strict: boolean): boolean {
  const { state } = view
  const sel = state.selection
  if (sel.ranges.length > 1 || !sel.main.empty) return false
  const found = abbreviationAt(state, sel.main.head, strict)
  if (!found) return false
  void expandSnippet(view, found.snippet, found.from, found.to)
  return true
}

function emmetTab(view: EditorView): boolean {
  const { state } = view
  if (!snippetHost().settings()['emmet.triggerExpansionOnTab']) return false
  // Tab of an active snippet or an open completion takes precedence over Emmet.
  if (completionStatus(state) !== null || hasNextSnippetField(state) || hasPrevSnippetField(state)) return false
  return expandAbbreviationAtCursor(view, true)
}

const emmetSource: CompletionSource = (ctx) => {
  if (choiceAt(ctx.state)) return null
  const found = abbreviationAt(ctx.state, ctx.pos, true)
  if (!found) return null
  const option: Completion = {
    label: found.abbreviation,
    detail: t().snippets.emmet.completionDetail,
    info: () => {
      const pre = document.createElement('pre')
      pre.className = 'snippet-preview'
      pre.textContent = snippetPreview(found.snippet)
      return pre
    },
    type: 'snippet',
    boost: 50,
    apply: (view, completion, from, to) => void expandSnippet(view, found.snippet, from, to, { completion })
  }
  return { from: found.from, to: found.to, options: [option], filter: false }
}

export const emmetExtension: Extension = [
  EditorState.languageData.of(() => [{ autocomplete: emmetSource }]),
  Prec.high(keymap.of([{ key: 'Tab', run: emmetTab }]))
]

// ---------- Commands ----------

/** Markup syntax of the tab (for wrap/balance); `null` = the language has no markup Emmet. */
export function markupSyntaxOf(state: EditorState): EmmetSyntax | null {
  const host = snippetHost()
  const settings = host.settings()
  const base = emmetSyntaxFor(host.languageId(state.facet(lspTabId)), settings['emmet.includeLanguages'])
  return base?.type === 'markup' ? base : null
}

function dedent(lines: string[]): string[] {
  const indents = lines.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)?.[0].length ?? 0)
  const cut = indents.length ? Math.min(...indents) : 0
  return lines.map((l) => l.slice(cut))
}

/** Wraps the selection (or the cursor line) with the abbreviation. `false` = invalid abbreviation. */
export function wrapWithAbbreviation(view: EditorView, abbreviation: string, syntax: EmmetSyntax): boolean {
  const { state } = view
  const main = state.selection.main
  const line = state.doc.lineAt(main.from)
  const range = main.empty
    ? { from: line.from + (/^\s*/.exec(line.text)?.[0].length ?? 0), to: line.to }
    : { from: main.from, to: main.to }
  const lines = dedent(state.sliceDoc(range.from, range.to).split('\n'))
  // `li*` without a number repeats per line, as in VS Code.
  const text = /\*(?!\d)/.test(abbreviation) ? lines.map((l) => l.trim()).filter(Boolean) : lines.join('\n')
  const snippet = expandAbbreviation(abbreviation.trim(), syntax, { text })
  if (!snippet) return false
  void expandSnippet(view, snippet, range.from, range.to, { selectedText: state.sliceDoc(range.from, range.to) })
  return true
}

interface Span {
  from: number
  to: number
}

function tagSpans(tag: { open: [number, number]; close?: [number, number] }): { inner: Span | null; outer: Span } {
  const outer = { from: tag.open[0], to: tag.close ? tag.close[1] : tag.open[1] }
  return { inner: tag.close ? { from: tag.open[1], to: tag.close[0] } : null, outer }
}

/**
 * Selects the next tag pair outwards (content, then the whole tag) or inwards. `false` = nothing to
 * select.
 */
export function balance(view: EditorView, direction: 'outward' | 'inward'): boolean {
  const { state } = view
  const sel = state.selection.main
  const source = state.doc.toString()
  const contains = (outer: Span, inner: Span): boolean => outer.from <= inner.from && inner.to <= outer.to
  const same = (a: Span, b: Span): boolean => a.from === b.from && a.to === b.to
  let target: Span | undefined
  if (direction === 'outward') {
    const candidates = balancedOutward(source, sel.from).flatMap((tag) => {
      const { inner, outer } = tagSpans(tag)
      return inner ? [inner, outer] : [outer]
    })
    target = candidates.find((c) => contains(c, sel) && !same(c, sel))
  } else {
    const candidates = balancedInward(source, sel.from).flatMap((tag) => {
      const { inner, outer } = tagSpans(tag)
      return inner ? [outer, inner] : [outer]
    })
    target = candidates.find((c) => contains(sel, c) && !same(c, sel) && c.to > c.from)
  }
  if (!target) return false
  view.dispatch({ selection: EditorSelection.range(target.from, target.to), scrollIntoView: true })
  return true
}
