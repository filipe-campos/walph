// `editor.renderWhitespace`: dots on spaces and a dash on tabs, with the same modes as VS Code. Only the visible lines
// are decorated.
import { RangeSetBuilder, type EditorState, type Extension } from '@codemirror/state'
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view'
import type { Settings } from '@shared/settings'

export type RenderWhitespace = Settings['editor.renderWhitespace']

const RUN = /[ \t]+/g

/**
 * `[from, to)` ranges of the line to show. `boundary` hides only the single space between words; `selection` returns
 * all of them (the caller clips by the selection).
 */
export function whitespaceRanges(line: string, mode: Exclude<RenderWhitespace, 'none'>): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  for (const match of line.matchAll(RUN)) {
    const from = match.index
    const to = from + match[0].length
    if (mode === 'trailing' && to !== line.length) continue
    if (mode === 'boundary' && match[0] === ' ' && from > 0 && to < line.length) continue
    ranges.push([from, to])
  }
  return ranges
}

const spaceMark = Decoration.mark({ class: 'cm-ws-space' })
const tabMark = Decoration.mark({ class: 'cm-ws-tab' })

function addMarks(builder: RangeSetBuilder<Decoration>, text: string, base: number, from: number, to: number): void {
  let i = from
  while (i < to) {
    if (text.charAt(i) === '\t') {
      builder.add(base + i, base + i + 1, tabMark)
      i++
      continue
    }
    let j = i
    while (j < to && text.charAt(j) === ' ') j++
    builder.add(base + i, base + j, spaceMark)
    i = j
  }
}

function selectedRanges(state: EditorState): Array<{ from: number; to: number }> {
  return state.selection.ranges.filter((r) => !r.empty)
}

function build(view: EditorView, mode: Exclude<RenderWhitespace, 'none'>): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const { doc } = view.state
  const selection = mode === 'selection' ? selectedRanges(view.state) : null
  if (selection?.length === 0) return Decoration.none
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = doc.lineAt(pos)
      for (const [a, b] of whitespaceRanges(line.text, mode)) {
        if (!selection) {
          addMarks(builder, line.text, line.from, a, b)
          continue
        }
        for (const range of selection) {
          const start = Math.max(a, range.from - line.from)
          const end = Math.min(b, range.to - line.from)
          if (start < end) addMarks(builder, line.text, line.from, start, end)
        }
      }
      pos = line.to + 1
    }
  }
  return builder.finish()
}

export function renderWhitespaceExtension(setting: RenderWhitespace): Extension {
  if (setting === 'none') return []
  const mode = setting
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = build(view, mode)
      }
      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged || (mode === 'selection' && update.selectionSet))
          this.decorations = build(update.view, mode)
      }
    },
    { decorations: (plugin) => plugin.decorations }
  )
}
