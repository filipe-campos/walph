/** One-shot requests to a view that may not exist yet (see `requests.ts`). */
export interface RequestPayloads {
  searchFocus: void
  commitFocus: void
  historyScroll: void
  historyReveal: { hash: string }
  explorerReveal: { path: string }
  groupFocus: { groupId: string }
  breadcrumbsFocus: { groupId: string }
}

export type RequestKind = keyof RequestPayloads

export interface PendingRequest<K extends RequestKind = RequestKind> {
  /** Unique per request: two equal requests in a row are still two. */
  seq: number
  payload: RequestPayloads[K]
}

type PendingRequests = { [K in RequestKind]?: PendingRequest<K> }

export interface RequestsState {
  /** One pending request per type; the consumer takes it away when handling it. */
  requests: PendingRequests
}
