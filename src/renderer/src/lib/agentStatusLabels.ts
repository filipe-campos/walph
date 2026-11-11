// Accessible labels of the Claude Code status (StatusDot and hints of whoever shows the state as text).
import { t } from '@shared/i18n'

// Getters: the text comes out in the language at read time, not at module load time.
export const STATUS_LABELS: Readonly<Record<'running' | 'done' | 'attention' | 'error', string>> = {
  get running() {
    return t().claude.agentStatus.running
  },
  get done() {
    return t().claude.agentStatus.done
  },
  get attention() {
    return t().claude.agentStatus.attention
  },
  get error() {
    return t().claude.agentStatus.error
  }
}
