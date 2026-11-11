// Embedded text input for renaming (F2): a CodeMirror tooltip anchored on the symbol, with an already filled
// `<input>`. Enter confirms, Esc or leaving the field cancels. The change itself (WorkspaceEdit) belongs to
// `workspaceEditActions.ts`.
import { StateEffect, StateField, type Extension } from '@codemirror/state'
import { showTooltip, type EditorView, type Tooltip } from '@codemirror/view'
import { t } from '@shared/i18n'

interface RenameBox {
  tooltip: Tooltip
  resolve: (name: string | null) => void
}

const openBox = StateEffect.define<RenameBox>()
const closeBox = StateEffect.define<null>()

const renameField = StateField.define<RenameBox | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(openBox)) {
        value?.resolve(null)
        return effect.value
      }
      if (effect.is(closeBox)) {
        value?.resolve(null)
        return null
      }
    }
    // Editing the text invalidates the chosen symbol.
    if (value && tr.docChanged) {
      value.resolve(null)
      return null
    }
    return value
  },
  provide: (field) => showTooltip.from(field, (box) => box?.tooltip ?? null)
})

/**
 * Opens the rename field over `[from, to)` and waits: the new name on confirm, `null` on cancel (Esc, clicking outside,
 * editing the document).
 */
export function askRename(view: EditorView, from: number, initial: string): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (name: string | null): void => {
      if (settled) return
      settled = true
      resolve(name)
    }
    const tooltip: Tooltip = {
      pos: from,
      above: false,
      arrow: false,
      create: (editor) => {
        const dom = document.createElement('div')
        dom.className = 'lsp-rename'
        const input = document.createElement('input')
        input.className = 'lsp-rename-input'
        input.value = initial
        input.spellcheck = false
        input.setAttribute('aria-label', t().lsp.rename.inputLabel)
        dom.append(input)

        const close = (name: string | null): void => {
          finish(name)
          if (editor.state.field(renameField, false)?.tooltip === tooltip)
            editor.dispatch({ effects: closeBox.of(null) })
          editor.focus()
        }
        input.addEventListener('keydown', (e) => {
          // The editor must not see the field keys (arrows, Enter, shortcuts).
          e.stopPropagation()
          if (e.isComposing) return
          if (e.key === 'Enter') {
            e.preventDefault()
            close(input.value.trim() || null)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            close(null)
          }
        })
        input.addEventListener('blur', () => {
          if (settled) return
          finish(null)
          if (editor.state.field(renameField, false)?.tooltip === tooltip)
            editor.dispatch({ effects: closeBox.of(null) })
        })
        return {
          dom,
          mount: () => {
            const focus = (): void => {
              if (settled || !input.isConnected || document.activeElement === input) return
              input.focus({ preventScroll: true })
              input.select()
            }
            focus()
            // The editor may still hold focus while the tooltip is measured: tries again on the next frame.
            requestAnimationFrame(focus)
            setTimeout(focus, 60)
          }
        }
      }
    }
    view.dispatch({ effects: openBox.of({ tooltip, resolve: finish }) })
  })
}

export const lspRename: Extension = renameField

/** Closes the open field (used when hiding the tab). */
export const closeRenameBox = closeBox.of(null)
