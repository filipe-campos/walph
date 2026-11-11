import { useMemo, useState } from 'react'
import type { ClaudeTaskProgress } from '@shared/types'
import { agentTimes } from '../../claudeEvents'
import {
  agentElapsed,
  agentsHeadline,
  formatElapsed,
  summarizeAgents,
  turnAgents,
  type AgentRow,
  type AgentStatus
} from '../../lib/claudeAgents'
import type { ClaudeConversation } from '../../lib/claudeConversation'
import { formatAgentStats } from '../../lib/claudeProgress'
import { useT } from '../../i18n'
import { Icon } from '../common/Icon'
import { useNow } from '../common/useNow'

/**
 * Neon light only on running agents and at most on this many: prompt + 1 agent + the tool in progress = the three
 * allowed `live`.
 */
const MAX_LIVE = 1

/** State always with a shape + accessible text: breathing dot (running), check, error or dash (interrupted). */
function AgentMark({ status }: { status: AgentStatus }) {
  const label = useT().claude.agentsStrip.status[status]
  if (status === 'running')
    return <span className="status-dot running claude-agent-dot" role="img" aria-label={label} />
  if (status === 'stopped') return <span className="claude-agent-dot stopped" role="img" aria-label={label} />
  return (
    <Icon
      name={status === 'done' ? 'check' : 'error'}
      className={`claude-agent-icon ${status}`}
      role="img"
      aria-label={label}
    />
  )
}

function AgentItem({
  row,
  now,
  live,
  progress
}: {
  row: AgentRow
  now: number
  live: boolean
  progress: ClaudeTaskProgress | undefined
}) {
  const t = useT()
  const m = t.claude.agentsStrip
  const elapsed = agentElapsed(row, now)
  // While running, the summary of what the agent is doing now is worth more than the initial description; the
  // description stays in the tooltip.
  const summary = row.status === 'running' ? progress?.summary : null
  const stats = progress ? formatAgentStats(progress) : null
  const tooltip = [`${m.status[row.status]} · ${row.name}`, row.task, summary ? m.now(summary) : null, stats]
    .filter(Boolean)
    .join(' · ')
  return (
    <li
      className={`claude-agent ${row.status}${live ? ' neon-live' : ''}`}
      data-agent-id={row.toolUseId}
      data-agent-status={row.status}
      title={tooltip}
    >
      <AgentMark status={row.status} />
      <span className="claude-agent-name">{row.name}</span>
      <span className="claude-agent-task ellipsis" data-agent-summary={summary ? '' : undefined}>
        {summary || row.task}
      </span>
      {elapsed !== null && <span className="claude-agent-time">{formatElapsed(elapsed)}</span>}
    </li>
  )
}

/**
 * Collapsible strip above the prompt box with the subagents of the current turn. The clock only ticks (1 s) while some
 * agent runs and the conversation is in view; with no agent in the turn the strip does not even exist.
 */
export function AgentsStrip({ conversation, active }: { conversation: ClaudeConversation; active: boolean }) {
  const t = useT()
  const { messages, status, taskProgress } = conversation
  const working = status === 'working'
  // The times are recorded outside React (`agentTimes`) before the message enters the state: they change together with
  // `messages`.
  const agentsText = t.claude.agents
  const rows = useMemo(() => turnAgents(messages, agentTimes, working, agentsText), [messages, working, agentsText])
  const [open, setOpen] = useState(false)
  const running = summarizeAgents(rows).running > 0
  const now = useNow(1000, running && active)

  if (rows.length === 0) return null
  let liveLeft = MAX_LIVE
  return (
    <section className="claude-agents" aria-label={t.claude.agentsStrip.title} data-agents>
      <button className="claude-agents-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="agent" className="claude-agents-icon" />
        <span className="claude-agents-title" data-agents-title>
          {agentsHeadline(rows)}
        </span>
        {/* As in the design system: the arrow sits at the end of the row and rotates on collapse. */}
        <Icon name="chevron" className={`claude-agents-chev${open ? ' open' : ''}`} />
      </button>
      {open && (
        <ul className="claude-agents-list">
          {rows.map((row) => {
            const live = row.status === 'running' && liveLeft > 0
            if (live) liveLeft--
            return (
              <AgentItem key={row.toolUseId} row={row} now={now} live={live} progress={taskProgress[row.toolUseId]} />
            )
          })}
        </ul>
      )}
    </section>
  )
}
