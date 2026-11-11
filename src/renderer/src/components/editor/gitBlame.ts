// Blame in the editor: the `git blame` result (delivered by `setBlame`, with the text that was annotated) becomes a
// mark
// per line. While typing the marks only follow the changes; debounced, a diff between the annotated text and the
// current
// one decides which lines still belong to the commit and which became "uncommitted". On top of that: the annotation at
// the end of the cursor line (with the commit hover), the whole-file blame gutter and the status bar query.
import {
  Compartment,
  RangeSet,
  RangeSetBuilder,
  RangeValue,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Text
} from '@codemirror/state'
import {
  Decoration,
  GutterMarker,
  ViewPlugin,
  WidgetType,
  gutter,
  showTooltip,
  type DecorationSet,
  type EditorView,
  type Tooltip,
  type ViewUpdate
} from '@codemirror/view'
import { diffLines } from '@shared/lineDiff'
import { t } from '@shared/i18n'
import type { GitBlame, GitBlameCommit } from '@shared/types'
import { MAX_GUTTER_LINES } from '../../lib/gitGutter'
import { formatDate, relativeTime } from '../../lib/relativeTime'

export interface BlameHost {
  /** Full commit message (`null` if it could not be read). */
  commitMessage(hash: string): Promise<string | null>
  /** Shows the commit in the Source Control History. */
  showCommit(hash: string): void
}

let host: BlameHost = { commitMessage: () => Promise.resolve(null), showCommit: () => {} }

export function bindBlameHost(next: BlameHost): void {
  host = next
}

/** Blame result and the lines of the text that was annotated; `null` clears it. */
export interface BlameInput {
  data: GitBlame
  base: string[]
}

export const setBlame = StateEffect.define<BlameInput | null>()
export const setBlameGutter = StateEffect.define<boolean>()
const recompute = StateEffect.define<null>()

const DEBOUNCE_MS = 300

class BlameMark extends RangeValue {
  override startSide = 1
  override point = true
  constructor(readonly commit: number) {
    super()
  }
  override eq(other: RangeValue): boolean {
    return other instanceof BlameMark && other.commit === this.commit
  }
}

interface BlameState {
  input: BlameInput | null
  /** Index in `input.data.commits` at the start of each line that is still equal to the annotated text. */
  marks: RangeSet<BlameMark>
  fresh: boolean
  gutter: boolean
}

function build(input: BlameInput | null, doc: Text): RangeSet<BlameMark> {
  if (!input || input.base.length > MAX_GUTTER_LINES || doc.lines > MAX_GUTTER_LINES) return RangeSet.of<BlameMark>([])
  const builder = new RangeSetBuilder<BlameMark>()
  const { lines } = input.data
  const add = (oldIndex: number, newIndex: number): void => {
    const commit = lines[oldIndex] ?? -1
    if (commit >= 0) {
      const from = doc.line(newIndex + 1).from
      builder.add(from, from, new BlameMark(commit))
    }
  }
  let oldPos = 0
  let newPos = 0
  for (const h of diffLines(input.base, doc.toJSON())) {
    for (; oldPos < h.oldStart; oldPos++, newPos++) add(oldPos, newPos)
    oldPos = h.oldStart + h.oldCount
    newPos = h.newStart + h.newCount
  }
  for (; oldPos < input.base.length && newPos < doc.lines; oldPos++, newPos++) add(oldPos, newPos)
  return builder.finish()
}

const blameField = StateField.define<BlameState>({
  create: () => ({ input: null, marks: RangeSet.of<BlameMark>([]), fresh: true, gutter: false }),
  update(value, tr) {
    let { input, gutter: showGutter } = value
    let recalc = false
    for (const effect of tr.effects) {
      if (effect.is(setBlame)) {
        input = effect.value
        recalc = true
      } else if (effect.is(recompute)) recalc = true
      else if (effect.is(setBlameGutter)) showGutter = effect.value
    }
    if (recalc) return { input, marks: build(input, tr.newDoc), fresh: true, gutter: showGutter }
    if (tr.docChanged) return { input, marks: value.marks.map(tr.changes), fresh: false, gutter: showGutter }
    return showGutter === value.gutter ? value : { ...value, gutter: showGutter }
  }
})

const scheduler = ViewPlugin.fromClass(
  class {
    timer: ReturnType<typeof setTimeout> | null = null
    constructor(readonly view: EditorView) {}
    update(update: ViewUpdate): void {
      const { input, fresh } = update.state.field(blameField)
      if (!input || fresh || !update.docChanged) return
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        this.timer = null
        this.view.dispatch({ effects: recompute.of(null) })
      }, DEBOUNCE_MS)
    }
    destroy(): void {
      if (this.timer) clearTimeout(this.timer)
    }
  }
)

/** Blame of a line: the commit, `'uncommitted'` (new or changed) or `null` (no blame loaded). */
export type LineBlame = GitBlameCommit | 'uncommitted' | null

export function blameAtLine(state: EditorState, lineNumber: number): LineBlame {
  const value = state.field(blameField, false)
  if (!value?.input || lineNumber < 1 || lineNumber > state.doc.lines) return null
  const from = state.doc.line(lineNumber).from
  let commit: GitBlameCommit | undefined
  value.marks.between(from, from, (start, _to, mark) => {
    if (start !== from) return
    commit = value.input?.data.commits[mark.commit]
    return false
  })
  return !commit || commit.uncommitted ? 'uncommitted' : commit
}

/**
 * Effects that reproduce the blame of one state in another (the mirror copy of a tab is born with the canonical one's).
 */
export function blameEffectsOf(state: EditorState): StateEffect<unknown>[] {
  const value = state.field(blameField, false)
  if (!value?.input) return []
  return [setBlame.of(value.input), ...(value.gutter ? [setBlameGutter.of(true)] : [])]
}

export function blameGutterOn(state: EditorState): boolean {
  return state.field(blameField, false)?.gutter ?? false
}

export function hasBlame(state: EditorState): boolean {
  return !!state.field(blameField, false)?.input
}

// ----- Annotation at the end of the cursor line -----

const openHover = StateEffect.define<{ pos: number; commit: GitBlameCommit } | null>()

class InlineBlame extends WidgetType {
  constructor(
    readonly text: string,
    readonly commit: GitBlameCommit | null,
    readonly pos: number
  ) {
    super()
  }
  override eq(other: InlineBlame): boolean {
    return other.text === this.text && other.pos === this.pos && other.commit?.hash === this.commit?.hash
  }
  toDOM(view: EditorView): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-blame-inline'
    span.textContent = this.text
    const commit = this.commit
    if (commit) {
      span.addEventListener('mouseenter', () => hoverTimers.open(view, () => openHover.of({ pos: this.pos, commit })))
      span.addEventListener('mouseleave', () => hoverTimers.close(view))
    }
    return span
  }
  override ignoreEvent(): boolean {
    return true
  }
}

const HOVER_OPEN_MS = 350
const HOVER_CLOSE_MS = 250

/** Opens/closes the hover with a delay, to give the mouse time to go from the annotation to the tooltip. */
const hoverTimers = (() => {
  let timer: ReturnType<typeof setTimeout> | null = null
  const clear = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  return {
    open(view: EditorView, effect: () => StateEffect<unknown>): void {
      clear()
      timer = setTimeout(() => view.dispatch({ effects: effect() }), HOVER_OPEN_MS)
    },
    close(view: EditorView): void {
      clear()
      timer = setTimeout(() => {
        if (view.state.field(hoverField, false)) view.dispatch({ effects: openHover.of(null) })
      }, HOVER_CLOSE_MS)
    },
    cancel: clear
  }
})()

function inlineText(blame: LineBlame): string | null {
  if (!blame) return null
  const m = t().git.blame
  if (blame === 'uncommitted') return m.uncommitted
  return m.inline(blame.author, relativeTime(blame.date), blame.summary)
}

function inlineDecorations(state: EditorState): DecorationSet {
  const line = state.doc.lineAt(state.selection.main.head)
  const blame = blameAtLine(state, line.number)
  const text = inlineText(blame)
  if (!text) return Decoration.none
  const widget = new InlineBlame(text, blame === 'uncommitted' ? null : blame, line.to)
  return Decoration.set([Decoration.widget({ widget, side: 1 }).range(line.to)])
}

const inlinePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = inlineDecorations(view.state)
    }
    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.startState.field(blameField) !== update.state.field(blameField)
      ) {
        this.decorations = inlineDecorations(update.state)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
)

function hoverDom(view: EditorView, commit: GitBlameCommit): HTMLElement {
  const m = t().git.blame
  const dom = document.createElement('div')
  dom.className = 'lsp-hover blame-hover'
  dom.setAttribute('role', 'dialog')
  dom.setAttribute('aria-label', m.details)
  const head = document.createElement('div')
  head.className = 'blame-hover-head'
  const author = document.createElement('strong')
  author.textContent = commit.author
  const meta = document.createElement('span')
  meta.className = 'blame-hover-meta'
  meta.textContent = `${commit.hash.slice(0, 7)} · ${formatDate(commit.date)}`
  head.append(author, meta)
  const message = document.createElement('div')
  message.className = 'blame-hover-message'
  message.textContent = commit.summary
  void host.commitMessage(commit.hash).then((full) => {
    if (full?.trim()) message.textContent = full.trim()
  })
  const action = document.createElement('button')
  action.type = 'button'
  action.className = 'blame-hover-action'
  action.textContent = m.showInHistory
  action.addEventListener('click', () => {
    view.dispatch({ effects: openHover.of(null) })
    host.showCommit(commit.hash)
  })
  dom.append(head, message, action)
  dom.addEventListener('mouseenter', () => hoverTimers.cancel())
  dom.addEventListener('mouseleave', () => hoverTimers.close(view))
  return dom
}

const hoverField = StateField.define<Tooltip | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(openHover)) {
        const target = effect.value
        if (!target) return null
        return {
          pos: target.pos,
          above: true,
          arrow: false,
          create: (view) => ({ dom: hoverDom(view, target.commit) })
        }
      }
    }
    return value && (tr.docChanged || tr.selection) ? null : value
  },
  provide: (field) => showTooltip.from(field)
})

/** Turns the end-of-line annotation (`git.blame.inline`) on/off, in every copy of the state. */
export const blameInlineSlot = new Compartment()

let inlineOn = true

export function storeBlameInline(on: boolean): void {
  inlineOn = on
}

export function blameInlineExtension(on: boolean): Extension {
  return on ? [inlinePlugin, hoverField] : []
}

// ----- Whole-file gutter -----

class GutterText extends GutterMarker {
  constructor(
    readonly text: string,
    readonly title: string,
    readonly first: boolean
  ) {
    super()
  }
  override eq(other: GutterMarker): boolean {
    return other instanceof GutterText && other.text === this.text && other.first === this.first
  }
  override toDOM(): Node {
    const span = document.createElement('span')
    span.className = this.first ? 'cm-blame-entry cm-blame-first' : 'cm-blame-entry'
    span.textContent = this.text
    if (this.title) span.title = this.title
    return span
  }
}

const gutterCache = new WeakMap<BlameState, RangeSet<GutterMarker>>()

function gutterMarkers(state: EditorState): RangeSet<GutterMarker> {
  const value = state.field(blameField)
  if (!value.gutter || !value.input) return RangeSet.of<GutterMarker>([])
  const cached = gutterCache.get(value)
  if (cached) return cached
  const m = t().git.blame
  const builder = new RangeSetBuilder<GutterMarker>()
  let previous: string | null = null
  for (let n = 1; n <= state.doc.lines; n++) {
    const blame = blameAtLine(state, n)
    const key = blame === 'uncommitted' ? '' : (blame?.hash ?? '')
    const from = state.doc.line(n).from
    if (key === previous) {
      builder.add(from, from, new GutterText('', '', false))
      continue
    }
    previous = key
    if (!blame || blame === 'uncommitted') builder.add(from, from, new GutterText(m.uncommitted, '', true))
    else {
      const text = `${blame.hash.slice(0, 7)} ${blame.author} ${relativeTime(blame.date)}`
      const title = m.title(blame.hash.slice(0, 7), blame.author, formatDate(blame.date), blame.summary)
      builder.add(from, from, new GutterText(text, title, true))
    }
  }
  const set = builder.finish()
  gutterCache.set(value, set)
  return set
}

const blameGutter = gutter({
  class: 'cm-blame-gutter',
  markers: (view) => gutterMarkers(view.state),
  domEventHandlers: {
    click(view, line) {
      const blame = blameAtLine(view.state, view.state.doc.lineAt(line.from).number)
      if (!blame || blame === 'uncommitted') return false
      host.showCommit(blame.hash)
      return true
    }
  }
})

/** Blame extensions of a tab (owner or mirror). */
export function gitBlame(): Extension {
  return [blameField, scheduler, blameGutter, blameInlineSlot.of(blameInlineExtension(inlineOn))]
}
