// Editor search panel in the VS Code style: floating widget in the top right corner (CSS takes the panel out of the
// flow, so the content does not move down), with toggles, counter, previous/next and a replace row.
// It is plain DOM inside CodeMirror: the panel state lives in each EditorState (each tab/mirror has its own).
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
  search,
  SearchQuery,
  setSearchQuery
} from '@codemirror/search'
import { EditorState, type Extension, type Text } from '@codemirror/state'
import { t } from '@shared/i18n'
import { EditorView, keymap, runScopeHandlers, type Panel, type ViewUpdate } from '@codemirror/view'
import { FIND_COUNT_CAP, formatFindStatus, type FindCount } from '../../lib/findStatus'

interface FindController {
  showReplace(show: boolean): void
  focusFind(): void
  focusReplace(): void
}

const controllers = new WeakMap<EditorView, FindController>()
// Opening directly with "replace" (⌥⌘F / Ctrl+H) before the panel exists.
const wantsReplace = new WeakSet<EditorView>()

type Attrs = Record<string, string>

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  el.append(...children)
  return el
}

const icon = (name: string): HTMLElement => h('i', { class: `codicon codicon-${name}`, 'aria-hidden': 'true' })

function iconButton(name: string, extra: Attrs = {}): HTMLButtonElement {
  return h('button', { type: 'button', class: 'find-button', ...extra }, [icon(name)])
}

function setLabel(el: HTMLElement, label: string): void {
  el.title = label
  el.setAttribute('aria-label', label)
}

interface MatchIndex {
  query: SearchQuery
  doc: Text
  /** Start/end of the matches in order, up to the limit (the count stops there: `capped`). */
  ranges: { from: number; to: number }[]
  capped: boolean
}

/** Scans the document once (up to the limit); the current position comes later by binary search, without a new scan. */
function indexMatches(state: EditorState, query: SearchQuery): MatchIndex {
  const ranges: MatchIndex['ranges'] = []
  let capped = false
  if (query.search !== '' && query.valid) {
    const cursor = query.getCursor(state)
    for (let r = cursor.next(); !r.done; r = cursor.next()) {
      if (ranges.length >= FIND_COUNT_CAP) {
        capped = true
        break
      }
      ranges.push({ from: r.value.from, to: r.value.to })
    }
  }
  return { query, doc: state.doc, ranges, capped }
}

function countFromIndex(state: EditorState, query: SearchQuery, index: MatchIndex): FindCount {
  const empty = query.search === ''
  if (empty) return { empty, invalid: false, total: 0, current: null, capped: false }
  if (!query.valid) return { empty, invalid: true, total: 0, current: null, capped: false }
  const sel = state.selection.main
  let lo = 0
  let hi = index.ranges.length - 1
  let current: number | null = null
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const m = index.ranges[mid]
    if (!m) break
    if (m.from === sel.from && m.to === sel.to) {
      current = mid + 1
      break
    }
    if (m.from < sel.from || (m.from === sel.from && m.to < sel.to)) lo = mid + 1
    else hi = mid - 1
  }
  return { empty, invalid: false, total: index.ranges.length, current, capped: index.capped }
}

class FindPanel implements Panel {
  readonly dom: HTMLElement
  readonly top = true
  private query: SearchQuery
  private readonly controller: FindController
  private readonly find: HTMLInputElement
  private readonly replace: HTMLInputElement
  private readonly status: HTMLElement
  private readonly expand: HTMLButtonElement
  private readonly replaceRow: HTMLElement
  private readonly toggles: Record<'caseSensitive' | 'wholeWord' | 'regexp', HTMLButtonElement>
  private readonly buttons: Record<'prev' | 'next' | 'close' | 'replaceOne' | 'replaceEvery', HTMLButtonElement>
  private matchIndex: MatchIndex | null = null
  private recountTimer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly view: EditorView) {
    this.query = getSearchQuery(view.state)
    this.find = h('input', {
      class: 'find-input',
      'main-field': 'true',
      spellcheck: 'false',
      autocomplete: 'off'
    })
    this.replace = h('input', {
      class: 'find-input',
      spellcheck: 'false',
      autocomplete: 'off'
    })
    this.status = h('span', { class: 'find-status', role: 'status', 'aria-live': 'polite' })
    this.expand = iconButton('chevron-right', { class: 'find-button find-expand' })
    this.toggles = {
      caseSensitive: iconButton('case-sensitive'),
      wholeWord: iconButton('whole-word'),
      regexp: iconButton('regex')
    }
    this.buttons = {
      prev: iconButton('arrow-up'),
      next: iconButton('arrow-down'),
      close: iconButton('close'),
      replaceOne: iconButton('replace'),
      replaceEvery: iconButton('replace-all')
    }
    const { prev, next, close, replaceOne, replaceEvery } = this.buttons
    this.applyLabels()

    this.replaceRow = h('div', { class: 'find-row find-replace-row' }, [this.replace, replaceOne, replaceEvery])
    this.replaceRow.hidden = true
    this.dom = h('div', { class: 'walph-find', role: 'search' }, [
      this.expand,
      h('div', { class: 'find-rows' }, [
        h('div', { class: 'find-row' }, [
          this.find,
          this.toggles.caseSensitive,
          this.toggles.wholeWord,
          this.toggles.regexp,
          this.status,
          prev,
          next,
          close
        ]),
        this.replaceRow
      ])
    ])
    this.dom.addEventListener('keydown', (e) => this.keydown(e))

    this.syncFields()
    this.find.addEventListener('input', () => this.commit(true))
    this.replace.addEventListener('input', () => this.commit(false))
    for (const key of Object.keys(this.toggles) as (keyof typeof this.toggles)[]) {
      this.toggles[key].addEventListener('click', () => {
        const q = this.query
        this.dispatchQuery(
          new SearchQuery({
            search: q.search,
            replace: q.replace,
            caseSensitive: q.caseSensitive,
            wholeWord: q.wholeWord,
            regexp: q.regexp,
            [key]: !q[key]
          })
        )
        this.find.focus()
      })
    }
    this.expand.addEventListener('click', () => this.showReplace(this.replaceRow.hidden === true))
    prev.addEventListener('click', () => findPrevious(view))
    next.addEventListener('click', () => findNext(view))
    close.addEventListener('click', () => this.close())
    replaceOne.addEventListener('click', () => replaceNext(view))
    replaceEvery.addEventListener('click', () => replaceAll(view))

    this.controller = {
      showReplace: (show) => this.showReplace(show),
      focusFind: () => this.focusInput(this.find),
      focusReplace: () => this.focusInput(this.replace)
    }
    controllers.set(view, this.controller)
    if (wantsReplace.delete(view)) this.showReplace(true)
    this.refreshStatus(view.state, true)
  }

  // No focus here: CodeMirror remounts the panels on every `view.setState` (switching tabs, promoting the mirror) and
  // would steal focus. Whoever opens the panel (`openFind`/`openReplace`) focuses the field afterwards.
  mount(): void {}

  destroy(): void {
    clearTimeout(this.recountTimer)
    if (controllers.get(this.view) === this.controller) controllers.delete(this.view)
  }

  update(u: ViewUpdate): void {
    // The language changed (the `EditorState.phrases` compartment was reconfigured).
    if (u.startState.facet(EditorState.phrases) !== u.state.facet(EditorState.phrases)) {
      this.applyLabels()
      this.refreshStatus(u.state, false)
    }
    let changed = false
    for (const tr of u.transactions) {
      for (const e of tr.effects) {
        if (e.is(setSearchQuery) && !e.value.eq(this.query)) {
          this.query = e.value
          this.syncFields()
          changed = true
        }
      }
    }
    if (changed) {
      this.refreshStatus(u.state, true)
    } else if (u.docChanged) {
      // While typing, recounting on every keystroke would scan the whole document: batches it into a short frame.
      clearTimeout(this.recountTimer)
      this.recountTimer = setTimeout(() => this.refreshStatus(this.view.state, true), 120)
    } else if (u.selectionSet) this.refreshStatus(u.state, false)
  }

  private applyLabels(): void {
    const f = t().editor.find
    this.find.placeholder = f.find
    this.find.setAttribute('aria-label', f.find)
    this.replace.placeholder = f.replace
    this.replace.setAttribute('aria-label', f.replace)
    setLabel(this.expand, f.toggleReplace)
    setLabel(this.toggles.caseSensitive, f.matchCase)
    setLabel(this.toggles.wholeWord, f.wholeWord)
    setLabel(this.toggles.regexp, f.regexp)
    setLabel(this.buttons.prev, f.previous)
    setLabel(this.buttons.next, f.next)
    setLabel(this.buttons.close, f.close)
    setLabel(this.buttons.replaceOne, f.replace)
    setLabel(this.buttons.replaceEvery, f.replaceAll)
  }

  private focusInput(input: HTMLInputElement): void {
    input.focus()
    input.select()
  }

  private showReplace(show: boolean): void {
    this.replaceRow.hidden = !show
    this.dom.classList.toggle('with-replace', show)
    this.expand.setAttribute('aria-expanded', String(show))
    this.expand.firstElementChild?.setAttribute('class', `codicon codicon-chevron-${show ? 'down' : 'right'}`)
  }

  /** Fields and toggles follow the state query (it also changes from outside: opening with the selection). */
  private syncFields(): void {
    if (this.find.value !== this.query.search) this.find.value = this.query.search
    if (this.replace.value !== this.query.replace) this.replace.value = this.query.replace
    for (const key of Object.keys(this.toggles) as (keyof typeof this.toggles)[]) {
      this.toggles[key].setAttribute('aria-pressed', String(this.query[key]))
    }
  }

  private commit(select: boolean): void {
    const next = new SearchQuery({
      search: this.find.value,
      replace: this.replace.value,
      caseSensitive: this.query.caseSensitive,
      wholeWord: this.query.wholeWord,
      regexp: this.query.regexp
    })
    this.dispatchQuery(next)
    if (select) this.selectFromCursor()
  }

  private dispatchQuery(next: SearchQuery): void {
    if (next.eq(this.query)) return
    this.query = next
    this.syncFields()
    this.view.dispatch({ effects: setSearchQuery.of(next) })
    // `update` sees no change (the query was already replaced above) and the toggles do not touch the selection:
    // recount here.
    this.refreshStatus(this.view.state, true)
  }

  /** Incremental search: the first match from the cursor (wrapping to the start) gets selected. */
  private selectFromCursor(): void {
    const { state } = this.view
    if (!this.query.valid) return
    const from = state.selection.main.from
    let r = this.query.getCursor(state, from).next()
    if (r.done) r = this.query.getCursor(state).next()
    if (r.done) return
    const { from: a, to: b } = r.value
    this.view.dispatch({
      selection: { anchor: a, head: b },
      effects: EditorView.scrollIntoView(a, { y: 'nearest' })
    })
  }

  private refreshStatus(state: EditorState, recount: boolean): void {
    if (recount) clearTimeout(this.recountTimer)
    const cached = this.matchIndex
    if (recount || !cached || !cached.query.eq(this.query) || cached.doc !== state.doc) {
      this.matchIndex = indexMatches(state, this.query)
    }
    const { text, none } = formatFindStatus(countFromIndex(state, this.query, this.matchIndex as MatchIndex))
    this.status.textContent = text
    this.status.classList.toggle('none', none)
    this.find.classList.toggle('invalid', this.query.search !== '' && !this.query.valid)
  }

  private close(): void {
    closeSearchPanel(this.view)
    this.view.focus()
  }

  private keydown(e: KeyboardEvent): void {
    if (runScopeHandlers(this.view, e, 'search-panel')) {
      e.preventDefault()
      return
    }
    if (e.key !== 'Enter' || e.isComposing) return
    e.preventDefault()
    if (e.target === this.replace) {
      if (e.ctrlKey || e.metaKey) replaceAll(this.view)
      else replaceNext(this.view)
    } else if (e.shiftKey) findPrevious(this.view)
    else findNext(this.view)
  }
}

/** Mod-f: opens (or refocuses and selects the field if already open). */
function openFind(view: EditorView): boolean {
  openSearchPanel(view)
  controllers.get(view)?.focusFind()
  return true
}

/** ⌥⌘F (macOS) / Ctrl+H: opens with the replace row and focus on it. */
function openReplace(view: EditorView): boolean {
  const ctrl = controllers.get(view)
  if (!ctrl) wantsReplace.add(view)
  openSearchPanel(view)
  // If the panel was never created, the mark must not be left over for a future open.
  wantsReplace.delete(view)
  const opened = controllers.get(view)
  opened?.showReplace(true)
  opened?.focusReplace()
  return true
}

/** Find extension: panel config + open shortcuts (they come before `searchKeymap`). */
export const findExtension: Extension = [
  search({ top: true, createPanel: (view) => new FindPanel(view) }),
  keymap.of([
    { key: 'Mod-f', run: openFind, scope: 'editor search-panel', preventDefault: true },
    { key: 'Mod-h', mac: 'Mod-Alt-f', run: openReplace, scope: 'editor search-panel', preventDefault: true }
  ])
]
