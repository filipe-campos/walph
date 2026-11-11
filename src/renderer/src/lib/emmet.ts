// Pure Emmet (`emmet` package): which language uses which syntax, extraction of the abbreviation before the cursor and
// expansion to the VS Code snippet syntax (`${1}`, `${1:text}`), which the editor expands like the user snippets.
import expand, { extract, resolveConfig, type SyntaxType, type UserConfig } from 'emmet'

export interface EmmetSyntax {
  type: SyntaxType
  /** Package syntax: `html`, `xml`, `jsx`, `css`, `scss`, `less`, `sass`, `stylus`. */
  syntax: string
}

const MARKUP: Record<string, string> = {
  html: 'html',
  xhtml: 'html',
  vue: 'html',
  'vue-html': 'html',
  svelte: 'html',
  xml: 'xml',
  xsl: 'xml',
  jsx: 'jsx',
  javascriptreact: 'jsx',
  typescriptreact: 'jsx'
}

const STYLESHEET = new Set(['css', 'scss', 'sass', 'less', 'stylus'])

/** Emmet syntax for the `languageId` (after the `emmet.includeLanguages` map); `null` = no Emmet. */
export function emmetSyntaxFor(languageId: string, include: Readonly<Record<string, string>> = {}): EmmetSyntax | null {
  const id = Object.hasOwn(include, languageId) ? (include[languageId] ?? languageId) : languageId
  const markup = Object.hasOwn(MARKUP, id) ? MARKUP[id] : undefined
  if (markup) return { type: 'markup', syntax: markup }
  if (STYLESHEET.has(id)) return { type: 'stylesheet', syntax: id }
  return null
}

export interface ExtractedAbbreviation {
  abbreviation: string
  /** Offsets in the line (0-based, UTF-16): the span the expansion replaces. */
  start: number
  end: number
}

/**
 * Abbreviation that ends at the cursor (`column`). Looks ahead only to take the auto-close (`div[a|]`): the
 * returned span may go past the cursor.
 */
export function extractAbbreviation(line: string, column: number, type: SyntaxType): ExtractedAbbreviation | null {
  try {
    const found = extract(line, column, { type, lookAhead: true })
    if (!found || !found.abbreviation || found.end < column) return null
    return { abbreviation: found.abbreviation, start: found.start, end: found.end }
  } catch {
    return null
  }
}

// HTML tags: a lone word is only an abbreviation if it is one of them (or an Emmet snippet), else Tab on `foo`
// would become `<foo></foo>`.
const HTML_TAGS = new Set(
  (
    'a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col ' +
    'colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 ' +
    'h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main map mark menu meta ' +
    'meter nav noscript object ol optgroup option output p picture pre progress q rp rt ruby s samp script search ' +
    'section select slot small source span strong style sub summary sup svg table tbody td template textarea tfoot th ' +
    'thead time title tr track u ul var video wbr'
  ).split(' ')
)

/**
 * Plausible start of an element in the middle of JS code (JSX): `.class`, `#id`, an HTML tag or a capitalized
 * component. `x.id` or `foo.bar` are property access, not an abbreviation.
 */
export function startsWithElement(abbreviation: string): boolean {
  const head = /^[A-Za-z][\w-]*/.exec(abbreviation)?.[0]
  if (!head) return /^[.#]/.test(abbreviation)
  return HTML_TAGS.has(head) || /^[A-Z]/.test(head)
}

let markupSnippets: Set<string> | null = null
const knownMarkupSnippet = (name: string): boolean =>
  (markupSnippets ??= new Set(Object.keys(resolveConfig({ type: 'markup', syntax: 'html' }).snippets))).has(name)

const MARKUP_OPERATORS = /[.#>+*^[\]{}()$@:!]/

/**
 * The abbreviation looks intentional: with Emmet operators, or a known tag/snippet (in JSX also a capitalized
 * component). In CSS any word that Emmet can expand counts (see `expandAbbreviation`).
 */
export function isLikelyAbbreviation(abbreviation: string, syntax: EmmetSyntax): boolean {
  if (!abbreviation || abbreviation.length > 500) return false
  if (syntax.type === 'stylesheet') return /^[A-Za-z!@-][\w\-:.!%#+@$]*$/.test(abbreviation)
  if (/^[A-Za-z][\w-]*$/.test(abbreviation)) {
    return HTML_TAGS.has(abbreviation.toLowerCase()) || knownMarkupSnippet(abbreviation)
  }
  return /^[A-Za-z!.#[({]/.test(abbreviation) && MARKUP_OPERATORS.test(abbreviation)
}

const field = (index: number, placeholder: string): string =>
  placeholder ? `\${${index}:${placeholder}}` : `\${${index}}`

// The wrapped text goes inside a snippet: `$`, `}` and `\` need escaping.
const escapeText = (text: string): string => text.replace(/[$}\\]/g, '\\$&')

export interface ExpandOptions {
  /** Text to wrap ("Wrap with Abbreviation"): one line per item when the abbreviation repeats (`li*`). */
  text?: string | string[]
}

/**
 * Expands the abbreviation to the VS Code snippet syntax; `null` if it does not expand (syntax error, or an unknown CSS
 * property, which Emmet would turn into `foo: ;`).
 */
export function expandAbbreviation(
  abbreviation: string,
  syntax: EmmetSyntax,
  options: ExpandOptions = {}
): string | null {
  const config: UserConfig = {
    type: syntax.type,
    syntax: syntax.syntax,
    options: {
      'output.field': field,
      'output.text': escapeText,
      // Tab at the start of the line: CodeMirror's `snippet()` replaces it with the editor indentation.
      'output.indent': '\t',
      'stylesheet.fuzzySearchMinScore': 0.3
    },
    ...(options.text !== undefined && { text: options.text })
  }
  let out: string
  try {
    out = expand(abbreviation, config)
  } catch {
    return null
  }
  if (!out) return null
  if (syntax.type === 'stylesheet' && /^[\w-]+: \$\{0\};?$/.test(out) && !abbreviation.includes(':')) return null
  return out
}
