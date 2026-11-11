import { useMemo } from 'react'
import type { LspSymbol } from '@shared/types'
import { errorMessage } from '../../lib/errors'
import { useAsync, type AsyncState } from '../common/useAsync'
import { fetchDocumentSymbols, fetchWorkspaceSymbols } from '../../lspActions'

export type SymbolsLoaded = { key: string; symbols: LspSymbol[] } | { key: string; error: string }

/** Pause after the last keystroke before asking the server (each search walks the whole project). */
const WORKSPACE_SYMBOLS_DEBOUNCE_MS = 150

/**
 * Symbols of the active file (`@`). Fetches once per file while the mode is active. `null` while loading or
 * without a file; the result stores the path it belongs to, so switching files never shows the previous list.
 */
export function useDocumentSymbols(enabled: boolean, path: string | null): SymbolsLoaded | null {
  const load = useAsync(() => fetchDocumentSymbols(path!), [path], { enabled: enabled && !!path })
  return useSymbolsResult(path, load)
}

/**
 * Workspace symbols (`#`) for `query`, with a delay after the last keystroke. An empty query asks nothing.
 * `null` while the response for the current query has not arrived.
 */
export function useWorkspaceSymbols(enabled: boolean, query: string): SymbolsLoaded | null {
  const load = useAsync(() => fetchWorkspaceSymbols(query), [query], {
    enabled: enabled && !!query,
    delayMs: WORKSPACE_SYMBOLS_DEBOUNCE_MS
  })
  return useSymbolsResult(query, load)
}

function useSymbolsResult(key: string | null, { status, value, error }: AsyncState<LspSymbol[]>): SymbolsLoaded | null {
  return useMemo(() => {
    if (key === null) return null
    if (status === 'success') return { key, symbols: value! }
    if (status === 'error') return { key, error: errorMessage(error) }
    return null
  }, [key, status, value, error])
}
