// Syncs the open documents with main's LSP client (`didOpen` / `didChange` / `didSave` / `didClose`).
// It sits next to `documentStore.ts` (which calls these functions wherever it touches a tab document) and, like it,
// does not import the store: the path of each tab is injected by `bindLspPaths`. Main decides which files have a server
// (extension and window folder) and ignores the others, so every loaded file is reported.
import type { ChangeSet, Text } from '@codemirror/state'
import { changesToLsp } from '@shared/lspPosition'

interface OpenDoc {
  path: string
  /** Document version on the server: 1 on `open`, +1 on each `change`. */
  version: number
}

const opened = new Map<string, OpenDoc>()
let pathOf: (tabId: string) => string | undefined = () => undefined

/** The store reports the current path of each file tab (changes on rename). */
export function bindLspPaths(resolver: (tabId: string) => string | undefined): void {
  pathOf = resolver
}

/** Path the tab was opened with on the server (the LSP extensions ask by it); `undefined` if it is not open. */
export function lspDocPath(tabId: string): string | undefined {
  return opened.get(tabId)?.path
}

/** Current version of the document open at this path on the server (the one main mirrors); `undefined` if not open. */
export function lspDocVersion(path: string): number | undefined {
  for (const doc of opened.values()) if (doc.path === path) return doc.version
  return undefined
}

/** The tab document was just loaded: `didOpen` with the full text (`\n` line breaks). */
export function lspOpen(tabId: string, text: string): void {
  const path = pathOf(tabId)
  if (!path) return
  if (opened.has(tabId)) lspClose(tabId)
  opened.set(tabId, { path, version: 1 })
  window.api.lsp.open(path, text, 1)
}

/** The document changed: `changes` are the changes in `startDoc` coordinates. */
export function lspChange(tabId: string, startDoc: Text, changes: ChangeSet): void {
  const doc = opened.get(tabId)
  if (!doc || changes.empty) return
  doc.version++
  window.api.lsp.change(doc.path, doc.version, changesToLsp(startDoc, changes))
}

/** The file was saved to disk. */
export function lspSave(tabId: string): void {
  const doc = opened.get(tabId)
  if (doc) window.api.lsp.save(doc.path)
}

/** The tab was closed (or the document discarded). */
export function lspClose(tabId: string): void {
  const doc = opened.get(tabId)
  if (!doc) return
  opened.delete(tabId)
  window.api.lsp.close(doc.path)
}

/**
 * Renamed tabs (or moved with the folder): closes the old path and opens the new one with the current text, keeping the
 * version count. `textOf` returns the tab text (or `undefined` if it is no longer loaded).
 */
export function lspReconcilePaths(textOf: (tabId: string) => string | undefined): void {
  for (const [tabId, doc] of opened) {
    const path = pathOf(tabId)
    if (!path || path === doc.path) continue
    const text = textOf(tabId)
    window.api.lsp.close(doc.path)
    if (text === undefined) {
      opened.delete(tabId)
      continue
    }
    doc.path = path
    doc.version++
    window.api.lsp.open(path, text, doc.version)
  }
}
