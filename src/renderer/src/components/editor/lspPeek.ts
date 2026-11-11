// Peek: embedded preview below the line (definition, implementation, references, code lens) with the target code
// highlighted by its language and, with several locations, the list beside it. Esc closes; Enter or a double click
// opens the location.
// The preview is highlighted text (Lezer + the active theme), not another EditorView: the only views are the editor
// groups'.
import type { LanguageSupport } from '@codemirror/language'
import { Prec, StateEffect, StateField, type Extension } from '@codemirror/state'
import { Decoration, EditorView, keymap, WidgetType, type DecorationSet } from '@codemirror/view'
import { t } from '@shared/i18n'
import type { LspLocation } from '@shared/types'
import { highlightRange } from '../../lib/codeHighlight'
import { loadLanguage } from '../../lib/language'
import { basename, dirname } from '../../lib/path'
import { HIGHLIGHT_MAX_CHARS, markColumns, previewWindow, splitSpanLines } from '../../lib/peekPreview'
import { lspHost } from './lspHost'

export interface PeekRequest {
  /** Position in the document: the peek shows below its line. */
  pos: number
  title: string
  locations: readonly LspLocation[]
}

/** Fixed height (CSS `.lsp-peek`): CodeMirror needs the estimate before measuring the block. */
const PEEK_HEIGHT = 300
/** Files read in advance so the list shows the line of each location. */
const PRELOAD_FILES = 50

type Lines = string[] | null

/** State of an open peek, outside the `EditorState`: switching locations and reading files are not transactions. */
class PeekModel {
  index = 0
  /** The list gets focus only the first time the widget appears (not when the tab is shown again). */
  pendingFocus = true
  private readonly requested = new Set<string>()
  private readonly loaded = new Map<string, Lines>()
  private readonly supports = new Map<string, LanguageSupport | null>()
  private readonly listeners = new Set<() => void>()

  constructor(
    readonly title: string,
    readonly locations: readonly LspLocation[]
  ) {
    for (const path of [...new Set(locations.map((l) => l.path))].slice(0, PRELOAD_FILES)) this.load(path)
  }

  get current(): LspLocation | undefined {
    return this.locations[this.index]
  }

  select(index: number): void {
    const n = this.locations.length
    if (n === 0) return
    this.index = ((index % n) + n) % n
    const current = this.current
    if (current) this.load(current.path)
    this.emit()
  }

  /** Lines of the file; `undefined` while loading, `null` if it could not be read. */
  lines(path: string): Lines | undefined {
    return this.loaded.get(path)
  }

  /** Language of the file; `undefined` while loading. */
  support(path: string): LanguageSupport | null | undefined {
    return this.supports.get(path)
  }

  load(path: string): void {
    if (this.requested.has(path)) return
    this.requested.add(path)
    void lspHost()
      .readLines(path)
      .catch(() => null)
      .then(async (lines) => {
        this.loaded.set(path, lines)
        // The text shows right away; it gets color when the language parser loads.
        this.emit()
        if (!lines) return
        this.supports.set(path, await loadLanguage(path).catch(() => null))
        this.emit()
      })
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

interface Peek {
  pos: number
  /** End of the `pos` line, where the block goes. */
  at: number
  model: PeekModel
}

const openPeekEffect = StateEffect.define<{ pos: number; model: PeekModel }>()
const closePeekEffect = StateEffect.define<null>()

const cleanups = new WeakMap<HTMLElement, () => void>()

class PeekWidget extends WidgetType {
  constructor(readonly model: PeekModel) {
    super()
  }
  override eq(other: WidgetType): boolean {
    return other instanceof PeekWidget && other.model === this.model
  }
  override get estimatedHeight(): number {
    return PEEK_HEIGHT
  }
  // Keyboard, clicks and selection inside the peek belong to it, not to the editor.
  override ignoreEvent(): boolean {
    return true
  }
  override toDOM(view: EditorView): HTMLElement {
    const { dom, dispose } = buildPeek(view, this.model)
    cleanups.set(dom, dispose)
    return dom
  }
  override destroy(dom: HTMLElement): void {
    cleanups.get(dom)?.()
  }
}

const peekField = StateField.define<Peek | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(openPeekEffect)) {
        const pos = Math.min(effect.value.pos, tr.newDoc.length)
        return { pos, at: tr.newDoc.lineAt(pos).to, model: effect.value.model }
      }
      if (effect.is(closePeekEffect)) return null
    }
    if (!value || !tr.docChanged) return value
    const pos = tr.changes.mapPos(value.pos)
    return { ...value, pos, at: tr.newDoc.lineAt(pos).to }
  },
  provide: (field) =>
    EditorView.decorations.from(field, (peek): DecorationSet =>
      peek
        ? Decoration.set([
            Decoration.widget({ widget: new PeekWidget(peek.model), block: true, side: 1 }).range(peek.at)
          ])
        : Decoration.none
    )
})

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function actionButton(icon: string, label: string, run: () => void): HTMLButtonElement {
  const button = el('button', `lsp-peek-action codicon ${icon}`)
  button.type = 'button'
  button.title = label
  button.setAttribute('aria-label', label)
  button.addEventListener('click', run)
  return button
}

function closePeek(view: EditorView, refocus: boolean): void {
  view.dispatch({ effects: closePeekEffect.of(null) })
  if (refocus) view.focus()
}

function openSelected(view: EditorView, model: PeekModel): void {
  const location = model.current
  if (!location) return
  closePeek(view, false)
  lspHost().openLocation(location)
}

let peekSeq = 0

function buildPeek(view: EditorView, model: PeekModel): { dom: HTMLElement; dispose: () => void } {
  const m = t().lspNavigation.peek
  const id = `lsp-peek-${++peekSeq}`
  const dom = el('div', 'lsp-peek')
  dom.tabIndex = -1
  dom.setAttribute('role', 'region')
  dom.setAttribute('aria-label', m.region(model.title))

  const file = el('span', 'lsp-peek-file')
  const dir = el('span', 'lsp-peek-dir')
  const count = el('span', 'lsp-peek-count')
  const header = el('div', 'lsp-peek-header')
  header.append(
    file,
    dir,
    el('span', 'lsp-peek-title', model.title),
    count,
    actionButton('codicon-go-to-file', m.openInTab, () => openSelected(view, model)),
    actionButton('codicon-close', m.close, () => closePeek(view, true))
  )

  const preview = el('div', 'lsp-peek-preview')
  preview.addEventListener('dblclick', () => openSelected(view, model))
  const body = el('div', 'lsp-peek-body')
  body.append(preview)

  const items: { node: HTMLElement; text: HTMLElement; filled: boolean }[] = []
  let list: HTMLElement | null = null
  if (model.locations.length > 1) {
    list = el('div', 'lsp-peek-list')
    list.tabIndex = 0
    list.setAttribute('role', 'listbox')
    list.setAttribute('aria-label', m.list)
    model.locations.forEach((location, i) => {
      const node = el('div', 'lsp-peek-item')
      node.id = `${id}-${i}`
      node.setAttribute('role', 'option')
      const text = el('span', 'lsp-peek-item-text')
      node.append(
        el('span', 'lsp-peek-item-name', basename(location.path)),
        el('span', 'lsp-peek-item-line', String(location.range.start.line + 1)),
        text
      )
      node.addEventListener('click', () => model.select(i))
      node.addEventListener('dblclick', () => openSelected(view, model))
      items.push({ node, text, filled: false })
      list?.append(node)
    })
    body.append(list)
  }
  dom.append(header, body)

  dom.addEventListener('keydown', (event) => {
    const many = model.locations.length > 1
    if (event.key === 'Escape') closePeek(view, true)
    else if (event.key === 'Enter') openSelected(view, model)
    else if (event.key === 'ArrowDown' && many) model.select(model.index + 1)
    else if (event.key === 'ArrowUp' && many) model.select(model.index - 1)
    else return
    event.preventDefault()
    event.stopPropagation()
  })

  let shown = ''
  const render = (): void => {
    const location = model.current
    if (!location) return
    file.textContent = basename(location.path)
    dir.textContent = dirname(location.path)
    dir.title = location.path
    count.textContent = model.locations.length > 1 ? m.position(model.index + 1, model.locations.length) : ''
    items.forEach((item, i) => {
      const selected = i === model.index
      item.node.classList.toggle('selected', selected)
      item.node.setAttribute('aria-selected', String(selected))
      const target = model.locations[i]
      const lines = target ? model.lines(target.path) : undefined
      if (!item.filled && target && lines !== undefined) {
        item.filled = true
        item.text.textContent = lines?.[target.range.start.line]?.trim() ?? ''
      }
    })
    if (list) {
      list.setAttribute('aria-activedescendant', `${id}-${model.index}`)
      items[model.index]?.node.scrollIntoView({ block: 'nearest' })
    }
    const lines = model.lines(location.path)
    const support = model.support(location.path)
    const key = `${model.index}|${lines === undefined ? 'loading' : lines === null ? 'none' : support === undefined ? 'plain' : 'color'}`
    if (key === shown) return
    shown = key
    renderPreview(preview, lines, support ?? null, location)
  }
  const unsubscribe = model.subscribe(render)
  render()
  if (model.pendingFocus) {
    model.pendingFocus = false
    requestAnimationFrame(() => {
      if (!dom.isConnected) return
      ;(list ?? dom).focus({ preventScroll: true })
      dom.scrollIntoView({ block: 'nearest' })
    })
  }
  return { dom, dispose: unsubscribe }
}

function renderPreview(
  container: HTMLElement,
  lines: Lines | undefined,
  support: LanguageSupport | null,
  location: LspLocation
): void {
  const m = t().lspNavigation.peek
  if (!lines) {
    container.replaceChildren(el('div', 'lsp-peek-message', lines === null ? m.unreadable : m.loading))
    return
  }
  const { start, end } = location.range
  const { from, to } = previewWindow(lines.length, start.line, end.line)
  const text = lines.join('\n')
  let startOffset = 0
  for (let i = 0; i < from; i++) startOffset += (lines[i]?.length ?? 0) + 1
  const endOffset = startOffset + lines.slice(from, to).join('\n').length
  const spans =
    text.length > HIGHLIGHT_MAX_CHARS
      ? [{ text: text.slice(startOffset, endOffset), cls: null }]
      : highlightRange(text, support, startOffset, endOffset)
  const fragment = document.createDocumentFragment()
  let target: HTMLElement | null = null
  for (const [i, lineSpans] of splitSpanLines(spans).entries()) {
    const n = from + i
    const inRange = n >= start.line && n <= end.line
    const row = el('div', inRange ? 'lsp-peek-line target' : 'lsp-peek-line')
    const code = el('span', 'lsp-peek-code')
    const markFrom = n === start.line ? start.character : 0
    const markTo = n === end.line ? end.character : Number.MAX_SAFE_INTEGER
    for (const span of inRange ? markColumns(lineSpans, markFrom, markTo) : lineSpans) {
      const cls = [span.cls, 'mark' in span && span.mark ? 'lsp-peek-match' : null].filter(Boolean).join(' ')
      code.append(cls ? el('span', cls, span.text) : document.createTextNode(span.text))
    }
    row.append(el('span', 'lsp-peek-gutter', String(n + 1)), code)
    target ??= inRange ? row : null
    fragment.append(row)
  }
  container.replaceChildren(fragment)
  const first = target
  requestAnimationFrame(() => {
    if (first) container.scrollTop = Math.max(first.offsetTop - container.clientHeight / 3, 0)
  })
}

/** Opens the peek below the `request.pos` line (replaces an open one). */
export function openPeek(view: EditorView, request: PeekRequest): void {
  if (request.locations.length === 0) return
  const model = new PeekModel(request.title, request.locations)
  view.dispatch({
    effects: [openPeekEffect.of({ pos: request.pos, model }), EditorView.scrollIntoView(request.pos, { y: 'nearest' })]
  })
}

export function lspPeek(): Extension {
  return [
    peekField,
    // With focus on the editor, Esc closes the peek before any other use of the key.
    Prec.high(
      keymap.of([
        {
          key: 'Escape',
          run: (view) => {
            if (!view.state.field(peekField, false)) return false
            closePeek(view, false)
            return true
          }
        }
      ])
    )
  ]
}
