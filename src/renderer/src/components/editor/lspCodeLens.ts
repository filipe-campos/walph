// Code lenses: clickable lines above the declarations (reference count, implementations…). The list is requested with
// a delay after each edit and discarded if the document changed during the request; unresolved lenses are resolved
// only when they enter the visible area. Locations of `editor.action.showReferences` open the peek; the other commands
// go to the server.
import { historyField } from '@codemirror/commands'
import { Compartment, StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import type { LspCodeLens, LspCodeLensList } from '@shared/types'
import { groupByLine, indentColumns } from '../../lib/codeLens'
import { lspHost, lspTabId } from './lspHost'
import { lspDocPath } from './lspSync'
import { openPeek } from './lspPeek'

const FETCH_DELAY_MS = 600
const RESOLVE_DELAY_MS = 150

interface PlacedLens {
  /** Index in the server list (for `resolveCodeLens`). */
  index: number
  /** Start of the lens line, following the edits until the next list. */
  pos: number
  lens: LspCodeLens
}

interface LensList {
  resultId: number
  resolvable: boolean
  lenses: PlacedLens[]
}

const setLenses = StateEffect.define<LensList | null>()
const resolvedLens = StateEffect.define<{ resultId: number; index: number; lens: LspCodeLens }>()

class LensWidget extends WidgetType {
  constructor(
    readonly items: readonly PlacedLens[],
    readonly indent: number,
    private readonly key: string
  ) {
    super()
  }
  override eq(other: WidgetType): boolean {
    return other instanceof LensWidget && other.key === this.key && other.indent === this.indent
  }
  override ignoreEvent(): boolean {
    return true
  }
  override toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement('div')
    dom.className = 'cm-code-lens'
    dom.style.paddingLeft = `${this.indent}ch`
    let first = true
    for (const placed of this.items) {
      const command = placed.lens.command
      if (!command) continue
      if (!first)
        dom.append(Object.assign(document.createElement('span'), { className: 'cm-code-lens-sep', textContent: '|' }))
      first = false
      const item = document.createElement('span')
      item.className = 'cm-code-lens-item'
      item.textContent = command.title
      if (command.command || command.locations?.length) {
        item.classList.add('action')
        item.setAttribute('role', 'button')
        // Without taking focus or moving the editor cursor.
        item.addEventListener('mousedown', (e) => e.preventDefault())
        item.addEventListener('click', () => runLens(view, placed))
      }
      dom.append(item)
    }
    // Lenses still without a title reserve the line: resolving does not push the code.
    if (first) dom.textContent = ' '
    return dom
  }
}

function lensDecorations(state: EditorState, list: LensList | null): DecorationSet {
  if (!list || list.lenses.length === 0) return Decoration.none
  const { doc } = state
  const ranges = groupByLine(list.lenses, (l) => doc.lineAt(l.pos).number).map(({ line, items }) => {
    const { from, text } = doc.line(line)
    const key = items.map((l) => `${l.index}:${l.lens.command?.title ?? ''}`).join('|')
    const widget = new LensWidget(items, indentColumns(text, state.tabSize), key)
    return Decoration.widget({ widget, block: true, side: -1 }).range(from)
  })
  return Decoration.set(ranges)
}

const lensField = StateField.define<LensList | null>({
  create: () => null,
  update(value, tr) {
    let next = value
    for (const effect of tr.effects) {
      if (effect.is(setLenses)) next = effect.value
      else if (effect.is(resolvedLens) && next?.resultId === effect.value.resultId) {
        const { index, lens } = effect.value
        next = { ...next, lenses: next.lenses.map((l) => (l.index === index ? { ...l, lens } : l)) }
      }
    }
    if (next && tr.docChanged) {
      const { changes } = tr
      next = { ...next, lenses: next.lenses.map((l) => ({ ...l, pos: changes.mapPos(l.pos, -1) })) }
    }
    return next
  },
  provide: (field) => EditorView.decorations.compute([field], (state) => lensDecorations(state, state.field(field)))
})

function runLens(view: EditorView, placed: PlacedLens): void {
  const command = placed.lens.command
  if (!command) return
  if (command.locations) {
    openPeek(view, { pos: placed.pos, title: command.title, locations: command.locations })
    return
  }
  const path = lspDocPath(view.state.facet(lspTabId))
  if (command.command && path) lspHost().runLensCommand(path, command.command)
}

function place(state: EditorState, list: LspCodeLensList): LensList {
  const { doc } = state
  const lenses = list.lenses.map((lens, index) => ({
    index,
    lens,
    pos: doc.line(Math.min(lens.range.start.line + 1, doc.lines)).from
  }))
  return { resultId: list.resultId, resolvable: list.resolvable, lenses }
}

// The mirror copy (tab shown in both groups) has no history: only the canonical one asks for lenses, otherwise both
// would compete for the last list main keeps per document.
const isMirror = (state: EditorState): boolean => state.field(historyField, false) === undefined

const plugins = new Set<LensPlugin>()

class LensPlugin {
  private fetchTimer: ReturnType<typeof setTimeout> | null = null
  private resolveTimer: ReturnType<typeof setTimeout> | null = null
  private seq = 0
  private alive = true
  /** Lenses of the current list already sent to `codeLens/resolve` (one attempt each). */
  private attempted = new Set<number>()

  constructor(
    private readonly view: EditorView,
    private readonly tabId: string
  ) {
    plugins.add(this)
    this.schedule(0)
  }

  update(update: ViewUpdate): void {
    if (update.docChanged) this.schedule(FETCH_DELAY_MS)
    else if (update.viewportChanged) this.scheduleResolve()
  }

  schedule(delay: number): void {
    if (this.fetchTimer) clearTimeout(this.fetchTimer)
    this.fetchTimer = setTimeout(() => void this.fetch(), delay)
  }

  private scheduleResolve(): void {
    if (this.resolveTimer) clearTimeout(this.resolveTimer)
    this.resolveTimer = setTimeout(() => this.resolveVisible(), RESOLVE_DELAY_MS)
  }

  private async fetch(): Promise<void> {
    this.fetchTimer = null
    const { view, tabId } = this
    if (isMirror(view.state)) return
    const path = lspDocPath(tabId)
    if (!path || !lspHost().serverFor(path)?.ready) return
    const doc = view.state.doc
    const seq = ++this.seq
    let list: LspCodeLensList | null
    try {
      list = await window.api.lsp.codeLens(path)
    } catch {
      return
    }
    // The text changed during the request: the response lines would be the old ones; the next request is already
    // scheduled.
    if (!this.alive || seq !== this.seq || view.state.doc !== doc || view.state.facet(lspTabId) !== tabId) return
    this.attempted = new Set()
    view.dispatch({ effects: setLenses.of(list ? place(view.state, list) : null) })
    this.resolveVisible()
  }

  private resolveVisible(): void {
    this.resolveTimer = null
    const list = this.view.state.field(lensField, false)
    const path = lspDocPath(this.tabId)
    if (!list?.resolvable || !path) return
    const { from, to } = this.view.viewport
    for (const placed of list.lenses) {
      if (placed.lens.command || this.attempted.has(placed.index) || placed.pos < from || placed.pos > to) continue
      this.attempted.add(placed.index)
      void this.resolve(path, list.resultId, placed.index)
    }
  }

  private async resolve(path: string, resultId: number, index: number): Promise<void> {
    let lens: LspCodeLens | null
    try {
      lens = await window.api.lsp.resolveCodeLens(path, resultId, index)
    } catch {
      return
    }
    if (!lens || !this.alive || this.view.state.field(lensField, false)?.resultId !== resultId) return
    this.view.dispatch({ effects: resolvedLens.of({ resultId, index, lens }) })
  }

  destroy(): void {
    this.alive = false
    plugins.delete(this)
    if (this.fetchTimer) clearTimeout(this.fetchTimer)
    if (this.resolveTimer) clearTimeout(this.resolveTimer)
  }
}

/** The server asked (`workspace/codeLens/refresh`): every visible tab asks for the lenses again. */
export function refreshCodeLenses(): void {
  for (const plugin of plugins) plugin.schedule(0)
}

/**
 * Only in tabs with a ready server and `editor.codeLens` on (`documentConfig.ts` reconfigures the compartment); turning
 * it off removes the field and the plugin, and the lenses disappear.
 */
export const codeLensSlot = new Compartment()
export const codeLensOn: Extension = [
  lensField,
  ViewPlugin.define((view) => new LensPlugin(view, view.state.facet(lspTabId)))
]

export function lspCodeLens(): Extension {
  return codeLensSlot.of([])
}
