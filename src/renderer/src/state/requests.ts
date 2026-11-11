import type { RequestsState } from '../types/requests'

/** Pending requests apply to the folder they were born in (paths, hashes and groups do not exist in the next one). */
export function scopedRequestsState(): RequestsState {
  return { requests: {} }
}
