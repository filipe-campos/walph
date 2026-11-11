// Per-hunk actions in the git diff (right side of the MergeView): buttons in each hunk gutter (stage/revert in the
// working
// tree, unstage in the stage) and the registry of open views, so the "… Selected Lines" commands read the selection.
import { RangeSet, RangeSetBuilder, type EditorState, type Extension, type Text } from '@codemirror/state'
import { GutterMarker, gutter, type EditorView } from '@codemirror/view'
import { getChunks, type Chunk } from '@codemirror/merge'
import type { LineRange } from '@shared/hunkSelection'
import { t } from '@shared/i18n'

export type DiffHunkAction = 'stage' | 'unstage' | 'revert'

const ACTIONS: Record<DiffHunkAction, { icon: string; label: () => string }> = {
  stage: { icon: 'codicon-add', label: () => t().git.hunks.stage },
  unstage: { icon: 'codicon-remove', label: () => t().git.hunks.unstage },
  revert: { icon: 'codicon-discard', label: () => t().git.hunks.revert }
}

const HUNK_ACTIONS = Object.keys(ACTIONS) as DiffHunkAction[]

/** Lines (right side) a MergeView hunk covers; a pure deletion sits on the line after the block. */
function chunkRange(doc: Text, chunk: Chunk): LineRange {
  const clamp = (pos: number): number => Math.min(Math.max(pos, 0), doc.length)
  const from = doc.lineAt(clamp(chunk.fromB)).number
  if (chunk.toB <= chunk.fromB) return { from, to: from }
  return { from, to: Math.max(from, doc.lineAt(clamp(chunk.toB - 1)).number) }
}

class HunkButtons extends GutterMarker {
  constructor(readonly actions: readonly DiffHunkAction[]) {
    super()
  }
  override eq(other: GutterMarker): boolean {
    return other instanceof HunkButtons && other.actions.join() === this.actions.join()
  }
  override toDOM(): Node {
    const box = document.createElement('span')
    box.className = 'cm-diff-hunk-actions'
    for (const action of this.actions) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `cm-diff-hunk-action codicon ${ACTIONS[action].icon}`
      button.dataset.hunkAction = action
      button.title = ACTIONS[action].label()
      button.setAttribute('aria-label', ACTIONS[action].label())
      box.append(button)
    }
    return box
  }
}

const markerCache = new WeakMap<readonly Chunk[], RangeSet<GutterMarker>>()

function markers(state: EditorState, actions: readonly DiffHunkAction[]): RangeSet<GutterMarker> {
  const chunks = getChunks(state)?.chunks
  if (!chunks) return RangeSet.of<GutterMarker>([])
  const cached = markerCache.get(chunks)
  if (cached) return cached
  const builder = new RangeSetBuilder<GutterMarker>()
  let last = -1
  for (const chunk of chunks) {
    const line = state.doc.line(chunkRange(state.doc, chunk).from)
    if (line.from <= last) continue
    last = line.from
    builder.add(line.from, line.from, new HunkButtons(actions))
  }
  const set = builder.finish()
  markerCache.set(chunks, set)
  return set
}

/** Gutter with the buttons of each hunk; `run` receives the action and the hunk lines on the right side. */
export function diffHunkGutter(
  actions: readonly DiffHunkAction[],
  run: (action: DiffHunkAction, range: LineRange) => void
): Extension {
  return gutter({
    class: 'cm-diff-hunk-gutter',
    markers: (view) => markers(view.state, actions),
    domEventHandlers: {
      mousedown(view, block, event) {
        const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-hunk-action]') : null
        const action = HUNK_ACTIONS.find((a) => a === target?.dataset.hunkAction)
        if (!action) return false
        const line = view.state.doc.lineAt(block.from).number
        const chunk = getChunks(view.state)?.chunks.find((c) => chunkRange(view.state.doc, c).from === line)
        if (!chunk) return false
        event.preventDefault()
        run(action, chunkRange(view.state.doc, chunk))
        return true
      }
    }
  })
}

interface DiffViews {
  original: EditorView
  modified: EditorView
}

const views = new Map<string, DiffViews>()

/** The tab diff mounted (or unmounted, with `null`). */
export function registerDiffViews(tabId: string, next: DiffViews | null): void {
  if (next) views.set(tabId, next)
  else views.delete(tabId)
}

export function diffViewsOf(tabId: string): DiffViews | undefined {
  return views.get(tabId)
}
