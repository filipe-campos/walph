// LSP hover: markdown documentation when the mouse rests on a symbol. Coexists with the diagnostics tooltip
// (`@codemirror/lint`), which is another `hoverTooltip`.
import type { Extension } from '@codemirror/state'
import { hoverTooltip } from '@codemirror/view'
import { lspRangeToOffsets, offsetToLspPosition } from '@shared/lspPosition'
import { isEmptyMarkup, renderMarkup } from '../../lib/lspMarkdown'
import { lspHost } from './lspHost'
import { lspDocPath } from './lspSync'

export function lspHover(tabId: string): Extension {
  return hoverTooltip(
    async (view, pos, side) => {
      const path = lspDocPath(tabId)
      if (!path || !lspHost().serverFor(path)?.ready) return null
      const doc = view.state.doc
      const line = doc.lineAt(pos)
      // The mouse past the end (or before the start) of the line is not over any text.
      if ((pos === line.to && side > 0) || (pos === line.from && side < 0)) return null

      let hover
      try {
        hover = await window.api.lsp.hover(path, offsetToLspPosition(doc, pos))
      } catch {
        // Hover is opportunistic: a server error does not become a notice on every mouse move.
        return null
      }
      // The document changed while the server responded: the position is no longer the same.
      if (!hover || isEmptyMarkup(hover.contents) || view.state.doc !== doc) return null

      const range = hover.range ? lspRangeToOffsets(doc, hover.range) : { from: pos, to: pos }
      return {
        pos: range.from,
        end: range.to,
        above: true,
        create: () => {
          const dom = document.createElement('div')
          dom.className = 'lsp-hover'
          dom.append(renderMarkup(hover.contents, path))
          return { dom }
        }
      }
    },
    { hideOnChange: true, hoverTime: 350 }
  )
}
