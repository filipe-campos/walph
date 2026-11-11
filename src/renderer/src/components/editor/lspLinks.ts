// ⌘-click (Ctrl-click outside macOS) on a symbol = Go to Definition. While the key is pressed the word
// under the mouse is underlined, as VS Code does.
import { RangeSetBuilder, StateEffect, StateField, type Extension } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'
import { lspHost } from './lspHost'
import { lspDocPath } from './lspSync'

const setLink = StateEffect.define<{ from: number; to: number } | null>()

const linkMark = Decoration.mark({ class: 'cm-lsp-link' })

const linkField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (!effect.is(setLink)) continue
      if (!effect.value) return Decoration.none
      const builder = new RangeSetBuilder<Decoration>()
      builder.add(effect.value.from, effect.value.to, linkMark)
      return builder.finish()
    }
    return tr.docChanged ? Decoration.none : value
  },
  provide: (field) => EditorView.decorations.from(field)
})

const modKey = (e: MouseEvent | KeyboardEvent): boolean => (window.api.platform === 'darwin' ? e.metaKey : e.ctrlKey)

export function lspLinks(tabId: string): Extension {
  const ready = (): boolean => {
    const path = lspDocPath(tabId)
    return !!path && !!lspHost().serverFor(path)?.ready
  }
  let lastMouse: { x: number; y: number } | null = null

  const update = (view: EditorView, x: number, y: number): void => {
    const pos = view.posAtCoords({ x, y })
    const word = pos === null ? null : view.state.wordAt(pos)
    const next = word && ready() ? { from: word.from, to: word.to } : null
    // Only dispatches when the underlined word changes (mousemove fires on every pixel).
    const marked = view.state.field(linkField).iter()
    const current = marked.value ? { from: marked.from, to: marked.to } : null
    if (current?.from === next?.from && current?.to === next?.to) return
    view.dispatch({ effects: setLink.of(next) })
  }
  const clear = (view: EditorView): void => {
    if (view.state.field(linkField, false)?.size) view.dispatch({ effects: setLink.of(null) })
  }

  return [
    linkField,
    EditorView.domEventHandlers({
      mousemove(event, view) {
        lastMouse = { x: event.clientX, y: event.clientY }
        if (modKey(event)) update(view, event.clientX, event.clientY)
        else clear(view)
      },
      mouseleave(_event, view) {
        lastMouse = null
        clear(view)
      },
      keydown(event, view) {
        if ((event.key === 'Meta' || event.key === 'Control') && modKey(event) && lastMouse)
          update(view, lastMouse.x, lastMouse.y)
      },
      keyup(event, view) {
        if (event.key === 'Meta' || event.key === 'Control') clear(view)
      },
      blur(_event, view) {
        clear(view)
      },
      mousedown(event, view) {
        if (event.button !== 0 || !modKey(event) || !ready()) return false
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos === null) return false
        event.preventDefault()
        // The cursor goes to the clicked symbol: it is the position "go back" restores.
        view.dispatch({ selection: { anchor: pos }, effects: setLink.of(null) })
        lspHost().goToDefinitionAt(pos)
        return true
      }
    })
  ]
}
