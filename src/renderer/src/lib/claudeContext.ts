import type { ClaudeMessageContext } from '@shared/types'
import { t } from '@shared/i18n'
import { basename } from './path'

/** `file.ts`, `file.ts:L10` or `file.ts:L10-20`. */
export function contextChipLabel(context: ClaudeMessageContext): string {
  const name = basename(context.path)
  const { startLine, endLine } = context
  if (!startLine) return name
  return !endLine || endLine === startLine ? `${name}:L${startLine}` : `${name}:L${startLine}-${endLine}`
}

/** Label of a background task by the state the CLI reported (`completed` and unknown ones = completed). */
export function taskNoticeText(summary: string, status = 'completed'): string {
  const m = t().claude.context
  const lead = /^(failed|error)$/i.test(status.trim())
    ? m.taskFailed
    : /^(killed|stopped|cancel+ed)$/i.test(status.trim())
      ? m.taskStopped
      : m.taskCompleted
  const text = summary.trim()
  return text ? m.taskWithSummary(lead, text) : lead
}

export function isTaskNoticeProblem(status: string): boolean {
  return /^(failed|killed|error|stopped|cancel+ed)$/i.test(status.trim())
}
