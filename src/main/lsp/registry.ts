import type { WebContents } from 'electron'
import { send } from '../window/send'
import { getEffectiveSettings } from '../settings/state'
import { createViewRegistry } from '../window/viewResources'
import { getWindowRoot } from '../window/windows'
import { isActiveView } from '../workspace/isActiveView'
import { LspManager } from './manager'
import { markAllLanguageServersQuitting } from './server'

// One manager per view: servers, documents and log belong to it. Each reload creates a new manager on the same `wc`.
const CURRENT = 'current'
const managers = createViewRegistry<LspManager>({
  key: 'lsp',
  dispose: (manager) => manager.dispose(),
  disposeSync: (all) => {
    for (const manager of all) manager.killAll()
  }
})

/** The view's LSP manager, if it already exists (IDE tools of the Claude panel). */
export function lspManagerOf(wc: WebContents): LspManager | undefined {
  return managers.get(wc, CURRENT)
}

/** The view's one, created on the first opened file. */
export function ensureLspManager(wc: WebContents): LspManager {
  const existing = lspManagerOf(wc)
  if (existing) return existing
  const manager = new LspManager({
    getRoot: () => getWindowRoot(wc),
    getServersSetting: () => getEffectiveSettings(wc)['lsp.servers'],
    emitDiagnostics: (d) => send(wc, 'lsp:diagnostics', d),
    emitStatus: (list) => send(wc, 'lsp:statusChanged', list),
    emitLog: (entries) => send(wc, 'lsp:logAppended', entries),
    emitApplyEdit: (request) => send(wc, 'lsp:applyEdit', request),
    emitApplyEditCancelled: (id) => send(wc, 'lsp:applyEditCancelled', id),
    emitRefresh: (refresh) => send(wc, 'lsp:refresh', refresh)
  })
  managers.add(wc, CURRENT, manager)
  manager.setActive(isActiveView(wc))
  return manager
}

/** Workspace activated or switched: each manager starts tracking whether its view is the active one. */
export function syncLspActivity(): void {
  for (const [wc, manager] of managers.entries()) if (!wc.isDestroyed()) manager.setActive(isActiveView(wc))
}

/** `will-quit`: marks the servers as stopping; `killAllSpawnedGroups` (later, in `index.ts`) kills them. */
export function killAllLsp(): void {
  managers.disposeAllSync()
  // Includes those that already left the map (window closed) and are still in the asynchronous `shutdown`.
  markAllLanguageServersQuitting()
}
