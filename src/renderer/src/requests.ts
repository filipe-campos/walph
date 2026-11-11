// One-shot requests to views mounted on demand (e.g. a command opens the Git view and asks for focus on the
// commit box). The request stays in the store until the view exists and handles it; focus for already mounted views
// uses `focusBridge.ts`.
import { get, set } from './store'
import type { PendingRequest, RequestKind, RequestPayloads } from './types/requests'

let seq = 0

type PayloadArgs<K extends RequestKind> = RequestPayloads[K] extends void ? [] : [payload: RequestPayloads[K]]

/** Registers the request (replaces the pending one of the same type). */
export function requestOnce<K extends RequestKind>(kind: K, ...args: PayloadArgs<K>): void {
  const request = { seq: ++seq, payload: args[0] } as PendingRequest<K>
  set((s) => ({ requests: { ...s.requests, [kind]: request } }))
}

/** Removes the handled request; a newer request of the same type (another `seq`) stays pending. */
export function takeRequest(kind: RequestKind, requestSeq: number): void {
  if (get().requests[kind]?.seq !== requestSeq) return
  set((s) => {
    const { [kind]: _taken, ...rest } = s.requests
    return { requests: rest }
  })
}
