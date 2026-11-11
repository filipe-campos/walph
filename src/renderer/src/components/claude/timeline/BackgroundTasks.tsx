import type { ClaudeBackgroundTask } from '@shared/types'
import { useState } from 'react'
import { stopBackgroundTask } from '../../../claudePromptActions'
import { BACKGROUND_KIND_LABELS, backgroundLabel } from '../../../lib/claudeConversation'
import { useT } from '../../../i18n'
import { IconButton } from '../../common/IconButton'
import { ThinkMark } from './ThinkIndicators'

/** Turn ended with subagents/commands still running: Claude comes back by itself when they finish. */
export function BackgroundTasks({
  conversationId,
  tasks
}: {
  conversationId: string
  tasks: readonly ClaudeBackgroundTask[]
}) {
  const label = backgroundLabel(tasks)
  const m = useT().claude.timelineParts
  // Stop request sent: the task only leaves the list when the CLI confirms (next `backgroundTasks`).
  const [stopping, setStopping] = useState<ReadonlySet<string>>(() => new Set())
  const stop = (taskId: string): void => {
    setStopping((s) => new Set(s).add(taskId))
    void stopBackgroundTask(conversationId, taskId).then((ok) => {
      if (ok) return
      setStopping((s) => {
        const next = new Set(s)
        next.delete(taskId)
        return next
      })
    })
  }
  return (
    <div className="claude-background">
      <div className="claude-working" role="status">
        <ThinkMark />
        <span className="claude-think-label">{label}</span>
      </div>
      <ul className="claude-background-list" aria-label={m.backgroundTasks}>
        {tasks.map((t) => {
          const who = t.agentType ?? BACKGROUND_KIND_LABELS[t.kind]
          const busy = stopping.has(t.id)
          return (
            <li key={t.id}>
              <span className="claude-background-who">{who}</span>
              {t.description && <span className="claude-background-what">{t.description}</span>}
              <IconButton
                glyph="stop"
                label={busy ? m.stopping : m.stopTask(who)}
                className="claude-background-stop"
                disabled={busy}
                onClick={() => stop(t.id)}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
