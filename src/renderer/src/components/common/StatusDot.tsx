// 8px dot with the Claude Code status (design system): breathes while running and pings on entering done,
// attention or error, CSS only: the animation starts when the class changes. Never color only: `aria-label` says the
// state.

import { STATUS_LABELS } from '../../lib/agentStatusLabels'
import { useT } from '../../i18n'

export type AgentStatus = 'idle' | 'running' | 'done' | 'attention' | 'error'

export function StatusDot({ status }: { status: AgentStatus }) {
  // Only subscribes to the language: the label comes from `STATUS_LABELS`, resolved on read.
  useT()
  // Idle is not announced: the dot enters the accessible name of whatever contains it (e.g. the tab).
  return status === 'idle' ? (
    <span className="status-dot idle" aria-hidden />
  ) : (
    <span className={`status-dot ${status}`} role="img" aria-label={STATUS_LABELS[status]} />
  )
}
