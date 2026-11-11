// Vertical rulers (`editor.rulers` and the EditorConfig `max_line_length`): a CodeMirror layer above the text, at
// character columns from the start of the line. The color comes from CSS (`.cm-ruler`).
import type { Extension } from '@codemirror/state'
import { layer, RectangleMarker, type EditorView } from '@codemirror/view'

/** Unique columns, in increasing order. */
export function mergeRulers(...lists: ReadonlyArray<readonly number[]>): number[] {
  return [...new Set(lists.flat())].sort((a, b) => a - b)
}

function markers(view: EditorView, columns: readonly number[]): RectangleMarker[] {
  const scroller = view.scrollDOM.getBoundingClientRect()
  const content = view.contentDOM.getBoundingClientRect()
  const line = view.contentDOM.querySelector('.cm-line')
  const padding = line ? Number.parseFloat(getComputedStyle(line).paddingLeft) || 0 : 0
  // Layer coordinates: relative to the scrollable content (the layer scrolls with the text).
  const left = (content.left - scroller.left) / view.scaleX + view.scrollDOM.scrollLeft + padding
  const top = (content.top - scroller.top) / view.scaleY + view.scrollDOM.scrollTop
  const height = content.height / view.scaleY
  return columns.map(
    (column) => new RectangleMarker('cm-ruler', left + column * view.defaultCharacterWidth, top, 1, height)
  )
}

export function rulersExtension(columns: readonly number[]): Extension {
  if (columns.length === 0) return []
  return layer({
    above: true,
    class: 'cm-rulers',
    markers: (view) => markers(view, columns),
    update: (update) => update.geometryChanged || update.viewportChanged || update.docChanged
  })
}
