import { useEffect } from 'react'
import { takeRequest } from '../../requests'
import { useStore } from '../../store'
import type { PendingRequest, RequestKind, RequestPayloads } from '../../types/requests'

/**
 * Serves the pending request of `kind` (if `match` accepts the payload) after the commit: removes the request from the
 * store and calls `handle`. Returns the request while it is pending, for whoever needs to derive state from it during
 * render. `handle` and `match` may be inline functions.
 */
export function useRequest<K extends RequestKind>(
  kind: K,
  handle: (payload: RequestPayloads[K]) => void,
  match?: (payload: RequestPayloads[K]) => boolean
): PendingRequest<K> | null {
  const pending = useStore((s) => s.requests[kind]) as PendingRequest<K> | undefined
  const mine = pending && (!match || match(pending.payload)) ? pending : null
  useEffect(() => {
    if (!mine) return
    takeRequest(kind, mine.seq)
    handle(mine.payload)
  }, [kind, mine, handle])
  return mine
}
