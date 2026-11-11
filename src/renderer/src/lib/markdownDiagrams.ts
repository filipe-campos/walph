// Mermaid diagrams of the ```mermaid blocks: replaces `pre > code.language-mermaid` with the SVG, after the Markdown
// sanitizer. Mermaid (heavy) only loads on the first block. Its SVG goes through its own DOMPurify: `strict` mode
// escapes the label text, but keeps `class`/`style` in the `foreignObject` HTML, and the text comes from an untrusted
// .md.
import { t } from '@shared/i18n'
import type mermaidApi from 'mermaid'
import type DOMPurify from 'dompurify'
import { errorMessage } from './errors'

export type DiagramTheme = 'dark' | 'light'

type Mermaid = typeof mermaidApi
type Purifier = ReturnType<typeof DOMPurify>

interface Rendered {
  svg: string
  /** Id mermaid gave the `<svg>`: each insertion swaps it for its own id (markers and CSS reference by id). */
  id: string
}

const CACHE_MAX = 60
// SVG per theme+source: re-rendering the preview on every keystroke must not flicker or redo diagrams that did not
// change.
const cache = new Map<string, Rendered>()
const inFlight = new Map<string, Promise<Rendered>>()

let mermaid: Promise<Mermaid> | null = null
let purifier: Promise<Purifier> | null = null
let initializedFor: DiagramTheme | null = null
let nextId = 0
let nextInsert = 0
// Mermaid touches `body` when measuring: one render at a time.
let queue: Promise<unknown> = Promise.resolve()
// Each `renderDiagrams` call on the same element invalidates the previous ones.
const generations = new WeakMap<HTMLElement, number>()

function loadMermaid(): Promise<Mermaid> {
  mermaid ??= import('mermaid').then((m) => m.default)
  mermaid.catch(() => {
    mermaid = null
  })
  return mermaid
}

// Classes mermaid uses in the HTML labels; any other (the app's, for example) is dropped.
const LABEL_CLASSES = new Set([
  'nodeLabel',
  'edgeLabel',
  'labelBkg',
  'label',
  'cluster-label',
  'markdown-node-label',
  'labelText',
  'katex'
])
const FORBIDDEN_CSS = /position\s*:|z-index\s*:|@import|url\s*\(|expression\s*\(/gi

/** Strips from a CSS what draws outside the diagram or loads something. */
function cleanCss(css: string): string {
  return css.replace(FORBIDDEN_CSS, '/*removido*/ x:')
}

function cleanStyleAttr(value: string): string {
  return value
    .split(';')
    .filter(
      (decl) =>
        !/^\s*(position|z-index|inset|top|left|right|bottom)\s*:/i.test(decl) && !/url\s*\(|expression\s*\(/i.test(decl)
    )
    .join(';')
}

async function loadPurifier(): Promise<Purifier> {
  purifier ??= import('dompurify').then((m) => {
    const instance = m.default(window)
    instance.addHook('afterSanitizeAttributes', (node) => {
      const style = node.getAttribute('style')
      if (style !== null) node.setAttribute('style', cleanStyleAttr(style))
      if (node.nodeName.toUpperCase() === 'STYLE') node.textContent = cleanCss(node.textContent)
      // Outside the label HTML the classes only affect the SVG itself; inside it they could forge the app's.
      if (node.closest('foreignObject') && node.nodeName.toUpperCase() !== 'FOREIGNOBJECT') {
        const kept = (node.getAttribute('class') ?? '').split(/\s+/).filter((c) => LABEL_CLASSES.has(c))
        if (kept.length > 0) node.setAttribute('class', kept.join(' '))
        else node.removeAttribute('class')
      }
    })
    return instance
  })
  purifier.catch(() => {
    purifier = null
  })
  return purifier
}

async function sanitizeSvg(svg: string): Promise<string> {
  const purify = await loadPurifier()
  return purify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    ADD_TAGS: ['foreignObject', 'style'],
    FORBID_TAGS: ['a', 'use', 'image', 'script', 'iframe', 'form', 'input', 'button', 'textarea', 'link', 'meta'],
    FORBID_ATTR: ['href', 'xlink:href'],
    HTML_INTEGRATION_POINTS: { foreignobject: true },
    ALLOW_DATA_ATTR: false
  })
}

async function drawSvg(source: string, theme: DiagramTheme): Promise<Rendered> {
  const lib = await loadMermaid()
  if (initializedFor !== theme) {
    lib.initialize({ startOnLoad: false, securityLevel: 'strict', theme: theme === 'dark' ? 'dark' : 'default' })
    initializedFor = theme
  }
  const id = `walph-mermaid-${nextId++}`
  try {
    const { svg } = await lib.render(id, source)
    return { svg: await sanitizeSvg(svg), id }
  } finally {
    // On error mermaid leaves a debug element in `body`.
    document.getElementById(id)?.remove()
    document.getElementById(`d${id}`)?.remove()
  }
}

function renderSvg(source: string, theme: DiagramTheme): Promise<Rendered> {
  const key = `${theme}\0${source}`
  const pending = inFlight.get(key)
  if (pending) return pending
  const run = (): Promise<Rendered> => drawSvg(source, theme)
  const result = queue.then(run, run)
  queue = result.catch(() => {})
  const promise = result.then((rendered) => {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!)
    cache.set(key, rendered)
    return rendered
  })
  inFlight.set(key, promise)
  const done = (): void => void inFlight.delete(key)
  promise.then(done, done)
  return promise
}

function diagramBox(source: string, theme: DiagramTheme): HTMLDivElement {
  const box = document.createElement('div')
  box.className = 'md-diagram'
  // Kept to redraw when the theme changes, already without the original code block.
  box.dataset.diagramSource = source
  box.dataset.diagramTheme = theme
  return box
}

function showSvg(target: HTMLElement, source: string, theme: DiagramTheme, rendered: Rendered): void {
  const box = diagramBox(source, theme)
  box.innerHTML = rendered.svg.replaceAll(rendered.id, `${rendered.id}-${nextInsert++}`)
  target.replaceWith(box)
}

function showError(target: HTMLElement, source: string, theme: DiagramTheme, err: unknown): void {
  const box = diagramBox(source, theme)
  box.classList.add('md-diagram-error')
  box.setAttribute('role', 'alert')
  const title = document.createElement('div')
  title.textContent = t().editor.markdown.diagramError
  const detail = document.createElement('pre')
  detail.textContent = errorMessage(err)
  box.append(title, detail)
  target.replaceWith(box)
}

/**
 * Draws the mermaid diagrams inside `root` (already sanitized HTML). The ones already seen go in right away, without
 * waiting; the new ones go in when ready, unless `root` was rebuilt in the meantime. Diagrams already drawn in another
 * theme are redone.
 */
export async function renderDiagrams(root: HTMLElement, theme: DiagramTheme): Promise<void> {
  const targets: { el: HTMLElement; source: string }[] = []
  for (const code of root.querySelectorAll<HTMLElement>('pre > code.language-mermaid')) {
    if (code.parentElement) targets.push({ el: code.parentElement, source: code.textContent })
  }
  for (const box of root.querySelectorAll<HTMLElement>('.md-diagram:not(.md-diagram-error)')) {
    if (box.dataset.diagramTheme !== theme && box.dataset.diagramSource !== undefined) {
      targets.push({ el: box, source: box.dataset.diagramSource })
    }
  }
  if (targets.length === 0) return
  const generation = (generations.get(root) ?? 0) + 1
  generations.set(root, generation)
  const current = (el: HTMLElement): boolean => generations.get(root) === generation && el.isConnected
  const pending: Promise<void>[] = []
  for (const { el, source } of targets) {
    const cached = cache.get(`${theme}\0${source}`)
    if (cached !== undefined) {
      showSvg(el, source, theme, cached)
      continue
    }
    pending.push(
      renderSvg(source, theme).then(
        (rendered) => {
          if (current(el)) showSvg(el, source, theme, rendered)
        },
        (err: unknown) => {
          if (current(el)) showError(el, source, theme, err)
        }
      )
    )
  }
  await Promise.all(pending)
}
