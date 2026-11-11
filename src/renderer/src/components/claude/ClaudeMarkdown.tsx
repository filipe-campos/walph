import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { t } from '@shared/i18n'
import { openPathFromClaude } from '../../claudeEditorContext'
import { copyText } from '../../clipboard'
import { parseFileRef, parseHref } from '../../lib/claudePaths'
import { highlightCodeBlocks, markupToHtml, splitMarkdownBlocks } from '../../lib/lspMarkdown'
import { renderDiagrams } from '../../lib/markdownDiagrams'
import { loadMarkdownLibs, markdownLibs } from '../../lib/markdownLibs'
import { findTheme } from '../../themes'
import { selectThemeName, useStore } from '../../store'

// HTML already sanitized per block text: remounting a panel (or reviewing a conversation) reprocesses nothing.
const HTML_CACHE_MAX = 400
const htmlCache = new Map<string, string>()

// Model content: strict mode (only `language-*` in class; no id/role/data-*/aria-*).
const markdown = (text: string): string => markupToHtml({ kind: 'markdown', value: text }, { strict: true })

function blockHtml(text: string, ready: boolean): string {
  if (!ready) return markdown(text)
  const hit = htmlCache.get(text)
  if (hit !== undefined) return hit
  const html = markdown(text)
  if (htmlCache.size >= HTML_CACHE_MAX) htmlCache.delete(htmlCache.keys().next().value!)
  htmlCache.set(text, html)
  return html
}

/** Clickable element that is not an `<a href>`: enters the tab order and is announced as a link. */
function makeLink(node: HTMLElement): void {
  node.tabIndex = 0
  node.setAttribute('role', 'link')
}

function labelCopyButton(button: HTMLElement): void {
  const label = t().claude.markdown.copyCode
  button.title = label
  button.setAttribute('aria-label', label)
}

/** "Copy" on each closed code block (our button, created here: nothing comes from the model's HTML). */
function addCopyButtons(root: HTMLElement): void {
  for (const pre of root.querySelectorAll('pre')) {
    if (pre.querySelector(':scope > .claude-code-copy')) continue
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'claude-code-copy'
    labelCopyButton(button)
    const icon = document.createElement('i')
    icon.className = 'codicon codicon-copy'
    icon.setAttribute('aria-hidden', 'true')
    button.append(icon)
    pre.append(button)
  }
}

/** A top-level markdown block. Memoized by text: the closed blocks of a response being generated are not redone. */
const MarkdownBlock = memo(function MarkdownBlock({
  text,
  root,
  ready,
  highlight
}: {
  text: string
  root: string | null
  ready: boolean
  highlight: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const html = useMemo(() => blockHtml(text, ready), [text, ready])
  const locale = useStore((s) => s.locale)
  const themeKind = useStore((s) => findTheme(selectThemeName(s)).kind)

  // The buttons are imperative DOM: when the language changes, the label already written must be redone.
  useLayoutEffect(() => {
    for (const button of ref.current?.querySelectorAll<HTMLElement>('.claude-code-copy') ?? []) labelCopyButton(button)
  }, [locale])

  // After each new HTML: highlights the blocks (only the closed ones) and marks the clickable paths (only data
  // attributes we compute ourselves; nothing from the model's text becomes an attribute).
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (highlight) {
      highlightCodeBlocks(el)
      addCopyButtons(el)
      void renderDiagrams(el, themeKind)
    }
    // Links (the `href` was removed by the sanitizer and kept in `data-href`): focusable and activatable with Enter.
    for (const link of el.querySelectorAll<HTMLElement>('a[data-href]')) makeLink(link)
    if (!root) return
    for (const node of el.querySelectorAll<HTMLElement>('code, a:not([data-href])')) {
      if (node.closest('pre')) continue
      const fileRef = parseFileRef(node.textContent, root)
      if (!fileRef) continue
      node.classList.add('claude-file-link')
      makeLink(node)
      node.dataset.path = fileRef.path
      if (fileRef.line) node.dataset.line = String(fileRef.line)
      if (fileRef.column) node.dataset.column = String(fileRef.column)
    }
  }, [html, root, highlight, themeKind])

  // Sanitized by DOMPurify in `markupToHtml`.
  return <div ref={ref} className="claude-md-block" dangerouslySetInnerHTML={{ __html: html }} />
})

/** Click or Enter: copies the code block, opens the external link or the file path under the target. */
function activate(target: Element | null, event: { preventDefault(): void }): void {
  const copy = target?.closest<HTMLElement>('.claude-code-copy')
  if (copy) {
    event.preventDefault()
    const code = copy.closest('pre')?.querySelector('code')
    void copyText(code?.textContent ?? copy.closest('pre')?.textContent ?? '').then((ok) => {
      if (!ok) return
      const icon = copy.querySelector('i')
      if (!icon) return
      icon.className = 'codicon codicon-check'
      copy.classList.add('done')
      setTimeout(() => {
        icon.className = 'codicon codicon-copy'
        copy.classList.remove('done')
      }, 1500)
    })
    return
  }
  const link = target?.closest<HTMLElement>('a[data-href]')
  if (link) {
    event.preventDefault()
    const href = link.getAttribute('data-href')
    const root = useStore.getState().root
    const target = href && root ? parseHref(href, root) : null
    if (target?.kind === 'external') void window.api.window.openExternal(target.url)
    else if (target) void openPathFromClaude(target.ref.path, target.ref.line, target.ref.column)
    return
  }
  const file = target?.closest<HTMLElement>('.claude-file-link')
  if (file?.dataset.path) {
    event.preventDefault()
    void openPathFromClaude(
      file.dataset.path,
      file.dataset.line ? Number(file.dataset.line) : undefined,
      file.dataset.column ? Number(file.dataset.column) : undefined
    )
  }
}

const LIVE_THROTTLE_MS = 100

/**
 * Claude's markdown (untrusted content): goes through the same DOMPurify as the LSP docs (no images, no `href`),
 * `http(s)`/`mailto` links open in the browser and file paths (links or `code`) open in the editor. While generating,
 * the text is reprocessed at most every 100 ms and only the tail (the last block) is redone: closed blocks are
 * processed once.
 */
export const ClaudeMarkdown = memo(function ClaudeMarkdown({ text, live }: { text: string; live?: boolean }) {
  const root = useStore((s) => s.root)
  const [ready, setReady] = useState(() => !!markdownLibs())
  useEffect(() => {
    if (ready) return
    let on = true
    void loadMarkdownLibs()
      .then(() => on && setReady(true))
      .catch(() => {})
    return () => {
      on = false
    }
  }, [ready])

  // Throttle (not debounce): the stream never stops for 100 ms, so a debounce would not update until the end.
  const [throttled, setThrottled] = useState(text)
  const latest = useRef(text)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    latest.current = text
    if (!live || timer.current) return
    timer.current = setTimeout(() => {
      timer.current = undefined
      setThrottled(latest.current)
    }, LIVE_THROTTLE_MS)
  }, [text, live])
  useEffect(() => () => clearTimeout(timer.current), [])
  const value = live ? throttled : text

  const blocks = useMemo(
    () => (live && ready ? splitMarkdownBlocks(value) : { closed: [] as string[], tail: value }),
    [value, live, ready]
  )

  return (
    <div
      className="lsp-doc claude-markdown"
      onClick={(event) => activate(event.target as Element | null, event)}
      onKeyDown={(event) => {
        // Enter activates the focused link/path, like the click.
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) activate(event.target as Element | null, event)
      }}
    >
      {blocks.closed.map((block, i) => (
        <MarkdownBlock key={i} text={block} root={root} ready={ready} highlight />
      ))}
      <MarkdownBlock text={blocks.tail} root={root} ready={ready} highlight={!live} />
    </div>
  )
})
