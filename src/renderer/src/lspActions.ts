// Language (LSP) actions that depend on the store: rename, format, code actions and the LSP state in the store
// (diagnostics, servers, references). Navigation and `WorkspaceEdit` application have their own modules. The
// CodeMirror extensions talk to this module through `lspHost`.
import type { Text } from '@codemirror/state'
import type { TextEdit } from '@shared/searchReplace'
import { t } from '@shared/i18n'
import type { Diagnostic, FileDiagnostics, LspCodeAction, LspLogEntry, LspRefreshKind, LspSymbol } from '@shared/types'
import { pruneTriggers } from './components/editor/lspTriggers'
import { bindLspPaths } from './components/editor/lspSync'
import { bindLspHost, emitLspRefresh, type LspFeature } from './components/editor/lspHost'
import { jumpToOccurrence } from './components/editor/lspDocumentHighlights'
import { openQuickFix } from './components/editor/lspCodeActions'
import { refreshCodeLenses } from './components/editor/lspCodeLens'
import { askRename } from './components/editor/lspRename'
import { refreshLspGutters, setDocumentDiagnostics, syncLspPaths } from './components/editor/documentConfig'
import { hasDocument } from './components/editor/documentState'
import { applyTabEdits } from './components/editor/documentStore'
import { currentState, shownTabId } from './components/editor/groupViews'
import { serverForPath } from './lib/lspServer'
import { flattenSymbols } from './lib/symbolTree'
import { refreshDocumentSymbols } from './components/editor/documentSymbols'
import { lspRangeToOffsets, offsetToLspPosition, rangeToReveal } from '@shared/lspPosition'
import { recordNavigation } from './navigationState'
import { isInside } from './lib/path'
import { createLatest } from './lib/latest'
import { createReactionScope } from './lib/reactions'
import { shallow } from 'zustand/shallow'
import { formatOptions } from './lib/textFormat'
import { lspEditsToOffsetEdits } from './lib/workspaceEdit'
import { defaultIndent, findFileTab, get, set, subscribeDiff, useStore } from './store'
import { attempt } from './attempt'
import { errorMessage } from './lib/errors'
import { notify } from './toasts'
import { saveAllTabs, saveTab } from './saveActions'
import { applySaveTransforms } from './saveTransformActions'
import { activeTab, openFile } from './tabActions'
import { activeFile, fileLines, goToDefinition, openLocation } from './lspNavigationActions'
import { applyWorkspaceEdit, fileTabs, snapshotDocs } from './workspaceEditActions'

const api = window.api

/** Maximum time waited for the server when formatting before saving: saving never gets stuck on it. */
const FORMAT_ON_SAVE_BUDGET_MS = 1500

/** The file's server exists and already accepts requests. */
function isServerReady(path: string): boolean {
  return serverForPath(get().lspStatuses, path)?.state === 'ready'
}

// ---------- Rename ----------

export async function renameSymbol(): Promise<void> {
  const file = activeFile()
  if (!file) return
  const { view, tabId, path } = file
  if (!isServerReady(path)) {
    notify(t().lsp.errors.noActiveServer, 'info')
    return
  }
  const doc = view.state.doc
  const pos = view.state.selection.main.head
  const position = offsetToLspPosition(doc, pos)

  const target = await attempt(
    async () => {
      const prepared = await api.lsp.prepareRename(path, position)
      // Main already uses the word when the server has no `prepareRename`: `null` here means "cannot rename".
      if (!prepared) {
        notify(t().lsp.rename.notRenamable, 'info')
        return null
      }
      return { from: lspRangeToOffsets(doc, prepared.range).from, text: prepared.placeholder }
    },
    { fallback: null }
  )
  if (!target) return
  const { from, text } = target
  if (shownTabId() !== tabId || view.state.doc !== doc) return

  const name = await askRename(view, from, text)
  if (name === null || name === text) return

  const snapshot = snapshotDocs()
  const renamed = await attempt(async () => ({ edit: await api.lsp.rename(path, position, name) }), { fallback: null })
  if (!renamed) return
  const { edit } = renamed
  if (!edit || edit.files.every((f) => f.edits.length === 0)) {
    notify(t().lsp.rename.noChanges, 'info')
    return
  }
  const result = await applyWorkspaceEdit(edit, { snapshot })
  if (!result.ok) return notify(t().lsp.rename.failed(result.reason ?? ''))
  notify(t().lsp.rename.done(result.files), 'info')
}

// ---------- Format ----------

interface FormatOptions {
  /** No notifications (format on save). */
  silent?: boolean
  /** Set when the time budget ran out: the late response is discarded. */
  token?: { cancelled: boolean }
  /** Who applies the edits (offsets of the current document); default = a transaction of their own. */
  apply?: (edits: TextEdit[]) => boolean
}

/** Formats the tab through the server, in one transaction (one undo). `true` if it applied any change. */
async function formatTab(
  tabId: string,
  { silent = false, token, apply = (edits) => applyTabEdits(tabId, edits) }: FormatOptions = {}
): Promise<boolean> {
  const tab = fileTabs().find((t) => t.id === tabId)
  const before = tab && hasDocument(tabId) ? currentState(tabId) : undefined
  if (!tab || !before) return false
  if (!isServerReady(tab.path)) {
    if (!silent) notify(t().lsp.errors.noActiveServer, 'info')
    return false
  }
  const edits = await attempt(
    () => api.lsp.format(tab.path, formatOptions(tab.indent ?? defaultIndent(), get().settings['editor.tabSize'])),
    { fallback: null, quiet: silent }
  )
  if (!edits) return false
  if (token?.cancelled) return false
  const now = currentState(tabId)
  if (!now || (now.doc !== before.doc && !now.doc.eq(before.doc))) {
    if (!silent) notify(t().lsp.format.changedDuring, 'info')
    return false
  }
  return attempt(
    () => {
      // An edit that rewrites the same text does not count: the tab must not become dirty nor gain a pointless undo.
      const offsets = lspEditsToOffsetEdits(now.doc, edits).filter(
        (e) => now.doc.sliceString(e.from, e.to) !== e.insert
      )
      if (offsets.length === 0) {
        if (!silent) notify(t().lsp.format.alreadyFormatted, 'info')
        return false
      }
      return apply(offsets)
    },
    { fallback: false, quiet: silent }
  )
}

export async function formatDocument(): Promise<void> {
  const file = activeFile()
  if (file) await formatTab(file.tabId)
}

async function formatBeforeSave(tabId: string): Promise<void> {
  const token = { cancelled: false }
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      token.cancelled = true
      resolve()
    }, FORMAT_ON_SAVE_BUDGET_MS)
  })
  try {
    // The whitespace fixes go into the same transaction as the formatter (a single undo).
    const apply = (edits: TextEdit[]): boolean => applySaveTransforms(tabId, edits)
    await Promise.race([formatTab(tabId, { silent: true, token, apply }).catch(() => false), timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** Manual save (Save command): formats first if `editor.formatOnSave`, but always saves. */
export async function saveTabManually(id: string): Promise<boolean> {
  if (get().settings['editor.formatOnSave']) await formatBeforeSave(id)
  return saveTab(id)
}

/** Save All: formats the dirty tabs (in parallel) and saves. */
export async function saveAllTabsManually(): Promise<void> {
  if (get().settings['editor.formatOnSave']) {
    const dirty = fileTabs().filter((t) => t.dirty)
    await Promise.all(dirty.map((t) => formatBeforeSave(t.id)))
  }
  await saveAllTabs()
}

// ---------- Code actions ----------

async function runCodeAction(
  path: string,
  action: LspCodeAction,
  doc: Text,
  snapshot: Map<string, Text>
): Promise<void> {
  if (action.disabled) return
  // The tab document changed since the actions were computed: the server edits would point to the wrong place.
  const tab = fileTabs().find((t) => t.path === path && hasDocument(t.id))
  const current = tab ? currentState(tab.id)?.doc : undefined
  if (current && current !== doc && !current.eq(doc)) {
    notify(t().lsp.codeActions.stale, 'info')
    return
  }
  if (action.edit) {
    const result = await applyWorkspaceEdit(action.edit, { snapshot })
    if (!result.ok) return notify(t().lsp.codeActions.applyFailed(action.title, result.reason ?? ''))
  }
  const { command } = action
  if (command) {
    await attempt(() => api.lsp.executeCommand(path, command))
  }
}

export function quickFix(): void {
  const file = activeFile()
  if (file) void openQuickFix(file.view, file.tabId)
}

/** Next/previous highlighted occurrence of the symbol under the cursor (F7 / Shift+F7). */
export function jumpToSymbolHighlight(dir: 1 | -1): void {
  const file = activeFile()
  if (file) jumpToOccurrence(file.view, dir)
}

// ---------- LSP state (diagnostics, servers, references) ----------

/** Diagnostics publication for a file: replaces its previous ones (empty list = clear). */
function setFileDiagnostics({ path, diagnostics }: FileDiagnostics): void {
  const { root, diagnostics: current } = get()
  // Late publications from a previous folder do not enter the current one.
  if (!root || !isInside(root, path)) return
  if (diagnostics.length > 0) return set({ diagnostics: { ...current, [path]: diagnostics } })
  if (!(path in current)) return
  const next = { ...current }
  delete next[path]
  set({ diagnostics: next })
}

/** What each server `workspace/…/refresh` request recomputes. */
const REFRESH: Record<LspRefreshKind, (serverId: string) => void> = {
  inlayHints: (serverId) => emitLspRefresh({ feature: 'inlayHints', serverId }),
  semanticTokens: (serverId) => emitLspRefresh({ feature: 'semanticTokens', serverId }),
  codeLens: () => refreshCodeLenses()
}

const lspStatusSeq = createLatest()

/** Reads the servers state (startup and folder change); an `lsp:status` that arrived before the response is newer. */
export async function refreshLspStatus(): Promise<void> {
  const seq = lspStatusSeq.next()
  await attempt(
    async () => {
      const lspStatuses = await api.lsp.status()
      if (lspStatusSeq.isCurrent(seq)) set({ lspStatuses })
    },
    { format: (message) => t().lsp.errors.server(message) }
  )
}

/** Subscribes to diagnostics and servers state; returns the unsubscribe. */
export function watchLsp(): () => void {
  const scope = createReactionScope()
  scope.add(api.lsp.onDiagnostics(setFileDiagnostics))
  scope.add(api.lsp.onRefresh(({ kind, serverId }) => REFRESH[kind](serverId)))
  scope.add(
    api.lsp.onStatus((lspStatuses) => {
      lspStatusSeq.invalidate()
      set({ lspStatuses })
    })
  )
  void refreshLspStatus()
  return scope.stop
}

/** Subscribes to new lines of the servers log (Output view); returns the unsubscribe. */
export function subscribeLog(listener: (entries: LspLogEntry[]) => void): () => void {
  return api.lsp.onLog(listener)
}

/** File symbols (`@` picker), flattened; the error propagates to whoever shows them. */
export async function fetchDocumentSymbols(path: string): Promise<LspSymbol[]> {
  return flattenSymbols(await api.lsp.documentSymbols(path), path)
}

/** Workspace symbols for `query` (`#` picker); the error propagates to whoever shows them. */
export function fetchWorkspaceSymbols(query: string): Promise<LspSymbol[]> {
  return api.lsp.workspaceSymbols(query)
}

/** Servers log history; a failure becomes a notification and an empty list. */
export async function loadLspLog(): Promise<LspLogEntry[]> {
  return attempt(() => api.lsp.log(), { format: (message) => t().lsp.panels.outputFailed(message), fallback: [] })
}

/** Clears the list; the References view disappears and, if it was open, the panel goes back to Problems. */
export function clearReferences(): void {
  set((s) => ({ references: null, panelView: s.panelView === 'references' ? 'problems' : s.panelView }))
}

/** "Restart Language Server": the one of the active file, if any, otherwise all of them. */
export async function restartLanguageServer(): Promise<void> {
  const { lspStatuses } = get()
  const tab = activeTab()
  const server = tab?.kind === 'file' ? serverForPath(lspStatuses, tab.path) : null
  await attempt(() => api.lsp.restart(server?.id))
}

/** Opens the problem's file (preview tab) and selects the range. `column` and `length` in UTF-16 units. */
export function openProblem(path: string, diagnostic: Diagnostic): void {
  recordNavigation()
  openFile(path, rangeToReveal(diagnostic.range), { preview: true })
}

// ---------- Binding with the editor extensions ----------

function bindEditorLsp(): void {
  bindLspPaths((tabId) => findFileTab(tabId)?.path)
  bindLspHost({
    serverFor: (path) => {
      const server = serverForPath(get().lspStatuses, path)
      return server ? { id: server.id, ready: server.state === 'ready' } : null
    },
    goToDefinitionAt: (offset) => void goToDefinition(offset),
    applyCodeAction: (path, action, doc, snapshot) => runCodeAction(path, action, doc, snapshot),
    snapshotDocs,
    openLocation,
    readLines: fileLines,
    runLensCommand: (path, command) => void attempt(() => api.lsp.executeCommand(path, command)),
    notify: (text, kind) => notify(text, kind),
    notifyError: (err) => notify(errorMessage(err)),
    featureEnabled
  })
}

function featureEnabled(feature: LspFeature): boolean {
  const { settings } = get()
  if (feature === 'inlayHints') return settings['editor.inlayHints.enabled'] === 'on'
  if (feature === 'semanticTokens') return settings['editor.semanticHighlighting.enabled']
  return true
}

function unbindEditorLsp(): void {
  bindLspPaths(() => undefined)
}

export function startLspReactions(): () => void {
  const scope = createReactionScope()
  scope.bindGlobal(bindEditorLsp, unbindEditorLsp)
  // Servers status changed: toggles the lightbulb gutter per tab and discards the trigger characters of servers that
  // restarted (left `ready`) or disappeared, they may belong to another instance.
  scope.add(
    useStore.subscribe(
      (s) => s.lspStatuses,
      (lspStatuses) => {
        refreshLspGutters()
        refreshDocumentSymbols()
        pruneTriggers(new Set(lspStatuses.filter((l) => l.state === 'ready').map((l) => l.id)))
      }
    )
  )
  // A server that became ready (or went down) changes what the views can request: inlay hints, occurrences and tokens.
  scope.add(
    useStore.subscribe(
      (s) =>
        s.lspStatuses
          .filter((l) => l.state === 'ready')
          .map((l) => l.id)
          .join('\n'),
      () => emitLspRefresh()
    )
  )
  scope.add(
    useStore.subscribe(
      (s) => s.settings['editor.inlayHints.enabled'],
      () => emitLspRefresh({ feature: 'inlayHints' })
    )
  )
  scope.add(
    useStore.subscribe(
      (s) => s.settings['editor.semanticHighlighting.enabled'],
      () => emitLspRefresh({ feature: 'semanticTokens' })
    )
  )
  // Renaming/moving open files: the LSP closes the old path and opens the new one.
  scope.add(
    useStore.subscribe(
      (s) => s.tabs,
      () => syncLspPaths()
    )
  )
  // Published diagnostics go to the EditorState of the file's tab (visible or stored).
  // Also reapplies when the tab path changes (rename): the diagnostics of the new path (usually none) replace the old
  // ones, otherwise the markers of the previous file would stay in the editor.
  scope.add(
    subscribeDiff(
      (s) => [s.diagnostics, s.tabs] as const,
      ([diagnostics, tabs], [prevDiagnostics, prevTabs]) => {
        const prevPaths = tabs === prevTabs ? null : new Map(prevTabs.map((t) => [t.id, t.path]))
        for (const tab of tabs) {
          if (tab.kind !== 'file' || !hasDocument(tab.id)) continue
          const next = diagnostics[tab.path]
          const before = prevDiagnostics[prevPaths?.get(tab.id) ?? tab.path]
          if (next !== before) setDocumentDiagnostics(tab.id, next ?? [])
        }
      },
      shallow
    )
  )
  return scope.stop
}
