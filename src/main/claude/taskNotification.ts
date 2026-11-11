// The CLI writes to the transcript, as a user message, the notice that a background task finished
// (`<task-notification>…</task-notification>`). It was not typed: it becomes a compact note with status and summary.

import type { ClaudeTaskNotification } from '@shared/types'

const MAX_FIELD_CHARS = 300

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" }

function field(xml: string, tag: string): string {
  const raw = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml)?.[1] ?? ''
  const text = raw
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > MAX_FIELD_CHARS ? `${text.slice(0, MAX_FIELD_CHARS - 1)}…` : text
}

/** `true` if the text is (starts with) a `<task-notification>` block. */
export function isTaskNotification(text: string): boolean {
  return /^\s*<task-notification>/.test(text)
}

/** Status and summary of the block; `null` if the text is not a task notification. `result` (long) is dropped. */
export function parseTaskNotification(text: string): ClaudeTaskNotification | null {
  if (!isTaskNotification(text)) return null
  const body = text.slice(text.indexOf('<task-notification>'))
  return { status: field(body, 'status'), summary: field(body, 'summary') }
}
