import type { Query } from '@anthropic-ai/claude-agent-sdk'
import { TIMEOUT, withDeadline } from '../../util/deadline'
import { normalizeMcpStatus } from '../mcp'

/** Interval between two queries of the MCP servers status. */
const MCP_CONNECT_POLL_MS = 250

interface WatchedRun {
  query: Pick<Query, 'mcpServerStatus'>
  state: { stopped: boolean }
  mcp: { settled: boolean }
}

interface McpConnectHooks {
  /** Maximum wait for the servers still connecting (ms). */
  waitMs: number
  /** The process is still the conversation's (not replaced nor closed). */
  isCurrent(): boolean
  /** The deadline ran out with servers still `pending`. */
  pending(names: string[]): void
  /** Finished waiting (`timedOut`: deadline exceeded or servers hanging). */
  ready(timedOut: boolean): void
}

/**
 * Follows the new process's MCP servers until none is `pending` (or the deadline runs out). Starts right at
 * launch, so it usually finishes before the user sends. Whatever is left hanging becomes a warning, without blocking
 * the send.
 */
export async function waitMcpConnected(run: WatchedRun, hooks: McpConnectHooks): Promise<void> {
  const deadline = Date.now() + hooks.waitMs
  let pending: string[] = []
  let timedOut = false
  const current = (): boolean => hooks.isCurrent() && !run.state.stopped
  try {
    while (current()) {
      const left = deadline - Date.now()
      if (left <= 0) {
        timedOut = true
        break
      }
      const raw = await withDeadline(run.query.mcpServerStatus(), left).catch((): typeof TIMEOUT => TIMEOUT)
      if (raw === TIMEOUT) timedOut = true
      if (raw === TIMEOUT || !hooks.isCurrent()) break
      pending = normalizeMcpStatus(raw)
        .filter((s) => s.status === 'pending')
        .map((s) => s.name)
      if (pending.length === 0) break
      await new Promise((resolve) => setTimeout(resolve, Math.min(MCP_CONNECT_POLL_MS, left)))
    }
    if (pending.length > 0 && current()) hooks.pending(pending)
  } finally {
    run.mcp.settled = true
    if (current()) hooks.ready(timedOut || pending.length > 0)
  }
}
