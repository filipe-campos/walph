// Base of the resources the editor asks the LSP for by itself (inlay hints, occurrences, semantic tokens): a ViewPlugin
// that waits for the trigger to settle, asks the server and only delivers the response if the document is still the
// same.
import type { Text } from '@codemirror/state'
import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view'
import { lspHost, onLspRefresh, type LspFeature } from './lspHost'
import { lspDocPath, lspDocVersion } from './lspSync'

export interface LspFetchSpec<T> {
  feature: LspFeature
  /** Wait (ms) after a trigger; triggers in a row restart the wait. */
  delay: number
  /** The update calls for a new request. */
  shouldFetch(update: ViewUpdate): boolean
  /** The request to the server; `null` = nothing to ask now (equivalent to an empty response). */
  request(view: EditorView, path: string): Promise<T> | null
  /** Delivers the response, computed on `doc`; `null` = clear. Called outside the view update cycle. */
  apply(view: EditorView, result: T | null, doc: Text): void
}

/** First request on view mount (tab shown): short, the tab just appeared. */
const MOUNT_DELAY_MS = 50

export function lspFetch<T>(tabId: string, spec: LspFetchSpec<T>) {
  return ViewPlugin.define((view) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let seq = 0
    let destroyed = false

    const run = async (): Promise<void> => {
      const current = ++seq
      const doc = view.state.doc
      const path = lspDocPath(tabId)
      const host = lspHost()
      const pending =
        path && host.featureEnabled(spec.feature) && host.serverFor(path)?.ready ? spec.request(view, path) : null
      if (!path || !pending) {
        spec.apply(view, null, doc)
        return
      }
      const version = lspDocVersion(path)
      let result: T
      try {
        result = await pending
      } catch {
        // Opportunistic: a server error does not become a notice on every edit or scroll.
        return
      }
      if (destroyed || current !== seq || view.state.doc !== doc || lspDocVersion(path) !== version) return
      spec.apply(view, result, doc)
    }

    const schedule = (ms: number): void => {
      clearTimeout(timer)
      timer = setTimeout(() => void run(), ms)
    }

    const unsubscribe = onLspRefresh((refresh) => {
      if (refresh.feature && refresh.feature !== spec.feature) return
      const path = lspDocPath(tabId)
      if (refresh.serverId && (!path || lspHost().serverFor(path)?.id !== refresh.serverId)) return
      schedule(0)
    })
    schedule(MOUNT_DELAY_MS)

    return {
      update(update: ViewUpdate) {
        if (spec.shouldFetch(update)) schedule(spec.delay)
      },
      destroy() {
        destroyed = true
        clearTimeout(timer)
        unsubscribe()
      }
    }
  })
}
