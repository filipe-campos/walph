// Signature help: tooltip above the cursor with the signature of the called function and the active parameter
// highlighted. Opens when typing a server trigger character (`(`, `,`), re-evaluates on every edit/move while open (the
// server returns nothing when leaving the call) and closes with Esc.
import { StateEffect, StateField, type Extension } from '@codemirror/state'
import {
  keymap,
  showTooltip,
  ViewPlugin,
  type EditorView,
  type Tooltip,
  type TooltipView,
  type ViewUpdate
} from '@codemirror/view'
import type { LspSignatureHelp } from '@shared/types'
import { offsetToLspPosition } from '@shared/lspPosition'
import { isEmptyMarkup, renderMarkup } from '../../lib/lspMarkdown'
import { activeSignature, splitSignature } from '../../lib/lspSignature'
import { lspHost, lspTabId } from './lspHost'
import { serverTriggers } from './lspTriggers'
import { lspDocPath } from './lspSync'

interface Shown {
  pos: number
  help: LspSignatureHelp
  tooltip: Tooltip
}

const setSignature = StateEffect.define<{ pos: number; help: LspSignatureHelp } | null>()

function span(className: string, text: string): HTMLElement {
  const el = document.createElement('span')
  if (className) el.className = className
  el.textContent = text
  return el
}

function renderHelp(dom: HTMLElement, help: LspSignatureHelp, path: string | undefined): void {
  dom.replaceChildren()
  const active = activeSignature(help)
  if (!active) return
  const { signature, parameter } = active
  const parts = splitSignature(signature, parameter)
  const label = document.createElement('div')
  label.className = 'lsp-signature-label'
  label.append(span('', parts.before), span('lsp-signature-active', parts.active), span('', parts.after))
  if (help.signatures.length > 1) {
    label.append(span('lsp-signature-count', `${help.activeSignature + 1}/${help.signatures.length}`))
  }
  dom.append(label)
  const doc = signature.parameters[parameter]?.documentation
  if (!isEmptyMarkup(doc)) dom.append(renderMarkup(doc!, path))
  if (!isEmptyMarkup(signature.documentation)) dom.append(renderMarkup(signature.documentation!, path))
}

// Stable `create`: CodeMirror reuses the tooltip between updates (only the content is redone in `update`).
function createSignatureView(view: EditorView): TooltipView {
  const dom = document.createElement('div')
  dom.className = 'lsp-signature'
  let shown: LspSignatureHelp | null = null
  const sync = (state: EditorView['state']): void => {
    const help = state.field(signatureField, false)?.help ?? null
    if (help === shown) return
    shown = help
    if (help) renderHelp(dom, help, lspDocPath(state.facet(lspTabId)))
  }
  sync(view.state)
  return { dom, update: (update) => sync(update.state) }
}

function makeTooltip(pos: number): Tooltip {
  return { pos, above: true, strictSide: true, arrow: false, create: createSignatureView }
}

const signatureField: StateField<Shown | null> = StateField.define<Shown | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setSignature)) {
        const next = effect.value
        return next ? { ...next, tooltip: makeTooltip(next.pos) } : null
      }
    }
    if (value && tr.docChanged) {
      const pos = tr.changes.mapPos(value.pos)
      return pos === value.pos ? value : { ...value, pos, tooltip: makeTooltip(pos) }
    }
    return value
  },
  provide: (field) => showTooltip.from(field, (value) => value?.tooltip ?? null)
})

const RETRIGGER_DELAY = 60

class SignaturePlugin {
  private timer: ReturnType<typeof setTimeout> | null = null
  private seq = 0
  private destroyed = false

  constructor(
    private view: EditorView,
    private tabId: string
  ) {}

  update(update: ViewUpdate): void {
    if (!update.docChanged && !update.selectionSet) return
    const typed = this.typedCharacter(update)
    if (typed) this.schedule(typed, 0)
    else if (update.state.field(signatureField, false)) this.schedule(undefined, RETRIGGER_DELAY)
  }

  /** First character inserted by the user typing (with `closeBrackets`, `(` goes in as `()`). */
  private typedCharacter(update: ViewUpdate): string | undefined {
    if (!update.docChanged) return undefined
    let typed: string | undefined
    for (const tr of update.transactions) {
      if (!tr.isUserEvent('input.type')) continue
      tr.changes.iterChanges((_fa, _ta, _fb, _tb, inserted) => {
        if (inserted.length > 0) typed = inserted.sliceString(0, 1)
      })
    }
    return typed
  }

  schedule(character: string | undefined, delay: number): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.run(character), delay)
  }

  async run(character: string | undefined): Promise<void> {
    this.timer = null
    const view = this.view
    const path = lspDocPath(this.tabId)
    if (!path || !lspHost().serverFor(path)?.ready) return
    const active = !!view.state.field(signatureField, false)

    let trigger = character
    if (character) {
      const server = lspHost().serverFor(path)
      if (!server) return
      const triggers = await serverTriggers(path, server.id)
      // The tab was switched (or the plugin destroyed) during the wait.
      if (this.destroyed || view.state.facet(lspTabId) !== this.tabId) return
      const isTrigger = triggers.signature.includes(character)
      const isRetrigger = active && triggers.signatureRetrigger.includes(character)
      // A plain character with the hint open is just an edit: re-evaluates without a "trigger".
      if (!isTrigger && !isRetrigger) {
        if (!active) return
        trigger = undefined
      }
    }

    const seq = ++this.seq
    const doc = view.state.doc
    const pos = view.state.selection.main.head
    let help: LspSignatureHelp | null
    try {
      help = await window.api.lsp.signatureHelp(path, offsetToLspPosition(doc, pos), trigger)
    } catch {
      return
    }
    if (this.destroyed || seq !== this.seq || this.view !== view || view.state.facet(lspTabId) !== this.tabId) return
    if (view.state.doc !== doc || view.state.selection.main.head !== pos) {
      // The user kept typing: asks again at the new position, if there is still a call.
      if (help && help.signatures.length > 0) this.schedule(undefined, 0)
      return
    }
    const hasHelp = !!help && help.signatures.length > 0
    if (!hasHelp && !active) return
    view.dispatch({ effects: setSignature.of(hasHelp ? { pos, help: help! } : null) })
  }

  destroy(): void {
    this.destroyed = true
    if (this.timer) clearTimeout(this.timer)
    this.seq++
  }
}

/** Closes the signature hint (used when hiding the tab, so it does not reappear stale on return). */
export const closeSignatureHelp = setSignature.of(null)

export function lspSignatureHelp(tabId: string): Extension {
  const plugin = ViewPlugin.define((view) => new SignaturePlugin(view, tabId), {})
  return [
    signatureField,
    plugin,
    keymap.of([
      {
        key: 'Escape',
        run: (view) => {
          if (!view.state.field(signatureField, false)) return false
          view.dispatch({ effects: closeSignatureHelp })
          return true
        }
      },
      {
        key: 'Mod-Shift-Space',
        run: (view) => {
          void view.plugin(plugin)?.run(undefined)
          return true
        }
      }
    ])
  ]
}
