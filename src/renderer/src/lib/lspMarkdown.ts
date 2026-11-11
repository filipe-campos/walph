// Markdown of the LSP documentation (hover, completion, signature help) → safe DOM. The text comes from the server
// (and,
// through it, from third-party code comments), so it goes through DOMPurify and no link navigates the window: the
// `href` is
// removed (it stays in `data-href`) and the click opens only `http(s)` in the browser.
import type { LanguageDescription } from '@codemirror/language'
import type { LspMarkup } from '@shared/types'
import { highlightWith, languageForFence, languageForPath } from './codeHighlight'
import { isLinkableHref } from './claudePaths'
import { loadMarkdownLibs, markdownLibs } from './markdownLibs'

const EXTERNAL = /^https?:\/\//i

/** Strict mode (Claude markdown): on only during the synchronous `sanitize`, read by the hook. */
let strictPass = false
const SAFE_CLASS = /^language-[A-Za-z0-9_+#.-]+$/

/**
 * Original `href` of each link: DOMPurify removes those with a scheme it does not know (e.g. `file:`) before the final
 * hook.
 */
const rawHrefs = new WeakMap<Node, string>()

let hooked = false
function ensureHook(DOMPurify: NonNullable<ReturnType<typeof markdownLibs>>['DOMPurify']): void {
  if (hooked) return
  hooked = true
  DOMPurify.addHook('beforeSanitizeAttributes', (node) => {
    const href = node.nodeName === 'A' ? node.getAttribute('href') : null
    if (href) rawHrefs.set(node, href)
  })
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    // Data attributes are ours only: those that came in the model's raw HTML never count (else a forged
    // `data-href`/`data-path`
    // would become a clickable link).
    for (const attr of ['data-href', 'data-path', 'data-line', 'data-column']) node.removeAttribute(attr)
    if (strictPass) {
      // Only `language-*` survives in `class`: the model cannot forge `claude-file-link` & co. nor pick up the app
      // styles.
      const kept = (node.getAttribute('class') ?? '').split(/\s+/).filter((c) => SAFE_CLASS.test(c))
      if (kept.length > 0) node.setAttribute('class', kept.join(' '))
      else node.removeAttribute('class')
    }
    if (node.nodeName !== 'A') return
    const href = (rawHrefs.get(node) ?? '').trim()
    node.removeAttribute('href')
    node.removeAttribute('target')
    node.removeAttribute('rel')
    // Claude (strict): paths and `file:` also open. LSP docs: only http(s).
    if (strictPass ? isLinkableHref(href) : EXTERNAL.test(href)) {
      node.setAttribute('data-href', href)
      node.setAttribute('title', href)
    }
  })
}

/**
 * Sanitized HTML of the markdown (`plaintext` becomes paragraphs of escaped text). `strict` (Claude messages): besides
 * the
 * rest, no `id`/`role`/`data-*`/`aria-*` from the model and `class` only `language-*`.
 */
export function markupToHtml(markup: LspMarkup, options: { strict?: boolean } = {}): string {
  const libs = markdownLibs()
  // Libraries still loading (first time): plain text; whoever renders redoes it when `loadMarkdownLibs` resolves.
  if (!libs) return `<pre class="plain">${escapeHtml(markup.value)}</pre>`
  const { marked, DOMPurify } = libs
  ensureHook(DOMPurify)
  const html =
    markup.kind === 'markdown'
      ? marked.parse(markup.value, { async: false, gfm: true })
      : `<pre class="plain">${escapeHtml(markup.value)}</pre>`
  const strict = !!options.strict
  strictPass = strict
  try {
    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style', 'img', 'picture', 'video', 'audio', 'iframe', 'form', 'input', 'button', 'svg', 'math'],
      FORBID_ATTR: strict ? ['style', 'srcset', 'src', 'id', 'name', 'role', 'tabindex'] : ['style', 'srcset', 'src'],
      ...(strict ? { ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false } : {})
    })
  } finally {
    strictPass = false
  }
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

// Blocks longer than this stay without color: highlighting huge text (e.g. a JSON) would hang the tooltip opening.
const MAX_HIGHLIGHT = 20_000

/** Replaces the content of `code` with text spans with the theme class (no HTML: the text is never interpreted). */
function paint(code: HTMLElement, text: string, desc: LanguageDescription): void {
  const spans = highlightWith(text, desc)
  if (!spans) return
  code.replaceChildren(
    ...spans.map(({ text: t, cls }) => {
      if (!cls) return document.createTextNode(t)
      const span = document.createElement('span')
      span.className = cls
      span.textContent = t
      return span
    })
  )
}

/**
 * Highlights the already sanitized `pre > code` blocks. The language comes from the fence (`language-ts`) or, without
 * it, from the file. If the parser has not loaded yet, the block stays plain text and is painted when the import ends.
 */
export function highlightCodeBlocks(root: HTMLElement, docPath?: string): void {
  for (const code of root.querySelectorAll<HTMLElement>('pre > code')) {
    const text = code.textContent
    if (text.length > MAX_HIGHLIGHT) continue
    const fence = /(?:^|\s)language-(\S+)/.exec(code.className)?.[1]
    const desc = (fence ? languageForFence(fence) : null) ?? (fence ? null : languageForPath(docPath))
    if (!desc) continue
    if (desc.support) paint(code, text, desc)
    else
      void desc.load().then(
        () => {
          // The block may have changed or left the screen while the parser loaded.
          if (code.textContent === text) paint(code, text, desc)
        },
        () => {}
      )
  }
}

/** `.lsp-doc` element with the rendered markdown; `http(s)` links open in the browser. */
export function renderMarkup(markup: LspMarkup, docPath?: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'lsp-doc'
  el.innerHTML = markupToHtml(markup)
  highlightCodeBlocks(el, docPath)
  if (!markdownLibs() && markup.kind === 'markdown') {
    void loadMarkdownLibs()
      .then(() => {
        el.innerHTML = markupToHtml(markup)
        highlightCodeBlocks(el, docPath)
      })
      .catch(() => {})
  }
  el.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest('a')
    if (!link) return
    event.preventDefault()
    const href = link.getAttribute('data-href')
    if (href && EXTERNAL.test(href)) void window.api.window.openExternal(href)
  })
  return el
}

/** `true` if the documentation has no content to show. */
export function isEmptyMarkup(markup: LspMarkup | undefined): boolean {
  return !markup || markup.value.trim() === ''
}

/**
 * Splits the markdown into top-level blocks: the closed ones (followed by another block) no longer change while the
 * response grows and are rendered once; only the last ("tail") is reprocessed on each update. Without the libraries,
 * everything is tail. Accepted limitation: reference link definitions (`[a]: url`) that arrive after the use do not
 * reach
 * blocks already closed during the generation (the final, non-live message is rendered whole).
 */
export function splitMarkdownBlocks(value: string): { closed: string[]; tail: string } {
  const libs = markdownLibs()
  if (!libs) return { closed: [], tail: value }
  const closed: string[] = []
  let current = ''
  let hasContent = false
  for (const token of libs.marked.lexer(value, { gfm: true })) {
    // Spaces between blocks stick to the previous block; a block with new content closes the current one.
    if (token.type !== 'space' && hasContent) {
      closed.push(current)
      current = ''
      hasContent = false
    }
    current += token.raw
    if (token.type !== 'space') hasContent = true
  }
  return { closed, tail: current }
}
