// Shared state of the open documents and the editor settings. It has no views and does not import the store (the
// callbacks come in through `bindDocumentHandlers`) so the store and the commands save/reload tabs without an import
// cycle. The rest of the model (ONE document per tab, owner/mirror) is in `groupViews.ts`.
import { Compartment, EditorState, Text, type Extension } from '@codemirror/state'
import { indentUnit } from '@codemirror/language'
import { setHighlightTheme } from '../../lib/codeHighlight'
import type { TabViewState } from '../../lib/session'
import { splitLines, type Indent } from '../../lib/textFormat'
import { DEFAULT_THEME } from '../../themes'
import type { EditorViewConfig } from './setup'
import { mergeRulers, rulersExtension } from './rulers'

interface DocumentHandlers {
  setDirty(tabId: string, dirty: boolean): void
  setCursor(cursor: { line: number; column: number; selected: number }): void
  /** The editor scroll changed (the session stores the position of each tab). */
  onScroll(): void
}

export const handlers: DocumentHandlers = { setDirty: () => {}, setCursor: () => {}, onScroll: () => {} }

export function bindDocumentHandlers(next: DocumentHandlers): void {
  Object.assign(handlers, next)
}

// Canonical state of each loaded tab. While a view shows it, the view owns the live state and this entry goes
// stale (`hideDocument` updates it); `hasDocument` only wants to know whether the tab was loaded.
export const states = new Map<string, EditorState>()
// Base line: what is on disk (already with line breaks normalized to `\n`).
export const savedDocs = new Map<string, Text>()
// Indent of each tab (detected in the file): the tab width depends on it and on `editor.tabSize`.
export const indents = new Map<string, Indent>()
// First visible line of each loaded tab (1-based). Tracked continuously by the scroll listener: when the tab is
// hidden the host is already `display: none` (scrollTop 0), so the DOM cannot be read at that point. A line and not
// px: the height of not yet measured lines is estimated by CodeMirror and a px scrollTop would land elsewhere.
export const topLines = new Map<string, number>()
// Cursor/scroll restored from the session for tabs not yet read from disk: applied once, on load.
export const pendingViews = new Map<string, TabViewState>()
// The tab's own rulers (EditorConfig), added to those of `editor.rulers`.
export const tabRulers = new Map<string, number[]>()
// Tabs with the lightbulb gutter on (one per document: the compartment is reconfigured in each copy of the state).
export const bulbOn = new Map<string, boolean>()
// Tabs with code lenses on (server ready and `editor.codeLens`), for the same reason.
export const lensOn = new Map<string, boolean>()

export const language = new Compartment()
export const indentation = new Compartment()
export const viewSettings = new Compartment()
/** Options that depend on the tab and the settings together (rulers). */
export const tabOptions = new Compartment()

export interface EditorConfig extends EditorViewConfig {
  /** Display width of the tab in files indented with tabs. */
  tabSize: number
  rulers: number[]
  /** `editor.codeLens`. */
  codeLens: boolean
}

// Current values of the editor settings: new states are already born with them.
let config: EditorConfig = {
  tabSize: 2,
  wordWrap: false,
  lineNumbers: true,
  minimap: true,
  renderWhitespace: 'selection',
  rulers: [],
  stickyScroll: 5,
  codeLens: true
}
let theme: Extension = DEFAULT_THEME.editor
// Code blocks in the LSP documentation use the highlighting of the same theme.
setHighlightTheme(theme)

export function getEditorConfig(): EditorConfig {
  return config
}

export function storeEditorConfig(next: EditorConfig): void {
  config = next
}

export function getEditorTheme(): Extension {
  return theme
}

export function storeEditorTheme(next: Extension): void {
  theme = next
  setHighlightTheme(next)
}

export function tabOptionsExtension(tabId: string): Extension {
  return rulersExtension(mergeRulers(config.rulers, tabRulers.get(tabId) ?? []))
}

export function indentExtension(indent: Indent, tabSize: number): Extension {
  if (indent.kind === 'tabs') return [indentUnit.of('\t'), EditorState.tabSize.of(indent.width ?? tabSize)]
  return [indentUnit.of(' '.repeat(indent.size)), EditorState.tabSize.of(indent.size)]
}

const editListeners = new Set<(tabId: string) => void>()
const docListeners = new Set<(tabId: string) => void>()

/**
 * Notifies the edit listeners (auto save) of a change that did not go through the editor, e.g. changing the line
 * ending.
 */
export function notifyEdit(tabId: string): void {
  for (const listener of editListeners) listener(tabId)
}

/** Notifies on every user edit in any tab (auto save after delay). Returns the unsubscribe. */
export function subscribeEdits(listener: (tabId: string) => void): () => void {
  editListeners.add(listener)
  return () => void editListeners.delete(listener)
}

/**
 * Notifies on every text change of a tab, from any source (typing, reloading from disk, LSP edit) and when the
 * document is loaded. The Markdown preview follows the buffer through here.
 */
export function subscribeDocChanges(listener: (tabId: string) => void): () => void {
  docListeners.add(listener)
  return () => void docListeners.delete(listener)
}

export function notifyDocChanged(tabId: string): void {
  for (const listener of docListeners) listener(tabId)
}

/** Document as the editor keeps it: CodeMirror normalizes any line break to `\n`. */
export function normalizedDoc(text: string): Text {
  return Text.of(splitLines(text))
}

export function hasDocument(tabId: string): boolean {
  return states.has(tabId)
}

/** Stores the cursor/scroll of a restored tab; they apply when the file is loaded for the first time. */
export function setPendingView(tabId: string, state: TabViewState): void {
  pendingViews.set(tabId, state)
}

/** `true` if `text` (read from disk) equals the base line; `null` if the tab was never loaded in the editor. */
export function matchesSaved(tabId: string, text: string): boolean | null {
  const saved = savedDocs.get(tabId)
  return saved ? normalizedDoc(text).eq(saved) : null
}
