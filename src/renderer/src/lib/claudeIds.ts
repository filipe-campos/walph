// Panel conversation ids: the dormant one (`dormant:…`) is UI-only and never reaches main; the live one is what main
// knows.
import type { ClaudeApi, ClaudeConversationId } from '@shared/types'

export const DORMANT_PREFIX = 'dormant:'

/** Id that main knows (never `dormant:`). Exists only as a type: at runtime it is still a string. */
export type LiveConversationId = ClaudeConversationId & { readonly __live: unique symbol }

/** Live id, or `null` if it belongs to a dormant tab. */
export function liveId(id: string): LiveConversationId | null {
  return id.startsWith(DORMANT_PREFIX) ? null : (id as LiveConversationId)
}

/**
 * Only for ids that came from main itself (events, `start`): already live by definition. A UI id goes through `liveId`.
 */
export function asLiveId(id: ClaudeConversationId): LiveConversationId {
  return id as LiveConversationId
}

type IdMethod =
  | 'send'
  | 'interrupt'
  | 'stopTask'
  | 'close'
  | 'respond'
  | 'setPermissionMode'
  | 'setModel'
  | 'setEffort'
  | 'commands'
  | 'contextUsage'
  | 'usage'
  | 'mcpStatus'
  | 'mcpToggle'
  | 'mcpReconnect'
  | 'mcpAuthenticate'
  | 'mcpSubmitCallback'
  | 'mcpClearAuth'
  | 'mcpAdd'
  | 'mcpRemove'
  | 'rewind'
  | 'fork'
  | 'exportMarkdown'
  | 'markRead'

type WithLiveId<F> = F extends (id: ClaudeConversationId, ...rest: infer R) => infer Ret
  ? (id: LiveConversationId, ...rest: R) => Ret
  : never

/** `ClaudeApi` with the per-conversation call id requiring `LiveConversationId` (the bridge itself does not change). */
export type LiveClaudeApi = Omit<ClaudeApi, IdMethod> & { [K in IdMethod]: WithLiveId<ClaudeApi[K]> }

/**
 * The same bridge: `getApi()` is called on each access, so only `api.claude` is re-read (`api` itself is the import's);
 * only the type changes.
 */
export function liveClaudeApi(getApi: () => ClaudeApi): LiveClaudeApi {
  return new Proxy({} as LiveClaudeApi, { get: (_, key): unknown => Reflect.get(getApi(), key) })
}
