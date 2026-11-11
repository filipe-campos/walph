// Symbol tree of the tabs someone is showing (breadcrumbs of each group, Outline): from the language server when one is
// ready for the file, otherwise from the Lezer tree. Redone with a delay after each change of the text or of the syntax
// tree; only the observed tabs (`watchDocumentSymbols`) are computed. No store: the path and the server come from
// `lspSync`/`lspHost`.
import type { LspDocumentSymbol } from '@shared/types'
import { sameSymbolTree } from '../../lib/symbolTree'
import { syntaxSymbols } from '../../lib/syntaxSymbols'
import { subscribeDocChanges } from './documentState'
import { currentState } from './groupViews'
import { lspHost, lspTabId } from './lspHost'
import { lspDocPath } from './lspSync'
import { subscribeViewChanges } from './viewEvents'

const REFRESH_DELAY_MS = 350

interface Entry {
  listeners: Set<() => void>
  tree: LspDocumentSymbol[] | null
  timer: ReturnType<typeof setTimeout> | null
  seq: number
}

const entries = new Map<string, Entry>()
let started = false

function start(): void {
  if (started) return
  started = true
  subscribeDocChanges((tabId) => schedule(tabId))
  subscribeViewChanges(({ view, syntax }) => {
    const tabId = syntax ? view.state.facet(lspTabId) : ''
    if (tabId) schedule(tabId)
  })
}

function schedule(tabId: string, delay = REFRESH_DELAY_MS): void {
  const entry = entries.get(tabId)
  if (!entry) return
  if (entry.timer) clearTimeout(entry.timer)
  entry.timer = setTimeout(() => {
    entry.timer = null
    void refresh(tabId, entry)
  }, delay)
}

async function compute(tabId: string): Promise<LspDocumentSymbol[] | null> {
  if (!currentState(tabId)) return null
  const path = lspDocPath(tabId)
  if (path && lspHost().serverFor(path)?.ready) {
    try {
      const tree = await window.api.lsp.documentSymbols(path)
      if (tree.length > 0) return tree
    } catch {
      // Server failure or deadline: the syntax tree still gives an answer.
    }
  }
  const state = currentState(tabId)
  return state ? syntaxSymbols(state) : null
}

async function refresh(tabId: string, entry: Entry): Promise<void> {
  const seq = ++entry.seq
  const tree = await compute(tabId)
  if (entries.get(tabId) !== entry || entry.seq !== seq || !tree) return
  if (entry.tree && sameSymbolTree(entry.tree, tree)) return
  entry.tree = tree
  for (const listener of [...entry.listeners]) listener()
}

/** Starts tracking the tab symbols; `listener` runs when the tree changes. Returns the unsubscribe. */
export function watchDocumentSymbols(tabId: string, listener: () => void): () => void {
  start()
  let entry = entries.get(tabId)
  if (!entry) {
    entry = { listeners: new Set(), tree: null, timer: null, seq: 0 }
    entries.set(tabId, entry)
    schedule(tabId, 0)
  }
  const current = entry
  current.listeners.add(listener)
  return () => {
    current.listeners.delete(listener)
    if (current.listeners.size > 0 || entries.get(tabId) !== current) return
    if (current.timer) clearTimeout(current.timer)
    entries.delete(tabId)
  }
}

/** Last tree computed for the observed tab (`null` = not computed yet or tab not observed). */
export function documentSymbolsOf(tabId: string): LspDocumentSymbol[] | null {
  return entries.get(tabId)?.tree ?? null
}

/** Recomputes every observed tab (a server became ready or went down). */
export function refreshDocumentSymbols(): void {
  for (const tabId of entries.keys()) schedule(tabId, 0)
}
