// Highlighting of code blocks in LSP markdown with the same Lezer and the same `HighlightStyle` as the editor: the
// colors
// come from the active theme, never from a palette of its own. It only produces text spans (whoever builds the DOM uses
// `textContent`, no HTML).
import { highlightingFor, LanguageDescription, type LanguageSupport } from '@codemirror/language'
import { EditorState, type Extension } from '@codemirror/state'
import { highlightTree, type Highlighter } from '@lezer/highlight'
import { languages } from './language'
import { basename } from './path'

export interface CodeSpan {
  text: string
  /** Theme class (`null` = text without highlighting). */
  cls: string | null
}

/** Splits `code` into spans with the class the `highlighter` gives each tree node. Covers the whole `[start, end)`. */
export function highlightSpans(
  code: string,
  tree: Parameters<typeof highlightTree>[0],
  highlighter: Highlighter,
  start = 0,
  end = code.length
) {
  const spans: CodeSpan[] = []
  let pos = start
  highlightTree(
    tree,
    highlighter,
    (from, to, cls) => {
      if (from > pos) spans.push({ text: code.slice(pos, from), cls: null })
      spans.push({ text: code.slice(Math.max(from, pos), to), cls })
      pos = to
    },
    start,
    end
  )
  if (pos < end) spans.push({ text: code.slice(pos, end), cls: null })
  return spans
}

// Highlighting of the active theme: a state with only the theme extension answers `highlightingFor` as the editor
// would.
let themeState: EditorState | null = null

/** Sets the theme whose `HighlightStyle` colors the blocks (called on every editor theme change). */
export function setHighlightTheme(theme: Extension): void {
  themeState = EditorState.create({ extensions: theme })
}

/** Highlighter of the active theme (`null` before there is a theme: the code stays without color). */
function themeHighlighter(): Highlighter | null {
  const state = themeState
  return state ? { style: (tags) => highlightingFor(state, tags) } : null
}

/** Language of a fence (` ```ts `, ` ```typescript title=x `): name, alias or extension. */
export function languageForFence(info: string): LanguageDescription | null {
  const name =
    info
      .trim()
      .split(/[\s{,]/)[0]
      ?.toLowerCase() ?? ''
  if (!name) return null
  return (
    LanguageDescription.matchLanguageName(languages, name, false) ??
    LanguageDescription.matchFilename(languages, `x.${name}`)
  )
}

/** File language, for fences without a language (tsserver uses ```typescript, other servers not even that). */
export function languageForPath(path: string | undefined): LanguageDescription | null {
  return path ? LanguageDescription.matchFilename(languages, basename(path)) : null
}

/** Support already loaded (synchronous) or `null`; the parser comes from a dynamic import, loaded once and kept. */
function loadedSupport(desc: LanguageDescription): LanguageSupport | null {
  return desc.support ?? null
}

/** Highlighted spans of `code`; `null` if the language has not loaded yet or there is no theme. */
export function highlightWith(code: string, desc: LanguageDescription): CodeSpan[] | null {
  const support = loadedSupport(desc)
  const highlighter = themeHighlighter()
  if (!support || !highlighter) return null
  return highlightSpans(code, support.language.parser.parse(code), highlighter)
}

/**
 * Highlighted spans of `code[start, end)` with the `support` parser (the whole file is parsed: the highlighting of a
 * span depends on what comes before). Without a language or without a theme, a single span, without color.
 */
export function highlightRange(code: string, support: LanguageSupport | null, start: number, end: number): CodeSpan[] {
  const highlighter = themeHighlighter()
  if (!support || !highlighter) return [{ text: code.slice(start, end), cls: null }]
  return highlightSpans(code, support.language.parser.parse(code), highlighter, start, end)
}
