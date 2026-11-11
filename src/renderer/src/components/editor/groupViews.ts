// EditorViews (one per editor group) and the owner/mirror model.
//
// There is ONE document per tab. Its "canonical" EditorState (history, LSP extensions, dirty/`lspChange` listener)
// lives
// either in the view of a group showing it (the "owner") or, hidden, in `states`. When the same tab shows in other
// groups, each one gets a MIRROR state (same text and selection, no history and no edit listener) and the views
// sync through CodeMirror's "split view" pattern: each transaction with a text change is resent to the other
// views of the tab, annotated with `syncAnnotation` so it does not echo. So an edit, from any group, goes through the
// owner listener only once: one `lspChange` stream, one dirty, one auto save signal.
import { Annotation, EditorState, Transaction, type Extension, type StateEffect } from '@codemirror/state'
import { closeCompletion } from '@codemirror/autocomplete'
import { indentWithTab, redo, redoSelection, undo, undoSelection } from '@codemirror/commands'
import { forEachDiagnostic, setDiagnostics, type Diagnostic as CmDiagnostic } from '@codemirror/lint'
import { closeHoverTooltips, EditorView, keymap, type Command } from '@codemirror/view'
import { offsetToPosition, type TabViewState } from '../../lib/session'
import {
  bulbOn,
  getEditorConfig,
  getEditorTheme,
  handlers,
  indentation,
  indentExtension,
  indents,
  language,
  pendingViews,
  states,
  tabOptions,
  tabOptionsExtension,
  topLines,
  viewSettings
} from './documentState'
import {
  editorBase,
  editorConfigExtension,
  editorPhrases,
  mirrorSetup,
  phrasesCompartment,
  themeCompartment
} from './setup'
import { baselineOf, gitGutter, setBaseline } from './gitGutter'
import { blameEffectsOf, gitBlame } from './gitBlame'
import { mergeConflicts } from './mergeConflicts'
import { breakpointGutter } from './breakpointGutter'
import { overviewRuler } from './overviewRuler'
import { lspExtensions } from './lspExtensions'
import { snippetExtensions } from './snippetExtensions'
import { closeSignatureHelp } from './lspSignatureHelp'
import { closeQuickFixMenu, lightbulbOn, lightbulbSlot } from './lspCodeActions'
import { closeRenameBox } from './lspRename'

interface GroupView {
  groupId: string
  view: EditorView
  /** Tab whose state the view shows now. */
  tabId: string | null
  /** `true`: shows a mirror copy; the canonical state is in another group's view. */
  mirror: boolean
  /** While the restored scroll has not settled, scroll events do not reflect the user position. */
  settling: boolean
  onScroll: () => void
  /** Applies the pending scroll now (`onScroll` is coalesced per frame). */
  flushScroll: () => void
}

const groupViews = new Map<string, GroupView>()
const viewToGroup = new WeakMap<EditorView, GroupView>()
// Tab → group whose view holds the live canonical state.
const owners = new Map<string, string>()
let activeGroupId: string | null = null

/** Origin of the transactions resent to the other views: they are not resent again. */
const syncAnnotation = Annotation.define<boolean>()

/** The group that gets focus, the status bar cursor and the commands (LSP, search…). */
export function setActiveGroup(groupId: string): void {
  if (activeGroupId === groupId) return
  activeGroupId = groupId
  const gv = groupViews.get(groupId)
  if (gv?.tabId) reportCursor(gv.view.state)
}

function activeGroupView(): GroupView | null {
  return (activeGroupId ? groupViews.get(activeGroupId) : undefined) ?? groupViews.values().next().value ?? null
}

/** View of the group (the active group's if `groupId` is omitted). */
export function getView(groupId?: string): EditorView | null {
  if (groupId) return groupViews.get(groupId)?.view ?? null
  return activeGroupView()?.view ?? null
}

/** Tab whose state is loaded in the group view (the active group's if omitted). */
export function shownTabId(groupId?: string): string | null {
  const gv = groupId ? groupViews.get(groupId) : activeGroupView()
  return gv?.tabId ?? null
}

function viewsShowing(tabId: string): GroupView[] {
  return [...groupViews.values()].filter((gv) => gv.tabId === tabId)
}

function canonicalView(tabId: string): GroupView | undefined {
  const groupId = owners.get(tabId)
  const gv = groupId ? groupViews.get(groupId) : undefined
  return gv && gv.tabId === tabId && !gv.mirror ? gv : undefined
}

/** The views showing the same tab in other groups. */
function twinsOf(source: GroupView): GroupView[] {
  if (!source.tabId) return []
  return [...groupViews.values()].filter((gv) => gv !== source && gv.tabId === source.tabId)
}

/** View that owns the canonical state of the tab, if any shows it now. */
export function ownerView(tabId: string): EditorView | undefined {
  return canonicalView(tabId)?.view
}

/** All views showing the tab (owner and mirrors). */
export function viewsOfTab(tabId: string): EditorView[] {
  return viewsShowing(tabId).map((gv) => gv.view)
}

/** Releases ownership of the canonical state of a forgotten tab. */
export function dropOwner(tabId: string): void {
  owners.delete(tabId)
}

/** First visible line at the top of the view (1-based). */
function computeTopLine(v: EditorView): number {
  const top = v.scrollDOM.getBoundingClientRect().top - v.documentTop
  return v.state.doc.lineAt(v.lineBlockAtHeight(top).from).number
}

function reportCursor(state: EditorState): void {
  const head = state.selection.main.head
  const line = state.doc.lineAt(head)
  // Selected characters summing all selections (the status bar shows "12 selected").
  let selected = 0
  for (const range of state.selection.ranges) selected += range.to - range.from
  // Surrogate pairs (emoji) count as one character; only in small selections, so large text is not copied on every
  // selection.
  if (selected > 0 && selected <= 2000) {
    selected = 0
    for (const range of state.selection.ranges) selected += [...state.sliceDoc(range.from, range.to)].length
  }
  handlers.setCursor({ line: line.number, column: head - line.from + 1, selected })
}

/** Resends the text changes to the sibling views (same tab in other groups), without echo. */
function forwardToTwins(source: GroupView, trs: readonly Transaction[]): void {
  const twins = twinsOf(source)
  if (twins.length === 0) return
  for (const tr of trs) {
    if (tr.changes.empty || tr.annotation(syncAnnotation)) continue
    const annotations: Annotation<unknown>[] = [syncAnnotation.of(true)]
    const userEvent = tr.annotation(Transaction.userEvent)
    // `input.type`/`input.complete` would trigger completion and signature help in the unfocused view (and the
    // exclusive
    // LSP request would cancel the one from the view where the user types); history grouping in the owner works without
    // them.
    if (userEvent && !/^input\.(type|complete)/.test(userEvent)) annotations.push(Transaction.userEvent.of(userEvent))
    // Reloading from disk does not enter undo, whichever side it came from.
    if (tr.annotation(Transaction.addToHistory) === false) annotations.push(Transaction.addToHistory.of(false))
    for (const twin of twins) twin.view.dispatch({ changes: tr.changes, annotations })
  }
}

export function mountView(groupId: string, parent: HTMLElement): void {
  if (groupViews.has(groupId)) unmountView(groupId)
  let scrollFrame = 0
  const gv: GroupView = {
    groupId,
    tabId: null,
    mirror: false,
    settling: false,
    // Reading the top line forces layout: at most once per frame, not on every scroll event.
    onScroll: () => {
      // `settling` holds at the time of the event: one frame later it may already have been cleared and the read
      // position would not be the user's.
      if (gv.settling) return
      if (!scrollFrame) scrollFrame = requestAnimationFrame(gv.flushScroll)
    },
    flushScroll: () => {
      if (scrollFrame) cancelAnimationFrame(scrollFrame)
      scrollFrame = 0
      // Hidden host (clientHeight 0) or restoration in progress: the read position is not the user's.
      if (!gv.tabId || gv.settling || gv.view.scrollDOM.clientHeight === 0) return
      // Only the owner publishes the tab position (reopening and session); scrolling the mirror copy does not move it.
      if (!gv.mirror) topLines.set(gv.tabId, computeTopLine(gv.view))
      handlers.onScroll()
    },
    view: new EditorView({
      parent,
      dispatchTransactions: (trs, view) => {
        view.update(trs)
        forwardToTwins(gv, trs)
      }
    })
  }
  viewToGroup.set(gv.view, gv)
  gv.view.scrollDOM.addEventListener('scroll', gv.onScroll, { passive: true })
  groupViews.set(groupId, gv)
}

/**
 * Destroys the group view. The state of the tab it showed is stored (or handed to a sibling view) if `keep(tabId)`; the
 * store decides, because a closed tab must not go back to `states` after `forgetDocument`.
 */
export function unmountView(groupId: string, keep: (tabId: string) => boolean = () => true): void {
  const gv = groupViews.get(groupId)
  if (!gv) return
  if (gv.tabId) hideDocument(groupId, gv.tabId, keep(gv.tabId))
  gv.view.scrollDOM.removeEventListener('scroll', gv.onScroll)
  gv.flushScroll()
  gv.view.destroy()
  groupViews.delete(groupId)
}

/** Undo/redo of the mirror copy apply to the canonical one (the history is its own); the selection comes back along. */
function runOnCanonical(command: Command): Command {
  return (view) => {
    const gv = viewToGroup.get(view)
    const owner = gv?.tabId ? canonicalView(gv.tabId) : undefined
    if (!gv || !owner || owner === gv) return false
    const done = command(owner.view)
    if (done) {
      view.dispatch({
        selection: owner.view.state.selection,
        scrollIntoView: true,
        annotations: syncAnnotation.of(true)
      })
    }
    return done
  }
}

const mirrorHistoryKeymap = keymap.of([
  { key: 'Mod-z', run: runOnCanonical(undo), preventDefault: true },
  { key: 'Mod-y', mac: 'Mod-Shift-z', run: runOnCanonical(redo), preventDefault: true },
  { linux: 'Ctrl-Shift-z', run: runOnCanonical(redo), preventDefault: true },
  // Undoing a selection also moves the owner cursor (the history is its own): intentional, the selection goes back to
  // the mirror.
  { key: 'Mod-u', run: runOnCanonical(undoSelection), preventDefault: true },
  { key: 'Alt-u', mac: 'Mod-Shift-u', run: runOnCanonical(redoSelection), preventDefault: true }
])

// The Undo/Redo items of the native menu arrive as `beforeinput` (historyUndo/historyRedo): they also go to the
// canonical one.
const mirrorHistoryInput = EditorView.domEventHandlers({
  beforeinput(event, view) {
    const command = event.inputType === 'historyUndo' ? undo : event.inputType === 'historyRedo' ? redo : null
    if (!command) return false
    event.preventDefault()
    runOnCanonical(command)(view)
    return true
  }
})

// Status bar cursor: only the active group reports (views of the other groups also move when receiving edits).
export function cursorListener(): Extension {
  return EditorView.updateListener.of((update) => {
    if (!update.selectionSet && !update.docChanged) return
    if (viewToGroup.get(update.view)?.groupId !== activeGroupId) return
    reportCursor(update.state)
  })
}

/**
 * Mirror state: the same text, selection, language, git base and diagnostics as the canonical one; no history or edit
 * listeners.
 */
function createMirror(tabId: string, canonical: EditorState): EditorState {
  const config = getEditorConfig()
  const indent = indents.get(tabId) ?? { kind: 'spaces', size: config.tabSize }
  let state = EditorState.create({
    doc: canonical.doc,
    selection: canonical.selection,
    extensions: [
      lspExtensions(tabId),
      snippetExtensions(tabId),
      gitBlame(),
      breakpointGutter(false),
      mirrorSetup,
      mirrorHistoryKeymap,
      mirrorHistoryInput,
      gitGutter(),
      mergeConflicts(),
      overviewRuler,
      keymap.of([indentWithTab]),
      editorBase,
      themeCompartment.of(getEditorTheme()),
      phrasesCompartment.of(editorPhrases()),
      viewSettings.of(editorConfigExtension(config)),
      language.of(language.get(canonical) ?? []),
      indentation.of(indentExtension(indent, config.tabSize)),
      tabOptions.of(tabOptionsExtension(tabId)),
      cursorListener()
    ]
  })
  const effects: StateEffect<unknown>[] = []
  const baseline = baselineOf(canonical)
  if (baseline) effects.push(setBaseline.of(baseline))
  effects.push(...blameEffectsOf(canonical))
  if (bulbOn.get(tabId)) effects.push(lightbulbSlot.reconfigure(lightbulbOn))
  if (effects.length) state = state.update({ effects }).state
  const diagnostics: CmDiagnostic[] = []
  forEachDiagnostic(canonical, (d, from, to) => diagnostics.push({ ...d, from, to }))
  if (diagnostics.length) state = state.update(setDiagnostics(state, diagnostics)).state
  return state
}

/** Current state of the tab, whether visible or stored. */
export function currentState(tabId: string): EditorState | undefined {
  return canonicalView(tabId)?.view.state ?? states.get(tabId)
}

/**
 * Cursor (head of the main selection) and scroll of the tab, for the session: from the view if visible (the active
 * group's, if more than one), from the stored state if hidden, from the pending one if never loaded. `null` if there is
 * nothing.
 */
export function tabViewState(tabId: string): TabViewState | null {
  const showing = viewsShowing(tabId)
  const gv = showing.find((v) => v.groupId === activeGroupId) ?? showing[0]
  if (gv)
    return {
      cursor: offsetToPosition(gv.view.state.doc, gv.view.state.selection.main.head),
      topLine: gv.settling ? (topLines.get(tabId) ?? 1) : computeTopLine(gv.view)
    }
  const stored = states.get(tabId)
  if (stored)
    return {
      cursor: offsetToPosition(stored.doc, stored.selection.main.head),
      topLine: topLines.get(tabId) ?? 1
    }
  return pendingViews.get(tabId) ?? null
}

/**
 * Shows the tab document in the group view. The first view to show it keeps the canonical state; the others get
 * mirrors. `false` if the view does not exist or the tab is not loaded.
 */
export function showDocument(groupId: string, tabId: string): boolean {
  const gv = groupViews.get(groupId)
  const stored = states.get(tabId)
  if (!gv || !stored) return false
  if (gv.tabId === tabId) return true
  if (gv.tabId) hideDocument(groupId, gv.tabId, states.has(gv.tabId))
  const owner = canonicalView(tabId)
  if (owner) {
    gv.view.setState(createMirror(tabId, owner.view.state))
    gv.mirror = true
  } else {
    gv.view.setState(stored)
    gv.mirror = false
    owners.set(tabId, groupId)
  }
  gv.tabId = tabId
  restoreScroll(gv, topLines.get(tabId) ?? 1)
  if (groupId === activeGroupId) reportCursor(gv.view.state)
  return true
}

// Scrolls to the top line through the CodeMirror effect, which redoes the computation on every measure (estimated
// height → measured) without the measure loop of reapplying a px scrollTop.
function restoreScroll(gv: GroupView, line: number): void {
  const current = gv.view
  const tabId = gv.tabId
  gv.settling = false
  if (line <= 1) {
    current.scrollDOM.scrollTop = 0
    return
  }
  const doc = current.state.doc
  const pos = doc.line(Math.min(line, doc.lines)).from
  gv.settling = true
  current.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 0 }) })
  current.requestMeasure({
    read: () => null,
    write: () => {
      // The scroll events generated by the scroll arrive before the next frame: releases after it.
      requestAnimationFrame(() => {
        if (groupViews.get(gv.groupId) === gv && gv.tabId === tabId) gv.settling = false
      })
    }
  })
}

function blankState(): EditorState {
  return EditorState.create({
    extensions: [editorBase, themeCompartment.of(getEditorTheme()), phrasesCompartment.of(editorPhrases())]
  })
}

/**
 * Removes the tab from the group view; `keep` stores the state (document, selection, history) for the next display. If
 * another view still shows the tab, the first of them is promoted to owner of the canonical state (the one that stays
 * shows the state with history) and the others remain mirrors. Without `keep` (tab closed), every view drops the tab.
 */
export function hideDocument(groupId: string, tabId: string, keep: boolean): void {
  const gv = groupViews.get(groupId)
  if (!gv || gv.tabId !== tabId) return
  // LSP floating hints must not come back stale when the tab reappears (and the rename field of a closed tab
  // must resolve the wait). Also closes the hover and the completion list.
  gv.flushScroll()
  closeCompletion(gv.view)
  gv.view.dispatch({ effects: [closeSignatureHelp, closeQuickFixMenu, closeRenameBox, closeHoverTooltips] })
  const twins = twinsOf(gv)
  const [heir] = twins
  if (!keep) {
    // The tab no longer exists: no view may keep it.
    for (const twin of twins) release(twin)
    owners.delete(tabId)
  } else if (gv.mirror) {
    // Only the mirror copy goes away; the canonical one stays in the owner view.
  } else if (heir) {
    promote(heir, gv.view.state)
  } else {
    states.set(tabId, gv.view.state)
    owners.delete(tabId)
  }
  release(gv)
}

function release(gv: GroupView): void {
  gv.tabId = null
  gv.mirror = false
  gv.settling = false
  gv.view.setState(blankState())
}

/**
 * The mirror view starts showing the canonical state (keeping the selection and scroll the user had on it). Folds and
 * search marks of the mirror copy are lost on purpose: they are view-only state, with no counterpart in the canonical
 * one.
 */
function promote(twin: GroupView, canonical: EditorState): void {
  const tabId = twin.tabId!
  const line = computeTopLine(twin.view)
  const selection = twin.view.state.selection
  twin.view.setState(canonical.update({ selection }).state)
  twin.mirror = false
  owners.set(tabId, twin.groupId)
  topLines.set(tabId, line)
  restoreScroll(twin, line)
}

/**
 * Applies the effects to every copy of the tab: the views showing it (owner and mirrors) or, if hidden, the stored
 * state.
 */
export function dispatchEffects(tabId: string, effects: StateEffect<unknown>[]): void {
  for (const gv of viewsShowing(tabId)) gv.view.dispatch({ effects })
  if (!canonicalView(tabId)) {
    const stored = states.get(tabId)
    if (stored) states.set(tabId, stored.update({ effects }).state)
  }
}

/** Views without a tab (empty group) also follow theme and language. */
export function dispatchToEmptyViews(effects: StateEffect<unknown>[]): void {
  for (const gv of groupViews.values()) if (!gv.tabId) gv.view.dispatch({ effects })
}

/** Font/size change through a CSS variable: CodeMirror only needs to re-measure. */
export function remeasureEditor(): void {
  for (const gv of groupViews.values()) gv.view.requestMeasure()
}
