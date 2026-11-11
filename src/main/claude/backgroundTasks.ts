// CLI background tasks (`background_tasks_changed`): a level signal with the whole set on every change.
// Text coming from the CLI/model (untrusted): normalized to a short line before going to the renderer.

import { flattenControl } from '@shared/controlChars'
import { isNonEmptyString } from '@shared/guards'
import type { ClaudeBackgroundTask } from '@shared/types'

const DESCRIPTION_MAX = 120
const AGENT_TYPE_MAX = 60
const TASKS_MAX = 50

function oneLine(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  const clean = flattenControl(value).replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

function kindOf(taskType: unknown): ClaudeBackgroundTask['kind'] {
  if (taskType === 'local_agent') return 'agent'
  if (taskType === 'local_bash') return 'shell'
  return 'other'
}

/**
 * `background_tasks_changed` list → tasks that count as activity. The `ambient` ones (watchers, maintenance tasks)
 * are left out, as the SDK asks for activity indicators. Malformed input becomes an empty list.
 */
export function normalizeBackgroundTasks(raw: unknown): ClaudeBackgroundTask[] {
  if (!Array.isArray(raw)) return []
  const tasks: ClaudeBackgroundTask[] = []
  for (const entry of raw) {
    if (tasks.length >= TASKS_MAX) break
    if (!entry || typeof entry !== 'object') continue
    const t = entry as Record<string, unknown>
    if (t.ambient === true || !isNonEmptyString(t.task_id)) continue
    const kind = kindOf(t.task_type)
    const agentType = kind === 'agent' ? oneLine(t.subagent_type, AGENT_TYPE_MAX) || null : null
    tasks.push({ id: t.task_id, kind, description: oneLine(t.description, DESCRIPTION_MAX), agentType })
  }
  return tasks
}

/** Same set (order and content): avoids re-emitting when only something the panel does not show changed. */
export function sameBackgroundTasks(a: readonly ClaudeBackgroundTask[], b: readonly ClaudeBackgroundTask[]): boolean {
  return (
    a.length === b.length &&
    a.every((t, i) => {
      const o = b[i]
      return (
        o !== undefined &&
        t.id === o.id &&
        t.kind === o.kind &&
        t.description === o.description &&
        t.agentType === o.agentType
      )
    })
  )
}
