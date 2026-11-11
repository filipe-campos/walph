// Subagents (`Agent`/`Task` tools) of the current turn for the "Agents" strip of the Claude panel. Pure.
import { isRecord } from '@shared/guards'
import { t, type Messages } from '@shared/i18n'
import type { ClaudeBlock, ClaudeMessage } from '@shared/types'
import { turnStartIndex } from './claudeTurnSummary'

const AGENT_TOOLS = new Set(['Agent', 'Task'])

type ToolUse = Extract<ClaudeBlock, { type: 'toolUse' }>

/**
 * `ClaudeMessage` has no time: the renderer records `Date.now()` the first time it sees an agent's call and result
 * (`toolUse` ids). Resumed history never went through here: no time, no duration on screen.
 */
export interface AgentTimes {
  started: Map<string, number>
  finished: Map<string, number>
}

export const createAgentTimes = (): AgentTimes => ({ started: new Map(), finished: new Map() })

export type AgentStatus = 'running' | 'done' | 'failed' | 'stopped'

export interface AgentRow {
  toolUseId: string
  /** `subagent_type` or "Agente". */
  name: string
  /** `description` (or the first line of the `prompt`). */
  task: string
  status: AgentStatus
  startedAt: number | null
  finishedAt: number | null
}

function isAgentUse(block: ClaudeBlock, message: ClaudeMessage): block is ToolUse {
  // Agents inside agents (parentToolUseId) are left out: the strip shows those of the main conversation.
  return block.type === 'toolUse' && AGENT_TOOLS.has(block.name) && message.parentToolUseId === null
}

/** Records the times of a message that just arrived (call on receiving the event, before it goes into the state). */
export function recordAgentTimes(times: AgentTimes, message: ClaudeMessage, now: number): void {
  for (const block of message.blocks) {
    if (isAgentUse(block, message)) {
      if (!times.started.has(block.toolUseId)) times.started.set(block.toolUseId, now)
    } else if (block.type === 'toolResult' && times.started.has(block.toolUseId)) {
      if (!times.finished.has(block.toolUseId)) times.finished.set(block.toolUseId, now)
    }
  }
}

/** Forgets the agent times of a conversation that closed. */
export function forgetAgentTimes(times: AgentTimes, messages: readonly ClaudeMessage[]): void {
  for (const m of messages)
    for (const b of m.blocks)
      if (b.type === 'toolUse' || b.type === 'toolResult') {
        const id = b.toolUseId
        times.started.delete(id)
        times.finished.delete(id)
      }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Agents of the current turn, in the order they were called. Without a result: `running` while the conversation works,
 * `stopped` afterwards (turn interrupted, the result will never come). Result with an error = `failed`.
 */
export function turnAgents(
  messages: readonly ClaudeMessage[],
  times: AgentTimes,
  working: boolean,
  text: Messages['claude']['agents'] = t().claude.agents
): AgentRow[] {
  const turn = messages.slice(turnStartIndex(messages))
  const results = new Map<string, Extract<ClaudeBlock, { type: 'toolResult' }>>()
  for (const m of turn) for (const b of m.blocks) if (b.type === 'toolResult') results.set(b.toolUseId, b)

  const rows: AgentRow[] = []
  for (const m of turn) {
    if (m.role !== 'assistant') continue
    for (const block of m.blocks) {
      if (!isAgentUse(block, m)) continue
      const input = isRecord(block.input) ? block.input : {}
      const result = results.get(block.toolUseId)
      const prompt = str(input.prompt).split('\n')[0] ?? ''
      rows.push({
        toolUseId: block.toolUseId,
        name: str(input.subagent_type) || text.defaultName,
        task: str(input.description) || prompt,
        status: result ? (result.isError ? 'failed' : 'done') : working ? 'running' : 'stopped',
        startedAt: times.started.get(block.toolUseId) ?? null,
        finishedAt: times.finished.get(block.toolUseId) ?? null
      })
    }
  }
  return rows
}

export interface AgentsSummary {
  running: number
  done: number
  failed: number
  stopped: number
}

export function summarizeAgents(rows: readonly AgentRow[]): AgentsSummary {
  const s: AgentsSummary = { running: 0, done: 0, failed: 0, stopped: 0 }
  for (const r of rows) s[r.status]++
  return s
}

/** "Agentes · 2 trabalhando · 1 concluído" (only the parts with a count). */
export function agentsHeadline(rows: readonly AgentRow[]): string {
  const s = summarizeAgents(rows)
  const m = t().claude.agents
  const parts = [m.title]
  if (s.running) parts.push(m.running(s.running))
  if (s.done) parts.push(m.done(s.done))
  if (s.failed) parts.push(m.failed(s.failed))
  if (s.stopped) parts.push(m.stopped(s.stopped))
  return parts.join(' · ')
}

/** Elapsed time of the agent in ms, or `null` without a time (resumed history). Running uses `now`. */
export function agentElapsed(row: AgentRow, now: number): number | null {
  if (row.startedAt === null) return null
  const end = row.status === 'running' ? now : (row.finishedAt ?? null)
  return end === null ? null : Math.max(0, end - row.startedAt)
}

/** "8s", "1m 05s", "1h 02m". */
export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  if (total < 60) return `${total}s`
  const m = Math.floor(total / 60)
  if (m < 60) return `${m}m ${String(total % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}
