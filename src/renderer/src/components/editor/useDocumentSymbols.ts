import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { LspDocumentSymbol } from '@shared/types'
import { offsetToLspPosition } from '@shared/lspPosition'
import { symbolIndexPathAt, symbolsAtPath } from '../../lib/symbolTree'
import { documentSymbolsOf, watchDocumentSymbols } from './documentSymbols'
import { getView, shownTabId } from './groupViews'
import { subscribeViewChanges } from './viewEvents'

const noop = (): void => {}
const subscribeViews = (onChange: () => void): (() => void) => subscribeViewChanges(() => onChange())

/** Symbol tree of the tab (`null` while not computed or without a tab); observes the tab while mounted. */
export function useDocumentSymbols(tabId: string | null): LspDocumentSymbol[] | null {
  const subscribe = useCallback(
    (onChange: () => void) => (tabId ? watchDocumentSymbols(tabId, onChange) : noop),
    [tabId]
  )
  return useSyncExternalStore(subscribe, () => (tabId ? documentSymbolsOf(tabId) : null))
}

/**
 * Symbols (from outside in) enclosing the cursor of the group view, if it shows the tab. The snapshot is the index
 * path: moving the cursor within the same symbol does not re-render the consumers.
 */
export function useSymbolPathAtCursor(
  groupId: string | null,
  tabId: string | null,
  tree: LspDocumentSymbol[] | null
): LspDocumentSymbol[] {
  const snapshot = useCallback((): string => {
    if (!tree || !groupId || !tabId) return ''
    const view = getView(groupId)
    if (!view || shownTabId(groupId) !== tabId) return ''
    const { doc, selection } = view.state
    return symbolIndexPathAt(tree, offsetToLspPosition(doc, selection.main.head)).join(',')
  }, [groupId, tabId, tree])
  const key = useSyncExternalStore(subscribeViews, snapshot)
  return useMemo(() => (tree && key ? symbolsAtPath(tree, key.split(',').map(Number)) : []), [tree, key])
}
