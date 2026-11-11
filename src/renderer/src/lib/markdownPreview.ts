// Markdown preview: text → safe HTML and the resolution of relative links/images. The `.md` may come from a
// cloned repository, so the HTML is untrusted: it goes through its own DOMPurify instance (the global hooks of
// `lspMarkdown` touch `href`/`data-*` differently and must not mix), without `script`, `iframe`,
// forms, styles or `on*`, and nothing navigates the window or loads anything by itself: `href`/`src` become
// `data-raw-*` attributes and the component decides what to open, with the help of the pure functions below.
import type DOMPurify from 'dompurify'
import { sepOf } from './path'
import { markdownLibs } from './markdownLibs'
import { isKatexClass, isKatexStyle } from './markdownKatex'

const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/
const EXTERNAL_SCHEMES = new Set(['http', 'https', 'mailto'])

export function isMarkdownPath(path: string): boolean {
  return /\.(md|mdx)$/i.test(path)
}

// ---------- Paths ----------

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)
}

/**
 * Joins and normalizes (`.`/`..`) without touching the disk; keeps the separator of the source path and the Windows
 * `C:`.
 */
function resolvePath(dir: string, rel: string): string {
  const base = isAbsolutePath(rel) ? rel : `${dir}${sepOf(dir)}${rel}`
  const windows = /^[A-Za-z]:/.test(base)
  const sep = windows ? '\\' : '/'
  const lead = base.startsWith('/') ? '/' : ''
  const parts: string[] = []
  for (const seg of base.split(/[\\/]/)) {
    if (!seg || seg === '.') continue
    if (seg === '..') {
      // Does not go above the root (nor above `C:`).
      if (parts.length > (windows ? 1 : 0)) parts.pop()
    } else parts.push(seg)
  }
  const joined = parts.join(sep)
  return windows && parts.length === 1 ? `${joined}${sep}` : lead + joined
}

function dirnameOf(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  // The root keeps the separator ("/" and "C:\\").
  if (idx === 2 && /^[A-Za-z]:/.test(path)) return path.slice(0, 3)
  return idx <= 0 ? path.slice(0, 1) : path.slice(0, idx)
}

function decode(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

// ---------- Links and images ----------

export type LinkTarget =
  | { kind: 'anchor'; id: string }
  | { kind: 'file'; path: string; anchor?: string }
  | { kind: 'external'; url: string }
  | { kind: 'ignore' }

/**
 * What a click on `href` should do, given the `.md` where it is. `#x` scrolls inside the preview; a relative (or
 * absolute) path opens the file in the editor, `file.md#x` too; `http(s)`/`mailto` go to the browser; any
 * other scheme (`javascript:`, `file:`, `data:`…) and `//host` are ignored.
 */
export function resolveLink(href: string | null | undefined, mdPath: string): LinkTarget {
  const raw = (href ?? '').trim()
  if (!raw) return { kind: 'ignore' }
  if (raw.startsWith('#')) {
    const id = decode(raw.slice(1))
    return id ? { kind: 'anchor', id } : { kind: 'ignore' }
  }
  const scheme = SCHEME.exec(raw)?.[1]
  // `C:\x` looks like a one-letter scheme; it is not a Markdown link, but a file path.
  if (scheme && scheme.length > 1) {
    return EXTERNAL_SCHEMES.has(scheme.toLowerCase()) ? { kind: 'external', url: raw } : { kind: 'ignore' }
  }
  if (raw.startsWith('//')) return { kind: 'ignore' }
  const hash = raw.indexOf('#')
  const beforeHash = hash >= 0 ? raw.slice(0, hash) : raw
  const anchor = hash >= 0 ? decode(raw.slice(hash + 1)) : undefined
  const pathPart = decode(beforeHash.split('?')[0] ?? '')
  // A lone `?q` or nothing before the `#`: it stayed in the same document.
  if (!pathPart) return anchor ? { kind: 'anchor', id: anchor } : { kind: 'ignore' }
  const path = resolvePath(dirnameOf(mdPath), pathPart)
  return anchor ? { kind: 'file', path, anchor } : { kind: 'file', path }
}

export type ImageSource =
  | { kind: 'local'; path: string }
  /** Raster image embedded in the text itself (`data:image/png;base64,…`). */
  | { kind: 'inline'; url: string }
  | { kind: 'remote' }
  | { kind: 'none' }

const INLINE_IMAGE = /^data:image\/(png|jpe?g|gif|webp|avif|bmp);base64,[A-Za-z0-9+/=]+$/i

/** Where the image comes from: local file (relative to the `.md`, or absolute), embedded, or remote (never loaded). */
export function resolveImage(src: string | null | undefined, mdPath: string): ImageSource {
  const raw = (src ?? '').trim()
  if (!raw) return { kind: 'none' }
  if (INLINE_IMAGE.test(raw)) return { kind: 'inline', url: raw }
  const scheme = SCHEME.exec(raw)?.[1]
  if (scheme && scheme.length > 1) return { kind: 'remote' }
  if (raw.startsWith('//')) return { kind: 'remote' }
  const pathPart = decode(raw.split(/[?#]/)[0] ?? '')
  if (!pathPart) return { kind: 'none' }
  return { kind: 'local', path: resolvePath(dirnameOf(mdPath), pathPart) }
}

// ---------- Anchors ----------

/** Anchor of a heading as GitHub writes it: lowercase, no punctuation, spaces become hyphens. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s/g, '-')
}

/**
 * Gives each heading a unique `data-slug` (`title`, `title-1`…). Does not use `id`: the document's cannot collide with
 * the app's.
 */
export function assignHeadingSlugs(root: HTMLElement): void {
  const seen = new Map<string, number>()
  for (const heading of root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')) {
    const base = slugify(heading.textContent)
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    heading.setAttribute('data-slug', count === 0 ? base : `${base}-${count}`)
  }
}

/** Heading that matches the `#id` anchor (case-insensitive, like GitHub). */
export function findAnchorTarget(root: HTMLElement, id: string): HTMLElement | null {
  const wanted = id.toLowerCase()
  for (const el of root.querySelectorAll<HTMLElement>('[data-slug]'))
    if (el.getAttribute('data-slug') === wanted) return el
  return null
}

// ---------- Rendering ----------

let purifier: Purifier | null = null

const FOOTNOTE_ID = /^footnote-(ref-)?[\w%-]+$/
const footnoteSlugs = new WeakMap<Node, string>()

function allowedClass(node: Element, name: string): boolean {
  if (node.nodeName === 'CODE') return /^language-[\w-]+$/.test(name)
  if (/^markdown-alert(-(note|tip|important|warning|caution|title))?$/.test(name)) return true
  if (name === 'footnotes') return node.nodeName === 'SECTION'
  if (name === 'sr-only') return footnoteSlugs.get(node) === 'footnote-label'
  if (name === 'katex' || name === 'katex-display') return node.nodeName === 'SPAN'
  return isKatexClass(name) && !!node.parentElement?.closest('.katex')
}

type Purifier = ReturnType<typeof DOMPurify>

function sanitizer(factory: NonNullable<ReturnType<typeof markdownLibs>>['DOMPurify']): Purifier {
  if (purifier) return purifier
  const instance = factory(window)
  // `id` is forbidden (clobbering), but footnotes are the target of `#footnote-1`: the id becomes `data-slug`, which
  // the preview already resolves.
  instance.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName === 'id' && FOOTNOTE_ID.test(data.attrValue))
      footnoteSlugs.set(node, data.attrValue.toLowerCase())
    else if (data.attrName === 'style' && node.parentElement?.closest('.katex') && isKatexStyle(data.attrValue))
      data.forceKeepAttr = true
  })
  instance.addHook('afterSanitizeAttributes', (node) => {
    // Document classes would collide with the app's (a forged `.modal-backdrop` would cover the window): only the
    // fences' `language-*` remain, those of the alerts and footnotes and those of KaTeX (inside `.katex`).
    const cls = node.getAttribute('class')
    if (cls !== null) {
      const kept = cls.split(/\s+/).filter((c) => allowedClass(node, c))
      if (kept.length > 0) node.setAttribute('class', kept.join(' '))
      else node.removeAttribute('class')
    }
    const slug = footnoteSlugs.get(node)
    if (slug) node.setAttribute('data-slug', slug)
    if (node.nodeName === 'A') {
      const href = node.getAttribute('href')
      node.removeAttribute('href')
      node.removeAttribute('target')
      node.removeAttribute('rel')
      if (href) {
        node.setAttribute('data-raw-href', href)
        node.setAttribute('role', 'link')
        node.setAttribute('tabindex', '0')
      }
    } else if (node.nodeName === 'IMG') {
      const src = node.getAttribute('src')
      for (const attr of ['src', 'srcset', 'loading', 'decoding']) node.removeAttribute(attr)
      if (src) node.setAttribute('data-raw-src', src)
    } else if (node.nodeName === 'INPUT') {
      // Only the task list checkbox, inert.
      const checked = node.hasAttribute('checked')
      for (const attr of [...node.getAttributeNames()]) node.removeAttribute(attr)
      node.setAttribute('type', 'checkbox')
      node.setAttribute('disabled', '')
      if (checked) node.setAttribute('checked', '')
    }
  })
  purifier = instance
  return instance
}

/**
 * Markdown → sanitized HTML (GFM). Links and images come out without `href`/`src`: see `data-raw-href`/`data-raw-src`.
 */
export function renderMarkdownHtml(source: string): string {
  const libs = markdownLibs()
  // Libraries still loading: the component repeats the render when `loadMarkdownLibs` resolves.
  if (!libs) return ''
  const html = libs.preview.parse(source, { async: false, gfm: true })
  const fragment = sanitizer(libs.DOMPurify).sanitize(html, {
    USE_PROFILES: { html: true },
    // `svg` only for the KaTeX radicals and arrows; whatever comes outside `.katex` goes right below.
    ADD_TAGS: ['svg', 'path', 'line'],
    ADD_ATTR: ['viewBox', 'preserveAspectRatio', 'd', 'x1', 'x2', 'y1', 'y2'],
    RETURN_DOM_FRAGMENT: true,
    FORBID_TAGS: [
      'script',
      'iframe',
      'frame',
      'frameset',
      'object',
      'embed',
      'form',
      'style',
      'link',
      'meta',
      'base',
      'button',
      'textarea',
      'select',
      'option',
      'math',
      'video',
      'audio',
      'source',
      'picture',
      'template',
      'dialog',
      'area',
      'map'
    ],
    // Document `id`/`name` must not collide with the app's nor create global properties (DOM clobbering).
    FORBID_ATTR: [
      'style',
      'id',
      'name',
      'form',
      'formaction',
      'srcdoc',
      'background',
      'usemap',
      'poster',
      'ping',
      'action'
    ],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false
  })
  for (const el of fragment.querySelectorAll('svg')) if (!el.closest('.katex')) el.remove()
  const holder = document.createElement('div')
  holder.append(fragment)
  return holder.innerHTML
}
