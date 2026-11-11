// Progress in flight: tool time, subagent summary and blocked tool label. Pure.
import { formatNumber, t } from '@shared/i18n'
import type { ClaudeTaskProgress } from '@shared/types'
import { parseMcpName } from './claudeTools'

/** "42 s", "1 min 05 s", "1 h 02 min" (whole seconds coming from main). */
export function formatToolElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  if (total < 60) return `${total} s`
  const minutes = Math.floor(total / 60)
  if (minutes < 60) return `${minutes} min ${String(total % 60).padStart(2, '0')} s`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
}

/** "12,3 mil tokens", "850 tokens", "1,2 mi de tokens". */
export function formatTokenCount(tokens: number): string {
  const m = t().claude.progress
  const oneDecimal = (n: number): string => formatNumber(n, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  if (tokens < 1000) return m.tokens(Math.round(tokens))
  if (tokens < 1_000_000) return m.thousandTokens(oneDecimal(tokens / 1000))
  return m.millionTokens(oneDecimal(tokens / 1_000_000))
}

/** "3 ferramentas · 12,3 mil tokens" (singular at 1; no tools and no tokens = `null`). */
export function formatAgentStats(progress: Pick<ClaudeTaskProgress, 'toolUses' | 'totalTokens'>): string | null {
  const parts: string[] = []
  if (progress.toolUses > 0) parts.push(t().claude.progress.tools(progress.toolUses))
  if (progress.totalTokens > 0) parts.push(formatTokenCount(progress.totalTokens))
  return parts.length > 0 ? parts.join(' · ') : null
}

/** Name of the blocked tool: MCP becomes `server · tool`, the rest stays as the CLI calls it. */
export function deniedToolLabel(toolName: string): string {
  const mcp = parseMcpName(toolName)
  return mcp ? `${mcp.server} · ${mcp.tool}` : toolName
}
