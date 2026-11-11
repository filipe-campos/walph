// Bridge between the CodeMirror extensions that talk to the LSP and the rest of the app. The extensions enter in
// `documentStore.ts` (which does not import the store); what needs the store (opening files, applying a
// `WorkspaceEdit`,
// notifying the user) is injected by `lspActions.ts` at startup, as `bindDocumentHandlers` does for dirty/cursor.
import { Facet, type Text } from '@codemirror/state'
import type { LspCodeAction, LspCommand, LspLocation } from '@shared/types'

export interface LspHost {
  /** Server that serves the file (`null` = none) and whether it already accepts requests. */
  serverFor(path: string): { id: string; ready: boolean } | null
  /** ⌘-click: Go to Definition at the position (offset of the visible document). */
  goToDefinitionAt(offset: number): void
  /** Applies the code action (edit, then command). `doc` is the document it was computed on. */
  applyCodeAction(path: string, action: LspCodeAction, doc: Text, snapshot: Map<string, Text>): Promise<void>
  /** Documents of the tabs loaded now (to refuse edits computed on a text that changed). */
  snapshotDocs(): Map<string, Text>
  /** Opens the location in a tab (preview), recording where it came from (peek, code lens). */
  openLocation(location: LspLocation): void
  /** Lines of the file: from the loaded tab document, otherwise from disk; `null` if it could not be read. */
  readLines(path: string): Promise<string[] | null>
  /** Runs a code lens command on the file server (errors become notices). */
  runLensCommand(path: string, command: LspCommand): void
  notify(text: string, kind?: 'error' | 'info'): void
  /** Shows the error of a server call (main's message without the Electron prefix). */
  notifyError(err: unknown): void
  /** Setting that turns an LSP-fed editor feature on/off. */
  featureEnabled(feature: LspFeature): boolean
}

/** Features that ask the server for data by themselves (without a user command) and redraw on a `refresh`. */
export type LspFeature = 'inlayHints' | 'documentHighlights' | 'semanticTokens'

/** Without `feature` = all; without `serverId` = any server. */
export interface LspFeatureRefresh {
  feature?: LspFeature
  serverId?: string
}

let host: LspHost = {
  serverFor: () => null,
  goToDefinitionAt: () => {},
  applyCodeAction: async () => {},
  snapshotDocs: () => new Map(),
  openLocation: () => {},
  readLines: () => Promise.resolve(null),
  runLensCommand: () => {},
  notify: () => {},
  notifyError: () => {},
  featureEnabled: () => false
}

export function bindLspHost(next: LspHost): void {
  host = next
}

export function lspHost(): LspHost {
  return host
}

/** Id of the tab owning the state: async effects check the view still shows the same tab. */
export const lspTabId = Facet.define<string, string>({ combine: (values) => values[0] ?? '' })

const refreshListeners = new Set<(refresh: LspFeatureRefresh) => void>()

/** A setting changed, a server became ready or asked for `refresh`: the views ask for the data again. */
export function emitLspRefresh(refresh: LspFeatureRefresh = {}): void {
  for (const listener of [...refreshListeners]) listener(refresh)
}

export function onLspRefresh(listener: (refresh: LspFeatureRefresh) => void): () => void {
  refreshListeners.add(listener)
  return () => refreshListeners.delete(listener)
}
