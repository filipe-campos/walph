// Code actions: a lightbulb in the gutter when the server has fixes for the cursor and a quick fix menu (⌘. or clicking
// the lightbulb). Applying the chosen one (edit + command) belongs to the host, which uses the same applier as rename.
import { diagnosticCount } from '@codemirror/lint'
import { Compartment, Prec, StateEffect, StateField, EditorState, type Extension, type Text } from '@codemirror/state'
import {
  GutterMarker,
  gutter,
  keymap,
  showTooltip,
  ViewPlugin,
  type EditorView,
  type Tooltip,
  type TooltipView,
  type ViewUpdate
} from '@codemirror/view'
import { getLocale, t, type Locale } from '@shared/i18n'
import type { LspCodeAction } from '@shared/types'
import { hasAutoFix, sortCodeActions } from '../../lib/codeActions'
import { offsetToLspPosition } from '@shared/lspPosition'
import { lspHost, lspTabId } from './lspHost'
import { lspDocPath } from './lspSync'

// ---------- Lightbulb ----------

interface Bulb {
  /** Cursor the actions were computed for. */
  pos: number
  actions: LspCodeAction[]
  /** Tab documents when asking for the actions: the applier refuses the edit if any changed. */
  snapshot: Map<string, Text>
}

const setBulb = StateEffect.define<Bulb | null>()

const bulbField = StateField.define<Bulb | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setBulb)) return effect.value
    // The cursor or the text changed: the actions held for another place until the next request.
    return value && (tr.docChanged || tr.selection) ? null : value
  }
})

// Read at draw time: `window.api` only exists after the preload (and not in tests).
const shortcut = (): string => (window.api.platform === 'darwin' ? '⌘.' : 'Ctrl+.')

class BulbMarker extends GutterMarker {
  constructor(
    private autofix: boolean,
    private locale: Locale = getLocale()
  ) {
    super()
  }
  override eq(other: GutterMarker): boolean {
    return other instanceof BulbMarker && other.autofix === this.autofix && other.locale === this.locale
  }
  override toDOM(): Node {
    const el = document.createElement('i')
    el.className = `codicon ${this.autofix ? 'codicon-lightbulb-autofix' : 'codicon-lightbulb'} lsp-lightbulb`
    el.title = t().lsp.codeActions.show(shortcut())
    return el
  }
}

const lightbulbGutter: Extension = gutter({
  class: 'cm-lightbulb-gutter',
  lineMarker(view, line) {
    const bulb = view.state.field(bulbField)
    if (!bulb || view.state.doc.lineAt(bulb.pos).from !== line.from) return null
    return new BulbMarker(hasAutoFix(bulb.actions))
  },
  lineMarkerChange: (update) =>
    update.startState.field(bulbField) !== update.state.field(bulbField) ||
    update.startState.facet(EditorState.phrases) !== update.state.facet(EditorState.phrases),
  initialSpacer: () => new BulbMarker(false),
  domEventHandlers: {
    mousedown(view, line, event) {
      // Only the lightbulb line responds (the gutter has one element per visible line).
      const bulb = view.state.field(bulbField)
      if (!bulb || view.state.doc.lineAt(bulb.pos).from !== view.state.doc.lineAt(line.from).from) return false
      // Without taking focus from the editor: the menu responds to its keyboard.
      event.preventDefault()
      void openQuickFix(view, view.state.facet(lspTabId))
      return true
    }
  }
})

const rangeOf = (doc: Text, from: number, to: number) => ({
  start: offsetToLspPosition(doc, from),
  end: offsetToLspPosition(doc, to)
})

class BulbPlugin {
  private timer: ReturnType<typeof setTimeout> | null = null
  private seq = 0

  constructor(
    private view: EditorView,
    private tabId: string
  ) {
    this.schedule()
  }

  update(update: ViewUpdate): void {
    // New diagnostics also change the available fixes.
    const diagnostics = diagnosticCount(update.state) !== diagnosticCount(update.startState)
    // `reconfigured`: the server became ready (gutter compartment) and the lightbulb needs to be computed.
    const reconfigured = update.transactions.some((t) => t.reconfigured)
    if (update.docChanged || update.selectionSet || diagnostics || reconfigured) this.schedule()
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.run(), 300)
  }

  private async run(): Promise<void> {
    this.timer = null
    const view = this.view
    const path = lspDocPath(this.tabId)
    if (!path || !lspHost().serverFor(path)?.ready) return
    const doc = view.state.doc
    const { from, to, head } = view.state.selection.main
    const seq = ++this.seq
    const snapshot = lspHost().snapshotDocs()
    let actions: LspCodeAction[]
    try {
      actions = await window.api.lsp.codeActions(path, rangeOf(doc, from, to))
    } catch {
      return
    }
    if (
      seq !== this.seq ||
      view.state.facet(lspTabId) !== this.tabId ||
      view.state.doc !== doc ||
      view.state.selection.main.head !== head
    )
      return
    if (actions.length === 0 && !view.state.field(bulbField)) return
    view.dispatch({ effects: setBulb.of(actions.length > 0 ? { pos: head, actions, snapshot } : null) })
  }

  destroy(): void {
    if (this.timer) clearTimeout(this.timer)
    this.seq++
  }
}

// ---------- Menu ----------

interface Menu {
  pos: number
  doc: Text
  snapshot: Map<string, Text>
  path: string
  actions: LspCodeAction[]
  index: number
  tooltip: Tooltip
}

const openMenu = StateEffect.define<{
  pos: number
  doc: Text
  snapshot: Map<string, Text>
  path: string
  actions: LspCodeAction[]
}>()
const closeMenu = StateEffect.define<null>()
const moveMenu = StateEffect.define<number>()

const enabledIndex = (actions: LspCodeAction[], from: number, step: number): number => {
  const n = actions.length
  for (let i = 1; i <= n; i++) {
    const index = (((from + step * i) % n) + n) % n
    if (!actions[index]?.disabled) return index
  }
  return from
}

const menuField: StateField<Menu | null> = StateField.define<Menu | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(openMenu)) {
        const { pos, doc, snapshot, path, actions } = effect.value
        const first = actions.findIndex((a) => !a.disabled)
        return {
          pos,
          doc,
          snapshot,
          path,
          actions,
          index: Math.max(first, 0),
          tooltip: { pos, above: false, arrow: false, create: createMenuView }
        }
      }
      if (effect.is(closeMenu)) return null
      if (effect.is(moveMenu) && value)
        return { ...value, index: enabledIndex(value.actions, value.index, effect.value) }
    }
    return value && (tr.docChanged || tr.selection) ? null : value
  },
  provide: (field) => showTooltip.from(field, (menu) => menu?.tooltip ?? null)
})

function choose(view: EditorView, action: LspCodeAction): void {
  const menu = view.state.field(menuField)
  if (!menu || action.disabled) return
  view.dispatch({ effects: closeMenu.of(null) })
  view.focus()
  void lspHost().applyCodeAction(menu.path, action, menu.doc, menu.snapshot)
}

function renderMenu(dom: HTMLElement, view: EditorView, menu: Menu): void {
  dom.replaceChildren(
    ...menu.actions.map((action, i) => {
      const item = document.createElement('div')
      item.className = `lsp-menu-item${i === menu.index ? ' selected' : ''}${action.disabled ? ' disabled' : ''}`
      item.setAttribute('role', 'option')
      item.setAttribute('aria-selected', String(i === menu.index))
      if (action.disabled) {
        item.setAttribute('aria-disabled', 'true')
        item.title = action.disabled
        item.id = `lsp-menu-item-${i}`
        item.setAttribute('aria-describedby', `lsp-menu-reason-${i}`)
      }
      if (action.isPreferred && !action.disabled) {
        const star = document.createElement('i')
        star.className = 'codicon codicon-lightbulb-autofix'
        item.append(star)
      }
      const label = document.createElement('span')
      label.className = 'lsp-menu-label'
      label.textContent = action.title
      item.append(label)
      if (action.disabled) {
        const reason = document.createElement('span')
        reason.className = 'lsp-menu-reason'
        reason.id = `lsp-menu-reason-${i}`
        reason.textContent = action.disabled
        item.append(reason)
      }
      // mousedown must not take focus from the editor (the menu keyboard depends on it).
      item.addEventListener('mousedown', (e) => e.preventDefault())
      item.addEventListener('click', () => choose(view, action))
      return item
    })
  )
}

function createMenuView(view: EditorView): TooltipView {
  const dom = document.createElement('div')
  dom.className = 'lsp-menu'
  dom.setAttribute('role', 'listbox')
  dom.setAttribute('aria-label', t().lsp.codeActions.menuLabel)
  let shown: Menu | null = null
  const sync = (state: EditorState): void => {
    const menu = state.field(menuField, false) ?? null
    if (!menu || (shown && shown.actions === menu.actions && shown.index === menu.index)) return
    shown = menu
    renderMenu(dom, view, menu)
    dom.querySelector('.selected')?.scrollIntoView({ block: 'nearest' })
  }
  sync(view.state)
  return { dom, update: (update) => sync(update.state) }
}

/** Opens the quick fix menu at the cursor (⌘. / clicking the lightbulb). */
export async function openQuickFix(view: EditorView, tabId: string): Promise<void> {
  const host = lspHost()
  const path = lspDocPath(tabId)
  if (!path || !host.serverFor(path)?.ready) {
    host.notify(t().lsp.errors.noActiveServer, 'info')
    return
  }
  const doc = view.state.doc
  const { from, to, head } = view.state.selection.main
  const bulb = view.state.field(bulbField, false)
  let actions = bulb && bulb.pos === head ? bulb.actions : null
  let snapshot = bulb && bulb.pos === head ? bulb.snapshot : host.snapshotDocs()
  if (!actions) {
    snapshot = host.snapshotDocs()
    try {
      actions = await window.api.lsp.codeActions(path, rangeOf(doc, from, to))
    } catch (err) {
      host.notifyError(err)
      return
    }
    // Moved the cursor or edited while waiting: the menu would show in the wrong place.
    // The facet checks the tab: empty documents share `Text.empty`, so comparing `doc` is not enough.
    if (view.state.facet(lspTabId) !== tabId || view.state.doc !== doc || view.state.selection.main.head !== head)
      return
  }
  if (actions.length === 0) {
    host.notify(t().lsp.codeActions.none, 'info')
    return
  }
  // All disabled: a menu with nothing to pick would only trap the keyboard; notifies the reason of the first.
  const firstReason = actions.every((a) => a.disabled) ? actions[0]?.disabled : null
  if (firstReason) {
    host.notify(firstReason, 'info')
    return
  }
  view.dispatch({ effects: openMenu.of({ pos: head, doc, snapshot, path, actions: sortCodeActions(actions) }) })
}

const whenOpen =
  (run: (view: EditorView, menu: Menu) => void) =>
  (view: EditorView): boolean => {
    const menu = view.state.field(menuField, false)
    if (!menu) return false
    run(view, menu)
    return true
  }

const menuKeymap = keymap.of([
  { key: 'ArrowDown', run: whenOpen((view) => view.dispatch({ effects: moveMenu.of(1) })) },
  { key: 'ArrowUp', run: whenOpen((view) => view.dispatch({ effects: moveMenu.of(-1) })) },
  {
    key: 'Enter',
    run: whenOpen((view, menu) => {
      const action = menu.actions[menu.index]
      if (action) choose(view, action)
    })
  },
  { key: 'Escape', run: whenOpen((view) => view.dispatch({ effects: closeMenu.of(null) })) }
])

/** Closes the open menu (used when hiding the tab). */
export const closeQuickFixMenu = closeMenu.of(null)

/**
 * The lightbulb gutter reserves ~18px: it only enters tabs whose file has a ready server (`documentConfig.ts`
 * reconfigures
 * the compartment when the server state changes). Files without a server do not lose space for nothing.
 */
export const lightbulbSlot = new Compartment()
export const lightbulbOn: Extension = lightbulbGutter

export function lspCodeActions(tabId: string): Extension {
  return [
    bulbField,
    menuField,
    lightbulbSlot.of([]),
    ViewPlugin.define((view) => new BulbPlugin(view, tabId)),
    // Above the editor keymap and autocomplete: with the menu open the arrows and Enter belong to it.
    Prec.highest(menuKeymap)
  ]
}
