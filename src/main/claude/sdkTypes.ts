// Places where Walph goes beyond the Agent SDK types. SDK version: the one in `package.json` (pinned, today 0.3.302).
// The CLI emits messages and exposes methods that this version's types do not have yet; the `as` casts all live here,
// with the runtime check, and callers work with already handled `unknown`/`Record` (see `sdkEvents.ts`).
// When updating the SDK, check whether any of these got a type and delete the matching cast.

import { t } from '@shared/i18n'
import type { Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { UserError } from '../errors'

/** The message as a loose object: the CLI is the source and nothing in it is trusted (`normalize*` check fields). */
export function asRecord(message: SDKMessage): Record<string, unknown> {
  return message
}

/** `system` with a subtype the types do not list (e.g. `local_command_output`, `api_retry`, `commands_changed`). */
export function isUntypedSystem(message: SDKMessage, subtype: string): boolean {
  return message.type === 'system' && (message.subtype as string) === subtype
}

/** `Query` methods the CLI has and the types do not. */
export type UntypedQueryMethod = 'mcpAuthenticate' | 'mcpClearAuth' | 'mcpSubmitOAuthCallbackUrl'

/** The `Query` method already bound to it; throws if this CLI does not have it. */
export function mcpExtra(query: Query, method: UntypedQueryMethod): (...args: string[]) => Promise<unknown> {
  const fn = (query as unknown as Record<string, unknown>)[method]
  if (typeof fn !== 'function') throw new UserError(t().claudeHost.mcp.actionUnsupported)
  return (...args) => (fn as (...a: string[]) => Promise<unknown>).apply(query, args)
}
