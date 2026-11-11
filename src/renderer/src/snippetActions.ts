// User snippets and Emmet: main's snapshot in the store, the bridge for the editor extensions (`snippetHost`) and the
// commands (Insert Snippet, Configure Snippets, Emmet).
import { t } from '@shared/i18n'
import type { SnippetFileKind, SnippetSnapshot, UserSnippet } from '@shared/types'
import { attempt } from './attempt'
import { balance, expandAbbreviationAtCursor, markupSyntaxOf, wrapWithAbbreviation } from './components/editor/emmet'
import { focusEditor } from './components/editor/editorFocus'
import { expandSnippet } from './components/editor/snippetExpand'
import { bindSnippetHost } from './components/editor/snippetHost'
import { emmetSyntaxFor } from './lib/emmet'
import { languageIdOf } from './lib/languageId'
import { snippetsForLanguage } from './lib/userSnippets'
import { createReactionScope } from './lib/reactions'
import { activeFile } from './lspNavigationActions'
import { closeQuickInput, showPicker, togglePicker } from './quickInputActions'
import { findFileTab, get, set } from './store'
import { activeLoadedFileTab, openFile } from './tabActions'
import { notify } from './toasts'

const api = window.api

// Notifications already shown: the snapshot is resent on every change and a broken file must not repeat the toast.
let shownErrors = new Set<string>()

function applySnippets(snapshot: SnippetSnapshot): void {
  set({ snippets: snapshot })
  for (const error of snapshot.errors) if (!shownErrors.has(error)) notify(error)
  shownErrors = new Set(snapshot.errors)
}

function bindHost(): void {
  bindSnippetHost({
    languageId: (tabId) => {
      const tab = findFileTab(tabId)
      return tab ? languageIdOf(tab.path, tab.language) : 'plaintext'
    },
    filePath: (tabId) => findFileTab(tabId)?.path ?? null,
    root: () => get().root,
    snippetsFor: (languageId) => snippetsForLanguage(get().snippets.snippets, languageId),
    settings: () => get().settings
  })
}

/** Binds the snippets snapshot (initial load + `snippets:changed`) and the editor bridge; returns the unsubscribe. */
export function watchSnippets(): () => void {
  const scope = createReactionScope()
  bindHost()
  scope.add(api.snippets.onChange(applySnippets))
  void attempt(async () => applySnippets(await api.snippets.list()), { quiet: true })
  return scope.stop
}

// ---------- Insert / configure ----------

/** `languageId` of the active tab (`null` without a loaded file). */
function activeLanguageId(): string | null {
  const tab = activeLoadedFileTab()
  return tab ? languageIdOf(tab.path, tab.language) : null
}

export function openInsertSnippetPicker(): void {
  togglePicker('insertSnippet', () => !!activeLoadedFileTab())
}

/** Expands the snippet at the active tab cursor; the selection is replaced and becomes `TM_SELECTED_TEXT`. */
export function insertSnippet(snippet: UserSnippet): void {
  const file = activeFile()
  if (!file) return
  const { view } = file
  const { from, to } = view.state.selection.main
  focusEditor()
  void expandSnippet(view, snippet.body, from, to, { selectedText: view.state.sliceDoc(from, to) })
}

export function openConfigureSnippetsPicker(): void {
  togglePicker('configureSnippets')
}

/** Opens the snippets file in a tab (creating it from the template if missing). */
export async function openSnippetFile(kind: SnippetFileKind, name: string): Promise<void> {
  closeQuickInput()
  const path = await attempt(() => api.snippets.openFile(kind, name), { fallback: null })
  if (path) openFile(path)
}

/** Asks for the new file name (global or workspace) in the quick input. */
export function askSnippetFileName(kind: 'global' | 'workspace'): void {
  showPicker(kind === 'global' ? 'snippetFileGlobal' : 'snippetFileWorkspace')
}

// ---------- Emmet ----------

function emmetEnabled(): boolean {
  if (get().settings['emmet.enabled']) return true
  notify(t().snippets.emmet.disabled, 'info')
  return false
}

export function emmetExpandAbbreviation(): void {
  const file = activeFile()
  if (!file || !emmetEnabled()) return
  if (!expandAbbreviationAtCursor(file.view, false)) notify(t().snippets.emmet.noAbbreviation, 'info')
}

export function openEmmetWrapPicker(): void {
  const file = activeFile()
  if (!file || !emmetEnabled()) return
  if (!markupSyntaxOf(file.view.state)) {
    notify(t().snippets.emmet.unsupported, 'info')
    return
  }
  showPicker('emmetWrap')
}

export function emmetWrap(abbreviation: string): void {
  const file = activeFile()
  if (!file) return
  const syntax = markupSyntaxOf(file.view.state)
  if (!syntax) return
  focusEditor()
  if (!wrapWithAbbreviation(file.view, abbreviation, syntax)) {
    notify(t().snippets.emmet.invalidAbbreviation(abbreviation))
  }
}

export function emmetBalance(direction: 'outward' | 'inward'): void {
  const file = activeFile()
  if (!file || !emmetEnabled()) return
  if (!markupSyntaxOf(file.view.state)) {
    notify(t().snippets.emmet.unsupported, 'info')
    return
  }
  balance(file.view, direction)
}

/** The active tab has Emmet (by language and `emmet.includeLanguages`): the commands only show up in it. */
export function hasEmmet(): boolean {
  const id = activeLanguageId()
  return id !== null && emmetSyntaxFor(id, get().settings['emmet.includeLanguages']) !== null
}
