// Trigger characters (completion and signature help) per server, requested once and shared. The cache is
// invalidated when the server leaves `ready` or disappears (a restart changes the capabilities) and failures are never
// cached.
export interface Triggers {
  completion: string[]
  signature: string[]
  signatureRetrigger: string[]
}

const cache = new Map<string, Promise<Triggers>>()
const NONE: Triggers = { completion: [], signature: [], signatureRetrigger: [] }

export function serverTriggers(path: string, serverId: string): Promise<Triggers> {
  let cached = cache.get(serverId)
  if (!cached) {
    const request = window.api.lsp.triggerCharacters(path)
    cached = request.catch(() => {
      // A failure is not cached: the next request tries again.
      if (cache.get(serverId) === cached) cache.delete(serverId)
      return NONE
    })
    cache.set(serverId, cached)
  }
  return cached
}

export function forgetTriggers(serverId: string): void {
  cache.delete(serverId)
}

/** Forgets the servers that are no longer ready (or left the list). */
export function pruneTriggers(readyIds: ReadonlySet<string>): void {
  for (const id of [...cache.keys()]) if (!readyIds.has(id)) cache.delete(id)
}
