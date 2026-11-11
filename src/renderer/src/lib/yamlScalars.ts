import { syntaxTree } from '@codemirror/language'
import { Prec, RangeSetBuilder, type Extension } from '@codemirror/state'
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view'

const ATOM = /^(true|false|yes|no|on|off|null|~)$/i
const NUMBER = /^[-+]?(\d[\d_]*(\.\d*)?|\.\d+)([eE][-+]?\d+)?$|^0x[\da-fA-F]+$|^0o[0-7]+$|^[-+]?\.(inf|nan)$/i

const atomMark = Decoration.mark({ class: 'cm-yaml-atom' })
const numberMark = Decoration.mark({ class: 'cm-yaml-number' })

/** YAML scalar value class: Lezer delivers all unquoted text as `Literal`, without separating number and boolean. */
export function scalarKind(text: string): 'atom' | 'number' | null {
  const t = text.trim()
  if (ATOM.test(t)) return 'atom'
  return NUMBER.test(t) ? 'number' : null
}

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const tree = syntaxTree(view.state)
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'Literal') return
        if (node.node.parent?.name === 'Key') return false
        const kind = scalarKind(view.state.sliceDoc(node.from, node.to))
        if (kind) builder.add(node.from, node.to, kind === 'atom' ? atomMark : numberMark)
        return false
      }
    })
  }
  return builder.finish()
}

/** Distinct colors for numbers and `true`/`false`/`null` in YAML values (the keys are left out). */
export const yamlScalars: Extension = Prec.high(
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = build(view)
      }
      update(u: ViewUpdate): void {
        if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state))
          this.decorations = build(u.view)
      }
    },
    { decorations: (v) => v.decorations }
  )
)
