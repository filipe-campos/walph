import { set, useStore } from '../store'

/** Returns the store to its initial state. Import after `installFakeApi` (the store reads `window.api` on load). */
export function resetStore(): void {
  set(useStore.getInitialState(), true)
}
